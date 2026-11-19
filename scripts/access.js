'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dataDir, grantOf, approve, revoke, groupsOf, setGroups, normalizeGroups, permsOf, setPerms, schoolLinkOf, schoolLinkTaken, setSchoolLink } = require('../server/access');

/* Служебные роли поверх основной: что именно человек может делать в портале */
const PRESETS = {
  manager: () => ({ clubs: ['*'], dorm: true, school: true }), // менеджер: все клубы, общежитие, просмотр учебной базы
  'club-lead': (clubs) => ({ clubs: String(clubs || '').split(',').map(s => s.trim()).filter(Boolean) }), // руководитель своих клубов
  dorm: () => ({ dorm: true }), // администрация общежития
  none: () => ({}),
};
const permsText = (p) => [p.clubs.includes('*') ? 'все клубы' : p.clubs.length ? 'клубы: ' + p.clubs.join(', ') : '', p.dorm ? 'общежитие' : '', p.school ? 'учебная база' : ''].filter(Boolean).join('; ');
const { setPasswordSync } = require('../server/security');
const { writeJsonAtomic } = require('../server/store');

function run([command, key, role, name]) {
  if (command === 'exam-reset' || command === 'exam-disable') {
    if (!key?.trim() || key.length > 100) throw new Error('Укажите логин экзамена');
    if (command === 'exam-reset' && (!['teacher', 'student'].includes(role) || !name?.trim() || name.length > 150)) {
      throw new Error('exam-reset <логин> <teacher|student> "<ФИО>"');
    }
    const login = key.trim().toLowerCase();
    const directory = path.join(dataDir, 'exam-provision');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const record = { login, version: crypto.randomUUID(), action: command };
    let password;
    if (command === 'exam-reset') {
      password = crypto.randomBytes(18).toString('base64url');
      Object.assign(record, { role, name: name.trim() });
      setPasswordSync(record, password);
    }
    writeJsonAtomic(path.join(directory, Date.now() + '-' + record.version + '.json'), record);
    console.log('Изменение вступит в силу при следующем запуске сервера.');
    if (password) { console.log('Передайте новый пароль лично пользователю.'); console.log(password); }
    return;
  }
  if (!['list', 'approve', 'revoke', 'groups', 'role', 'school-link'].includes(command)) {
    throw new Error('Команды: list | approve <ID> | revoke <ID> | groups <ID> "<группа1,группа2>" | role <ID> manager|club-lead|dorm|none ["<клуб1,клуб2>"] | school-link <ID> <логин учебной базы>|none | exam-reset <логин> <роль> "<ФИО>" | exam-disable <логин>');
  }
  const file = path.join(dataDir, 'db.json');
  const users = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).users : [];
  if (command === 'list') {
    console.table(users.map(u => ({ id: u.id, name: u.fio, email: u.email, role: u.role,
      group: u.role === 'teacher' ? (groupsOf(u) || []).join(', ') : u.group, access: !!grantOf(u), perms: permsText(permsOf(u)),
      school: u.role === 'student' ? schoolLinkOf(u) || '' : '' })));
    return;
  }
  const user = users.find(u => u.id === key);
  if (!user) throw new Error('Пользователь не найден');
  if (command === 'school-link') {
    if (user.role !== 'student') throw new Error('Привязывается только студент портала');
    const username = role === 'none' ? null : String(role || '').trim();
    if (username === '') throw new Error('school-link <ID> <логин учебной базы>|none');
    if (username) {
      const schoolFile = path.join(dataDir, 'school.json');
      const schoolUsers = fs.existsSync(schoolFile) ? JSON.parse(fs.readFileSync(schoolFile, 'utf8')).users : [];
      if (!schoolUsers.some(u => u.username === username && u.role === 'student')) throw new Error('В учебной базе нет студента с таким логином');
      if (schoolLinkTaken(username, user)) throw new Error('Этот логин уже привязан к другому аккаунту портала');
    }
    setSchoolLink(user, username);
    require('../server/audit').createAudit(dataDir)('portal.school-link', 'operator', user.id);
    console.log(JSON.stringify({ action: 'school-link', userId: user.id, username }));
    return;
  }
  if (command === 'role') {
    const preset = PRESETS[role];
    if (!preset) throw new Error('role <ID> manager|club-lead|dorm|none ["<клуб1,клуб2>"]');
    const next = preset(name);
    if (role === 'club-lead' && !next.clubs.length) throw new Error('Укажите ID клубов через запятую, например "volunteer,football"');
    const perms = setPerms(user, next);
    require('../server/audit').createAudit(dataDir)('portal.role', 'operator', user.id);
    console.log(JSON.stringify({ action: 'role', userId: user.id, perms }));
    return;
  }
  if (command === 'groups') {
    if (user.role !== 'teacher') throw new Error('Группы назначаются только преподавателю');
    const groups = normalizeGroups(String(role || '').split(','));
    setGroups(user, groups);
    require('../server/audit').createAudit(dataDir)('portal.groups', 'operator', user.id);
    console.log(JSON.stringify({ action: 'groups', userId: user.id, groups }));
    return;
  }
  if (require('../server/access').demo) throw new Error('Подтверждение и отзыв доступны в рабочем режиме DEMO=0');
  if (command === 'approve') approve(user);
  else revoke(user);
  require('../server/audit').createAudit(dataDir)('portal.' + command, 'operator', user.id);
  console.log(JSON.stringify({ action: command, userId: user.id, at: new Date().toISOString() }));
}

try { run(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
