'use strict';
/*
 * Аккаунт пользователя (вызывается из server.js после проверки входа): настройки конфиденциальности и оповещений,
 * входящие уведомления, смена пароля, двухфакторная защита (TOTP, server/totp.js), активные сеансы,
 * выгрузка своих данных и удаление аккаунта. handle(...) возвращает false, если запрос не относится к аккаунту.
 */
const crypto = require('crypto');
const { b32enc, totpOk, codeBlocked, codeFail, codeReset } = require('./totp');
const { deviceLabel } = require('./http');

function createAccount(ctx) {
  const { getDB, saveDB, ok, bad, sec, audit, passError, reqToken, dropSession, dropUserSessions, pubUser, settingsOf,
    SETTING_DEFAULTS, SETTING_TEXT_MAX, PASS_SHORT, subjName, teacherFio, WEEKDAYS } = ctx;
  return async function handle(p, req, res, u, body) {
    const db = getDB();
    /* ---------- Настройки: конфиденциальность и оповещения ---------- */
    if (p === '/api/settings' && req.method === 'GET') {
      return ok(res, { settings: settingsOf(u), twoFactor: !!(u.totp && u.totp.enabled), passChangedAt: u.passChangedAt || null, demo: !!u.demo });
    }
    if (p === '/api/settings' && req.method === 'POST') {
      u.settings = settingsOf(u);
      for (const [k, def] of Object.entries(SETTING_DEFAULTS)) {
        if (typeof def === 'boolean' && typeof body[k] === 'boolean') u.settings[k] = body[k];
        if (typeof def === 'string' && typeof body[k] === 'string') u.settings[k] = body[k].trim().slice(0, SETTING_TEXT_MAX[k] || 60);
      }
      saveDB();
      return ok(res, { settings: u.settings });
    }

    /* ---------- Уведомления ---------- */
    if (p === '/api/inbox' && req.method === 'GET') {
      const items = (u.inbox || []).slice(0, 30);
      return ok(res, { items, unread: (u.inbox || []).filter((x) => !x.read).length });
    }
    if (p === '/api/inbox/read' && req.method === 'POST') {
      (u.inbox || []).forEach((x) => { x.read = true; });
      saveDB();
      return ok(res);
    }

    /* ---------- Безопасность ---------- */
    if ((p === '/api/auth/password' || p === '/api/2fa/setup' || p === '/api/2fa/enable') && req.method === 'POST' && u.demo) {
      return bad(res, 400, 'Для тестового аккаунта это недоступно — он общий для всех'); // иначе демо-вход сломается у остальных
    }
    if (p === '/api/auth/password' && req.method === 'POST') {
      const cur = String(body.current || ''), nx = String(body.next || '');
      const pe = await passError(u, cur);
      if (pe) return bad(res, pe[0], pe[1] || 'Неверный текущий пароль');
      if (nx.length < sec.PASSWORD_MIN) return bad(res, 400, PASS_SHORT);
      if (nx.length > 256) return bad(res, 400, 'Некорректные данные');
      if (nx === cur) return bad(res, 400, 'Новый пароль совпадает с текущим');
      await sec.setPassword(u, nx);
      u.passChangedAt = Date.now();
      delete u.mustChangePassword; delete u.tempPasswordUntil; delete u.passReset; // временный пароль от администратора заменён своим
      // выходим на всех остальных устройствах
      dropUserSessions(u.id, reqToken(req));
      saveDB();
      audit('portal.password', u.id, u.id);
      return ok(res, { passChangedAt: u.passChangedAt });
    }
    if (p === '/api/2fa/setup' && req.method === 'POST') {
      if (u.totp && u.totp.enabled) return bad(res, 400, 'Двухфакторная аутентификация уже включена');
      const secret = b32enc(crypto.randomBytes(20));
      u.totp = { secret, enabled: false };
      saveDB();
      const label = encodeURIComponent('KU Portal:' + u.email);
      return ok(res, { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=KU%20Portal&digits=6&period=30` });
    }
    if (p === '/api/2fa/enable' && req.method === 'POST') {
      if (!u.totp || !u.totp.secret) return bad(res, 400, 'Сначала получите ключ');
      if (codeBlocked(u.id)) return bad(res, 429, 'Слишком много попыток. Попробуйте через 5 минут');
      if (!totpOk(u.totp.secret, body.code)) { codeFail(u.id); return bad(res, 400, 'Неверный код подтверждения'); }
      u.totp.enabled = true; codeReset(u.id); saveDB();
      audit('portal.2fa.enable', u.id, u.id);
      return ok(res, { twoFactor: true });
    }
    if (p === '/api/2fa/disable' && req.method === 'POST') {
      const pe = await passError(u, String(body.password || ''));
      if (pe) return bad(res, pe[0], pe[1] || 'Неверный пароль');
      delete u.totp; saveDB();
      audit('portal.2fa.disable', u.id, u.id);
      return ok(res, { twoFactor: false });
    }
    if (p === '/api/sessions' && req.method === 'GET') {
      const me = reqToken(req);
      const items = Object.entries(db.sessMeta || {}).filter(([, m]) => m.uid === u.id)
        .map(([tok, m]) => ({ sid: m.sid, current: tok === me, created: m.created, lastSeen: m.lastSeen, device: deviceLabel(m.ua), ip: m.ip }))
        .sort((a, b) => (b.current - a.current) || (b.lastSeen - a.lastSeen));
      // сеансы, созданные до появления метаданных
      const legacy = Object.entries(db.sessions || {}).filter(([tok, uid]) => uid === u.id && !(db.sessMeta || {})[tok]).length;
      return ok(res, { items, legacy });
    }
    if (p === '/api/sessions/revoke' && req.method === 'POST') {
      const me = reqToken(req);
      let n = 0;
      for (const [tok, uid] of Object.entries(db.sessions || {})) {
        if (uid !== u.id || tok === me) continue;
        const m = (db.sessMeta || {})[tok];
        if (body.all || (m && m.sid === body.sid)) { dropSession(tok); n++; }
      }
      return ok(res, { revoked: n });
    }

    /* ---------- Мои данные и удаление аккаунта ---------- */
    if (p === '/api/export' && req.method === 'GET') {
      const data = {
        exportedAt: new Date().toISOString(),
        profile: Object.assign(pubUser(u), { createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null }),
        settings: settingsOf(u), twoFactor: !!(u.totp && u.totp.enabled),
        grades: u.role === 'student'
          ? db.grades.filter((g) => g.studentId === u.id).map((g) => ({ subject: subjName(g.subjectId), teacher: teacherFio(g.teacherId), score: g.score, date: g.date }))
          : db.grades.filter((g) => g.teacherId === u.id).map((g) => ({ student: teacherFio(g.studentId), subject: subjName(g.subjectId), score: g.score, date: g.date })),
        schedule: (u.role === 'student' ? db.schedule.filter((x) => x.group === u.group) : db.schedule.filter((x) => x.teacherId === u.id))
          .map((r) => ({ day: WEEKDAYS[r.day], start: r.start, end: r.end, subject: subjName(r.subjectId), type: r.type, room: r.room, group: r.group })),
        subjects: u.role === 'teacher' ? db.subjects.filter((x) => x.teacherId === u.id).map((x) => x.name) : undefined,
        sessions: Object.values(db.sessMeta || {}).filter((m) => m.uid === u.id).map((m) => ({ device: deviceLabel(m.ua), ip: m.ip, created: new Date(m.created).toISOString(), lastSeen: new Date(m.lastSeen).toISOString() })),
        notifications: u.inbox || [],
      };
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="ku-portal-${u.id}.json"`,
        'Cache-Control': 'no-store',
      });
      return res.end(JSON.stringify(data, null, 2));
    }
    if (p === '/api/account/delete' && req.method === 'POST') {
      if (u.demo) return bad(res, 400, 'Тестовый аккаунт удалить нельзя');
      const pe = await passError(u, String(body.password || ''));
      if (pe) return bad(res, pe[0], pe[1] || 'Неверный пароль');
      for (const [tok, uid] of Object.entries(db.sessions || {})) if (uid === u.id) dropSession(tok);
      db.users = db.users.filter((x) => x.id !== u.id);
      if (u.role === 'student') db.grades = db.grades.filter((g) => g.studentId !== u.id);
      else db.schedule = db.schedule.filter((x) => x.teacherId !== u.id); // оценки студентов сохраняются, расписание преподавателя удаляется
      saveDB();
      return ok(res);
    }
    return false;
  };
}

module.exports = { createAccount };
