'use strict';
const crypto = require('crypto');
/* ------------- Двухфакторная аутентификация: TOTP (RFC 6238), без зависимостей -------------
   Совместима с Google Authenticator, Microsoft Authenticator, Aegis и т.п.: SHA-1, 6 цифр, шаг 30 с. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32dec(str) {
  let bits = 0, val = 0; const out = [];
  for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
function totpOk(secret, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => crypto.timingSafeEqual(Buffer.from(totp(secret, step + d)), Buffer.from(c)));
}
/* Ограничение попыток ввода кода: 5 ошибок за 5 минут на пользователя */
const codeFails = new Map();
const codeReset = (uid) => codeFails.delete(uid);
function codeBlocked(uid) { const f = codeFails.get(uid); return !!f && f.n >= 5 && Date.now() - f.t < 300000; }
function codeFail(uid) { const f = codeFails.get(uid); if (!f || Date.now() - f.t >= 300000) codeFails.set(uid, { n: 1, t: Date.now() }); else f.n++; }


module.exports = { b32enc, b32dec, totp, totpOk, codeBlocked, codeFail, codeReset };
