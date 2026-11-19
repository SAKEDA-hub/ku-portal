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
const { randomUUID } = require('crypto');

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
      writeJsonAtomic(target, readValid(file), space);
      const all = backups();
      for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.unlinkSync(path.join(backupDir, old));
    }
    backedUp = day;
  }
  function readValid(f) { const d = readJson(f); if (!valid(d)) throw new Error('неверная структура'); return d; }
  /* последняя исправная копия: восстановленные данные пишутся во временный файл, и только потом испорченный
     файл (если есть) откладывается — сбой посередине не оставит базу без файла */
  function restore(reason) {
    for (const b of backups().reverse()) {
      let data;
      try { data = readValid(path.join(backupDir, b)); } catch { continue; } // копия тоже испорчена — берём старше
      const tmp = tmpOf(file);
      writeJsonAtomic(tmp, data, space);
      const aside = fs.existsSync(file) ? `${file}.corrupt-${Date.now()}` : '';
      if (aside) fs.renameSync(file, aside);
      fs.renameSync(tmp, file);
      console.error(`[store] ${path.basename(file)}: ${reason} — восстановлено из ${b}${aside ? ', испорченный файл: ' + path.basename(aside) : ''}`);
      return data;
    }
    return null;
  }

  function load() {
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

  function save(data) {
    try { backup(); } catch (e) { console.error('[store] резервная копия:', e.message); }
    writeJsonAtomic(file, data, space);
  }

  return { load, save };
}

module.exports = { createStore, writeJsonAtomic };
