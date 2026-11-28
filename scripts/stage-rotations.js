'use strict';
/* Оператор вручную передаёт зашифрованные пакеты в очередь сервера. Запускать только после подготовки новых паролей. */
const path = require('node:path');
const { dataDir } = require('../server/access');
const { stageBundledRotations } = require('../server/admin');

if (process.argv.length !== 3) {
  console.error('Использование: node scripts/stage-rotations.js <каталог-зашифрованных-пакетов>');
  process.exit(2);
}
try {
  const count = stageBundledRotations({ DATA:dataDir, bundleDir:path.resolve(process.argv[2]) });
  console.log(`Поставлено в очередь пакетов: ${count}. Сервер применяет их при следующей проверке поручений.`);
} catch (error) {
  console.error('Пакеты не поставлены в очередь:', error.message);
  process.exitCode = 1;
}
