'use strict';

/* Generate a one-time password rotation task and a private handoff document.
   Input JSON entries: { id, name, email, role }. The task contains only scrypt hashes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setPasswordSync } = require('../server/security');
const { encodeStoredJson } = require('../server/store');

const [inputPath, documentPath, taskPath, keyPath] = process.argv.slice(2);
if (!inputPath || !documentPath || !taskPath || !keyPath) {
  console.error('Использование: node scripts/create-credential-batch.js accounts.json credentials.md rotation.json.enc encryption-key.txt');
  process.exit(2);
}
const keyHex = fs.readFileSync(keyPath, 'utf8').trim();
if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error('Ключ шифрования должен содержать ровно 64 шестнадцатеричных символа');
const encryptionKey = Buffer.from(keyHex, 'hex');
const accounts = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(accounts) || !accounts.length || accounts.length > 100) throw new Error('Входной файл должен содержать список аккаунтов');
const ids = new Set(), emails = new Set();
const rows = accounts.map(source => {
  const id = String(source.id || ''), email = String(source.email || '').trim().toLowerCase();
  const name = String(source.name || '').trim(), role = String(source.role || '');
  if (!/^[a-z]{2,5}_\d{1,9}$/.test(id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 150 ||
      !['student', 'teacher', 'staff'].includes(role) || ids.has(id) || emails.has(email)) {
    throw new Error('Некорректная или повторная запись пользователя: ' + id);
  }
  ids.add(id); emails.add(email);
  const password = crypto.randomBytes(24).toString('base64url');
  const hash = {};
  setPasswordSync(hash, password);
  return { id, name, email, role, password, provision: { userId:id, salt:hash.salt, passHash:hash.passHash, passAlgo:hash.passAlgo } };
});
const task = { action:'rotate-accounts', batchId:crypto.randomUUID(), accounts:rows.map(r => r.provision) };
const encryptedTask = encodeStoredJson(task, encryptionKey);
const esc = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const roleName = role => ({ student:'Студент', teacher:'Преподаватель', staff:'Сотрудник' })[role];
const document = [
  '# Новые данные для входа KU Portal',
  '',
  `Создано: ${new Date().toISOString()}. Логин для входа — email. Эти пароли начнут работать после применения пакета; старые пароли перестанут работать в тот же момент. Пользовательские ID сохраняются, чтобы не потерять связь с перепиской, экзаменами и оценками. Права доступа не меняются: пароль сам по себе не откроет аккаунт, если доступ в портале закрыт. Пароли временные: войдите в течение 72 часов и сразу задайте новый пароль.`,
  '',
  '| Имя | Роль | Логин | Email | Временный пароль |',
  '|---|---|---|---|---|',
  ...rows.map(r => `| ${esc(r.name)} | ${roleName(r.role)} | ${esc(r.email)} | ${esc(r.email)} | ${r.password} |`),
  '',
  'Если на аккаунте уже была включена двухфакторная проверка, при первом входе также потребуется её текущий код.',
  'После входа смените временный пароль и включите двухфакторную проверку в настройках безопасности.',
  'Храните этот документ отдельно от резервной копии ключа шифрования.',
].join('\n') + '\n';

for (const [file, content] of [[documentPath, document], [taskPath, encryptedTask]]) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive:true, mode:0o700 });
  const temp = `${target}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, target);
  fs.chmodSync(target, 0o600);
}
console.log(`Создан пакет для ${rows.length} аккаунтов; пароли — в закрытом документе, пакет для сервера зашифрован.`);
