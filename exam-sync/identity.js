'use strict';

const clean = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
const nameParts = value => clean(value).split(/[\s-]+/).filter(Boolean);
function samePersonName(a, b) {
  const left = nameParts(a), right = nameParts(b);
  if (left.length < 2 || right.length < 2) return false;
  const small = left.length <= right.length ? left : right;
  const large = new Set(left.length <= right.length ? right : left);
  return small.every(part => large.has(part));
}

function portalGroup(value) {
  const match = /^(ИСУ|БТ)(20\d{2})-(\d+)$/.exec(String(value || '').trim());
  return match ? { faculty: match[1], year: Number(match[2]) % 100, group: Number(match[3]) } : null;
}

function legacyGroup(user) {
  const faculty = String(user.faculty || '').toUpperCase();
  const year = Number(user.year);
  const group = Number(user.group);
  if (!['ИСУ', 'БТ'].includes(faculty) || !Number.isInteger(year) || !Number.isInteger(group)) return null;
  return { faculty, year: year % 100, group };
}

function sameGroup(a, b) {
  return !!a && !!b && a.faculty === b.faculty && a.year === b.year && a.group === b.group;
}

function sameAccountGroup(a, b) {
  if (a.role !== 'student') return true;
  return sameGroup(portalGroup(a.group), portalGroup(b.group));
}

function allocateId(users, portalId) {
  const base = `portal_${String(portalId).replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 100);
  if (!users.has(base)) return base;
  let suffix = 2;
  while (users.has(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

function remapIdentity(db, oldId, newId) {
  if (oldId === newId) return false;
  const user = db.users.get(oldId);
  if (!user || db.users.has(newId)) return false;
  db.users.delete(oldId);
  user.id = newId;
  db.users.set(newId, user);
  for (const [collection, map] of Object.entries(db)) {
    if (collection === 'users' || !(map instanceof Map)) continue;
    const updates = [];
    for (const [key, row] of map) {
      if (!row || typeof row !== 'object') continue;
      let next = row;
      if (row.userId === oldId || row.by === oldId || row.ownerId === oldId) {
        next = { ...next,
          ...(row.userId === oldId ? { userId:newId } : {}),
          ...(row.by === oldId ? { by:newId } : {}),
          ...(row.ownerId === oldId ? { ownerId:newId } : {}),
        };
      }
      if (collection === 'timers' && row.userId === oldId) {
        const test = row.testId || '';
        next = { ...next, id:['tm', row.roomId, newId, row.part, test].join('|') };
      }
      const nextKey = collection === 'grades'
        ? (next.id || [next.roomId, next.userId, next.testId || next.part || ''].join('|'))
        : collection === 'timers' ? next.id || key : key;
      if (next !== row || nextKey !== key) updates.push([key, nextKey, next]);
    }
    for (const [oldKey, newKey, row] of updates) { map.delete(oldKey); map.set(newKey, row); }
  }
  return true;
}

/*
 * Attach approved KU Portal users to exam identities. Existing exam IDs are retained so
 * saved attempts, grades, room ownership and queue entries remain connected.
 * Student legacy accounts are matched only when both name and canonical group agree.
 * Ambiguous or incomplete matches stay unlinked for operator review.
 */
function syncPortalUsers(db, accounts) {
  let changed = false;
  const linked = [];
  const activePortalIds = new Set(accounts.filter(Boolean).map(user => user.id));
  for (const user of db.users.values()) if (user.authSource === 'portal' && !activePortalIds.has(user.portalUserId) && user.portalActive !== false) {
    user.portalActive = false;
    changed = true;
  }

  for (const portal of accounts) {
    if (!portal || !['student', 'teacher', 'staff'].includes(portal.role) || !portal.id) continue;
    const group = portalGroup(portal.group);
    let exam = [...db.users.values()].find(user => user.portalUserId === portal.id);
    const duplicatePortalAccounts = accounts.filter(other => other && other.role === portal.role &&
      samePersonName(other.fio, portal.fio) && sameAccountGroup(portal, other)).length > 1;
    if (!exam && !duplicatePortalAccounts) {
      const candidates = [...db.users.values()].filter(user => !user.portalUserId && user.role === portal.role &&
        samePersonName(user.name, portal.fio) &&
        (portal.role !== 'student' || sameGroup(legacyGroup(user), group)));
      if (candidates.length === 1) exam = candidates[0];
    }
    if (!exam) exam = { id:portal.id, login:portal.id, name:portal.fio, role:portal.role };
    let id = exam.portalUserId === portal.id ? exam.id : portal.id;
    if (db.users.has(id) && db.users.get(id) !== exam) id = allocateId(db.users, portal.id);
    if (remapIdentity(db, exam.id, id)) { exam = db.users.get(id); changed = true; }
    const next = {
      ...exam,
      id,
      login: exam.portalUserId === portal.id ? exam.login : (exam.portalUserId ? exam.login : portal.id),
      name: portal.fio,
      role: portal.role,
      authSource: 'portal',
      portalUserId: portal.id,
      portalActive: true,
      portalGroup: portal.role === 'student' ? portal.group || '' : '',
      ...(group ? { faculty: group.faculty, year: group.year, group: group.group } : {}),
    };
    delete next.passHash;
    delete next.passAlgo;
    delete next.salt;
    if (JSON.stringify(exam) !== JSON.stringify(next)) { db.users.set(next.id, next); changed = true; }
    linked.push(next.id);
  }
  return { changed, linked };
}

module.exports = { clean, portalGroup, legacyGroup, sameGroup, syncPortalUsers };
