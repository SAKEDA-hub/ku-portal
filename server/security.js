'use strict';
/* Защита портала без внешних зависимостей:
 *   пароли — scrypt (медленный хеш, перебор дорогой); старые аккаунты (sha256 + соль) проверяются как раньше
 *     и при входе переводятся на scrypt (needsRehash);
 *   ограничение попыток — createLimiter: N неудач за окно по ключу (email, IP, id пользователя);
 *   HTTP-заголовки — securityHeaders: запрет встраивания на чужие сайты, nosniff, Referrer-Policy, HSTS по https.
 */
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const PASSWORD_MIN = 8; // для новых паролей; старые короткие продолжают работать
const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const legacyHash = (pw, salt) => crypto.createHash('sha256').update(salt + pw).digest('hex');
const scryptHex = async (pw, salt) => (await scrypt(String(pw), salt, SCRYPT_KEYLEN, SCRYPT_OPTS)).toString('hex');
function sameHex(a, b) {
  const x = Buffer.from(String(a), 'hex'), y = Buffer.from(String(b), 'hex');
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Новый пароль: соль и хеш записываются в объект пользователя (поля salt, passHash, passAlgo) —
   все три сразу после вычисления, чтобы сохранение базы во время await не записало полуобновлённый аккаунт */
async function setPassword(user, pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passHash = await scryptHex(pw, salt);
  Object.assign(user, { salt, passHash, passAlgo: 'scrypt' });
}
/* То же синхронно — только для старта сервера (бета-аккаунты, server/demo.js) */
function setPasswordSync(user, pw) {
  user.salt = crypto.randomBytes(16).toString('hex');
  user.passHash = crypto.scryptSync(String(pw), user.salt, SCRYPT_KEYLEN, SCRYPT_OPTS).toString('hex');
  user.passAlgo = 'scrypt';
}
async function checkPassword(user, pw) {
  if (!user || !user.salt || !user.passHash) return false;
  const got = user.passAlgo === 'scrypt' ? await scryptHex(pw, user.salt) : legacyHash(String(pw), user.salt);
  return sameHex(got, user.passHash);
}
const needsRehash = (user) => !!user && user.passAlgo !== 'scrypt';

/* Счётчик неудач: blocked(key) — исчерпан лимит в текущем окне; hit — неудача; reset — успех */
const LIMITER_KEYS_MAX = 10_000;
const KEY_MAX = 300; // ключ (email, IP) обрезается — длинные строки из запроса не раздувают память
function createLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map(); // key → { n, t }; порядок вставки — от старых к новым
  const live = (key) => { const h = hits.get(key); if (h && now() - h.t >= windowMs) { hits.delete(key); return null; } return h; };
  return {
    blocked: (key) => { const h = live(String(key).slice(0, KEY_MAX)); return !!h && h.n >= max; },
    hit(key) {
      key = String(key).slice(0, KEY_MAX);
      const h = live(key);
      if (h) { h.n++; return; }
      hits.set(key, { n: 1, t: now() });
      if (hits.size > LIMITER_KEYS_MAX) hits.delete(hits.keys().next().value); // вытесняем самый старый
    },
    reset: (key) => { hits.delete(String(key).slice(0, KEY_MAX)); },
  };
}

function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}

module.exports = { PASSWORD_MIN, setPassword, setPasswordSync, checkPassword, needsRehash, createLimiter, securityHeaders };
