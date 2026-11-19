'use strict';
/* Тесты хранения в MySQL на двойнике базы (понимает только запросы, которые строит server/mysql.js) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mysqlConfig, createRowSync, portalToRows, portalFromRows, examToRows, examFromRows, TABLES } = require('../server/mysql');
const { openStorage } = require('../server/storage');

/* Двойник MySQL: таблицы — Map(id → строка со всеми колонками) */
function fake({ failConnect = false } = {}) {
  const tables = new Map();
  async function query(sql, params = []) {
    let m;
    if ((m = /^CREATE TABLE IF NOT EXISTS `(\w+)`/.exec(sql))) { if (!tables.has(m[1])) tables.set(m[1], new Map()); return [[]]; }
    if ((m = /^SELECT id, pos, data FROM `(\w+)` ORDER BY pos/.exec(sql))) return [[...tables.get(m[1]).values()].sort((a, b) => a.pos - b.pos).map((r) => ({ id: r.id, pos: r.pos, data: r.data }))];
    if ((m = /^INSERT INTO `(\w+)` \(([^)]+)\) VALUES/.exec(sql))) {
      const cols = m[2].split(',').map((c) => c.trim().replace(/`/g, ''));
      const row = Object.fromEntries(cols.map((c, i) => [c, params[i]]));
      tables.get(m[1]).set(row.id, row);
      return [{ affectedRows: 1 }];
    }
    if ((m = /^DELETE FROM `(\w+)` WHERE id IN/.exec(sql))) { params.forEach((id) => tables.get(m[1]).delete(id)); return [{}]; }
    throw new Error('fake: unsupported SQL ' + sql);
  }
  const conn = { query, transaction: (fn) => fn(query), close: async () => { } };
  return { tables, conn, connect: async () => { if (failConnect) throw new Error('ECONNREFUSED'); return conn; } };
}

const PORTAL_TABLES = ['users', 'subjects', 'schedule', 'grades', 'sessions', 'kv'];
const MYSQL_ENV = { MYSQL_URL: 'mysql://u:p@h/d' };
const sampleDb = () => ({
  users: [
    { id: 'std_1', role: 'student', fio: 'Иванов Данияр', email: 'student@demo.kz', group: 'ИСУ-26-2-а', program: 'ku', salt: 's', passHash: 'h', passAlgo: 'scrypt', createdAt: 1 },
    { id: 'tch_1', role: 'teacher', fio: 'Ахметова А.', email: 'teacher@demo.kz', group: '', salt: 's2', passHash: 'h2', createdAt: 2 },
  ],
  subjects: [{ id: 'sub_1', name: 'Английский язык', teacherId: 'tch_1', discipline: 'english' }],
  schedule: [{ id: 'sc_1', subjectId: 'sub_1', teacherId: 'tch_1', type: 'Лек.', group: 'ИСУ-26-2-а', day: 0, start: '09:00', end: '10:20', room: '214' }],
  grades: [{ id: 'gr_1', studentId: 'std_1', subjectId: 'sub_1', teacherId: 'tch_1', score: 88, date: '2026-11-19' }],
  sessions: { tok1: 'std_1' },
  sessMeta: { tok1: { sid: 'a', uid: 'std_1', created: 5, lastSeen: 6, ua: 'x', ip: '1.2.3.4' } },
  seq: { std: 1, tch: 1 },
  chat: { v: 3, msgs: [{ id: 'm1', text: 'Привет' }] },
  _savedAt: 100,
});
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ku-sql-'));
const open = (dir, f, extra) => openStorage(Object.assign({ dataDir: dir, env: MYSQL_ENV, connect: f.connect, emptyPortal: () => ({ users: [] }) }, extra));

test('mysqlConfig is null without settings and parses URL or separate variables', () => {
  assert.strictEqual(mysqlConfig({}), null);
  assert.deepStrictEqual(mysqlConfig({ MYSQL_URL: 'mysql://u:p%40ss@db.example:3307/ku_main' }), { host: 'db.example', port: 3307, user: 'u', password: 'p@ss', database: 'ku_main' });
  assert.deepStrictEqual(mysqlConfig({ MYSQL_HOST: 'h', MYSQL_USER: 'u', MYSQL_PASSWORD: 'p', MYSQL_DATABASE: 'd' }), { host: 'h', port: 3306, user: 'u', password: 'p', database: 'd' });
  assert.strictEqual(mysqlConfig({ MYSQL_HOST: 'h' }), null, 'incomplete settings are ignored');
});

test('portal db survives a round trip through rows unchanged', async () => {
  const f = fake();
  const sync = createRowSync({ conn: f.conn, tables: PORTAL_TABLES });
  await sync.ensure();
  const db = sampleDb();
  await sync.write(portalToRows(db));
  assert.deepStrictEqual(portalFromRows(await sync.read()), db);
});

test('readable columns are filled for viewing in phpMyAdmin', async () => {
  const f = fake();
  const sync = createRowSync({ conn: f.conn, tables: PORTAL_TABLES });
  await sync.ensure();
  await sync.write(portalToRows(sampleDb()));
  const u = f.tables.get('users').get('std_1');
  assert.strictEqual(u.email, 'student@demo.kz');
  assert.strictEqual(u.group_name, 'ИСУ-26-2-а');
  assert.strictEqual(u.pass_algo, 'scrypt');
  assert.strictEqual(f.tables.get('users').get('tch_1').pass_algo, 'sha256');
  const g = f.tables.get('grades').get('gr_1');
  assert.strictEqual(g.student_id, 'std_1');
  assert.strictEqual(Number(g.score), 88);
  assert.strictEqual(f.tables.get('sessions').get('tok1').user_id, 'std_1');
});

test('second write sends only changed rows and deletes removed ones', async () => {
  const f = fake();
  const sync = createRowSync({ conn: f.conn, tables: PORTAL_TABLES });
  await sync.ensure();
  const db = sampleDb();
  await sync.write(portalToRows(db));
  db.grades[0].score = 91;
  assert.strictEqual(await sync.write(portalToRows(db)), 1);
  db.users.pop();
  await sync.write(portalToRows(db));
  assert.strictEqual(f.tables.get('users').has('tch_1'), false);
  assert.strictEqual(await sync.write(portalToRows(db)), 0, 'nothing changed — nothing written');
});

test('a fresh row sync reading existing tables does not rewrite unchanged rows', async () => {
  const f = fake();
  const a = createRowSync({ conn: f.conn, tables: PORTAL_TABLES });
  await a.ensure();
  await a.write(portalToRows(sampleDb()));
  const b = createRowSync({ conn: f.conn, tables: PORTAL_TABLES }); // перезапуск сервера
  const db = portalFromRows(await b.read());
  assert.strictEqual(await b.write(portalToRows(db)), 0);
});

test('exam-sync data survives a round trip through rows', async () => {
  const f = fake();
  const sync = createRowSync({ conn: f.conn, tables: ['exam_sync'] });
  await sync.ensure();
  const data = { rev: 7, savedAt: 50, db: { users: [['u1', { id: 'u1', name: 'A' }]], results: [['r|u1|t1', { roomId: 'r', userId: 'u1', score: 5 }]] } };
  await sync.write(examToRows(data));
  assert.deepStrictEqual(examFromRows(await sync.read()), data);
});

test('every table has an id, pos and data column', () => {
  for (const [name, spec] of Object.entries(TABLES)) assert.ok(spec.ddl.includes('`id`') && spec.ddl.includes('`pos`') && spec.ddl.includes('`data`'), name);
});

test('storage without MySQL settings works on the JSON file only', async () => {
  const dir = tmpDir();
  const st = await openStorage({ dataDir: dir, env: {}, emptyPortal: () => ({ users: [] }) });
  assert.strictEqual(st.mode, 'json');
  const db = st.portal.load();
  db.users.push({ id: 'u1' });
  st.portal.save(db);
  await st.flush();
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')).users[0].id, 'u1');
});

test('first start with MySQL migrates the existing JSON database', async () => {
  const dir = tmpDir(), f = fake();
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(sampleDb()));
  const st = await open(dir, f);
  assert.strictEqual(st.mode, 'mysql');
  assert.strictEqual(st.portal.load().users.length, 2);
  assert.strictEqual(f.tables.get('users').size, 2, 'users copied to MySQL');
  assert.strictEqual(f.tables.get('grades').get('gr_1').student_id, 'std_1');
});

test('saves reach MySQL and the JSON mirror; newest copy wins on the next start', async () => {
  const dir = tmpDir(), f = fake();
  const st = await open(dir, f);
  const db = st.portal.load();
  db.users.push({ id: 'u9', email: 'n@x.kz' });
  st.portal.save(db);
  await st.flush();
  assert.ok(f.tables.get('users').has('u9'));
  const file = path.join(dir, 'db.json');
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).users.some((u) => u.id === 'u9'));
  // файл откатили к старому состоянию — MySQL новее и побеждает
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  old.users = []; old._savedAt = 1;
  fs.writeFileSync(file, JSON.stringify(old));
  const st2 = await open(dir, f);
  assert.ok(st2.portal.load().users.some((u) => u.id === 'u9'));
});

test('when MySQL is down the site starts on the JSON mirror, and later its newer data goes back to MySQL', async () => {
  const dir = tmpDir(), f = fake();
  const st = await open(dir, f);
  st.portal.save(Object.assign(st.portal.load(), { users: [{ id: 'a' }] }));
  await st.flush();
  const st2 = await open(dir, fake({ failConnect: true }), { retries: 1, retryMs: 1 });
  assert.strictEqual(st2.mode, 'json');
  assert.ok(st2.error);
  const db = st2.portal.load();
  db.users.push({ id: 'b' });
  st2.portal.save(db);
  await st2.flush();
  const st3 = await open(dir, f);
  assert.deepStrictEqual(st3.portal.load().users.map((u) => u.id), ['a', 'b']);
  assert.ok(f.tables.get('users').has('b'), 'newer JSON data synced back into MySQL');
});

test('exam storage round-trips through MySQL', async () => {
  const dir = tmpDir(), f = fake();
  const st = await open(dir, f);
  assert.strictEqual(st.exam.load(), null);
  st.exam.save({ rev: 1, db: { users: [['u1', { id: 'u1' }]] } });
  await st.flush();
  const st2 = await open(dir, f);
  assert.deepStrictEqual(st2.exam.load().db.users, [['u1', { id: 'u1' }]]);
});
