'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { studentQuestion, scoreQuestion } = require('../exam-sync/grading');
const { applyChanges } = require('../exam-sync/model');
const { parseTrusted } = require('../server/http');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');

const { installation } = require('./harness');

const portalUser = { lastName: 'Example', firstName: 'Tester', email: 'person@example.test', group: 'ИСУ2025-1', password: 'local-test-password' };

async function portalExamPair(app) {
  const teacher = { ...portalUser, firstName:'Teacher', email:'exam-teacher@example.test', role:'teacher' };
  const student = { ...portalUser, firstName:'Student', email:'exam-student@example.test', role:'student' };
  for (const person of [teacher, student]) assert.equal((await app.request('/api/auth/register', { body:person })).status, 202);
  const users = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users;
  for (const user of users) app.cli('approve', user.id);
  app.cli('groups', users.find(user => user.email === teacher.email).id, student.group);
  const redeem = async person => {
    const portalToken = (await app.request('/api/auth/login', { body:person })).value.token;
    const code = (await app.request('/api/exam/handoff', { token:portalToken, body:{} })).value.code;
    return { portalToken, exam: (await app.request('/exam-sync/api/portal/redeem', { body:{ code } })).value };
  };
  return { teacher, student, lecturer:await redeem(teacher), learner:await redeem(student) };
}

test('duplicate registration does not reveal an existing email and still uses the registration limit', async t => {
  const app = installation(t); await app.start();
  const person = { ...portalUser, role:'teacher' };
  const first = await app.request('/api/auth/register', { body:person });
  assert.equal(first.status, 202);
  assert.deepEqual(first.value, { pending:true });
  const duplicate = await app.request('/api/auth/register', { body:{ ...person, firstName:'Different' } });
  assert.equal(duplicate.status, first.status);
  assert.deepEqual(duplicate.value, first.value);
  for (let i = 0; i < 8; i++) assert.equal((await app.request('/api/auth/register', { body:person })).status, 202);
  assert.equal((await app.request('/api/auth/register', { body:person })).status, 429);
  const db = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'), 'utf8'));
  assert.equal(db.users.length, 1);
});

test('portal requires an operator grant, supports restart, KU Message handoff and immediate revocation', async t => {
  const app = installation(t); await app.start();
  const call = app.request;
  assert.deepEqual((await call('/api/demo')).value, { enabled: false });
  assert.equal((await call('/api/auth/register', { body: { ...portalUser, role: 'teacher' } })).status, 202);
  assert.equal((await call('/api/auth/login', { body: portalUser })).status, 403);
  const dbFile = path.join(app.data, 'db.json');
  const { id } = JSON.parse(fs.readFileSync(dbFile)).users[0];
  app.cli('approve', id);
  const login = await call('/api/auth/login', { body: portalUser, headers: { 'x-forwarded-for': '192.0.2.3' } });
  assert.equal(login.status, 200); const token = login.value.token;
  assert.equal(login.value.user.role, 'teacher');
  assert.equal((await call('/api/sessions', { token })).value.items[0].ip, '127.0.0.1');
  assert.ok(!fs.readFileSync(dbFile, 'utf8').includes(token));
  await app.stop(); await app.start();
  assert.equal((await call('/api/me', { token })).status, 200);
  const hand = await call('/api/message/handoff', { token, body: {} });
  const message = await call('/api/message/redeem', { body: { code: hand.value.code } });
  assert.equal((await call('/api/message/list', { token: message.value.token })).status, 200);
  assert.equal((await call('/api/message/redeem', { body: { code: hand.value.code } })).status, 401);
  const pending = await call('/api/message/handoff', { token, body: {} });
  app.cli('revoke', id); app.cli('approve', id);
  assert.equal((await call('/api/message/redeem', { body: { code: pending.value.code } })).status, 401);
  assert.equal((await call('/api/me', { token })).status, 401);
  assert.equal((await call('/api/me', { token: message.value.token })).status, 401);
  const auditDir = path.join(app.data, 'audit');
  const journal = fs.readFileSync(path.join(auditDir, fs.readdirSync(auditDir)[0]), 'utf8');
  const events = journal.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(row => row.event), ['portal.approve', 'portal.revoke', 'portal.approve']);
  assert.ok(!journal.includes(token) && !journal.includes(portalUser.email));
});

test('online exam uses the approved KU Portal ID and keeps matched legacy work', async t => {
  const app = installation(t); const snapshot = {
    format:2, rev:1, db:{
      users:[
        ['legacy-teacher', { id:'legacy-teacher', login:'legacy-teacher', name:'Example Teacher', role:'teacher' }],
        ['legacy-student', { id:'legacy-student', login:'ИСУ-25-1g-1', name:'Example Tester', role:'student', faculty:'ИСУ', year:25, group:1 }],
      ],
      tests:[['old-test', { id:'old-test', title:'Saved test', ownerId:'legacy-teacher', questions:[{ id:'q1', type:'single', text:'Q', options:['a'], correct:0, points:1 }] }]],
      rooms:[['old-room', { id:'old-room', ownerId:'legacy-teacher', title:'Old room', groups:['ИСУ-25-1'], open:true, test:{ on:true, testIds:['old-test'] } }]],
      attempts:[['saved-attempt', { id:'saved-attempt', userId:'legacy-student', roomId:'old-room', testId:'old-test', testTitle:'Saved test', details:[], score:1, max:1 }]],
      writings:[], queue:[], grades:[], timers:[],
    },
  };
  fs.writeFileSync(path.join(app.data, 'exam-sync.json'), JSON.stringify(snapshot));
  await app.start();

  const teacher = { lastName:'Example', firstName:'Teacher', email:'teacher@example.test', password:'teacher-password', role:'teacher' };
  const student = { lastName:'Example', firstName:'Tester', email:'student@example.test', password:'student-password', role:'student', group:'ИСУ2025-1' };
  assert.equal((await app.request('/api/auth/register', { body:teacher })).status, 202);
  assert.equal((await app.request('/api/auth/register', { body:student })).status, 202);
  const users = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users;
  const teacherPortal = users.find(u => u.email === teacher.email), studentPortal = users.find(u => u.email === student.email);
  app.cli('approve', teacherPortal.id); app.cli('approve', studentPortal.id);
  app.cli('groups', teacherPortal.id, student.group);
  const teacherToken = (await app.request('/api/auth/login', { body:teacher })).value.token;
  const studentToken = (await app.request('/api/auth/login', { body:student })).value.token;
  const issue = token => app.request('/api/exam/handoff', { token, body:{} });
  const redeem = code => app.request('/exam-sync/api/portal/redeem', { body:{ code } });

  const teacherCode = (await issue(teacherToken)).value.code;
  const teacherExam = await redeem(teacherCode);
  assert.equal(teacherExam.status, 200);
  assert.equal(teacherExam.value.user.id, teacherPortal.id);
  assert.equal(teacherExam.value.user.authSource, 'portal');
  assert.ok(teacherExam.value.db.users.some(u => u.id === studentPortal.id && u.authSource === 'portal'));
  assert.equal(teacherExam.value.db.attempts.length, 1);
  assert.equal(teacherExam.value.db.attempts[0].userId, studentPortal.id);
  assert.equal(teacherExam.value.db.tests.find(u => u.id === 'old-test').ownerId, teacherPortal.id);
  assert.equal((await redeem(teacherCode)).status, 401);
  assert.equal((await app.request('/exam-sync/api/grade-unlock', { token:teacherExam.value.token, body:{ password:teacher.password } })).status, 200);
  assert.equal((await app.request('/exam-sync/api/login', { body:{ login:teacherPortal.id, password:teacher.password } })).status, 401);

  const studentCode = (await issue(studentToken)).value.code;
  const studentExam = await redeem(studentCode);
  assert.equal(studentExam.status, 200);
  assert.equal(studentExam.value.user.id, studentPortal.id);
  assert.deepEqual(studentExam.value.db.attempts.map(a => a.id), ['saved-attempt']);
  assert.equal(studentExam.value.db.attempts[0].userId, studentPortal.id);
  const inventory = execFileSync(process.execPath, ['scripts/access.js', 'accounts'], {
    cwd:root, env:{ ...process.env, KU_DATA_DIR:app.data, DEMO:'0' }, encoding:'utf8',
  });
  assert.match(inventory, /teacher@example\.test/);
  assert.match(inventory, /KU Portal SSO/);
  assert.ok(!inventory.includes(teacher.password) && !inventory.includes(student.password));
  assert.equal((await app.request('/api/auth/logout', { token:studentToken, body:{} })).status, 200);
  assert.equal((await app.request('/exam-sync/api/state', { token:studentExam.value.token })).status, 401);
});

test('online exam migrates embedded media out of JSON and serves the same content after restart', async t => {
  const app = installation(t);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/w2sAAAAASUVORK5CYII=';
  const snapshot = { format:2, rev:1, db:{
    users:[['teacher', { id:'teacher', login:'teacher', name:'Example Teacher', role:'teacher' }]],
    tests:[['media-test', { id:'media-test', title:'Media test', ownerId:'teacher', questions:[{ id:'q1', text:'Question', media:[{ kind:'image', name:'image.png', src:image }] }] }]],
    rooms:[], attempts:[], writings:[], queue:[], grades:[], timers:[],
  } };
  fs.writeFileSync(path.join(app.data, 'exam-sync.json'), JSON.stringify(snapshot));
  await app.start();

  const call = (route, options) => app.request('/exam-sync/api/' + route, options);
  const teacher = { lastName:'Example', firstName:'Teacher', email:'teacher@example.test', password:'teacher-password', role:'teacher' };
  assert.equal((await app.request('/api/auth/register', { body:teacher })).status, 202);
  const portalId = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users[0].id;
  app.cli('approve', portalId);
  const portalLogin = await app.request('/api/auth/login', { body:teacher });
  assert.equal(portalLogin.status, 200);
  const handoff = await app.request('/api/exam/handoff', { token:portalLogin.value.token, body:{} });
  assert.equal(handoff.status, 200);
  let session = await call('portal/redeem', { body:{ code:handoff.value.code } });
  assert.equal(session.status, 200);
  assert.equal(session.value.db.tests[0].questions[0].media[0].src, image);
  const dbFile = path.join(app.data, 'exam-sync.json');
  const stored = fs.readFileSync(dbFile, 'utf8');
  assert.equal(stored.includes('data:image/png;base64'), false);
  assert.match(stored, /ku-media:v1:/);
  assert.equal(fs.readdirSync(path.join(app.data, 'exam-media')).filter(name => /^[a-f0-9]{64}$/.test(name)).length, 1);

  await app.stop(); await app.start();
  session = await call('state', { token:session.value.token });
  assert.equal(session.status, 200);
  assert.equal(session.value.db.tests[0].questions[0].media[0].src, image);
});

test('production upgrade preserves exam IDs and results, retires old credentials and issues individual sessions', async t => {
  const app = installation(t);
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'exam-sync', 'seed.json')));
  fs.writeFileSync(path.join(app.data, 'exam-sync.json'), JSON.stringify(seed));
  const old = seed.db.users.find(([,u]) => u.role === 'student')[1];
  const newPassword = app.cli('exam-reset', old.login, 'student', old.name);
  const teacherPassword = app.cli('exam-reset', 'examiner', 'teacher', 'Examiner');
  await app.start();
  const call = (route, options) => app.request('/exam-sync/api/' + route, options);
  assert.equal((await call('state')).status, 401);
  assert.equal((await call('events')).status, 401);
  assert.equal((await call('sync', { body: {} })).status, 401);
  assert.equal((await call('login', { body: { login: old.login, password: old.password } })).status, 401);
  const credentials = { login: old.login, password: newPassword };
  const signIn = (body) => call('login', { body });
  const student = (await signIn(credentials)).value;
  assert.equal(student.user.id, old.id);
  assert.deepEqual(student.db.users.map(u => u.id), [old.id]);
  assert.ok(student.db.attempts.every(a => a.userId === old.id));
  assert.equal(student.db.tests[0].questions.length, 0);
  assert.deepEqual(Object.keys(student.db.users[0]).sort(), ['id','login','name','role']);
  const teacher = (await signIn({ login: 'examiner', password: teacherPassword })).value;
  assert.ok(teacher.db.users.every(u => !('password' in u || 'passHash' in u || 'salt' in u)));
  assert.equal(teacher.db.attempts.length, 0); // без назначенных групп чужие результаты скрыты
  const stored = JSON.parse(fs.readFileSync(path.join(app.data, 'exam-sync.json')));
  assert.equal(stored.db.attempts.length, seed.db.attempts.length); // записи сохранены
  assert.ok(stored.db.users.every(([,u]) => !('password' in u)));
  assert.equal(stored.db.users.find(([id]) => id === old.id)[1].passAlgo, 'scrypt');
  assert.deepEqual(fs.readdirSync(path.join(app.data, 'exam-provision')), []);
  app.cli('exam-disable', old.login);
  await app.stop(); await app.start();
  assert.equal((await signIn(credentials)).status, 401);
  assert.equal((await call('state', { token: student.token })).status, 401); // отключённый студент выходит
  assert.equal((await call('state', { token: teacher.token })).status, 200); // остальные сеансы переживают перезапуск
});

test('portal teacher and student complete a test, change a password and grade a written submission', async t => {
  const app = installation(t); await app.start();
  const call = (name, token, body) => app.request('/exam-sync/api/' + name, { token, body });
  const pair = await portalExamPair(app);
  const token = pair.lecturer.exam.token, learner = pair.learner.exam, who = learner.token;
  const roomId = 'room-integration', testId = 'test-integration';
  const exam = { id: testId, title: 'Exam', timeLimit: 10, passPercent: 60, showAnswers: false,
    questions: [{ id:'q1', type:'single', text:'Choose', options:['a', 'b'], correct:1, points:2 }] };
  const room = { id: roomId, title:'Room', open:true, groups:[pair.student.group], test:{ on:true, testIds:[testId], max:40 },
    writing:{ on:true, minutes:0, max:30 }, speaking:{ on:true, max:30 } };
  const up = (...rows) => ({ up:rows, del:[] });
  const update = await call('sync', token, { rev: (await call('state', token)).value.rev, changes: { tests:up(exam), rooms:up(room) } });
  assert.equal(update.status, 200);
  const run = await call('start', who, { roomId, testId });
  assert.equal(run.status, 200);
  assert.ok(!('correct' in run.value.test.questions[0]));
  assert.ok(!('examTest' in run.value.db.timers[0]));
  const attempt = await call('attempt', who, { roomId, testId, answers:[1] });
  assert.equal(attempt.status, 200);
  const saved = attempt.value.db.attempts.find(a => a.id === attempt.value.id);
  assert.equal(saved.score, 2); assert.ok(!('corr' in saved.details[0]));
  const replay = await call('attempt', who, { roomId, testId, answers:[1] });
  assert.equal(replay.value.id, saved.id);
  const writing = { id:'work1', userId:learner.user.id, roomId, text:'A written response.' };
  const submitted = await call('sync', who, { rev: replay.value.rev, changes:{ writings:up(writing) } });
  assert.equal(submitted.status, 200); assert.equal(submitted.value.db.writings[0].words, 3);
  const mark = { roomId, userId:learner.user.id, part:'writing', score:18, comment:'Read' };
  const grade = { rev: submitted.value.rev, changes:{ grades:up(mark) } };
  assert.equal((await call('sync', who, grade)).status, 403);
  assert.equal((await call('sync', token, grade)).status, 403);
  assert.equal((await call('grade-unlock', token, { password:pair.teacher.password })).status, 200);
  assert.equal((await call('sync', token, grade)).status, 200);
  assert.equal((await call('state', who)).value.db.grades[0].score, 18);
  const otherPortalToken = (await app.request('/api/auth/login', { body:pair.student })).value.token;
  const otherCode = (await app.request('/api/exam/handoff', { token:otherPortalToken, body:{} })).value.code;
  const otherExamToken = (await app.request('/exam-sync/api/portal/redeem', { body:{ code:otherCode } })).value.token;
  assert.equal((await app.request('/api/auth/password', { token:pair.learner.portalToken,
    body:{ current:pair.student.password, next:'new-individual-password' } })).status, 200);
  assert.equal((await call('state', otherExamToken)).status, 401);
  assert.equal((await call('state', who)).status, 200); // текущий сеанс портала сохраняется
  assert.equal((await app.request('/api/auth/login', { body:pair.student })).status, 401);
  assert.equal((await app.request('/api/auth/login', { body:{ ...pair.student, password:'new-individual-password' } })).status, 200);
});

test('student question projection and scoring cover all supported question types', () => {
  const cases = [
    [{type:'single', options:['a','b'], correct:1}, 1],
    [{type:'multi', options:['a','b','c'], correct:[2,0], partial:true}, [0,2]],
    [{type:'tf', correct:false}, false],
    [{type:'input', answers:['Right answer']}, 'right  answer'],
    [{type:'match', pairs:[{label:'1',right:'z'},{label:'2',right:'a'}]}, [1,0]],
    [{type:'order',items:['z','a','b']}, [2,0,1]],
  ];
  for (const [question, answer] of cases) {
    const q = { ...question, points:3 };
    const projected = studentQuestion(q);
    assert.ok(!('correct' in projected || 'answers' in projected));
    assert.equal(scoreQuestion(q, answer).earned, 3, q.type);
    assert.equal(scoreQuestion(q, null).earned, 0, q.type);
  }
});

test('a student can only remove their own waiting queue entry', () => {
  const user = { id:'student', role:'student' };
  const old = { id:'q', roomId:'room', userId:'owner', status:'waiting' };
  const db = { queue: new Map([['q',old]]) };
  const remove = () => applyChanges(db, user, {}, {queue:{up:[],del:['q']}}, Date.now());
  assert.throws(remove, { status:403 }); assert.equal(db.queue.size, 1);
  db.queue.set('q', { ...old, userId:user.id }); remove(); assert.equal(db.queue.size, 0);
});

test('timed writing reveals its prompt after server start and preserves the submitted text on retries', async t => {
  const app = installation(t); await app.start();
  const call = (name, token, body) => app.request('/exam-sync/api/' + name, { token, body });
  const pair = await portalExamPair(app);
  const lecturer = pair.lecturer.exam, student = pair.learner.exam;
  const room = { id:'timed-room', title:'Writing', open:true, groups:[pair.student.group], test:{on:false,testIds:[]},
    writing:{on:true,minutes:10,prompt:'Write a short essay'}, speaking:{on:false} };
  assert.equal((await call('sync', lecturer.token, { rev:(await call('state', lecturer.token)).value.rev, changes:{rooms:{up:[room],del:[]}} })).status, 200);
  const state = (await call('state', student.token)).value;
  assert.equal(state.db.rooms.find(r => r.id === room.id).writing.prompt, '');
  const body = { roomId:room.id, text:'Written work' };
  assert.equal((await call('writing', student.token, body)).status, 403);
  const timer = { id:['tm',room.id,student.user.id,'writing',''].join('|'), part:'writing', roomId:room.id, userId:student.user.id };
  const start = (await call('sync', student.token, { rev:state.rev, changes:{timers:{up:[timer],del:[]}} })).value;
  assert.equal(start.db.rooms.find(r => r.id === room.id).writing.prompt, room.writing.prompt);
  const first = (await call('writing', student.token, body)).value;
  const second = (await call('writing', student.token, body)).value;
  assert.equal(second.id, first.id);
  assert.equal(second.db.writings.find(w => w.id === first.id).text, body.text);
  assert.ok(!second.db.timers.some(row => row.id === timer.id));
});

test('trusted proxies accept single addresses and CIDR ranges and reject malformed entries', () => {
  const trusted = parseTrusted('192.0.2.10, 10.0.0.0/8, fd00::/8');
  assert.equal(trusted('192.0.2.10'), true);
  assert.equal(trusted('10.20.30.40'), true);
  assert.equal(trusted('fd12::1'), true);
  assert.equal(trusted('192.0.2.11'), false);
  assert.equal(trusted('not-an-ip'), false);
  assert.equal(parseTrusted('')('127.0.0.1'), false);
  for (const bad of ['10.0.0.0/33', 'proxy.example', '10.0.0.0/8/1', '10.0.0.0/x']) assert.throws(() => parseTrusted(bad));
});

test('behind a trusted proxy limits and sessions use the visitor address and HSTS is sent', async t => {
  const app = installation(t, false, { KU_TRUSTED_PROXIES: '127.0.0.0/8' }); await app.start();
  const call = app.request;
  await call('/api/version', { headers: { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https' } });
  await call('/api/version', { headers: { 'x-forwarded-for': '203.0.113.10' } });
  const report = app.output().split('\n').filter(line => line.startsWith('[proxy] '));
  assert.equal(report.length, 1); // один раз за запуск
  const logged = JSON.parse(report[0].slice(8));
  assert.equal(logged.peer, '127.0.0.1'); assert.equal(logged.trusted, true);
  assert.ok(logged.headers.includes('x-forwarded-for'));
  assert.ok(!report[0].includes('203.0.113'));
  assert.equal((await call('/api/auth/register', { body: { ...portalUser, role: 'student' } })).status, 202);
  app.cli('approve', JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users[0].id);
  const headers = { 'x-forwarded-for': '198.51.100.1, 192.0.2.3', 'x-forwarded-proto': 'https' };
  const login = await call('/api/auth/login', { body: portalUser, headers });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('strict-transport-security') || '', /max-age=/);
  assert.equal((await call('/api/sessions', { token: login.value.token })).value.items[0].ip, '192.0.2.3');
  // восемь ошибок с одного адреса не запирают владельца на другом адресе
  for (let i = 0; i < 8; i++) await call('/api/auth/login', { body: { ...portalUser, password: 'wrong-password' }, headers: { 'x-forwarded-for': '192.0.2.66' } });
  assert.equal((await call('/api/auth/login', { body: { ...portalUser, password: 'wrong-password' }, headers: { 'x-forwarded-for': '192.0.2.66' } })).status, 429);
  assert.equal((await call('/api/auth/login', { body: portalUser, headers: { 'x-forwarded-for': '192.0.2.4' } })).status, 200);
});

test('results database rejects direct login from every visitor address', async t => {
  const app = installation(t, false, { KU_TRUSTED_PROXIES: '127.0.0.0/8' });
  await app.start();
  // Прямой вход в учебную базу закрыт для всех: только сеанс KU Portal с правом results.
  assert.equal((await app.request('/api/results/login', { body:{ username:'pupil', password:'wrong' }, headers:{ 'x-forwarded-for':'192.0.2.50' } })).status, 403);
  assert.equal((await app.request('/api/results/login', { body:{ username:'pupil', password:'results-password' }, headers:{ 'x-forwarded-for':'192.0.2.51' } })).status, 403);
  assert.equal((await app.request('/api/results/login', { body: 'x'.repeat(10) })).status, 400);
});

test('a teacher can schedule and grade only groups assigned by the operator', async t => {
  const app = installation(t, true); await app.start();
  const credentials = JSON.parse(fs.readFileSync(path.join(app.data, 'demo', 'demo-credentials.json')));
  const sign = async email => (await app.request('/api/auth/login', { body: { email, password: credentials[email] } })).value.token;
  const token = await sign('teacher3@demo.kz');
  const db = () => JSON.parse(fs.readFileSync(path.join(app.data, 'demo', 'db.json')));
  const teacher = db().users.find(u => u.email === 'teacher3@demo.kz');
  const student = db().users.find(u => u.email === 'student@demo.kz');
  const own = db().schedule.find(r => r.teacherId === teacher.id);
  assert.notEqual(own.group, student.group);
  const sub = (await app.request('/api/teacher/subjects', { token, body: { name: 'Новый предмет' } })).value.id;
  const lesson = group => app.request('/api/teacher/schedule', { token, body: { subjectId: sub, group, day: 6, startTime: '10:00', endTime: '11:00' } });
  assert.equal((await lesson(student.group)).status, 403);
  assert.equal((await app.request('/api/teacher/grades', { token, body: { studentId: student.id, subjectId: sub, score: 5 } })).status, 403);
  assert.equal((await lesson(own.group)).status, 200); // группы из прежнего расписания перенесены при запуске
  app.cli('groups', teacher.id, `${own.group}, ${student.group}`);
  assert.equal((await lesson(student.group)).status, 200);
  assert.equal((await app.request('/api/teacher/grades', { token, body: { studentId: student.id, subjectId: sub, score: 5 } })).status, 200);
  const listed = async () => (await app.request('/api/teacher/students', { token })).value.items.map(x => x.id);
  assert.ok((await listed()).includes(student.id));
  app.cli('groups', teacher.id, own.group); // снятая группа пропадает и из списка студентов
  assert.ok(!(await listed()).includes(student.id));
  assert.equal((await app.request('/api/teacher/grades', { token, body: { studentId: student.id, subjectId: sub, score: 5 } })).status, 403);
});

test('static pages are served gzip-compressed and exam sessions survive a restart', async t => {
  const app = installation(t, true); await app.start();
  const page = await app.request('/exam-sync/', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(page.headers.get('content-encoding'), 'gzip');
  assert.match(page.value, /<!DOCTYPE html>/i);
  const refused = await app.request('/exam-sync/', { headers: { 'accept-encoding': 'identity, gzip;q=0' } });
  assert.equal(refused.headers.get('content-encoding'), null);
  const call = (name, token, body) => app.request('/exam-sync/api/' + name, { token, body });
  const teacher = (await call('login', null, { login: 'teacher', password: 'admin' })).value;
  await app.stop(); await app.start();
  assert.equal((await call('state', teacher.token)).status, 200);
  assert.ok(!fs.readFileSync(path.join(app.data, 'demo', 'exam-sessions.json'), 'utf8').includes(teacher.token));
  assert.equal((await call('logout', teacher.token, {})).status, 200);
  await app.stop(); await app.start();
  assert.equal((await call('state', teacher.token)).status, 401);
});

test('alwaysdata proxies pass the visitor address in X-Real-IP', async t => {
  const app = installation(t, false, { KU_TRUSTED_PROXIES: '127.0.0.1' }); await app.start();
  assert.equal((await app.request('/api/auth/register', { body: { ...portalUser, role: 'student' } })).status, 202);
  app.cli('approve', JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users[0].id);
  const login = await app.request('/api/auth/login', { body: portalUser, headers: { 'x-real-ip': '192.0.2.77', 'x-forwarded-proto': 'https' } });
  assert.equal((await app.request('/api/sessions', { token: login.value.token })).value.items[0].ip, '192.0.2.77');
  assert.match(login.headers.get('strict-transport-security') || '', /max-age=/);
});

test('roles: teachers teach, club leads run only their clubs, managers run all clubs and the dormitory', async t => {
  const app = installation(t, true); await app.start();
  const credentials = JSON.parse(fs.readFileSync(path.join(app.data, 'demo', 'demo-credentials.json')));
  const sign = async email => {
    const r = await app.request('/api/auth/login', { body: { email, password: credentials[email] } });
    assert.equal(r.status, 200, email); return r.value;
  };
  const day = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const event = (token, clubId) => app.request('/api/clubs/event', { token, body: { clubId, title: 'Встреча', date: day, time: '10:00', endTime: '11:00' } });
  const teacher = await sign('teacher2@demo.kz');
  assert.deepEqual(teacher.user.perms, { clubs: [], dorm: false, results: false, admin: false });
  assert.equal((await event(teacher.token, 'chess')).status, 403);
  assert.equal((await app.request('/api/clubs', { token: teacher.token })).value.canCreate, false);
  assert.equal((await app.request('/api/dorm', { token: teacher.token })).value.staff, false);
  assert.equal((await app.request('/api/dorm/status', { token: teacher.token, body: { id: 'x', status: 'done' } })).status, 403);

  const lead = await sign('clubs@demo.kz');
  assert.equal(lead.user.role, 'staff');
  assert.equal((await event(lead.token, 'volunteer')).status, 200);
  assert.equal((await event(lead.token, 'chess')).status, 403);
  const leadView = (await app.request('/api/clubs', { token: lead.token })).value;
  assert.equal(leadView.canCreate, true);
  assert.deepEqual(leadView.items.filter(c => c.manage).map(c => c.id).sort(), ['football', 'volunteer']);
  assert.equal((await app.request('/api/dorm', { token: lead.token })).value.staff, false);

  const manager = await sign('manager@demo.kz');
  assert.equal((await event(manager.token, 'chess')).status, 200);
  assert.equal((await app.request('/api/dorm', { token: manager.token })).value.staff, true);
  assert.equal((await app.request('/api/dorm/news', { token: manager.token, body: { title: 'Новость общежития' } })).status, 200);

  const student = await sign('student@demo.kz');
  assert.equal((await app.request('/api/clubs/join', { token: student.token, body: { id: 'debate', on: true } })).status, 200);
  assert.equal((await app.request('/api/clubs/join', { token: lead.token, body: { id: 'chess', on: true } })).status, 400);
  const sid = student.user.id;
  assert.equal((await app.request('/api/clubs/request', { token: lead.token, body: { id: 'debate', uid: sid, accept: true } })).status, 403);
  assert.equal((await app.request('/api/clubs/request', { token: manager.token, body: { id: 'debate', uid: sid, accept: true } })).status, 200);
  assert.equal((await app.request('/api/dorm/request', { token: student.token, body: { kind: 'repair', text: 'Не работает кран' } })).status, 200);

  // оператор назначает и снимает роль без перезапуска
  const db = JSON.parse(fs.readFileSync(path.join(app.data, 'demo', 'db.json')));
  app.cli('role', db.users.find(u => u.email === 'teacher2@demo.kz').id, 'club-lead', 'chess');
  assert.equal((await event(teacher.token, 'chess')).status, 200);
  app.cli('role', db.users.find(u => u.email === 'teacher2@demo.kz').id, 'none');
  assert.equal((await event(teacher.token, 'chess')).status, 403);
});

test('staff members can register and wait for operator approval', async t => {
  const app = installation(t); await app.start();
  const staffUser = { ...portalUser, email: 'staff@example.test', group: '', role: 'staff' };
  assert.equal((await app.request('/api/auth/register', { body: staffUser })).status, 202);
  const user = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users[0];
  assert.match(user.id, /^stf_/);
  app.cli('approve', user.id); app.cli('role', user.id, 'manager');
  const login = await app.request('/api/auth/login', { body: staffUser });
  assert.deepEqual(login.value.user.perms, { clubs: ['*'], dorm: true, results: true, admin: false });
  assert.equal((await app.request('/api/auth/register', { body: { ...staffUser, email: 'x@example.test', role: 'admin' } })).status, 400);
});

test('results database: only holders of the results right, through the portal session; students, club leads and plain teachers are refused', async t => {
  const app = installation(t);
  const hash = pw => { const salt = crypto.randomBytes(16).toString('hex'); return { salt, passAlgo: 'scrypt', passHash: crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex') }; };
  // база в прежнем формате (school.json, ID school_*) переводится на новые имена при запуске
  fs.mkdirSync(path.join(app.data, 'school-files'));
  fs.writeFileSync(path.join(app.data, 'school-files', 'school_component_1.docx'), 'PK');
  fs.writeFileSync(path.join(app.data, 'school.json'), JSON.stringify({ version: 1,
    users: [{ id: 'school_user_1', username: 'pupil1', role: 'student', group: '1g', ...hash('pupil-one-pass') }, { id: 'school_user_2', username: 'pupil2', role: 'student', group: '2g', ...hash('pupil-two-pass') }],
    tests: [{ id: 'school_test_1', title: 'Тест', ownerId: 'x' }], components: [{ id: 'school_component_1', testId: 'school_test_1', skill: 'тесты', maxPoints: 20, docxFilename: 'task.docx' }],
    results: [{ id: 'school_result_1', userId: 'school_user_1', testId: 'school_test_1', totalScore: 15 }, { id: 'school_result_2', userId: 'school_user_2', testId: 'school_test_1', totalScore: 7 }], scores: [] }));
  await app.start();
  assert.equal(fs.existsSync(path.join(app.data, 'school.json')), false);
  assert.ok(!fs.readFileSync(path.join(app.data, 'results.json'), 'utf8').includes('school_'));
  assert.ok(fs.existsSync(path.join(app.data, 'results-files', 'results_component_1.docx')));
  assert.equal((await app.request('/school/')).status, 200); // прежний адрес ведёт на /results/
  const call = app.request;
  const people = {};
  for (const [key, role] of [['student', 'student'], ['teacher', 'teacher'], ['lead', 'staff'], ['manager', 'staff']]) {
    const person = { ...portalUser, email: key + '@example.test', role, group: role === 'student' ? 'ИСУ2025-3' : '' };
    assert.equal((await call('/api/auth/register', { body: person })).status, 202);
    const id = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users.find(u => u.email === person.email).id;
    app.cli('approve', id);
    people[key] = { id, token: (await call('/api/auth/login', { body: person })).value.token };
  }
  app.cli('role', people.lead.id, 'club-lead', 'volunteer');
  app.cli('role', people.manager.id, 'manager');
  const portalLogin = who => call('/api/results/portal-login', { token: people[who].token, body: {} });

  assert.equal((await call('/api/results/portal-login', { body: {} })).status, 401);
  assert.equal((await portalLogin('student')).status, 403);
  assert.equal((await portalLogin('lead')).status, 403);
  // студенческие логины самой базы тоже не входят, даже с верным паролем
  assert.equal((await call('/api/results/login', { body: { username: 'pupil1', password: 'pupil-one-pass' } })).status, 403);

  // ревью 1.0 п.6: учебная база у преподавателей убрана — только по праву «учебная база», которое выдаёт администратор
  assert.equal((await portalLogin('teacher')).status, 403);
  app.cli('role', people.teacher.id, 'manager');
  const teacher = await portalLogin('teacher');
  assert.equal(teacher.value.user.role, 'teacher');
  assert.equal((await call('/api/results/results', { token: teacher.value.token })).value.results.length, 2);
  assert.equal((await call('/api/results/scores', { token: teacher.value.token, body: { resultId: 'results_result_2', componentId: 'results_component_1', points: 9 } })).status, 200);

  const manager = await portalLogin('manager');
  assert.equal(manager.value.user.role, 'admin');
  assert.equal((await call('/api/results/results', { token: manager.value.token })).value.results.length, 2);
  assert.equal((await call('/api/results/scores', { token: manager.value.token, body: { resultId: 'results_result_1', componentId: 'results_component_1', points: 18 } })).status, 200);

  // снятие роли в портале сразу закрывает базу
  app.cli('role', people.manager.id, 'none');
  assert.equal((await call('/api/results/results', { token: manager.value.token })).status, 401);
  app.cli('revoke', people.teacher.id);
  assert.equal((await call('/api/results/results', { token: teacher.value.token })).status, 401);
});
