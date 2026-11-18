/*
 * KU Portal — клубы и секции (API под /api/clubs*). Подключается из portal-features.js: createClubs(ctx) → handler.
 * Данные — db.clubs: [{ id, name, icon, desc, weekly, members[], since{uid: ts}, events[] }],
 *   событие (объявление): { id, title, text, date 'YYYY-MM-DD', time 'HH:MM', endTime 'HH:MM', place, limit, hours, people[], absent[], by, weekly }.
 *
 * Правила:
 *   - список клубов видят все; объявления клуба и запись на них — только его участники (студент вступает сам);
 *   - преподаватель — организатор: видит все объявления, создаёт их, отмечает, кто не пришёл;
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

function createClubs(ctx) {
  const { getDB, saveDB, nid, ok, bad } = ctx;
  const userById = (id) => getDB().users.find((x) => x.id === id);

  /* База клубов: создать, дополнить поля новых версий, один раз добавить демо-историю */
  function store() {
    const db = getDB();
    let dirty = false;
    if (!db.clubs) { db.clubs = CLUB_SEED.map((c) => Object.assign({ members: [], since: {}, events: [] }, JSON.parse(JSON.stringify(c)))); dirty = true; }
    for (const c of db.clubs) {
      const seed = CLUB_SEED.find((x) => x.id === c.id);
      if (!c.since) { c.since = {}; dirty = true; }
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
      }
    }
    if (!db.clubsSeeded) { seedExtra(db); db.clubsSeeded = true; dirty = true; }
    if (!db.clubsDemoV2) { seedDemoHistory(db); db.clubsDemoV2 = true; dirty = true; }
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
  function pubEvent(e, c, u) {
    const out = {
      id: e.id, clubId: c.id, club: c.name, icon: c.icon, title: e.title, text: e.text || '', date: e.date, time: e.time, endTime: e.endTime || endOf(e.time, e.hours), place: e.place,
      limit: e.limit || 0, hours: e.hours || 0, count: e.people.length, going: e.people.includes(u.id), mine: e.by === u.id, weekly: !!e.weekly,
    };
    if (u.role === 'teacher') out.people = e.people.map((id) => ({ id, fio: (userById(id) || {}).fio || '—', present: !e.absent.includes(id) }));
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
    const teacher = u.role === 'teacher';
    const items = db.clubs.map((c) => ({
      id: c.id, name: c.name, icon: c.icon, desc: c.desc, members: c.members.length, joined: isMember(c, u), since: c.since[u.id] || null,
      meet: c.weekly ? { day: c.weekly.day, time: c.weekly.time, endTime: endOf(c.weekly.time, c.weekly.hours), place: c.weekly.place } : null,
    }));
    const visible = db.clubs.filter((c) => teacher || isMember(c, u));
    const events = visible.flatMap((c) => c.events.filter((e) => e.date >= today).map((e) => pubEvent(e, c, u)))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const out = { items, events, canCreate: teacher };
    if (teacher) {
      const from = ymd(new Date(Date.now() - RECENT_DAYS * DAY_MS));
      out.recent = db.clubs.flatMap((c) => c.events.filter((e) => e.date < today && e.date >= from && e.people.length).map((e) => pubEvent(e, c, u)))
        .sort((a, b) => b.date.localeCompare(a.date));
    } else out.activity = activityOf(db, u, today);
    return out;
  }

  return async function clubs(p, req, res, u, body) {
    const db = store();
    const today = ymd(new Date());
    const teacher = u.role === 'teacher';
    if (p === '/api/clubs' && req.method === 'GET') {
      if (db.clubs.map(ensureWeekly).some(Boolean)) saveDB();
      return ok(res, listView(db, u, today));
    }
    if (p === '/api/clubs/join' && req.method === 'POST') {
      const c = db.clubs.find((x) => x.id === body.id);
      if (!c) return bad(res, 404, 'Клуб не найден');
      if (teacher) return bad(res, 400, 'Преподаватель — организатор, вступать не нужно');
      c.members = c.members.filter((x) => x !== u.id);
      if (body.on) { c.members.push(u.id); c.since[u.id] = c.since[u.id] || Date.now(); }
      else {
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
      if (!teacher) return bad(res, 403, 'Мероприятия создаёт преподаватель-организатор');
      const c = db.clubs.find((x) => x.id === body.clubId);
      if (!c) return bad(res, 400, 'Выберите клуб');
      const title = clip(body.title, 120);
      if (title.length < 3) return bad(res, 400, 'Укажите название мероприятия');
      if (!isDate(body.date) || body.date < today) return bad(res, 400, 'Укажите дату (не раньше сегодняшней)');
      if (!isTime(body.time)) return bad(res, 400, 'Укажите время (ЧЧ:ММ)');
      if (!isTime(body.endTime) || toMin(body.endTime) <= toMin(body.time)) return bad(res, 400, 'Время окончания должно быть позже начала');
      const limit = Math.max(0, Math.min(1000, Math.floor(Number(body.limit) || 0)));
      // часы в зачёт активности: указанные организатором, иначе — длительность мероприятия
      const given = Number(body.hours);
      const hours = Math.max(0, Math.min(24, Math.round((given > 0 ? given : (toMin(body.endTime) - toMin(body.time)) / 60) * 2) / 2));
      c.events.push({ id: nid('ev'), title, text: clip(body.text, 1000), date: body.date, time: body.time, endTime: body.endTime, place: clip(body.place, 120), limit, hours, people: [], absent: [], by: u.id });
      saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/event/delete' && req.method === 'POST') {
      const { c, e } = findEvent(db, body.id);
      if (!e || e.by !== u.id) return bad(res, 403, 'Удалить можно только своё мероприятие');
      c.events = c.events.filter((x) => x !== e); saveDB();
      return ok(res);
    }
    if (p === '/api/clubs/event/attendance' && req.method === 'POST') {
      if (!teacher) return bad(res, 403, 'Присутствие отмечает организатор');
      const { e } = findEvent(db, body.id);
      if (!e || e.date > today || !e.people.includes(body.uid)) return bad(res, 404, 'Мероприятие не найдено');
      e.absent = e.absent.filter((x) => x !== body.uid);
      if (!body.present) e.absent.push(body.uid);
      saveDB();
      return ok(res);
    }
    return false;
  };
}

module.exports = { createClubs };
