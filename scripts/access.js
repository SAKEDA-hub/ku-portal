'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dataDir, grantOf, approve, revoke, groupsOf, setGroups, normalizeGroups, permsOf, setPerms } = require('../server/access');

/* Служебные роли поверх основной: что именно человек может делать в портале */
const PRESETS = {
  manager: () => ({ clubs: ['*'], dorm: true, results: true }), // менеджер: все клубы, общежитие, учебная база результатов
  'club-lead': (clubs) => ({ clubs: String(clubs || '').split(',').map(s => s.trim()).filter(Boolean) }), // руководитель своих клубов
  dorm: () => ({ dorm: true }), // администрация общежития
  admin: () => ({ clubs: ['*'], dorm: true, results: true, admin: true }), // менеджер + админ-панель (/admin/)
  none: () => ({}),
};
const permsText = (p) => [p.clubs.includes('*') ? 'все клубы' : p.clubs.length ? 'клубы: ' + p.clubs.join(', ') : '', p.dorm ? 'общежитие' : '', p.results ? 'учебная база' : '', p.admin ? 'админ-панель' : ''].filter(Boolean).join('; ');
const { setPasswordSync } = require('../server/security');
const { writeJsonAtomic } = require('../server/store');

function run([command, key, role, name]) {
  if (command === 'accounts') {
    const portalFile = path.join(dataDir, 'db.json');
    const examFile = path.join(dataDir, 'exam-sync.json');
    const portalUsers = fs.existsSync(portalFile) ? JSON.parse(fs.readFileSync(portalFile, 'utf8')).users || [] : [];
    const examSnapshot = fs.existsSync(examFile) ? JSON.parse(fs.readFileSync(examFile, 'utf8')) : null;
    const rows = [
      ...portalUsers.map(user => ({ system:'KU Portal / KU Message', id:user.id, login:user.email, name:user.fio, role:user.role,
        group:user.role === 'teacher' ? (groupsOf(user) || []).join(', ') : user.group || '',
        permissions:permsText(permsOf(user)), access:grantOf(user) ? 'подтверждён' : 'ожидает подтверждения', portalUserId:user.id, source:'portal' })),
      ...((examSnapshot && examSnapshot.db && Array.isArray(examSnapshot.db.users)) ? examSnapshot.db.users.map(([, user]) => ({
        system:'Онлайн-экзамен', id:user.id, login:user.login, name:user.name, role:user.role,
        group:user.portalGroup || [user.faculty, user.year, user.group].filter(x => x != null && x !== '').join('-'), permissions:'',
        access:user.authSource === 'portal' && user.portalActive === false ? 'доступ закрыт в портале' : 'аккаунт экзамена',
        portalUserId:user.portalUserId || '', source:user.authSource === 'portal' ? 'KU Portal SSO' : 'старый отдельный аккаунт',
      })) : []),
    ];
    const cell = value => '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
    process.stdout.write(['system;id;login;name;role;group;permissions;access;portal_user_id;source', ...rows.map(row =>
      [row.system,row.id,row.login,row.name,row.role,row.group,row.permissions,row.access,row.portalUserId,row.source].map(cell).join(';'))].join('\n') + '\n');
    return;
  }
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
  if (!['list', 'approve', 'revoke', 'groups', 'role', 'reset-password'].includes(command)) {
    throw new Error('Команды: list | accounts | approve <ID> | revoke <ID> | groups <ID> "<группа1,группа2>" | role <ID> manager|club-lead|dorm|admin|none ["<клуб1,клуб2>"] | reset-password <ID> [--2fa] | exam-reset <логин> <роль> "<ФИО>" | exam-disable <логин>');
  }
  const file = path.join(dataDir, 'db.json');
  const users = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).users : [];
  if (command === 'list') {
    console.table(users.map(u => ({ id: u.id, name: u.fio, email: u.email, role: u.role,
      group: u.role === 'teacher' ? (groupsOf(u) || []).join(', ') : u.group, access: !!grantOf(u), perms: permsText(permsOf(u)) })));
    return;
  }
  const user = users.find(u => u.id === key);
  if (!user) throw new Error('Пользователь не найден');
  if (command === 'reset-password') {
    // сервер держит базу в памяти: новый хеш передаётся поручением, сервер применяет его в течение ~5 секунд
    if (user.demo) throw new Error('Демо-аккаунт нельзя изменить');
    const { PROVISION_DIR, tempPassword } = require('../server/admin');
    const password = tempPassword();
    const record = { action: 'reset-password', userId: user.id, reset2fa: role === '--2fa' };
    setPasswordSync(record, password);
    const directory = path.join(dataDir, PROVISION_DIR);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeJsonAtomic(path.join(directory, Date.now() + '-' + crypto.randomUUID() + '.json'), record);
    console.log(`Новый пароль для ${user.fio} (${user.email}) вступит в силу в течение 5 секунд, если сайт запущен, иначе — при запуске.`);
    console.log('Все сеансы пользователя будут завершены; при входе портал попросит сменить пароль.' + (record.reset2fa ? ' Двухфакторная защита отключена.' : ''));
    console.log('Передайте пароль лично пользователю.');
    console.log(password);
    return;
  }
  if (command === 'role') {
    const preset = PRESETS[role];
    if (!preset) throw new Error('role <ID> manager|club-lead|dorm|admin|none ["<клуб1,клуб2>"]');
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
