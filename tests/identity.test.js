'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { syncPortalUsers, portalGroup } = require('../exam-sync/identity');

test('portal accounts adopt unambiguous legacy identities and rekey their records to the portal ID', () => {
  const teacher = { id:'legacy-teacher', login:'legacy.teacher', name:'Example Teacher', role:'teacher', passHash:'legacy-hash' };
  const student = { id:'legacy-student', login:'ИСУ-25-1g-1', name:'Example Student', role:'student', faculty:'ИСУ', year:25, group:1 };
  const db = { users:new Map([[teacher.id, teacher], [student.id, student]]) };
  const result = syncPortalUsers(db, [
    { id:'tch_1', role:'teacher', fio:'Example Teacher', group:'' },
    { id:'std_2', role:'student', fio:'Example Student', group:'ИСУ2025-1' },
  ]);
  assert.equal(result.changed, true);
  assert.deepEqual(result.linked, ['tch_1', 'std_2']);
  assert.equal(db.users.get('tch_1').portalUserId, 'tch_1');
  assert.equal(db.users.get('tch_1').passHash, undefined);
  assert.equal(db.users.get('std_2').portalUserId, 'std_2');
  assert.equal(db.users.has('legacy-teacher'), false);
  assert.equal(db.users.has('legacy-student'), false);
  assert.deepEqual(portalGroup('БТ2026-3'), { faculty:'БТ', year:26, group:3 });
});

test('ambiguous or incomplete student matches do not attach old marks to the wrong account', () => {
  const db = { users:new Map([
    ['old-1', { id:'old-1', login:'one', name:'Same Name', role:'student', faculty:'ИСУ', year:25, group:1 }],
    ['old-2', { id:'old-2', login:'two', name:'Same Name', role:'student', faculty:'ИСУ', year:25, group:1 }],
  ]) };
  const result = syncPortalUsers(db, [{ id:'std_8', role:'student', fio:'Same Name', group:'ИСУ2025-1' }]);
  assert.equal(result.linked.length, 1);
  assert.equal(result.linked[0], 'std_8');
  assert.equal(db.users.get('old-1').portalUserId, undefined);
  assert.equal(db.users.get('old-2').portalUserId, undefined);
});

test('teacher names with reversed order and an optional middle name link only when unique', () => {
  const db = { users:new Map([['old', { id:'old', login:'teacher', name:'Евгений Аронов', role:'teacher', passHash:'old-hash' }]]) };
  const result = syncPortalUsers(db, [{ id:'tch_4', role:'teacher', fio:'Аронов Евгений Сергеевич' }]);
  assert.deepEqual(result.linked, ['tch_4']);
  assert.equal(db.users.get('tch_4').portalUserId, 'tch_4');
  assert.equal(db.users.get('tch_4').name, 'Аронов Евгений Сергеевич');
});

test('identity rekey updates ownership, results, queue, grades and running timers', () => {
  const db = {
    users:new Map([
      ['legacy-teacher', { id:'legacy-teacher', login:'t', name:'Teacher Person', role:'teacher' }],
      ['legacy-student', { id:'legacy-student', login:'s', name:'Student Person', role:'student', faculty:'БТ', year:26, group:2 }],
    ]),
    tests:new Map([['test', { id:'test', ownerId:'legacy-teacher' }]]),
    rooms:new Map([['room', { id:'room', ownerId:'legacy-teacher' }]]),
    attempts:new Map([['attempt', { id:'attempt', userId:'legacy-student' }]]),
    writings:new Map([['writing', { id:'writing', userId:'legacy-student' }]]),
    queue:new Map([['queue', { id:'queue', userId:'legacy-student', by:'legacy-student' }]]),
    grades:new Map([['room|legacy-student|writing', { roomId:'room', userId:'legacy-student', part:'writing', by:'legacy-teacher' }]]),
    timers:new Map([['tm|room|legacy-student|writing|', { id:'tm|room|legacy-student|writing|', roomId:'room', userId:'legacy-student', part:'writing' }]]),
  };
  syncPortalUsers(db, [
    { id:'tch_5', role:'teacher', fio:'Person Teacher', group:'' },
    { id:'std_9', role:'student', fio:'Student Person', group:'БТ2026-2' },
  ]);
  assert.equal(db.tests.get('test').ownerId, 'tch_5');
  assert.equal(db.rooms.get('room').ownerId, 'tch_5');
  assert.equal(db.attempts.get('attempt').userId, 'std_9');
  assert.equal(db.writings.get('writing').userId, 'std_9');
  assert.equal(db.queue.get('queue').userId, 'std_9');
  assert.equal(db.grades.get('room|std_9|writing').by, 'tch_5');
  assert.equal(db.timers.get('tm|room|std_9|writing|').userId, 'std_9');
});

test('revoked portal profiles are hidden from the exam directory while records are retained', () => {
  const row = { id:'portal_std_1', login:'std_1', name:'Student', role:'student', authSource:'portal', portalUserId:'std_1', portalActive:true };
  const db = { users:new Map([[row.id, row]]) };
  syncPortalUsers(db, []);
  assert.equal(row.portalActive, false);
  assert.equal(db.users.has(row.id), true);
});
