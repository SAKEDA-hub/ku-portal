'use strict';
/*
 * Голосование (/api/polls*): опросы создаёт администратор портала (право admin), голосуют подтверждённые пользователи.
 * Анонимно: в опросе хранятся только счётчики по вариантам и отпечатки sha256(соль опроса + ID) проголосовавших —
 * по базе нельзя узнать, кто за что голосовал, но второй голос не пройдёт. Изменить голос нельзя.
 * Данные — db.polls: [{ id, q, opts, audience: 'all'|'students', groups, endsAt, closedAt, salt, counts, voters, createdBy, createdAt }].
 */
const crypto = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;
const LIMITS = { question: 200, option: 100, minOpts: 2, maxOpts: 8, maxDays: 60, maxPolls: 200, maxGroups: 50 };

function createPolls({ getDB, saveDB, nid, ok, bad, permsOf, audit }) {
  const list = () => { const db = getDB(); db.polls = Array.isArray(db.polls) ? db.polls : []; return db.polls; };
  const voterKey = (poll, uid) => crypto.createHash('sha256').update(poll.salt + ':' + uid).digest('hex');
  const isClosed = (poll, now = Date.now()) => !!poll.closedAt || poll.endsAt <= now;
  const canManage = u => permsOf(u).admin;
  function visible(poll, u) {
    if (poll.audience === 'students' && u.role !== 'student') return false;
    if (Array.isArray(poll.groups) && poll.groups.length && !(u.role === 'student' && poll.groups.includes(u.group))) return false;
    return true;
  }
  function view(poll, u) {
    const voted = !!poll.voters[voterKey(poll, u.id)], closed = isClosed(poll), manage = canManage(u);
    const total = poll.counts.reduce((a, b) => a + b, 0);
    return {
      id: poll.id, q: poll.q, opts: poll.opts, endsAt: poll.endsAt, closed, voted, total,
      audience: poll.audience, groups: poll.groups || [],
      counts: voted || closed || manage ? poll.counts : null, // до своего голоса результаты не подсказывают выбор
    };
  }
  const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

  return async function handle(p, req, res, u, body) {
    if (!p.startsWith('/api/polls')) return false;
    const polls = list();
    if (p === '/api/polls' && req.method === 'GET') {
      const items = polls.filter(x => canManage(u) || visible(x, u)).map(x => view(x, u)).sort((a, b) => (a.closed - b.closed) || a.endsAt - b.endsAt);
      return ok(res, { items, manage: canManage(u) });
    }
    if (req.method !== 'POST') return bad(res, 404, 'Не найдено');
    if (p === '/api/polls/vote') {
      const poll = polls.find(x => x.id === body.id);
      if (!poll || !visible(poll, u)) return bad(res, 404, 'Опрос не найден');
      if (isClosed(poll)) return bad(res, 400, 'Голосование завершено');
      const opt = Number(body.opt);
      if (!Number.isInteger(opt) || opt < 0 || opt >= poll.opts.length) return bad(res, 400, 'Выберите вариант');
      const key = voterKey(poll, u.id);
      if (poll.voters[key]) return bad(res, 400, 'Вы уже проголосовали');
      poll.voters[key] = 1; poll.counts[opt] += 1;
      saveDB();
      return ok(res, { poll: view(poll, u) });
    }
    if (!canManage(u)) return bad(res, 403, 'Опросы создаёт администратор портала');
    if (p === '/api/polls/create') {
      const q = cleanText(body.q, LIMITS.question);
      const opts = (Array.isArray(body.opts) ? body.opts : []).map(o => cleanText(o, LIMITS.option)).filter(Boolean);
      const days = Number(body.days);
      const groups = [...new Set((Array.isArray(body.groups) ? body.groups : []).map(g => cleanText(g, 100)).filter(Boolean))].slice(0, LIMITS.maxGroups);
      if (q.length < 3) return bad(res, 400, 'Напишите вопрос');
      if (opts.length < LIMITS.minOpts || opts.length > LIMITS.maxOpts || new Set(opts).size !== opts.length) return bad(res, 400, `Нужно от ${LIMITS.minOpts} до ${LIMITS.maxOpts} разных вариантов`);
      if (!Number.isInteger(days) || days < 1 || days > LIMITS.maxDays) return bad(res, 400, `Срок — от 1 до ${LIMITS.maxDays} дней`);
      if (polls.length >= LIMITS.maxPolls) return bad(res, 400, 'Слишком много опросов — удалите старые');
      const poll = {
        id: nid('poll'), q, opts, audience: body.audience === 'students' || groups.length ? 'students' : 'all', groups,
        endsAt: Date.now() + days * DAY_MS, closedAt: null, salt: crypto.randomBytes(16).toString('hex'),
        counts: opts.map(() => 0), voters: {}, createdBy: u.id, createdAt: Date.now(),
      };
      polls.push(poll); saveDB();
      audit('poll.create', u.id, poll.id);
      return ok(res, { poll: view(poll, u) });
    }
    const poll = polls.find(x => x.id === body.id);
    if (!poll) return bad(res, 404, 'Опрос не найден');
    if (p === '/api/polls/close') {
      if (!poll.closedAt) { poll.closedAt = Date.now(); saveDB(); audit('poll.close', u.id, poll.id); }
      return ok(res, { poll: view(poll, u) });
    }
    if (p === '/api/polls/delete') {
      getDB().polls = polls.filter(x => x !== poll); saveDB();
      audit('poll.delete', u.id, poll.id);
      return ok(res);
    }
    return bad(res, 404, 'Не найдено');
  };
}

module.exports = { createPolls, LIMITS };
