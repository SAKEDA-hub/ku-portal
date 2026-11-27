'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMediaStore } = require('../exam-sync/media-store');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ku-exam-media-'));

test('exam media is stored once as a binary asset and reconstructed for existing clients', t => {
  const root = temp(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createMediaStore(path.join(root, 'exam-media'), path.join(root, 'backups'));
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/w2sAAAAASUVORK5CYII=';
  const source = { tests:[{ media:[{ src:png }, { src:png }] }], attempts:[] };
  const saved = store.externalize(source);
  assert.equal(saved.changed, true);
  assert.match(saved.data.tests[0].media[0].src, /^ku-media:v1:/);
  assert.equal(saved.data.tests[0].media[0].src, saved.data.tests[0].media[1].src);
  assert.equal(fs.readdirSync(store.mediaDir).filter(name => /^[a-f0-9]{64}$/.test(name)).length, 1);
  assert.equal(JSON.stringify(saved.data).includes('data:image/png;base64'), false);
  assert.deepEqual(store.hydrate(saved.data), source);
});

test('exam media snapshots keep deleted assets recoverable using hard links', t => {
  const root = temp(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createMediaStore(path.join(root, 'exam-media'), path.join(root, 'backups'), 2);
  const saved = store.externalize({ src:'data:audio/webm;base64,AAECAwQ=' });
  const ref = saved.data.src;
  const hash = /([a-f0-9]{64}):/.exec(ref)[1];
  const asset = path.join(store.mediaDir, hash);
  store.snapshot('2026-11-27');
  const archived = path.join(store.backupRoot, '2026-11-27', hash);
  assert.equal(fs.statSync(asset).ino, fs.statSync(archived).ino);
  store.prune({});
  assert.equal(fs.existsSync(asset), false);
  assert.equal(fs.readFileSync(archived).toString('base64'), 'AAECAwQ=');
});

test('exam media rejects unsupported data URL formats and oversized files', t => {
  const root = temp(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createMediaStore(path.join(root, 'exam-media'), path.join(root, 'backups'));
  assert.throws(() => store.externalize({ src:'data:image/png;base64,not_base64' }), /неверный формат/);
  assert.throws(() => store.externalize({ src:'data:video/mp4;base64,' + Buffer.alloc(26 * 1024 * 1024).toString('base64') }), /больше 25 МБ/);
});
