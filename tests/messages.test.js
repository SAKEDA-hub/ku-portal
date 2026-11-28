'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installation } = require('./harness');

const person = (email, role, group = '') => ({ lastName: 'Test', firstName: role, email, role, group, password: 'password-' + role + '-1' });
const ADMIN = person('messages-admin@example.test', 'staff');
const TEACHER = person('messages-teacher@example.test', 'teacher');
const STUDENT = person('messages-student@example.test', 'student', 'ИСУ2025-1');

async function setup(t) {
  const app = installation(t);
  await app.start();
  const people = [ADMIN, TEACHER, STUDENT];
  for (const user of people) assert.equal((await app.request('/api/auth/register', { body: user })).status, 202);
  const users = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'), 'utf8')).users;
  const id = (user) => users.find((row) => row.email === user.email).id;
  for (const user of people) app.cli('approve', id(user));
  app.cli('role', id(ADMIN), 'admin');
  app.cli('groups', id(TEACHER), STUDENT.group);
  const tokens = {};
  for (const user of people) tokens[user.email] = (await app.request('/api/auth/login', { body: user })).value.token;
  const as = (user, route, body) => app.request(route, { token: tokens[user.email], body });
  return { app, as };
}

test('only the course teacher can pin and unpin a course material', async (t) => {
  const { app, as } = await setup(t);
  const subject = (await as(TEACHER, '/api/teacher/subjects', { name: 'Демо-предмет' })).value;
  const ch = 's:' + subject.id;
  const material = (await as(TEACHER, '/api/message/material', { ch, kind: 'other', title: 'Демо файл' })).value;

  assert.equal((await as(STUDENT, '/api/message/material/pin', { id: material.id, on: true })).status, 403);
  assert.deepEqual((await as(TEACHER, '/api/message/material/pin', { id: material.id, on: true })).value, { pinned: true });
  let view = (await as(STUDENT, '/api/message/open?ch=' + encodeURIComponent(ch))).value;
  assert.equal(view.materials.find((row) => row.id === material.id).pinned, true);
  assert.deepEqual((await as(TEACHER, '/api/message/material/pin', { id: material.id, on: false })).value, { pinned: false });
  view = (await as(STUDENT, '/api/message/open?ch=' + encodeURIComponent(ch))).value;
  assert.equal(view.materials.find((row) => row.id === material.id).pinned, false);
});

test('demo course files are seeded once and remain pinned after restart', async (t) => {
  const app = installation(t, true);
  await app.start();
  const demoData = path.join(app.data, 'demo');
  const read = () => JSON.parse(fs.readFileSync(path.join(demoData, 'db.json'), 'utf8'));
  const first = read().chat.materials.filter((row) => row.demoKey && row.demoKey.startsWith('ku-portal-demo-course-material-v1:'));
  assert.ok(first.length > 0);
  assert.ok(first.every((row) => row.pinned && row.file && row.file.name.endsWith('.txt')));
  const file = path.join(demoData, 'uploads', first[0].file.id);
  assert.ok(fs.statSync(file).mode & 0o400);
  await app.stop();
  await app.start();
  const second = read().chat.materials.filter((row) => row.demoKey && row.demoKey.startsWith('ku-portal-demo-course-material-v1:'));
  assert.equal(second.length, first.length);
  assert.ok(second.every((row) => row.pinned));
});
