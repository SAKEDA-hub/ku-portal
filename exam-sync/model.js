'use strict';

const crypto = require('node:crypto');
const { HttpError } = require('../server/http');
const { studentQuestion, scoreQuestion, round } = require('./grading');

const collections = ['users', 'tests', 'rooms', 'attempts', 'writings', 'queue', 'grades', 'timers'];
const parts = ['test', 'writing', 'speaking'];
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const rowKey = row => row.id || [row.roomId, row.userId, row.testId || row.part || ''].join('|');
const values = map => [...map.values()];
const personal = (map, userId) => values(map).filter(r => r.userId === userId);
const failing = (status, reason) => { throw new HttpError(status, reason); };
const deny = () => failing(403, 'Нет доступа к этой операции');
const invalid = () => failing(400, 'Некорректные данные экзамена');
const publicUser = u => ({ id: u.id, login: u.login, name: u.name, role: u.role });
const publicTimer = ({ examTest, ...timer }) => timer;
const timerId = (room, user, part, test = '') => ['tm', room, user, part, test].join('|');
const findWork = (map, uid, room, test) => values(map).find(r => r.userId === uid && r.roomId === room && (!test || r.testId === test));

function view(db, user) {
  if (user.role === 'teacher') {
    const data = Object.fromEntries(collections.map(c => [c, values(db[c])]));
    data.users = data.users.map(publicUser);
    data.timers = data.timers.filter(t => t.limit > 0).map(publicTimer);
    return data;
  }
  const own = {};
  for (const name of ['attempts', 'writings', 'queue', 'grades', 'timers']) own[name] = personal(db[name], user.id);
  const touched = new Set(Object.values(own).flat().map(r => r.roomId));
  const rooms = values(db.rooms).filter(r => r.open || touched.has(r.id)).map(r =>
    r.writing?.minutes > 0 && !db.timers.has(timerId(r.id, user.id, 'writing')) && !findWork(db.writings, user.id, r.id)
      ? { ...r, writing: { ...r.writing, prompt: '' } } : r);
  const published = new Set(rooms.filter(r => r.test?.on).flatMap(r => r.test.testIds));
  const tests = values(db.tests).filter(t => published.has(t.id)).map(t => ({
    id: t.id, title: t.title, timeLimit: t.timeLimit, questions: [], questionCount: t.questions.length,
  }));
  own.attempts = own.attempts.map(a => a.showAnswers ? a :
    { ...a, details: (a.details || []).map(({ corr, ...detail }) => detail) });
  own.timers = own.timers.filter(t => t.limit > 0).map(publicTimer);
  const queue = values(db.queue);
  own.queue = own.queue.map(q => ({ ...q, position: q.status === 'waiting'
    ? 1 + queue.filter(r => r.roomId === q.roomId && r.status === 'waiting' && r.addedAt < q.addedAt).length : null }));
  return { users: [publicUser(user)], tests, rooms, ...own };
}

function openRoom(db, roomId, part) {
  const room = db.rooms.get(roomId);
  if (!room?.open || !room[part]?.on) deny();
  return room;
}

function startTest(db, user, body, now) {
  if (user.role !== 'student') deny();
  const room = openRoom(db, body.roomId, 'test');
  if (!room.test.testIds.includes(body.testId)) deny();
  if (findWork(db.attempts, user.id, room.id, body.testId)) failing(409, 'Тест уже сдан');
  const id = timerId(room.id, user.id, 'test', body.testId);
  let timer = db.timers.get(id);
  const test = timer?.examTest || db.tests.get(body.testId);
  if (!test?.questions?.length) invalid();
  if (!timer || !timer.examTest) {
    timer = { id, userId: user.id, roomId: room.id, part: 'test', testId: test.id,
      limit: test.timeLimit || 0, title: test.title, startedAt: now, pauseMs: 0, awayAt: null, frozen: false, ...timer, examTest: test };
    db.timers.set(id, timer);
  }
  return { test: { id: test.id, title: test.title, shuffle: test.shuffle, timeLimit: test.timeLimit,
    questions: test.questions.map(studentQuestion) }, timer: publicTimer(timer) };
}
function elapsed(timer, now) {
  return Math.max(0, (timer.frozen && timer.awayAt ? timer.awayAt : now) - timer.startedAt - (timer.pauseMs || 0));
}
function tooLate(timer, now) {
  return timer && timer.limit > 0 && elapsed(timer, now) > timer.limit * 60_000 + 15_000;
}

function submitTest(db, user, body, now) {
  if (user.role !== 'student') deny();
  const previous = findWork(db.attempts, user.id, body.roomId, body.testId);
  if (previous) return { id: previous.id };
  const room = openRoom(db, body.roomId, 'test');
  const key = timerId(room.id, user.id, 'test', body.testId);
  const timer = db.timers.get(key);
  if (!timer?.examTest || !room.test.testIds.includes(body.testId) || !Array.isArray(body.answers)) invalid();
  const test = timer.examTest, late = tooLate(timer, now);
  const details = test.questions.map((q, i) => ({ ...scoreQuestion(q, late ? null : body.answers[i]),
    time: Math.min(elapsed(timer, now), Math.max(0, Number(body.times?.[i]) || 0)) }));
  const score = round(details.reduce((sum, d) => sum + d.earned, 0));
  const max = round(details.reduce((sum, d) => sum + d.max, 0));
  const percent = max ? Math.round(score / max * 100) : 0;
  const record = { id: crypto.randomUUID(), userId: user.id, roomId: room.id, testId: test.id, testTitle: test.title,
    startedAt: timer.startedAt, finishedAt: now, duration: elapsed(timer, now), auto: late || !!body.auto,
    timeLimit: test.timeLimit, late: !!late, score, max, percent, passed: percent >= test.passPercent, passPercent: test.passPercent,
    showAnswers: !!test.showAnswers, details };
  db.attempts.set(record.id, record); db.timers.delete(key);
  return { id: record.id };
}

function updateTimer(db, user, row, now) {
  if (row.userId !== user.id || !['test', 'writing'].includes(row.part)) deny();
  const room = openRoom(db, row.roomId, row.part);
  const id = timerId(room.id, user.id, row.part, row.testId || '');
  if (row.id !== id) invalid();
  const old = db.timers.get(id);
  if (!old) {
    if (row.part !== 'writing' || row.testId || findWork(db.writings, user.id, room.id)) deny();
    db.timers.set(id, { id, userId: user.id, roomId: room.id, part: 'writing', testId: '', title: room.title,
      limit: +room.writing.minutes || 0, startedAt: now, pauseMs: 0, awayAt: null, frozen: false });
  } else if (row.awayAt && !old.awayAt) {
    db.timers.set(id, { ...old, awayAt: now, frozen: false });
  } else if (!row.awayAt && old.awayAt) {
    db.timers.set(id, { ...old, awayAt: null, frozen: false, pauseMs: (old.pauseMs || 0) + (old.frozen ? now - old.awayAt : 0) });
  }
}

function studentWrite(db, col, row, user, now) {
  if (row.userId !== user.id) deny();
  if (col === 'timers') return updateTimer(db, user, row, now);
  if (!validId(row.id) || db[col].has(row.id)) deny();
  if (col === 'writings') {
    const room = openRoom(db, row.roomId, 'writing');
    if (findWork(db.writings, user.id, room.id)) failing(409, 'Работа уже сдана');
    const id = timerId(room.id, user.id, 'writing'), timer = db.timers.get(id);
    if (room.writing.minutes > 0 && !timer) deny();
    if (typeof row.text !== 'string' || row.text.length > 100_000) invalid();
    const text = row.text.trim();
    db.writings.set(row.id, { id: row.id, userId: user.id, roomId: room.id, text,
      words: text ? text.split(/\s+/).length : 0, submittedAt: now, auto: !!row.auto, late: !!tooLate(timer, now) });
    db.timers.delete(id);
  } else if (col === 'queue') {
    const room = openRoom(db, row.roomId, 'speaking');
    if (row.status !== 'waiting' || findWork(db.queue, user.id, room.id)) deny();
    if ((room.writing?.on && !findWork(db.writings, user.id, room.id)) ||
        (room.test?.on && room.test.testIds.some(t => !findWork(db.attempts, user.id, room.id, t)))) deny();
    db.queue.set(row.id, { id: row.id, userId: user.id, roomId: room.id, by: user.id, status: 'waiting', addedAt: now });
  } else deny();
}

function validateTest(t) {
  if (typeof t.title !== 'string' || !Array.isArray(t.questions) || t.questions.length > 400 ||
      !Number.isFinite(+t.timeLimit) || +t.timeLimit < 0) invalid();
  const strings = list => Array.isArray(list) && list.length > 0 && list.length <= 200 && list.every(x => typeof x === 'string');
  for (const q of t.questions) {
    if (!q || !validId(q.id) || typeof q.text !== 'string' || !Number.isFinite(+q.points) || +q.points < 0) invalid();
    if (['single', 'multi'].includes(q.type) && !strings(q.options)) invalid();
    switch (q.type) {
      case 'single': if (!Number.isInteger(q.correct) || q.options[q.correct] === undefined) invalid(); break;
      case 'multi': if (!Array.isArray(q.correct) || !q.correct.length || !q.correct.every(i => Number.isInteger(i) && q.options[i] !== undefined)) invalid(); break;
      case 'tf': if (typeof q.correct !== 'boolean') invalid(); break;
      case 'input': if (!strings(q.answers)) invalid(); break;
      case 'order': if (!strings(q.items)) invalid(); break;
      case 'match': if (!Array.isArray(q.pairs) || !q.pairs.length || q.pairs.length > 200 || !q.pairs.every(p => p && typeof p.right === 'string')) invalid(); break;
      default: invalid();
    }
  }
}

function teacherWrite(db, col, row, session, now) {
  if (col === 'timers') {
    const old = db.timers.get(row.id);
    if (!old?.awayAt) deny();
    db.timers.set(row.id, { ...old, frozen: !!row.frozen, frozenAt: now, frozenBy: session.uid });
    return;
  }
  if (col === 'grades') {
    if (!(session.gradingUntil > now)) deny();
    if (row.id || !parts.includes(row.part) || db.users.get(row.userId)?.role !== 'student') invalid();
    const part = db.rooms.get(row.roomId)?.[row.part];
    if (!part?.on || !Number.isFinite(row.score) || row.score < 0 || row.score > part.max) invalid();
    db.grades.set(rowKey(row), { roomId: row.roomId, userId: row.userId, part: row.part, score: row.score,
      max: +part.max, comment: String(row.comment || '').slice(0, 4000), gradedAt: now, by: session.uid });
    return;
  }
  if (!validId(row.id)) invalid();
  if (col === 'tests') validateTest(row);
  else if (col === 'rooms') {
    if (typeof row.title !== 'string' || typeof row.open !== 'boolean' || !parts.every(p => row[p] && typeof row[p].on === 'boolean') ||
        !Array.isArray(row.test.testIds) || !row.test.testIds.every(validId)) invalid();
  } else if (col === 'queue') {
    if (!db.rooms.has(row.roomId) || db.users.get(row.userId)?.role !== 'student' ||
        !['waiting', 'called', 'live', 'done'].includes(row.status)) invalid();
  } else deny();
  db[col].set(row.id, row);
}

function applyChanges(db, user, session, changes, now) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) invalid();
  for (const [col, change] of Object.entries(changes)) {
    if (!collections.includes(col) || col === 'users') deny();
    if (!change || !Array.isArray(change.del) || !Array.isArray(change.up) || change.del.length + change.up.length > 5000) invalid();
    for (const key of change.del) {
      if (user.role === 'teacher' && col === 'grades' && !(session.gradingUntil > now)) {
        const grade = db.grades.get(key);
        if (grade && db.rooms.has(grade.roomId) && !(grade.part === 'test' && !findWork(db.attempts, grade.userId, grade.roomId))) deny();
      }
      if (user.role === 'student') {
        // Timers are removed by the server as part of submission.
        if (col === 'timers' && !db.timers.has(key)) continue;
        const old = db[col].get(key);
        if (col !== 'queue' || old?.userId !== user.id || old.status !== 'waiting') deny();
      }
      db[col].delete(key);
    }
    for (const row of change.up) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) invalid();
      if (user.role === 'teacher') teacherWrite(db, col, row, session, now);
      else studentWrite(db, col, row, user, now);
    }
  }
}

function submitWriting(db, user, body, now) {
  if (user.role !== 'student') deny();
  const previous = findWork(db.writings, user.id, body.roomId);
  if (previous) return { id: previous.id };
  const id = crypto.randomUUID();
  studentWrite(db, 'writings', { ...body, id, userId: user.id }, user, now);
  return { id };
}

module.exports = { collections, view, publicUser, startTest, submitTest, submitWriting, applyChanges, validId };
