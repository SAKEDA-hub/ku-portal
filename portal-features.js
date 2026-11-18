/*
 * KU Portal — мессенджер, файлы и общежитие (API под /api/chat, /api/files, /api/dorm); клубы — portal-clubs.js.
 * Подключается из server.js: createFeatures(ctx) → async handle(p, req, res, u, body, url) → false, если запрос не наш.
 * Данные — в общей базе db.json (db.chat, db.files, db.dorm); файлы — в data/uploads/.
 *
 * Мессенджер:
 *   s:<subjectId>:<group> — канал предмета для группы (есть в расписании). Только чтение для студентов:
 *                           преподаватель предмета публикует материалы (лекции, практики) и задания на дату.
 *   d:<id1>:<id2>         — личная переписка студента с преподавателем его группы (студенты между собой не пишут).
 * Роль «Администрация общежития» пока выполняет преподаватель.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClubs } = require('./portal-clubs');

const MAX_TEXT = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'odt', 'odp', 'ods', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'rar', '7z'];
const MATERIAL_KINDS = ['lecture', 'practice', 'other'];
const DORM_STATUSES = ['new', 'work', 'done', 'rejected'];
const DORM_KINDS = ['repair', 'complaint', 'request'];
const DORM_TAGS = ['important', 'info', 'event'];
const DAY_MS = 86400000;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

function dormNewsSeed(now) {
  return [
    { id: 'n1', tag: 'important', title: 'Плановое отключение горячей воды', text: 'В корпусе №2 горячей воды не будет с 10:00 до 16:00 — профилактика бойлерной.', at: now - 2 * 3600e3, author: 'Администрация' },
    { id: 'n2', tag: 'info', title: 'Прачечная — новое время работы', text: 'Прачечная на 1 этаже работает ежедневно с 8:00 до 22:00. Запись — у дежурного.', at: now - DAY_MS, author: 'Администрация' },
    { id: 'n3', tag: 'event', title: 'Вечер настольных игр', text: 'В пятницу в 19:00 в комнате отдыха. Приносите свои игры!', at: now - 2 * DAY_MS, author: 'Студсовет общежития' },
    { id: 'n4', tag: 'info', title: 'Wi-Fi в общежитии', text: 'Сеть KU-Dorm, логин и пароль — как в портале университета. Если не подключается — оставьте заявку «Интернет».', at: now - 5 * DAY_MS, author: 'IT-отдел' },
  ];
}

function createFeatures(ctx) {
  const { getDB, saveDB, nid, ok, bad, isOnline, settingsOf, trackOf, pushInbox, subjName, teacherFio, DATA } = ctx;
  const UPLOADS = path.join(DATA, 'uploads');
  if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
  const clubs = createClubs(ctx);

  function store() {
    const db = getDB();
    db.chat = db.chat || {};
    db.chat.msgs = db.chat.msgs || [];
    db.chat.materials = db.chat.materials || [];
    db.chat.tasks = db.chat.tasks || [];
    db.chat.reads = db.chat.reads || {};
    db.files = db.files || [];
    if (!db.dorm) db.dorm = { news: dormNewsSeed(Date.now()), requests: [] };
    return db;
  }
  const userById = (id) => getDB().users.find((x) => x.id === id);
  /* Карточка собеседника: статус и часы консультаций видны всегда, «в сети» — если человек это разрешил */
  function person(x) {
    const st = settingsOf(x);
    return { id: x.id, fio: x.fio, role: x.role, group: x.group || '', track: trackOf(x), online: isOnline(x), status: st.status, statusText: st.statusText, officeHours: x.role === 'teacher' ? st.officeHours : '' };
  }

  /* ------------------------------ Мессенджер ------------------------------ */
  /* Каналы предметов пользователя — из расписания (предмет + группа) */
  function subjectChannels(u) {
    const db = getDB();
    const rows = u.role === 'teacher' ? db.schedule.filter((r) => r.teacherId === u.id) : db.schedule.filter((r) => r.group === u.group);
    const seen = new Map();
    for (const r of rows) {
      const id = `s:${r.subjectId}:${r.group}`;
      if (!seen.has(id)) seen.set(id, { id, kind: 'subject', title: subjName(r.subjectId), group: r.group, teacher: teacherFio(r.teacherId), teacherId: r.teacherId });
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
  /* Последняя запись и непрочитанное: в канале — материалы и задания, в личке — сообщения */
  function lastAndUnread(u, ch) {
    const db = store();
    const read = (db.chat.reads[u.id] || {})[ch] || 0;
    const rows = ch.startsWith('s:')
      ? db.chat.materials.filter((m) => m.ch === ch).map((m) => ({ at: m.at, from: m.teacherId, text: m.title, kind: m.kind }))
        .concat(db.chat.tasks.filter((t) => t.ch === ch).map((t) => ({ at: t.at, from: t.teacherId, text: t.title, kind: 'task' })))
      : db.chat.msgs.filter((m) => m.ch === ch).map((m) => ({ at: m.at, from: m.from, text: m.text || (m.file ? '📎 ' + m.file.name : '') }));
    let last = null, unread = 0;
    for (const r of rows) {
      if (!last || r.at > last.at) last = r;
      if (r.at > read && r.from !== u.id) unread++;
    }
    return { unread, last };
  }
  const pubMsg = (m) => ({ id: m.id, from: m.from, fromFio: (userById(m.from) || {}).fio || '—', fromRole: (userById(m.from) || {}).role || '', text: m.text, file: m.file || null, at: m.at });
  const pubMaterial = (m, manage) => ({
    id: m.id, kind: m.kind, title: m.title, text: m.text, file: m.file || null, at: m.at, edited: m.edited || null, important: !!m.important,
    teacher: teacherFio(m.teacherId), views: manage ? (m.seen || []).length : undefined,
  });
  const pubTask = (t, u) => ({ id: t.id, title: t.title, text: t.text, due: t.due, file: t.file || null, at: t.at, edited: t.edited || null, done: (t.done || []).includes(u.id), doneCount: (t.done || []).length });
  /* Студент открыл канал — материалы считаются просмотренными (преподаватель видит «просмотрели N из M») */
  function markSeen(u, ch) {
    if (u.role !== 'student') return false;
    let changed = false;
    for (const m of store().chat.materials) if (m.ch === ch && !(m.seen || []).includes(u.id)) { m.seen = (m.seen || []).concat(u.id); changed = true; }
    return changed;
  }
  /* Каналы, куда преподаватель публикует: основной + выбранные группы того же предмета (body.chs) */
  function targetChannels(u, ch, extra) {
    const all = [ch].concat(Array.isArray(extra) ? extra.map(String) : []);
    return [...new Set(all)].map((c) => ({ ch: c, a: access(u, c) })).filter((x) => x.a.manage);
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
  function notifyGroup(group, item) {
    getDB().users.filter((x) => x.role === 'student' && x.group === group).forEach((x) => pushInbox(x, item));
  }
  function channelView(db, ch, a, u) {
    return {
      kind: 'subject', manage: a.manage, title: a.subject ? a.subject.name : '', group: a.group,
      teacher: a.subject ? teacherFio(a.subject.teacherId) : '',
      members: db.users.filter((x) => x.role === 'student' && x.group === a.group).length,
      materials: db.chat.materials.filter((m) => m.ch === ch).sort((x, y) => (y.important - x.important) || y.at - x.at).map((m) => pubMaterial(m, a.manage)),
      siblings: a.manage ? subjectChannels(u).filter((c) => c.id !== ch && c.title === (a.subject || {}).name).map((c) => ({ id: c.id, group: c.group })) : [],
      tasks: db.chat.tasks.filter((t) => t.ch === ch).sort((x, y) => x.due.localeCompare(y.due)).map((t) => pubTask(t, u)),
    };
  }

  /* Сводка: студенту — ближайшие дедлайны; преподавателю — кто ждёт ответа, как выполняют задания, как смотрят материалы */
  function overview(db, u) {
    const today = ymd(new Date());
    const chans = subjectChannels(u);
    const chTitle = (ch) => { const c = chans.find((x) => x.id === ch); return c ? { subject: c.title, group: c.group } : { subject: '', group: '' }; };
    const unread = chans.map((c) => c.id).concat(contactsOf(u).map((x) => dmId(u.id, x.id))).reduce((n, ch) => n + lastAndUnread(u, ch).unread, 0);
    if (u.role !== 'teacher') {
      const deadlines = db.chat.tasks.filter((t) => chans.some((c) => c.id === t.ch) && t.due >= today && !(t.done || []).includes(u.id))
        .sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8).map((t) => Object.assign({ id: t.id, ch: t.ch, title: t.title, due: t.due }, chTitle(t.ch)));
      return { unread, deadlines };
    }
    const members = (ch) => db.users.filter((x) => x.role === 'student' && x.group === chTitle(ch).group).length;
    const awaiting = contactsOf(u).map((x) => ({ x, ch: dmId(u.id, x.id) }))
      .map(({ x, ch }) => ({ x, ch, last: db.chat.msgs.filter((m) => m.ch === ch).pop() }))
      .filter((r) => r.last && r.last.from !== u.id)
      .sort((a, b) => b.last.at - a.last.at)
      .map((r) => ({ ch: r.ch, fio: r.x.fio, group: r.x.group, text: r.last.text || (r.last.file ? '📎 ' + r.last.file.name : ''), at: r.last.at }));
    const tasks = db.chat.tasks.filter((t) => t.teacherId === u.id && t.due >= today).sort((a, b) => a.due.localeCompare(b.due))
      .map((t) => Object.assign({ id: t.id, ch: t.ch, title: t.title, due: t.due, done: (t.done || []).length, members: members(t.ch) }, chTitle(t.ch)));
    const materials = db.chat.materials.filter((m) => m.teacherId === u.id).sort((a, b) => b.at - a.at).slice(0, 6)
      .map((m) => Object.assign({ id: m.id, ch: m.ch, title: m.title, kind: m.kind, at: m.at, views: (m.seen || []).length, members: members(m.ch) }, chTitle(m.ch)));
    return { unread, awaiting, tasks, materials };
  }

  async function chat(p, req, res, u, body, url) {
    const db = store();
    if (p === '/api/chat/list' && req.method === 'GET') {
      const today = ymd(new Date());
      const channels = subjectChannels(u).map((c) => Object.assign(c, lastAndUnread(u, c.id),
        { tasksDue: u.role === 'student' ? db.chat.tasks.filter((t) => t.ch === c.id && t.due >= today && !(t.done || []).includes(u.id)).length : 0 }));
      const contacts = contactsOf(u).map((x) => Object.assign(person(x), { ch: dmId(u.id, x.id) }, lastAndUnread(u, dmId(u.id, x.id))));
      return ok(res, { channels, contacts });
    }
    if (p === '/api/chat/messages' && req.method === 'GET') {
      const ch = url.searchParams.get('ch');
      const a = access(u, ch);
      if (!a.ok) return bad(res, 403, 'Нет доступа к чату');
      markRead(u, ch); markSeen(u, ch); ctx.markDirty();
      if (a.kind === 'subject') return ok(res, channelView(db, ch, a, u));
      // «прочитано» — если оба разрешили отметки о прочтении
      const receipts = settingsOf(u).readReceipts && settingsOf(a.other).readReceipts;
      const otherRead = receipts ? ((db.chat.reads[a.other.id] || {})[ch] || 0) : null;
      return ok(res, { kind: 'dm', other: person(a.other), otherRead, items: db.chat.msgs.filter((m) => m.ch === ch).slice(-300).map(pubMsg) });
    }
    if (p === '/api/chat/send' && req.method === 'POST') {
      const ch = String(body.ch || '');
      const a = access(u, ch);
      if (!a.ok) return bad(res, 403, 'Нет доступа к чату');
      if (a.kind !== 'dm') return bad(res, 403, 'В канал предмета публикует только преподаватель');
      const text = clip(body.text, MAX_TEXT);
      const file = attachFile(u, body.fileId, ch);
      if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
      if (!text && !file) return bad(res, 400, 'Пустое сообщение');
      const m = { id: nid('msg'), ch, from: u.id, text, file, at: Date.now() };
      db.chat.msgs.push(m);
      markRead(u, ch);
      pushInbox(a.other, { type: 'msg', from: u.fio, text: text.slice(0, 80) || (file ? file.name : '') });
      saveDB();
      return ok(res, { item: pubMsg(m) });
    }
    if (p === '/api/chat/delete' && req.method === 'POST') {
      const m = db.chat.msgs.find((x) => x.id === body.id);
      if (!m || m.from !== u.id) return bad(res, 403, 'Удалить можно только своё сообщение');
      db.chat.msgs = db.chat.msgs.filter((x) => x !== m); saveDB();
      return ok(res);
    }
    if (p === '/api/chat/material' && req.method === 'POST') {
      const ch = String(body.ch || '');
      const a = access(u, ch);
      if (!a.manage) return bad(res, 403, 'Материалы публикует преподаватель предмета');
      const title = clip(body.title, 160);
      if (title.length < 2) return bad(res, 400, 'Укажите название материала');
      const kind = MATERIAL_KINDS.includes(body.kind) ? body.kind : 'other';
      const targets = targetChannels(u, ch, body.chs);
      for (const { ch: c, a: ta } of targets) {
        const file = attachFile(u, body.fileId, c);
        if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
        db.chat.materials.push({ id: nid('mat'), ch: c, teacherId: u.id, kind, title, text: clip(body.text, MAX_TEXT), file, important: !!body.important, at: Date.now(), seen: [] });
        notifyGroup(ta.group, { type: 'material', subject: ta.subject ? ta.subject.name : '', title, kind, important: !!body.important });
      }
      saveDB();
      return ok(res, { count: targets.length });
    }
    if (p === '/api/chat/material/delete' && req.method === 'POST') {
      const m = db.chat.materials.find((x) => x.id === body.id);
      if (!m || !access(u, m.ch).manage) return bad(res, 403, 'Удалить материал может преподаватель предмета');
      db.chat.materials = db.chat.materials.filter((x) => x !== m); saveDB();
      return ok(res);
    }
    if (p === '/api/chat/task' && req.method === 'POST') {
      const ch = String(body.ch || '');
      const a = access(u, ch);
      if (!a.manage) return bad(res, 403, 'Задания публикует преподаватель предмета');
      const title = clip(body.title, 160);
      if (title.length < 2) return bad(res, 400, 'Укажите название задания');
      if (!isDate(body.due)) return bad(res, 400, 'Укажите дату сдачи');
      const targets = targetChannels(u, ch, body.chs);
      for (const { ch: c, a: ta } of targets) {
        const file = attachFile(u, body.fileId, c);
        if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
        db.chat.tasks.push({ id: nid('task'), ch: c, teacherId: u.id, title, text: clip(body.text, MAX_TEXT), due: body.due, file, at: Date.now(), done: [] });
        notifyGroup(ta.group, { type: 'task', subject: ta.subject ? ta.subject.name : '', title, due: body.due });
      }
      saveDB();
      return ok(res, { count: targets.length });
    }
    /* Преподаватель дополняет опубликованное: текст, название, срок, «важно» — с пометкой «изменено» */
    if (p === '/api/chat/material/edit' && req.method === 'POST') {
      const m = db.chat.materials.find((x) => x.id === body.id);
      if (!m || !access(u, m.ch).manage) return bad(res, 403, 'Изменить материал может преподаватель предмета');
      const title = clip(body.title, 160);
      if (title.length < 2) return bad(res, 400, 'Укажите название материала');
      Object.assign(m, { title, text: clip(body.text, MAX_TEXT), important: !!body.important, edited: Date.now() });
      saveDB();
      return ok(res);
    }
    if (p === '/api/chat/task/edit' && req.method === 'POST') {
      const t = db.chat.tasks.find((x) => x.id === body.id);
      if (!t || !access(u, t.ch).manage) return bad(res, 403, 'Изменить задание может преподаватель предмета');
      const title = clip(body.title, 160);
      if (title.length < 2) return bad(res, 400, 'Укажите название задания');
      if (!isDate(body.due)) return bad(res, 400, 'Укажите дату сдачи');
      const moved = t.due !== body.due;
      Object.assign(t, { title, text: clip(body.text, MAX_TEXT), due: body.due, edited: Date.now() });
      if (moved) { const a = access(u, t.ch); notifyGroup(a.group, { type: 'task', subject: a.subject ? a.subject.name : '', title, due: t.due, moved: true }); }
      saveDB();
      return ok(res);
    }
    if (p === '/api/chat/overview' && req.method === 'GET') return ok(res, overview(db, u));
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
