'use strict';
/* Общая обвязка интеграционных тестов: отдельный каталог данных, запуск server.js, запросы и CLI оператора */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { createInterface } = require('node:readline');
const root = path.join(__dirname, '..');

function installation(t, demo = false, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ku-integration-'));
  const env = { ...process.env, NODE_ENV:'test', PORT: '0', IP: '127.0.0.1', KU_DATA_DIR: data, DEMO: demo ? '1' : '0', KU_TRUSTED_PROXIES: '', ...extraEnv };
  let proc, base, output = '';
  async function stop() {
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      const exited = once(proc, 'exit'); proc.kill(); await exited;
    }
  }
  t.after(async () => { await stop(); fs.rmSync(data, { recursive: true, force: true, maxRetries: 3 }); });
  return {
    data, stop, output: () => output,
    cli: (...args) => execFileSync(process.execPath, ['scripts/access.js', ...args], { cwd: root, env, encoding: 'utf8' }).trim().split(/\r?\n/).pop(),
    async start() {
      proc = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let errors = ''; proc.stderr.on('data', line => { errors += line; });
      output = ''; proc.stdout.on('data', chunk => { output += chunk; });
      await new Promise((resolve, reject) => {
        const lines = createInterface({ input: proc.stdout });
        const timeout = setTimeout(() => reject(new Error('startup timed out: ' + errors)), 10_000);
        proc.once('exit', () => { clearTimeout(timeout); reject(new Error('server exited: ' + errors)); });
        lines.on('line', line => {
          const match = /^KU Portal: (http:\/\/127\.0\.0\.1:\d+)$/.exec(line);
          if (match) { base = match[1]; clearTimeout(timeout); resolve(); }
        });
      });
    },
    async request(route, { body, token, headers = {}, method } = {}) {
      const response = await fetch(base + route, { method: method || (body === undefined ? 'GET' : 'POST'),
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get('content-type') || '';
      return { status: response.status, headers: response.headers, value: type.includes('json') ? await response.json() : await response.text() };
    },
  };
}

module.exports = { installation, root };
