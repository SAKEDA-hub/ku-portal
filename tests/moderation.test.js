'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanText, cleanExistingChat } = require('../server/moderation');

test('chat cleanup masks profanity in direct messages and club conversations without exposing content', () => {
  const direct = `Привет ${String.fromCharCode(0x0445, 0x0443, 0x0439)}!`;
  const db = {
    chat: { msgs: [{ id: 'm1', text: direct }, { id: 'm2', text: 'Привет, хорошего дня!' }] },
    clubs: [{ chat: [{ id: 'c1', text: `Stop ${String.fromCharCode(0x0066, 0x0075, 0x0063, 0x006b)}.` }], posts: [{ id: 'p1', text: 'Объявление без изменений' }] }],
  };
  const first = cleanExistingChat(db);
  assert.deepEqual(first, { firstRun: true, scanned: 4, changed: 2 });
  assert.equal(db.chat.msgs[0].text, 'Привет [удалено]!');
  assert.equal(db.chat.msgs[1].text, 'Привет, хорошего дня!');
  assert.equal(db.clubs[0].chat[0].text, 'Stop [удалено].');
  assert.deepEqual(cleanExistingChat(db), { firstRun: false, scanned: 0, changed: 0 });
  assert.equal(cleanText('ordinary discussion'), 'ordinary discussion');
  assert.equal(cleanText('Веб-сайт университета'), 'Веб-сайт университета');
});
