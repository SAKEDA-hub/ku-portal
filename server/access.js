'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { writeJsonAtomic } = require('./store');

const demo = process.env.DEMO === '1';
const dataRoot = path.resolve(process.env.KU_DATA_DIR || path.join(__dirname, '..', 'data'));
for (const folder of ['public', 'ku-message', 'exam-sync']) {
  const relative = path.relative(path.resolve(__dirname, '..', folder), dataRoot);
  if (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
    throw new Error('KU_DATA_DIR должен находиться за пределами каталогов веб-интерфейса');
  }
}
const dataDir = demo ? path.join(dataRoot, 'demo') : dataRoot;
const accessDir = path.join(dataDir, 'access');

function grantFile(user) {
  const digest = crypto.createHash('sha256').update(JSON.stringify([
    user.id, user.email, user.role, user.group || '', user.createdAt || 0,
  ])).digest('hex');
  return path.join(accessDir, digest + '.json');
}

function grantOf(user) {
  if (demo) return 'demo';
  if (user.demo) return null;
  try {
    const grant = JSON.parse(fs.readFileSync(grantFile(user), 'utf8')).grant;
    return typeof grant === 'string' && /^[a-f0-9]{32}$/.test(grant) ? grant : null;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

function approve(user) {
  if (user.demo) throw new Error('Общий демо-аккаунт нельзя подтвердить');
  fs.mkdirSync(accessDir, { recursive: true, mode: 0o700 });
  if (!grantOf(user)) writeJsonAtomic(grantFile(user), { grant: crypto.randomBytes(16).toString('hex') });
}

function revoke(user) {
  fs.rmSync(grantFile(user), { force: true });
}

module.exports = { demo, dataDir, grantOf, approve, revoke };
