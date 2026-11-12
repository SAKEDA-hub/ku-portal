/*
 * KU Portal — сервер без внешних зависимостей (Node.js >= 18).
 * Аутентификация, оценки, расписание, AI-помощник; онлайн-экзамен (exam-sync) под /exam-sync/.
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
    db = { users: [], subjects: [], schedule: [], grades: [], seq: {} };
    saveDB();
  }
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

/* ---------------- Справочник предметов (для оценок и расписания) ---------------- */
const DISCIPLINES = [
  { id: 'english', name: 'Английский язык', short: 'Английский', re: /англ|english/i },
  { id: 'math', name: 'Высшая математика', short: 'Высшая математика', re: /матем|math/i },
  { id: 'politology', name: 'Политология', short: 'Политология', re: /полит/i },
  { id: 'ecology', name: 'Экология', short: 'Экология', re: /эколог/i },
  { id: 'economics', name: 'Экономика', short: 'Экономика', re: /эконом/i },
  { id: 'it', name: 'Введение в информационные технологии', short: 'Введение в ИТ', re: /информац|(^|[^а-яё])ит([^а-яё]|$)|\bit\b/i },
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

/* «Онлайн-экзамен» (github.com/StephCurrysvg/exam-sync) — отдельное приложение под /exam-sync/,
   раздел «Экзамен» портала (public/app.js, viewExam) ведёт сюда */
const examSync = require('./exam-sync/handler').createExamSync({ base: '/exam-sync', dataFile: path.join(DATA, 'exam-sync.json') });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // «Онлайн-экзамен» (exam-sync), встроенный в портал: /exam-sync/...
  if (await examSync(req, res)) return;

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
