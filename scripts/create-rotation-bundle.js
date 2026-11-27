'use strict';
/* Читает новые пароли из stdin и создаёт только зашифрованный пакет; исходный JSON не сохраняется. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setPasswordSync, PASSWORD_MIN } = require('../server/security');
const { encryptionKey, encodeStoredJson } = require('../server/store');

async function main() {
  if (process.argv.length !== 3) throw new Error('Использование: node scripts/create-rotation-bundle.js <закрытый-каталог> < input.json');
  const key = encryptionKey();
  if (!key) throw new Error('Требуется KU_DATA_ENCRYPTION_KEY');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 1_000_000) throw new Error('Слишком большой список аккаунтов');
  }
  const source = JSON.parse(input);
  if (!source || !Array.isArray(source.accounts) || !source.accounts.length || source.accounts.length > 10000) throw new Error('Укажите непустой массив accounts');
  const seen = new Set();
  const accounts = source.accounts.map(row => {
    if (!row || !/^[a-z]{2,5}_\d{1,9}$/.test(row.userId) || seen.has(row.userId) ||
        typeof row.password !== 'string' || row.password.length < PASSWORD_MIN || row.password.length > 256) throw new Error('Неверный ID, повтор или длина пароля');
    seen.add(row.userId);
    const hash = {}; setPasswordSync(hash, row.password);
    return { userId:row.userId, salt:hash.salt, passHash:hash.passHash, passAlgo:hash.passAlgo };
  });
  const batchId = crypto.randomUUID(), outputDir = path.resolve(process.argv[2]);
  fs.mkdirSync(outputDir, { recursive:true, mode:0o700 });
  const target = path.join(outputDir, batchId + '.json.enc');
  fs.writeFileSync(target, encodeStoredJson({ action:'rotate-accounts', batchId, accounts }, key), { flag:'wx', mode:0o600 });
  console.log(`Создан зашифрованный пакет ${target}; аккаунтов: ${accounts.length}`);
}
main().catch(error => { console.error('Пакет не создан:', error.message); process.exitCode = 1; });
