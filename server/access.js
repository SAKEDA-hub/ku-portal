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

function userDigest(user) {
  return crypto.createHash('sha256').update(JSON.stringify([
    user.id, user.email, user.role, user.group || '', user.createdAt || 0,
  ])).digest('hex');
}
const grantFile = user => path.join(accessDir, userDigest(user) + '.json');
// ключ — только ID (ID не переиспользуются), чтобы закрепления не терялись при изменении профиля
const idFile = (kind, user) => path.join(accessDir, kind + '-' + crypto.createHash('sha256').update(String(user.id)).digest('hex') + '.json');
const groupsFile = user => idFile('groups', user);
const permsFile = user => idFile('perms', user);
const schoolFile = user => idFile('school', user);

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

/* Группы преподавателя назначает оператор (node scripts/access.js groups <ID> "<группы>").
   null — назначений ещё не было (сервер при запуске переносит группы из текущего расписания). */
const GROUP_MAX = 100;
function normalizeGroups(list) {
  return [...new Set(list.map(g => String(g).trim()).filter(g => g && g.length <= GROUP_MAX))];
}
function groupsOf(user) {
  let text;
  try { text = fs.readFileSync(groupsFile(user), 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    console.error('[access] группы преподавателя не прочитаны:', user.id, error.code);
    return [];
  }
  try {
    const groups = JSON.parse(text).groups;
    return Array.isArray(groups) ? normalizeGroups(groups) : [];
  } catch {
    console.error('[access] файл групп повреждён, доступ к группам закрыт:', user.id);
    return [];
  }
}
function setGroups(user, groups) {
  fs.mkdirSync(accessDir, { recursive: true, mode: 0o700 });
  writeJsonAtomic(groupsFile(user), { groups: normalizeGroups(groups) });
}

/* Служебные права сверх роли (назначает оператор): clubs — ID клубов, которыми человек руководит ('*' — все),
   dorm — администрация общежития, school — просмотр всей учебной базы. Роль «менеджер» = всё перечисленное. */
const NO_PERMS = Object.freeze({ clubs: Object.freeze([]), dorm: false, school: false });
const CLUB_ID = /^[\w-]{1,64}$/;
function normalizePerms(p) {
  const clubs = Array.isArray(p && p.clubs) ? [...new Set(p.clubs.map(String).filter(c => c === '*' || CLUB_ID.test(c)))] : [];
  return { clubs: clubs.includes('*') ? ['*'] : clubs, dorm: !!(p && p.dorm === true), school: !!(p && p.school === true) };
}
function permsOf(user) {
  let text;
  try { text = fs.readFileSync(permsFile(user), 'utf8'); } catch (error) {
    if (error.code !== 'ENOENT') console.error('[access] права не прочитаны:', user.id, error.code);
    return NO_PERMS;
  }
  try { return normalizePerms(JSON.parse(text)); } catch {
    console.error('[access] файл прав повреждён, права сняты:', user.id);
    return NO_PERMS;
  }
}
function setPerms(user, perms) {
  fs.mkdirSync(accessDir, { recursive: true, mode: 0o700 });
  const next = normalizePerms(perms);
  writeJsonAtomic(permsFile(user), next);
  return next;
}

/* Привязка студента портала к его логину учебной базы (/school/): после неё вход туда — без пароля */
function schoolLinkOf(user) {
  try {
    const username = JSON.parse(fs.readFileSync(schoolFile(user), 'utf8')).username;
    return typeof username === 'string' && username ? username : null;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[access] привязка учебной базы не прочитана:', user.id, error.code || 'parse');
    return null;
  }
}
/* Логин учебной базы уже привязан к другому студенту портала (файлов немного — по одному на студента) */
function schoolLinkTaken(username, exceptUser) {
  const except = exceptUser && path.basename(schoolFile(exceptUser));
  let names;
  try { names = fs.readdirSync(accessDir).filter(n => n.startsWith('school-') && n.endsWith('.json') && n !== except); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  return names.some(n => { try { return JSON.parse(fs.readFileSync(path.join(accessDir, n), 'utf8')).username === username; } catch { return false; } });
}
function setSchoolLink(user, username) {
  fs.mkdirSync(accessDir, { recursive: true, mode: 0o700 });
  if (username) writeJsonAtomic(schoolFile(user), { username });
  else fs.rmSync(schoolFile(user), { force: true });
}

module.exports = { demo, dataDir, grantOf, approve, revoke, groupsOf, setGroups, normalizeGroups, permsOf, setPerms, schoolLinkOf, schoolLinkTaken, setSchoolLink };
