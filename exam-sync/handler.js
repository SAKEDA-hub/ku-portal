'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStore, writeJsonAtomic } = require('../server/store');
const { readJson, clientIp, HttpError, sendStatic } = require('../server/http');
const { createLimiter, checkPassword, setPassword, setPasswordSync, PASSWORD_MIN, htmlPolicy } = require('../server/security');
const { collections, view, publicUser, startTest, submitTest, submitWriting, applyChanges, validId } = require('./model');

const empty = () => ({ format: 2, rev: 0, db: Object.fromEntries(collections.map(c => [c, []])) });
function valid(snapshot) {
  return snapshot && Number.isSafeInteger(snapshot.rev) && snapshot.rev >= 0 &&
    snapshot.db && Array.isArray(snapshot.db.users) && collections.every(c =>
      (c === 'timers' && snapshot.db[c] === undefined) || (Array.isArray(snapshot.db[c]) &&
      snapshot.db[c].every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' &&
        entry[1] && typeof entry[1] === 'object')));
}

function createExamSync({ base = '/exam-sync', dataFile, demo = false, seedFile = path.join(__dirname, 'seed.json') }) {
  const directory = path.dirname(dataFile);
  const audit = require('../server/audit').createAudit(directory);
  const index = fs.readFileSync(path.join(__dirname, 'index.html'));
  const policy = htmlPolicy(index);
  const store = createStore({ file: dataFile, backupDir: path.join(directory, 'backups'), space: 0, valid,
    empty: () => demo ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : empty() });
  const snapshot = store.load();
  let rev = snapshot.rev;
  let db = Object.fromEntries(collections.map(c => [c, new Map(snapshot.db[c])]));
  /* Сеансы переживают перезапуск сервера (обновление во время экзамена не выкидывает студентов):
     в exam-sessions.json лежат только sha256 токена и отпечаток хеша пароля, сами токены не сохраняются */
  const sessionsFile = path.join(directory, 'exam-sessions.json');
  const digest = raw => crypto.createHash('sha256').update(raw).digest('hex');
  const fingerprint = passHash => passHash ? digest('pass:' + passHash).slice(0, 32) : '';
  const sessions = new Map(); // sha256(токен) → { uid, hash, gradingUntil, expires }
  try {
    for (const [key, s] of Object.entries(JSON.parse(fs.readFileSync(sessionsFile, 'utf8')))) {
      if (/^[a-f0-9]{64}$/.test(key) && s && typeof s.uid === 'string' && typeof s.hash === 'string' &&
          Number.isFinite(s.expires) && s.expires > Date.now()) sessions.set(key, { uid: s.uid, hash: s.hash, gradingUntil: 0, expires: s.expires });
    }
  } catch (error) { if (error.code !== 'ENOENT') console.error('[exam-sync] сеансы не загружены:', error.message); }
  function saveSessions() {
    try {
      writeJsonAtomic(sessionsFile, Object.fromEntries([...sessions].map(([key, s]) => [key, { uid: s.uid, hash: s.hash, expires: s.expires }])));
    } catch (error) { console.error('[exam-sync] сеансы не сохранены:', error.code || error.message); }
  }
  const streams = new Map();
  const loginLimit = createLimiter({ max: 50, windowMs: 15 * 60_000 });
  const accountLimit = createLimiter({ max: 10, windowMs: 15 * 60_000 });
  const passwordLimit = createLimiter({ max: 8, windowMs: 15 * 60_000 });
  const dummy = {}; setPasswordSync(dummy, crypto.randomUUID());
  const uidByLogin = login => [...db.users.values()].find(u => u.login.toLowerCase() === login);

  function persist(next) {
    const nextRev = rev + 1;
    store.save({ format: 2, rev: nextRev, db: Object.fromEntries(collections.map(c => [c, [...next[c]]])) });
    db = next; rev = nextRev;
    for (const [res, token] of streams) {
      if (!sessionFor(token)) { res.end(); streams.delete(res); }
      else res.write('data: ' + JSON.stringify({ rev }) + '\n\n');
    }
  }

  // Legacy clients received the complete user table. Keep IDs and coursework, require new credentials.
  let migrated = snapshot.format !== 2;
  if (migrated) for (const [id, old] of db.users) {
    const u = publicUser(old);
    if (demo && typeof old.password === 'string') setPasswordSync(u, old.password);
    db.users.set(id, u);
  }
  const provisionDir = path.join(directory, 'exam-provision');
  const processed = [];
  const accountEvents = [];
  if (fs.existsSync(provisionDir)) {
    for (const file of fs.readdirSync(provisionDir).filter(n => /^\d+-[a-f0-9-]{36}\.json$/.test(n)).sort()) {
      const p = JSON.parse(fs.readFileSync(path.join(provisionDir, file), 'utf8'));
      const old = uidByLogin(p.login);
      processed.push(file);
      if (p.action === 'exam-disable') {
        if (old) { db.users.set(old.id, publicUser(old)); migrated = true; accountEvents.push(['exam.disable', old.id]); }
        continue;
      }
      if (old && old.role !== p.role) throw new Error('Роль в поручении exam-reset расходится с ролью в базе');
      if (old?.provisionVersion === p.version) continue;
      const id = old?.id || crypto.randomUUID();
      accountEvents.push(['exam.reset', id]);
      db.users.set(id, { id, login: p.login, name: p.name, role: p.role, passAlgo: 'scrypt',
        passHash: p.passHash, salt: p.salt, provisionVersion: p.version });
      migrated = true;
    }
  }
  if (migrated) persist(db);
  for (const [event, id] of accountEvents) audit(event, 'operator', id);
  for (const file of processed) fs.unlinkSync(path.join(provisionDir, file));

  function sessionFor(token) {
    const s = sessions.get(token);
    if (!s) return null;
    if (s.expires <= Date.now() || fingerprint(db.users.get(s.uid)?.passHash) !== s.hash) {
      sessions.delete(token); saveSessions(); return null;
    }
    return s;
  }
  function invalidate(uid, except) {
    for (const [token, session] of sessions) if (session.uid === uid && token !== except) sessions.delete(token);
    saveSessions();
  }
  setInterval(() => {
    for (const token of sessions.keys()) sessionFor(token);
    for (const [res, token] of streams) {
      if (!sessionFor(token)) { res.end(); streams.delete(res); }
      else res.write(': ping\n\n');
    }
  }, 25_000).unref();

  function current(s) {
    const user = db.users.get(s.uid);
    return { rev, user: publicUser(user), gradingUntil: s.gradingUntil || 0, db: view(db, user) };
  }
  const requireSession = token => {
    const session = sessionFor(token);
    if (!session) throw new HttpError(401, 'Войдите в онлайн-экзамен');
    return session;
  };
  const requirePassword = async (user, password) => {
    const release = passwordLimit.reserve(user.id);
    if (!release) throw new HttpError(429, 'Слишком много попыток');
    if (typeof password !== 'string' || password.length > 256 || !await checkPassword(user, password)) throw new HttpError(403, 'Неверный пароль');
    release();
  };
  const nextDb = () => Object.fromEntries(collections.map(c => [c, new Map(db[c])]));
  const json = (res, value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value)); return true;
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return false;
    const route = url.pathname.slice(base.length);
    res.setHeader('Cache-Control', 'no-store');
    if (!route && req.method === 'GET') {
      res.writeHead(301, { Location: base + '/' + url.search }); res.end(); return true;
    }
    if (['GET', 'HEAD'].includes(req.method) && ['/', '/index.html'].includes(route)) {
      res.setHeader('Content-Security-Policy', policy);
      sendStatic(req, res, 'exam-sync/index.html', index, { 'Content-Type': 'text/html; charset=utf-8' }); return true;
    }
    if (route === '/client.js' && req.method === 'GET') {
      sendStatic(req, res, 'exam-sync/client.js', fs.readFileSync(path.join(__dirname, 'client.js')), { 'Content-Type': 'text/javascript; charset=utf-8' }); return true;
    }
    if (route === '/api/info' && req.method === 'GET') return json(res, { demo });
    if (route === '/api/login' && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const login = String(body.login || '').trim().toLowerCase(), ip = clientIp(req);
      if (loginLimit.blocked(ip) || accountLimit.blocked(login)) throw new HttpError(429, 'Слишком много попыток');
      const releaseIp = loginLimit.reserve(ip), releaseAccount = accountLimit.reserve(login);
      const user = uidByLogin(login);
      const hash = user?.passHash;
      const ok = typeof body.password === 'string' && body.password.length <= 256 && await checkPassword(hash ? user : dummy, body.password);
      if (!ok || !hash || db.users.get(user.id)?.passHash !== hash) throw new HttpError(401, 'Неверный логин или пароль');
      releaseIp(); releaseAccount();
      const token = crypto.randomBytes(32).toString('hex');
      const session = { uid: user.id, hash: fingerprint(hash), gradingUntil: 0, expires: Date.now() + 12 * 3600_000 };
      sessions.set(digest(token), session); saveSessions();
      return json(res, { token, ...current(session) });
    }
    const raw = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
    const token = raw && digest(raw); // дальше сеанс ищется по отпечатку токена
    const s = requireSession(token);
    const user = db.users.get(s.uid);
    if (route === '/api/state' && req.method === 'GET') {
      if (url.searchParams.get('since') === String(rev)) { res.writeHead(304); res.end(); return true; }
      return json(res, current(s));
    }
    if (route === '/api/events' && req.method === 'GET') {
      for (const [old, key] of streams) if (key === token) { old.end(); streams.delete(old); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
      res.write('data: ' + JSON.stringify({ rev }) + '\n\n');
      streams.set(res, token); res.on('close', () => streams.delete(res)); return true;
    }
    if (req.method !== 'POST') throw new HttpError(404, 'Не найдено');
    const limit = { '/api/sync': 5 * 1024 * 1024, '/api/attempt': 1_000_000, '/api/writing': 500_000 };
    const body = await readJson(req, limit[route] || 8192);
    requireSession(token);
    if (route === '/api/logout') { sessions.delete(token); saveSessions(); return json(res, { ok: true }); }
    if (route === '/api/grade-lock') { s.gradingUntil = 0; return json(res, { gradingUntil: 0 }); }
    if (route === '/api/password' || route === '/api/grade-unlock') {
      await requirePassword(user, body.password); requireSession(token);
      if (route === '/api/grade-unlock') {
        if (user.role !== 'teacher') throw new HttpError(403, 'Нет доступа');
        s.gradingUntil = Date.now() + 3600_000; return json(res, { gradingUntil: s.gradingUntil });
      }
      if (typeof body.next !== 'string' || body.next.length < PASSWORD_MIN || body.next.length > 256) throw new HttpError(400, 'Пароль должен содержать от 8 до 256 символов');
      const changed = { ...user }; await setPassword(changed, body.next); requireSession(token);
      const next = nextDb(); next.users.set(user.id, changed); persist(next);
      s.hash = fingerprint(changed.passHash); s.gradingUntil = 0;
      sessions.set(token, s); invalidate(user.id, token);
      audit('exam.password', user.id, user.id);
      return json(res, { ok: true });
    }
    if (route === '/api/student') {
      if (user.role !== 'teacher') throw new HttpError(403, 'Нет доступа');
      const id = body.id || crypto.randomUUID(), old = db.users.get(id);
      if (!validId(id) || (body.id && old?.role !== 'student')) throw new HttpError(400, 'Студент не найден');
      const login = String(body.login || '').trim().toLowerCase(), name = String(body.name || '').trim();
      if (!login || login.length > 100 || !name || name.length > 150) throw new HttpError(400, 'Укажите логин и имя');
      const changed = { ...old, id, role: 'student', login, name };
      if (!old || body.password) {
        if (typeof body.password !== 'string' || body.password.length < PASSWORD_MIN || body.password.length > 256) throw new HttpError(400, 'Пароль должен содержать от 8 до 256 символов');
        await setPassword(changed, body.password);
      }
      requireSession(token);
      if (db.users.get(id) !== old || (uidByLogin(login) && uidByLogin(login).id !== id)) throw new HttpError(409, 'Логин занят или запись изменилась');
      const next = nextDb(); next.users.set(id, changed); persist(next);
      audit('exam.student.save', user.id, id);
      if (body.password) invalidate(id);
      return json(res, current(s));
    }
    const next = nextDb(), now = Date.now();
    let result = {};
    if (route === '/api/student/delete') {
      if (user.role !== 'teacher' || db.users.get(body.id)?.role !== 'student') throw new HttpError(403, 'Нет доступа');
      next.users.delete(body.id);
      for (const col of ['attempts', 'grades', 'queue', 'writings', 'timers']) {
        for (const [key, row] of next[col]) if (row.userId === body.id) next[col].delete(key);
      }
    } else if (route === '/api/start') result = startTest(next, user, body, now);
    else if (route === '/api/attempt') result = submitTest(next, user, body, now);
    else if (route === '/api/writing') result = submitWriting(next, user, body, now);
    else if (route === '/api/sync') {
      if (body.rev !== rev) throw new HttpError(409, 'Данные изменились. Обновите и повторите действие');
      applyChanges(next, user, s, body.changes, now);
    } else throw new HttpError(404, 'Не найдено');
    persist(next);
    if (route === '/api/student/delete') audit('exam.student.delete', user.id, body.id);
    if (route === '/api/sync' && body.changes.grades) audit('exam.grades', user.id, 'grades');
    return json(res, { ...current(s), ...result });
  }
  handle.openRooms = () => [...db.rooms.values()].filter(r => r.open).map(r => ({ id: r.id, title: r.title }));
  return handle;
}

module.exports = { createExamSync };
