'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const script = path.join(root, 'deploy', 'backup-pull.sh');
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ku-backup-pull-'));
  const mockbin = path.join(dir, 'bin'), remote = path.join(dir, 'remote'), data = path.join(remote, 'ku-portal/data');
  fs.mkdirSync(mockbin, { recursive:true }); fs.mkdirSync(data, { recursive:true });
fs.writeFileSync(path.join(mockbin, 'rsync'), `#!/bin/sh\nset -eu\nprev=''\nlast=''\nfor arg do prev="$last"; last="$arg"; done\nsrc="${'${prev#*:}'}"\ndest="$last"\nmkdir -p "$dest"\ncp -a "$MOCK_REMOTE_ROOT/$src/." "$dest/"\n`);
  fs.chmodSync(path.join(mockbin, 'rsync'), 0o755);
  return { dir, data, env:{ ...process.env, HOME:dir, PATH:mockbin + ':' + process.env.PATH,
    MOCK_REMOTE_ROOT:remote, KU_BACKUP_HOST:'test@host', KU_BACKUP_KEY:path.join(dir, 'unused-key'),
    KU_BACKUP_DIR:path.join(dir, 'copies') } };
}
function run(ctx) { return spawnSync('sh', [script], { cwd:root, env:ctx.env, encoding:'utf8' }); }

test('backup pull accepts valid plain and encrypted db.json from the confirmed default directory', t => {
  const ctx = setup(); t.after(() => fs.rmSync(ctx.dir, { recursive:true, force:true }));
  const plain = { users:[], grades:[], schedule:[], subjects:[] };
  fs.writeFileSync(path.join(ctx.data, 'db.json'), JSON.stringify(plain));
  let result = run(ctx);
  assert.equal(result.status, 0, result.stderr);
  const days = fs.readdirSync(path.join(ctx.dir, 'copies'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(ctx.dir, 'copies', days[0], 'db.json'), 'utf8')).users.length, 0);

  fs.writeFileSync(path.join(ctx.data, 'db.json'), JSON.stringify({ _kuEncrypted:1, alg:'A256GCM', iv:Buffer.alloc(12).toString('base64'), tag:Buffer.alloc(16).toString('base64'), data:Buffer.from('{}').toString('base64') }));
  result = run(ctx);
  assert.equal(result.status, 0, result.stderr);
});

test('backup pull honors KU_BACKUP_REMOTE_DIR overrides', t => {
  const ctx = setup(); t.after(() => fs.rmSync(ctx.dir, { recursive:true, force:true }));
  const custom = path.join(ctx.dir, 'remote', 'custom-store'); fs.mkdirSync(custom, { recursive:true });
  fs.writeFileSync(path.join(custom, 'db.json'), JSON.stringify({ users:[], grades:[], schedule:[], subjects:[] }));
  ctx.env.KU_BACKUP_REMOTE_DIR = 'custom-store';
  const result = run(ctx);
  assert.equal(result.status, 0, result.stderr);
});

test('backup pull leaves earlier copies untouched when the configured database file is invalid', t => {
  const ctx = setup(); t.after(() => fs.rmSync(ctx.dir, { recursive:true, force:true }));
  const copies = path.join(ctx.dir, 'copies'); fs.mkdirSync(copies);
  fs.mkdirSync(path.join(copies, '2026-11-26'));
  fs.writeFileSync(path.join(copies, '2026-11-26', 'keep.txt'), 'previous copy');
  fs.writeFileSync(path.join(ctx.data, 'db.json'), '{broken');
  const result = run(ctx);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /KU_BACKUP_REMOTE_DIR/);
  assert.equal(fs.readFileSync(path.join(copies, '2026-11-26', 'keep.txt'), 'utf8'), 'previous copy');
});
