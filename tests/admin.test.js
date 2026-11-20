'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installation } = require('./harness');
const { scrubUsers, purgeDemo } = require('../server/cleanup');

const person = (email, role, extra = {}) => ({ lastName: 'Test', firstName: role, email, role, group: role === 'student' ? 'ИСУ2025-1' : '', password: 'password-' + role, ...extra });
const ADMIN = person('admin@example.test', 'staff'), STUDENT = person('student@example.test', 'student'), TEACHER = person('teacher@example.test', 'teacher');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t) {
  const app = installation(t); await app.start();
  const call = app.request;
  for (const p of [ADMIN, STUDENT, TEACHER]) assert.equal((await call('/api/auth/register', { body: p })).status, 202);
  const users = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users;
  const id = email => users.find(u => u.email === email).id;
  app.cli('approve', id(ADMIN.email)); app.cli('role', id(ADMIN.email), 'admin');
  const admin = (await call('/api/auth/login', { body: ADMIN })).value.token;
  return { app, call, id, admin };
}
const login = (call, p, password = p.password) => call('/api/auth/login', { body: { email: p.email, password } });

test('admin panel: approve with groups, reset password once confirmed, permissions, delete and backup', async t => {
  const { app, call, id, admin } = await setup(t);
  const sid = id(STUDENT.email), tid = id(TEACHER.email);

  const list = await call('/api/admin/users', { token: admin });
  assert.equal(list.status, 200);
  assert.deepEqual(list.value.items.filter(u => !u.access).map(u => u.id).sort(), [sid, tid].sort());
  assert.equal(list.value.items.find(u => u.id === id(ADMIN.email)).perms.admin, true);
  assert.ok(list.value.items.every(u => !('passHash' in u) && !('salt' in u)));

  // любое изменение — только после повторного ввода пароля администратора (украденного токена мало)
  const blocked = await call('/api/admin/approve', { token: admin, body: { id: sid } });
  assert.equal(blocked.status, 403); assert.equal(blocked.value.needConfirm, true);
  assert.equal((await call('/api/admin/confirm', { token: admin, body: { password: 'wrong-password' } })).status, 400);
  assert.equal((await call('/api/admin/confirm', { token: admin, body: { password: ADMIN.password } })).status, 200);

  // преподаватель: группы + допуск; студент — допуск
  assert.equal((await call('/api/admin/groups', { token: admin, body: { id: tid, groups: 'ИСУ2025-1, ИСУ2025-2 , ИСУ2025-1' } })).value.user.groups.join(), 'ИСУ2025-1,ИСУ2025-2');
  assert.equal((await call('/api/admin/approve', { token: admin, body: { id: tid } })).status, 200);
  assert.equal((await call('/api/admin/approve', { token: admin, body: { id: sid } })).status, 200);
  const student = (await login(call, STUDENT)).value.token;
  assert.equal((await login(call, TEACHER)).status, 200);

  // не администратор в панель не попадает
  assert.equal((await call('/api/admin/users', { token: student })).status, 403);
  assert.equal((await call('/api/admin/approve', { token: student, body: { id: sid } })).status, 403);
  assert.equal((await call('/api/admin/users')).status, 401);

  // себя нельзя лишить доступа или права администратора
  assert.equal((await call('/api/admin/revoke', { token: admin, body: { id: id(ADMIN.email) } })).status, 400);
  assert.equal((await call('/api/admin/perms', { token: admin, body: { id: id(ADMIN.email), perms: {} } })).status, 400);
  assert.equal((await call('/api/admin/approve', { token: admin, body: { id: '../etc' } })).status, 404);

  // свой пароль — только в кабинете; сброс студенту — временный пароль
  assert.equal((await call('/api/admin/reset-password', { token: admin, body: { id: id(ADMIN.email) } })).status, 400);
  const reset = await call('/api/admin/reset-password', { token: admin, body: { id: sid } });
  assert.equal(reset.status, 200); assert.match(reset.value.password, /^[A-Za-z0-9]{12}$/);
  assert.equal((await call('/api/me', { token: student })).status, 401); // старые сеансы завершены
  assert.equal((await login(call, STUDENT)).status, 401);
  const fresh = await login(call, STUDENT, reset.value.password);
  assert.equal(fresh.status, 200); assert.equal(fresh.value.user.mustChangePassword, true);
  // до смены пароля сервер отвечает только кабинету
  assert.equal((await call('/api/schedule', { token: fresh.value.token })).status, 403);
  assert.equal((await call('/api/settings', { token: fresh.value.token })).status, 200);
  const changed = await call('/api/auth/password', { token: fresh.value.token, body: { current: reset.value.password, next: 'my-own-password' } });
  assert.equal(changed.status, 200);
  assert.equal((await call('/api/me', { token: fresh.value.token })).value.user.mustChangePassword, false);

  // права: руководитель клуба, неизвестные клубы отбрасываются
  const perms = await call('/api/admin/perms', { token: admin, body: { id: tid, perms: { clubs: ['football', '../x'], dorm: true } } });
  assert.deepEqual(perms.value.user.perms, { clubs: ['football'], dorm: true, results: false, admin: false });

  // другого администратора панель не меняет
  assert.equal((await call('/api/admin/perms', { token: admin, body: { id: tid, perms: { admin: true } } })).status, 200);
  for (const route of ['revoke', 'reset-password', 'perms']) assert.equal((await call('/api/admin/' + route, { token: admin, body: { id: tid, perms: {} } })).status, 403, route);
  app.cli('role', tid, 'none');

  // копия базы
  const backup = await call('/api/admin/backup', { token: admin, body: {} });
  assert.equal(backup.status, 200); assert.match(backup.headers.get('content-disposition'), /attachment/);
  assert.equal(backup.value.db.users.length, 3); assert.ok(backup.value.access);

  // удаление — с подтверждением email; себя удалить нельзя
  assert.equal((await call('/api/admin/delete', { token: admin, body: { id: sid, confirmEmail: 'other@example.test' } })).status, 400);
  assert.equal((await call('/api/admin/delete', { token: admin, body: { id: id(ADMIN.email), confirmEmail: ADMIN.email } })).status, 400);
  assert.equal((await call('/api/admin/delete', { token: admin, body: { id: sid, confirmEmail: STUDENT.email } })).status, 200);
  assert.ok(!(await call('/api/admin/users', { token: admin })).value.items.some(u => u.id === sid));
  assert.equal((await login(call, STUDENT, 'my-own-password')).status, 401);

  const auditDir = path.join(app.data, 'audit');
  const journal = fs.readFileSync(path.join(auditDir, fs.readdirSync(auditDir)[0]), 'utf8');
  const events = journal.trim().split('\n').map(line => JSON.parse(line).event);
  for (const e of ['admin.confirm.fail', 'portal.groups', 'portal.approve', 'portal.password.reset', 'portal.role', 'admin.backup', 'portal.delete']) assert.ok(events.includes(e), e);
  assert.ok(!journal.includes(reset.value.password));
});

test('operator resets a portal password from the host while the site runs and while it is stopped', async t => {
  const { app, call, id } = await setup(t);
  const sid = id(STUDENT.email);
  app.cli('approve', sid);
  const before = (await login(call, STUDENT)).value.token;
  const password = app.cli('reset-password', sid);
  assert.match(password, /^[A-Za-z0-9]{12}$/);
  // ждём, пока сервер заберёт поручение (раз в 5 секунд), не тратя попытки входа — иначе сработает защита от перебора
  const pending = () => fs.readdirSync(path.join(app.data, 'portal-provision')).filter(f => f.endsWith('.json')).length;
  for (let i = 0; i < 60 && pending(); i++) await sleep(250);
  assert.equal(pending(), 0, 'поручение обработано без перезапуска');
  assert.equal((await login(call, STUDENT, password)).status, 200);
  assert.equal((await call('/api/me', { token: before })).status, 401);
  assert.deepEqual(fs.readdirSync(path.join(app.data, 'portal-provision')), []);

  await app.stop();
  const second = app.cli('reset-password', sid);
  await app.start();
  assert.equal((await login(call, STUDENT, second)).status, 200);
  assert.throws(() => app.cli('reset-password', 'std_999'));

  // неприменимое поручение не теряется молча
  const dir = path.join(app.data, 'portal-provision');
  fs.writeFileSync(path.join(dir, '1-bad.json'), JSON.stringify({ action: 'reset-password', userId: 'std_999' }));
  await sleep(6000);
  assert.deepEqual(fs.readdirSync(dir), ['1-bad.json.failed']);

  // временный пароль действует 3 суток
  await app.stop();
  const dbFile = path.join(app.data, 'db.json'), db = JSON.parse(fs.readFileSync(dbFile));
  db.users.find(u => u.id === sid).tempPasswordUntil = Date.now() - 1000;
  fs.writeFileSync(dbFile, JSON.stringify(db));
  await app.start();
  assert.equal((await login(call, STUDENT, second)).status, 401);
});

test('demo accounts left in a production database are removed with everything attached to them', async t => {
  const app = installation(t);
  const db = {
    users: [
      { id: 'tch_1', role: 'teacher', email: 'teacher@demo.kz', fio: 'Demo Teacher', demo: true },
      { id: 'std_1', role: 'student', email: 'student@demo.kz', fio: 'Demo Student', group: 'ИСУ2025-1', demo: true },
      { id: 'tch_4', role: 'teacher', email: 'real.teacher@example.test', fio: 'Real Teacher' },
      { id: 'std_3', role: 'student', email: 'real.student@example.test', fio: 'Real Student', group: 'ИСУ2025-1' },
    ],
    subjects: [{ id: 'sub_1', teacherId: 'tch_1', name: 'Demo subject' }, { id: 'sub_8', teacherId: 'tch_4', name: 'Python' }],
    schedule: [{ id: 'sc_1', teacherId: 'tch_1', subjectId: 'sub_1', group: 'ИСУ2025-1', day: 0, start: '08:30', end: '09:50' },
      { id: 'sc_11', teacherId: 'tch_4', subjectId: 'sub_8', group: 'ИСУ2025-1', day: 1, start: '13:00', end: '14:20' }],
    grades: [{ id: 'gr_1', studentId: 'std_3', teacherId: 'tch_1', subjectId: 'sub_1', score: 80 },
      { id: 'gr_2', studentId: 'std_1', teacherId: 'tch_4', subjectId: 'sub_8', score: 70 },
      { id: 'gr_9', studentId: 'std_3', teacherId: 'tch_4', subjectId: 'sub_8', score: 92 }],
    seq: { tch: 4, std: 3 }, sessions: {}, sessMeta: {},
    chat: { msgs: [{ id: 'msg_1', ch: 'd:std_3:tch_1', from: 'tch_1' }, { id: 'msg_4', ch: 'd:std_3:tch_4', from: 'std_3' }, { id: 'msg_6', ch: 's:sub_1', from: 'std_3' }],
      materials: [{ id: 'mat_1', ch: 's:sub_8', teacherId: 'tch_4' }], tasks: [], reads: { std_1: {}, std_3: { 'd:std_3:tch_1': 1, 's:sub_8': 1 } } },
    files: [{ id: 'f_demo', owner: 'std_1' }, { id: 'f_real', owner: 'std_3' }],
    clubs: [{ id: 'volunteer', name: 'V', members: ['std_1', 'std_3'], since: { std_1: 1, std_3: 1 }, requests: { std_1: 1 },
      posts: [{ id: 'cp_1', by: 'tch_1' }, { id: 'cp_6', by: 'stf_2' }], chat: [{ id: 'cm_1', from: 'std_1' }, { id: 'cm_4', from: 'std_3' }],
      events: [{ id: 'ev_1', people: ['std_1', 'std_3'], absent: ['std_1'], by: 'tch_1' }] }],
    clubReads: { std_1: {}, std_3: {} }, dorm: { news: [], requests: [{ id: 'dr_1', by: 'std_1' }, { id: 'dr_2', by: 'std_3' }] },
  };
  fs.writeFileSync(path.join(app.data, 'db.json'), JSON.stringify(db));
  fs.mkdirSync(path.join(app.data, 'uploads'));
  for (const f of ['f_demo', 'f_real']) fs.writeFileSync(path.join(app.data, 'uploads', f), 'x');
  await app.start();
  await sleep(200);
  assert.match(app.output(), /\[cleanup\] удалены демо-аккаунты: tch_1, std_1/);
  const saved = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json')));
  assert.deepEqual(saved.users.map(u => u.id), ['tch_4', 'std_3']);
  assert.deepEqual(saved.subjects.map(s => s.id), ['sub_8']);
  assert.deepEqual(saved.schedule.map(s => s.id), ['sc_11']);
  assert.deepEqual(saved.grades.map(g => g.id), ['gr_9']);
  assert.deepEqual(saved.chat.msgs.map(m => m.id), ['msg_4']);
  assert.deepEqual(saved.chat.materials.map(m => m.id), ['mat_1']);
  assert.deepEqual(saved.chat.reads, { std_3: { 's:sub_8': 1 } });
  assert.deepEqual(saved.files.map(f => f.id), ['f_real']);
  assert.deepEqual(fs.readdirSync(path.join(app.data, 'uploads')), ['f_real']);
  const club = saved.clubs[0];
  assert.deepEqual([club.members, Object.keys(club.since), Object.keys(club.requests)], [['std_3'], ['std_3'], []]);
  assert.deepEqual([club.posts.map(p => p.id), club.chat.map(m => m.id)], [['cp_6'], ['cm_4']]);
  assert.deepEqual([club.events[0].people, club.events[0].absent, club.events[0].by], [['std_3'], [], null]);
  assert.deepEqual(Object.keys(saved.clubReads), ['std_3']);
  assert.deepEqual(saved.dorm.requests.map(r => r.id), ['dr_2']);
  // повторный запуск ничего не меняет
  await app.stop(); await app.start(); await sleep(200);
  assert.doesNotMatch(app.output(), /\[cleanup\]/);
});

test('deleting a teacher keeps grades already given to students but removes the timetable', () => {
  const db = {
    users: [{ id: 'tch_1', role: 'teacher' }, { id: 'std_1', role: 'student' }],
    subjects: [{ id: 'sub_1', teacherId: 'tch_1' }], schedule: [{ id: 'sc_1', teacherId: 'tch_1', subjectId: 'sub_1' }],
    grades: [{ id: 'gr_1', studentId: 'std_1', teacherId: 'tch_1', subjectId: 'sub_1' }],
    sessions: { a: 'tch_1', b: 'std_1' }, sessMeta: { a: { uid: 'tch_1' }, b: { uid: 'std_1' } },
  };
  assert.deepEqual(scrubUsers(db, ['tch_1']), []);
  assert.deepEqual([db.users.length, db.subjects.length, db.schedule.length, db.grades.length], [1, 1, 0, 1]);
  assert.deepEqual([Object.keys(db.sessions), Object.keys(db.sessMeta)], [['b'], ['b']]);
  assert.deepEqual(purgeDemo(db), { users: [], files: [] });
});
