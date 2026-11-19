'use strict';
/* MySQL / MariaDB для базы портала и онлайн-экзамена (alwaysdata → Базы данных → MySQL).
 * Каждая таблица: id (ключ), pos (порядок в списке), читаемые колонки для phpMyAdmin и SQL-запросов
 * (email, ФИО, группа, балл…), data — запись целиком в JSON (из неё база и восстанавливается), updated_at.
 *   users, subjects, schedule, grades — одноимённые списки db;  sessions — db.sessions + db.sessMeta;
 *   kv — всё остальное (сообщения, клубы, общежитие, счётчики) по ключу верхнего уровня;
 *   exam_sync — коллекции онлайн-экзамена (строка = запись коллекции).
 * createRowSync пишет только изменившиеся строки (сравнение с последним сохранённым), одной транзакцией.
 */
const crypto = require('crypto');

const str = (n) => (v) => (v == null || v === '' ? null : String(v).slice(0, n));
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const col = (name, type, get) => ({ name, type, get });
/* [читаемые колонки, индексы] */
const TABLE_SPECS = {
  users: [[
    col('email', 'VARCHAR(191)', (u) => str(191)(u.email)), col('fio', 'VARCHAR(255)', (u) => str(255)(u.fio)),
    col('role', 'VARCHAR(16)', (u) => str(16)(u.role)), col('group_name', 'VARCHAR(64)', (u) => str(64)(u.group)),
    col('program', 'VARCHAR(16)', (u) => str(16)(u.program)), col('pass_algo', 'VARCHAR(16)', (u) => (u.passHash ? (u.passAlgo === 'scrypt' ? 'scrypt' : 'sha256') : null)),
    col('created_at', 'BIGINT', (u) => num(u.createdAt)),
  ], ['email']],
  subjects: [[
    col('name', 'VARCHAR(255)', (s) => str(255)(s.name)), col('teacher_id', 'VARCHAR(64)', (s) => str(64)(s.teacherId)),
    col('discipline', 'VARCHAR(32)', (s) => str(32)(s.discipline)),
  ], ['teacher_id']],
  schedule: [[
    col('subject_id', 'VARCHAR(64)', (r) => str(64)(r.subjectId)), col('teacher_id', 'VARCHAR(64)', (r) => str(64)(r.teacherId)),
    col('group_name', 'VARCHAR(64)', (r) => str(64)(r.group)), col('day_index', 'TINYINT', (r) => num(r.day)),
    col('start_time', 'VARCHAR(5)', (r) => str(5)(r.start)), col('end_time', 'VARCHAR(5)', (r) => str(5)(r.end)),
    col('room', 'VARCHAR(128)', (r) => str(128)(r.room)), col('lesson_type', 'VARCHAR(32)', (r) => str(32)(r.type)),
  ], ['group_name', 'teacher_id']],
  grades: [[
    col('student_id', 'VARCHAR(64)', (g) => str(64)(g.studentId)), col('subject_id', 'VARCHAR(64)', (g) => str(64)(g.subjectId)),
    col('teacher_id', 'VARCHAR(64)', (g) => str(64)(g.teacherId)), col('score', 'DECIMAL(6,2)', (g) => num(g.score)),
    col('grade_date', 'VARCHAR(10)', (g) => str(10)(g.date)),
  ], ['student_id', 'teacher_id']],
  sessions: [[
    col('user_id', 'VARCHAR(64)', (s) => str(64)(s.uid)), col('created', 'BIGINT', (s) => num(s.meta && s.meta.created)),
    col('last_seen', 'BIGINT', (s) => num(s.meta && s.meta.lastSeen)), col('ip', 'VARCHAR(64)', (s) => str(64)(s.meta && s.meta.ip)),
  ], ['user_id']],
  kv: [[], []],
  exam_sync: [[col('col', 'VARCHAR(32)', (x) => str(32)(x.col || '__meta'))], ['col']],
};
const ddl = (name, cols, idx) => `CREATE TABLE IF NOT EXISTS \`${name}\` (\`id\` VARCHAR(191) NOT NULL, \`pos\` INT NOT NULL, `
  + cols.map((c) => `\`${c.name}\` ${c.type} NULL, `).join('')
  + '`data` LONGTEXT NOT NULL, `updated_at` BIGINT NOT NULL, PRIMARY KEY (`id`)'
  + idx.map((i) => `, KEY \`${i}\` (\`${i}\`)`).join('')
  + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
const TABLES = Object.fromEntries(Object.entries(TABLE_SPECS).map(([name, [cols, idx]]) => [name, { cols, ddl: ddl(name, cols, idx) }]));
const PORTAL_TABLES = ['users', 'subjects', 'schedule', 'grades', 'sessions', 'kv'];
const EXAM_TABLES = ['exam_sync'];

/* Настройки подключения: MYSQL_URL=mysql://user:pass@host:port/db или MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE (+ MYSQL_PORT) */
function mysqlConfig(env) {
  if (env.MYSQL_URL) {
    const u = new URL(env.MYSQL_URL);
    return { host: u.hostname, port: Number(u.port) || 3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: decodeURIComponent(u.pathname.slice(1)) };
  }
  const { MYSQL_HOST: host, MYSQL_USER: user, MYSQL_PASSWORD: password = '', MYSQL_DATABASE: database } = env;
  if (!host || !user || !database) return null;
  return { host, port: Number(env.MYSQL_PORT) || 3306, user, password, database };
}

/* conn: { query(sql, params) → [rows], transaction(fn(query)) }; rows: { таблица: [[id, значение], …] } по порядку */
function createRowSync({ conn, tables }) {
  const last = new Map(tables.map((t) => [t, new Map()])); // таблица → id → «pos + JSON» последней записи
  const sig = (pos, json) => pos + '\u0000' + json;
  async function ensure() { for (const t of tables) await conn.query(TABLES[t].ddl); }
  async function read() {
    const out = {};
    for (const t of tables) {
      const [rows] = await conn.query(`SELECT id, pos, data FROM \`${t}\` ORDER BY pos`);
      const seen = new Map();
      out[t] = rows.map((r) => { const json = String(r.data); seen.set(r.id, sig(r.pos, json)); return [r.id, JSON.parse(json)]; });
      last.set(t, seen);
    }
    return out;
  }
  async function write(rows) {
    const ups = [], dels = [], next = new Map();
    for (const t of tables) { // снимок целиком до первого await — данные в памяти могут меняться во время записи
      const prev = last.get(t), cur = new Map();
      (rows[t] || []).forEach(([id, v], pos) => {
        const json = JSON.stringify(v), s = sig(pos, json);
        cur.set(id, s);
        if (prev.get(id) !== s) ups.push([t, id, pos, json, TABLES[t].cols.map((c) => c.get(v || {}))]);
      });
      for (const id of prev.keys()) if (!cur.has(id)) dels.push([t, id]);
      next.set(t, cur);
    }
    if (!ups.length && !dels.length) return 0;
    const now = Date.now();
    await conn.transaction(async (q) => {
      for (const [t, id, pos, json, extra] of ups) {
        const names = ['id', 'pos', ...TABLES[t].cols.map((c) => c.name), 'data', 'updated_at'];
        await q(`INSERT INTO \`${t}\` (${names.map((n) => `\`${n}\``).join(', ')}) VALUES (${names.map(() => '?').join(', ')}) `
          + `ON DUPLICATE KEY UPDATE ${names.slice(1).map((n) => `\`${n}\` = VALUES(\`${n}\`)`).join(', ')}`, [id, pos, ...extra, json, now]);
      }
      for (const t of tables) {
        const ids = dels.filter((d) => d[0] === t).map((d) => d[1]);
        for (let i = 0; i < ids.length; i += 500) {
          const part = ids.slice(i, i + 500);
          await q(`DELETE FROM \`${t}\` WHERE id IN (${part.map(() => '?').join(', ')})`, part);
        }
      }
    });
    for (const [t, cur] of next) last.set(t, cur);
    return ups.length + dels.length;
  }
  return { ensure, read, write };
}

/* ---------- база портала ↔ строки ---------- */
const ROW_ARRAYS = ['users', 'subjects', 'schedule', 'grades'];
function portalToRows(db) {
  const rows = { sessions: [], kv: [] };
  for (const t of ROW_ARRAYS) rows[t] = (db[t] || []).map((r, i) => [r && r.id != null ? String(r.id) : `#${i}`, r]);
  for (const [tok, uid] of Object.entries(db.sessions || {})) rows.sessions.push([tok, { uid, meta: (db.sessMeta || {})[tok] }]);
  for (const [k, v] of Object.entries(db)) if (!ROW_ARRAYS.includes(k) && k !== 'sessions' && k !== 'sessMeta' && v !== undefined) rows.kv.push([k, v]);
  return rows;
}
/* null — в таблицах пусто (первый запуск с MySQL) */
function portalFromRows(rows) {
  if (!PORTAL_TABLES.some((t) => rows[t] && rows[t].length)) return null;
  const db = {};
  for (const [k, v] of rows.kv || []) db[k] = v;
  for (const t of ROW_ARRAYS) db[t] = (rows[t] || []).map(([, v]) => v);
  db.sessions = {}; db.sessMeta = {};
  for (const [tok, s] of rows.sessions || []) { db.sessions[tok] = s.uid; if (s.meta) db.sessMeta[tok] = s.meta; }
  return db;
}

/* ---------- онлайн-экзамен ↔ строки: { rev, savedAt, db: { коллекция: [[ключ, запись], …] } } ---------- */
const examId = (c, k) => { const id = `${c}/${k}`; return id.length <= 191 ? id : `${c}/#${crypto.createHash('sha1').update(String(k)).digest('hex')}`; };
function examToRows(data) {
  const meta = { rev: data.rev || 0, cols: Object.keys(data.db || {}) };
  if (data.savedAt !== undefined) meta.savedAt = data.savedAt;
  const rows = [['__meta', meta]];
  for (const [c, list] of Object.entries(data.db || {})) for (const [k, r] of list) rows.push([examId(c, k), { col: c, k, r }]);
  return { exam_sync: rows };
}
function examFromRows(rows) {
  const list = rows.exam_sync || [];
  const meta = (list.find(([id]) => id === '__meta') || [])[1];
  if (!meta) return null;
  const db = Object.fromEntries((meta.cols || []).map((c) => [c, []]));
  for (const [id, v] of list) if (id !== '__meta') (db[v.col] = db[v.col] || []).push([v.k, v.r]);
  const out = { rev: meta.rev, db };
  if (meta.savedAt !== undefined) out.savedAt = meta.savedAt;
  return out;
}

/* Подключение через mysql2 (пул). Модуль подгружается только при настроенной MySQL. */
async function connectMysql(cfg) {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool(Object.assign({ charset: 'utf8mb4', connectionLimit: 4, waitForConnections: true, enableKeepAlive: true, connectTimeout: 10000 }, cfg));
  await pool.query('SELECT 1');
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaction(fn) {
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        const r = await fn((sql, params) => c.query(sql, params));
        await c.commit();
        return r;
      } catch (e) { try { await c.rollback(); } catch { } throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

module.exports = { TABLES, PORTAL_TABLES, EXAM_TABLES, mysqlConfig, createRowSync, portalToRows, portalFromRows, examToRows, examFromRows, connectMysql };
