'use strict';
/*
 * Удаление пользователей из базы портала вместе со следами: сеансы, переписка, клубы, общежитие, вложения.
 *   scrubUsers(db, ids, { keepTeaching }) — общая чистка (админ-панель, очистка демо-данных).
 *     keepTeaching: true — у удаляемого преподавателя сохраняются выставленные оценки и предметы (как при
 *     удалении аккаунта самим пользователем), убирается только расписание; false — всё, что с ним связано.
 *   purgeDemo(db) — в рабочем режиме (DEMO=0) убирает бета-аккаунты (user.demo) и всё, что к ним привязано.
 * Возвращает ID файлов-вложений, которые нужно удалить с диска (data/uploads/<id>).
 */

const dropKeys = (obj, ids) => { if (obj && typeof obj === 'object') for (const id of ids) delete obj[id]; };
// канал личной переписки: d:<id1>:<id2>; учебный канал: s:<subjectId>[:группа]
const channelHas = (ch, ids, subjects) => {
  const parts = String(ch || '').split(':');
  return (parts[0] === 'd' && (ids.has(parts[1]) || ids.has(parts[2]))) || (parts[0] === 's' && subjects.has(parts[1]));
};

function scrubChat(db, ids, subjects) {
  const chat = db.chat;
  if (!chat || typeof chat !== 'object') return;
  const gone = (ch, author) => channelHas(ch, ids, subjects) || ids.has(author);
  if (Array.isArray(chat.msgs)) chat.msgs = chat.msgs.filter(m => !gone(m.ch, m.from));
  if (Array.isArray(chat.materials)) chat.materials = chat.materials.filter(m => !gone(m.ch, m.teacherId));
  if (Array.isArray(chat.tasks)) chat.tasks = chat.tasks.filter(m => !gone(m.ch, m.teacherId));
  if (chat.reads && typeof chat.reads === 'object') {
    dropKeys(chat.reads, ids);
    for (const marks of Object.values(chat.reads)) {
      if (marks && typeof marks === 'object') for (const ch of Object.keys(marks)) if (channelHas(ch, ids, subjects)) delete marks[ch];
    }
  }
}

function scrubClubs(db, ids) {
  for (const club of Array.isArray(db.clubs) ? db.clubs : []) {
    if (Array.isArray(club.members)) club.members = club.members.filter(id => !ids.has(id));
    dropKeys(club.since, ids);
    dropKeys(club.requests, ids);
    if (Array.isArray(club.posts)) club.posts = club.posts.filter(p => !ids.has(p.by));
    if (Array.isArray(club.chat)) club.chat = club.chat.filter(m => !ids.has(m.from));
    for (const ev of Array.isArray(club.events) ? club.events : []) {
      if (Array.isArray(ev.people)) ev.people = ev.people.filter(id => !ids.has(id));
      if (Array.isArray(ev.absent)) ev.absent = ev.absent.filter(id => !ids.has(id));
      if (ids.has(ev.by)) ev.by = null;
    }
  }
  dropKeys(db.clubReads, ids);
}

function scrubUsers(db, idList, { keepTeaching = true } = {}) {
  const ids = new Set(idList);
  if (!ids.size) return [];
  const removedSubjects = new Set(keepTeaching ? [] : db.subjects.filter(s => ids.has(s.teacherId)).map(s => s.id));
  db.users = db.users.filter(u => !ids.has(u.id));
  db.subjects = db.subjects.filter(s => !removedSubjects.has(s.id));
  db.schedule = db.schedule.filter(r => !ids.has(r.teacherId) && !removedSubjects.has(r.subjectId));
  db.grades = db.grades.filter(g => !ids.has(g.studentId) && !removedSubjects.has(g.subjectId) && (keepTeaching || !ids.has(g.teacherId)));
  for (const [tok, uid] of Object.entries(db.sessions || {})) if (ids.has(uid)) { delete db.sessions[tok]; if (db.sessMeta) delete db.sessMeta[tok]; }
  for (const [tok, meta] of Object.entries(db.sessMeta || {})) if (meta && ids.has(meta.uid)) delete db.sessMeta[tok];
  scrubChat(db, ids, removedSubjects);
  scrubClubs(db, ids);
  if (db.dorm && Array.isArray(db.dorm.requests)) db.dorm.requests = db.dorm.requests.filter(r => !ids.has(r.by));
  const files = Array.isArray(db.files) ? db.files.filter(f => ids.has(f.owner)).map(f => f.id) : [];
  if (Array.isArray(db.files)) db.files = db.files.filter(f => !ids.has(f.owner));
  return files;
}

/* Бета-аккаунты в рабочей базе — остаток прежнего режима: их предметы и расписание видели настоящие студенты */
function purgeDemo(db) {
  const demo = db.users.filter(u => u.demo);
  if (!demo.length) return { users: [], files: [] };
  const files = scrubUsers(db, demo.map(u => u.id), { keepTeaching: false });
  return { users: demo, files };
}

module.exports = { scrubUsers, purgeDemo };
