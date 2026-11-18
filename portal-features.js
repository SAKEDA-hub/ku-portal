/*
 * KU Portal — мессенджер, файлы, клубы и общежитие (API под /api/chat, /api/files, /api/clubs, /api/dorm).
 * Подключается из server.js: createFeatures(ctx) → async handle(p, req, res, u, body, url) → true, если запрос обработан.
 * Данные — в общей базе db.json (db.chat, db.files, db.clubs, db.dorm); файлы — в data/uploads/.
 *
 * Каналы мессенджера:
 *   s:<subjectId>:<group> — канал предмета для группы (есть в расписании); пишут все участники,
 *                           преподаватель предмета ещё публикует задания на дату, закрепляет и удаляет сообщения;
 *   d:<id1>:<id2>         — личные сообщения преподавателя и студента группы, которую он ведёт.
 * Роль «Администрация общежития» и организатора клубов пока выполняет преподаватель.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_TEXT = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'odt', 'odp', 'ods', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'rar', '7z'];
const DORM_STATUSES = ['new', 'work', 'done', 'rejected'];
const DORM_KINDS = ['repair', 'complaint', 'request'];
const DORM_TAGS = ['important', 'info', 'event'];
const DAY_MS = 86400000;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isTime = (s) => /^\d{2}:\d{2}$/.test(String(s || ''));
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

/* ------------------------------ Демо-данные ------------------------------ */
const CLUB_SEED = [
  { id: 'football', name: 'Футбол', icon: 'ball', desc: 'Сборная университета и любительские матчи между факультетами. Новичкам рады.', weekly: { day: 2, time: '18:00', place: 'Стадион KU', title: 'Тренировка' } },
  { id: 'basketball', name: 'Баскетбол', icon: 'hoop', desc: 'Тренировки, турниры 3×3 и игры с командами других вузов Костаная.', weekly: { day: 3, time: '17:30', place: 'Спортзал, корпус 1', title: 'Тренировка' } },
  { id: 'volunteer', name: 'Волонтёрство', icon: 'heart', desc: 'Помощь приютам, экологические субботники, сопровождение университетских мероприятий.', weekly: { day: 5, time: '11:00', place: 'Студенческий центр', title: 'Встреча волонтёров' } },
  { id: 'debate', name: 'Дебатный клуб', icon: 'msg', desc: 'Учимся аргументировать, выступать публично и готовимся к турнирам на трёх языках.', weekly: { day: 1, time: '16:00', place: 'Ауд. 214', title: 'Игра в формате АПФ' } },
  { id: 'chess', name: 'Шахматы', icon: 'crown', desc: 'Блиц по пятницам, разбор партий и рейтинговый турнир каждый семестр.', weekly: { day: 4, time: '15:00', place: 'Библиотека, читальный зал', title: 'Блиц-турнир' } },
];
const CLUB_EXTRA_EVENTS = [
  ['football', 9, 'Кубок факультетов: полуфинал', '16:00', 'Стадион KU', 60],
  ['volunteer', 6, 'Субботник в городском парке', '10:00', 'Центральный парк, у входа', 30],
  ['debate', 12, 'Открытый турнир KU Debate', '14:00', 'Актовый зал', 24],
];
function dormNewsSeed(now) {
  return [
    { id: 'n1', tag: 'important', title: 'Плановое отключение горячей воды', text: 'В корпусе №2 горячей воды не будет с 10:00 до 16:00 — профилактика бойлерной.', at: now - 2 * 3600e3, author: 'Администрация' },
    { id: 'n2', tag: 'info', title: 'Прачечная — новое время работы', text: 'Прачечная на 1 этаже работает ежедневно с 8:00 до 22:00. Запись — у дежурного.', at: now - DAY_MS, author: 'Администрация' },
    { id: 'n3', tag: 'event', title: 'Вечер настольных игр', text: 'В пятницу в 19:00 в комнате отдыха. Приносите свои игры!', at: now - 2 * DAY_MS, author: 'Студсовет общежития' },
    { id: 'n4', tag: 'info', title: 'Wi-Fi в общежитии', text: 'Сеть KU-Dorm, логин и пароль — как в портале университета. Если не подключается — оставьте заявку «Интернет».', at: now - 5 * DAY_MS, author: 'IT-отдел' },
  ];
}

function createFeatures(ctx) {
  const { getDB, saveDB, nid, ok, bad, isOnline, pushInbox, subjName, teacherFio, DATA } = ctx;
  const UPLOADS = path.join(DATA, 'uploads');
  if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

  function store() {
    const db = getDB();
    db.chat = db.chat || {};
    db.chat.msgs = db.chat.msgs || [];
    db.chat.tasks = db.chat.tasks || [];
    db.chat.reads = db.chat.reads || {};
    db.files = db.files || [];
    if (!db.clubs) db.clubs = CLUB_SEED.map((c) => Object.assign({ members: [], events: [] }, c));
    if (!db.dorm) db.dorm = { news: dormNewsSeed(Date.now()), requests: [] };
    if (!db.clubsSeeded) {
      const today = new Date();
      for (const [cid, days, title, time, place, limit] of CLUB_EXTRA_EVENTS) {
        const c = db.clubs.find((x) => x.id === cid);
        if (c) c.events.push({ id: nid('ev'), title, date: ymd(new Date(today.getTime() + days * DAY_MS)), time, place, limit, people: [], by: null });
      }
      db.clubsSeeded = true;
      saveDB();
    }
    return db;
  }
  const userById = (id) => getDB().users.find((x) => x.id === id);
  const person = (x) => ({ id: x.id, fio: x.fio, role: x.role, group: x.group || '', online: isOnline(x) });

  /* ------------------------------ Мессенджер ------------------------------ */
  /* Каналы предметов пользователя — из расписания (предмет + группа) */
  function subjectChannels(u) {
    const db = getDB();
    const rows = u.role === 'teacher' ? db.schedule.filter((r) => r.teacherId === u.id) : db.schedule.filter((r) => r.group === u.group);
    const seen = new Map();
    for (const r of rows) {
      const id = `s:${r.subjectId}:${r.group}`;
      if (!seen.has(id)) seen.set(id, { id, kind: 'subject', title: subjName(r.subjectId), group: r.group, teacher: teacherFio(r.teacherId), teacherId: r.teacherId, subjectId: r.subjectId });
    }
    return [...seen.values()];
  }
  /* Собеседники: студенту — преподаватели его группы, преподавателю — студенты его групп */
  function contactsOf(u) {
    const db = getDB();
    if (u.role === 'teacher') {
      const groups = new Set(db.schedule.filter((r) => r.teacherId === u.id).map((r) => r.group));
      return db.users.filter((x) => x.role === 'student' && groups.has(x.group));
    }
    const tids = new Set(db.schedule.filter((r) => r.group === u.group).map((r) => r.teacherId));
    return db.users.filter((x) => x.role === 'teacher' && tids.has(x.id));
  }
  const dmId = (a, b) => 'd:' + [a, b].sort().join(':');
  /* Доступ к каналу: { ok, manage } — manage у преподавателя предмета */
  function access(u, ch) {
    const db = getDB();
    const s = /^s:([^:]+):(.+)$/.exec(ch || '');
    if (s) {
      const row = db.schedule.find((r) => r.subjectId === s[1] && r.group === s[2]);
      if (!row) return { ok: false };
      const sub = db.subjects.find((x) => x.id === s[1]);
      const manage = u.role === 'teacher' && !!sub && sub.teacherId === u.id;
      return { ok: manage || (u.role === 'student' && u.group === s[2]), manage, kind: 'subject', group: s[2], subject: sub };
    }
    const d = /^d:([^:]+):([^:]+)$/.exec(ch || '');
    if (d && (d[1] === u.id || d[2] === u.id)) {
      const other = userById(d[1] === u.id ? d[2] : d[1]);
      return { ok: !!other && contactsOf(u).some((x) => x.id === other.id), manage: false, kind: 'dm', other };
    }
    return { ok: false };
  }
  function lastAndUnread(u, ch) {
    const db = store();
    const read = (db.chat.reads[u.id] || {})[ch] || 0;
    let last = null, unread = 0;
    for (const m of db.chat.msgs) {
      if (m.ch !== ch) continue;
      last = m;
      if (m.at > read && m.from !== u.id) unread++;
    }
    return { unread, last: last ? { text: last.text || (last.file ? '📎 ' + last.file.name : ''), at: last.at, from: last.from } : null };
  }
  const pubMsg = (m) => ({ id: m.id, from: m.from, fromFio: (userById(m.from) || {}).fio || '—', fromRole: (userById(m.from) || {}).role || '', text: m.text, file: m.file || null, at: m.at, pinned: !!m.pinned });
  function pubTask(t, u) {
    return { id: t.id, title: t.title, text: t.text, due: t.due, file: t.file || null, at: t.at, done: (t.done || []).includes(u.id), doneCount: (t.done || []).length };
  }
  function attachFile(u, fileId, ch) {
    if (!fileId) return null;
    const f = store().files.find((x) => x.id === fileId && x.owner === u.id);
    if (!f) return undefined;
    f.chs = [...new Set((f.chs || []).concat(ch))];
    return { id: f.id, name: f.name, size: f.size };
  }
  function markRead(u, ch) {
    const db = store();
    db.chat.reads[u.id] = db.chat.reads[u.id] || {};
    db.chat.reads[u.id][ch] = Date.now();
  }
  function notifyChannel(a, item, exceptId) {
    const db = getDB();
    const ids = a.kind === 'dm' ? [a.other.id] : db.users.filter((x) => x.role === 'student' && x.group === a.group).map((x) => x.id);
    for (const id of ids) if (id !== exceptId) { const x = userById(id); if (x) pushInbox(x, item); }
  }

  async function chat(p, req, res, u, body, url) {
    const db = store();
    if (p === '/api/chat/list' && req.method === 'GET') {
      const channels = subjectChannels(u).map((c) => Object.assign(c, lastAndUnread(u, c.id),
        { tasksDue: db.chat.tasks.filter((t) => t.ch === c.id && t.due >= ymd(new Date()) && !(t.done || []).includes(u.id)).length }));
      const contacts = contactsOf(u).map((x) => Object.assign(person(x), { ch: dmId(u.id, x.id) }, lastAndUnread(u, dmId(u.id, x.id))))
        .sort((a, b) => ((b.last && b.last.at) || 0) - ((a.last && a.last.at) || 0) || a.fio.localeCompare(b.fio));
      return ok(res, { channels, contacts });
    }
    if (p === '/api/chat/messages' && req.method === 'GET') {
      const ch = url.searchParams.get('ch');
      const a = access(u, ch);
      if (!a.ok) return bad(res, 403, 'Нет доступа к чату');
      const all = db.chat.msgs.filter((m) => m.ch === ch);
      markRead(u, ch); ctx.markDirty();
      const out = { items: all.slice(-200).map(pubMsg), manage: a.manage, kind: a.kind };
      if (a.kind === 'subject') {
        out.title = a.subject ? a.subject.name : '';
        out.group = a.group;
        out.pinned = all.filter((m) => m.pinned).map(pubMsg);
        out.tasks = db.chat.tasks.filter((t) => t.ch === ch).sort((x, y) => x.due.localeCompare(y.due)).map((t) => pubTask(t, u));
        out.members = db.users.filter((x) => x.role === 'student' && x.group === a.group).length;
      } else {
        out.other = person(a.other);
      }
      return ok(res, out);
    }
    if (p === '/api/chat/send' && req.method === 'POST') {
      const ch = String(body.ch || '');
      const a = access(u, ch);
      if (!a.ok) return bad(res, 403, 'Нет доступа к чату');
      const text = clip(body.text, MAX_TEXT);
      const file = attachFile(u, body.fileId, ch);
      if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
      if (!text && !file) return bad(res, 400, 'Пустое сообщение');
      const m = { id: nid('msg'), ch, from: u.id, text, file, at: Date.now(), pinned: false };
      db.chat.msgs.push(m);
      markRead(u, ch);
      if (a.kind === 'dm') notifyChannel(a, { type: 'msg', from: u.fio, text: text.slice(0, 80) || (file ? file.name : '') });
      saveDB();
      return ok(res, { item: pubMsg(m) });
    }
    if (p === '/api/chat/pin' && req.method === 'POST') {
      const m = db.chat.msgs.find((x) => x.id === body.id);
      if (!m || !access(u, m.ch).manage) return bad(res, 403, 'Закреплять может преподаватель предмета');
      m.pinned = !!body.on; saveDB();
      return ok(res);
    }
    if (p === '/api/chat/delete' && req.method === 'POST') {
      const m = db.chat.msgs.find((x) => x.id === body.id);
      if (!m || !(m.from === u.id || access(u, m.ch).manage)) return bad(res, 403, 'Удалить можно только своё сообщение');
      db.chat.msgs = db.chat.msgs.filter((x) => x !== m); saveDB();
      return ok(res);
    }
    if (p === '/api/chat/task' && req.method === 'POST') {
      const ch = String(body.ch || '');
      const a = access(u, ch);
      if (!a.manage) return bad(res, 403, 'Задания публикует преподаватель предмета');
      const title = clip(body.title, 160);
      if (title.length < 2) return bad(res, 400, 'Укажите название задания');
      if (!isDate(body.due)) return bad(res, 400, 'Укажите дату сдачи');
      const file = attachFile(u, body.fileId, ch);
      if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
      const t = { id: nid('task'), ch, teacherId: u.id, title, text: clip(body.text, MAX_TEXT), due: body.due, file, at: Date.now(), done: [] };
      db.chat.tasks.push(t);
      notifyChannel(a, { type: 'task', subject: a.subject ? a.subject.name : '', title, due: t.due });
      saveDB();
      return ok(res, { id: t.id });
    }
    if (p === '/api/chat/task/delete' && req.method === 'POST') {
      const t = db.chat.tasks.find((x) => x.id === body.id);
      if (!t || !access(u, t.ch).manage) return bad(res, 403, 'Удалить задание может преподаватель предмета');
      db.chat.tasks = db.chat.tasks.filter((x) => x !== t); saveDB();
      return ok(res);
    }
    if (p === '/api/chat/task/done' && req.method === 'POST') {
      const t = db.chat.tasks.find((x) => x.id === body.id);
      if (!t || !access(u, t.ch).ok || u.role !== 'student') return bad(res, 403, 'Нет доступа');
      t.done = (t.done || []).filter((x) => x !== u.id);
      if (body.done) t.done.push(u.id);
      saveDB();
      return ok(res);
    }
    return false;
  }

  /* -------------------------------- Файлы --------------------------------- */
  async function files(p, req, res, u, body) {
    if (p === '/api/files' && req.method === 'POST') {
      const name = clip(body.name, 120).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (!name || !FILE_EXT.includes(ext)) return bad(res, 400, 'Этот тип файла не поддерживается');
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if (!buf.length) return bad(res, 400, 'Пустой файл');
      if (buf.length > MAX_FILE_BYTES) return bad(res, 400, 'Файл больше 10 МБ');
      const id = crypto.randomBytes(12).toString('hex');
      fs.writeFileSync(path.join(UPLOADS, id), buf);
      store().files.push({ id, name, size: buf.length, owner: u.id, at: Date.now(), chs: [] });
      saveDB();
      return ok(res, { id, name, size: buf.length });
    }
    const m = /^\/api\/files\/([a-f0-9]{24})$/.exec(p);
    if (m && req.method === 'GET') {
      const f = store().files.find((x) => x.id === m[1]);
      if (!f || !(f.owner === u.id || (f.chs || []).some((ch) => access(u, ch).ok))) return bad(res, 404, 'Файл не найден');
      const file = path.join(UPLOADS, f.id);
      if (!fs.existsSync(file)) return bad(res, 404, 'Файл не найден');
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      fs.createReadStream(file).pipe(res);
      return true;
    }
    return false;
  }

  /* -------------------------------- Клубы --------------------------------- */
  /* Регулярная встреча клуба: ближайшая дата по дню недели — создаётся, когда прошлая прошла */
  function ensureWeekly(c) {
    if (!c.weekly) return false;
    const today = ymd(new Date());
    if (c.events.some((e) => e.weekly && e.date >= today)) return false;
    const d = new Date();
    while ((d.getDay() + 6) % 7 !== c.weekly.day) d.setDate(d.getDate() + 1);
    c.events.push({ id: nid('ev'), title: c.weekly.title, date: ymd(d), time: c.weekly.time, place: c.weekly.place, limit: 0, people: [], by: null, weekly: true });
    return true;
  }
  function pubEvent(e, c, u) {
    const out = { id: e.id, clubId: c.id, club: c.name, icon: c.icon, title: e.title, date: e.date, time: e.time, place: e.place, limit: e.limit || 0, count: e.people.length, going: e.people.includes(u.id), mine: e.by === u.id, weekly: !!e.weekly };
    if (u.role === 'teacher') out.people = e.people.map((id) => (userById(id) || {}).fio).filter(Boolean);
    return out;
  }
  async function clubs(p, req, res, u, body) {
    const db = store();
    const today = ymd(new Date());
    if (p === '/api/clubs' && req.method === 'GET') {
      if (db.clubs.map(ensureWeekly).some(Boolean)) saveDB();
      const items = db.clubs.map((c) => ({
        id: c.id, name: c.name, icon: c.icon, desc: c.desc, members: c.members.length, joined: c.members.includes(u.id),
        meet: c.weekly ? { day: c.weekly.day, time: c.weekly.time, place: c.weekly.place } : null,
      }));
      const events = db.clubs.flatMap((c) => c.events.filter((e) => e.date >= today).map((e) => pubEvent(e, c, u)))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return ok(res, { items, events, canCreate: u.role === 'teacher' });
    }
    if (p === '/api/clubs/join' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.id === body.id);
      if (!c) return bad(res, 404, 'Клуб не найден');
      c.members = c.members.filter((x) => x !== u.id);
      if (body.on) c.members.push(u.id);
      saveDB();
      return ok(res, { members: c.members.length });
    }
    if (p === '/api/clubs/event/register' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.events.some((e) => e.id === body.id));
      const e = c && c.events.find((x) => x.id === body.id);
      if (!e || e.date < today) return bad(res, 404, 'Мероприятие не найдено');
      const was = e.people.includes(u.id);
      if (body.on && !was && e.limit && e.people.length >= e.limit) return bad(res, 400, 'Мест больше нет');
      e.people = e.people.filter((x) => x !== u.id);
      if (body.on) e.people.push(u.id);
      saveDB();
      return ok(res, { count: e.people.length });
    }
    if (p === '/api/clubs/event' && req.method === 'POST') {
      if (u.role !== 'teacher') return bad(res, 403, 'Мероприятия создаёт преподаватель-организатор');
      const c = db.clubs.find((x) => x.id === body.clubId);
      if (!c) return bad(res, 400, 'Выберите клуб');
      const title = clip(body.title, 120);
      if (title.length < 3) return bad(res, 400, 'Укажите название мероприятия');
      if (!isDate(body.date) || body.date < today) return bad(res, 400, 'Укажите дату (не раньше сегодняшней)');
      if (!isTime(body.time)) return bad(res, 400, 'Укажите время (ЧЧ:ММ)');
      const limit = Math.max(0, Math.min(1000, Math.floor(Number(body.limit) || 0)));
      c.events.push({ id: nid('ev'), title, date: body.date, time: body.time, place: clip(body.place, 120), limit, people: [], by: u.id });
      saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/event/delete' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.events.some((e) => e.id === body.id));
      const e = c && c.events.find((x) => x.id === body.id);
      if (!e || e.by !== u.id) return bad(res, 403, 'Удалить можно только своё мероприятие');
      c.events = c.events.filter((x) => x !== e); saveDB();
      return ok(res);
    }
    return false;
  }

  /* ------------------------------ Общежитие ------------------------------- */
  function pubRequest(r, u) {
    const out = { id: r.id, kind: r.kind, category: r.category, room: r.room, text: r.text, status: r.status, reply: r.reply || '', at: r.at, updated: r.updated || null, anon: !!r.anon, mine: r.by === u.id };
    if (u.role === 'teacher') out.author = r.anon ? null : (userById(r.by) || {}).fio || '—';
    return out;
  }
  async function dorm(p, req, res, u, body) {
    const db = store();
    const staff = u.role === 'teacher';
    if (p === '/api/dorm' && req.method === 'GET') {
      const reqs = (staff ? db.dorm.requests : db.dorm.requests.filter((r) => r.by === u.id)).slice().sort((a, b) => b.at - a.at);
      return ok(res, { news: db.dorm.news.slice().sort((a, b) => b.at - a.at), requests: reqs.map((r) => pubRequest(r, u)), staff });
    }
    if (p === '/api/dorm/request' && req.method === 'POST') {
      if (!DORM_KINDS.includes(body.kind)) return bad(res, 400, 'Выберите тип обращения');
      const text = clip(body.text, 1000);
      if (text.length < 5) return bad(res, 400, 'Опишите проблему подробнее');
      const r = { id: nid('dr'), kind: body.kind, category: clip(body.category, 40), room: clip(body.room, 20), text, status: 'new', at: Date.now(), by: u.id, anon: body.kind === 'complaint' && !!body.anon };
      db.dorm.requests.push(r); saveDB();
      return ok(res, { id: r.id });
    }
    if (p === '/api/dorm/status' && req.method === 'POST') {
      if (!staff) return bad(res, 403, 'Статус меняет администрация общежития');
      const r = db.dorm.requests.find((x) => x.id === body.id);
      if (!r) return bad(res, 404, 'Обращение не найдено');
      if (!DORM_STATUSES.includes(body.status)) return bad(res, 400, 'Неизвестный статус');
      r.status = body.status; r.reply = clip(body.reply, 500) || r.reply || ''; r.updated = Date.now();
      const author = userById(r.by);
      if (author) pushInbox(author, { type: 'dorm', status: r.status, category: r.category, reply: r.reply });
      saveDB();
      return ok(res);
    }
    if (p === '/api/dorm/news' && req.method === 'POST') {
      if (!staff) return bad(res, 403, 'Новости публикует администрация общежития');
      const title = clip(body.title, 120);
      if (title.length < 3) return bad(res, 400, 'Укажите заголовок');
      db.dorm.news.push({ id: nid('dn'), tag: DORM_TAGS.includes(body.tag) ? body.tag : 'info', title, text: clip(body.text, 1000), at: Date.now(), author: u.fio, by: u.id });
      saveDB();
      return ok(res);
    }
    if (p === '/api/dorm/news/delete' && req.method === 'POST') {
      if (!staff) return bad(res, 403, 'Нет доступа');
      db.dorm.news = db.dorm.news.filter((x) => x.id !== body.id); saveDB();
      return ok(res);
    }
    return false;
  }

  return async function handle(p, req, res, u, body, url) {
    if (p.startsWith('/api/chat/')) return chat(p, req, res, u, body, url);
    if (p.startsWith('/api/files')) return files(p, req, res, u, body);
    if (p.startsWith('/api/clubs')) return clubs(p, req, res, u, body);
    if (p.startsWith('/api/dorm')) return dorm(p, req, res, u, body);
    return false;
  };
}

module.exports = { createFeatures, MAX_FILE_BYTES };
