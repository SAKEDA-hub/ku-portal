'use strict';

/* Закрытый API учебной базы. Все проверки прав выполняются здесь, на сервере.
 * Вход: свой логин и пароль либо сеанс KU Portal (portal-login). Через портал:
 *   преподаватель — вся база с правом выставлять баллы; менеджер (право school) — вся база только для просмотра;
 *   студент — только свои результаты, после однократной привязки логина учебной базы (portal-link);
 *   остальные (руководитель клуба, сотрудник без права school) — доступа нет.
 * Права портала перепроверяются при каждом запросе: отзыв допуска или роли действует сразу. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { createStore } = require('./store');
const { clientIp, readJson, HttpError } = require('./http');
const { createLimiter } = require('./security');

const scrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TOKEN_TTL = 8 * 60 * 60 * 1000;
const MAX_DOCX = 5 * 1024 * 1024;
const SKILLS = new Set(['тесты', 'письмо', 'говорение']);
const newId = prefix => `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
const safeUser = u => ({ id: u.id, username: u.username, role: u.role, direction: u.direction, year: u.year, group: u.group, number: u.number, portal: !!u.portal });

function createSchool({ dataDir, portal = null }) {
  const file = path.join(dataDir, 'school.json');
  const store = createStore({
    file, backupDir: path.join(dataDir, 'school-backups'),
    empty: () => ({ version: 1, users: [], tests: [], components: [], results: [], scores: [] }),
    valid: d => !!d && d.version === 1 && ['users', 'tests', 'components', 'results', 'scores'].every(k => Array.isArray(d[k])),
  });
  let db = store.load();
  const sessions = new Map();
  // Ограничения входа: пара логин + IP (чужой человек не запирает владельца), общий по IP и по логину — выше
  const LIMIT_MS = 15 * 60 * 1000;
  const loginByUserIp = createLimiter({ max: 5, windowMs: LIMIT_MS });
  const loginByUser = createLimiter({ max: 40, windowMs: LIMIT_MS });
  const loginByIp = createLimiter({ max: 50, windowMs: LIMIT_MS });
  const dummy = { salt: crypto.randomBytes(16).toString('hex'), passHash: '00'.repeat(64) };
  const json = (res, body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
    return true;
  };
  const save = () => store.save(db);
  /* Кем человек из портала входит в учебную базу: преподаватель / просмотр / свой студенческий логин / никем */
  function portalIdentity(access) {
    if (!access) return null;
    if (access.role === 'teacher' || access.role === 'viewer') {
      return { id: 'portal:' + access.id, username: access.fio, role: access.role, portal: true };
    }
    if (access.role === 'student' && access.link) {
      const user = db.users.find(u => u.username === access.link && u.role === 'student');
      return user ? Object.assign({}, user, { portal: true }) : null;
    }
    return null;
  }
  const userOf = req => {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const s = sessions.get(raw);
    if (!s || s.exp < Date.now()) { sessions.delete(raw); return null; }
    const user = s.portalId ? portalIdentity(portal && portal.byId(s.portalId)) : db.users.find(u => u.id === s.uid);
    if (!user) { sessions.delete(raw); return null; }
    s.exp = Date.now() + TOKEN_TTL;
    return user;
  };
  const canViewAll = u => u.role === 'teacher' || u.role === 'viewer';
  const startSession = (res, session, user) => {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Object.assign({ exp: Date.now() + TOKEN_TTL }, session));
    return json(res, { token, user: safeUser(user) });
  };
  const BODY_LIMIT = { '/api/school/test-file': Math.ceil(MAX_DOCX * 1.5) + 100_000 };
  const reject = (res, status, error) => { json(res, { error }, status); return true; };
  const teacher = (u, res) => u.role === 'teacher' ? false : reject(res, 403, 'Только преподаватель может выполнять это действие');
  async function passwordOk(user, password) {
    const target = user && user.passAlgo === 'scrypt' && user.salt && user.passHash ? user : dummy;
    const got = await scrypt(String(password).slice(0, 256), target.salt, 64, SCRYPT);
    const want = Buffer.from(target.passHash, 'hex');
    return target === user && got.length === want.length && crypto.timingSafeEqual(got, want);
  }

  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/school/')) return false;
    let body = {};
    if (req.method === 'POST') {
      try { body = await readJson(req, BODY_LIMIT[p] || 1e6); } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        if (e.status === 413) res.setHeader('Connection', 'close');
        return reject(res, e.status, e.status === 413 ? 'Слишком большой запрос' : 'Некорректный JSON');
      }
    }
    let access = null;
    if (p === '/api/school/portal-login' || p === '/api/school/portal-link') {
      access = portal && portal.fromRequest(req);
      if (!access) return reject(res, 401, 'Войдите в KU Portal');
      if (!access.role) return reject(res, 403, 'Учебная база доступна студентам, преподавателям и администрации. Для вашей роли она закрыта');
      if (access.role !== 'student' && p === '/api/school/portal-link') return reject(res, 400, 'Вход выполняется автоматически');
    }
    if (p === '/api/school/portal-login' && req.method === 'POST') {
      const user = portalIdentity(access);
      if (!user) return json(res, { needLink: true, error: 'Привяжите логин учебной базы' }, 409);
      return startSession(res, { portalId: access.id }, user);
    }
    if ((p === '/api/school/login' || p === '/api/school/portal-link') && req.method === 'POST') {
      const username = String(body.username || '').trim().slice(0, 100);
      const ip = clientIp(req), name = username.toLowerCase(), pair = name + '|' + ip;
      const tooMany = () => reject(res, 429, 'Слишком много попыток. Попробуйте через 15 минут.');
      if (loginByUserIp.blocked(pair) || loginByUser.blocked(name) || loginByIp.blocked(ip)) return tooMany();
      const releasePair = loginByUserIp.reserve(pair), releaseUser = loginByUser.reserve(name), releaseIp = loginByIp.reserve(ip);
      if (!releasePair || !releaseUser || !releaseIp) return tooMany();
      const user = db.users.find(u => u.username === username);
      if (!await passwordOk(user, body.password || '')) return reject(res, 401, 'Неверный логин или пароль');
      releasePair(); releaseUser(); releaseIp();
      // студент, вошедший в портал, привязывает свой логин — дальше вход автоматический
      if (p === '/api/school/portal-link') {
        if (user.role !== 'student') return reject(res, 403, 'Привязать можно только логин студента');
        if (portal.linkTaken(user.username, access.id)) return reject(res, 409, 'Этот логин уже привязан к другому аккаунту портала');
        portal.link(access.id, user.username);
        return startSession(res, { portalId: access.id }, portalIdentity(portal.byId(access.id)));
      }
      return startSession(res, { uid: user.id }, user);
    }
    if (p === '/api/school/health' && req.method === 'GET') return json(res, { ready: db.users.length > 0, users: db.users.length, tests: db.tests.length });
    const u = userOf(req);
    if (!u) return reject(res, 401, 'Войдите в систему');
    if (p === '/api/school/logout' && req.method === 'POST') {
      sessions.delete(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      return json(res, { ok: true });
    }
    if (p === '/api/school/me' && req.method === 'GET') return json(res, { user: safeUser(u) });
    if (p === '/api/school/results' && req.method === 'GET') {
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
    if (p === '/api/school/tests' && req.method === 'POST') {
      if (teacher(u, res)) return true;
      const title = String(body.title || '').trim().slice(0, 160);
      const comps = Array.isArray(body.components) ? body.components : [];
      if (!title || db.tests.some(t => t.title.toLowerCase() === title.toLowerCase())) return reject(res, 400, 'Укажите уникальное название теста');
      if (!comps.length || comps.some(c => !SKILLS.has(c.skill) || !Number.isInteger(c.maxPoints) || c.maxPoints < 1) || comps.reduce((s, c) => s + c.maxPoints, 0) > 100) return reject(res, 400, 'Проверьте навыки и лимиты: сумма должна быть не больше 100');
      const test = { id: newId('test'), title, ownerId: u.id };
      db.tests.push(test);
      for (const c of comps) db.components.push({ id: newId('component'), testId: test.id, skill: c.skill, maxPoints: c.maxPoints, docxFilename: null });
      for (const student of db.users.filter(x => x.role === 'student')) db.results.push({ id: newId('result'), userId: student.id, testId: test.id, totalScore: 0 });
      save(); return json(res, { test }, 201);
    }
    if (p === '/api/school/scores' && req.method === 'POST') {
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
    if (p === '/api/school/test-file' && req.method === 'POST') {
      if (teacher(u, res)) return true;
      const component = db.components.find(c => c.id === body.componentId);
      const filename = path.basename(String(body.filename || '')).slice(0, 180);
      const base64 = String(body.data || '');
      if (!component || !filename.toLowerCase().endsWith('.docx') || !base64) return reject(res, 400, 'Нужен файл Word .docx и существующий тест');
      const content = Buffer.from(base64, 'base64');
      if (content.length > MAX_DOCX || content.length < 4 || content.readUInt32LE(0) !== 0x04034b50) return reject(res, 400, 'Файл не похож на DOCX или превышает 5 МБ');
      const dir = path.join(dataDir, 'school-files'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const name = `${component.id}.docx`; fs.writeFileSync(path.join(dir, name), content, { mode: 0o600 });
      component.docxFilename = filename; save(); return json(res, { ok: true });
    }
    const fileMatch = p.match(/^\/api\/school\/test-file\/([\w-]+)$/);
    if (fileMatch && req.method === 'GET') {
      const component = db.components.find(c => c.id === fileMatch[1]);
      if (!component || !component.docxFilename) return reject(res, 404, 'Файл не найден');
      const f = path.join(dataDir, 'school-files', `${component.id}.docx`);
      try { const bytes = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(component.docxFilename)}`, 'Cache-Control': 'no-store' }); res.end(bytes); return true; }
      catch { return reject(res, 404, 'Файл не найден'); }
    }
    return reject(res, 404, 'Маршрут не найден');
  }
  return { handle };
}

module.exports = { createSchool };
