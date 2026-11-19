'use strict';
/*
 * Админ-панель портала (/admin/, API /api/admin/*) — для пользователей с правом admin (node scripts/access.js role <ID> admin).
 * Пользователи и заявки на регистрацию, допуск (approve/revoke), группы преподавателей, служебные права,
 * сброс пароля (временный пароль показывается один раз), удаление пользователя, копия базы.
 * Любое изменение (допуск, группы, права, сброс пароля, удаление) и копия базы требуют повторного ввода пароля
 * администратора раз в час (confirm): украденного токена сеанса недостаточно, чтобы выдать себе права.
 * Другого администратора панель не меняет (только команды на хосте) — один взломанный админ не захватит остальных.
 *
 * Сброс пароля с хоста без панели: node scripts/access.js reset-password <ID> — команда кладёт поручение
 * в data/portal-provision/, сервер применяет его в течение ~5 секунд (applyProvision) или при запуске.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const access = require('./access');
const { scrubUsers } = require('./cleanup');

const CONFIRM_MS = 60 * 60 * 1000;
const TEMP_PASSWORD_MS = 72 * 60 * 60 * 1000; // временный пароль действует 3 суток — потом только новый сброс
const FILE_ID_RE = /^[\w-]{1,100}$/;
const ID_RE = /^[a-z]{2,5}_\d{1,9}$/;
const PROVISION_DIR = 'portal-provision';
// временный пароль: без похожих символов (0/O, 1/l/I), удобно продиктовать
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
function tempPassword(length = 12) {
  let out = '';
  for (const b of crypto.randomBytes(length)) out += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
  return out;
}

/* Удалить вложения пользователя с диска: ID только из базы, но проверяется формат, ошибка не прерывает запрос */
function removeUploads(dataDir, ids) {
  for (const id of ids) {
    if (!FILE_ID_RE.test(String(id))) { console.error('[admin] пропущено вложение с неверным ID'); continue; }
    try { fs.rmSync(path.join(dataDir, 'uploads', id), { force: true }); } catch (error) { console.error('[admin] вложение не удалено:', id, error.code); }
  }
}

/* Применить новый пароль к пользователю: все сеансы завершаются, при входе портал попросит сменить пароль */
function applyNewPassword(user, hash, { reset2fa, dropUserSessions }) {
  Object.assign(user, { salt: hash.salt, passHash: hash.passHash, passAlgo: hash.passAlgo });
  user.passChangedAt = Date.now();
  user.mustChangePassword = true;
  user.tempPasswordUntil = Date.now() + TEMP_PASSWORD_MS;
  if (reset2fa) delete user.totp;
  dropUserSessions(user.id);
}

function createAdmin(ctx) {
  const { getDB, saveDB, ok, bad, sec, audit, passError, reqToken, dropUserSessions, isOnline, DATA } = ctx;
  const confirmed = new Map(); // токен сеанса (отпечаток) → до какого времени не спрашивать пароль
  const provisionDir = path.join(DATA, PROVISION_DIR);

  const isAdmin = u => !!u && !u.demo && !!access.grantOf(u) && access.permsOf(u).admin;
  const userById = id => (typeof id === 'string' && ID_RE.test(id) ? getDB().users.find(x => x.id === id) : null);
  const view = x => ({
    id: x.id, role: x.role, fio: x.fio, email: x.email, group: x.group || '', createdAt: x.createdAt || null,
    lastSeen: x.lastSeen || null, online: isOnline(x), access: !!access.grantOf(x), demo: !!x.demo,
    groups: x.role === 'teacher' ? access.groupsOf(x) || [] : undefined, perms: access.permsOf(x),
    twoFactor: !!(x.totp && x.totp.enabled), mustChangePassword: !!x.mustChangePassword,
  });
  function isConfirmed(req) {
    const tok = reqToken(req), until = confirmed.get(tok);
    if (until && until > Date.now()) return true;
    confirmed.delete(tok);
    return false;
  }
  function confirm(req) {
    const now = Date.now();
    for (const [tok, until] of confirmed) if (until <= now) confirmed.delete(tok); // старые подтверждения не копятся
    confirmed.set(reqToken(req), now + CONFIRM_MS);
  }
  function needConfirm(res) { res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'Подтвердите пароль администратора', needConfirm: true })); }

  function backupBundle() {
    const readJson = name => { try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return null; } };
    const accessDir = path.join(DATA, 'access'), accessFiles = {};
    try { for (const f of fs.readdirSync(accessDir)) if (f.endsWith('.json')) accessFiles[f] = readJson(path.join('access', f)); } catch { /* каталога ещё нет */ }
    return { createdAt: new Date().toISOString(), db: getDB(), results: readJson('results.json'), examSync: readJson('exam-sync.json'), access: accessFiles };
  }

  async function handle(p, req, res, u, body) {
    if (!p.startsWith('/api/admin/')) return false;
    if (!isAdmin(u)) return bad(res, 403, 'Нет доступа к админ-панели');
    const db = getDB();

    if (p === '/api/admin/users' && req.method === 'GET') {
      const items = db.users.map(view).sort((a, b) => (a.access - b.access) || (b.createdAt || 0) - (a.createdAt || 0));
      const groups = [...new Set(db.users.filter(x => x.role === 'student' && x.group).map(x => x.group))].sort();
      const clubs = (db.clubs || []).map(c => ({ id: c.id, name: c.name }));
      return ok(res, { items, groups, clubs, me: u.id, confirmed: isConfirmed(req) });
    }
    if (req.method !== 'POST') return bad(res, 404, 'Не найдено');

    if (p === '/api/admin/confirm') {
      const pe = await passError(u, String(body.password || ''));
      if (pe) { audit('admin.confirm.fail', u.id, u.id); return bad(res, pe[0], pe[1] || 'Неверный пароль'); }
      confirm(req);
      return ok(res, { confirmed: true });
    }
    if (p === '/api/admin/backup') {
      if (!isConfirmed(req)) return needConfirm(res);
      audit('admin.backup', u.id, u.id);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="ku-portal-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      });
      return res.end(JSON.stringify(backupBundle()));
    }

    if (!isConfirmed(req)) return needConfirm(res);
    const target = userById(body.id);
    if (!target) return bad(res, 404, 'Пользователь не найден');
    const self = target.id === u.id;
    if (!self && access.permsOf(target).admin) return bad(res, 403, 'Другого администратора можно изменить только командой на сервере (scripts/access.js)');

    if (p === '/api/admin/approve') {
      if (target.demo) return bad(res, 400, 'Демо-аккаунт нельзя подтвердить');
      access.approve(target);
      audit('portal.approve', u.id, target.id);
      return ok(res, { user: view(target) });
    }
    if (p === '/api/admin/revoke') {
      if (self) return bad(res, 400, 'Нельзя закрыть доступ самому себе');
      access.revoke(target); dropUserSessions(target.id);
      audit('portal.revoke', u.id, target.id);
      return ok(res, { user: view(target) });
    }
    if (p === '/api/admin/groups') {
      if (target.role !== 'teacher') return bad(res, 400, 'Группы назначаются только преподавателю');
      const list = Array.isArray(body.groups) ? body.groups : String(body.groups || '').split(',');
      if (list.length > 50) return bad(res, 400, 'Слишком много групп');
      access.setGroups(target, access.normalizeGroups(list));
      audit('portal.groups', u.id, target.id);
      return ok(res, { user: view(target) });
    }
    if (p === '/api/admin/perms') {
      const perms = body.perms && typeof body.perms === 'object' ? body.perms : {};
      if (self && perms.admin !== true) return bad(res, 400, 'Нельзя снять право администратора с самого себя');
      if (Array.isArray(perms.clubs) && perms.clubs.length > 100) return bad(res, 400, 'Слишком много клубов');
      access.setPerms(target, perms);
      audit('portal.role', u.id, target.id);
      return ok(res, { user: view(target) });
    }
    if (p === '/api/admin/reset-password') {
      if (self) return bad(res, 400, 'Свой пароль меняйте в Кабинете → Безопасность');
      if (target.demo) return bad(res, 400, 'Демо-аккаунт нельзя изменить');
      const password = tempPassword(), hash = {};
      await sec.setPassword(hash, password);
      if (!getDB().users.includes(target)) return bad(res, 404, 'Пользователь не найден');
      applyNewPassword(target, hash, { reset2fa: body.reset2fa === true, dropUserSessions });
      saveDB();
      audit('portal.password.reset', u.id, target.id);
      return ok(res, { password, user: view(target) });
    }
    if (p === '/api/admin/delete') {
      if (self) return bad(res, 400, 'Нельзя удалить самого себя');
      if (String(body.confirmEmail || '').trim().toLowerCase() !== target.email) return bad(res, 400, 'Для удаления введите email пользователя');
      dropUserSessions(target.id);
      access.forget(target);
      const files = scrubUsers(db, [target.id], { keepTeaching: true });
      saveDB();
      audit('portal.delete', u.id, target.id);
      removeUploads(DATA, files);
      return ok(res);
    }
    return bad(res, 404, 'Не найдено');
  }

  /* Поручения оператора с хоста (scripts/access.js reset-password): новый хеш пароля для пользователя */
  // неприменимое поручение откладывается (*.failed) — оператор видит его, а не теряет молча
  const keep = file => { try { fs.renameSync(file, file + '.failed'); } catch { fs.rmSync(file, { force: true }); } };
  function applyProvision() {
    let names;
    try { names = fs.readdirSync(provisionDir).filter(f => f.endsWith('.json')).sort(); } catch (error) {
      if (error.code !== 'ENOENT') console.error('[admin] поручения не прочитаны:', error.code);
      return;
    }
    let changed = false;
    for (const name of names) {
      const file = path.join(provisionDir, name);
      try {
        const task = JSON.parse(fs.readFileSync(file, 'utf8'));
        const user = getDB().users.find(x => x.id === task.userId);
        if (task.action === 'reset-password' && user && !user.demo && task.salt && task.passHash && task.passAlgo === 'scrypt') {
          applyNewPassword(user, task, { reset2fa: task.reset2fa === true, dropUserSessions });
          audit('portal.password.reset', 'operator', user.id);
          changed = true;
        } else { console.error('[admin] поручение пропущено (неизвестный пользователь или неверные данные):', name); keep(file); continue; }
      } catch (error) { console.error('[admin] поручение не применено:', name, error.message); keep(file); continue; }
      fs.rmSync(file, { force: true });
    }
    if (changed) saveDB();
  }

  return { handle, applyProvision };
}

module.exports = { createAdmin, PROVISION_DIR, tempPassword, removeUploads, TEMP_PASSWORD_MS };
