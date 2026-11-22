/*
 * Клубы и секции (API под /api/clubs*). Подключается из server.js: createClubs(ctx) → handler. Интерфейс — public/campus.js.
 * Данные — db.clubs: [{ id, name, icon, desc, weekly, members[], since{uid: ts}, requests{uid: ts}, events[], posts[], chat[] }],
 *   событие (объявление): { id, title, text, date 'YYYY-MM-DD', time 'HH:MM', endTime 'HH:MM', place, limit, hours, people[], absent[], by, weekly };
 *   публикация канала: { id, by, text, at }; сообщение чата участников: { id, from, text, at }. Прочитанное — db.clubReads{uid: {'ch:<id>'|'chat:<id>': ts}}.
 *
 * Правила:
 *   - руководит клубом тот, кому оператор назначил его (права clubs: ID клубов, '*' — менеджер, все клубы); роль не важна;
 *   - список клубов видят все; студент подаёт заявку (requests), руководитель клуба принимает или отклоняет;
 *   - объявления, канал клуба (публикует только руководитель) и чат участников — только участникам и руководителям;
 *   - руководитель видит объявления своих клубов, создаёт их, отмечает, кто не пришёл;
 *   - профиль активности студента: где был (прошедшие события, на которые записался и не отмечен «не пришёл»),
 *     часы по клубам и отдельно часы волонтёрства, клубы с датой вступления, предстоящие записи.
 */
const DAY_MS = 86400000;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isTime = (s) => /^\d{2}:\d{2}$/.test(String(s || ''));
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const fromMin = (n) => { const v = Math.max(0, Math.min(24 * 60 - 1, Math.round(n))); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
/* Время окончания по началу и длительности в часах (для событий, созданных до появления поля) */
const endOf = (time, hours) => fromMin(toMin(time || '12:00') + (Number(hours) || 1) * 60);
const RECENT_DAYS = 30; // сколько дней преподаватель видит прошедшие события для отметки присутствия

const CLUB_SEED = [
  { id: 'football', name: 'Футбол', icon: 'ball', desc: 'Сборная университета и любительские матчи между факультетами. Новичкам рады.', weekly: { day: 2, time: '18:00', place: 'Стадион KU', title: 'Тренировка', hours: 1.5 } },
  { id: 'basketball', name: 'Баскетбол', icon: 'hoop', desc: 'Тренировки, турниры 3×3 и игры с командами других вузов Костаная.', weekly: { day: 3, time: '17:30', place: 'Спортзал, корпус 1', title: 'Тренировка', hours: 1.5 } },
  { id: 'volunteer', name: 'Волонтёрство', icon: 'heart', desc: 'Помощь приютам, экологические субботники, сопровождение университетских мероприятий.', weekly: { day: 5, time: '11:00', place: 'Студенческий центр', title: 'Встреча волонтёров', hours: 2 } },
  { id: 'debate', name: 'Дебатный клуб', icon: 'msg', desc: 'Учимся аргументировать, выступать публично и готовимся к турнирам на трёх языках.', weekly: { day: 1, time: '16:00', place: 'Ауд. 214', title: 'Игра в формате АПФ', hours: 1.5 } },
  { id: 'chess', name: 'Шахматы', icon: 'crown', desc: 'Блиц по пятницам, разбор партий и рейтинговый турнир каждый семестр.', weekly: { day: 4, time: '15:00', place: 'Библиотека, читальный зал', title: 'Блиц-турнир', hours: 1 } },
];
/* [клуб, через сколько дней, название, время, место, мест, часов, описание] */
const EXTRA_EVENTS = [
  ['football', 9, 'Кубок факультетов: полуфинал', '16:00', 'Стадион KU', 60, 2, 'Играем против факультета экономики. Сбор за 30 минут до начала, форма — синяя.'],
  ['volunteer', 6, 'Субботник в городском парке', '10:00', 'Центральный парк, у входа', 30, 4, 'Уборка аллей и посадка деревьев. Перчатки и инвентарь выдадим на месте.'],
  ['debate', 12, 'Открытый турнир KU Debate', '14:00', 'Актовый зал', 24, 3, 'Командный турнир в формате АПФ. Регистрация команд по 2 человека.'],
];
/* Прошедшие события для демо-профиля активности: [клуб, сколько дней назад, название, часов, кто был (email)] */
const DEMO_HISTORY = [
  ['volunteer', 24, 'Экологический субботник у реки Тобол', 3, ['student@demo.kz', 'student2@demo.kz']],
  ['volunteer', 10, 'Помощь приюту для животных', 4, ['student@demo.kz', 'student2@demo.kz']],
  ['football', 7, 'Товарищеский матч с командой КРУ', 2, ['student@demo.kz']],
  ['chess', 3, 'Блиц-турнир', 1, ['student@demo.kz']],
  ['debate', 5, 'Игра в формате АПФ', 1.5, ['student2@demo.kz']],
];
const DEMO_MEMBERS = { 'student@demo.kz': ['volunteer', 'football', 'chess'], 'student2@demo.kz': ['volunteer', 'debate'] };
/* Демо-канал и чат: [клуб, сколько часов назад, текст]; в чате ещё автор (email) */
const DEMO_POSTS = [
  ['volunteer', 50, 'Друзья, спасибо всем, кто пришёл на субботник у Тобола! Собрали 40 мешков мусора. Часы уже в профиле активности.'],
  ['volunteer', 6, 'В субботу едем в приют для животных. Нужны 10 человек — записывайтесь на мероприятие в канале.'],
  ['football', 30, 'Тренировка во вторник переносится на 18:30 — стадион занят до шести.'],
  ['chess', 20, 'Итоги блица: первое место — 5 из 5. Разбор партий в пятницу в читальном зале.'],
  ['debate', 12, 'Тема следующей игры: «Университеты должны отменить экзамены». Готовьте аргументы.'],
];
const DEMO_CHAT = [
  ['volunteer', 'student2@demo.kz', 26, 'Кто едет в приют в субботу? Можно вместе от общежития.'],
  ['volunteer', 'student@demo.kz', 25, 'Я еду! Встречаемся у входа в 10:30.'],
  ['football', 'student@demo.kz', 4, 'Кто-нибудь может одолжить бутсы 42 размера на матч?'],
];
const DEMO_REQUESTS = { 'student2@demo.kz': ['chess'] };
const MAX_TEXT = 2000;
const HOUR_MS = 3600000;
const { fileRef } = require('./files'); // вложения в канале и чате клуба — те же правила, что в KU Message

function createClubs(ctx) {
  const { getDB, saveDB, nid, ok, bad, pushInbox, permsOf } = ctx;
  const markDirty = ctx.markDirty || (() => {});
  const userById = (id) => getDB().users.find((x) => x.id === id);

  /* База клубов: создать, дополнить поля новых версий, один раз добавить демо-историю */
  function store() {
    const db = getDB();
    let dirty = false;
    if (!db.clubs) { db.clubs = CLUB_SEED.map((c) => Object.assign({ members: [], since: {}, events: [] }, JSON.parse(JSON.stringify(c)))); dirty = true; }
    for (const c of db.clubs) {
      const seed = CLUB_SEED.find((x) => x.id === c.id);
      if (!c.since) { c.since = {}; dirty = true; }
      for (const k of ['posts', 'chat']) if (!c[k]) { c[k] = []; dirty = true; }
      if (!c.requests) { c.requests = {}; dirty = true; }
      if (seed && c.weekly && c.weekly.hours == null) { c.weekly.hours = seed.weekly.hours; dirty = true; }
      for (const e of c.events) {
        if (e.hours == null) { // события из прошлой версии: часы и описание — из демо-данных, иначе по умолчанию
          const x = EXTRA_EVENTS.find((r) => r[0] === c.id && r[2] === e.title);
          e.hours = x ? x[6] : e.weekly && c.weekly ? c.weekly.hours : 2;
          if (x && !e.text) e.text = x[7];
          dirty = true;
        }
        if (!e.absent) { e.absent = []; dirty = true; }
        if (!e.endTime) { e.endTime = endOf(e.time, e.hours); dirty = true; }
        if (!e.at && !e.weekly) { e.at = Math.min(Date.now(), new Date(e.date + 'T09:00').getTime() - 5 * DAY_MS); dirty = true; } // время публикации в канале
      }
    }
    /* Imported accounts join only the isolated DEMO clubs; production data never reads this field. */
    if (process.env.DEMO === '1') {
      const now = Date.now();
      for (const user of db.users.filter((x) => x.demo && Array.isArray(x.demoClubs))) {
        for (const clubId of user.demoClubs) {
          const club = db.clubs.find((x) => x.id === clubId);
          if (!club || club.members.includes(user.id)) continue;
          club.members.push(user.id);
          club.since[user.id] = now - 40 * DAY_MS;
          dirty = true;
        }
      }
    }
    if (!db.clubsSeeded) { seedExtra(db); db.clubsSeeded = true; dirty = true; }
    if (!db.clubsDemoV2) { seedDemoHistory(db); db.clubsDemoV2 = true; dirty = true; }
    if (!db.clubsDemoV3) { seedDemoFeed(db); db.clubsDemoV3 = true; dirty = true; }
    if (!db.clubReads) { db.clubReads = {}; dirty = true; }
    if (dirty) saveDB();
    return db;
  }
  function seedExtra(db) {
    const now = Date.now();
    for (const [cid, days, title, time, place, limit, hours, text] of EXTRA_EVENTS) {
      const c = db.clubs.find((x) => x.id === cid);
      if (c) c.events.push({ id: nid('ev'), title, text, date: ymd(new Date(now + days * DAY_MS)), time, endTime: endOf(time, hours), place, limit, hours, people: [], absent: [], by: null });
    }
  }
  function seedDemoHistory(db) {
    const byEmail = (em) => db.users.find((x) => x.email === em && x.demo);
    const now = Date.now();
    for (const [em, ids] of Object.entries(DEMO_MEMBERS)) {
      const u = byEmail(em); if (!u) continue;
      for (const cid of ids) {
        const c = db.clubs.find((x) => x.id === cid);
        if (c && !c.members.includes(u.id)) { c.members.push(u.id); c.since[u.id] = now - 40 * DAY_MS; }
      }
    }
    for (const [cid, days, title, hours, emails] of DEMO_HISTORY) {
      const c = db.clubs.find((x) => x.id === cid); if (!c) continue;
      const people = emails.map(byEmail).filter(Boolean).map((x) => x.id);
      const time = (c.weekly && c.weekly.time) || '12:00';
      c.events.push({ id: nid('ev'), title, text: '', date: ymd(new Date(now - days * DAY_MS)), time, endTime: endOf(time, hours), place: (c.weekly && c.weekly.place) || '', limit: 0, hours, people, absent: [], by: null });
    }
  }
  function seedDemoFeed(db) {
    const byEmail = (em) => db.users.find((x) => x.email === em && x.demo);
    const head = db.users.find((x) => x.email === 'clubs@demo.kz' && x.demo);
    const now = Date.now();
    for (const [cid, hrs, text] of DEMO_POSTS) {
      const c = db.clubs.find((x) => x.id === cid);
      if (c && head) c.posts.push({ id: nid('cp'), by: head.id, text, at: now - hrs * HOUR_MS });
    }
    for (const [cid, em, hrs, text] of DEMO_CHAT) {
      const c = db.clubs.find((x) => x.id === cid), u = byEmail(em);
      if (c && u && c.members.includes(u.id)) c.chat.push({ id: nid('cm'), from: u.id, text, at: now - hrs * HOUR_MS });
    }
    for (const [em, ids] of Object.entries(DEMO_REQUESTS)) {
      const u = byEmail(em); if (!u) continue;
      for (const cid of ids) { const c = db.clubs.find((x) => x.id === cid); if (c && !c.members.includes(u.id)) c.requests[u.id] = now - 20 * HOUR_MS; }
    }
  }
  /* Регулярная встреча клуба: ближайшая дата по дню недели — создаётся, когда прошлая прошла */
  function ensureWeekly(c) {
    if (!c.weekly) return false;
    const today = ymd(new Date());
    if (c.events.some((e) => e.weekly && e.date >= today)) return false;
    const d = new Date();
    while ((d.getDay() + 6) % 7 !== c.weekly.day) d.setDate(d.getDate() + 1);
    c.events.push({ id: nid('ev'), title: c.weekly.title, text: '', date: ymd(d), time: c.weekly.time, endTime: endOf(c.weekly.time, c.weekly.hours), place: c.weekly.place, limit: 0, hours: c.weekly.hours || 1, people: [], absent: [], by: null, weekly: true });
    return true;
  }
  const isMember = (c, u) => c.members.includes(u.id);
  const clubsOf = (u) => permsOf(u).clubs;
  const isLead = (u) => clubsOf(u).length > 0;
  const canManage = (c, u) => !!c && (clubsOf(u).includes('*') || clubsOf(u).includes(c.id));
  const canSee = (c, u) => canManage(c, u) || isMember(c, u); // руководитель клуба видит всё
  const readAt = (db, u, key) => (db.clubReads[u.id] || {})[key] || 0;
  function markRead(db, u, key) { db.clubReads[u.id] = db.clubReads[u.id] || {}; db.clubReads[u.id][key] = Date.now(); }
  /* Новое в канале (публикации и объявления глав) и в чате (сообщения других участников) */
  function unreadOf(db, c, u) {
    const rc = readAt(db, u, 'ch:' + c.id), rt = readAt(db, u, 'chat:' + c.id);
    const posts = c.posts.filter((x) => x.at > rc && x.by !== u.id).length + c.events.filter((e) => e.at && e.at > rc && e.by !== u.id).length;
    return { channel: posts, chat: c.chat.filter((x) => x.at > rt && x.from !== u.id).length };
  }
  function lastOf(c) {
    const p = c.posts[c.posts.length - 1], e = c.events.filter((x) => x.at).sort((a, b) => a.at - b.at).pop();
    const x = p && (!e || p.at >= e.at) ? { at: p.at, text: p.text || (p.file ? '📎 ' + p.file.name : '') } : e ? { at: e.at, text: '📅 ' + e.title } : null;
    return x ? { at: x.at, text: x.text.slice(0, 120) } : null;
  }
  const person = (id, c) => { const x = userById(id) || {}; return { id, fio: x.fio || '—', role: x.role || 'student', group: x.group || '', lead: !!(c && x.id && canManage(c, x)) }; };
  function pubEvent(e, c, u) {
    const out = {
      id: e.id, clubId: c.id, club: c.name, icon: c.icon, title: e.title, text: e.text || '', date: e.date, time: e.time, endTime: e.endTime || endOf(e.time, e.hours), place: e.place,
      limit: e.limit || 0, hours: e.hours || 0, count: e.people.length, going: e.people.includes(u.id), mine: e.by === u.id, weekly: !!e.weekly,
    };
    if (canManage(c, u)) out.people = e.people.map((id) => ({ id, fio: (userById(id) || {}).fio || '—', present: !e.absent.includes(id) }));
    return out;
  }
  function activityOf(db, u, today) {
    const history = [], upcoming = [];
    const perClub = {};
    for (const c of db.clubs) {
      for (const e of c.events) {
        if (!e.people.includes(u.id)) continue;
        if (e.date >= today) { upcoming.push(pubEvent(e, c, u)); continue; }
        const present = !e.absent.includes(u.id);
        history.push({ id: e.id, clubId: c.id, club: c.name, icon: c.icon, title: e.title, date: e.date, hours: present ? e.hours || 0 : 0, present });
        if (present) { const pc = perClub[c.id] = perClub[c.id] || { events: 0, hours: 0 }; pc.events++; pc.hours += e.hours || 0; }
      }
    }
    history.sort((a, b) => b.date.localeCompare(a.date));
    upcoming.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const attended = history.filter((h) => h.present);
    const round = (n) => Math.round(n * 10) / 10;
    const sum = (rows) => round(rows.reduce((a, h) => a + h.hours, 0));
    const mine = db.clubs.filter((c) => isMember(c, u));
    return {
      totals: { events: attended.length, hours: sum(attended), volunteerHours: sum(attended.filter((h) => h.clubId === 'volunteer')), clubs: mine.length },
      clubs: mine.map((c) => ({ id: c.id, name: c.name, icon: c.icon, since: c.since[u.id] || null, events: (perClub[c.id] || {}).events || 0, hours: round((perClub[c.id] || {}).hours || 0) })),
      history, upcoming,
    };
  }
  function findEvent(db, id) {
    for (const c of db.clubs) { const e = c.events.find((x) => x.id === id); if (e) return { c, e }; }
    return {};
  }
  function listView(db, u, today) {
    const lead = isLead(u);
    const items = db.clubs.map((c) => {
      const x = {
        id: c.id, name: c.name, icon: c.icon, desc: c.desc, members: c.members.length, joined: isMember(c, u), since: c.since[u.id] || null,
        pending: !!c.requests[u.id], manage: canManage(c, u),
        meet: c.weekly ? { day: c.weekly.day, time: c.weekly.time, endTime: endOf(c.weekly.time, c.weekly.hours), place: c.weekly.place } : null,
      };
      if (canSee(c, u)) Object.assign(x, { unread: unreadOf(db, c, u), last: lastOf(c) });
      if (x.manage) x.requests = Object.entries(c.requests).sort((a, b) => a[1] - b[1]).map(([id, at]) => Object.assign(person(id), { at }));
      return x;
    });
    const visible = db.clubs.filter((c) => canSee(c, u));
    const events = visible.flatMap((c) => c.events.filter((e) => e.date >= today).map((e) => pubEvent(e, c, u)))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const out = { items, events, canCreate: lead, canJoin: u.role === 'student' };
    if (lead) {
      const from = ymd(new Date(Date.now() - RECENT_DAYS * DAY_MS));
      out.recent = db.clubs.filter((c) => canManage(c, u)).flatMap((c) => c.events.filter((e) => e.date < today && e.date >= from && e.people.length).map((e) => pubEvent(e, c, u)))
        .sort((a, b) => b.date.localeCompare(a.date));
    }
    if (u.role === 'student') out.activity = activityOf(db, u, today);
    return out;
  }

  /* ---------- Заявки, канал и чат клуба (KU Message, раздел «Клубы») ---------- */
  function feedApi(db, p, req, res, u, body, url, today) {
    const club = (id) => db.clubs.find((x) => x.id === id);
    const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
    if (p === '/api/clubs/request' && req.method === 'POST') {
      const c = club(body.id);
      if (!canManage(c, u)) return bad(res, 403, 'Заявки рассматривает руководитель клуба');
      if (!own(c.requests, body.uid)) return bad(res, 404, 'Заявка не найдена');
      delete c.requests[body.uid];
      const st = userById(body.uid);
      if (body.accept && st && !isMember(c, st)) { c.members.push(st.id); c.since[st.id] = Date.now(); }
      if (st && pushInbox) pushInbox(st, { type: 'club', clubId: c.id, club: c.name, accepted: !!body.accept });
      saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/feed' && req.method === 'GET') {
      const c = club(url.searchParams.get('id'));
      if (!c) return bad(res, 404, 'Клуб не найден');
      if (!canSee(c, u)) return bad(res, 403, 'Канал клуба — только для участников');
      markRead(db, u, 'ch:' + c.id); markDirty();
      const posts = c.posts.map((x) => ({ id: x.id, type: 'post', text: x.text, file: x.file || null, at: x.at, by: person(x.by, c), mine: x.by === u.id }))
        .concat(c.events.filter((e) => e.at && !e.weekly).map((e) => Object.assign(pubEvent(e, c, u), { type: 'event', at: e.at, by: person(e.by, c), past: e.date < today })))
        .sort((a, b) => a.at - b.at).slice(-200);
      const upcoming = c.events.filter((e) => e.date >= today).map((e) => pubEvent(e, c, u)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return ok(res, { id: c.id, name: c.name, icon: c.icon, desc: c.desc, members: c.members.length, manage: canManage(c, u), posts, upcoming, unread: unreadOf(db, c, u) });
    }
    if (p === '/api/clubs/post' && req.method === 'POST') {
      const c = club(body.id);
      if (!canManage(c, u)) return bad(res, 403, 'Публикует руководитель клуба');
      const text = clip(body.text, MAX_TEXT);
      const file = fileRef(db, u, body.fileId);
      if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
      if (!text && !file) return bad(res, 400, 'Пустое сообщение');
      c.posts.push(Object.assign({ id: nid('cp'), by: u.id, text, at: Date.now() }, file ? { file } : {}));
      markRead(db, u, 'ch:' + c.id);
      saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/post/delete' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.posts.some((y) => y.id === body.id));
      const x = c && c.posts.find((y) => y.id === body.id);
      if (!x || (x.by !== u.id && !canManage(c, u))) return bad(res, 403, 'Удалить можно только свою публикацию');
      c.posts = c.posts.filter((y) => y !== x); saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/chat' && req.method === 'GET') {
      const c = club(url.searchParams.get('id'));
      if (!c) return bad(res, 404, 'Клуб не найден');
      if (!canSee(c, u)) return bad(res, 403, 'Чат клуба — только для участников');
      markRead(db, u, 'chat:' + c.id); markDirty();
      const ids = new Set(c.chat.slice(-300).map((m) => m.from));
      return ok(res, {
        id: c.id, name: c.name, icon: c.icon, members: c.members.length,
        people: [...ids].map((id) => person(id, c)), items: c.chat.slice(-300).map((m) => ({ id: m.id, from: m.from, text: m.text, file: m.file || null, at: m.at })),
        roster: c.members.map((id) => person(id, c)), manage: canManage(c, u),
      });
    }
    if (p === '/api/clubs/chat/send' && req.method === 'POST') {
      const c = club(body.id);
      if (!c || !canSee(c, u)) return bad(res, 403, 'Чат клуба — только для участников');
      const text = clip(body.text, MAX_TEXT);
      const file = fileRef(db, u, body.fileId);
      if (file === undefined) return bad(res, 400, 'Файл не найден — загрузите его заново');
      if (!text && !file) return bad(res, 400, 'Пустое сообщение');
      c.chat.push(Object.assign({ id: nid('cm'), from: u.id, text, at: Date.now() }, file ? { file } : {}));
      if (c.chat.length > 2000) c.chat.splice(0, c.chat.length - 2000);
      markRead(db, u, 'chat:' + c.id);
      saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/chat/delete' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.chat.some((y) => y.id === body.id));
      const m = c && c.chat.find((y) => y.id === body.id);
      if (!m || (m.from !== u.id && !canManage(c, u))) return bad(res, 403, 'Удалить можно только своё сообщение');
      c.chat = c.chat.filter((y) => y !== m); saveDB();
      return ok(res);
    }
    return false;
  }

  return async function clubs(p, req, res, u, body, url) {
    const db = store();
    const today = ymd(new Date());
    if (p === '/api/clubs' && req.method === 'GET') {
      if (db.clubs.map(ensureWeekly).some(Boolean)) saveDB();
      return ok(res, listView(db, u, today));
    }
    if (p === '/api/clubs/join' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.id === body.id);
      if (!c) return bad(res, 404, 'Клуб не найден');
      if (u.role !== 'student') return bad(res, 400, 'Вступать в клубы могут студенты');
      if (canManage(c, u)) return bad(res, 400, 'Вы руководите этим клубом — вступать не нужно');
      if (body.on) { // заявка — в клуб принимает глава
        if (!isMember(c, u) && !c.requests[u.id]) { c.requests[u.id] = Date.now(); saveDB(); }
        return ok(res, { members: c.members.length, pending: !isMember(c, u) });
      }
      delete c.requests[u.id];
      if (isMember(c, u)) {
        c.members = c.members.filter((x) => x !== u.id);
        delete c.since[u.id];
        c.events.filter((e) => e.date >= today).forEach((e) => { e.people = e.people.filter((x) => x !== u.id); }); // записи на будущие встречи снимаются
      }
      saveDB();
      return ok(res, { members: c.members.length });
    }
    if (p === '/api/clubs/event/register' && req.method === 'POST') {
      const { c, e } = findEvent(db, body.id);
      if (!e || e.date < today) return bad(res, 404, 'Мероприятие не найдено');
      if (!isMember(c, u)) return bad(res, 403, 'Сначала вступите в клуб');
      const was = e.people.includes(u.id);
      if (body.on && !was && e.limit && e.people.length >= e.limit) return bad(res, 400, 'Мест больше нет');
      e.people = e.people.filter((x) => x !== u.id);
      if (body.on) e.people.push(u.id);
      saveDB();
      return ok(res, { count: e.people.length });
    }
    if (p === '/api/clubs/event' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.id === body.clubId);
      if (!c) return bad(res, 400, 'Выберите клуб');
      if (!canManage(c, u)) return bad(res, 403, 'Мероприятия создаёт руководитель клуба');
      const title = clip(body.title, 120);
      if (title.length < 3) return bad(res, 400, 'Укажите название мероприятия');
      if (!isDate(body.date) || body.date < today) return bad(res, 400, 'Укажите дату (не раньше сегодняшней)');
      if (!isTime(body.time)) return bad(res, 400, 'Укажите время (ЧЧ:ММ)');
      if (!isTime(body.endTime) || toMin(body.endTime) <= toMin(body.time)) return bad(res, 400, 'Время окончания должно быть позже начала');
      const limit = Math.max(0, Math.min(1000, Math.floor(Number(body.limit) || 0)));
      // часы в зачёт активности: указанные организатором, иначе — длительность мероприятия
      const given = Number(body.hours);
      const hours = Math.max(0, Math.min(24, Math.round((given > 0 ? given : (toMin(body.endTime) - toMin(body.time)) / 60) * 2) / 2));
      c.events.push({ id: nid('ev'), title, text: clip(body.text, 1000), date: body.date, time: body.time, endTime: body.endTime, place: clip(body.place, 120), limit, hours, people: [], absent: [], by: u.id, at: Date.now() });
      saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/event/delete' && req.method === 'POST') {
      const { c, e } = findEvent(db, body.id);
      if (!e || (e.by !== u.id && !canManage(c, u))) return bad(res, 403, 'Удалить можно только своё мероприятие');
      c.events = c.events.filter((x) => x !== e); saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/event/attendance' && req.method === 'POST') {
      const { c, e } = findEvent(db, body.id);
      if (!canManage(c, u)) return bad(res, 403, 'Присутствие отмечает руководитель клуба');
      if (!e || e.date > today || !e.people.includes(body.uid)) return bad(res, 404, 'Мероприятие не найдено');
      e.absent = e.absent.filter((x) => x !== body.uid);
      if (!body.present) e.absent.push(body.uid);
      saveDB();
      return ok(res);
    }
    return feedApi(db, p, req, res, u, body, url, today);
  };
}

module.exports = { createClubs };
