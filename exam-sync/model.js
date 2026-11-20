'use strict';

const crypto = require('node:crypto');
const { HttpError } = require('../server/http');
const { studentQuestion, scoreQuestion, round } = require('./grading');
const ExamModel = require('./eb/model');

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
function roomOpen(room, now = Date.now()) {
  if (!room) return false;
  if (room.durMode !== undefined || Number.isFinite(room.startAt) || Number.isFinite(room.endAt)) {
    return (!Number.isFinite(room.startAt) || now >= room.startAt) && (!Number.isFinite(room.endAt) || now < room.endAt);
  }
  return room.open === true;
}
function publicExam(exam) {
  const out = structuredClone(exam);
  for (const section of Object.values(out.sections || {})) for (const task of section.tasks || []) {
    const scored = ExamModel.grade(task, undefined);
    task._keyed = !!scored && !scored.ungraded;
    if (task.type === 'gap') task.question = ExamModel.parseGaps(task.question).map(part => part.gap ? '{{}}' : part.text).join('');
    if (task.kind === 'transcript') task.text = '';
    delete task.answer; delete task.answers; delete task.transcript;
  }
  return out;
}
function publicTest(test) {
  return test.kind === 'exam' && test.exam
    ? { ...test, exam: publicExam(test.exam), questions: [] }
    : { id:test.id, title:test.title, timeLimit:test.timeLimit, questions:[], questionCount:(test.questions || []).length };
}

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
  const rooms = values(db.rooms).filter(r => roomOpen(r) || (Number.isFinite(r.startAt) && r.startAt > Date.now()) || touched.has(r.id)).map(r =>
    r.writing?.minutes > 0 && !db.timers.has(timerId(r.id, user.id, 'writing')) && !findWork(db.writings, user.id, r.id)
      ? { ...r, writing: { ...r.writing, prompt: '' } } : r);
  const published = new Set(rooms.filter(r => r.test?.on).flatMap(r => r.test.testIds));
  const tests = values(db.tests).filter(t => published.has(t.id)).map(publicTest);
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
  if (!roomOpen(room) || !room[part]?.on) deny();
  return room;
}

function examSkills(room, test) {
  if (!test?.exam) return [];
  const settings = test.exam.settings || {}, order = Array.isArray(room.xorder) && room.xorder.length
    ? room.xorder : settings.order || ExamModel.SECTION_TYPES;
  const enabled = settings.enabled || {};
  const online = new Set();
  if (room.test?.on) for (const skill of ['test', 'reading', 'listening']) {
    if (enabled[skill] !== false && (test.exam.sections?.[skill]?.tasks || []).some(t => t.type !== 'info')) online.add(skill);
  }
  if (room.writing?.on && enabled.writing !== false && (test.exam.sections?.writing?.tasks || []).some(t => t.type === 'essay')) online.add('writing');
  if (room.speaking?.on && enabled.speaking !== false) online.add('speaking');
  return [...new Set(order)].filter(k => online.has(k));
}
function examTimeLimit(room, test) {
  if (!test?.exam) return +test?.timeLimit || 0;
  const settings = test.exam.settings || {};
  const sum = examSkills(room, test).reduce((total, k) => total + (+settings.skillTime?.[k] || 0), 0);
  return sum || (+test.timeLimit || 0);
}

function startTest(db, user, body, now) {
  if (user.role !== 'student') deny();
  const room = openRoom(db, body.roomId, 'test');
  if (!room.test.testIds.includes(body.testId)) deny();
  if (findWork(db.attempts, user.id, room.id, body.testId)) failing(409, 'Тест уже сдан');
  const id = timerId(room.id, user.id, 'test', body.testId);
  let timer = db.timers.get(id);
  const test = timer?.examTest || db.tests.get(body.testId);
  if (!(test?.kind === 'exam' ? test.exam?.format === 'exam-builder/1' : test?.questions?.length)) invalid();
  if (!timer || !timer.examTest) {
    timer = { id, userId: user.id, roomId: room.id, part: 'test', testId: test.id,
      limit: examTimeLimit(room, test), title: test.title, startedAt: now, pauseMs: 0, awayAt: null, frozen: false, ...timer, examTest: test };
    db.timers.set(id, timer);
  }
  return { test: test.kind === 'exam' && test.exam ? { ...test, exam:publicExam(test.exam), questions:[] } : { id: test.id, title: test.title, shuffle: test.shuffle, timeLimit: test.timeLimit, passPercent:test.passPercent, showAnswers:test.showAnswers, questions: test.questions.map(studentQuestion) }, timer: publicTimer(timer) };
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
  if (!timer?.examTest || !room.test.testIds.includes(body.testId)) invalid();
  const test = timer.examTest, late = tooLate(timer, now);
  if (test.kind === 'exam' && test.exam && body.exam === true) return submitExam(db, user, body, now, room, timer, test, late);
  if (!Array.isArray(body.answers)) invalid();
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

function submitExam(db, user, body, now, room, timer, test, late) {
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) invalid();
  const exam = test.exam, details = [], bySkill = {};
  for (const skill of examSkills(room, test)) {
    const section = exam.sections?.[skill];
    if (!section) continue;
    for (const task of section.tasks || []) {
      if (task.type === 'info' || task.type === 'essay') continue;
      const scored = ExamModel.grade(task, late ? undefined : body.answers[task.id]);
      if (!scored || scored.ungraded || !(scored.max > 0)) continue;
      const earned = Math.round(scored.score * 10) / 10, max = Math.round(scored.max * 100) / 100;
      const response = body.answers[task.id];
      const userText = Array.isArray(response) ? response.join(', ') : response == null ? '—' : String(response).slice(0, 2000);
      const answer = task.type === 'mc' || task.type === 'tf' ? String(task.answer ?? '') :
        Array.isArray(task.answers) ? task.answers.join(' / ') : String(task.answer ?? '');
      const status = response == null || response === '' ? 'empty' : earned >= max ? 'correct' : earned > 0 ? 'partial' : 'wrong';
      details.push({ text:String(task.question || task.title || ''), type:({mc:'single',multi:'multi',tf:'tf',match:'match',gap:'gaps',short:'input'})[task.type] || 'input',
        sec:section.title || ExamModel.SECTION_LABELS[skill], skill, earned, max, status, user:userText, corr:answer });
      const part = bySkill[skill] || (bySkill[skill] = { score:0, max:0 }); part.score += earned; part.max += max;
    }
  }
  for (const part of Object.values(bySkill)) part.score = Math.floor((part.score + 1e-9) * 2) / 2;
  const score = round(Object.values(bySkill).reduce((sum, x) => sum + x.score, 0));
  const max = round(details.reduce((sum, x) => sum + x.max, 0));
  const percent = max ? Math.round(score / max * 100) : 0;
  const record = { id:crypto.randomUUID(), userId:user.id, roomId:room.id, testId:test.id, testTitle:test.title,
    startedAt:timer.startedAt, finishedAt:now, duration:elapsed(timer, now), auto:!!late || !!body.auto, timeLimit:timer.limit || 0,
    late:!!late, score, max, percent, passed:percent >= (+test.passPercent || 60), passPercent:+test.passPercent || 60,
    showAnswers:!!exam.settings?.showResults, details };
  db.attempts.set(record.id, record); db.timers.delete(timer.id);
  for (const [skill, part] of Object.entries(bySkill)) {
    const online = ['test', 'reading', 'listening'].includes(skill) && room.test?.on;
    const max = +room[skill]?.max || 0;
    if (online && max > 0 && part.max > 0) {
      const key = [room.id, user.id, skill].join('|');
      const score = Math.floor((part.score / part.max * max + 1e-9) * 2) / 2;
      db.grades.set(key, { roomId:room.id, userId:user.id, part:skill, score, max, comment:'', gradedAt:now, by:'auto', auto:true });
    }
  }
  return { id:record.id };
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
  if (t && t.kind === 'exam' && t.exam && t.exam.format === 'exam-builder/1') {
    if (typeof t.title !== 'string' || t.title.length > 300 || !Array.isArray(t.questions) || t.questions.length !== 0) invalid();
    const normalized = ExamModel.normalize(t.exam);
    if (ExamModel.activeSections(normalized).length > 5 || JSON.stringify(normalized).length > 8_000_000) invalid();
    return;
  }
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
    if (!old?.awayAt || db.rooms.get(old.roomId)?.ownerId !== session.uid) deny();
    db.timers.set(row.id, { ...old, frozen: !!row.frozen, frozenAt: now, frozenBy: session.uid });
    return;
  }
  if (col === 'grades') {
    if (!(session.gradingUntil > now)) deny();
    if (row.id || !parts.includes(row.part) || db.users.get(row.userId)?.role !== 'student') invalid();
    const gradeRoom = db.rooms.get(row.roomId);
    if (gradeRoom?.ownerId !== session.uid) deny();
    const part = gradeRoom?.[row.part];
    if (!part?.on || !Number.isFinite(row.score) || row.score < 0 || row.score > part.max) invalid();
    db.grades.set(rowKey(row), { roomId: row.roomId, userId: row.userId, part: row.part, score: row.score,
      max: +part.max, comment: String(row.comment || '').slice(0, 4000), gradedAt: now, by: session.uid });
    return;
  }
  if (!validId(row.id)) invalid();
  const previous = db[col].get(row.id);
  if (['tests', 'rooms'].includes(col)) {
    if (previous && previous.ownerId !== session.uid) deny();
    if (!previous && row.ownerId && row.ownerId !== session.uid) deny();
    if (!row.ownerId) row = { ...row, ownerId:session.uid };
  }
  if (col === 'tests') validateTest(row);
  else if (col === 'rooms') {
    if (typeof row.title !== 'string' || !parts.every(p => row[p] && typeof row[p].on === 'boolean') ||
        !Array.isArray(row.test?.testIds) || !row.test.testIds.every(validId) ||
        (row.startAt != null && !Number.isFinite(row.startAt)) || (row.endAt != null && !Number.isFinite(row.endAt))) invalid();
  } else if (col === 'queue') {
    if (db.rooms.get(row.roomId)?.ownerId !== session.uid || !db.rooms.has(row.roomId) || db.users.get(row.userId)?.role !== 'student' ||
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
      if (user.role === 'teacher' && ['tests', 'rooms'].includes(col)) {
        const old = db[col].get(key); if (old && old.ownerId !== user.id) deny();
      }
      if (user.role === 'teacher' && col === 'queue') {
        const old = db.queue.get(key); if (old && db.rooms.get(old.roomId)?.ownerId !== user.id) deny();
      }
      if (user.role === 'teacher' && col === 'grades') {
        const grade = db.grades.get(key); if (grade && db.rooms.get(grade.roomId)?.ownerId !== user.id) deny();
        if (!(session.gradingUntil > now) && grade && !(grade.part === 'test' && !findWork(db.attempts, grade.userId, grade.roomId))) deny();
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
