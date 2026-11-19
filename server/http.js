'use strict';

const { isIP, BlockList } = require('node:net');
const zlib = require('node:zlib');
const normalize = ip => String(ip || '').replace(/^::ffff:(?=\d+\.)/i, '');

/* KU_TRUSTED_PROXIES: IP-адреса или диапазоны CIDR (10.0.0.0/8, fd00::/8) через запятую */
function parseTrusted(value) {
  const list = new BlockList();
  for (const raw of String(value || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [addr, bits, extra] = raw.split('/');
    const ip = normalize(addr), family = isIP(ip), max = family === 6 ? 128 : 32;
    if (!family || extra !== undefined || (bits !== undefined && !(/^\d+$/.test(bits) && Number(bits) <= max))) {
      throw new Error('KU_TRUSTED_PROXIES должен содержать IP-адреса или диапазоны CIDR через запятую');
    }
    const type = family === 6 ? 'ipv6' : 'ipv4';
    if (bits === undefined) list.addAddress(ip, type); else list.addSubnet(ip, Number(bits), type);
  }
  return (ip) => { const family = isIP(ip); return !!family && list.check(ip, family === 6 ? 'ipv6' : 'ipv4'); };
}
const trusted = parseTrusted(process.env.KU_TRUSTED_PROXIES);
const fromProxy = req => trusted(normalize(req.socket.remoteAddress));

function clientIp(req) {
  const peer = normalize(req.socket.remoteAddress);
  if (!fromProxy(req)) return peer;
  // alwaysdata передаёт адрес посетителя в X-Real-IP, другие прокси — в X-Forwarded-For (берётся крайний справа)
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
  const addr = normalize(forwarded || String(req.headers['x-real-ip'] || '').trim());
  return isIP(addr) ? addr : peer;
}
/* Диагностика для настройки KU_TRUSTED_PROXIES: один раз за запуск пишет в журнал адрес соединения
   (это адрес прокси) и имена полученных заголовков — без значений, адреса посетителей в журнал не попадают. */
let proxyReported = false;
function reportProxy(req, log = console.log) {
  if (proxyReported) return;
  proxyReported = true;
  log('[proxy] ' + JSON.stringify({ peer: normalize(req.socket.remoteAddress), trusted: fromProxy(req),
    forwardedProto: String(req.headers['x-forwarded-proto'] || '').slice(0, 20) || null,
    headers: Object.keys(req.headers).sort().slice(0, 60) }));
}
const isHttps = req => !!req.socket.encrypted || (fromProxy(req) &&
  String(req.headers['x-forwarded-proto'] || '').split(',').pop().trim() === 'https');

/* Ответ со статикой: текстовые файлы больше 1 КБ сжимаются gzip, если браузер это принимает.
   Сжатая копия кешируется, пока содержимое файла не изменилось. */
const GZIP_MIN = 1024;
const gzipCache = new Map(); // ключ (путь) → { src, gz }
function sendStatic(req, res, key, buf, headers) {
  const text = /^(text\/|application\/json|image\/svg)/.test(headers['Content-Type'] || '');
  const accepts = String(req.headers['accept-encoding'] || '').split(',').some(part => {
    const [name, ...params] = part.trim().toLowerCase().split(';').map(s => s.trim());
    const q = params.find(x => x.startsWith('q='));
    return (name === 'gzip' || name === '*') && !(q && Number(q.slice(2)) === 0);
  });
  const out = Object.assign({}, headers);
  let body = buf;
  if (text) out.Vary = 'Accept-Encoding';
  if (text && accepts && buf.length >= GZIP_MIN) {
    let hit = gzipCache.get(key);
    if (!hit || !hit.src.equals(buf)) { hit = { src: buf, gz: zlib.gzipSync(buf) }; gzipCache.set(key, hit); }
    body = hit.gz; out['Content-Encoding'] = 'gzip';
  }
  out['Content-Length'] = body.length;
  res.writeHead(200, out);
  res.end(req.method === 'HEAD' ? undefined : body);
}

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

/* Определение устройства по User-Agent — только для подписи в списке сеансов */
function deviceLabel(ua) {
  ua = String(ua || '');
  const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Yandex' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(', ') || (ua ? ua.slice(0, 40) : '');
}

module.exports = { deviceLabel, clientIp, isHttps, HttpError, readJson, parseTrusted, sendStatic, reportProxy };
