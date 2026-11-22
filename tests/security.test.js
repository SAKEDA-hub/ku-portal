'use strict';
/* Тесты защиты и хранилища: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('node:stream');
const { setPassword, setPasswordSync, checkPassword, needsRehash, createLimiter, PASSWORD_MIN, secureDataDirectory } = require('../server/security');
const { createStore, writeJsonAtomic, encodeStoredJson, decodeStoredJson, readStoreJson } = require('../server/store');
const { assertPrivateDataRoot } = require('../server/access');
const { readJson, resolveStaticFile, HTTP_LIMITS, configureHttpServer } = require('../server/http');
const http = require('node:http');
const { createConcurrencyLimiter } = require('../server/security');
const { createExamSync } = require('../exam-sync/handler');
const { collections } = require('../exam-sync/model');
const { createResults } = require('../server/results');
const { createAdmin, stageBundledRotations } = require('../server/admin');

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

test('AES-GCM store encryption hides database contents and detects a wrong key', () => {
  const previous = process.env.KU_DATA_ENCRYPTION_KEY, previousDriver = process.env.KU_DB_DRIVER, key = crypto.randomBytes(32).toString('hex');
  const dir = tmpDir(), file = path.join(dir, 'db.json');
  try {
    process.env.KU_DATA_ENCRYPTION_KEY = key;
    process.env.KU_DB_DRIVER = 'json';
    const record = { users: [{ email: 'private@example.test', passHash: 'secret-hash' }] };
    const stored = encodeStoredJson(record);
    assert.equal(JSON.parse(stored)._kuEncrypted, 1);
    assert.equal(stored.includes('private@example.test'), false);
    assert.deepStrictEqual(decodeStoredJson(stored), record);
    const store = createStore({ file, backupDir:path.join(dir, 'backups'), empty:() => ({}) });
    store.save(record);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))._kuEncrypted, 1);
    assert.deepStrictEqual(store.load(), record);
    assert.deepStrictEqual(readStoreJson(file), record);
    process.env.KU_DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    assert.throws(() => decodeStoredJson(stored), /ключ неверен/);
  } finally {
    if (previous === undefined) delete process.env.KU_DATA_ENCRYPTION_KEY;
    else process.env.KU_DATA_ENCRYPTION_KEY = previous;
    if (previousDriver === undefined) delete process.env.KU_DB_DRIVER;
    else process.env.KU_DB_DRIVER = previousDriver;
    fs.rmSync(dir, { recursive:true, force:true });
  }
});

test('Online Exam rejects old passwords, redeems one-use portal SSO and preserves linked work', async () => {
  const dir = tmpDir(), file = path.join(dir, 'exam-sync.json');
  const data = { format: 2, rev: 1, db: Object.fromEntries(collections.map(c => [c, []])) };
  data.db.users = [['std_3', { id:'std_3', login:'old-login', name:'Student', role:'student', salt:'x', passHash:'old-hash', passAlgo:'scrypt' }]];
  data.db.grades = [['g1', { id:'g1', userId:'std_3', roomId:'room1', part:'test', score:8 }]];
  writeJsonAtomic(file, data);
  let redeemed = false, authVersion = 0;
  const portalUser = () => ({ id:'std_3', email:'student@example.test', fio:'Student', role:'student', perms:{}, authVersion });
  const options = { base:'/exam-sync', dataFile:file, demo:false,
    redeemPortalCode: async code => code === 'valid-once' && !redeemed ? (redeemed = true, { id:'std_3' }) : null,
    portalUserById: id => id === 'std_3' ? portalUser() : null };
  const handler = createExamSync(options);
  const request = async (target, method, route, body, token) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.url = route; req.method = method; req.headers = token ? { authorization:'Bearer ' + token } : {};
    const res = { statusCode:200, headers:{}, setHeader(k, v) { this.headers[k] = v; },
      writeHead(code, headers = {}) { this.statusCode = code; Object.assign(this.headers, headers); },
      end(text = '') { this.body = text; } };
    try { await target(req, res); }
    catch (error) { res.writeHead(error.status || 500); res.end(JSON.stringify({ error:error.message })); }
    return { status:res.statusCode, json:() => JSON.parse(res.body || '{}') };
  };
  try {
    const oldLogin = await request(handler, 'POST', '/exam-sync/api/login', {login:'old-login',password:'old'});
    assert.equal(oldLogin.status, 403);
    const login = await request(handler, 'POST', '/exam-sync/api/sso/redeem', {code:'valid-once'});
    assert.equal(login.status, 200);
    const state = login.json();
    assert.equal(state.user.id, 'std_3'); assert.equal(state.user.login, 'student@example.test');
    assert.equal(state.db.grades[0].id, 'g1');
    assert.equal((await request(handler, 'GET', '/exam-sync/api/state', undefined, state.token)).status, 200);
    const restarted = createExamSync(options);
    assert.equal((await request(restarted, 'GET', '/exam-sync/api/state', undefined, state.token)).status, 401);
    authVersion++;
    assert.equal((await request(handler, 'GET', '/exam-sync/api/state', undefined, state.token)).status, 401);
    const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
    const user = persisted.db.users.find(([id]) => id === 'std_3')[1];
    assert.equal(user.passHash, undefined); assert.equal(user.salt, undefined);
    const replay = await request(handler, 'POST', '/exam-sync/api/sso/redeem', {code:'valid-once'});
    assert.equal(replay.status, 401);
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
});

test('results sessions expire immediately after the portal password changes', async () => {
  const dir = tmpDir();
  let authVersion = 1;
  const access = () => ({ id:'tch_1', fio:'Teacher', role:'teacher', authVersion });
  const results = createResults({ dataDir:dir, portal:{ fromRequest:req => req.headers.authorization === 'Bearer portal' ? access() : null, byId:id => id === 'tch_1' ? access() : null } });
  const request = async (method, route, body, token) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.url = route; req.method = method; req.headers = token ? { authorization:'Bearer ' + token } : {};
    const res = { statusCode:200, headers:{}, setHeader(k,v) { this.headers[k] = v; },
      writeHead(code, headers = {}) { this.statusCode = code; Object.assign(this.headers, headers); }, end(text = '') { this.body = text; } };
    await results.handle(req, res, new URL(req.url, 'http://localhost'));
    return { status:res.statusCode, json:() => JSON.parse(res.body || '{}') };
  };
  try {
    const login = await request('POST', '/api/results/portal-login', {}, 'portal');
    assert.equal(login.status, 200);
    assert.equal((await request('GET', '/api/results/results', undefined, login.json().token)).status, 200);
    authVersion++;
    assert.equal((await request('GET', '/api/results/results', undefined, login.json().token)).status, 401);
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
});

test('encrypted one-time account rotation replaces credentials, revokes sessions and cannot replay', () => {
  const dir = tmpDir(), users = [
    { id:'std_1', email:'student@example.test', role:'student', group:'G1', password:'old-legacy-password', totp:{ enabled:true, secret:'kept' } },
    { id:'tch_2', email:'teacher@example.test', role:'teacher', group:'', passHash:'old-hash', salt:'old-salt', passAlgo:'sha256' },
  ];
  const db = { users }, revoked = [], events = [];
  const taskDir = path.join(dir, 'portal-provision'), bundleDir = path.join(dir, 'bundles'); fs.mkdirSync(bundleDir);
  const updates = users.map((user, index) => {
    const hash = {}; setPasswordSync(hash, 'fresh temporary password ' + index);
    return { userId:user.id, salt:hash.salt, passHash:hash.passHash, passAlgo:hash.passAlgo };
  });
  const batchId = crypto.randomUUID(), batch = { action:'rotate-accounts', batchId, accounts:updates };
  const previousKey = process.env.KU_DATA_ENCRYPTION_KEY, key = crypto.randomBytes(32);
  process.env.KU_DATA_ENCRYPTION_KEY = key.toString('hex');
  fs.writeFileSync(path.join(bundleDir, batchId + '.json.enc'), encodeStoredJson(batch, key), { mode:0o600 });
  let saved = 0, backupsCleared = 0;
  const admin = createAdmin({ getDB:() => db, saveDB:() => saved++, ok:() => {}, bad:() => {}, sec:{}, audit:(...event) => events.push(event),
    passError:async () => null, reqToken:() => 'operator', dropUserSessions:id => revoked.push(id), isOnline:() => false,
    DATA:dir, clearRotationBackups:() => backupsCleared++ });
  try {
    stageBundledRotations({ DATA:dir, bundleDir });
    admin.applyProvision();
    assert.equal(saved, 1);
    assert.equal(backupsCleared, 1);
    assert.deepStrictEqual(revoked.sort(), ['std_1','tch_2']);
    assert.equal(users[0].password, undefined);
    assert.deepStrictEqual(users[0].totp, { enabled:true, secret:'kept' });
    assert.equal(users[0].group, 'G1');
    assert.equal(users[0].mustChangePassword, true);
    assert.ok(users.every((user, index) => user.passHash === updates[index].passHash && user.salt === updates[index].salt));
    assert.equal(fs.readdirSync(taskDir).length, 0);
    assert.deepStrictEqual(events.map(event => event[0]), ['portal.password.reset','portal.password.reset']);
    stageBundledRotations({ DATA:dir, bundleDir }); admin.applyProvision();
    assert.equal(saved, 1); assert.equal(backupsCleared, 1);
    assert.deepStrictEqual(readStoreJson(path.join(dir, 'account-rotation-batches.json')), { applied:[batchId] });
  } finally {
    if (previousKey === undefined) delete process.env.KU_DATA_ENCRYPTION_KEY; else process.env.KU_DATA_ENCRYPTION_KEY = previousKey;
    fs.rmSync(dir, { recursive:true, force:true });
  }
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

test('static file resolver rejects symlinks that escape the web root and allows ordinary files', () => {
  const dir = tmpDir(), root = path.join(dir, 'public'), outside = path.join(dir, 'private');
  fs.mkdirSync(root); fs.mkdirSync(outside);
  const safe = path.join(root, 'index.html'), secret = path.join(outside, 'db.json');
  fs.writeFileSync(safe, 'public'); fs.writeFileSync(secret, '{\"secret\":true}');
  assert.strictEqual(resolveStaticFile(root, safe), fs.realpathSync(safe));
  const link = path.join(root, 'backup.json');
  try {
    fs.symlinkSync(secret, link, 'file');
    assert.strictEqual(resolveStaticFile(root, link), null, 'a static symlink must not expose private files');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('static file resolver rejects directories and missing targets', () => {
  const dir = tmpDir(), root = path.join(dir, 'public'); fs.mkdirSync(root);
  try {
    assert.strictEqual(resolveStaticFile(root, root), null);
    assert.strictEqual(resolveStaticFile(root, path.join(root, 'missing.js')), null);
    assert.strictEqual(resolveStaticFile(root, path.join(root, '..', 'private.txt')), null, 'path traversal outside the web root is rejected');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('private data directory tightens permissions of existing directories and files', () => {
  if (process.platform === 'win32') return; // POSIX mode bits are not Windows ACLs.
  const dir = tmpDir(), nested = path.join(dir, 'backups'); fs.mkdirSync(nested);
  const file = path.join(nested, 'backup.json'); fs.writeFileSync(file, '{}');
  fs.chmodSync(dir, 0o755); fs.chmodSync(nested, 0o755); fs.chmodSync(file, 0o644);
  secureDataDirectory(dir);
  assert.strictEqual(fs.statSync(dir).mode & 0o777, 0o700);
  assert.strictEqual(fs.statSync(nested).mode & 0o777, 0o700);
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  fs.rmSync(dir, { recursive: true, force: true });
});


test('HTTP server has bounded headers, request duration, keep-alive and header count', () => {
  const server = configureHttpServer(http.createServer());
  try {
    assert.equal(server.headersTimeout, 30_000);
    assert.equal(server.requestTimeout, 120_000);
    assert.equal(server.keepAliveTimeout, 5_000);
    assert.equal(server.maxRequestsPerSocket, 1_000);
    assert.equal(server.maxHeadersCount, 100);
    assert.equal(HTTP_LIMITS.maxHeaderSize, 16 * 1024);
  } finally { server.close(); }
});

test('expensive-operation concurrency limiter caps active work and releases safely', () => {
  const gate = createConcurrencyLimiter(2);
  const first = gate.reserve(), second = gate.reserve();
  assert.equal(gate.active, 2);
  assert.equal(gate.reserve(), null, 'third concurrent operation is refused');
  first(); first();
  assert.equal(gate.active, 1, 'release is idempotent');
  const third = gate.reserve();
  assert.ok(third);
  second(); third();
  assert.equal(gate.active, 0);
});

test('concurrency limiter rejects invalid capacity', () => {
  assert.throws(() => createConcurrencyLimiter(0), /positive integer/);
  assert.throws(() => createConcurrencyLimiter(1.5), /positive integer/);
});
