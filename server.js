/*
 * KU Portal — сервер без внешних зависимостей (Node.js >= 18).
 * Аутентификация, оценки, расписание, очередь на зачёт, AI-помощник.
 * AI: локальная модель через Ollama + контекст с сайта https://ku.edu.kz/ru/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const CTX_FILE = path.join(DATA, 'ku_context.json');

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

/* ---------------------------------- DB ---------------------------------- */

let db = null;
function loadDB() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    db = { users: [], subjects: [], schedule: [], grades: [], examSessions: [], queue: [], seq: {} };
    saveDB();
  }
  migrateQueue();
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));
}
function nid(prefix) {
  db.seq = db.seq || {};
  db.seq[prefix] = (db.seq[prefix] || 0) + 1;
  return prefix + '_' + db.seq[prefix];
}

/* -------------------------------- helpers -------------------------------- */

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function bad(res, code, msg) { send(res, code, { error: msg }); }
function ok(res, obj) { send(res, 200, obj || { ok: true }); }

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function hash(pw, salt) { return crypto.createHash('sha256').update(salt + pw).digest('hex'); }

const sessions = new Map(); // token -> user
function loadSessions() {
  if (!db.sessions) return;
  for (const [tok, uid] of Object.entries(db.sessions)) {
    const user = db.users.find((x) => x.id === uid);
    if (user) sessions.set(tok, user);
  }
}
function saveSession(token, user) {
  db.sessions = db.sessions || {};
  db.sessions[token] = user.id;
  saveDB();
}
function dropSession(token) {
  if (db.sessions) { delete db.sessions[token]; saveDB(); }
}
function userOf(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return sessions.get(t) || null;
}
function pubUser(u) {
  if (!u) return null;
  return { id: u.id, role: u.role, fio: u.fio, firstName: u.firstName, email: u.email, group: u.group || '' };
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
        room: r.room, teacher: teacherFio(r.teacherId),
      };
    }
  }
  return null;
}

/* ================= Электронная очередь: комнаты для спикинга ================= */
/*
 * Модель:
 *   examSession (= «комната») — { id, teacherId, subjectId, discipline, level, title, room, date, time,
 *                                 group, status: open|paused|closed, slotMin, capacity, rev, createdAt }
 *   queue entry                — { id, sessionId, studentId, ts, ord, status, calledAt, ackAt, startedAt,
 *                                 extraSec, doneAt, score, comment, soonPos }
 *   Таймер ответа: startedAt (кнопка «Начать») + лимит = slotMin*60 + extraSec; за warnSec до конца —
 *   предупреждение, после лимита — «пора выставлять оценку». Клиент считает время с поправкой на serverNow.
 *   Жизненный цикл записи: waiting → called → done | absent;  waiting → left (сам вышел);
 *                          absent/called → waiting (вернуть в очередь);  * → removed | cancelled (комната закрыта).
 * Порядок в очереди — по полю ord (по умолчанию = ts записи), что позволяет «вернуть в начало».
 */
const DISCIPLINES = [
  { id: 'english', name: 'Английский язык', short: 'Английский', re: /англ|english/i },
  { id: 'math', name: 'Высшая математика', short: 'Высшая математика', re: /матем|math/i },
  { id: 'politology', name: 'Политология', short: 'Политология', re: /полит/i },
  { id: 'ecology', name: 'Экология', short: 'Экология', re: /эколог/i },
  { id: 'economics', name: 'Экономика', short: 'Экономика', re: /эконом/i },
  { id: 'it', name: 'Введение в информационные технологии', short: 'Введение в ИТ', re: /информац|(^|[^а-яё])ит([^а-яё]|$)|\bit\b/i },
];
const DISC_OTHER = { id: 'other', name: 'Другие предметы', short: 'Другое' };
const DISC_IDS = new Set(DISCIPLINES.map((d) => d.id));

/* Серьёзность комнаты. Для английского дополнительно показывается уровень CEFR. */
const LEVELS = [
  { id: 1, name: 'Лёгкая', cefr: 'A2', hint: 'Разминка: базовые вопросы, можно подсказки' },
  { id: 2, name: 'Средняя', cefr: 'B1', hint: 'Стандартный формат, уточняющие вопросы' },
  { id: 3, name: 'Сложная', cefr: 'B2', hint: 'Развёрнутые ответы, дискуссия, без подсказок' },
  { id: 4, name: 'Экзаменационная', cefr: 'C1', hint: 'Строгий экзаменационный формат, оценка в ведомость' },
];
const ACTIVE = new Set(['waiting', 'called']);
const ROOM_STATUSES = new Set(['open', 'paused', 'closed']);

function detectDiscipline(name) {
  const d = DISCIPLINES.find((x) => x.re.test(String(name || '')));
  return d ? d.id : 'other';
}
function discName(id) { const d = DISCIPLINES.find((x) => x.id === id); return d ? d.name : DISC_OTHER.name; }
function clampInt(v, lo, hi, def) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
}

/* Приводим старые записи (до появления комнат) к новой схеме — без потери данных */
function migrateQueue() {
  let changed = false;
  for (const s of db.examSessions) {
    if (!s.discipline) { s.discipline = detectDiscipline(subjName(s.subjectId)); changed = true; }
    if (!s.level) { s.level = 2; changed = true; }
    if (!s.status) { s.status = 'open'; changed = true; }
    if (!s.slotMin) { s.slotMin = 7; changed = true; }
    if (s.capacity == null) { s.capacity = 0; changed = true; }
    if (s.title == null) { s.title = ''; changed = true; }
    if (!s.rev) { s.rev = 1; changed = true; }
    if (s.warnSec == null) { s.warnSec = 60; changed = true; }
  }
  if (changed) saveDB();
}

const qkey = (e) => (e.ord != null ? e.ord : e.ts);
function entriesOf(sid, status) {
  return db.queue.filter((q) => q.sessionId === sid && (!status || q.status === status));
}
function waitingOf(sid) { return entriesOf(sid, 'waiting').sort((a, b) => qkey(a) - qkey(b)); }
function calledOf(sid) { return entriesOf(sid, 'called').sort((a, b) => a.calledAt - b.calledAt); }

/* Средняя длительность ответа: по последним 8 принятым, иначе — норматив комнаты */
/* Длительность ответа: от «Начать» (или от вызова, если таймер не запускали) до приёма */
function answerMs(q) {
  const from = q.startedAt || q.calledAt;
  return from && q.doneAt && q.doneAt > from ? q.doneAt - from : 0;
}
function limitSec(s, e) { return (s.slotMin || 7) * 60 + ((e && e.extraSec) || 0); }
function avgSlotMs(s) {
  const done = entriesOf(s.id, 'done').filter((q) => answerMs(q) > 0)
    .sort((a, b) => a.doneAt - b.doneAt).slice(-8);
  if (done.length >= 2) return done.reduce((a, q) => a + answerMs(q), 0) / done.length;
  return (s.slotMin || 7) * 60000;
}
/* Примерное ожидание для позиции pos (1-based) */
function etaMin(s, pos) {
  if (!pos) return null;
  return Math.max(1, Math.round((avgSlotMs(s) * pos) / 60000));
}
function canSee(s, u) { return u.role === 'teacher' ? s.teacherId === u.id : (!s.group || s.group === u.group); }

function roomPublic(s) {
  return {
    id: s.id, discipline: s.discipline, disciplineName: discName(s.discipline),
    level: s.level, title: s.title || '', subject: subjName(s.subjectId), teacher: teacherFio(s.teacherId),
    date: s.date, time: s.time, room: s.room, group: s.group, status: s.status,
    slotMin: s.slotMin, warnSec: s.warnSec != null ? s.warnSec : 60, capacity: s.capacity || 0, rev: s.rev || 1,
    waiting: entriesOf(s.id, 'waiting').length, called: entriesOf(s.id, 'called').length,
    done: entriesOf(s.id, 'done').length,
  };
}
function myEntryView(s, e) {
  if (!e) return null;
  const w = waitingOf(s.id);
  const pos = e.status === 'waiting' ? w.indexOf(e) + 1 : 0;
  return {
    id: e.id, status: e.status, pos, ts: e.ts, calledAt: e.calledAt || null, ackAt: e.ackAt || null,
    startedAt: e.startedAt || null, limitSec: limitSec(s, e),
    etaMin: e.status === 'waiting' ? etaMin(s, pos) : 0,
  };
}
function studentActive(uid) {
  return db.queue.filter((q) => q.studentId === uid && ACTIVE.has(q.status));
}
function roomSort(a, b) {
  const st = { open: 0, paused: 1, closed: 2 };
  return (st[a.status] - st[b.status]) || String(a.date).localeCompare(String(b.date)) ||
    String(a.time).localeCompare(String(b.time)) || a.level - b.level;
}

/*
 * Точка расширения раздела «Электронная очередь» (см. AGENTS.md, раздел «Модули очереди»).
 * Сюда подключаются серверные обработчики будущих модулей: пробные тесты, задания по грамматике
 * и вокабуляру, редактор заданий преподавателя. Обработчик: async (ctx) => boolean — вернуть true,
 * если запрос обработан. Пока массив пуст, поведение сервера не меняется.
 */
const QUEUE_MODULE_ROUTES = [];

/* ------------------- Live-обновления: Server-Sent Events -------------------- */
/*
 * EventSource не умеет слать заголовок Authorization, поэтому клиент сначала получает
 * одноразовый ticket (живёт 60 с) по обычному авторизованному запросу и открывает
 * /api/events?ticket=... — постоянный токен не попадает в URL и логи прокси.
 * Сервер шлёт только «сигналы» (что изменилось), данные клиент перезапрашивает сам —
 * так в поток не утекает чужая информация, а права проверяются одной логикой API.
 */
const sseClients = new Set(); // { res, user }
const sseTickets = new Map(); // ticket -> { uid, exp }
function sseWrite(c, payload) {
  try { c.res.write('data: ' + JSON.stringify(payload) + '\n\n'); } catch { sseClients.delete(c); }
}
function notifyRoom(s, reason) {
  s.rev = (s.rev || 1) + 1;
  const payload = { type: 'room', sessionId: s.id, discipline: s.discipline, rev: s.rev, reason: reason || 'update' };
  for (const c of sseClients) if (canSee(s, c.user)) sseWrite(c, payload);
  notifySoon(s);
}
/* «Скоро ваша очередь»: когда студент стал 2-м, и ещё раз — когда стал следующим (1-м) */
function notifySoon(s) {
  if (s.status === 'closed') return;
  waitingOf(s.id).slice(0, 2).forEach((e, i) => {
    const pos = i + 1;
    if (e.soonPos && e.soonPos <= pos) return; // об этой (или лучшей) позиции уже сообщили
    e.soonPos = pos;
    notifyUser(e.studentId, { type: 'soon', sessionId: s.id, entryId: e.id, pos, room: s.room, discipline: discName(s.discipline) });
  });
}
function notifyUser(uid, payload) {
  for (const c of sseClients) if (c.user.id === uid) sseWrite(c, payload);
}
setInterval(() => {
  for (const c of sseClients) { try { c.res.write(': ping\n\n'); } catch { sseClients.delete(c); } }
  const now = Date.now();
  for (const [t, v] of sseTickets) if (v.exp < now) sseTickets.delete(t);
}, 25000).unref();

function openSSE(req, res, url) {
  const t = String(url.searchParams.get('ticket') || '');
  const rec = sseTickets.get(t);
  sseTickets.delete(t); // одноразовый
  const user = rec && rec.exp > Date.now() ? db.users.find((x) => x.id === rec.uid) : null;
  if (!user) return bad(res, 401, 'Недействительный ticket');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const c = { res, user };
  sseClients.add(c);
  sseWrite(c, { type: 'hello', at: Date.now() });
  req.on('close', () => sseClients.delete(c));
}

/* Общая проверка: запись очереди принадлежит комнате этого преподавателя */
function teacherEntry(id, u) {
  const e = db.queue.find((x) => x.id === id);
  if (!e) return { err: [404, 'Запись не найдена'] };
  const s = db.examSessions.find((x) => x.id === e.sessionId && x.teacherId === u.id);
  if (!s) return { err: [403, 'Нет доступа'] };
  return { e, s };
}
function callEntry(s, e) {
  e.status = 'called'; e.calledAt = Date.now(); e.ackAt = null; e.startedAt = null; e.extraSec = 0;
  notifyRoom(s, 'called');
  notifyUser(e.studentId, {
    type: 'called', sessionId: s.id, entryId: e.id, disciplineId: s.discipline,
    discipline: discName(s.discipline), subject: subjName(s.subjectId), title: s.title || '',
    room: s.room, level: s.level, teacher: teacherFio(s.teacherId),
  });
}
/* Найти/создать предмет преподавателя для дисциплины — чтобы оценки за спикинг шли в успеваемость */
function subjectForDiscipline(u, disc) {
  const name = discName(disc);
  let sub = db.subjects.find((x) => x.teacherId === u.id && (x.discipline === disc || x.name.toLowerCase() === name.toLowerCase()));
  if (!sub) { sub = { id: nid('sub'), name, teacherId: u.id, discipline: disc }; db.subjects.push(sub); }
  return sub;
}

/* ------------------------------ Демо-данные ------------------------------ */
/*
 * Тестовые аккаунты создаются при старте, если их ещё нет (идемпотентно).
 * Отключить: DEMO=0. На бесплатном Render база сбрасывается при рестарте —
 * демо-данные просто создаются заново.
 */
const DEMO_ON = process.env.DEMO !== '0';
const DEMO_PASS = '1234';
const DEMO_GROUP = 'ИСУ-26-2-а';
const DEMO_ACCOUNTS = [
  { role: 'teacher', email: 'teacher@demo.kz', lastName: 'Ахметова', firstName: 'Айгерим', middleName: 'Сериковна' },
  { role: 'student', email: 'student@demo.kz', lastName: 'Иванов', firstName: 'Данияр', middleName: '', group: DEMO_GROUP },
  { role: 'student', email: 'student2@demo.kz', lastName: 'Каримова', firstName: 'Алина', middleName: '', group: DEMO_GROUP },
];
function seedDemo() {
  if (!DEMO_ON || db.users.some((x) => x.email === DEMO_ACCOUNTS[0].email)) return;
  const made = {};
  for (const a of DEMO_ACCOUNTS) {
    const salt = crypto.randomBytes(8).toString('hex');
    const u = {
      id: nid(a.role === 'teacher' ? 'tch' : 'std'), role: a.role,
      fio: [a.lastName, a.firstName, a.middleName].filter(Boolean).join(' '), firstName: a.firstName,
      email: a.email, salt, passHash: hash(DEMO_PASS, salt), group: a.group || '', createdAt: Date.now(), demo: true,
    };
    db.users.push(u);
    made[a.email] = u;
  }
  const t = made['teacher@demo.kz'];
  const sub = (disc) => subjectForDiscipline(t, disc);
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const room = (disc, level, title, roomNo, time) => {
    const s = {
      id: nid('ex'), subjectId: sub(disc).id, teacherId: t.id, discipline: disc, level, title,
      date: ymd, time, room: roomNo, group: '', status: 'open', slotMin: 7, capacity: 0, rev: 1, createdAt: Date.now(), demo: true,
    };
    db.examSessions.push(s);
    return s;
  };
  const en3 = room('english', 3, 'Speaking: Travel and Tourism', '301', '10:00');
  room('english', 1, 'Speaking: About Myself', '305', '11:30');
  room('math', 2, 'Защита РГР: пределы и производные', '214', '13:00');
  room('politology', 4, 'Итоговый коллоквиум', '118', '14:30');
  // Вторая студентка уже стоит в очереди — преподавателю есть кого вызвать сразу
  const now = Date.now();
  db.queue.push({ id: nid('q'), sessionId: en3.id, studentId: made['student2@demo.kz'].id, ts: now, ord: now, status: 'waiting' });
  // Немного расписания и оценок, чтобы виджеты на главной не были пустыми
  const lessons = [
    ['english', 'Практ.', 0, '08:30', '09:50', '301'], ['math', 'Лек.', 0, '10:00', '11:20', '214'],
    ['politology', 'Лек.', 2, '11:30', '12:50', '118'], ['english', 'Практ.', 3, '08:30', '09:50', '301'],
    ['math', 'Практ.', 4, '10:00', '11:20', '214'],
  ];
  for (const [disc, type, day, start, end, rm] of lessons) {
    db.schedule.push({ id: nid('sc'), subjectId: sub(disc).id, teacherId: t.id, type, group: DEMO_GROUP, day, start, end, room: rm });
  }
  const g = (email, disc, score) => db.grades.push({ id: nid('gr'), studentId: made[email].id, subjectId: sub(disc).id, teacherId: t.id, score, date: ymd });
  g('student@demo.kz', 'english', 88); g('student@demo.kz', 'math', 76); g('student@demo.kz', 'politology', 91);
  g('student2@demo.kz', 'english', 94); g('student2@demo.kz', 'math', 82);
  saveDB();
  console.log(`[DEMO] Созданы тестовые аккаунты (пароль ${DEMO_PASS}): ${DEMO_ACCOUNTS.map((a) => a.email).join(', ')}`);
}

/* ------------------------- Контекст с сайта KU ---------------------------- */

const kuCtx = { chunks: [], updated: 0 };

function htmlToText(html, url) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const title = ((s.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|td|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&apos;/gi, "'").replace(/&mdash;/gi, '—')
    .replace(/&laquo;/gi, '«').replace(/&raquo;/gi, '»').replace(/&hellip;/gi, '…')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  const lines = s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 30 && /[а-яёa-z]/i.test(l));
  return { title, text: lines.join('\n'), url };
}

function chunkify(page) {
  const chunks = [];
  let buf = '';
  for (const line of page.text.split('\n')) {
    buf += (buf ? ' ' : '') + line;
    if (buf.length >= 650) { chunks.push({ text: buf.trim().slice(0, 900), url: page.url, title: page.title }); buf = ''; }
  }
  if (buf.trim().length > 120) chunks.push({ text: buf.trim(), url: page.url, title: page.title });
  return chunks;
}

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (KUPortal/1.0)', 'Accept-Language': 'ru,en;q=0.8' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}

async function refreshKUCtx() {
  const start = 'https://ku.edu.kz/ru/';
  const seen = new Set();
  const pages = [];
  let queue = [start];
  try {
    while (queue.length && pages.length < 12) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      let html;
      try { html = await fetchPage(url); } catch { continue; }
      const page = htmlToText(html, url);
      if (page.text.length > 400) pages.push(page);
      // Ссылки для одного уровня обхода
      if (url === start) {
        const re = /href="(https?:\/\/ku\.edu\.kz\/[^"#]+|\/ru\/[^"#]+)"/gi;
        const interesting = /(ob-univers|o-vuz|about|fakult|institut|kafedr|priem|postupl|abitur|raspisan|kontakt|sveden|obshchezh|steenendir|obuch|student)/i;
        let m;
        while ((m = re.exec(html))) {
          let link = m[1];
          if (link.startsWith('/')) link = 'https://ku.edu.kz' + link;
          link = link.split('?')[0];
          if (!seen.has(link) && interesting.test(link) && pages.length + queue.length < 12) queue.push(link);
        }
      }
    }
    const chunks = [];
    for (const p of pages) chunks.push(...chunkify(p));
    if (chunks.length) {
      kuCtx.chunks = chunks.slice(0, 80);
      kuCtx.updated = Date.now();
      fs.writeFileSync(CTX_FILE, JSON.stringify(kuCtx));
      console.log(`[AI] Контекст сайта ku.edu.kz обновлён: ${pages.length} стр., ${chunks.length} фрагментов`);
    }
  } catch (e) {
    console.log('[AI] Не удалось обновить контекст сайта:', e.message);
  }
}

function loadCtxCache() {
  try {
    const j = JSON.parse(fs.readFileSync(CTX_FILE, 'utf8'));
    if (j.chunks && j.chunks.length) { kuCtx.chunks = j.chunks; kuCtx.updated = j.updated || 0; }
  } catch { /* нет кэша */ }
}

/* ------------------------------- Ollama/AI ------------------------------- */

const OLLAMA = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
let chosenModel = (process.env.OLLAMA_MODEL || 'qwen2.5:1.5b');

async function pickModel() {
  try {
    const r = await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    const names = (j.models || []).map((m) => m.name || m.model);
    if (!names.length) return null;
    if (names.includes(chosenModel)) return chosenModel;
    for (const cand of ['qwen2.5:1.5b', 'qwen2.5:0.5b', 'qwen3:0.6b', 'llama3.2:1b', 'gemma2:2b', 'tinyllama', 'phi3:mini']) {
      const hit = names.find((n) => n.startsWith(cand));
      if (hit) return (chosenModel = hit);
    }
    return (chosenModel = names[0]);
  } catch { return null; }
}

const STOP = new Set(['это', 'как', 'что', 'для', 'если', 'можно', 'есть', 'мне', 'нужно', 'пожалуйста', "спасибо", 'какой', 'какая', 'вузе', 'университета', 'скажите', 'хочу', 'знать', 'куда', 'когда']);
function keywords(q) {
  return q.toLowerCase().split(/[^a-zа-яё0-9]+/i).filter((w) => w.length >= 4 && !STOP.has(w));
}
function relevantChunks(q, n = 3) {
  const ws = keywords(q);
  const scored = kuCtx.chunks.map((c) => {
    const t = c.text.toLowerCase();
    return { c, s: ws.reduce((a, w) => a + (t.split(w).length - 1), 0) };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, n).filter((x) => x.s > 0).map((x) => x.c);
}
function relevantSentences(q, n = 3) {
  const ws = keywords(q);
  if (!ws.length) return [];
  const out = [];
  for (const c of relevantChunks(q, 3)) {
    for (const sn of c.text.split(/(?<=[.!?…])\s+/)) {
      if (sn.length < 40) continue;
      const t = sn.toLowerCase();
      const s = ws.reduce((a, w) => a + (t.split(w).length - 1), 0);
      if (s > 0) out.push({ sn, s });
    }
  }
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, n).map((x) => x.sn);
}

async function ollamaChat(messages) {
  const model = await pickModel();
  if (!model) throw new Error('ollama-unavailable');
  const r = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.3, num_ctx: 4096 },
    }),
  });
  if (!r.ok) throw new Error('ollama http ' + r.status);
  const j = await r.json();
  const text = (j.message && j.message.content || '').trim();
  if (!text) throw new Error('empty');
  return { text, model };
}

async function aiReply(q, history) {
  const ctx = relevantChunks(q).map((c) => c.text).join('\n---\n');
  const system =
    'Ты — AI-помощник портала Kozybayev University (KU), г. Костанай, Казахстан. ' +
    'Отвечай кратко и дружелюбно на русском языке (если вопрос на другом языке — на языке вопроса). ' +
    'Опирайся ТОЛЬКО на справочный контекст ниже, собранный с официального сайта ku.edu.kz. ' +
    'Если ответа в контексте нет — честно скажи, что такой информации нет на сайте, и предложи обратиться в приёмную комиссию или деканат. ' +
    'Не выдумывай телефоны, даты и названия. Отвечай не длиннее 5 предложений.' +
    (kuCtx.chunks.length
      ? '\n\n### Контекст с сайта ku.edu.kz:\n' + ctx.slice(0, 16000)
      : '\n\n(Контекст сайта временно недоступен.)');

  const messages = [{ role: 'system', content: system }];
  for (const m of (history || []).slice(-8)) {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
      messages.push({ role: m.role, content: m.content.slice(0, 1500) });
    }
  }
  messages.push({ role: 'user', content: q });

  try {
    const { text, model } = await ollamaChat(messages);
    return { reply: text, src: 'llm:' + model };
  } catch (e) {
    // ---- Фолбэк без модели: извлекаем фразы с сайта ----
    const hello = /^(привет|салам|здравств|добрый|hello|hi|сәлем)/i.test(q);
    if (hello) return { reply: 'Здравствуйте! Я AI-помощник Kozybayev University. Спрашивайте о вузе: поступление, расписание, общежитие и т.д.', src: 'fallback' };
    const sents = relevantSentences(q);
    if (sents.length) {
      return { reply: 'Нашёл на сайте ku.edu.kz:\n\n' + sents.join(' '), src: 'retrieval' };
    }
    if (kuCtx.chunks.length) {
      return { reply: 'К сожалению, на сайте ku.edu.kz я не нашёл ответа на этот вопрос. Попробуйте уточнить вопрос или обратитесь в приёмную комиссию / деканат.', src: 'retrieval-empty' };
    }
    throw e;
  }
}

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
function serveStatic(req, res, url) {
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  p = path.normalize(p).replace(/^([.][.][\/\\])+/, '');
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (!p.startsWith('/api/')) return serveStatic(req, res, url);

  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
  const u = userOf(req);

  try {
    /* ---------- Аутентификация ---------- */
    if (p === '/api/auth/register' && req.method === 'POST') {
      const { lastName = '', firstName = '', middleName = '', email = '', password = '', role = 'student', group = '' } = body;
      if (!lastName.trim() || !firstName.trim()) return bad(res, 400, 'Укажите фамилию и имя');
      if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 400, 'Некорректный email');
      if (String(password).length < 4) return bad(res, 400, 'Пароль — минимум 4 символа');
      if (!['student', 'teacher'].includes(role)) return bad(res, 400, 'Выберите роль');
      if (role === 'student' && !String(group).trim()) return bad(res, 400, 'Укажите группу');
      const em = String(email).trim().toLowerCase();
      if (db.users.some((x) => x.email === em)) return bad(res, 400, 'Такой email уже зарегистрирован');
      const fio = [lastName, firstName, middleName].filter(Boolean).map((s) => String(s).trim()).join(' ');
      const salt = crypto.randomBytes(8).toString('hex');
      const user = {
        id: nid(role === 'teacher' ? 'tch' : 'std'),
        role, fio, firstName: String(firstName).trim(), email: em,
        salt, passHash: hash(String(password), salt),
        group: role === 'student' ? String(group).trim() : '',
        createdAt: Date.now(),
      };
      db.users.push(user); saveDB();
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, user);
      saveSession(token, user);
      return ok(res, { token, user: pubUser(user) });
    }

    if (p === '/api/auth/login' && req.method === 'POST') {
      const { email = '', password = '' } = body;
      const user = db.users.find((x) => x.email === String(email).trim().toLowerCase());
      if (!user || user.passHash !== hash(String(password), user.salt)) return bad(res, 401, 'Неверный email или пароль');
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, user);
      saveSession(token, user);
      return ok(res, { token, user: pubUser(user) });
    }

    if (p === '/api/me' && req.method === 'GET') {
      if (!u) return bad(res, 401, 'Не авторизован');
      return ok(res, { user: pubUser(u) });
    }

    if (p === '/api/auth/logout' && req.method === 'POST') {
      const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      sessions.delete(t);
      dropSession(t);
      return ok(res);
    }

    if (p === '/api/demo' && req.method === 'GET') {
      return ok(res, DEMO_ON
        ? { enabled: true, password: DEMO_PASS, accounts: DEMO_ACCOUNTS.map((x) => ({ role: x.role, email: x.email, fio: x.lastName + ' ' + x.firstName })) }
        : { enabled: false });
    }

    if (p === '/api/ai/status' && req.method === 'GET') {
      const model = await pickModel();
      return ok(res, { model, online: !!model, ctx: kuCtx.chunks.length, ctxUpdated: kuCtx.updated });
    }

    if (p === '/api/events' && req.method === 'GET') return openSSE(req, res, url);

    if (!u) return bad(res, 401, 'Не авторизован');

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
      const rows = mates.map((m) => ({ id: m.id, fio: m.fio, avg: avgOf(m.id) }))
        .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
      const self = rows.find((r) => r.id === u.id);
      return ok(res, { group: u.group, selfPos: self ? rows.indexOf(self) + 1 : null, selfAvg: self ? self.avg : null, rows });
    }

    /* ---------- Электронная очередь: общее ---------- */
    if (p === '/api/queue/meta' && req.method === 'GET') {
      return ok(res, {
        disciplines: DISCIPLINES.map((d) => ({ id: d.id, name: d.name, short: d.short })),
        other: { id: DISC_OTHER.id, name: DISC_OTHER.name, short: DISC_OTHER.short },
        levels: LEVELS,
      });
    }
    if (p === '/api/events/ticket' && req.method === 'POST') {
      const ticket = crypto.randomBytes(18).toString('hex');
      sseTickets.set(ticket, { uid: u.id, exp: Date.now() + 60000 });
      return ok(res, { ticket });
    }

    /* ---------- Электронная очередь: студент ---------- */
    if (p === '/api/exam/sessions' && req.method === 'GET' && u.role === 'student') {
      const fDisc = String(url.searchParams.get('discipline') || '');
      const fLevel = Number(url.searchParams.get('level') || 0);
      const visible = db.examSessions.filter((s) => canSee(s, u));
      // Счётчики для вкладок считаются по всем видимым комнатам, до фильтров
      const tabs = {};
      for (const s of visible) {
        const t = (tabs[s.discipline] = tabs[s.discipline] || { rooms: 0, open: 0 });
        if (s.status !== 'closed') t.rooms++;
        if (s.status === 'open') t.open++;
      }
      const items = visible
        .filter((s) => (!fDisc || s.discipline === fDisc) && (!fLevel || s.level === fLevel))
        .map((s) => {
          const e = db.queue.find((q) => q.sessionId === s.id && q.studentId === u.id && ACTIVE.has(q.status));
          const my = myEntryView(s, e);
          return Object.assign(roomPublic(s), {
            mine: my ? my.id : null, my,
            etaMin: s.status === 'open' ? etaMin(s, entriesOf(s.id, 'waiting').length + 1) : null,
          });
        })
        .sort(roomSort);
      const my = studentActive(u.id).map((e) => {
        const s = db.examSessions.find((x) => x.id === e.sessionId);
        return s ? Object.assign({ session: roomPublic(s) }, myEntryView(s, e)) : null;
      }).filter(Boolean);
      return ok(res, { items, tabs, my });
    }

    if (/^\/api\/exam\/sessions\/[\w-]+$/.test(p) && req.method === 'GET' && u.role === 'student') {
      const id = p.split('/').pop();
      const s = db.examSessions.find((x) => x.id === id);
      if (!s || !canSee(s, u)) return bad(res, 404, 'Комната не найдена');
      const waiting = waitingOf(s.id);
      const e = db.queue.find((q) => q.sessionId === s.id && q.studentId === u.id && ACTIVE.has(q.status));
      const fio = (q) => { const st = db.users.find((x) => x.id === q.studentId); return st ? st.fio : 'Студент'; };
      return ok(res, {
        session: roomPublic(s),
        waiting: waiting.length,
        myEntry: myEntryView(s, e),
        etaNew: etaMin(s, waiting.length + 1),
        serverNow: Date.now(),
        calledNow: calledOf(s.id).map((q) => ({ fio: fio(q), me: q.studentId === u.id, calledAt: q.calledAt, startedAt: q.startedAt || null })),
        queue: waiting.map((q, i) => ({ pos: i + 1, fio: fio(q), me: q.studentId === u.id, ts: q.ts })),
      });
    }

    if (/^\/api\/exam\/sessions\/[\w-]+\/join$/.test(p) && req.method === 'POST' && u.role === 'student') {
      const id = p.split('/')[4];
      const s = db.examSessions.find((x) => x.id === id);
      if (!s) return bad(res, 404, 'Комната не найдена');
      if (!canSee(s, u)) return bad(res, 403, 'Эта комната для другой группы');
      if (s.status === 'closed') return bad(res, 409, 'Комната закрыта');
      if (s.status === 'paused') return bad(res, 409, 'Преподаватель приостановил запись в эту комнату');
      if (db.queue.some((q) => q.sessionId === s.id && q.studentId === u.id && ACTIVE.has(q.status)))
        return bad(res, 409, 'Вы уже в этой очереди');
      // Не больше одной активной очереди на дисциплину: нельзя занять место во всех комнатах сразу
      const clash = studentActive(u.id).map((q) => db.examSessions.find((x) => x.id === q.sessionId))
        .find((x) => x && x.discipline === s.discipline);
      if (clash) {
        const lv = LEVELS.find((l) => l.id === clash.level);
        return bad(res, 409, `Вы уже стоите в очереди по предмету «${discName(s.discipline)}» (комната «${lv ? lv.name : ''}»${clash.room ? ', ауд. ' + clash.room : ''}). Сначала выйдите из неё.`);
      }
      if (s.capacity && entriesOf(s.id, 'waiting').length >= s.capacity)
        return bad(res, 409, `Очередь заполнена (лимит ${s.capacity})`);
      const now = Date.now();
      const entry = { id: nid('q'), sessionId: s.id, studentId: u.id, ts: now, ord: now, status: 'waiting' };
      // Встал сразу 1-м/2-м — он и так видит позицию, отдельное «скоро» об этой позиции не шлём
      const wl = entriesOf(s.id, 'waiting').length;
      if (wl < 2) entry.soonPos = wl + 1;
      db.queue.push(entry); saveDB();
      notifyRoom(s, 'join');
      const pos = waitingOf(s.id).indexOf(entry) + 1;
      return ok(res, { pos, entryId: entry.id, etaMin: etaMin(s, pos) });
    }

    if (p === '/api/exam/queue/leave' && req.method === 'POST' && u.role === 'student') {
      const entry = db.queue.find((q) => q.id === body.entryId && q.studentId === u.id && ACTIVE.has(q.status));
      if (!entry) return bad(res, 404, 'Запись не найдена');
      entry.status = 'left'; entry.leftAt = Date.now(); saveDB();
      const s = db.examSessions.find((x) => x.id === entry.sessionId);
      if (s) notifyRoom(s, 'leave');
      return ok(res);
    }

    if (/^\/api\/exam\/queue\/[\w-]+\/ack$/.test(p) && req.method === 'POST' && u.role === 'student') {
      const id = p.split('/')[4];
      const e = db.queue.find((q) => q.id === id && q.studentId === u.id && q.status === 'called');
      if (!e) return bad(res, 404, 'Вызов не найден');
      e.ackAt = Date.now(); saveDB();
      const s = db.examSessions.find((x) => x.id === e.sessionId);
      if (s) notifyRoom(s, 'ack');
      return ok(res);
    }

    /* История ответов студента: баллы и комментарии преподавателя */
    if (p === '/api/exam/my-results' && req.method === 'GET' && u.role === 'student') {
      const items = db.queue.filter((q) => q.studentId === u.id && ['done', 'absent'].includes(q.status))
        .map((q) => {
          const s = db.examSessions.find((x) => x.id === q.sessionId);
          if (!s) return null;
          return {
            id: q.id, status: q.status, discipline: s.discipline, disciplineName: discName(s.discipline), level: s.level,
            title: s.title || subjName(s.subjectId), teacher: teacherFio(s.teacherId), room: s.room,
            at: q.doneAt || q.absentAt || q.ts, durSec: Math.round(answerMs(q) / 1000) || null,
            score: q.score != null ? q.score : null, comment: q.comment || '',
          };
        }).filter(Boolean).sort((a, b) => b.at - a.at);
      const scored = items.filter((x) => x.score != null);
      return ok(res, { items, avg: scored.length ? Math.round((scored.reduce((a, x) => a + x.score, 0) / scored.length) * 10) / 10 : null });
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

    if (p === '/api/teacher/sessions' && req.method === 'GET' && u.role === 'teacher') {
      const items = db.examSessions.filter((s) => s.teacherId === u.id).map((s) => {
        const w = waitingOf(s.id);
        const c = calledOf(s.id);
        const fio = (q) => { const st = q && db.users.find((x) => x.id === q.studentId); return st ? st.fio : null; };
        return Object.assign(roomPublic(s), { now: fio(c[0]) || fio(w[0]), calledFio: fio(c[0]) });
      }).sort(roomSort);
      return ok(res, { items });
    }
    if (p === '/api/teacher/sessions' && req.method === 'POST' && u.role === 'teacher') {
      const { subjectId = '', room = '', group = '', title = '' } = body;
      let { date = '', time = '' } = body;
      let disc = String(body.discipline || '');
      let sub = subjectId ? db.subjects.find((s) => s.id === subjectId && s.teacherId === u.id) : null;
      if (subjectId && !sub) return bad(res, 400, 'Выберите свой предмет');
      if (!disc && sub) disc = sub.discipline || detectDiscipline(sub.name);
      if (!DISC_IDS.has(disc) && disc !== 'other') return bad(res, 400, 'Выберите предмет (вкладку)');
      if (!sub) sub = subjectForDiscipline(u, disc);
      const level = clampInt(body.level, 1, 4, 0);
      if (!level) return bad(res, 400, 'Выберите серьёзность комнаты');
      // Дата/время необязательны: по умолчанию — «сейчас» (типичный сценарий спикинга на паре)
      const now = new Date();
      if (!date) date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (!time) time = hhmm(now);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(res, 400, 'Некорректная дата');
      if (!/^\d{2}:\d{2}$/.test(String(time))) return bad(res, 400, 'Некорректное время');
      const s = {
        id: nid('ex'), subjectId: sub.id, teacherId: u.id, discipline: disc, level,
        title: String(title).trim().slice(0, 80), date, time,
        room: String(room || '').trim().slice(0, 40), group: String(group || '').trim().slice(0, 40),
        status: 'open', slotMin: clampInt(body.slotMin, 1, 60, 7), warnSec: clampInt(body.warnSec, 0, 600, 60),
        capacity: clampInt(body.capacity, 0, 500, 0),
        rev: 1, createdAt: Date.now(),
      };
      db.examSessions.push(s); saveDB();
      notifyRoom(s, 'created');
      return ok(res, { id: s.id });
    }

    /* Изменение комнаты на лету: серьёзность, статус (open/paused/closed), аудитория, лимиты */
    if (/^\/api\/teacher\/sessions\/[\w-]+$/.test(p) && req.method === 'PATCH' && u.role === 'teacher') {
      const id = p.split('/')[4];
      const s = db.examSessions.find((x) => x.id === id && x.teacherId === u.id);
      if (!s) return bad(res, 404, 'Комната не найдена');
      if (body.level != null) {
        const lv = clampInt(body.level, 1, 4, 0);
        if (!lv) return bad(res, 400, 'Некорректная серьёзность');
        s.level = lv;
      }
      if (body.status != null) {
        if (!ROOM_STATUSES.has(body.status)) return bad(res, 400, 'Некорректный статус');
        if (s.status === 'closed' && body.status !== 'closed') return bad(res, 409, 'Закрытую комнату нельзя открыть — создайте новую');
        s.status = body.status;
        if (s.status === 'closed') {
          for (const q of db.queue) {
            if (q.sessionId === s.id && ACTIVE.has(q.status)) {
              q.status = 'cancelled'; q.cancelledAt = Date.now();
              notifyUser(q.studentId, { type: 'cancelled', sessionId: s.id, entryId: q.id });
            }
          }
        }
      }
      if (body.room != null) s.room = String(body.room).trim().slice(0, 40);
      if (body.title != null) s.title = String(body.title).trim().slice(0, 80);
      if (body.slotMin != null) s.slotMin = clampInt(body.slotMin, 1, 60, s.slotMin);
      if (body.capacity != null) s.capacity = clampInt(body.capacity, 0, 500, s.capacity);
      if (body.warnSec != null) s.warnSec = clampInt(body.warnSec, 0, 600, s.warnSec);
      saveDB();
      notifyRoom(s, 'patch');
      return ok(res, { session: roomPublic(s) });
    }

    if (/^\/api\/teacher\/sessions\/[\w-]+\/queue$/.test(p) && req.method === 'GET' && u.role === 'teacher') {
      const id = p.split('/')[4];
      const s = db.examSessions.find((x) => x.id === id && x.teacherId === u.id);
      if (!s) return bad(res, 404, 'Комната не найдена');
      const row = (e, i) => {
        const st = db.users.find((x) => x.id === e.studentId);
        return {
          id: e.id, pos: i + 1, fio: st ? st.fio : 'Студент', group: st ? st.group : '', ts: e.ts,
          status: e.status, calledAt: e.calledAt || null, ackAt: e.ackAt || null, doneAt: e.doneAt || null,
          startedAt: e.startedAt || null, limitSec: limitSec(s, e), durSec: Math.round(answerMs(e) / 1000) || null,
          score: e.score != null ? e.score : null, comment: e.comment || '',
        };
      };
      const byTime = (k) => (a, b) => (b[k] || 0) - (a[k] || 0);
      return ok(res, {
        session: roomPublic(s),
        serverNow: Date.now(),
        stats: {
          avgMin: Math.round((avgSlotMs(s) / 60000) * 10) / 10,
          avgScore: (() => { const d = entriesOf(s.id, 'done').filter((q) => q.score != null); return d.length ? Math.round((d.reduce((a, q) => a + q.score, 0) / d.length) * 10) / 10 : null; })(),
        },
        called: calledOf(s.id).map(row),
        waiting: waitingOf(s.id).map(row),
        done: entriesOf(s.id, 'done').sort(byTime('doneAt')).map(row),
        absent: entriesOf(s.id, 'absent').sort(byTime('absentAt')).map(row),
      });
    }

    /* Ведомость комнаты в CSV (UTF-8 с BOM — корректно открывается в Excel) */
    if (/^\/api\/teacher\/sessions\/[\w-]+\/export\.csv$/.test(p) && req.method === 'GET' && u.role === 'teacher') {
      const id = p.split('/')[4];
      const s = db.examSessions.find((x) => x.id === id && x.teacherId === u.id);
      if (!s) return bad(res, 404, 'Комната не найдена');
      const ST = { waiting: 'В очереди', called: 'Вызван', done: 'Принят', absent: 'Не пришёл', left: 'Вышел сам', removed: 'Убран', cancelled: 'Отменён' };
      const t = (ms) => (ms ? new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
      const cell = (v) => {
        let x = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; // защита от CSV/formula injection
        return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
      };
      const rows = [['№', 'ФИО', 'Группа', 'Статус', 'Встал', 'Вызван', 'Начал', 'Закончил', 'Длительность, мин', 'Балл', 'Комментарий']];
      entriesOf(s.id).sort((a, b) => a.ts - b.ts).forEach((q, i) => {
        const st = db.users.find((x) => x.id === q.studentId);
        const ms = answerMs(q);
        rows.push([i + 1, st ? st.fio : '', st ? st.group : '', ST[q.status] || q.status, t(q.ts), t(q.calledAt), t(q.startedAt), t(q.doneAt),
          ms ? (ms / 60000).toFixed(1).replace('.', ',') : '', q.score != null ? q.score : '', q.comment || '']);
      });
      const csv = '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
      const fname = `vedomost-${s.discipline}-${s.date}-${s.id}.csv`;
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}"` });
      return res.end(csv);
    }

    if (/^\/api\/teacher\/sessions\/[\w-]+\/call-next$/.test(p) && req.method === 'POST' && u.role === 'teacher') {
      const id = p.split('/')[4];
      const s = db.examSessions.find((x) => x.id === id && x.teacherId === u.id);
      if (!s) return bad(res, 404, 'Комната не найдена');
      if (s.status === 'closed') return bad(res, 409, 'Комната закрыта');
      const e = waitingOf(s.id)[0];
      if (!e) return bad(res, 409, 'Очередь пуста');
      callEntry(s, e); saveDB();
      return ok(res, { entryId: e.id });
    }

    /* Действия над конкретной записью: call | start | extend | accept | absent | requeue | remove */
    const qm = /^\/api\/teacher\/queue\/([\w-]+)\/(call|start|extend|accept|absent|requeue|remove)$/.exec(p);
    if (qm && req.method === 'POST' && u.role === 'teacher') {
      const r = teacherEntry(qm[1], u);
      if (r.err) return bad(res, r.err[0], r.err[1]);
      const { e, s } = r;
      const act = qm[2];
      const now = Date.now();
      if (act === 'call') {
        if (e.status !== 'waiting') return bad(res, 409, 'Студент не в ожидании');
        if (s.status === 'closed') return bad(res, 409, 'Комната закрыта');
        callEntry(s, e);
      } else if (act === 'start') {
        // Запуск таймера ответа: студент дошёл и начал говорить
        if (e.status !== 'called') return bad(res, 409, 'Сначала вызовите студента');
        if (!e.startedAt) e.startedAt = now;
        notifyRoom(s, 'start');
        notifyUser(e.studentId, { type: 'started', sessionId: s.id, entryId: e.id, limitSec: limitSec(s, e) });
      } else if (act === 'extend') {
        if (e.status !== 'called') return bad(res, 409, 'Продлить можно только текущий ответ');
        const add = clampInt(body.sec, 15, 600, 60);
        e.extraSec = Math.min(1800, (e.extraSec || 0) + add);
        notifyRoom(s, 'extend');
      } else if (act === 'accept') {
        if (!ACTIVE.has(e.status)) return bad(res, 409, 'Студент уже не в очереди');
        let sc = null;
        if (body.score !== undefined && body.score !== null && body.score !== '') {
          sc = Number(body.score);
          if (!(sc >= 0 && sc <= 100)) return bad(res, 400, 'Балл — число от 0 до 100');
        }
        if (!e.calledAt) e.calledAt = now; // принят сразу из ожидания (старый сценарий)
        e.status = 'done'; e.doneAt = now;
        const comment = String(body.comment || '').trim().slice(0, 300);
        if (comment) e.comment = comment;
        if (sc != null) {
          e.score = sc;
          db.grades.push({ id: nid('gr'), studentId: e.studentId, subjectId: s.subjectId, teacherId: u.id, score: sc, date: new Date().toISOString().slice(0, 10), source: 'speaking:' + s.id });
        }
        notifyRoom(s, 'done');
        notifyUser(e.studentId, { type: 'done', sessionId: s.id, entryId: e.id, score: sc, comment: e.comment || '' });
      } else if (act === 'absent') {
        if (!ACTIVE.has(e.status)) return bad(res, 409, 'Студент уже не в очереди');
        e.status = 'absent'; e.absentAt = now;
        notifyRoom(s, 'absent');
        notifyUser(e.studentId, { type: 'absent', sessionId: s.id, entryId: e.id });
      } else if (act === 'requeue') {
        if (!['called', 'absent'].includes(e.status)) return bad(res, 409, 'Вернуть можно только вызванного или отсутствующего');
        if (s.status === 'closed') return bad(res, 409, 'Комната закрыта');
        // front=true — в начало очереди (например, студент вышел на минуту), иначе — в конец
        const w = waitingOf(s.id);
        e.ord = body.front && w.length ? qkey(w[0]) - 1 : now;
        e.status = 'waiting'; e.calledAt = null; e.ackAt = null; e.absentAt = null; e.startedAt = null; e.extraSec = 0; e.soonPos = null;
        notifyRoom(s, 'requeue');
        notifyUser(e.studentId, { type: 'requeue', sessionId: s.id, entryId: e.id });
      } else if (act === 'remove') {
        if (!ACTIVE.has(e.status)) return bad(res, 409, 'Студент уже не в очереди');
        e.status = 'removed'; e.removedAt = now;
        notifyRoom(s, 'remove');
        notifyUser(e.studentId, { type: 'removed', sessionId: s.id, entryId: e.id });
      }
      saveDB();
      return ok(res);
    }

    if (p === '/api/teacher/students' && req.method === 'GET' && u.role === 'teacher') {
      const g = String(url.searchParams.get('group') || '').trim();
      const items = db.users.filter((x) => x.role === 'student' && (!g || x.group === g))
        .map((x) => ({ id: x.id, fio: x.fio, group: x.group }));
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
      db.grades.push(g); saveDB();
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
      db.schedule.push(e); saveDB();
      return ok(res, { id: e.id });
    }

    if (p === '/api/ai/chat' && req.method === 'POST') {
      const q = String(body.message || '').trim().slice(0, 1000);
      if (!q) return bad(res, 400, 'Пустой вопрос');
      try {
        const r = await aiReply(q, body.history);
        return ok(res, r);
      } catch (e) {
        return ok(res, {
          reply: 'Локальная ИИ-модель сейчас недоступна. Запустите её так:\n\nollama serve\n(и, если модель ещё не скачана: ollama pull qwen2.5:1.5b)\n\nПока могу отвечать только по кэшу сайта ku.edu.kz, а он недоступен.',
          src: 'offline',
        });
      }
    }

    // Модули очереди (AGENTS.md): обрабатывают только свои пути /api/modules/<id>/...
    if (p.startsWith('/api/modules/')) {
      const mctx = { p, req, res, url, u, body, db, saveDB, nid, ok, bad, notifyUser, notifyRoom, subjectForDiscipline, discName, DISCIPLINES, LEVELS };
      for (const h of QUEUE_MODULE_ROUTES) { if (await h(mctx)) return; }
    }

    if (p === '/api/ai/status' && req.method === 'GET') {
      const model = await pickModel();
      return ok(res, { model, online: !!model, ctx: kuCtx.chunks.length, ctxUpdated: kuCtx.updated });
    }

    return bad(res, 404, 'Не найдено');
  } catch (e) {
    console.error('[API]', e);
    return bad(res, 500, e.message || 'Внутренняя ошибка');
  }
});

/* -------------------------------- Старт ---------------------------------- */

loadDB();
seedDemo();
loadSessions();
loadCtxCache();
server.listen(PORT, () => console.log(`KU Portal: http://localhost:${PORT}`));
if (kuCtx.updated && Date.now() - kuCtx.updated > 36 * 3600 * 1000) refreshKUCtx();
else if (!kuCtx.updated) refreshKUCtx();
setInterval(() => refreshKUCtx(), 24 * 3600 * 1000).unref();
