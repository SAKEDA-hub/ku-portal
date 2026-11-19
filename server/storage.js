'use strict';
/* Хранение данных портала и онлайн-экзамена.
 *   Без настроек MySQL — файлы data/db.json и data/exam-sync.json (server/store.js), как раньше.
 *   С настройками MySQL (server/mysql.js) — основная база MySQL; файлы остаются живой копией (зеркалом):
 *   если MySQL недоступна, сайт работает на них. При запуске берётся более свежая копия (_savedAt / savedAt) —
 *   так данные, записанные, пока MySQL была недоступна, или ещё не перенесённые в неё, уходят в MySQL.
 *   Запись в MySQL — с задержкой FLUSH_MS (пачкой), при ошибке — повтор через RETRY_MS; flush() — дождаться записи
 *   (перед перезапуском сервера).
 */
const fs = require('fs');
const path = require('path');
const { createStore } = require('./store');
const { mysqlConfig, createRowSync, connectMysql, PORTAL_TABLES, EXAM_TABLES, portalToRows, portalFromRows, examToRows, examFromRows } = require('./mysql');

const FLUSH_MS = 300;
const RETRY_MS = 5000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* более свежая из двух копий; при равенстве — MySQL */
const newest = (file, sql, key) => (!sql ? file : !file ? sql : ((sql[key] || 0) >= (file[key] || 0) ? sql : file));

async function openStorage({ dataDir, env = process.env, connect = connectMysql, emptyPortal, retries = 3, retryMs = 2000, log = console }) {
  const backupDir = path.join(dataDir, 'backups');
  const portalFile = createStore({ file: path.join(dataDir, 'db.json'), backupDir, empty: emptyPortal, valid: (d) => !!d && typeof d === 'object' && Array.isArray(d.users) });
  const examPath = path.join(dataDir, 'exam-sync.json');
  const examFile = createStore({ file: examPath, backupDir, empty: () => null, space: 0 });

  let portalDb = null, portalErr = null, examData = null;
  try { portalDb = portalFile.load(); } catch (e) { portalErr = e; }
  try { examData = examFile.load(); } catch (e) {
    // экзамен: испорченный файл без копий откладываем (не затираем) и стартуем с демо-данными
    log.error('[exam-sync]', e.message);
    try { fs.renameSync(examPath, `${examPath}.corrupt-${Date.now()}`); } catch { }
  }

  const state = { mode: 'json', error: null, lastSync: null };
  let conn = null, portalSync = null, examSync = null;
  const cfg = mysqlConfig(env);
  if (cfg) {
    for (let i = 1; i <= retries && !conn; i++) {
      try { conn = await connect(cfg); } catch (e) { state.error = e.code || e.message; if (i < retries) await sleep(retryMs); }
    }
    if (conn) {
      try {
        portalSync = createRowSync({ conn, tables: PORTAL_TABLES });
        examSync = createRowSync({ conn, tables: EXAM_TABLES });
        await portalSync.ensure(); await examSync.ensure();
        const sqlDb = portalFromRows(await portalSync.read());
        const sqlExam = examFromRows(await examSync.read());
        if (!sqlDb && portalDb && portalDb.users.length) log.log(`[db] первый запуск с MySQL — переносим базу из data/db.json (пользователей: ${portalDb.users.length})`);
        portalDb = newest(portalDb, sqlDb, '_savedAt');
        examData = newest(examData, sqlExam, 'savedAt');
        if (portalDb) await portalSync.write(portalToRows(portalDb));
        if (examData) await examSync.write(examToRows(examData));
        state.mode = 'mysql'; state.error = null; state.lastSync = Date.now();
      } catch (e) {
        state.error = e.code || e.message;
        portalSync = examSync = null;
        try { await conn.close(); } catch { }
        conn = null;
      }
    }
    if (state.mode === 'mysql') log.log(`[db] MySQL: ${cfg.user}@${cfg.host}/${cfg.database}`);
    else log.error('[db] MySQL недоступна — работаем на data/db.json, данные перейдут в MySQL при следующем запуске:', state.error);
  }
  if (!portalDb) {
    if (portalErr) throw portalErr;
    portalDb = emptyPortal();
  }

  /* ---------- запись ---------- */
  let timer = null, running = null, pendingPortal = null, pendingExam = null;
  const schedule = () => { if (!timer) { timer = setTimeout(() => { timer = null; flush().catch(() => { }); }, FLUSH_MS); timer.unref(); } };
  async function flushOnce() {
    const p = pendingPortal, x = pendingExam;
    pendingPortal = pendingExam = null;
    try {
      if (p) await portalSync.write(portalToRows(p));
      if (x) await examSync.write(examToRows(x));
      state.error = null; state.lastSync = Date.now();
    } catch (e) {
      state.error = e.code || e.message;
      log.error('[db] запись в MySQL не удалась, повтор через', RETRY_MS / 1000, 'с:', state.error);
      pendingPortal = pendingPortal || p; pendingExam = pendingExam || x;
      setTimeout(schedule, RETRY_MS).unref();
    }
  }
  async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    while (running) await running;
    if (!pendingPortal && !pendingExam) return;
    running = flushOnce();
    try { await running; } finally { running = null; }
  }

  return {
    get mode() { return state.mode; },
    get error() { return state.error; },
    info: () => ({ mode: state.mode, ok: !state.error, lastSync: state.lastSync ? new Date(state.lastSync).toISOString() : null }),
    portal: {
      load: () => portalDb,
      save(db) {
        db._savedAt = Date.now();
        portalFile.save(db);
        if (portalSync) { pendingPortal = db; schedule(); }
      },
    },
    exam: {
      load: () => examData,
      save(data) {
        data.savedAt = Date.now();
        examFile.save(data);
        if (examSync) { pendingExam = data; schedule(); }
      },
    },
    flush,
    async close() { await flush(); if (conn) await conn.close(); },
  };
}

module.exports = { openStorage };
