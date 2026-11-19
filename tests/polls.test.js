'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installation } = require('./harness');

const person = (email, role, group = '') => ({ lastName: 'Test', firstName: role, email, role, group, password: 'password-' + email });

test('polls: admin publishes, students vote once and anonymously, others cannot manage', async t => {
  const app = installation(t); await app.start();
  const call = app.request;
  const people = { admin: person('admin@example.test', 'staff'), s1: person('s1@example.test', 'student', 'G1'), s2: person('s2@example.test', 'student', 'G2'), teacher: person('t@example.test', 'teacher') };
  for (const p of Object.values(people)) assert.equal((await call('/api/auth/register', { body: p })).status, 202);
  const users = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users;
  const token = {};
  for (const [key, p] of Object.entries(people)) {
    const id = users.find(u => u.email === p.email).id;
    app.cli('approve', id); if (key === 'admin') app.cli('role', id, 'admin');
    token[key] = (await call('/api/auth/login', { body: p })).value.token;
  }
  const post = (who, route, body) => call('/api/polls/' + route, { token: token[who], body });

  assert.equal((await post('s1', 'create', { q: 'Вопрос?', opts: ['a', 'b'], days: 3 })).status, 403);
  assert.equal((await post('admin', 'create', { q: 'Вопрос?', opts: ['a', 'a'], days: 3 })).status, 400);
  assert.equal((await post('admin', 'create', { q: 'Вопрос?', opts: ['a', 'b'], days: 0 })).status, 400);
  const all = (await post('admin', 'create', { q: 'Когда начинать пары?', opts: ['8:00', '8:30', '9:00'], days: 7 })).value.poll;
  const g1 = (await post('admin', 'create', { q: 'Только для G1', opts: ['да', 'нет'], days: 2, groups: ['G1'] })).value.poll;

  const listOf = async who => (await call('/api/polls', { token: token[who] })).value.items.map(p => p.id).sort();
  assert.deepEqual(await listOf('s1'), [all.id, g1.id].sort());
  assert.deepEqual(await listOf('s2'), [all.id]);
  assert.deepEqual(await listOf('teacher'), [all.id]);
  const before = (await call('/api/polls', { token: token.s1 })).value.items.find(p => p.id === all.id);
  assert.equal(before.counts, null); // до голоса результатов не видно

  assert.equal((await post('s2', 'vote', { id: g1.id, opt: 0 })).status, 404); // не его группа
  assert.equal((await post('s1', 'vote', { id: all.id, opt: 5 })).status, 400);
  const voted = await post('s1', 'vote', { id: all.id, opt: 1 });
  assert.equal(voted.status, 200); assert.deepEqual(voted.value.poll.counts, [0, 1, 0]);
  assert.equal((await post('s1', 'vote', { id: all.id, opt: 0 })).status, 400); // второй голос
  assert.equal((await post('teacher', 'vote', { id: all.id, opt: 2 })).status, 200);
  assert.equal((await post('teacher', 'close', { id: all.id })).status, 403);

  // анонимность: в базе нет ID проголосовавших
  const s1id = users.find(u => u.email === people.s1.email).id;
  await app.stop(); await app.start();
  const stored = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).polls.find(p => p.id === all.id);
  assert.deepEqual(stored.counts, [0, 1, 1]);
  assert.ok(!JSON.stringify(stored).includes(s1id));
  assert.equal((await post('s1', 'vote', { id: all.id, opt: 0 })).status, 400); // и после перезапуска

  assert.equal((await post('admin', 'close', { id: all.id })).status, 200);
  assert.equal((await post('s2', 'vote', { id: all.id, opt: 0 })).status, 400);
  const closed = (await call('/api/polls', { token: token.s2 })).value.items.find(p => p.id === all.id);
  assert.equal(closed.closed, true); assert.deepEqual(closed.counts, [0, 1, 1]);
  assert.equal((await post('admin', 'delete', { id: g1.id })).status, 200);
  assert.deepEqual(await listOf('s1'), [all.id]);
});
