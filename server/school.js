'use strict';

/* Закрытый API учебной базы. Все проверки прав выполняются здесь, на сервере. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStore } = require('./store');

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TOKEN_TTL = 8 * 60 * 60 * 1000;
const MAX_DOCX = 5 * 1024 * 1024;
const SKILLS = new Set(['тесты', 'письмо', 'говорение']);
const newId = prefix => `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
const safeUser = u => ({ id: u.id, username: u.username, role: u.role, direction: u.direction, year: u.year, group: u.group, number: u.number });

function createSchool({ dataDir }) {
  const file = path.join(dataDir, 'school.json');
  const store = createStore({
    file, backupDir: path.join(dataDir, 'school-backups'),
    empty: () => ({ version: 1, users: [], tests: [], components: [], results: [], scores: [] }),
    valid: d => !!d && d.version === 1 && ['users', 'tests', 'components', 'results', 'scores'].every(k => Array.isArray(d[k])),
  });
  let db = store.load();
  const sessions = new Map();
  const loginTries = new Map();
  const json = (res, body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
    return true;
  };
  const save = () => store.save(db);
  const userOf = req => {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const s = sessions.get(raw);
    if (!s || s.exp < Date.now()) { sessions.delete(raw); return null; }
    s.exp = Date.now() + TOKEN_TTL;
    return db.users.find(u => u.id === s.uid) || null;
  };
  const readBody = async req => {
    let s = '';
    for await (const chunk of req) {
      s += chunk;
      if (s.length > MAX_DOCX * 1.5 + 100_000) throw new Error('too_large');
    }
    try { return s ? JSON.parse(s) : {}; } catch { throw new Error('bad_json'); }
  };
  const reject = (res, status, error) => { json(res, { error }, status); return true; };
  const teacher = (u, res) => u.role === 'teacher' ? false : reject(res, 403, 'Только преподаватель может выполнять это действие');
  function failKey(req, username) { return `${req.socket.remoteAddress || ''}|${String(username).toLowerCase().slice(0, 100)}`; }

  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/school/')) return false;
    let body = {};
    if (req.method === 'POST') {
      try { body = await readBody(req); } catch (e) { return reject(res, e.message === 'too_large' ? 413 : 400, e.message === 'too_large' ? 'Слишком большой запрос' : 'Некорректный JSON'); }
    }
    if (p === '/api/school/login' && req.method === 'POST') {
      const username = String(body.username || '').trim();
      const key = failKey(req, username), attempt = loginTries.get(key) || { n: 0, until: 0 };
      if (attempt.until > Date.now()) return reject(res, 429, 'Слишком много попыток. Попробуйте через 15 минут.');
      const user = db.users.find(u => u.username === username);
      let ok = false;
      if (user && user.passAlgo === 'scrypt' && user.salt && user.passHash) {
        const got = crypto.scryptSync(String(body.password || ''), user.salt, 64, SCRYPT).toString('hex');
        const a = Buffer.from(got, 'hex'), b = Buffer.from(user.passHash, 'hex');
        ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      }
      if (!ok) {
        attempt.n++;
        if (attempt.n >= 5) { attempt.n = 0; attempt.until = Date.now() + 15 * 60 * 1000; }
        loginTries.set(key, attempt);
        if (loginTries.size > 5000) loginTries.delete(loginTries.keys().next().value);
        return reject(res, 401, 'Неверный логин или пароль');
      }
      loginTries.delete(key);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { uid: user.id, exp: Date.now() + TOKEN_TTL });
      return json(res, { token, user: safeUser(user) });
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
      const visibleUsers = u.role === 'teacher' ? db.users : db.users.filter(x => x.id === u.id);
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
