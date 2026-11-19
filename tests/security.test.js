'use strict';
/* Тесты защиты и хранилища: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('node:stream');
const { setPassword, setPasswordSync, checkPassword, needsRehash, createLimiter, PASSWORD_MIN } = require('../server/security');
const { createStore, writeJsonAtomic } = require('../server/store');
const { assertPrivateDataRoot } = require('../server/access');
const { readJson } = require('../server/http');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ku-test-'));
const legacyHash = (pw, salt) => crypto.createHash('sha256').update(salt + pw).digest('hex');

test('KU_DATA_DIR is rejected inside every statically served directory, including results and symlink aliases', () => {
  const root = path.resolve(__dirname, '..');
  const outside = tmpDir();
  try {
    assert.doesNotThrow(() => assertPrivateDataRoot(path.join(outside, 'private'), root));
    for (const folder of ['public', 'ku-message', 'exam-sync', 'results']) {
      assert.throws(() => assertPrivateDataRoot(path.join(root, folder, 'private'), root), /веб-интерфейса/);
    }
    const alias = path.join(outside, 'results-alias');
    fs.symlinkSync(path.join(root, 'results'), alias, 'dir');
    assert.throws(() => assertPrivateDataRoot(path.join(alias, 'private'), root), /веб-интерфейса/);
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
});

test('readJson handles UTF-8 split across chunks and enforces request size in bytes', async () => {
  const bytes = Buffer.from('{"text":"Привет"}');
  const split = bytes.indexOf(Buffer.from('р')) + 1; // split the two-byte UTF-8 character
  const request = Readable.from([bytes.subarray(0, split), bytes.subarray(split)]);
  request.headers = {};
  assert.deepStrictEqual(await readJson(request, 100), { text: 'Привет' });

  const oversized = Readable.from([Buffer.from('{"text":"я"}')]);
  oversized.headers = {};
  await assert.rejects(readJson(oversized, 10), error => error.status === 413);
});

test('setPassword stores scrypt hash, never the password itself', async () => {
  const u = {};
  await setPassword(u, 'correct horse');
  assert.strictEqual(u.passAlgo, 'scrypt');
  assert.ok(u.salt && u.passHash);
  assert.ok(!JSON.stringify(u).includes('correct horse'));
});

test('checkPassword accepts the right password and rejects a wrong one', async () => {
  const u = {};
  await setPassword(u, 'correct horse');
  assert.strictEqual(await checkPassword(u, 'correct horse'), true);
  assert.strictEqual(await checkPassword(u, 'wrong horse'), false);
  assert.strictEqual(needsRehash(u), false);
});

test('setPasswordSync produces a hash that checkPassword accepts', async () => {
  const u = {};
  setPasswordSync(u, '1234');
  assert.strictEqual(u.passAlgo, 'scrypt');
  assert.strictEqual(await checkPassword(u, '1234'), true);
});

test('checkPassword still accepts legacy sha256 accounts and flags them for upgrade', async () => {
  const u = { salt: 'abcd', passHash: legacyHash('1234', 'abcd') };
  assert.strictEqual(await checkPassword(u, '1234'), true);
  assert.strictEqual(await checkPassword(u, '12345'), false);
  assert.strictEqual(needsRehash(u), true);
});

test('checkPassword is false for a user without a password', async () => {
  assert.strictEqual(await checkPassword({}, ''), false);
  assert.strictEqual(await checkPassword(null, 'x'), false);
});

test('PASSWORD_MIN is at least 8', () => {
  assert.ok(PASSWORD_MIN >= 8);
});

test('limiter blocks after max failures and resets', () => {
  let now = 1000;
  const lim = createLimiter({ max: 3, windowMs: 60_000, now: () => now });
  assert.strictEqual(lim.blocked('a'), false);
  lim.hit('a'); lim.hit('a');
  assert.strictEqual(lim.blocked('a'), false);
  lim.hit('a');
  assert.strictEqual(lim.blocked('a'), true);
  assert.strictEqual(lim.blocked('b'), false);
  lim.reset('a');
  assert.strictEqual(lim.blocked('a'), false);
});

test('limiter forgets failures after the window', () => {
  let now = 0;
  const lim = createLimiter({ max: 2, windowMs: 1000, now: () => now });
  lim.hit('x'); lim.hit('x');
  assert.strictEqual(lim.blocked('x'), true);
  now = 1500;
  assert.strictEqual(lim.blocked('x'), false);
});

test('limiter caps key length and the number of tracked keys', () => {
  const lim = createLimiter({ max: 1, windowMs: 60_000 });
  const long = 'a'.repeat(100_000);
  lim.hit(long);
  assert.strictEqual(lim.blocked(long), true);
  assert.strictEqual(lim.blocked('a'.repeat(300)), true, 'long keys are truncated to the same key');
  for (let i = 0; i < 10_005; i++) lim.hit('k' + i);
  assert.strictEqual(lim.blocked('k0'), false, 'oldest keys are evicted');
  assert.strictEqual(lim.blocked('k10004'), true);
});

test('writeJsonAtomic leaves no temp file and writes valid JSON', () => {
  const dir = tmpDir(), file = path.join(dir, 'db.json');
  writeJsonAtomic(file, { a: 1 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 1 });
  assert.deepStrictEqual(fs.readdirSync(dir), ['db.json']);
});

test('store returns empty db when there is no file yet', () => {
  const dir = tmpDir();
  const store = createStore({ file: path.join(dir, 'db.json'), backupDir: path.join(dir, 'backups'), empty: () => ({ users: [] }) });
  assert.deepStrictEqual(store.load(), { users: [] });
});

test('store daily backup keeps the state from before the first write of the day', () => {
  const dir = tmpDir(), backups = path.join(dir, 'backups');
  const store = createStore({ file: path.join(dir, 'db.json'), backupDir: backups, empty: () => ({}) });
  store.save({ users: [{ id: 'u1' }] });
  store.save({ users: [{ id: 'u1' }, { id: 'u2' }] });
  assert.deepStrictEqual(store.load(), { users: [{ id: 'u1' }, { id: 'u2' }] });
  const files = fs.readdirSync(backups);
  assert.strictEqual(files.length, 1);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(backups, files[0]), 'utf8')), { users: [{ id: 'u1' }] });
});

test('store does not overwrite an existing backup of today after a restart', () => {
  const dir = tmpDir(), backups = path.join(dir, 'backups'), file = path.join(dir, 'db.json');
  const opts = { file, backupDir: backups, empty: () => ({}) };
  const a = createStore(opts);
  a.save({ v: 1 }); a.save({ v: 2 });
  const b = createStore(opts); // перезапуск сервера
  b.save({ v: 3 });
  const files = fs.readdirSync(backups);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(backups, files[0]), 'utf8')), { v: 1 });
});

test('store restores from the latest backup when db.json is missing but backups exist', () => {
  const dir = tmpDir(), file = path.join(dir, 'db.json');
  const store = createStore({ file, backupDir: path.join(dir, 'backups'), empty: () => ({ fresh: true }) });
  store.save({ users: [{ id: 'u1' }] }); store.save({ users: [{ id: 'u1' }, { id: 'u2' }] });
  fs.unlinkSync(file);
  assert.deepStrictEqual(store.load(), { users: [{ id: 'u1' }] });
  assert.ok(fs.existsSync(file));
});

test('store treats valid JSON with a wrong shape as corrupted', () => {
  const dir = tmpDir(), file = path.join(dir, 'db.json');
  const store = createStore({ file, backupDir: path.join(dir, 'backups'), empty: () => ({}), valid: (d) => !!d && Array.isArray(d.users) });
  store.save({ users: [] }); store.save({ users: [{ id: 'u1' }] });
  fs.writeFileSync(file, 'null');
  assert.deepStrictEqual(store.load(), { users: [] });
});

test('store restores from the latest backup when db.json is corrupted', () => {
  const dir = tmpDir(), file = path.join(dir, 'db.json');
  const store = createStore({ file, backupDir: path.join(dir, 'backups'), empty: () => ({}) });
  store.save({ users: [{ id: 'u1' }] }); store.save({ users: [{ id: 'u1' }, { id: 'u2' }] });
  fs.writeFileSync(file, '{"users": [');
  assert.deepStrictEqual(store.load(), { users: [{ id: 'u1' }] });
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('db.json.corrupt-')), 'corrupted file is kept aside');
});

test('store refuses to start with an empty db when db.json is corrupted and there is no backup', () => {
  const dir = tmpDir(), file = path.join(dir, 'db.json');
  fs.writeFileSync(file, 'not json');
  const store = createStore({ file, backupDir: path.join(dir, 'backups'), empty: () => ({}) });
  assert.throws(() => store.load(), /db\.json/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'not json', 'original file is not overwritten');
});

test('store keeps only the newest backups', () => {
  const dir = tmpDir(), backups = path.join(dir, 'backups');
  fs.mkdirSync(backups);
  for (let d = 1; d <= 5; d++) fs.writeFileSync(path.join(backups, `db-2026-01-0${d}.json`), '{}');
  const store = createStore({ file: path.join(dir, 'db.json'), backupDir: backups, keep: 3, empty: () => ({}) });
  store.save({}); store.save({}); // копия делается из уже существующего файла
  const left = fs.readdirSync(backups).sort();
  assert.strictEqual(left.length, 3);
  assert.ok(!left.includes('db-2026-01-01.json'));
});

test('storage refuses a blank restart when both the live file and the only usable copy are missing', () => {
  const dir = tmpDir();
  try {
    const backupDir = path.join(dir, 'backups'); fs.mkdirSync(backupDir);
    fs.writeFileSync(path.join(backupDir, 'db-2026-01-01.json'), 'not json');
    const file = path.join(dir, 'db.json');
    const store = createStore({ file, backupDir, empty: () => ({ users: [] }) });
    assert.throws(() => store.load(), /резервной копии/);
    assert.ok(!fs.existsSync(file));
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
});

test('parallel password checks reserve slots and can release only their own attempt', () => {
  const limiter = createLimiter({ max:2, windowMs:1000 });
  const first = limiter.reserve('key'), second = limiter.reserve('key');
  assert.equal(limiter.reserve('key'), null);
  first(); first();
  const third = limiter.reserve('key');
  assert.equal(typeof third, 'function'); assert.equal(limiter.reserve('key'), null);
  third(); second();
  assert.equal(limiter.blocked('key'), false);
});
