'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installation } = require('./harness');
const { buildMessage } = require('../server/mail');

const STUDENT = { lastName: 'Test', firstName: 'Student', email: 'student@example.test', role: 'student', group: 'G1', password: 'first-password' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* Подставной sendmail: каждое письмо — файл в каталоге outbox */
function fakeSendmail(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ku-mail-'));
  const outbox = path.join(dir, 'outbox'); fs.mkdirSync(outbox);
  const bin = path.join(dir, 'sendmail');
  fs.writeFileSync(bin, `#!/bin/sh\ncat > "${outbox}/$(date +%s%N).eml"\n`, { mode: 0o755 });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const letters = () => fs.readdirSync(outbox).sort().map(f => fs.readFileSync(path.join(outbox, f), 'utf8'));
  const body = raw => Buffer.from(raw.split('\r\n\r\n')[1].replace(/\s+/g, ''), 'base64').toString('utf8');
  return { bin, letters, body };
}

test('forgotten password: email with a one-time link, new password works, old sessions end, no account enumeration', async t => {
  const mail = fakeSendmail(t);
  const app = installation(t, false, { KU_SENDMAIL: mail.bin, KU_PUBLIC_URL: 'https://portal.example.test/' });
  await app.start();
  const call = app.request;
  assert.equal((await call('/api/auth/register', { body: STUDENT })).status, 202);
  const id = JSON.parse(fs.readFileSync(path.join(app.data, 'db.json'))).users[0].id;

  // ещё не подтверждён — письма нет, но ответ такой же
  assert.deepEqual((await call('/api/auth/forgot', { body: { email: STUDENT.email } })).value, { sent: true });
  app.cli('approve', id);
  const session = (await call('/api/auth/login', { body: STUDENT })).value.token;
  assert.deepEqual((await call('/api/auth/forgot', { body: { email: 'nobody@example.test' } })).value, { sent: true });
  assert.deepEqual((await call('/api/auth/forgot', { body: { email: ' Student@Example.test ' } })).value, { sent: true });
  await sleep(300);
  const letters = mail.letters();
  assert.equal(letters.length, 1);
  assert.match(letters[0], /^To: <student@example\.test>$/m);
  const link = /https:\/\/portal\.example\.test\/#\/reset\/([0-9a-f]{48})/.exec(mail.body(letters[0]));
  assert.ok(link, 'ссылка в письме');
  assert.ok(!fs.readFileSync(path.join(app.data, 'db.json'), 'utf8').includes(link[1]), 'в базе только хеш кода');

  assert.equal((await call('/api/auth/reset', { body: { token: link[1], password: 'short' } })).status, 400);
  assert.equal((await call('/api/auth/reset', { body: { token: 'f'.repeat(48), password: 'brand-new-password' } })).status, 400);
  const done = await call('/api/auth/reset', { body: { token: link[1], password: 'brand-new-password' } });
  assert.equal(done.status, 200); assert.equal(done.value.email, STUDENT.email);
  assert.equal((await call('/api/me', { token: session })).status, 401);
  assert.equal((await call('/api/auth/login', { body: STUDENT })).status, 401);
  assert.equal((await call('/api/auth/login', { body: { ...STUDENT, password: 'brand-new-password' } })).status, 200);
  // ссылка одноразовая
  assert.equal((await call('/api/auth/reset', { body: { token: link[1], password: 'another-password' } })).status, 400);

  // не больше 3 писем в час на адрес
  for (let i = 0; i < 3; i++) await call('/api/auth/forgot', { body: { email: STUDENT.email } });
  assert.equal((await call('/api/auth/forgot', { body: { email: STUDENT.email } })).status, 429);
  // повторные запросы в течение 10 минут не шлют новых писем и не отменяют свежую ссылку
  await sleep(300);
  assert.equal(mail.letters().length, 2);
  const auditDir = path.join(app.data, 'audit');
  const journal = fs.readFileSync(path.join(auditDir, fs.readdirSync(auditDir)[0]), 'utf8');
  assert.match(journal, /portal\.password\.recovered/);
  assert.ok(!journal.includes(link[1]) && !journal.includes(STUDENT.email));
});

test('without sendmail the site says recovery is unavailable instead of pretending to send', async t => {
  const app = installation(t, false, { KU_SENDMAIL: '/nonexistent/sendmail' });
  await app.start();
  assert.equal((await app.request('/api/auth/forgot', { body: { email: 'a@example.test' } })).status, 503);
});

test('mail headers cannot be injected through the recipient or subject', () => {
  const raw = buildMessage({ to: 'a@example.test\r\nBcc: victim@example.test', subject: 'Hi\r\nBcc: x@example.test', text: 'тело' });
  assert.ok(!/^Bcc:/m.test(raw));
  assert.match(raw, /^Subject: =\?UTF-8\?B\?/m);
});
