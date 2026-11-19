'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { createInterface } = require('node:readline');
const { studentQuestion, scoreQuestion } = require('../exam-sync/grading');
const { applyChanges } = require('../exam-sync/model');
const { parseTrusted } = require('../server/http');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');

function installation(t, demo = false, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ku-integration-'));
  const env = { ...process.env, PORT: '0', IP: '127.0.0.1', KU_DATA_DIR: data, DEMO: demo ? '1' : '0', KU_TRUSTED_PROXIES: '', ...extraEnv };
  let proc, base, output = '';
  async function stop() {
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      const exited = once(proc, 'exit'); proc.kill(); await exited;
    }
  }
  t.after(async () => { await stop(); fs.rmSync(data, { recursive: true, force: true, maxRetries: 3 }); });
  return {
    data, stop, output: () => output,
    cli: (...args) => execFileSync(process.execPath, ['scripts/access.js', ...args], { cwd: root, env, encoding: 'utf8' }).trim().split(/\r?\n/).pop(),
    async start() {
      proc = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let errors = ''; proc.stderr.on('data', line => { errors += line; });
      output = ''; proc.stdout.on('data', chunk => { output += chunk; });
      await new Promise((resolve, reject) => {
        const lines = createInterface({ input: proc.stdout });
        const timeout = setTimeout(() => reject(new Error('startup timed out: ' + errors)), 10_000);
        proc.once('exit', () => { clearTimeout(timeout); reject(new Error('server exited: ' + errors)); });
        lines.on('line', line => {
          const match = /^KU Portal: (http:\/\/127\.0\.0\.1:\d+)$/.exec(line);
          if (match) { base = match[1]; clearTimeout(timeout); resolve(); }
        });
      });
    },
    async request(route, { body, token, headers = {}, method } = {}) {
      const response = await fetch(base + route, { method: method || (body === undefined ? 'GET' : 'POST'),
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, headers: response.headers, value: type.includes('json') ? await response.json() : await response.text() };
    },
  };
}

const portalUser = { lastName: 'Example', firstName: 'Tester', email: 'person@example.test', group: 'G1', password: 'local-test-password' };

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
  assert.equal(teacher.db.attempts.length, seed.db.attempts.length);
  const stored = JSON.parse(fs.readFileSync(path.join(app.data, 'exam-sync.json')));
  assert.ok(stored.db.users.every(([,u]) => !('password' in u)));
  assert.equal(stored.db.users.find(([id]) => id === old.id)[1].passAlgo, 'scrypt');
  assert.deepEqual(fs.readdirSync(path.join(app.data, 'exam-provision')), []);
  app.cli('exam-disable', old.login);
  await app.stop(); await app.start();
  assert.equal((await signIn(credentials)).status, 401);
  assert.equal((await call('state', { token: student.token })).status, 401); // отключённый студент выходит
  assert.equal((await call('state', { token: teacher.token })).status, 200); // остальные сеансы переживают перезапуск
});

test('exam teacher and student complete a test, change a password and grade a written submission', async t => {
  const app = installation(t, true); await app.start();
  const call = (name, token, body) => app.request('/exam-sync/api/' + name, { token, body });
  const sign = async (login, password) => {
    const response = await call('login', null, { login, password }); assert.equal(response.status, 200); return response.value;
  };
  const teacher = await sign('teacher', 'admin');
  const token = teacher.token;
  let created = await call('student', token, { login: 'learner', name: 'Learner', password: 'individual-password' });
  assert.equal(created.status, 200);
  const learner = await sign('learner', 'individual-password'), who = learner.token;
  const roomId = 'room-integration', testId = 'test-integration';
  const exam = { id: testId, title: 'Exam', timeLimit: 10, passPercent: 60, showAnswers: false,
    questions: [{ id:'q1', type:'single', text:'Choose', options:['a', 'b'], correct:1, points:2 }] };
  const room = { id: roomId, title:'Room', open:true, test:{ on:true, testIds:[testId], max:40 },
    writing:{ on:true, minutes:0, max:30 }, speaking:{ on:true, max:30 } };
  const up = (...rows) => ({ up:rows, del:[] });
  const update = await call('sync', token, { rev: learner.rev, changes: { tests:up(exam), rooms:up(room) } });
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
  assert.equal((await call('grade-unlock', token, { password:'admin' })).status, 200);
  assert.equal((await call('sync', token, grade)).status, 200);
  assert.equal((await call('state', who)).value.db.grades[0].score, 18);
  const other = await sign('learner', 'individual-password');
  assert.equal((await call('password', who, { password:'individual-password', next:'new-individual-password' })).status, 200);
  assert.equal((await call('state', other.token)).status, 401);
  assert.equal((await call('state', who)).status, 200);
  assert.equal(fs.existsSync(path.join(app.data, 'db.json')), false);
  assert.equal(fs.existsSync(path.join(app.data, 'demo', 'db.json')), true);
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
  const app = installation(t, true); await app.start();
  const call = (name, token, body) => app.request('/exam-sync/api/' + name, { token, body });
  const lecturer = (await call('login', null, { login:'teacher', password:'admin' })).value;
  const student = (await call('login', null, { login:'user3', password:'1' })).value;
  const room = { id:'timed-room', title:'Writing', open:true, test:{on:false,testIds:[]},
    writing:{on:true,minutes:10,prompt:'Write a short essay'}, speaking:{on:false} };
  await call('sync', lecturer.token, { rev:lecturer.rev, changes:{rooms:{up:[room],del:[]}} });
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

test('school login is limited per visitor address and the owner can still sign in', async t => {
  const app = installation(t, false, { KU_TRUSTED_PROXIES: '127.0.0.0/8' });
  const salt = crypto.randomBytes(16).toString('hex');
  const passHash = crypto.scryptSync('school-password', salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  fs.writeFileSync(path.join(app.data, 'school.json'), JSON.stringify({ version: 1, tests: [], components: [], results: [], scores: [],
    users: [{ id: 'user_1', username: 'pupil', role: 'student', salt, passHash, passAlgo: 'scrypt' }] }));
  await app.start();
  const login = (password, ip) => app.request('/api/school/login', { body: { username: 'pupil', password }, headers: { 'x-forwarded-for': ip } });
  for (let i = 0; i < 5; i++) assert.equal((await login('wrong', '192.0.2.50')).status, 401);
  assert.equal((await login('school-password', '192.0.2.50')).status, 429);
  const owner = await login('school-password', '192.0.2.51');
  assert.equal(owner.status, 200);
  assert.equal((await app.request('/api/school/me', { token: owner.value.token })).value.user.username, 'pupil');
  assert.equal((await app.request('/api/school/login', { body: 'x'.repeat(10) })).status, 400);
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
  assert.deepEqual(teacher.user.perms, { clubs: [], dorm: false });
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
  assert.deepEqual(login.value.user.perms, { clubs: ['*'], dorm: true });
  assert.equal((await app.request('/api/auth/register', { body: { ...staffUser, email: 'x@example.test', role: 'admin' } })).status, 400);
});
