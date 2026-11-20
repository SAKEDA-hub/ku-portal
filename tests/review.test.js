'use strict';
/* Ревью 1.0: рейтинг без скрытых студентов, оценки по группам из админ-панели, допустимые вложения,
   файлы в клубах, студент — руководитель клуба, помощь преподавателю, уведомления с переходом. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installation } = require('./harness');
const { fileProblem } = require('../server/files');

const person = (email, role, group = '') => ({ lastName: 'Test', firstName: role, email, role, group, password: 'password-' + role + '-1' });
const ADMIN = person('admin@example.test', 'staff');
const TEACHER = person('teacher@example.test', 'teacher');
const S1 = person('s1@example.test', 'student', 'ИСУ2025-1');
const S2 = person('s2@example.test', 'student', 'ИСУ2025-1');
const LEAD = person('lead@example.test', 'student', 'БТ2025-1'); // студент, который ведёт клуб
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function setup(t) {
  const app = installation(t); await app.start();
  const call = app.request;
  const people = [ADMIN, TEACHER, S1, S2, LEAD];
  for (const p of people) assert.equal((await call('/api/auth/register', { body: p })).status, 202);
  const users = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users;
  const id = (p) => users.find((u) => u.email === p.email).id;
  for (const p of people) app.cli('approve', id(p));
  app.cli('role', id(ADMIN), 'admin');
  const tok = {};
  for (const p of people) tok[p.email] = (await call('/api/auth/login', { body: p })).value.token;
  const as = (p, route, body) => call(route, { token: tok[p.email], body });
  return { app, id, as };
}
const upload = (as, p, name, buf) => as(p, '/api/files', { name, data: buf.toString('base64') });

test('files: only photos and documents whose content matches the extension, no archives or programs', () => {
  assert.equal(fileProblem('photo.png', PNG), null);
  assert.equal(fileProblem('notes.txt', Buffer.from('hello')), null);
  assert.equal(fileProblem('report.docx', Buffer.from('504b0304', 'hex')), null);
  assert.match(fileProblem('setup.exe', Buffer.from('MZ')), /только фото/);
  assert.match(fileProblem('archive.zip', Buffer.from('504b0304', 'hex')), /только фото/);
  assert.match(fileProblem('photo.png', Buffer.from('4d5a9000', 'hex')), /Исполняемые/);
  assert.match(fileProblem('photo.jpg', PNG), /не совпадает/);
  assert.equal(fileProblem('note.txt', Buffer.from('#! заметка')), null); // текст не запускается
  assert.equal(fileProblem('table.csv', Buffer.from('fffe41000000', 'hex')), null); // UTF-16 из Excel
  assert.equal(fileProblem('old.doc', Buffer.from('{\\rtf1 hello')), null);
  assert.match(fileProblem('run.sh.png', Buffer.from('#!/bin/sh')), /Исполняемые/);
});

test('rating hides students who turned it off; teacher grades only groups assigned in the admin panel', async (t) => {
  const { app, id, as } = await setup(t);
  // рейтинг: скрытый студент пропадает у одногруппника целиком, себя видит с пометкой
  assert.equal((await as(S2, '/api/settings', { showInRating: false })).status, 200);
  const r1 = (await as(S1, '/api/rating')).value;
  assert.deepEqual(r1.rows.map((r) => r.id), [id(S1)]);
  assert.equal(r1.total, 1);
  const r2 = (await as(S2, '/api/rating')).value;
  assert.ok(r2.rows.some((r) => r.id === id(S2)));
  assert.equal(r2.selfHidden, true);

  // оценки: без закреплённой группы — нельзя, после назначения в админке — можно, без расписания
  const sub = (await as(TEACHER, '/api/teacher/subjects', { name: 'Программирование' })).value.id;
  const grade = () => as(TEACHER, '/api/teacher/grades', { studentId: id(S1), subjectId: sub, score: 90 });
  assert.equal((await grade()).status, 403);
  assert.deepEqual((await as(TEACHER, '/api/teacher/groups')).value.items, []);
  app.cli('groups', id(TEACHER), 'ИСУ2025-1');
  assert.deepEqual((await as(TEACHER, '/api/teacher/groups')).value.items, [{ group: 'ИСУ2025-1', students: 2 }]);
  const students = (await as(TEACHER, '/api/teacher/students?group=' + encodeURIComponent('ИСУ2025-1'))).value.items.map((x) => x.id);
  assert.deepEqual(students.sort(), [id(S1), id(S2)].sort());
  assert.ok(!(await as(TEACHER, '/api/teacher/students')).value.items.some((x) => x.id === id(LEAD)));
  assert.equal((await grade()).status, 200);
  assert.equal((await as(TEACHER, '/api/teacher/grades', { studentId: id(LEAD), subjectId: sub, score: 90 })).status, 403);
  assert.equal((await as(S1, '/api/inbox')).value.items[0].type, 'grade');
});

test('a student who leads a club stays a student, joins other clubs and shares files in club chat and channel', async (t) => {
  const { app, id, as } = await setup(t);
  app.cli('role', id(LEAD), 'club-lead', 'volunteer');
  const clubs = (await as(LEAD, '/api/clubs')).value;
  assert.equal(clubs.canCreate, true);
  assert.ok(clubs.activity, 'у студента-руководителя остаётся профиль активности');
  assert.equal((await as(LEAD, '/api/clubs/join', { id: 'volunteer', on: true })).status, 400); // свой клуб — уже ведёт
  assert.equal((await as(LEAD, '/api/clubs/join', { id: 'chess', on: true })).status, 200); // в другой — по заявке
  assert.equal((await as(LEAD, '/api/me')).value.user.role, 'student');

  // S1 вступает в волонтёрство, руководитель принимает; уведомление ведёт в канал клуба
  await as(S1, '/api/clubs/join', { id: 'volunteer', on: true });
  assert.equal((await as(LEAD, '/api/clubs/request', { id: 'volunteer', uid: id(S1), accept: true })).status, 200);
  assert.equal((await as(S1, '/api/inbox')).value.items.find((n) => n.type === 'club').clubId, 'volunteer');

  const file = (await upload(as, LEAD, 'poster.png', PNG)).value;
  assert.equal((await as(LEAD, '/api/clubs/post', { id: 'volunteer', text: '', fileId: file.id })).status, 200);
  const chatFile = (await upload(as, S1, 'notes.txt', Buffer.from('план субботника'))).value;
  assert.equal((await as(S1, '/api/clubs/chat/send', { id: 'volunteer', text: 'план', fileId: chatFile.id })).status, 200);
  assert.equal((await as(S1, '/api/clubs/chat/send', { id: 'volunteer', text: 'чужой', fileId: file.id })).status, 400); // чужой файл не прикрепить

  const feed = (await as(S1, '/api/clubs/feed?id=volunteer')).value;
  assert.equal(feed.posts.find((x) => x.type === 'post').file.id, file.id);
  const img = await as(S1, `/api/files/${file.id}?inline=1`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await as(S2, `/api/files/${file.id}`)).status, 404); // не участник клуба
  assert.equal((await as(LEAD, `/api/files/${chatFile.id}`)).status, 200); // руководитель видит чат своего клуба
  assert.equal((await upload(as, S1, 'virus.png', Buffer.from('4d5a90000300', 'hex'))).status, 400);
});

test('teacher help: teacher asks, others are refused, admin replies after confirming, teacher is notified', async (t) => {
  const { id, as } = await setup(t);
  assert.equal((await as(S1, '/api/help', { category: 'question', text: 'Можно мне тоже спросить?' })).status, 403);
  assert.equal((await as(TEACHER, '/api/help', { category: 'schedule', text: 'коротко' })).status, 400);
  assert.equal((await as(TEACHER, '/api/help', { category: 'schedule', text: 'В расписании у ИСУ2025-1 две пары одновременно в среду' })).status, 200);
  const list = (await as(ADMIN, '/api/admin/help')).value.items;
  assert.equal(list.length, 1);
  assert.equal(list[0].fio, 'Test teacher');
  const reply = { id: list[0].id, status: 'done', reply: 'Исправили, спасибо' };
  assert.equal((await as(ADMIN, '/api/admin/help/reply', reply)).value.needConfirm, true);
  assert.equal((await as(ADMIN, '/api/admin/confirm', { password: ADMIN.password })).status, 200);
  assert.equal((await as(ADMIN, '/api/admin/help/reply', reply)).status, 200);
  assert.equal((await as(S1, '/api/admin/help')).status, 403);
  const mine = (await as(TEACHER, '/api/help')).value.items;
  assert.equal(mine[0].status, 'done');
  assert.equal(mine[0].reply, 'Исправили, спасибо');
  assert.equal((await as(TEACHER, '/api/inbox')).value.items[0].type, 'help');
  // удаление преподавателя убирает и его обращения
  assert.equal((await as(ADMIN, '/api/admin/delete', { id: id(TEACHER), confirmEmail: TEACHER.email })).status, 200);
  assert.equal((await as(ADMIN, '/api/admin/help')).value.items.length, 0);
});

test('group catalog: ИСУ and БТ, intakes 2023–2026, three groups each; registration only from the list', async (t) => {
  const app = installation(t); await app.start();
  const list = (await app.request('/api/groups')).value.groups;
  assert.equal(list.length, 24);
  for (const g of ['ИСУ2023-1', 'ИСУ2025-2', 'БТ2026-3']) assert.ok(list.includes(g), g);
  const reg = (group) => app.request('/api/auth/register', { body: { ...person('new@example.test', 'student', group) } });
  assert.equal((await reg('Lox 26')).status, 400);
  assert.equal((await reg('БТ2024-2')).status, 202);
});
