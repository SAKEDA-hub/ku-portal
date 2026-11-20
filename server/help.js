'use strict';
/*
 * Помощь преподавателю (ревью п.10): обращения к администрации портала — вопрос, расписание (обжалование, ошибка),
 * технический сбой, другое. Преподаватель создаёт обращение и видит ответ и статус (портал, #/help — public/services.js).
 * Отвечает администратор в админ-панели (/admin/, раздел «Обращения» — server/admin.js вызывает listAll/reply).
 *
 * Данные — db.help: [{ id, by, category, text, at, status: new|work|done|rejected, reply, replyAt, replyBy }].
 * При удалении пользователя его обращения убираются в server/cleanup.js (scrubUsers).
 */
const HELP_CATEGORIES = ['question', 'schedule', 'tech', 'other'];
const HELP_STATUSES = ['new', 'work', 'done', 'rejected'];
const TEXT_MIN = 10;
const TEXT_MAX = 2000;
const REPLY_MAX = 2000;
const OPEN_LIMIT = 20; // открытых обращений у одного человека одновременно — защита от засорения
const DAY_LIMIT = 10; // новых обращений у одного человека за сутки
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

function createHelp({ getDB, saveDB, nid, ok, bad, pushInbox }) {
  const store = () => { const db = getDB(); if (!Array.isArray(db.help)) db.help = []; return db.help; };
  const pub = (r) => ({ id: r.id, category: r.category, text: r.text, at: r.at, status: r.status, reply: r.reply || '', replyAt: r.replyAt || null });

  /* API преподавателя: свои обращения и новое обращение */
  async function handle(p, req, res, u, body) {
    if (p !== '/api/help') return false;
    if (u.role !== 'teacher') return bad(res, 403, 'Раздел «Помощь» — для преподавателей');
    const items = store();
    if (req.method === 'GET') {
      return ok(res, { items: items.filter((r) => r.by === u.id).sort((a, b) => b.at - a.at).map(pub) });
    }
    if (req.method !== 'POST') return bad(res, 404, 'Не найдено');
    const category = HELP_CATEGORIES.includes(body.category) ? body.category : '';
    const text = clip(body.text, TEXT_MAX);
    if (!category) return bad(res, 400, 'Выберите тему обращения');
    if (text.length < TEXT_MIN) return bad(res, 400, 'Опишите вопрос подробнее (не меньше 10 символов)');
    if (items.filter((r) => r.by === u.id && (r.status === 'new' || r.status === 'work')).length >= OPEN_LIMIT) {
      return bad(res, 429, 'Слишком много открытых обращений — дождитесь ответа на прежние');
    }
    if (items.filter((r) => r.by === u.id && r.at > Date.now() - 864e5).length >= DAY_LIMIT) {
      return bad(res, 429, 'Слишком много обращений за сутки — попробуйте завтра');
    }
    const r = { id: nid('help'), by: u.id, category, text, at: Date.now(), status: 'new', reply: '' };
    items.push(r);
    saveDB();
    return ok(res, { item: pub(r) });
  }

  /* Для админ-панели: все обращения (новые и в работе — сверху) с автором */
  function listAll() {
    const users = getDB().users;
    const rank = { new: 0, work: 1, done: 2, rejected: 2 };
    return store().slice().sort((a, b) => (rank[a.status] - rank[b.status]) || b.at - a.at).map((r) => {
      const x = users.find((y) => y.id === r.by) || {};
      return Object.assign(pub(r), { by: r.by, fio: x.fio || '—', email: x.email || '' });
    });
  }
  /* Ответ администратора: статус и текст; автор получает уведомление (тип help) */
  function reply(admin, body) {
    const r = store().find((x) => x.id === body.id);
    if (!r) return { error: [404, 'Обращение не найдено'] };
    if (!HELP_STATUSES.includes(body.status)) return { error: [400, 'Неверный статус'] };
    const text = clip(body.reply, REPLY_MAX);
    Object.assign(r, { status: body.status, reply: text, replyAt: Date.now(), replyBy: admin.id });
    const author = getDB().users.find((x) => x.id === r.by);
    if (author && pushInbox) pushInbox(author, { type: 'help', status: r.status, reply: text.slice(0, 120) });
    saveDB();
    return { item: pub(r) };
  }

  return { handle, listAll, reply };
}

module.exports = { createHelp, HELP_CATEGORIES, HELP_STATUSES };
