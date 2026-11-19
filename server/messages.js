/*
 * KU Message — API мессенджера университета (/api/message/*, файлы — /api/files). Интерфейс — папка ku-message/.
 *
 *   s:<subjectId>   — страница предмета (одна на предмет, для всех групп, где он стоит в расписании).
 *                     Публикует только преподаватель предмета: лекции, практики, материалы и задания со сроком
 *                     не меньше MIN_TASK_DAYS дней. Студенты читают и скачивают файлы.
 *   d:<id1>:<id2>   — личная переписка студента с преподавателем его группы.
 * Данные — db.chat.{msgs, materials, tasks, reads}, db.files; сами файлы — data/uploads/<id>.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_TEXT = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIN_TASK_DAYS = 7; // обычные короткие задания не нужны — только работы с долгим сроком сдачи
const FILE_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'odt', 'odp', 'ods', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'rar', '7z'];
const MATERIAL_KINDS = ['lecture', 'practice', 'other'];
const DAY_MS = 86400000;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

function createMessages(ctx) {
  const { getDB, saveDB, markDirty, nid, ok, bad, isOnline, settingsOf, pushInbox, subjName, teacherFio, DATA } = ctx;
  const UPLOADS = path.join(DATA, 'uploads');
  if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true, mode: 0o700 });

  function store() {
    const db = getDB();
    db.chat = db.chat || {};
    for (const k of ['msgs', 'materials', 'tasks']) db.chat[k] = db.chat[k] || [];
    db.chat.reads = db.chat.reads || {};
    db.files = db.files || [];
    if ((db.chat.v || 0) < 3) migrate(db);
    return db;
  }
  /* Прошлые версии: каналы «предмет + группа» (s:sub:group) → одна страница предмета (s:sub);
     одинаковые публикации, отправленные сразу в несколько групп, склеиваются; сообщения в каналах убираются. */
  function migrate(db) {
    const toSubject = (ch) => { const m = /^s:([^:]+):/.exec(ch || ''); return m ? 's:' + m[1] : ch; };
    const merge = (list, key) => {
      const out = [];
      for (const x of list.map((r) => Object.assign(r, { ch: toSubject(r.ch) })).sort((a, b) => a.at - b.at)) {
        if (!out.some((y) => y.ch === x.ch && key(y) === key(x) && Math.abs(y.at - x.at) < 5 * 60e3)) out.push(x);
      }
      return out;
    };
    db.chat.materials = merge(db.chat.materials, (m) => [m.teacherId, m.kind, m.title, m.text].join('|'));
    db.chat.tasks = merge(db.chat.tasks, (t) => [t.teacherId, t.title, t.due].join('|'));
    db.chat.msgs = db.chat.msgs.filter((m) => m.ch.startsWith('d:'));
    for (const f of db.files) f.chs = [...new Set((f.chs || []).map(toSubject))];
    db.chat.v = 3;
    saveDB();
  }
  const userById = (id) => getDB().users.find((x) => x.id === id);
  const person = (x) => ({ id: x.id, fio: x.fio, role: x.role, group: x.group || '', online: isOnline(x), officeHours: x.role === 'teacher' ? settingsOf(x).officeHours : '' });

  /* ------------------------------ Доступ ------------------------------ */
  /* Предметы пользователя — из расписания: студенту — предметы его группы, преподавателю — его предметы */
  function spacesOf(u) {
    const db = getDB();
    const rows = u.role === 'teacher' ? db.schedule.filter((r) => r.teacherId === u.id) : db.schedule.filter((r) => r.group === u.group);
    const map = new Map();
    for (const r of rows) {
      const s = map.get(r.subjectId) || { id: 's:' + r.subjectId, subjectId: r.subjectId, title: subjName(r.subjectId), teacherId: r.teacherId, teacher: teacherFio(r.teacherId), groups: [] };
      if (!s.groups.includes(r.group)) s.groups.push(r.group);
      map.set(r.subjectId, s);
    }
    return [...map.values()];
  }
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
  function access(u, ch) {
    const db = getDB();
    const s = /^s:([^:]+)$/.exec(ch || '');
    if (s) {
      const sub = db.subjects.find((x) => x.id === s[1]);
      if (!sub || !db.schedule.some((r) => r.subjectId === sub.id)) return { ok: false };
      const manage = u.role === 'teacher' && sub.teacherId === u.id;
      return { ok: manage || (u.role === 'student' && db.schedule.some((r) => r.subjectId === sub.id && r.group === u.group)), manage, kind: 'space', subject: sub };
    }
    const d = /^d:([^:]+):([^:]+)$/.exec(ch || '');
    if (d && (d[1] === u.id || d[2] === u.id)) {
      const other = userById(d[1] === u.id ? d[2] : d[1]);
      return { ok: !!other && contactsOf(u).some((x) => x.id === other.id), manage: false, kind: 'dm', other };
    }
    return { ok: false };
  }
  /* Последняя запись и непрочитанное: на странице предмета — публикации, в личке — сообщения */
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
  function markRead(u, ch) {
    const db = store();
    db.chat.reads[u.id] = db.chat.reads[u.id] || {};
    db.chat.reads[u.id][ch] = Date.now();
  }
  function notifySubject(sub, item) {
    const db = getDB();
    const groups = new Set(db.schedule.filter((r) => r.subjectId === sub.id).map((r) => r.group));
    db.users.filter((x) => x.role === 'student' && groups.has(x.group)).forEach((x) => pushInbox(x, item));
  }
  function attachFile(u, fileId) {
    if (!fileId) return null;
    const f = store().files.find((x) => x.id === fileId && x.owner === u.id);
    if (!f) return undefined;
    return { id: f.id, name: f.name, size: f.size };
  }
  const pubMsg = (m) => ({ id: m.id, from: m.from, text: m.text, file: m.file || null, at: m.at });
  const pubMaterial = (m) => ({ id: m.id, kind: m.kind, title: m.title, text: m.text, file: m.file || null, at: m.at, edited: m.edited || null });
  const pubTask = (t) => ({ id: t.id, title: t.title, text: t.text, due: t.due, file: t.file || null, at: t.at, edited: t.edited || null });

  /* ------------------------------ Ответы ------------------------------ */
  function listView(db, u) {
    const today = ymd(new Date());
    const spaces = spacesOf(u).map((s) => Object.assign(s, lastAndUnread(u, s.id), {
      nextDue: (db.chat.tasks.filter((t) => t.ch === s.id && t.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0] || {}).due || null,
    }));
    const contacts = contactsOf(u).map((x) => Object.assign(person(x), { ch: dmId(u.id, x.id) }, lastAndUnread(u, dmId(u.id, x.id))));
    return { spaces, contacts };
  }
  function spaceView(db, ch, a) {
    const sub = a.subject;
    return {
      kind: 'space', manage: a.manage, title: sub.name, teacher: teacherFio(sub.teacherId),
      groups: [...new Set(db.schedule.filter((r) => r.subjectId === sub.id).map((r) => r.group))],
      officeHours: settingsOf(userById(sub.teacherId) || {}).officeHours,
      materials: db.chat.materials.filter((m) => m.ch === ch).sort((x, y) => y.at - x.at).map(pubMaterial),
      tasks: db.chat.tasks.filter((t) => t.ch === ch).sort((x, y) => x.due.localeCompare(y.due)).map(pubTask),
      minDue: ymd(new Date(Date.now() + MIN_TASK_DAYS * DAY_MS)),
    };
  }
  /* Для портала: непрочитанное (значок у пункта меню) и ближайшие сроки сдачи студента */
  function overview(db, u) {
    const today = ymd(new Date());
    const { spaces, contacts } = listView(db, u);
    const unread = spaces.concat(contacts).reduce((n, c) => n + c.unread, 0);
    const ids = new Set(spaces.map((s) => s.id));
    const deadlines = u.role === 'teacher' ? [] : db.chat.tasks.filter((t) => ids.has(t.ch) && t.due >= today).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5)
      .map((t) => ({ id: t.id, ch: t.ch, title: t.title, due: t.due, subject: (spaces.find((s) => s.id === t.ch) || {}).title }));
    return { unread, deadlines };
  }

  /* ------------------------------ Публикации ------------------------------ */
  function postMaterial(db, u, body, res) {
    const ch = String(body.ch || ''), a = access(u, ch);
    if (!a.manage) return bad(res, 403, 'Публикует преподаватель предмета');
    const title = clip(body.title, 160);
    if (title.length < 2) return bad(res, 400, 'Укажите тему');
    const file = attachFile(u, body.fileId);
    if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
    const m = { id: nid('mat'), ch, teacherId: u.id, kind: MATERIAL_KINDS.includes(body.kind) ? body.kind : 'other', title, text: clip(body.text, MAX_TEXT), file, at: Date.now() };
    db.chat.materials.push(m);
    notifySubject(a.subject, { type: 'material', subject: a.subject.name, title, kind: m.kind });
    saveDB();
    return ok(res, { id: m.id });
  }
  function postTask(db, u, body, res) {
    const ch = String(body.ch || ''), a = access(u, ch);
    if (!a.manage) return bad(res, 403, 'Публикует преподаватель предмета');
    const title = clip(body.title, 160);
    if (title.length < 2) return bad(res, 400, 'Укажите название задания');
    if (!isDate(body.due) || body.due < ymd(new Date(Date.now() + MIN_TASK_DAYS * DAY_MS))) return bad(res, 400, 'Срок сдачи — не раньше чем через 7 дней');
    const file = attachFile(u, body.fileId);
    if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
    const t = { id: nid('task'), ch, teacherId: u.id, title, text: clip(body.text, MAX_TEXT), due: body.due, file, at: Date.now() };
    db.chat.tasks.push(t);
    notifySubject(a.subject, { type: 'task', subject: a.subject.name, title, due: t.due });
    saveDB();
    return ok(res, { id: t.id });
  }
  function editPost(db, u, body, res, kind) {
    const list = kind === 'task' ? db.chat.tasks : db.chat.materials;
    const x = list.find((r) => r.id === body.id);
    if (!x || !access(u, x.ch).manage) return bad(res, 403, 'Изменить может преподаватель предмета');
    const title = clip(body.title, 160);
    if (title.length < 2) return bad(res, 400, 'Укажите название');
    if (kind === 'task') {
      if (!isDate(body.due) || body.due < ymd(new Date())) return bad(res, 400, 'Укажите срок сдачи');
      if (body.due !== x.due) { const a = access(u, x.ch); notifySubject(a.subject, { type: 'task', subject: a.subject.name, title, due: body.due, moved: true }); }
      x.due = body.due;
    }
    Object.assign(x, { title, text: clip(body.text, MAX_TEXT), edited: Date.now() });
    saveDB();
    return ok(res);
  }
  function deletePost(db, u, body, res, kind) {
    const key = kind === 'task' ? 'tasks' : 'materials';
    const x = db.chat[key].find((r) => r.id === body.id);
    if (!x || !access(u, x.ch).manage) return bad(res, 403, 'Удалить может преподаватель предмета');
    db.chat[key] = db.chat[key].filter((r) => r !== x);
    saveDB();
    return ok(res);
  }

  async function message(p, req, res, u, body, url) {
    const db = store();
    if (p === '/api/message/list' && req.method === 'GET') return ok(res, listView(db, u));
    if (p === '/api/message/overview' && req.method === 'GET') return ok(res, overview(db, u));
    if (p === '/api/message/open' && req.method === 'GET') {
      const ch = url.searchParams.get('ch'), a = access(u, ch);
      if (!a.ok) return bad(res, 403, 'Нет доступа');
      markRead(u, ch); markDirty();
      if (a.kind === 'space') return ok(res, spaceView(db, ch, a));
      // «прочитано» — только если оба разрешили отметки о прочтении
      const receipts = settingsOf(u).readReceipts && settingsOf(a.other).readReceipts;
      return ok(res, { kind: 'dm', other: person(a.other), otherRead: receipts ? ((db.chat.reads[a.other.id] || {})[ch] || 0) : null, items: db.chat.msgs.filter((m) => m.ch === ch).slice(-300).map(pubMsg) });
    }
    if (p === '/api/message/send' && req.method === 'POST') {
      const ch = String(body.ch || ''), a = access(u, ch);
      if (!a.ok || a.kind !== 'dm') return bad(res, 403, 'Нет доступа');
      const text = clip(body.text, MAX_TEXT);
      const file = attachFile(u, body.fileId);
      if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
      if (!text && !file) return bad(res, 400, 'Пустое сообщение');
      const m = { id: nid('msg'), ch, from: u.id, text, file, at: Date.now() };
      db.chat.msgs.push(m);
      markRead(u, ch);
      pushInbox(a.other, { type: 'msg', from: u.fio, text: text.slice(0, 80) || (file ? file.name : '') });
      saveDB();
      return ok(res, { item: pubMsg(m) });
    }
    if (p === '/api/message/delete' && req.method === 'POST') {
      const m = db.chat.msgs.find((x) => x.id === body.id);
      if (!m || m.from !== u.id) return bad(res, 403, 'Удалить можно только своё сообщение');
      db.chat.msgs = db.chat.msgs.filter((x) => x !== m); saveDB();
      return ok(res);
    }
    if (p === '/api/message/material' && req.method === 'POST') return postMaterial(db, u, body, res);
    if (p === '/api/message/material/edit' && req.method === 'POST') return editPost(db, u, body, res, 'material');
    if (p === '/api/message/material/delete' && req.method === 'POST') return deletePost(db, u, body, res, 'material');
    if (p === '/api/message/task' && req.method === 'POST') return postTask(db, u, body, res);
    if (p === '/api/message/task/edit' && req.method === 'POST') return editPost(db, u, body, res, 'task');
    if (p === '/api/message/task/delete' && req.method === 'POST') return deletePost(db, u, body, res, 'task');
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
      let total = 0, mine = 0;
      for (const f of store().files) {
        total += f.size;
        if (f.owner === u.id) mine += f.size;
      }
      if (mine + buf.length > 100 * 1024 ** 2 || total + buf.length > 1024 ** 3) return bad(res, 413, 'Превышена квота вложений');
      const id = crypto.randomBytes(12).toString('hex');
      const target = path.join(UPLOADS, id);
      fs.writeFileSync(target, buf, { flag: 'wx', mode: 0o600 });
      const files = store().files;
      files.push({ id, name, size: buf.length, owner: u.id, at: Date.now() });
      try { saveDB(); } catch (error) { files.pop(); fs.unlinkSync(target); throw error; }
      return ok(res, { id, name, size: buf.length });
    }
    const m = /^\/api\/files\/([a-f0-9]{24})$/.exec(p);
    if (m && req.method === 'GET') {
      const f = store().files.find((x) => x.id === m[1]);
      if (!f) return bad(res, 404, 'Файл не найден');
      const chat = store().chat;
      const shared = () => [chat.msgs, chat.materials, chat.tasks].some(rows =>
        rows.some(row => row.file?.id === f.id && access(u, row.ch).ok));
      if (f.owner !== u.id && !shared()) return bad(res, 404, 'Файл не найден');
      const file = path.join(UPLOADS, f.id);
      if (!fs.existsSync(file)) return bad(res, 404, 'Файл не найден');
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      return true;
    }
    return false;
  }

  return async function handle(p, req, res, u, body, url) {
    if (p.startsWith('/api/message/')) return message(p, req, res, u, body, url);
    if (p.startsWith('/api/files')) return files(p, req, res, u, body);
    return false;
  };
}

module.exports = { createMessages, MAX_FILE_BYTES };
