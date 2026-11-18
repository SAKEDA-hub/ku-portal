/*
 * Общежитие (API под /api/dorm*): новости общежития и обращения студентов (ремонт, жалоба — можно анонимно, запрос)
 * со статусами и ответом администрации. Роль администрации пока выполняет преподаватель. Данные — db.dorm.
 * Интерфейс — public/campus.js.
 */
const DORM_STATUSES = ['new', 'work', 'done', 'rejected'];
const DORM_KINDS = ['repair', 'complaint', 'request'];
const DORM_TAGS = ['important', 'info', 'event'];
const DAY_MS = 86400000;
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

function dormNewsSeed(now) {
  return [
    { id: 'n1', tag: 'important', title: 'Плановое отключение горячей воды', text: 'В корпусе №2 горячей воды не будет с 10:00 до 16:00 — профилактика бойлерной.', at: now - 2 * 3600e3, author: 'Администрация' },
    { id: 'n2', tag: 'info', title: 'Прачечная — новое время работы', text: 'Прачечная на 1 этаже работает ежедневно с 8:00 до 22:00. Запись — у дежурного.', at: now - DAY_MS, author: 'Администрация' },
    { id: 'n3', tag: 'event', title: 'Вечер настольных игр', text: 'В пятницу в 19:00 в комнате отдыха. Приносите свои игры!', at: now - 2 * DAY_MS, author: 'Студсовет общежития' },
    { id: 'n4', tag: 'info', title: 'Wi-Fi в общежитии', text: 'Сеть KU-Dorm, логин и пароль — как в портале университета. Если не подключается — оставьте заявку «Интернет».', at: now - 5 * DAY_MS, author: 'IT-отдел' },
  ];
}

function createDorm({ getDB, saveDB, nid, ok, bad, pushInbox }) {
  const userById = (id) => getDB().users.find((x) => x.id === id);
  function store() {
    const db = getDB();
    if (!db.dorm) db.dorm = { news: dormNewsSeed(Date.now()), requests: [] };
    return db;
  }
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

  return async function handle(p, req, res, u, body) {
    return p.startsWith('/api/dorm') ? dorm(p, req, res, u, body) : false;
  };
}

module.exports = { createDorm };
