'use strict';

const { isIP } = require('node:net');
const normalize = ip => String(ip || '').replace(/^::ffff:(?=\d+\.)/i, '');
const trusted = new Set((process.env.KU_TRUSTED_PROXIES || '').split(',').map(s => normalize(s.trim())).filter(Boolean));
for (const ip of trusted) if (!isIP(ip)) throw new Error('KU_TRUSTED_PROXIES должен содержать IP-адреса через запятую');
const fromProxy = req => trusted.has(normalize(req.socket.remoteAddress));

function clientIp(req) {
  const peer = normalize(req.socket.remoteAddress);
  if (!fromProxy(req)) return peer;
  const addr = normalize(String(req.headers['x-forwarded-for'] || '').split(',').pop().trim());
  return isIP(addr) ? addr : peer;
}
const isHttps = req => !!req.socket.encrypted || (fromProxy(req) &&
  String(req.headers['x-forwarded-proto'] || '').split(',').pop().trim() === 'https');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Подсчёт по байтам. После превышения лимита тело дочитывается без накопления в памяти.
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > limit) {
      req.resume();
      return reject(new HttpError(413, 'Слишком большой запрос'));
    }
    let size = 0;
    const chunks = [];
    req.on('error', () => reject(new HttpError(400, 'Запрос прерван')));
    req.on('aborted', () => reject(new HttpError(400, 'Запрос прерван')));
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
      else { chunks.length = 0; reject(new HttpError(413, 'Слишком большой запрос')); }
    });
    req.on('end', () => {
      if (size > limit) return;
      try {
        const value = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        resolve(value);
      } catch { reject(new HttpError(400, 'Ожидается объект JSON')); }
    });
  });
}

module.exports = { clientIp, isHttps, HttpError, readJson };
