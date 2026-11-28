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
const { fileProblem, fileRef, extOf, IMAGE_MIME } = require('./files'); // какие вложения принимаются — server/files.js
const MATERIAL_KINDS = ['lecture', 'practice', 'other'];
const DAY_MS = 86400000;
const DEMO_FILE_KEY = 'ku-portal-demo-course-file-v1';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

function createMessages(ctx) {
  const { getDB, saveDB, markDirty, nid, ok, bad, isOnline, settingsOf, pushInbox, subjName, teacherFio, DATA, permsOf } = ctx;
  const assigned = ctx.teacherGroups || (() => []); // группы, закреплённые за преподавателем в админ-панели
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
  /* Группы предмета: из расписания и группы, закреплённые за его преподавателем в админ-панели
     (ревью п.8: преподаватель больше не добавляет занятия сам) */
  function subjectGroups(sub) {
    const db = getDB();
    const teacher = userById(sub.teacherId);
    return [...new Set([...db.schedule.filter((r) => r.subjectId === sub.id).map((r) => r.group), ...(teacher ? assigned(teacher) : [])])];
  }
  /* Предметы пользователя: студенту — предметы его группы, преподавателю — его предметы, у которых есть группы */
  function spacesOf(u) {
    const db = getDB();
    const out = [];
    for (const sub of db.subjects) {
      if (u.role === 'teacher' && sub.teacherId !== u.id) continue;
      const groups = subjectGroups(sub);
      if (!groups.length || (u.role !== 'teacher' && !groups.includes(u.group))) continue;
      out.push({ id: 's:' + sub.id, subjectId: sub.id, title: subjName(sub.id), teacherId: sub.teacherId, teacher: teacherFio(sub.teacherId), groups });
    }
    return out;
  }
  /* Личные чаты: студент ↔ преподаватель его группы — по расписанию или по группам, закреплённым в админ-панели
     (ревью п.8: преподаватель больше не добавляет занятия сам, поэтому одного расписания мало) */
  function contactsOf(u) {
    const db = getDB();
    if (u.role === 'teacher') {
      const groups = new Set([...db.schedule.filter((r) => r.teacherId === u.id).map((r) => r.group), ...assigned(u)]);
      return db.users.filter((x) => x.role === 'student' && groups.has(x.group));
    }
    const tids = new Set(db.schedule.filter((r) => r.group === u.group).map((r) => r.teacherId));
    return db.users.filter((x) => x.role === 'teacher' && (tids.has(x.id) || assigned(x).includes(u.group)));
  }
  const dmId = (a, b) => 'd:' + [a, b].sort().join(':');
  function access(u, ch) {
    const db = getDB();
    const s = /^s:([^:]+)$/.exec(ch || '');
    if (s) {
      const sub = db.subjects.find((x) => x.id === s[1]);
      const groups = sub ? subjectGroups(sub) : [];
      if (!groups.length) return { ok: false };
      const manage = u.role === 'teacher' && sub.teacherId === u.id;
      return { ok: manage || (u.role === 'student' && groups.includes(u.group)), manage, kind: 'space', subject: sub };
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
    const groups = new Set(subjectGroups(sub));
    const ch = 's:' + sub.id; // по уведомлению портал открывает страницу предмета
    db.users.filter((x) => x.role === 'student' && groups.has(x.group)).forEach((x) => pushInbox(x, Object.assign({ ch }, item)));
  }
  const attachFile = (u, fileId) => fileRef(store(), u, fileId);
  /* Файл опубликован в клубе, который пользователь видит (участник или руководитель): канал или чат участников */
  function inVisibleClub(u, fileId) {
    const lead = permsOf ? permsOf(u).clubs : [];
    return (getDB().clubs || []).some((c) => (c.members.includes(u.id) || lead.includes('*') || lead.includes(c.id))
      && [...(c.posts || []), ...(c.chat || [])].some((row) => row.file?.id === fileId));
  }
  const pubMsg = (m) => ({ id: m.id, from: m.from, text: m.text, file: m.file || null, at: m.at });
  const pubMaterial = (m) => ({ id: m.id, kind: m.kind, title: m.title, text: m.text, file: m.file || null, at: m.at, edited: m.edited || null, pinned: !!m.pinned });
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

  /* One private TXT file and one pinned post per active subject channel. Markers keep this idempotent. */
  function seedDemoMaterials() {
    const db = store();
    const subjects = db.subjects.filter((sub) => sub && sub.id && sub.teacherId && subjectGroups(sub).length);
    if (!subjects.length) return 0;
    const seededSubjects = new Set(Array.isArray(db.chat.demoCourseMaterialSeededSubjects) ? db.chat.demoCourseMaterialSeededSubjects : []);
    let registryChanged = !Array.isArray(db.chat.demoCourseMaterialSeededSubjects);
    const bytes = Buffer.from([
      'KU Portal — демонстрационный материал', '',
      'Это пробный файл для показа канала учебного предмета.',
      'Преподаватель может заменить его собственными материалами или открепить публикацию.',
      'Файл не содержит данных студентов.', '',
    ].join('\n'), 'utf8');
    let created = 0;
    let fileChanged = false;
    for (const sub of subjects) {
      if (seededSubjects.has(sub.id)) continue;
      const key = `ku-portal-demo-course-material-v1:${sub.id}`;
      const fileId = crypto.createHash('sha256').update(`${DEMO_FILE_KEY}:${sub.id}`).digest('hex').slice(0, 24);
      const filePath = path.join(UPLOADS, fileId);
      let file = db.files.find((f) => f.id === fileId);
      if (file && file.demoKey !== key) {
        console.error('[messages] demo material file id is already in use; channel skipped');
        continue;
      }
      if (!file) {
        if (fs.existsSync(filePath)) {
          if (!fs.readFileSync(filePath).equals(bytes)) {
            console.error('[messages] demo material file path is already in use; channel skipped');
            continue;
          }
        } else {
          fs.writeFileSync(filePath, bytes, { flag: 'wx', mode: 0o600 });
        }
        file = { id: fileId, name: 'KU Portal — демонстрационный материал.txt', size: bytes.length,
          owner: sub.teacherId, at: Date.now(), demoKey: key };
        db.files.push(file);
        fileChanged = true;
      } else if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, bytes, { flag: 'wx', mode: 0o600 });
        fileChanged = true;
      } else if (!fs.readFileSync(filePath).equals(bytes)) {
        console.error('[messages] demo material file contents changed; channel skipped');
        continue;
      }
      if (!db.chat.materials.some((m) => m.demoKey === key)) {
        db.chat.materials.push({ id: crypto.createHash('sha256').update(key).digest('hex').slice(0, 24),
          ch: 's:' + sub.id, teacherId: sub.teacherId, kind: 'other', title: 'Демонстрационный файл курса',
          text: 'Пробный закреплённый файл для демонстрации работы канала предмета.',
          file: { id: fileId, name: file.name, size: file.size }, at: Date.now(), pinned: true, demoKey: key });
        created++;
      }
      seededSubjects.add(sub.id);
      registryChanged = true;
    }
    if (registryChanged) db.chat.demoCourseMaterialSeededSubjects = [...seededSubjects];
    if (created || fileChanged || registryChanged) saveDB();
    if (created) console.log('[messages] seeded demo pinned course materials:', created);
    return created;
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
      pushInbox(a.other, { type: 'msg', ch, from: u.fio, text: text.slice(0, 80) || (file ? file.name : '') }); // ch — открыть этот чат по уведомлению
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
    if (p === '/api/message/material/pin' && req.method === 'POST') {
      const m = db.chat.materials.find((x) => x.id === body.id);
      if (!m || !access(u, m.ch).manage) return bad(res, 403, 'Закреплять может преподаватель предмета');
      const on = body.on === true;
      for (const other of db.chat.materials) if (other.ch === m.ch) other.pinned = on && other === m;
      saveDB();
      return ok(res, { pinned: on });
    }
    if (p === '/api/message/material/delete' && req.method === 'POST') return deletePost(db, u, body, res, 'material');
    if (p === '/api/message/task' && req.method === 'POST') return postTask(db, u, body, res);
    if (p === '/api/message/task/edit' && req.method === 'POST') return editPost(db, u, body, res, 'task');
    if (p === '/api/message/task/delete' && req.method === 'POST') return deletePost(db, u, body, res, 'task');
    return false;
  }

  /* -------------------------------- Файлы --------------------------------- */
  async function files(p, req, res, u, body, url) {
    if (p === '/api/files' && req.method === 'POST') {
      const name = clip(body.name, 120).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if (!buf.length) return bad(res, 400, 'Пустой файл');
      if (buf.length > MAX_FILE_BYTES) return bad(res, 400, 'Файл больше 10 МБ');
      const problem = fileProblem(name, buf); // только фото и документы, содержимое совпадает с расширением
      if (problem) return bad(res, 400, problem);
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
      if (f.owner !== u.id && !shared() && !inVisibleClub(u, f.id)) return bad(res, 404, 'Файл не найден');
      const file = path.join(UPLOADS, f.id);
      if (!fs.existsSync(file)) return bad(res, 404, 'Файл не найден');
      // фото отдаются с типом картинки — KU Message показывает их в чате (?inline=1), остальное — только скачать
      const image = url && url.searchParams.get('inline') === '1' && IMAGE_MIME[extOf(f.name)];
      res.writeHead(200, {
        'Content-Type': image || 'application/octet-stream',
        'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      return true;
    }
    return false;
  }

  const handle = async function handle(p, req, res, u, body, url) {
    if (p.startsWith('/api/message/')) return message(p, req, res, u, body, url);
    if (p.startsWith('/api/files')) return files(p, req, res, u, body, url);
    return false;
  };
  handle.seedDemoMaterials = seedDemoMaterials;
  return handle;
}

module.exports = { createMessages, MAX_FILE_BYTES };
