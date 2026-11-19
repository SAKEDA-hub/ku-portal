/*
 * KU Portal — сервер без внешних зависимостей (Node.js >= 18). Точка входа (alwaysdata запускает node server.js).
 * Здесь: база (data/db.json), вход и сеансы, 2FA, настройки, расписание, оценки, рейтинг, статика.
 * Модули server/: messages.js (KU Message + файлы), clubs.js, dorm.js, demo.js (бета-аккаунты), ai.js (помощник
 * для сайта университета). Отдельные приложения: exam-sync/ (/exam-sync/), ku-message/ (/ku-message/).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || 3000;
// alwaysdata требует слушать конкретный IP из настроек сайта (переменные IP / ALWAYSDATA_HTTPD_IP); без них — все интерфейсы, как раньше
const HOST = process.env.IP || process.env.ALWAYSDATA_HTTPD_IP || undefined;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const MESSAGE_DIR = path.join(ROOT, 'ku-message'); // KU Message — мессенджер университета (/ku-message/)
const DATA = path.join(ROOT, 'data');
/* Настройки из .env рядом с server.js (не в git; переменные окружения сайта важнее) — например, доступ к MySQL */
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* .env нет — только переменные окружения */ }
const { openStorage } = require('./server/storage');
const sec = require('./server/security');

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

/* Версия кода, с которой запущен сервер (для проверки, что автообновление перезапустило сервер): /api/version.
   Читается из .git один раз при старте; git на машине сайта не нужен. */
function readCommit() {
  try {
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

/* База — server/storage.js: MySQL (если заданы MYSQL_URL или MYSQL_HOST/USER/PASSWORD/DATABASE) + data/db.json как
   живая копия; без MySQL — только data/db.json (атомарная запись, ежедневные копии data/backups/, восстановление из копии) */
let db = null;
let storage = null;
const emptyDB = () => ({ users: [], subjects: [], schedule: [], grades: [], seq: {} });
function saveDB() { storage.portal.save(db); }
function nid(prefix) {
  db.seq = db.seq || {};
  db.seq[prefix] = (db.seq[prefix] || 0) + 1;
  return prefix + '_' + db.seq[prefix];
}

/* -------------------------------- helpers -------------------------------- */

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function bad(res, code, msg) { send(res, code, { error: msg }); }
function ok(res, obj) { send(res, 200, obj || { ok: true }); }

function readBody(req, limit = 1e6) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > limit) req.destroy(); });
    req.on('end', () => { try { const v = d ? JSON.parse(d) : {}; resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
    req.on('close', () => resolve({})); // тело больше лимита: соединение закрыто, end не придёт
  });
}
/* Ограничения попыток (server/security.js):
   вход — по паре email + IP (чужой человек не может запереть владельца аккаунта), по email в целом — выше, против
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
// неизвестный email проверяется против этого хеша — ответ занимает столько же времени, сколько для существующего
const NO_USER = {}; sec.setPasswordSync(NO_USER, crypto.randomBytes(16).toString('hex'));
/* Пароль для действия с аккаунтом: неверный — счётчик, исчерпан — 429 (текст ошибки или null, если верный) */
async function passError(u, pw) {
  if (passCheckByUser.blocked(u.id)) return [429, TOO_MANY_PASS];
  if (await sec.checkPassword(u, pw)) { passCheckByUser.reset(u.id); return null; }
  passCheckByUser.hit(u.id);
  return [400, null];
}

const sessions = new Map(); // token -> user
const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000; // сеанс без активности 30 дней — выход
// сеанс без метаданных тоже считается истёкшим: все сеансы создаются через saveSession, старые получают метаданные в loadSessions
const sessionExpired = (tok, now) => { const m = db.sessMeta && db.sessMeta[tok]; return !m || now - (m.lastSeen || m.created || 0) > SESSION_IDLE_MS; };
function loadSessions() {
  if (!db.sessions) return;
  const now = Date.now();
  db.sessMeta = db.sessMeta || {};
  for (const [tok, uid] of Object.entries(db.sessions)) {
    const user = db.users.find((x) => x.id === uid);
    // сеансы без метаданных (созданные раньше) получают их сейчас — и тоже истекут без активности
    if (user && !db.sessMeta[tok]) db.sessMeta[tok] = { sid: crypto.randomBytes(6).toString('hex'), uid, created: now, lastSeen: now, ua: '', ip: '' };
    if (!user || sessionExpired(tok, now)) { delete db.sessions[tok]; delete db.sessMeta[tok]; continue; }
    sessions.set(tok, user);
  }
  saveDB();
}
/* Метаданные сеанса (для «Активных сеансов»): db.sessMeta[token] = { sid, uid, created, lastSeen, ua, ip }.
   Наружу отдаётся только sid — сам токен никогда не показывается. */
const reqToken = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
// адрес клиента — последняя запись X-Forwarded-For (её добавляет прокси хостинга; начало заголовка клиент может подделать)
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || (req.socket && req.socket.remoteAddress) || '';
function saveSession(token, user, req) {
  db.sessions = db.sessions || {};
  db.sessions[token] = user.id;
  db.sessMeta = db.sessMeta || {};
  db.sessMeta[token] = {
    sid: crypto.randomBytes(6).toString('hex'), uid: user.id, created: Date.now(), lastSeen: Date.now(),
    ua: req ? String(req.headers['user-agent'] || '').slice(0, 200) : '', ip: req ? clientIp(req) : '',
  };
  saveDB();
}
function dropSession(token, save = true) {
  sessions.delete(token);
  if (db.sessions) delete db.sessions[token];
  if (db.sessMeta) delete db.sessMeta[token];
  if (save) saveDB();
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
    if (sessionExpired(t, now)) { dropSession(t); return null; }
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
function codeBlocked(uid) { const f = codeFails.get(uid); return !!f && f.n >= 5 && Date.now() - f.t < 300000; }
function codeFail(uid) { const f = codeFails.get(uid); if (!f || Date.now() - f.t >= 300000) codeFails.set(uid, { n: 1, t: Date.now() }); else f.n++; }

/* Определение устройства по User-Agent — только для подписи в списке сеансов */
function deviceLabel(ua) {
  ua = String(ua || '');
  const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Yandex' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(', ') || (ua ? ua.slice(0, 40) : '');
}
/* Программа (университет) пользователя — от неё зависят цвета портала и онлайн-экзамена */
const PROGRAMS = ['ku', 'arizona'];
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
  return { id: u.id, role: u.role, fio: u.fio, firstName: u.firstName, email: u.email, group: u.group || '', program: programOf(u), track: trackOf(u) };
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
const { seedDemo, DEMO_ON, DEMO_PASS, DEMO_ACCOUNTS } = require('./server/demo').createDemo({ getDB: () => db, saveDB, nid, setPasswordSync: sec.setPasswordSync, subjectForDiscipline });
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
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
/* Статика: public/ в корне, KU Message (ku-message/) — под /ku-message/ */
function serveStatic(req, res, url) {
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  let root = PUB;
  if (p === '/ku-message' || p === '/connect' || p.startsWith('/connect/')) { res.writeHead(301, { Location: '/ku-message/' }); res.end(); return; }
  if (p.startsWith('/ku-message/')) { root = MESSAGE_DIR; p = p.slice('/ku-message'.length); if (p === '/') p = '/index.html'; }
  p = path.normalize(p).replace(/^([.][.][\/\\])+/, '');
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const noCache = /\.(html|js|css)$/i.test(file) ? { 'Cache-Control': 'no-cache' }
      : /\.woff2$/i.test(file) ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {};
    res.writeHead(200, Object.assign({ 'Content-Type': mime }, noCache));
    res.end(buf);
  });
}

/* --------------------------------- API ----------------------------------- */

/* «Онлайн-экзамен» (github.com/StephCurrysvg/exam-sync) — отдельное приложение под /exam-sync/,
   раздел «Экзамен» портала (public/app.js, viewExam) ведёт сюда */
let examSync = null; // создаётся при старте, когда хранилище открыто (см. main)
/* Модули API: KU Message и файлы, клубы, общежитие (server/). Каждый возвращает false, если запрос не его. */
const moduleCtx = { getDB: () => db, saveDB, nid, ok, bad, isOnline, settingsOf, pushInbox, subjName, teacherFio, DATA, markDirty: () => { dbDirty = true; } };
const { createMessages, MAX_FILE_BYTES } = require('./server/messages');
const apiModules = [createMessages(moduleCtx), require('./server/clubs').createClubs(moduleCtx), require('./server/dorm').createDorm(moduleCtx)];
const publicAIRate = new Map();
const handoffCodes = new Map(); // одноразовые коды перехода в KU Message: code → { uid, exp }
const HANDOFF_CODE_MS = 60 * 1000;
const PAGES_ORIGINS = new Set((process.env.PAGES_ORIGINS || 'https://sakeda-hub.github.io').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));

function allowPublicAI(req) {
  const ip = clientIp(req) || 'unknown';
  const now = Date.now();
  let window = publicAIRate.get(ip);
  if (!window || now - window.startedAt >= 60_000) {
    window = { startedAt: now, count: 0 };
    publicAIRate.set(ip, window);
  }
  if (window.count >= 30) return false;
  window.count++;
  if (publicAIRate.size > 10_000) {
    for (const [key, value] of publicAIRate) if (now - value.startedAt >= 60_000) publicAIRate.delete(key);
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  sec.securityHeaders(req, res);

  // Интерфейс портала на GitHub Pages (public/config.js) обращается к этому серверу с другого адреса.
  // Разрешаем только перечисленные адреса Pages (PAGES_ORIGINS через запятую); авторизация — заголовок Authorization, без cookie.
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
  if (examSync && await examSync(req, res)) return;

  if (!p.startsWith('/api/')) return serveStatic(req, res, url);

  // загрузка файла приходит в base64 (+~37%), остальные запросы — до 1 МБ
  const bodyLimit = p === '/api/files' ? Math.ceil(MAX_FILE_BYTES * 1.4) + 1000 : 1e6;
  if (Number(req.headers['content-length'] || 0) > bodyLimit) {
    res.setHeader('Connection', 'close');
    return bad(res, 413, p === '/api/files' ? 'Файл больше 10 МБ' : 'Слишком большой запрос');
  }
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req, bodyLimit) : {};
  const u = userOf(req);

  try {
    /* ---------- Аутентификация ---------- */
    if (p === '/api/auth/register' && req.method === 'POST') {
      const { lastName = '', firstName = '', middleName = '', email = '', password = '', role = 'student', group = '', program = 'ku' } = body;
      if (!String(lastName).trim() || !String(firstName).trim()) return bad(res, 400, 'Укажите фамилию и имя');
      if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 400, 'Некорректный email');
      if (registerByIp.blocked(clientIp(req))) return bad(res, 429, 'Слишком много регистраций с этого адреса. Попробуйте позже');
      if (String(password).length < sec.PASSWORD_MIN) return bad(res, 400, PASS_SHORT);
      if (!['student', 'teacher'].includes(role)) return bad(res, 400, 'Выберите роль');
      if (!PROGRAMS.includes(program)) return bad(res, 400, 'Выберите программу');
      if (role === 'student' && !String(group).trim()) return bad(res, 400, 'Укажите группу');
      const em = String(email).trim().toLowerCase();
      if (db.users.some((x) => x.email === em)) return bad(res, 400, 'Такой email уже зарегистрирован');
      const fio = [lastName, firstName, middleName].filter(Boolean).map((s) => String(s).trim()).join(' ');
      const user = {
        id: nid(role === 'teacher' ? 'tch' : 'std'),
        role, fio, firstName: String(firstName).trim(), email: em,
        group: role === 'student' ? String(group).trim() : '',
        program,
        createdAt: Date.now(),
      };
      if (body.deviceId) user.devices = [String(body.deviceId).slice(0, 64)];
      await sec.setPassword(user, String(password));
      // повторная проверка после await: два одновременных запроса с одним email не создадут дубль
      if (db.users.some((x) => x.email === em)) return bad(res, 400, 'Такой email уже зарегистрирован');
      registerByIp.hit(clientIp(req));
      db.users.push(user); saveDB();
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, user);
      saveSession(token, user, req);
      return ok(res, { token, user: pubUser(user) });
    }

    if (p === '/api/auth/login' && req.method === 'POST') {
      const { email = '', password = '' } = body;
      const em = String(email).trim().toLowerCase(), ip = clientIp(req), emIp = em + '|' + ip;
      const user = db.users.find((x) => x.email === em);
      const guardEmail = !(user && user.demo);
      if (loginByEmailIp.blocked(emIp) || loginByIp.blocked(ip) || (guardEmail && loginByEmail.blocked(em))) return bad(res, 429, TOO_MANY_LOGINS);
      const passOk = await sec.checkPassword(user || NO_USER, String(password));
      if (!user || !passOk) {
        loginByEmailIp.hit(emIp); loginByIp.hit(ip); if (guardEmail) loginByEmail.hit(em);
        return bad(res, 401, 'Неверный email или пароль');
      }
      // старый хеш (sha256) — переводим на scrypt, пока пароль известен
      if (sec.needsRehash(user)) { await sec.setPassword(user, String(password)); saveDB(); }
      // Двухфакторная аутентификация: сначала пароль, затем код из приложения
      if (user.totp && user.totp.enabled) {
        if (!body.code) return ok(res, { need2fa: true });
        if (codeBlocked(user.id)) return bad(res, 429, 'Слишком много попыток. Попробуйте через 5 минут');
        if (!totpOk(user.totp.secret, body.code)) { codeFail(user.id); return bad(res, 401, 'Неверный код подтверждения'); }
        codeFails.delete(user.id);
      }
      loginByEmailIp.reset(emIp);
      // Оповещение о входе с нового устройства (идентификатор устройства хранится в браузере)
      const dev = String(body.deviceId || '').slice(0, 64);
      if (dev) {
        user.devices = user.devices || [];
        if (!user.devices.includes(dev)) {
          if (user.devices.length && settingsOf(user).loginAlerts) pushInbox(user, { type: 'login', device: deviceLabel(req.headers['user-agent']), ip: clientIp(req) });
          user.devices.push(dev); if (user.devices.length > 20) user.devices.shift();
        }
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, user);
      saveSession(token, user, req);
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

    /* Переход в KU Message без повторного входа: портал получает одноразовый код (60 с) и передаёт его
       в адресе после # (на сервер такой адрес не уходит); KU Message обменивает код на свой сеанс. */
    if (p === '/api/message/redeem' && req.method === 'POST') {
      const c = handoffCodes.get(String(body.code || ''));
      handoffCodes.delete(String(body.code || ''));
      const user = c && Date.now() < c.exp && db.users.find((x) => x.id === c.uid);
      if (!user) return bad(res, 401, 'Ссылка для входа устарела — откройте KU Message из портала ещё раз');
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, user);
      saveSession(token, user, req);
      return ok(res, { token, user: pubUser(user) });
    }

    if (p === '/api/version' && req.method === 'GET') {
      return ok(res, Object.assign({ storage: storage.info() }, VERSION)); // storage.mode: mysql | json
    }

    if (p === '/api/demo' && req.method === 'GET') {
      return ok(res, DEMO_ON
        ? { enabled: true, password: DEMO_PASS, accounts: DEMO_ACCOUNTS.map((x) => ({ role: x.role, email: x.email, fio: x.lastName + ' ' + x.firstName, program: x.program || 'ku', group: x.group || '', track: trackOf(Object.assign({}, x)) })) }
        : { enabled: false });
    }

    if (p === '/api/ai/status' && req.method === 'GET') {
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

    for (const handle of apiModules) if (await handle(p, req, res, u, body, url) !== false) return;

    if (p === '/api/message/handoff' && req.method === 'POST') {
      const now = Date.now();
      for (const [k, v] of handoffCodes) if (v.exp < now) handoffCodes.delete(k);
      const code = crypto.randomBytes(18).toString('hex');
      handoffCodes.set(code, { uid: u.id, exp: now + HANDOFF_CODE_MS });
      return ok(res, { code });
    }

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
      if (nx === cur) return bad(res, 400, 'Новый пароль совпадает с текущим');
      await sec.setPassword(u, nx);
      u.passChangedAt = Date.now();
      // выходим на всех остальных устройствах
      const me = reqToken(req);
      for (const [tok, uid] of Object.entries(db.sessions || {})) if (uid === u.id && tok !== me) dropSession(tok);
      saveDB();
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
      u.totp.enabled = true; codeFails.delete(u.id); saveDB();
      return ok(res, { twoFactor: true });
    }
    if (p === '/api/2fa/disable' && req.method === 'POST') {
      const pe = await passError(u, String(body.password || ''));
      if (pe) return bad(res, pe[0], pe[1] || 'Неверный пароль');
      delete u.totp; saveDB();
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

    /* ---------- Студент ---------- */
    if (p === '/api/student/dashboard' && u.role === 'student') {
      const rows = db.grades.filter((g) => g.studentId === u.id);
      const score = rows.length ? Math.round((rows.reduce((a, g) => a + Number(g.score || 0), 0) / rows.length) * 10) / 10 : null;
      return ok(res, { score, next: nextLesson(u.group), group: u.group });
    }

    if (p === '/api/schedule' && req.method === 'GET') {
      const rows = u.role === 'student'
        ? db.schedule.filter((s) => s.group === u.group)
        : db.schedule.filter((s) => s.teacherId === u.id);
      const items = rows.map((r) => ({
        id: r.id, day: r.day, dayName: WEEKDAYS[r.day], type: r.type,
        start: r.start, end: r.end, room: r.room,
        subject: subjName(r.subjectId), teacher: teacherFio(r.teacherId), group: r.group,
      })).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
      return ok(res, { items });
    }

    if (p === '/api/grades' && u.role === 'student') {
      const items = db.grades.filter((g) => g.studentId === u.id).map((g) => ({
        id: g.id, subject: subjName(g.subjectId), teacher: teacherFio(g.teacherId), score: g.score, date: g.date,
      }));
      return ok(res, { items, avg: avgOf(u.id) });
    }

    if (p === '/api/rating' && u.role === 'student') {
      const mates = db.users.filter((x) => x.role === 'student' && x.group === u.group);
      // «Показывать меня в рейтинге» выключено — одногруппники видят строку без имени; себя студент видит всегда
      const rows = mates.map((m) => {
        const hidden = m.id !== u.id && !settingsOf(m).showInRating;
        return { id: hidden ? 'hidden_' + crypto.createHash('sha1').update(m.id).digest('hex').slice(0, 8) : m.id, fio: hidden ? null : m.fio, hidden, online: !hidden && m.id !== u.id && isOnline(m), avg: avgOf(m.id) };
      }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
      const self = rows.find((r) => r.id === u.id);
      return ok(res, { group: u.group, selfPos: self ? rows.indexOf(self) + 1 : null, selfAvg: self ? self.avg : null, rows });
    }

    /* ---------- Преподаватель ---------- */
    if (p === '/api/teacher/subjects' && req.method === 'GET' && u.role === 'teacher') {
      return ok(res, { items: db.subjects.filter((s) => s.teacherId === u.id) });
    }
    if (p === '/api/teacher/subjects' && req.method === 'POST' && u.role === 'teacher') {
      const name = String(body.name || '').trim();
      if (name.length < 2) return bad(res, 400, 'Укажите название предмета');
      const s = { id: nid('sub'), name, teacherId: u.id, discipline: detectDiscipline(name) };
      db.subjects.push(s); saveDB();
      return ok(res, { id: s.id, name: s.name, discipline: s.discipline });
    }

    if (p === '/api/teacher/students' && req.method === 'GET' && u.role === 'teacher') {
      const g = String(url.searchParams.get('group') || '').trim();
      const items = db.users.filter((x) => x.role === 'student' && (!g || x.group === g))
        .map((x) => ({ id: x.id, fio: x.fio, group: x.group, online: isOnline(x) }));
      return ok(res, { items });
    }

    if (p === '/api/teacher/grades' && req.method === 'POST' && u.role === 'teacher') {
      const { studentId = '', subjectId = '', score = 0 } = body;
      const st = db.users.find((x) => x.id === studentId && x.role === 'student');
      const sub = db.subjects.find((x) => x.id === subjectId && x.teacherId === u.id);
      const sc = Number(score);
      if (!st) return bad(res, 400, 'Выберите студента');
      if (!sub) return bad(res, 400, 'Выберите свой предмет');
      if (!(sc >= 0 && sc <= 100)) return bad(res, 400, 'Балл — число от 0 до 100');
      const g = { id: nid('gr'), studentId, subjectId, teacherId: u.id, score: sc, date: new Date().toISOString().slice(0, 10) };
      db.grades.push(g);
      pushInbox(st, { type: 'grade', subject: sub.name, score: sc });
      saveDB();
      return ok(res, { id: g.id });
    }

    if (p === '/api/teacher/schedule' && req.method === 'POST' && u.role === 'teacher') {
      const { subjectId = '', type = 'Практ.', group = '', day = 0, startTime = '', endTime = '', room = '' } = body;
      const sub = db.subjects.find((s) => s.id === subjectId && s.teacherId === u.id);
      if (!sub) return bad(res, 400, 'Выберите свой предмет');
      if (!String(group).trim()) return bad(res, 400, 'Укажите группу');
      if (!/^\d{2}:\d{2}$/.test(String(startTime)) || !/^\d{2}:\d{2}$/.test(String(endTime))) return bad(res, 400, 'Укажите время (ЧЧ:ММ)');
      const e = {
        id: nid('sc'), subjectId, teacherId: u.id, type: String(type || 'Практ.'),
        group: String(group).trim(), day: Math.max(0, Math.min(6, Number(day))),
        start: String(startTime), end: String(endTime), room: String(room || '').trim(),
      };
      db.schedule.push(e);
      db.users.filter((x) => x.role === 'student' && x.group === e.group)
        .forEach((x) => pushInbox(x, { type: 'schedule', subject: sub.name, day: e.day, start: e.start, end: e.end, room: e.room, lessonType: e.type }));
      saveDB();
      return ok(res, { id: e.id });
    }

    if (p === '/api/ai/status' && req.method === 'GET') {
      return ok(res, await ai.aiStatus());
    }

    return bad(res, 404, 'Не найдено');
  } catch (e) {
    console.error('[API]', req.method, p, e);
    return bad(res, 500, 'Внутренняя ошибка'); // подробности — только в журнале сервера
  }
});

/* -------------------------------- Старт ---------------------------------- */

async function main() {
  try { storage = await openStorage({ dataDir: DATA, emptyPortal: emptyDB }); } catch (e) { console.error('[DB]', e.message); process.exit(1); }
  db = storage.portal.load();
  examSync = require('./exam-sync/handler').createExamSync({ base: '/exam-sync', dataFile: path.join(DATA, 'exam-sync.json'), store: storage.exam });
  seedDemo();
  loadSessions();
  server.listen(PORT, HOST, () => console.log(`KU Portal: http://${HOST || 'localhost'}:${PORT} · база: ${storage.mode}`));
}
main();

/* Завершение: сохранить базу и дождаться записи в MySQL (не дольше SHUTDOWN_MS), затем выйти — хостинг запустит заново */
const SHUTDOWN_MS = 8000;
let stopping = false;
async function shutdown(code, why) {
  if (stopping) return;
  stopping = true;
  console.log('[server] завершение:', why);
  try {
    if (storage && db) saveDB();
    if (storage) await Promise.race([storage.close(), new Promise((r) => setTimeout(r, SHUTDOWN_MS))]);
  } catch (e) { console.error('[server] сохранение при завершении:', e.message); }
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
process.on('SIGINT', () => shutdown(0, 'SIGINT'));
process.on('unhandledRejection', (e) => console.error('[server] необработанная ошибка (promise):', e));
process.on('uncaughtException', (e) => { console.error('[server] критическая ошибка:', e); shutdown(1, 'uncaughtException'); });

/* Перезапуск после обновления кода: deploy/alwaysdata-update.sh обновляет файл .restart рядом с server.js.
   Сервер сохраняет базу и завершается, хостинг (alwaysdata) запускает его заново уже с новым кодом.
   Пока файл не трогают, ничего не происходит. */
const RESTART_FILE = path.join(ROOT, '.restart');
fs.watchFile(RESTART_FILE, { interval: 5000 }, (cur, prev) => {
  if (!cur.mtimeMs || cur.mtimeMs === prev.mtimeMs) return;
  shutdown(0, 'найден .restart — перезапуск после обновления');
}).unref();
