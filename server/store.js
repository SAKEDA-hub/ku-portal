'use strict';
/* Хранилище базы в JSON-файле, устойчивое к сбоям:
 *   запись атомарная — во временный файл, fsync, переименование (при падении посреди записи старый файл цел);
 *   раз в сутки — копия в backupDir (db-ГГГГ-ММ-ДД.json): состояние до первой записи за день, не перезаписывается;
 *   хранится keep последних;
 *   испорченный файл (не JSON или не проходит valid) не заменяется пустой базой: он откладывается
 *   (db.json.corrupt-<время>) и база берётся из последней копии; если копий нет — запуск останавливается с ошибкой,
 *   файл остаётся как был; файла нет, а копии есть — база тоже берётся из копии (пустая — только при первом запуске).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = crypto;
const { spawnSync } = require('child_process');

function encryptionKey() {
  const value = process.env.KU_DATA_ENCRYPTION_KEY || '';
  if (!value) return null;
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('KU_DATA_ENCRYPTION_KEY должен содержать 64 шестнадцатеричных символа');
  return Buffer.from(value, 'hex');
}
function isEncrypted(value) { return !!value && typeof value === 'object' && value._kuEncrypted === 1 && value.alg === 'A256GCM'; }
function encodeStoredJson(data, key = encryptionKey()) {
  const plain = JSON.stringify(data);
  if (!key) return plain;
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return JSON.stringify({ _kuEncrypted: 1, alg: 'A256GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
}
function decodeStoredJson(value, key = encryptionKey()) {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isEncrypted(data)) return data;
  if (!key) throw new Error('Для чтения зашифрованной базы задайте KU_DATA_ENCRYPTION_KEY');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.data, 'base64')), decipher.final()]).toString('utf8'));
  } catch { throw new Error('Не удалось расшифровать базу: ключ неверен или данные изменены'); }
}
function readStoreJson(file) { return decodeStoredJson(fs.readFileSync(file, 'utf8')); }
function writeStoreJson(file, data, space) {
  const key = encryptionKey();
  if (!key) return writeJsonAtomic(file, data, space);
  const tmp = `${file}.${randomUUID()}.tmp`, fd = fs.openSync(tmp, 'wx', 0o600);
  try { try { fs.writeFileSync(fd, encodeStoredJson(data, key)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(tmp, file); }
  finally { fs.rmSync(tmp, { force: true }); }
}

function writeJsonAtomic(file, data, space) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try {
    try { fs.writeFileSync(fd, JSON.stringify(data, null, space)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  } finally { fs.rmSync(tmp, { force: true }); }
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const tmpOf = (file) => `${file}.tmp`;
const today = () => new Date().toISOString().slice(0, 10);

function createStore({ file, backupDir, keep = 14, empty, valid = () => true, space = 1 }) {
  const name = path.basename(file, '.json');
  const driver = String(process.env.KU_DB_DRIVER || 'json').toLowerCase();
  if (!['json', 'mysql'].includes(driver)) throw new Error('KU_DB_DRIVER должен быть json или mysql');
  const key = encryptionKey();
  if (driver === 'mysql' && process.env.DEMO !== '1' && !key) throw new Error('Для рабочей MySQL-базы обязателен KU_DATA_ENCRYPTION_KEY');
  const mysqlKey = ({ 'db': 'portal', 'results': 'results', 'exam-sync': 'exam-sync' })[name] || name;
  if (driver === 'mysql' && !/^[a-z0-9-]{1,64}$/.test(mysqlKey)) throw new Error('Недопустимое имя документа MySQL');
  const mysql = driver === 'mysql' ? createMysqlDocumentStore(mysqlKey, { keep }) : null;
  const backups = () => (fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((f) => f.startsWith(name + '-') && f.endsWith('.json')).sort() : []);
  let backedUp = '';

  /* копия дня — текущий файл до записи; уже существующую за сегодня не трогаем */
  function backup() {
    const day = today();
    if (backedUp === day) return;
    if (!fs.existsSync(file)) return; // базы ещё нет — копировать нечего, копия будет при следующей записи
    const target = path.join(backupDir, `${name}-${day}.json`);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      writeStoreJson(target, readValid(file), space);
      const all = backups();
      for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.unlinkSync(path.join(backupDir, old));
    }
    backedUp = day;
  }
  function readValid(f) { const d = readStoreJson(f); if (!valid(d)) throw new Error('неверная структура'); return d; }
  function encryptLocalFiles() {
    if (!key || mysql) return;
    for (const f of [file, ...backups().map(name => path.join(backupDir, name))]) {
      try {
        const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (!isEncrypted(raw)) writeStoreJson(f, readValid(f), space);
      } catch { /* обычная загрузка ниже решает, можно ли восстановиться из исправной копии */ }
    }
  }
  /* последняя исправная копия: восстановленные данные пишутся во временный файл, и только потом испорченный
     файл (если есть) откладывается — сбой посередине не оставит базу без файла */
  function restore(reason) {
    for (const b of backups().reverse()) {
      let data;
      try { data = readValid(path.join(backupDir, b)); } catch { continue; } // копия тоже испорчена — берём старше
      const tmp = tmpOf(file);
      writeStoreJson(tmp, data, space);
      const aside = fs.existsSync(file) ? `${file}.corrupt-${Date.now()}` : '';
      if (aside) fs.renameSync(file, aside);
      fs.renameSync(tmp, file);
      console.error(`[store] ${path.basename(file)}: ${reason} — восстановлено из ${b}${aside ? ', испорченный файл: ' + path.basename(aside) : ''}`);
      return data;
    }
    return null;
  }

  function load() {
    if (mysql) {
      const mirror = data => {
        try { writeStoreJson(file, data, space); } catch (e) { console.error('[store] MySQL прочитан, локальная копия не обновлена:', e.message); }
        return data;
      };
      const remote = mysql.load();
      if (remote !== null) {
        if (!valid(remote)) {
          const backup = mysql.loadBackup();
          if (!backup || !valid(backup)) throw new Error(`MySQL: документ ${mysqlKey} повреждён и исправной копии нет`);
          mysql.import(backup);
          console.error(`[store] ${mysqlKey}: восстановлено из MySQL-копии`);
          return mirror(backup);
        }
        if (key && !mysql.isEncrypted()) mysql.import(remote);
        return mirror(remote);
      }
      const remoteBackup = mysql.loadBackup();
      if (remoteBackup !== null) {
        if (!valid(remoteBackup)) throw new Error(`MySQL: резервная копия ${mysqlKey} повреждена`);
        mysql.import(remoteBackup);
        console.error(`[store] ${mysqlKey}: восстановлено из MySQL-копии`);
        return mirror(remoteBackup);
      }
      // One-time, idempotent import keeps the existing JSON database as the source
      // until the first successful MySQL commit. Never overwrite an existing row.
      if (fs.existsSync(file)) {
        let data;
        try { data = readValid(file); } catch (e) {
          const restored = restore(`повреждён при импорте в MySQL (${e.message})`);
          if (!restored) throw new Error(`${path.basename(file)} повреждён, импорт остановлен (${e.message})`);
          data = restored;
        }
        mysql.import(data);
        console.log(`[store] ${path.basename(file)} импортирован в MySQL (${mysqlKey})`);
        return mirror(data);
      }
      if (backups().length) {
        const data = restore('импорт в MySQL из резервной копии');
        if (!data) throw new Error(`${path.basename(file)}: резервная копия не читается`);
        mysql.import(data);
        return mirror(data);
      }
      const data = empty();
      mysql.import(data);
      return mirror(data);
    }
    encryptLocalFiles();
    if (!fs.existsSync(file)) {
      if (!backups().length) return empty();
      const data = restore('файла нет');
      if (!data) throw new Error(`${path.basename(file)} отсутствует, исправной резервной копии нет`);
      return data;
    }
    try { return readValid(file); } catch (e) {
      const data = restore(`повреждён (${e.message})`);
      if (data) return data;
      throw new Error(`${path.basename(file)} повреждён и резервных копий нет — запуск остановлен, файл не тронут (${e.message})`);
    }
  }

  function replace(data) {
    if (mysql) {
      mysql.import(data);
      try { writeStoreJson(file, data, space); } catch (e) { console.error('[store] MySQL сохранён, локальная копия не обновлена:', e.message); }
      return;
    }
    writeStoreJson(file, data, space);
  }
  function save(data) {
    if (mysql) {
      mysql.save(data);
      // Keep a private export/cache for existing operator tools and portable backups.
      // MySQL remains authoritative; a failed cache write must not undo a committed DB transaction.
      try { writeStoreJson(file, data, space); } catch (e) { console.error('[store] MySQL сохранён, локальная копия не обновлена:', e.message); }
      return;
    }
    try { backup(); } catch (e) { console.error('[store] резервная копия:', e.message); }
    writeStoreJson(file, data, space);
  }

  function clearBackups() {
    if (mysql) { mysql.clearBackups(); return; }
    for (const old of backups()) fs.unlinkSync(path.join(backupDir, old));
  }

  return { load, save, replace, clearBackups };
}

/* Synchronous MySQL document adapter. The app's existing request handlers rely on
 * synchronous save semantics, so each write is committed before returning. Values
 * are passed as hex literals (never interpolated as SQL strings). */
function createMysqlDocumentStore(key, { keep }) {
  const bin = process.env.KU_MYSQL_CLIENT || 'mysql';
  const required = ['KU_MYSQL_DATABASE', 'KU_MYSQL_USER'];
  for (const env of required) if (!process.env[env]) throw new Error(`${env} обязателен при KU_DB_DRIVER=mysql`);
  const args = ['--batch', '--raw', '--skip-column-names'];
  if (process.env.KU_MYSQL_HOST) args.push('--host', process.env.KU_MYSQL_HOST);
  if (process.env.KU_MYSQL_PORT) args.push('--port', process.env.KU_MYSQL_PORT);
  args.push('--user', process.env.KU_MYSQL_USER, process.env.KU_MYSQL_DATABASE);
  const env = { ...process.env };
  if (process.env.KU_MYSQL_PASSWORD !== undefined) env.MYSQL_PWD = process.env.KU_MYSQL_PASSWORD;
  function query(sql) {
    const result = spawnSync(bin, args, { input: sql, encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024, timeout: 30_000 });
    if (result.error) throw new Error(`MySQL-клиент не запущен: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`MySQL: ${(result.stderr || `код ${result.status}`).trim()}`);
    return result.stdout;
  }
  let ready = false;
  let loadedEncrypted = false;
  function ensureSchema() {
    if (ready) return;
    query(`CREATE TABLE IF NOT EXISTS ku_portal_documents (
      document_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB;
    CREATE TABLE IF NOT EXISTS ku_portal_backups (
      document_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      backup_day DATE NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (document_key, backup_day)
    ) ENGINE=InnoDB;`);
    ready = true;
  }
  const hex = text => Buffer.from(text, 'utf8').toString('hex');
  // MariaDB implements JSON as validated LONGTEXT and does not support MySQL's
  // CAST(... AS JSON). Assignment from UTF-8 text works on both engines.
  const jsonExpr = text => `CONVERT(0x${hex(text)} USING utf8mb4)`;
  const keySql = `'${key}'`;
  function encryptBackups() {
    if (!encryptionKey()) return;
    ensureSchema();
    const rows = query(`SELECT backup_day, CAST(payload AS CHAR) FROM ku_portal_backups WHERE document_key=${keySql};`).trim();
    if (!rows) return;
    for (const line of rows.split('\n')) {
      const [day, raw] = line.split('\t');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !raw) continue;
      const stored = JSON.parse(raw);
      if (isEncrypted(stored)) continue;
      const sealed = encodeStoredJson(decodeStoredJson(stored));
      query(`UPDATE ku_portal_backups SET payload=${jsonExpr(sealed)} WHERE document_key=${keySql} AND backup_day='${day}';`);
    }
  }
  function load() {
    ensureSchema();
    encryptBackups();
    const out = query(`SELECT CAST(payload AS CHAR) FROM ku_portal_documents WHERE document_key=${keySql};`);
    const value = out.trim();
    if (!value) return null;
    try {
      const stored = JSON.parse(value);
      loadedEncrypted = isEncrypted(stored);
      return decodeStoredJson(stored);
    } catch {
      const backup = loadBackup();
      if (backup === null) throw new Error(`MySQL: JSON-документ ${key} повреждён и копий нет`);
      return backup;
    }
  }
  function loadBackup() {
    ensureSchema();
    encryptBackups();
    const out = query(`SELECT CAST(payload AS CHAR) FROM ku_portal_backups WHERE document_key=${keySql} ORDER BY backup_day DESC LIMIT 1;`).trim();
    return out ? decodeStoredJson(JSON.parse(out)) : null;
  }
  function write(data, backup) {
    ensureSchema();
    const json = encodeStoredJson(data);
    const day = new Date().toISOString().slice(0, 10);
    const backupSql = backup ? `INSERT IGNORE INTO ku_portal_backups(document_key,backup_day,payload)
      SELECT ${keySql}, '${day}', payload FROM ku_portal_documents WHERE document_key=${keySql};
      DELETE FROM ku_portal_backups WHERE document_key=${keySql} AND backup_day NOT IN
        (SELECT backup_day FROM (SELECT backup_day FROM ku_portal_backups WHERE document_key=${keySql} ORDER BY backup_day DESC LIMIT ${Math.max(1, keep)}) recent);` : '';
    query(`START TRANSACTION;
      ${backupSql}
      INSERT INTO ku_portal_documents(document_key,payload) VALUES(${keySql},${jsonExpr(json)})
      ON DUPLICATE KEY UPDATE payload=VALUES(payload), updated_at=CURRENT_TIMESTAMP(3);
      COMMIT;`);
  }
  return {
    load, loadBackup, isEncrypted: () => loadedEncrypted,
    import: data => write(data, false), save: data => write(data, true),
    clearBackups: () => { ensureSchema(); query(`DELETE FROM ku_portal_backups WHERE document_key=${keySql};`); },
  };
}

module.exports = { createStore, writeJsonAtomic, writeStoreJson, readStoreJson, isEncrypted, encodeStoredJson, decodeStoredJson, encryptionKey };
