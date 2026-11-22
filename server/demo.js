const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/*
 * Бета-аккаунты портала: 3 преподавателя (языки, IT, биотехнологии), 2 студента (ИСУ — IT, БТ — биотехнологии),
 * менеджер (все клубы и общежитие) и руководитель клубов, их занятия и оценки. seedDemo() идемпотентно создаёт и дополняет их и в уже существующей базе. Включить в отдельном каталоге: DEMO=1.
 */
function createDemo({ getDB, saveDB, nid, setPasswordSync, subjectForDiscipline, dataDir }) {
  const DEMO_ON = require('./access').demo;
  const CREDENTIALS_FILE = path.join(dataDir, 'demo-credentials.json');
  function importedDemoAccounts() {
    const source = String(process.env.KU_DEMO_USERS_FILE || '').trim();
    if (!DEMO_ON || !source) return [];
    if (!path.isAbsolute(source)) throw new Error('KU_DEMO_USERS_FILE должен быть абсолютным путём');
    const rows = JSON.parse(fs.readFileSync(source, 'utf8'));
    if (!Array.isArray(rows) || rows.length !== 332) throw new Error('Демо-список должен содержать ровно 332 записи');
    const logins = new Set(), emails = new Set();
    return rows.map((a) => {
      const role = String(a.role || '');
      const login = String(a.login || '').toUpperCase();
      const email = String(a.email || '').toLowerCase();
      const password = String(a.initialPassword || '');
      if (!['student', 'teacher', 'staff'].includes(role) || !/^[A-Z]{2,5}\d{4}$/.test(login) ||
          !email.endsWith('.invalid') || password.length < 20 || logins.has(login) || emails.has(email)) {
        throw new Error('Демо-список содержит недопустимую, повторную или не-демонстрационную учётную запись');
      }
      logins.add(login); emails.add(email);
      const group = String(a.group || '');
      const groups = Array.isArray(a.groups) ? [...new Set(a.groups.map(String).filter(Boolean))] : [];
      const clubs = Array.isArray(a.clubs) ? [...new Set(a.clubs.map(String).filter((c) => ['debate', 'chess'].includes(c)))] : [];
      const displayName = String(a.displayName || '').trim().slice(0, 120);
      if (!displayName || (role === 'student' && !group) || (role === 'teacher' && !groups.length)) {
        throw new Error('Демо-список не содержит имя или привязку к курсу');
      }
      return {
        role, login, email, initialPassword: password, group, groups, clubs,
        firstName: displayName, lastName: '', middleName: '', program: 'ku',
        perms: role === 'staff' ? { clubs } : {},
      };
    });
  }
  const importedAccounts = importedDemoAccounts();
  const DEMO_GROUP = 'ИСУ-26-2-а';
  const BT_GROUP = 'БТ-26-1-а';
  /* Бета-аккаунты: 3 преподавателя (языки, IT, биотехнологии) и 2 студента (ИСУ — IT, БТ — биотехнологии) */
  const DEFAULT_DEMO_ACCOUNTS = [
    { role: 'teacher', email: 'teacher@demo.kz', lastName: 'Ахметова', firstName: 'Айгерим', middleName: 'Сериковна', program: 'arizona', dept: 'lang' },
    { role: 'teacher', email: 'teacher2@demo.kz', lastName: 'Сейткали', firstName: 'Ерлан', middleName: 'Маратович', dept: 'it' },
    { role: 'teacher', email: 'teacher3@demo.kz', lastName: 'Жумабекова', firstName: 'Динара', middleName: 'Ерлановна', dept: 'bio' },
    { role: 'student', email: 'student@demo.kz', lastName: 'Иванов', firstName: 'Данияр', middleName: '', group: DEMO_GROUP },
    { role: 'student', email: 'student2@demo.kz', lastName: 'Каримов', firstName: 'Алихан', middleName: '', group: BT_GROUP },
    { role: 'staff', email: 'manager@demo.kz', lastName: 'Омарова', firstName: 'Сауле', middleName: 'Кайратовна', perms: { clubs: ['*'], dorm: true, results: true } },
    { role: 'staff', email: 'clubs@demo.kz', lastName: 'Нурланов', firstName: 'Арман', middleName: 'Бекович', perms: { clubs: ['volunteer', 'football'] } },
  ];
  const DEMO_ACCOUNTS = importedAccounts.length ? importedAccounts : DEFAULT_DEMO_ACCOUNTS;
  /* Занятия бета-преподавателей: [email, дисциплина, тип, группа, день, начало, конец, аудитория] */
  const DEMO_LESSONS = [
    ['teacher@demo.kz', 'english', 'Практ.', DEMO_GROUP, 0, '08:30', '09:50', '301'], ['teacher@demo.kz', 'math', 'Лек.', DEMO_GROUP, 0, '10:00', '11:20', '214'],
    ['teacher@demo.kz', 'politology', 'Лек.', DEMO_GROUP, 2, '11:30', '12:50', '118'], ['teacher@demo.kz', 'english', 'Практ.', DEMO_GROUP, 3, '08:30', '09:50', '301'],
    ['teacher@demo.kz', 'math', 'Практ.', DEMO_GROUP, 4, '10:00', '11:20', '214'],
    ['teacher@demo.kz', 'english', 'Практ.', BT_GROUP, 1, '10:00', '11:20', '305'],
    ['teacher2@demo.kz', 'python', 'Лаб.', DEMO_GROUP, 1, '13:00', '14:20', '410 (комп. класс)'], ['teacher2@demo.kz', 'databases', 'Лек.', DEMO_GROUP, 3, '11:30', '12:50', '214'],
    ['teacher3@demo.kz', 'biochem', 'Лек.', BT_GROUP, 0, '09:00', '10:20', '118'], ['teacher3@demo.kz', 'microbio', 'Лаб.', BT_GROUP, 2, '13:00', '14:20', 'Лаборатория 2'],
  ];
  /* Оценки: [студент, преподаватель, дисциплина, балл] */
  const DEMO_GRADES = [
    ['student@demo.kz', 'teacher@demo.kz', 'english', 88], ['student@demo.kz', 'teacher@demo.kz', 'math', 76], ['student@demo.kz', 'teacher@demo.kz', 'politology', 91],
    ['student@demo.kz', 'teacher2@demo.kz', 'python', 95],
    ['student2@demo.kz', 'teacher@demo.kz', 'english', 94], ['student2@demo.kz', 'teacher3@demo.kz', 'biochem', 82], ['student2@demo.kz', 'teacher3@demo.kz', 'microbio', 89],
  ];
  const fioOf = (a) => [a.lastName, a.firstName, a.middleName].filter(Boolean).join(' ');
  function demoUser(a) {
    const u = {
      id: nid({ teacher: 'tch', staff: 'stf' }[a.role] || 'std'), role: a.role, fio: fioOf(a), firstName: a.firstName, email: a.email,
      group: a.group || '', program: a.program || 'ku', dept: a.dept, createdAt: Date.now(), demo: true,
    };
    if (a.login) u.login = a.login;
    if (Array.isArray(a.clubs)) u.demoClubs = [...a.clubs];
    return u;
  }
  function credentialsRead() {
    try { return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8')); } catch { return {}; }
  }
  function credentialsWrite(value) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${CREDENTIALS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, CREDENTIALS_FILE);
    try { fs.chmodSync(CREDENTIALS_FILE, 0o600); } catch { }
  }
  /* Бета-аккаунты создаются при старте и дополняются в уже существующей базе (идемпотентно):
     недостающие пользователи, ФИО/группа/программа/кафедра, занятия и оценки. Только в режиме DEMO=1. */
  function seedDemo() {
    if (!DEMO_ON) return;
    const db = getDB();
    let changed = false;
    const credentials = credentialsRead();
    const users = {};
    for (const a of DEMO_ACCOUNTS) {
      let u = db.users.find((x) => x.email === a.email);
      if (!u) { u = demoUser(a); db.users.push(u); changed = true; }
      else if (u.demo) {
        const want = { fio: fioOf(a), firstName: a.firstName, group: a.group || '', program: a.program || 'ku', dept: a.dept };
        if (a.login) want.login = a.login;
        if (Array.isArray(a.clubs)) want.demoClubs = [...a.clubs];
        for (const [k, v] of Object.entries(want)) if (u[k] !== v) { u[k] = v; changed = true; }
      }
      if (!credentials[a.email] || !u.demoPasswordVersion) {
        const password = a.initialPassword || crypto.randomBytes(18).toString('base64url');
        setPasswordSync(u, password);
        u.demoPasswordVersion = 1;
        credentials[a.email] = password;
        changed = true;
      }
      users[a.email] = u;
      if (u.demo) require('./access').setPerms(u, a.perms || {});
      if (u.role === 'teacher' && Array.isArray(a.groups)) require('./access').setGroups(u, a.groups);
    }
    credentialsWrite(credentials);
    const subOf = (email, disc) => subjectForDiscipline(users[email], disc);
    for (const [email, disc, type, group, day, start, end, room] of importedAccounts.length ? [] : DEMO_LESSONS) {
      const t = users[email], s = subOf(email, disc);
      if (db.schedule.some((r) => r.subjectId === s.id && r.group === group && r.day === day && r.start === start)) continue;
      db.schedule.push({ id: nid('sc'), subjectId: s.id, teacherId: t.id, type, group, day, start, end, room });
      changed = true;
    }
    if (importedAccounts.length) {
      const slots = [['08:30', '09:50'], ['10:00', '11:20'], ['11:30', '12:50'], ['13:00', '14:20']];
      let slot = 0;
      for (const a of importedAccounts.filter((x) => x.role === 'teacher')) {
        const teacher = users[a.email];
        for (const group of a.groups) {
          const name = `Демо-предмет ${teacher.login}`;
          let subject = db.subjects.find((x) => x.teacherId === teacher.id && x.name === name);
          if (!subject) { subject = { id: nid('sub'), name, teacherId: teacher.id, discipline: 'other' }; db.subjects.push(subject); changed = true; }
          if (!db.schedule.some((x) => x.teacherId === teacher.id && x.subjectId === subject.id && x.group === group)) {
            const [start, end] = slots[slot % slots.length];
            db.schedule.push({ id: nid('sc'), subjectId: subject.id, teacherId: teacher.id, type: 'Практика', group,
              day: Math.floor(slot / slots.length) % 5, start, end, room: `Демо-аудитория ${slot % 8 + 1}` });
            changed = true; slot += 1;
          }
        }
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const [se, te, disc, score] of importedAccounts.length ? [] : DEMO_GRADES) {
      const s = subOf(te, disc);
      if (db.grades.some((g) => g.studentId === users[se].id && g.subjectId === s.id)) continue;
      db.grades.push({ id: nid('gr'), studentId: users[se].id, subjectId: s.id, teacherId: users[te].id, score, date: today });
      changed = true;
    }
    if (!importedAccounts.length) {
      // математика и политология ведутся только в ИСУ: оценки студента, переведённого в БТ, по ним убираем
      const bt = users['student2@demo.kz'];
      const isuOnly = db.subjects.filter((x) => x.teacherId === users['teacher@demo.kz'].id && ['math', 'politology'].includes(x.discipline)).map((x) => x.id);
      const before = db.grades.length;
      db.grades = db.grades.filter((g) => !(g.studentId === bt.id && isuOnly.includes(g.subjectId)));
      if (db.grades.length !== before) changed = true;
    }
    if (changed) saveDB();
  }

  return { seedDemo, DEMO_ON, DEMO_ACCOUNTS };
}

module.exports = { createDemo };
