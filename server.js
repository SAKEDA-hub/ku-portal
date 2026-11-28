/*
 * KU Portal — сервер без внешних зависимостей (Node.js >= 18). Точка входа (alwaysdata запускает node server.js).
 * Здесь: база (data/db.json), регистрация, вход и сеансы, общие справочники, статика, маршрутизация запросов.
 * Модули server/: account.js (настройки, 2FA, сеансы, удаление), study.js (расписание, оценки, рейтинг), admin.js (админ-панель),
 * recovery.js + mail.js (восстановление пароля), polls.js (голосование), messages.js (KU Message + файлы), clubs.js, dorm.js,
 * cleanup.js, demo.js (бета-аккаунты), ai.js (помощник для сайта университета).
 * Отдельные приложения: exam-sync/ (/exam-sync/), ku-message/ (/ku-message/), results/ (/results/), admin/ (/admin/).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || 3000;
// alwaysdata требует слушать конкретный IP из настроек сайта (переменные IP / ALWAYSDATA_HTTPD_IP); без них — все интерфейсы, как раньше
const HOST = process.env.IP || process.env.ALWAYSDATA_HTTPD_IP || (process.env.DEMO === '1' ? '127.0.0.1' : undefined);
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const MESSAGE_DIR = path.join(ROOT, 'ku-message'); // KU Message — мессенджер университета (/ku-message/)
const RESULTS_DIR = path.join(ROOT, 'results'); // закрытый кабинет результатов учебной базы (/results/)
const ADMIN_DIR = path.join(ROOT, 'admin'); // админ-панель (/admin/, server/admin.js)
const { dataDir: DATA, grantOf, groupsOf, setGroups, permsOf, forget, demo: DEMO_ON } = require('./server/access');
const { clientIp, readJson, HttpError, sendStatic, deviceLabel } = require('./server/http');
const { totpOk, codeBlocked, codeFail, codeReset } = require('./server/totp');
const audit = require('./server/audit').createAudit(DATA);
const DB_FILE = path.join(DATA, 'db.json');
const { createStore } = require('./server/store');
const sec = require('./server/security');

fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });

/* Версия кода, с которой запущен сервер (для проверки, что автообновление перезапустило сервер): /api/version.
   Читается из .git один раз при старте; git на машине сайта не нужен. */
function readCommit() {
  try {
    const release = path.join(ROOT, '.release-commit');
    if (fs.existsSync(release)) {
      const sha = fs.readFileSync(release, 'utf8').trim();
      if (/^[a-f0-9]{40,64}$/.test(sha)) return sha.slice(0, 7);
    }
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head.slice(0, 7);
    const ref = head.slice(5);
    const loose = path.join(ROOT, '.git', ref);
    if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim().slice(0, 7);
    const packed = fs.readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(' ' + ref));
    return line ? line.slice(0, 7) : null;
  } catch { return null; }
}
const VERSION = { commit: readCommit(), startedAt: new Date().toISOString() };

/* ---------------------------------- DB ---------------------------------- */

/* data/db.json — атомарная запись, ежедневные копии в data/backups/ (14 дней), восстановление из копии
   вместо пустой базы, если файл испорчен (server/store.js) */
let db = null;
const store = createStore({
  file: DB_FILE, backupDir: path.join(DATA, 'backups'),
  empty: () => ({ users: [], subjects: [], schedule: [], grades: [], seq: {} }),
  valid: d => !!d && ['users', 'grades', 'schedule', 'subjects'].every(k => Array.isArray(d[k])),
});
function loadDB() { db = store.load(); }
function saveDB() {
  try { store.save(db); } catch (error) {
    console.error('[store] Сбой записи портала, процесс будет перезапущен:', error.code || error.message);
    process.nextTick(() => process.exit(1));
    throw error;
  }
}
/* Группы преподавателя — только назначенные оператором. При первом запуске после обновления
   текущие группы из расписания переносятся в назначения, дальше новые добавляет только оператор. */
function migrateTeacherGroups() {
  for (const t of db.users.filter(x => x.role === 'teacher' && groupsOf(x) === null)) {
    try { setGroups(t, db.schedule.filter(r => r.teacherId === t.id).map(r => r.group)); }
    catch (error) { console.error('[access] группы не перенесены:', t.id, error.code || error.message); }
  }
}
const GROUPS = require('./server/groups'); // справочник групп: ИСУ и БТ, наборы 2023–2026, по 3 группы
const teacherHasGroup = (u, group) => (groupsOf(u) || []).includes(String(group).trim());
const teacherGroups = (u) => [...new Set(groupsOf(u) || [])].sort(); // группы, закреплённые администратором
function nid(prefix) {
  db.seq = db.seq || {};
  db.seq[prefix] = (db.seq[prefix] || 0) + 1;
  return prefix + '_' + db.seq[prefix];
}

const USERNAME_RE = /^[A-Z]{2,5}[0-9]{4}$/;
const CYRILLIC_LATIN = Object.freeze({
  А:'A', Б:'B', В:'V', Г:'G', Д:'D', Е:'E', Ё:'E', Ж:'ZH', З:'Z', И:'I', Й:'I', К:'K', Л:'L', М:'M', Н:'N', О:'O', П:'P', Р:'R', С:'S', Т:'T', У:'U', Ф:'F', Х:'KH', Ц:'TS', Ч:'CH', Ш:'SH', Щ:'SHCH', Ъ:'', Ы:'Y', Ь:'', Э:'E', Ю:'YU', Я:'YA',
  Ә:'A', Ғ:'G', Қ:'K', Ң:'N', Ө:'O', Ұ:'U', Ү:'U', Һ:'H', І:'I',
});
function usernamePrefix(user) {
  const source = user.role === 'student' ? String(user.group || '').split(/[\s-]+/)[0]
    : user.role === 'teacher' ? 'TCH' : user.role === 'staff' ? 'STF' : 'KU';
  const latin = [...source.toUpperCase()].map(char => CYRILLIC_LATIN[char] ?? char).join('').replace(/[^A-Z]/g, '').slice(0, 5);
  return /^[A-Z]{2,5}$/.test(latin) ? latin : user.role === 'student' ? 'STU' : user.role === 'teacher' ? 'TCH' : 'STF';
}
function assignUsername(user, used) {
  const existing = String(user.login || '').trim().toUpperCase();
  if (USERNAME_RE.test(existing) && !used.has(existing)) {
    const normalized = user.login !== existing;
    user.login = existing;
    used.add(existing);
    return normalized;
  }
  const prefix = usernamePrefix(user);
  for (let attempt = 0; attempt < 10000; attempt++) {
    const candidate = prefix + String(crypto.randomInt(0, 10000)).padStart(4, '0');
    if (!used.has(candidate)) {
      user.login = candidate;
      used.add(candidate);
      return true;
    }
  }
  throw new Error('Не удалось выдать уникальный логин для группы ' + prefix);
}
function migrateUsernames() {
  const used = new Set();
  let changed = false;
  for (const user of db.users) changed = assignUsername(user, used) || changed;
  if (changed) {
    saveDB();
    console.log('[accounts] назначены логины пользователям');
  }
}

/* -------------------------------- helpers -------------------------------- */

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function bad(res, code, msg) { send(res, code, { error: msg }); }
function ok(res, obj) { send(res, 200, obj || { ok: true }); }

/* Ограничения попыток (server/security.js):
   вход — по паре логин/email + IP (чужой человек не может запереть владельца аккаунта), по идентификатору в целом — выше, против
   перебора с разных адресов (кроме бета-аккаунтов: их пароль и так публичный), по IP — общий (у кампуса общий IP — лимит выше);
   регистрация — по IP; ввод пароля для смены пароля / отключения 2FA / удаления аккаунта — по пользователю */
const LIMIT_MS = 15 * 60 * 1000;
const loginByEmailIp = sec.createLimiter({ max: 8, windowMs: LIMIT_MS });
const loginByEmail = sec.createLimiter({ max: 40, windowMs: LIMIT_MS });
const loginByIp = sec.createLimiter({ max: 60, windowMs: LIMIT_MS });
const registerByIp = sec.createLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
const passCheckByUser = sec.createLimiter({ max: 8, windowMs: LIMIT_MS });
const TOO_MANY_LOGINS = 'Слишком много попыток входа. Попробуйте через 15 минут';
const TOO_MANY_PASS = 'Слишком много попыток. Попробуйте через 15 минут';
const PASS_SHORT = 'Пароль — минимум 8 символов';
// неизвестный логин/email проверяется против этого хеша — ответ занимает столько же времени, сколько для существующего
const NO_USER = {}; sec.setPasswordSync(NO_USER, crypto.randomBytes(16).toString('hex'));
/* Пароль для действия с аккаунтом: неверный — счётчик, исчерпан — 429 (текст ошибки или null, если верный) */
async function passError(u, pw) {
  const release = passCheckByUser.reserve(u.id);
  if (!release) return [429, TOO_MANY_PASS];
  if (await sec.checkPassword(u, pw)) { release(); return null; }
  return [400, null];
}

const sessions = new Map(); // token -> user
const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000; // сеанс без активности 30 дней — выход
// После обновления принимаются только сеансы с отпечатком токена и действующим допуском.
const sessionExpired = (tok, now) => { const m = db.sessMeta && db.sessMeta[tok]; return !m || now - (m.lastSeen || m.created || 0) > SESSION_IDLE_MS; };
function loadSessions() {
  if (!db.sessions) return;
  const now = Date.now();
  db.sessMeta = db.sessMeta || {};
  for (const [tok, uid] of Object.entries(db.sessions)) {
    const user = db.users.find((x) => x.id === uid);
    if (!user || !tok.startsWith('sha256:') || sessionExpired(tok, now) ||
        !db.sessMeta[tok].grant || grantOf(user) !== db.sessMeta[tok].grant) {
      delete db.sessions[tok]; delete db.sessMeta[tok]; continue;
    }
    sessions.set(tok, user);
  }
  saveDB();
}
/* Метаданные сеанса (для «Активных сеансов»): db.sessMeta[token] = { sid, uid, created, lastSeen, ua, ip }.
   Наружу отдаётся только sid — сам токен никогда не показывается. */
const digestToken = raw => 'sha256:' + crypto.createHash('sha256').update(raw).digest('hex');
function reqToken(req) {
  const match = /^Bearer ([0-9a-f]{48})$/i.exec(req.headers.authorization || '');
  return match ? digestToken(match[1]) : '';
}
function saveSession(user, req, grant) {
  const raw = crypto.randomBytes(24).toString('hex'), token = digestToken(raw);
  sessions.set(token, user);
  db.sessions = db.sessions || {};
  db.sessions[token] = user.id;
  db.sessMeta = db.sessMeta || {};
  db.sessMeta[token] = {
    sid: crypto.randomBytes(6).toString('hex'), uid: user.id, grant, created: Date.now(), lastSeen: Date.now(),
    ua: req ? String(req.headers['user-agent'] || '').slice(0, 200) : '', ip: req ? clientIp(req) : '',
  };
  saveDB();
  return raw;
}
function dropSession(token, save = true) {
  if (!sessions.delete(token)) return;
  if (db.sessions) delete db.sessions[token];
  if (db.sessMeta) delete db.sessMeta[token];
  if (save) saveDB();
}
/* Все сеансы пользователя (кроме exceptToken): смена или сброс пароля, отзыв доступа, удаление */
function dropUserSessions(uid, exceptToken = '') {
  let n = 0;
  for (const [tok, user] of sessions) if (user.id === uid && tok !== exceptToken) { dropSession(tok, false); n++; }
  for (const [tok, id] of Object.entries(db.sessions || {})) if (id === uid && tok !== exceptToken) { delete db.sessions[tok]; if (db.sessMeta) delete db.sessMeta[tok]; n++; }
  if (n) saveDB();
  return n;
}
/* «Был в сети» обновляется в памяти, на диск — не чаще раза в 30 секунд */
let dbDirty = false;
setInterval(() => { if (dbDirty) { dbDirty = false; saveDB(); } }, 30000).unref();
setInterval(() => {
  const now = Date.now(), old = [...sessions.keys()].filter((tok) => sessionExpired(tok, now));
  old.forEach((tok) => dropSession(tok, false));
  if (old.length) saveDB();
}, 60 * 60 * 1000).unref();
function userOf(req) {
  const t = reqToken(req);
  const u = sessions.get(t) || null;
  if (u) {
    const now = Date.now();
    if (sessionExpired(t, now) || grantOf(u) !== db.sessMeta[t].grant) { dropSession(t); return null; }
    if (!u.lastSeen || now - u.lastSeen > 15000) { u.lastSeen = now; dbDirty = true; }
    const m = db.sessMeta && db.sessMeta[t];
    if (m && now - (m.lastSeen || 0) > 15000) { m.lastSeen = now; dbDirty = true; }
  }
  return u;
}

/* ------------------- Настройки пользователя (на сервере) ------------------- */
const SETTING_DEFAULTS = { showInRating: true, showOnline: true, loginAlerts: true, readReceipts: true, officeHours: '' };
const SETTING_TEXT_MAX = { officeHours: 80 }; // часы консультаций преподавателя — видны студентам в KU Message
const settingsOf = (u) => Object.assign({}, SETTING_DEFAULTS, u.settings || {});
const ONLINE_MS = 2 * 60 * 1000;
const isOnline = (u) => settingsOf(u).showOnline && !!u.lastSeen && Date.now() - u.lastSeen < ONLINE_MS;

/* Уведомления (входящие): новая оценка, изменение расписания, вход с нового устройства.
   Хранятся структурно — текст собирает клиент на языке интерфейса. */
function pushInbox(user, item) {
  user.inbox = user.inbox || [];
  user.inbox.unshift(Object.assign({ id: crypto.randomBytes(5).toString('hex'), at: Date.now(), read: false }, item));
  if (user.inbox.length > 50) user.inbox.length = 50;
}

/* Программа (университет) пользователя — от неё зависят цвета портала и онлайн-экзамена */
const PROGRAMS = ['ku', 'arizona'];
/* Роли при регистрации: студент, преподаватель, сотрудник (менеджер, руководитель клуба — права назначает оператор) */
const ROLES = ['student', 'teacher', 'staff'];
const ROLE_PREFIX = { student: 'std', teacher: 'tch', staff: 'stf' };
const programOf = (u) => (u && PROGRAMS.includes(u.program) ? u.program : 'ku');
/* Направление пользователя (показывается в профиле и на экране входа):
   студент — по префиксу группы (ИСУ → it, БТ → bio), преподаватель — по кафедре (dept). */
const TRACKS = ['it', 'bio', 'lang'];
function trackOf(u) {
  if (!u) return '';
  if (u.role === 'teacher') return TRACKS.includes(u.dept) ? u.dept : 'lang';
  const g = String(u.group || '').trim().toUpperCase();
  return /^БТ/.test(g) ? 'bio' : /^(ИСУ|ИС|ВТ|IT)/.test(g) ? 'it' : '';
}
function pubUser(u) {
  if (!u) return null;
  return { id: u.id, role: u.role, fio: u.fio, firstName: u.firstName, email: u.email, login: u.login || '', group: u.group || '', groups: u.role === 'teacher' ? groupsOf(u) || [] : [], program: programOf(u), track: trackOf(u), perms: permsOf(u), mustChangePassword: !!u.mustChangePassword };
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
function hhmm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function fmtDate(d) { return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[(d.getDay() + 6) % 7]}`; }
function subjName(id) { const s = db.subjects.find((x) => x.id === id); return s ? s.name : 'Занятие'; }
function teacherFio(id) { const u = db.users.find((x) => x.id === id); return u ? u.fio : '—'; }
function avgOf(studentId, subjectId) {
  const rows = db.grades.filter((g) => g.studentId === studentId && (!subjectId || g.subjectId === subjectId));
  if (!rows.length) return null;
  return Math.round((rows.reduce((a, g) => a + Number(g.score || 0), 0) / rows.length) * 10) / 10;
}

/* Следующее занятие в расписании группы */
function nextLesson(group) {
  const rows = db.schedule.filter((s) => s.group === group);
  if (!rows.length) return null;
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayIdx = (d.getDay() + 6) % 7;
    const list = rows.filter((r) => r.day === dayIdx).sort((a, b) => a.start.localeCompare(b.start));
    for (const r of list) {
      if (i === 0 && r.end <= hhmm(now)) continue;
      return {
        subject: subjName(r.subjectId), type: r.type,
        date: fmtDate(d), time: `${r.start} - ${r.end}`,
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, // клиент форматирует на языке интерфейса
        room: r.room, teacher: teacherFio(r.teacherId),
      };
    }
  }
  return null;
}

/* ---------------- Справочник предметов (для оценок и расписания) ---------------- */
const DISCIPLINES = [
  { id: 'english', name: 'Английский язык', short: 'Английский', re: /англ|english/i },
  { id: 'math', name: 'Высшая математика', short: 'Высшая математика', re: /матем|math/i },
  { id: 'politology', name: 'Политология', short: 'Политология', re: /полит/i },
  { id: 'ecology', name: 'Экология', short: 'Экология', re: /эколог/i },
  { id: 'economics', name: 'Экономика', short: 'Экономика', re: /эконом/i },
  { id: 'it', name: 'Введение в информационные технологии', short: 'Введение в ИТ', re: /информац|(^|[^а-яё])ит([^а-яё]|$)|\bit\b/i },
  { id: 'python', name: 'Программирование на Python', short: 'Python', re: /программ|python/i },
  { id: 'databases', name: 'Базы данных', short: 'Базы данных', re: /баз[аыу]? данных|\bsql\b/i },
  { id: 'biochem', name: 'Биохимия', short: 'Биохимия', re: /биохим/i },
  { id: 'microbio', name: 'Микробиология', short: 'Микробиология', re: /микробиол/i },
];
const DISC_OTHER = { id: 'other', name: 'Другие предметы', short: 'Другое' };
function detectDiscipline(name) {
  const d = DISCIPLINES.find((x) => x.re.test(String(name || '')));
  return d ? d.id : 'other';
}
function discName(id) { const d = DISCIPLINES.find((x) => x.id === id); return d ? d.name : DISC_OTHER.name; }
/* Найти/создать предмет преподавателя для дисциплины */
function subjectForDiscipline(u, disc) {
  const name = discName(disc);
  let sub = db.subjects.find((x) => x.teacherId === u.id && (x.discipline === disc || x.name.toLowerCase() === name.toLowerCase()));
  if (!sub) { sub = { id: nid('sub'), name, teacherId: u.id, discipline: disc }; db.subjects.push(sub); }
  return sub;
}

/* Бета-аккаунты (server/demo.js) и AI-помощник для сайта университета (server/ai.js) */
const { seedDemo } = require('./server/demo').createDemo({ getDB: () => db, saveDB, nid, setPasswordSync: sec.setPasswordSync, subjectForDiscipline, dataDir: DATA });
const ai = require('./server/ai');

/* ------------------------------- Статика --------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
/* Статика: public/ в корне, KU Message (ku-message/) — под /ku-message/ */
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  let root = PUB;
  if (p === '/ku-message' || p === '/connect' || p.startsWith('/connect/')) { res.writeHead(301, { Location: '/ku-message/' }); res.end(); return; }
  if (p.startsWith('/ku-message/')) { root = MESSAGE_DIR; p = p.slice('/ku-message'.length); if (p === '/') p = '/index.html'; }
  if (p === '/school' || p.startsWith('/school/') || p === '/results') { res.writeHead(301, { Location: '/results/' }); res.end(); return; } // прежний адрес
  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); res.end(); return; }
  if (p === '/admin/') { root = ADMIN_DIR; p = '/index.html'; }
  else if (p.startsWith('/admin/')) { root = ADMIN_DIR; p = p.slice('/admin'.length); }
  else if (p === '/results/') { root = RESULTS_DIR; p = '/index.html'; }
  else if (p.startsWith('/results/')) { root = RESULTS_DIR; p = p.slice('/results'.length); }
  p = path.normalize(p).replace(/^([.][.][\/\\])+/, '');
  const file = path.join(root, p);
  const relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (mime.startsWith('text/html')) res.setHeader('Content-Security-Policy', sec.htmlPolicy(buf));
    const noCache = /\.(html|js|css)$/i.test(file) ? { 'Cache-Control': 'no-cache' }
      : /\.woff2$/i.test(file) ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {};
    sendStatic(req, res, file, buf, Object.assign({ 'Content-Type': mime }, noCache));
  });
}

/* --------------------------------- API ----------------------------------- */

const examHandoffCodes = new Map(); // одноразовый SSO-код KU Portal → онлайн-экзамен
const portalExamUser = user => user && ({ id: user.id, fio: user.fio, login: user.login || '', email: user.email || '', role: user.role, group: user.group || '', groups: user.role === 'teacher' ? groupsOf(user) || [] : [] });
function portalSessionForExam(sessionKey) {
  const user = sessions.get(sessionKey), meta = db.sessMeta && db.sessMeta[sessionKey];
  if (!user || !meta || sessionExpired(sessionKey, Date.now())) return null;
  const grant = grantOf(user);
  return grant && meta.grant === grant ? user : null;
}
function portalExamAccounts() {
  return db.users.filter(user => ['student', 'teacher'].includes(user.role) && grantOf(user))
    .map(portalExamUser).filter(Boolean);
}
async function resolveExamHandoff(code) {
  const item = examHandoffCodes.get(code);
  examHandoffCodes.delete(code);
  if (!item || item.expires <= Date.now()) return null;
  const user = portalSessionForExam(item.session);
  if (!user || user.mustChangePassword || !['student', 'teacher'].includes(user.role)) return null;
  return { user: portalExamUser(user), sessionId: item.session, accounts: portalExamAccounts() };
}
function verifyExamPortalPassword(sessionKey, password) {
  const user = portalSessionForExam(sessionKey);
  return !!user && typeof password === 'string' && sec.checkPassword(user, password);
}

/* --------------------------------- API ----------------------------------- */

/* Онлайн-экзамен — приложение под /exam-sync/; вход получает аккаунт портала через одноразовый SSO-код. */
const examSync = require('./exam-sync/handler').createExamSync({
  base: '/exam-sync', dataFile: path.join(DATA, 'exam-sync.json'), demo: DEMO_ON,
  resolvePortalHandoff: resolveExamHandoff,
  validatePortalSession: sessionKey => !!portalSessionForExam(sessionKey),
  verifyPortalPassword: verifyExamPortalPassword,
  getPortalAccounts: portalExamAccounts,
});
/* Учебная база результатов — только преподаватели и администрация (право results); студентам и руководителям клубов закрыта */
function resultsAccess(u) {
  if (!u || !grantOf(u)) return null;
  // учебная база — только по праву «учебная база» (ревью п.6: у преподавателей по умолчанию её нет)
  return { id: u.id, fio: u.fio, role: u.role, perms: permsOf(u), authVersion: u.authVersion };
}
const results = require('./server/results').createResults({ dataDir: DATA, portal: {
  fromRequest: req => resultsAccess(userOf(req)),
  byId: id => resultsAccess(db.users.find(x => x.id === id)),
} });
/* Модули API: KU Message и файлы, клубы, общежитие (server/). Каждый возвращает false, если запрос не его. */
const moduleCtx = { getDB: () => db, saveDB, nid, ok, bad, isOnline, settingsOf, pushInbox, subjName, teacherFio, DATA, permsOf, teacherGroups, markDirty: () => { dbDirty = true; } };
const { createMessages, MAX_FILE_BYTES } = require('./server/messages');
const messages = createMessages(moduleCtx);
const help = require('./server/help').createHelp(moduleCtx); // помощь преподавателю: обращения к администрации (server/help.js)
const apiModules = [messages, require('./server/clubs').createClubs(moduleCtx), require('./server/dorm').createDorm(moduleCtx),
  require('./server/polls').createPolls(Object.assign({ audit }, moduleCtx)), help.handle]; // голосование (server/polls.js)
/* Админ-панель (server/admin.js): пользователи, допуск, права, сброс пароля, копия базы — право admin */
/* Восстановление пароля по почте (server/recovery.js, письма — server/mail.js) */
const recovery = require('./server/recovery').createRecovery({ getDB: () => db, saveDB, ok, bad, sec, audit, grantOf, clientIp, dropUserSessions });
/* Аккаунт (настройки, 2FA, сеансы, выгрузка, удаление) и учёба (расписание, оценки, рейтинг) — server/account.js, server/study.js */
const account = require('./server/account').createAccount({ getDB: () => db, saveDB, ok, bad, sec, audit, passError, reqToken, dropSession, dropUserSessions,
  pubUser, settingsOf, SETTING_DEFAULTS, SETTING_TEXT_MAX, PASS_SHORT, subjName, teacherFio, WEEKDAYS });
const study = require('./server/study').createStudy({ getDB: () => db, saveDB, ok, bad, audit, nid, isOnline, settingsOf, pushInbox, subjName, teacherFio,
  avgOf, nextLesson, detectDiscipline, teacherHasGroup, teacherGroups, WEEKDAYS });
const admin = require('./server/admin').createAdmin({ getDB: () => db, saveDB, ok, bad, sec, audit, passError, reqToken, dropUserSessions, isOnline, DATA, help,
  clearRotationBackups: () => store.clearBackups() });
const MUST_CHANGE_ALLOWED = new Set(['/api/auth/password', '/api/settings', '/api/sessions', '/api/inbox']);
const publicAIRate = sec.createLimiter({ max: 30, windowMs: 60_000 });
const handoffCodes = new Map(); // одноразовые коды перехода в KU Message: code → { uid, exp }
const HANDOFF_CODE_MS = 60 * 1000;
const PAGES_ORIGINS = new Set((process.env.PAGES_ORIGINS || 'https://sakeda-hub.github.io').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));

function allowPublicAI(req) {
  const ip = clientIp(req) || 'unknown';
  if (publicAIRate.blocked(ip)) return false;
  publicAIRate.hit(ip);
  return true;
}

async function handleRequest(req, res) {
  sec.securityHeaders(req, res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { throw new HttpError(400, 'Некорректный адрес'); }
  const p = url.pathname;

  // Для старой копии интерфейса на GitHub Pages разрешаем отдельный origin из PAGES_ORIGINS.
  // Основная версия на alwaysdata использует same-origin запросы; авторизация — заголовок Authorization, без cookie.
  if (p.startsWith('/api/') || p.startsWith('/exam-sync/api/')) {
    const origin = req.headers.origin || '';
    if (PAGES_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '600');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    }
  }

  // Public student chat is hosted on GitHub Pages and calls this API cross-origin.
  // Keep the browser allowlist exact; do not expose the portal's authenticated APIs.
  if (p.startsWith('/api/ai/')) {
    const origin = req.headers.origin || '';
    const allowedOrigins = new Set(['https://stikech.github.io', 'http://localhost:8000']);
    if (allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      if (!allowedOrigins.has(origin)) { res.writeHead(403); res.end(); return; }
      res.writeHead(204); res.end(); return;
    }
  }

  // «Онлайн-экзамен» (exam-sync), встроенный в портал: /exam-sync/...
  if (await examSync(req, res)) return;
  // Отдельная учебная база: собственный вход и роли, независимые от портала/экзамена.
  if (p.startsWith('/api/results/')) {
    const limit = p === '/api/results/test-file' ? Math.ceil(5 * 1024 * 1024 * 1.5) + 100_000 : 1e6;
    if (Number(req.headers['content-length'] || 0) > limit) { res.setHeader('Connection', 'close'); return bad(res, 413, 'Слишком большой запрос'); }
    if (await results.handle(req, res, url)) return;
  }

  if (!p.startsWith('/api/')) return serveStatic(req, res, url);

  // загрузка файла приходит в base64 (+~37%), остальные запросы — до 1 МБ
  const bodyLimit = p === '/api/files' ? Math.ceil(MAX_FILE_BYTES * 1.4) + 1000 : 1e6;
  if (p === '/api/files' && !userOf(req)) return bad(res, 401, 'Не авторизован');
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req, bodyLimit) : {};
  const u = userOf(req);

    /* ---------- Аутентификация ---------- */
    if (await recovery(p, req, res, body)) return;
    if (p === '/api/auth/register' && req.method === 'POST') {
      const { lastName = '', firstName = '', middleName = '', email = '', password = '', role = 'student', group = '', program = 'ku' } = body;
      if (![lastName, firstName, middleName, group].every(v => typeof v === 'string' && v.length <= 100) ||
          !lastName.trim() || !firstName.trim()) return bad(res, 400, 'Укажите фамилию и имя');
      if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 256) return bad(res, 400, 'Некорректные данные');
      if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 400, 'Некорректный email');
      if (registerByIp.blocked(clientIp(req))) return bad(res, 429, 'Слишком много регистраций с этого адреса. Попробуйте позже');
      if (String(password).length < sec.PASSWORD_MIN) return bad(res, 400, PASS_SHORT);
      if (!ROLES.includes(role)) return bad(res, 400, 'Выберите роль');
      if (!PROGRAMS.includes(program)) return bad(res, 400, 'Выберите программу');
      if (role === 'student' && !String(group).trim()) return bad(res, 400, 'Укажите группу');
      // новая регистрация студента — только группа из справочника (ИСУ2025-2 и т.п.); прежние группы у старых студентов остаются
      if (role === 'student' && !GROUPS.isCatalogGroup(group)) return bad(res, 400, 'Выберите группу из списка');
      const em = String(email).trim().toLowerCase();
      registerByIp.hit(clientIp(req));
      if (db.users.some((x) => x.email === em)) {
        // Same status/body and one scrypt operation as a new account: don't expose whether an address exists.
        await sec.checkPassword(NO_USER, String(password));
        return send(res, 202, { pending: true });
      }
      const fio = [lastName, firstName, middleName].filter(Boolean).map((s) => String(s).trim()).join(' ');
      const user = {
        id: nid(ROLE_PREFIX[role]),
        role, fio, firstName: String(firstName).trim(), email: em,
        group: role === 'student' ? String(group).trim() : '',
        program,
        createdAt: Date.now(),
      };
      if (body.deviceId) user.devices = [String(body.deviceId).slice(0, 64)];
      await sec.setPassword(user, String(password));
      // повторная проверка после await: два одновременных запроса с одним email не создадут дубль
      if (db.users.some((x) => x.email === em)) return bad(res, 400, 'Такой email уже зарегистрирован');
      db.users.push(user); saveDB();
      const grant = grantOf(user);
      if (!grant) {
        console.info('[access] registration.pending', user.id);
        return send(res, 202, { pending: true });
      }
      const token = saveSession(user, req, grant);
      return ok(res, { token, user: pubUser(user) });
    }

    if (p === '/api/auth/login' && req.method === 'POST') {
      const rawIdentifier = typeof body.identifier === 'string' ? body.identifier : body.email;
      const password = body.password ?? '';
      if (typeof rawIdentifier !== 'string' || rawIdentifier.length > 320 || typeof password !== 'string' || password.length > 4096) return bad(res, 401, 'Неверный логин или email или пароль');
      const value = rawIdentifier.trim();
      const isEmail = value.includes('@');
      const identifier = isEmail ? value.toLowerCase() : value.toUpperCase();
      const validIdentifier = isEmail ? identifier.length <= 254 && /^\S+@\S+\.\S+$/.test(identifier) : USERNAME_RE.test(identifier);
      const ip = clientIp(req), identifierIp = identifier + '|' + ip;
      const user = validIdentifier && (isEmail
        ? db.users.find(x => String(x.email || '').toLowerCase() === identifier)
        : db.users.find(x => String(x.login || '').toUpperCase() === identifier));
      const eligible = user && (!user.demo || DEMO_ON);
      if (loginByEmailIp.blocked(identifierIp) || loginByIp.blocked(ip) || loginByEmail.blocked(identifier)) return bad(res, 429, TOO_MANY_LOGINS);
      const releasePair = loginByEmailIp.reserve(identifierIp), releaseIp = loginByIp.reserve(ip);
      const releaseIdentifier = loginByEmail.reserve(identifier);
      const passHash = eligible && user.passHash;
      const passOk = await sec.checkPassword(eligible ? user : NO_USER, password);
      if (!eligible || !passOk || user.passHash !== passHash || !db.users.includes(user)) {
        return bad(res, 401, 'Неверный логин или email или пароль');
      }
      releasePair(); releaseIp(); if (releaseIdentifier) releaseIdentifier();
      if (user.mustChangePassword && Date.now() > (user.tempPasswordUntil || 0)) return bad(res, 401, 'Временный пароль истёк. Попросите администратора сбросить пароль ещё раз');
      const grant = grantOf(user);
      if (!grant) return bad(res, 403, 'Доступ ожидает подтверждения администратором');
      // старый хеш (sha256) — переводим на scrypt, пока пароль известен
      if (sec.needsRehash(user)) { await sec.setPassword(user, String(password)); saveDB(); }
      // Двухфакторная аутентификация: сначала пароль, затем код из приложения
      if (user.totp && user.totp.enabled) {
        if (!body.code) return ok(res, { need2fa: true });
        if (codeBlocked(user.id)) return bad(res, 429, 'Слишком много попыток. Попробуйте через 5 минут');
        if (!totpOk(user.totp.secret, body.code)) { codeFail(user.id); return bad(res, 401, 'Неверный код подтверждения'); }
        codeReset(user.id);
      }
      // Оповещение о входе с нового устройства (идентификатор устройства хранится в браузере)
      const dev = String(body.deviceId || '').slice(0, 64);
      if (dev) {
        user.devices = user.devices || [];
        if (!user.devices.includes(dev)) {
          if (user.devices.length && settingsOf(user).loginAlerts) pushInbox(user, { type: 'login', device: deviceLabel(req.headers['user-agent']), ip: clientIp(req) });
          user.devices.push(dev); if (user.devices.length > 20) user.devices.shift();
        }
      }
      const token = saveSession(user, req, grant);
      return ok(res, { token, user: pubUser(user) });
    }

    if (p === '/api/me' && req.method === 'GET') {
      if (!u) return bad(res, 401, 'Не авторизован');
      return ok(res, { user: pubUser(u) });
    }

    if (p === '/api/auth/logout' && req.method === 'POST') {
      dropSession(reqToken(req));
      // вышел на последнем устройстве — сразу не «в сети»
      if (u && !Object.values(db.sessions || {}).includes(u.id)) u.lastSeen = 0;
      return ok(res);
    }

    if (p === '/api/exam/handoff' && req.method === 'POST') {
      if (!u) return bad(res, 401, 'Войдите в KU Portal');
      if (!grantOf(u)) return bad(res, 403, 'Доступ к порталу не подтверждён');
      if (u.mustChangePassword) return bad(res, 403, 'Сначала задайте постоянный пароль в KU Portal');
      if (!['student', 'teacher'].includes(u.role)) return bad(res, 403, 'Онлайн-экзамен доступен студентам и преподавателям');
      for (const [key, value] of examHandoffCodes) if (value.expires <= Date.now()) examHandoffCodes.delete(key);
      const code = crypto.randomBytes(24).toString('hex');
      examHandoffCodes.set(code, { session: reqToken(req), expires: Date.now() + HANDOFF_CODE_MS });
      return ok(res, { code });
    }

    /* Переход в KU Message без повторного входа: портал получает одноразовый код (60 с) и передаёт его
       в адресе после # (на сервер такой адрес не уходит); KU Message обменивает код на свой сеанс. */
    if (p === '/api/message/redeem' && req.method === 'POST') {
      const c = handoffCodes.get(String(body.code || ''));
      handoffCodes.delete(String(body.code || ''));
      const user = c && Date.now() < c.exp && sessions.get(c.session);
      const grant = user && grantOf(user);
      if (!grant || sessionExpired(c.session, Date.now()) || db.sessMeta[c.session].grant !== grant) return bad(res, 401, 'Ссылка для входа устарела — откройте KU Message из портала ещё раз');
      const token = saveSession(user, req, grant);
      return ok(res, { token, user: pubUser(user) });
    }

    if (p === '/api/version' && req.method === 'GET') {
      return ok(res, VERSION);
    }
    // справочник групп для формы регистрации (до входа) — server/groups.js
    if (p === '/api/groups' && req.method === 'GET') {
      return ok(res, { directions: GROUPS.DIRECTIONS, years: GROUPS.YEARS, groups: GROUPS.GROUP_CATALOG });
    }

    if (p === '/api/demo' && req.method === 'GET') {
      return ok(res, { enabled: false });
    }

    if (p === '/api/ai/status' && req.method === 'GET') {
      if (!allowPublicAI(req)) return bad(res, 429, 'Слишком много запросов. Попробуйте позже.');
      return ok(res, await ai.aiStatus());
    }

    // Public static university site uses the assistant without a KU Portal login.
    if (p === '/api/ai/chat' && req.method === 'POST') {
      if (!allowPublicAI(req)) return bad(res, 429, 'Слишком много запросов. Попробуйте позже.');
      const q = String(body.message || '').trim().slice(0, 1000);
      if (!q) return bad(res, 400, 'Пустой вопрос');
      try {
        const r = await ai.aiReply(q);
        return ok(res, r);
      } catch (e) {
        ai.resetModelCache();
        console.error('[AI] Запрос к LM Studio не выполнен:', e.name === 'TimeoutError' ? 'таймаут' : (e.cause?.code || e.message));
        return ok(res, {
          reply: 'Модель Gemma сейчас недоступна. Проверьте, что LM Studio запущена и сервер доступен порталу.',
          src: 'offline',
        });
      }
    }

    if (!u) return bad(res, 401, 'Не авторизован');
    // пароль выдан администратором: до смены на свой доступны только кабинет и смена пароля
    if (u.mustChangePassword && !MUST_CHANGE_ALLOWED.has(p)) return bad(res, 403, 'Сначала задайте свой пароль: Кабинет → Безопасность');

    if (p === '/api/exams/open' && req.method === 'GET') return ok(res, { rooms: examSync.openRooms(u) });

    if (await admin.handle(p, req, res, u, body) !== false) return;
    for (const handle of apiModules) if (await handle(p, req, res, u, body, url) !== false) return;

    if (p === '/api/message/handoff' && req.method === 'POST') {
      const now = Date.now();
      const session = reqToken(req);
      for (const [k, v] of handoffCodes) if (v.exp <= now || v.session === session) handoffCodes.delete(k);
      const code = crypto.randomBytes(18).toString('hex');
      handoffCodes.set(code, { session, exp: now + HANDOFF_CODE_MS });
      return ok(res, { code });
    }

    if (await account(p, req, res, u, body) !== false) return; // server/account.js
    if (await study(p, req, res, u, body, url) !== false) return; // server/study.js

    return bad(res, 404, 'Не найдено');
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    const expected = error instanceof HttpError;
    if (!expected) console.error('[API]', req.method, error.message);
    if (res.destroyed || res.headersSent) return;
    if (error.status === 413) res.setHeader('Connection', 'close');
    bad(res, expected ? error.status : 500, expected ? error.message : 'Внутренняя ошибка');
  });
});

/* -------------------------------- Старт ---------------------------------- */

try { loadDB(); } catch (e) { console.error('[DB]', e.message); process.exit(1); }
/* Рабочий режим: бета-аккаунты прежних версий и всё, что к ним привязано, убираются из базы (server/cleanup.js) */
function purgeDemoAccounts() {
  if (DEMO_ON) return;
  const { users, files } = require('./server/cleanup').purgeDemo(db);
  if (!users.length) return;
  for (const user of users) { try { forget(user); } catch (error) { console.error('[cleanup] права не удалены:', user.id, error.code); } }
  saveDB();
  require('./server/admin').removeUploads(DATA, files);
  console.log('[cleanup] удалены демо-аккаунты:', users.map(x => x.id).join(', '));
  audit('portal.demo.purge', 'system', users.map(x => x.id).join(','));
}
purgeDemoAccounts();
seedDemo();
if (DEMO_ON || process.env.NODE_ENV !== 'test') messages.seedDemoMaterials();
migrateTeacherGroups();
migrateUsernames();
loadSessions();
const moderationCleanup = require('./server/moderation').cleanExistingChat(db);
if (moderationCleanup.firstRun) {
  saveDB();
  console.log('[moderation] existing chat cleanup complete:', JSON.stringify({ scanned: moderationCleanup.scanned, changed: moderationCleanup.changed }));
}
admin.applyProvision();
setInterval(admin.applyProvision, 5000).unref(); // сброс пароля командой с хоста (scripts/access.js reset-password)
server.listen(PORT, HOST, () => {
  console.log(`KU Portal: http://${HOST || 'localhost'}:${server.address().port}`);
  console.log('[startup]', JSON.stringify({ commit: VERSION.commit, data: DATA, demo: DEMO_ON }));
});

/* Перезапуск после обновления кода: deploy/alwaysdata-update.sh обновляет файл .restart рядом с server.js.
   Сервер сохраняет базу и завершается, хостинг (alwaysdata) запускает его заново уже с новым кодом.
   Пока файл не трогают, ничего не происходит. */
const RESTART_FILE = path.join(ROOT, '.restart');
fs.watchFile(RESTART_FILE, { interval: 5000 }, (cur, prev) => {
  if (!cur.mtimeMs || cur.mtimeMs === prev.mtimeMs) return;
  console.log('[deploy] найден .restart — перезапуск');
  try { saveDB(); } catch (e) { console.error('[deploy] saveDB:', e.message); }
  process.exit(0);
}).unref();
