'use strict';
/*
 * «Онлайн-экзамен» (EXAM SYNC, github.com/StephCurrysvg/exam-sync), встроенный в KU Portal.
 * Логика сервера синхронизации перенесена из exam-sync/server.js без изменений поведения,
 * только смонтирована под префиксом (по умолчанию /exam-sync), чтобы портал и экзамены
 * работали одним сервисом (один деплой на Render, один адрес).
 *
 *   GET  <base>/             — интерфейс (index.html)
 *   GET  <base>/api/state    — всё состояние
 *   GET  <base>/api/events   — SSE с полным состоянием после каждого изменения
 *   POST <base>/api/sync     — { changes: { <col>: { up: [...], del: [...] } } }
 *
 * Данные: dataFile (по умолчанию data/exam-sync.json, в .gitignore). При первом запуске
 * берутся из seedFile (exam-sync/seed.json — демо-аккаунты и тесты из исходного репозитория).
 */
const fs = require('fs');
const path = require('path');

const COLS = ['users', 'tests', 'rooms', 'attempts', 'writings', 'queue', 'grades'];
const MAX_BODY = 5 * 1024 * 1024;
const keyOf = (x) => x.id || [x.roomId, x.userId, x.testId || x.part || ''].join('|');

function createExamSync({ base = '/exam-sync', dataFile, seedFile = path.join(__dirname, 'seed.json') } = {}) {
  const INDEX = path.join(__dirname, 'index.html');
  let rev = 0;
  const db = Object.fromEntries(COLS.map((c) => [c, new Map()]));

  function load(file) {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    rev = s.rev || 0;
    COLS.forEach((c) => (s.db && s.db[c] || []).forEach(([k, r]) => db[c].set(k, r)));
  }
  try { load(dataFile); } catch { try { load(seedFile); } catch { /* пустая база — клиент создаст демо-данные сам */ } }

  const state = () => ({ rev, db: Object.fromEntries(COLS.map((c) => [c, [...db[c].values()]])) });
  const save = () => {
    try {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(dataFile, JSON.stringify({ rev, db: Object.fromEntries(COLS.map((c) => [c, [...db[c].entries()]])) }) + '\n');
    } catch (e) { console.error('[exam-sync] save:', e.message); }
  };

  const clients = new Set();
  setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 25000).unref();

  const json = (res, o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };

  /* Возвращает true, если запрос относится к экзаменам и обработан */
  return async function handle(req, res) {
    const p = req.url.split('?')[0];
    if (p !== base && !p.startsWith(base + '/')) return false;
    const u = p.slice(base.length) || '';

    // Без завершающего «/» относительные пути api/... в index.html уйдут мимо — перенаправляем
    if (u === '' && req.method === 'GET') {
      const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      res.writeHead(301, { Location: base + '/' + q });
      res.end();
      return true;
    }
    if (req.method === 'GET' && (u === '/' || u === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(fs.readFileSync(INDEX));
      return true;
    }
    if (req.method === 'HEAD' && (u === '/' || u === '/api/state')) { res.writeHead(200, { 'Cache-Control': 'no-store' }); res.end(); return true; } // проверка доступности
    if (req.method === 'GET' && u === '/api/state') { json(res, state()); return true; }
    if (req.method === 'GET' && u === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('data: ' + JSON.stringify(state()) + '\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return true;
    }
    if (req.method === 'POST' && u === '/api/sync') {
      let s = '';
      for await (const c of req) { s += c; if (s.length > MAX_BODY) { json(res, { error: 'too large' }, 413); req.destroy(); return true; } }
      let b; try { b = JSON.parse(s); } catch { json(res, { error: 'bad json' }, 400); return true; }
      const ch = (b && b.changes) || {};
      COLS.forEach((c) => {
        const x = ch[c]; if (!x) return;
        (Array.isArray(x.del) ? x.del : []).forEach((k) => db[c].delete(k));
        (Array.isArray(x.up) ? x.up : []).forEach((r) => { if (r && typeof r === 'object') db[c].set(keyOf(r), r); });
      });
      rev++; save();
      const d = 'data: ' + JSON.stringify(state()) + '\n\n';
      clients.forEach((c) => c.write(d));
      json(res, { ok: true, rev });
      return true;
    }
    json(res, { error: 'not found' }, 404);
    return true;
  };
}

module.exports = { createExamSync };
