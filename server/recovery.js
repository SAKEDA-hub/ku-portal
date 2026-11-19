'use strict';
/*
 * Восстановление забытого пароля по почте: POST /api/auth/forgot { email } → письмо со ссылкой
 * <KU_PUBLIC_URL>/#/reset/<код> (действует 1 час, одноразовая); POST /api/auth/reset { token, password } — новый пароль.
 *   В базе хранится только sha256 кода (user.passReset = { hash, exp }); ответ на forgot одинаков для любого email,
 *   чтобы нельзя было узнать, кто зарегистрирован. Письма — только подтверждённым пользователям (с допуском).
 *   Ограничения: 3 письма в час на адрес, 10 запросов в час с IP, 20 попыток ввода кода в час с IP.
 */
const crypto = require('crypto');

const RESET_MS = 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const PUBLIC_URL = String(process.env.KU_PUBLIC_URL || 'https://ku-portal.alwaysdata.net').replace(/\/+$/, '');
const digest = token => crypto.createHash('sha256').update(String(token)).digest('hex');

function createRecovery({ getDB, saveDB, ok, bad, sec, audit, grantOf, clientIp, dropUserSessions, mail = require('./mail') }) {
  const perEmail = sec.createLimiter({ max: 3, windowMs: HOUR });
  const perIp = sec.createLimiter({ max: 10, windowMs: HOUR });
  const resetPerIp = sec.createLimiter({ max: 20, windowMs: HOUR });

  function letter(user, link) {
    return [
      `Здравствуйте, ${user.firstName || user.fio}!`, '',
      'Кто-то (возможно, вы) запросил восстановление пароля в KU Portal.',
      'Чтобы задать новый пароль, откройте ссылку в течение часа:', '', link, '',
      'Если вы не запрашивали восстановление, просто удалите это письмо — пароль останется прежним.',
      'Ссылка работает один раз. Никому её не пересылайте.', '', '— KU Portal, Kozybayev University',
    ].join('\n');
  }

  async function forgot(req, res, body) {
    const ip = clientIp(req) || 'unknown';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 400, 'Некорректный email');
    if (!mail.mailReady()) return bad(res, 503, 'Отправка писем на сервере не настроена. Обратитесь к администратору портала');
    if (perIp.blocked(ip) || perEmail.blocked(email)) return bad(res, 429, 'Слишком много запросов. Попробуйте через час');
    perIp.hit(ip); perEmail.hit(email);
    const user = getDB().users.find(x => x.email === email);
    if (user && !user.demo && grantOf(user)) {
      const token = crypto.randomBytes(24).toString('hex');
      user.passReset = { hash: digest(token), exp: Date.now() + RESET_MS };
      saveDB();
      mail.sendMail({ to: user.email, subject: 'KU Portal: восстановление пароля', text: letter(user, `${PUBLIC_URL}/#/reset/${token}`) })
        .then(() => audit('portal.password.forgot', user.id, user.id))
        .catch(error => console.error('[mail] письмо восстановления не отправлено:', user.id, error.message));
    }
    return ok(res, { sent: true }); // одинаковый ответ — по нему не узнать, есть ли такой email
  }

  async function reset(req, res, body) {
    const ip = clientIp(req) || 'unknown';
    if (resetPerIp.blocked(ip)) return bad(res, 429, 'Слишком много попыток. Попробуйте через час');
    const token = typeof body.token === 'string' ? body.token : '', password = typeof body.password === 'string' ? body.password : '';
    if (password.length < sec.PASSWORD_MIN) return bad(res, 400, 'Пароль — минимум 8 символов');
    if (password.length > 256) return bad(res, 400, 'Некорректные данные');
    const hash = /^[0-9a-f]{48}$/.test(token) ? digest(token) : '';
    const now = Date.now();
    const user = hash && getDB().users.find(x => x.passReset && x.passReset.exp > now && x.passReset.hash.length === hash.length &&
      crypto.timingSafeEqual(Buffer.from(x.passReset.hash), Buffer.from(hash)));
    if (!user || !grantOf(user)) { resetPerIp.hit(ip); return bad(res, 400, 'Ссылка недействительна или устарела. Запросите восстановление ещё раз'); }
    await sec.setPassword(user, password);
    delete user.passReset; delete user.mustChangePassword; delete user.tempPasswordUntil;
    user.passChangedAt = Date.now();
    dropUserSessions(user.id);
    saveDB();
    audit('portal.password.recovered', user.id, user.id);
    return ok(res, { email: user.email });
  }

  return async function handle(p, req, res, body) {
    if (req.method !== 'POST') return false;
    if (p === '/api/auth/forgot') { await forgot(req, res, body); return true; }
    if (p === '/api/auth/reset') { await reset(req, res, body); return true; }
    return false;
  };
}

module.exports = { createRecovery, PUBLIC_URL };
