'use strict';

/* Закрытый API учебной базы результатов. Все проверки прав выполняются здесь, на сервере.
 * Доступ — только преподавателям и администрации:
 *   вход через сеанс KU Portal (portal-login): преподаватель или сотрудник с правом results — вся база с правкой;
 *   собственный вход по паролю отключён; права портала перепроверяются при каждом запросе.
 * Права портала перепроверяются при каждом запросе: отзыв допуска или роли действует сразу. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStore, writeJsonAtomic } = require('./store');
const { clientIp, readJson, HttpError } = require('./http');
const TOKEN_TTL = 8 * 60 * 60 * 1000;
const MAX_DOCX = 5 * 1024 * 1024;
const SKILLS = new Set(['тесты', 'письмо', 'говорение']);
const newId = prefix => `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
const safeUser = u => ({ id: u.id, username: u.username, role: u.role, direction: u.direction, year: u.year, group: u.group, number: u.number, portal: !!u.portal });
function writePrivateFileAtomic(file, bytes) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}

/* Прежние имена (school.json, school-backups, school-files и ID с префиксом school_) переводятся один раз при запуске */
function migrateLegacy(dataDir) {
  const legacy = name => path.join(dataDir, name), next = name => path.join(dataDir, name.replace('school', 'results'));
  for (const name of ['school-backups', 'school-files', 'school.json']) {
    if (fs.existsSync(legacy(name)) && !fs.existsSync(next(name))) fs.renameSync(legacy(name), next(name));
  }
  const file = next('school.json'), files = next('school-files');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('"school_')) return;
  if (fs.existsSync(files)) {
    for (const n of fs.readdirSync(files)) if (n.startsWith('school_')) fs.renameSync(path.join(files, n), path.join(files, n.replace(/^school_/, 'results_')));
  }
  writeJsonAtomic(file, JSON.parse(text.replace(/"school_/g, '"results_')), 1);
  console.log('[results] учебная база переведена на новые имена');
}

function createResults({ dataDir, portal = null }) {
  migrateLegacy(dataDir);
  const file = path.join(dataDir, 'results.json');
  const store = createStore({
    file, backupDir: path.join(dataDir, 'results-backups'),
    empty: () => ({ version: 1, users: [], tests: [], components: [], results: [], scores: [] }),
    valid: d => !!d && d.version === 1 && ['users', 'tests', 'components', 'results', 'scores'].every(k => Array.isArray(d[k])),
  });
  let db = store.load();
  let credentialsRemoved = false;
  for (const user of db.users) {
    for (const field of ['passHash', 'salt', 'passAlgo', 'password', 'passwordHash', 'tempPasswordUntil']) {
      if (Object.hasOwn(user, field)) { delete user[field]; credentialsRemoved = true; }
    }
  }
  if (credentialsRemoved) {
    store.replace(db);
    store.clearBackups();
    store.save(db);
  }
  const sessions = new Map();
  const json = (res, body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
    return true;
  };
  const save = () => {
    try { store.save(db); } catch (error) {
      // Keep a failed write from leaving uncommitted changes visible in this process.
      db = store.load();
      throw error;
    }
  };
  /* Кем человек из портала входит в базу: только преподаватель или сотрудник с правом results. */
  function portalIdentity(access) {
    if (!access) return null;
    const allowed = (access.role === 'teacher' || access.role === 'staff') && access.perms?.results;
    if (!allowed) return null;
    return { id: 'portal:' + access.id, username: access.fio, role: access.role === 'staff' ? 'admin' : 'teacher', portal: true };
  }
  const userOf = req => {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const s = sessions.get(raw);
    if (!s || s.exp < Date.now()) { sessions.delete(raw); return null; }
    const access = s.portalId ? portal && portal.byId(s.portalId) : null;
    const user = s.portalId ? portalIdentity(access) : db.users.find(u => u.id === s.uid && u.role === 'teacher');
    if (s.portalId && Number(access?.authVersion || 0) !== Number(s.authVersion || 0)) {
      sessions.delete(raw); return null;
    }
    if (!user) { sessions.delete(raw); return null; }
    s.exp = Date.now() + TOKEN_TTL;
    return user;
  };
  const canViewAll = u => u.role === 'teacher' || u.role === 'admin';
  const startSession = (res, session, user) => {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Object.assign({ exp: Date.now() + TOKEN_TTL }, session));
    return json(res, { token, user: safeUser(user) });
  };
  const BODY_LIMIT = { '/api/results/test-file': Math.ceil(MAX_DOCX * 1.5) + 100_000 };
  const reject = (res, status, error) => { json(res, { error }, status); return true; };
  const teacher = (u, res) => canViewAll(u) ? false : reject(res, 403, 'Только преподаватель или администратор может выполнять это действие');
  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/results/')) return false;
    let body = {};
    if (req.method === 'POST') {
      try { body = await readJson(req, BODY_LIMIT[p] || 1e6); } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        if (e.status === 413) res.setHeader('Connection', 'close');
        return reject(res, e.status, e.status === 413 ? 'Слишком большой запрос' : 'Некорректный JSON');
      }
    }
    if (p === '/api/results/portal-login' && req.method === 'POST') {
      const access = portal && portal.fromRequest(req);
      if (!access) return reject(res, 401, 'Войдите в KU Portal');
      const user = portalIdentity(access);
      if (!user) return reject(res, 403, 'Учебная база результатов доступна только преподавателям и администрации');
      return startSession(res, { portalId: access.id, authVersion: Number(access.authVersion || 0) }, user);
    }
    if (p === '/api/results/login' && req.method === 'POST') return reject(res, 403, 'Войдите через KU Portal');
    if (p === '/api/results/health' && req.method === 'GET') return json(res, { ready: db.users.length > 0 });
    const u = userOf(req);
    if (!u) return reject(res, 401, 'Войдите в систему');
    if (p === '/api/results/logout' && req.method === 'POST') {
      sessions.delete(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      return json(res, { ok: true });
    }
    if (p === '/api/results/me' && req.method === 'GET') return json(res, { user: safeUser(u) });
    if (p === '/api/results/results' && req.method === 'GET') {
      const visibleUsers = canViewAll(u) ? db.users : db.users.filter(x => x.id === u.id);
      const ids = new Set(visibleUsers.map(x => x.id));
      const results = db.results.filter(r => ids.has(r.userId)).map(r => ({
        ...r, test: db.tests.find(t => t.id === r.testId), user: visibleUsers.find(x => x.id === r.userId),
        scores: db.components.filter(c => c.testId === r.testId).map(component => ({
          resultId: r.id, componentId: component.id,
          points: db.scores.find(s => s.resultId === r.id && s.componentId === component.id)?.points ?? 0,
          component,
        })),
      }));
      return json(res, { users: visibleUsers.map(safeUser), tests: db.tests, components: db.components, results });
    }
    if (p === '/api/results/tests' && req.method === 'POST') {
      if (teacher(u, res)) return true;
      const title = String(body.title || '').trim().slice(0, 160);
      const comps = Array.isArray(body.components) ? body.components : [];
      if (!title || db.tests.some(t => t.title.toLowerCase() === title.toLowerCase())) return reject(res, 400, 'Укажите уникальное название теста');
      if (!comps.length || new Set(comps.map(c => c && c.skill)).size !== comps.length ||
          comps.some(c => !c || !SKILLS.has(c.skill) || !Number.isInteger(c.maxPoints) || c.maxPoints < 1 || c.maxPoints > 100) ||
          comps.reduce((s, c) => s + c.maxPoints, 0) > 100) return reject(res, 400, 'Проверьте навыки и лимиты: сумма должна быть не больше 100');
      const test = { id: newId('test'), title, ownerId: u.id };
      db.tests.push(test);
      for (const c of comps) db.components.push({ id: newId('component'), testId: test.id, skill: c.skill, maxPoints: c.maxPoints, docxFilename: null });
      for (const student of db.users.filter(x => x.role === 'student')) db.results.push({ id: newId('result'), userId: student.id, testId: test.id, totalScore: 0 });
      save(); return json(res, { test }, 201);
    }
    if (p === '/api/results/scores' && req.method === 'POST') {
      if (teacher(u, res)) return true;
      const result = db.results.find(r => r.id === body.resultId);
      const component = db.components.find(c => c.id === body.componentId && result && c.testId === result.testId);
      const points = Number(body.points);
      if (!result || !component || !Number.isInteger(points) || points < 0 || points > component.maxPoints) return reject(res, 400, 'Некорректный результат или балл выше максимума');
      let score = db.scores.find(s => s.resultId === result.id && s.componentId === component.id);
      if (score) score.points = points; else { score = { resultId: result.id, componentId: component.id, points }; db.scores.push(score); }
      result.totalScore = db.scores.filter(s => s.resultId === result.id).reduce((sum, s) => sum + s.points, 0);
      save(); return json(res, { result });
    }
    if (p === '/api/results/test-file' && req.method === 'POST') {
      if (teacher(u, res)) return true;
      const component = db.components.find(c => c.id === body.componentId);
      const filename = path.basename(String(body.filename || '')).slice(0, 180);
      const base64 = String(body.data || '');
      if (!component || !filename.toLowerCase().endsWith('.docx') || !base64) return reject(res, 400, 'Нужен файл Word .docx и существующий тест');
      const content = Buffer.from(base64, 'base64');
      if (content.length > MAX_DOCX || content.length < 4 || content.readUInt32LE(0) !== 0x04034b50) return reject(res, 400, 'Файл не похож на DOCX или превышает 5 МБ');
      const dir = path.join(dataDir, 'results-files'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const name = `${component.id}.docx`, target = path.join(dir, name);
      const previous = fs.existsSync(target) ? fs.readFileSync(target) : null;
      writePrivateFileAtomic(target, content);
      component.docxFilename = filename;
      try { save(); }
      catch (error) {
        if (previous) writePrivateFileAtomic(target, previous);
        else fs.rmSync(target, { force: true });
        throw error;
      }
      return json(res, { ok: true });
    }
    const fileMatch = p.match(/^\/api\/results\/test-file\/([\w-]+)$/);
    if (fileMatch && req.method === 'GET') {
      const component = db.components.find(c => c.id === fileMatch[1]);
      if (!component || !component.docxFilename) return reject(res, 404, 'Файл не найден');
      const f = path.join(dataDir, 'results-files', `${component.id}.docx`);
      try { const bytes = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(component.docxFilename)}`, 'Cache-Control': 'no-store' }); res.end(bytes); return true; }
      catch { return reject(res, 404, 'Файл не найден'); }
    }
    return reject(res, 404, 'Маршрут не найден');
  }
  return { handle };
}

module.exports = { createResults };
