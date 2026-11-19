'use strict';

// Loaded before the inline UI. Keep the authoritative snapshot and the bearer session out of localStorage.
const SYNC_COLS = ['users', 'tests', 'rooms', 'attempts', 'writings', 'queue', 'grades', 'timers'];
const SYNC = { rev: -1, last: {}, token: '', gradingUntil: 0, demo: false, queue: Promise.resolve(), scheduled: false };
const syncKey = x => x.id || [x.roomId, x.userId, x.testId || x.part || ''].join('|');
const syncSnapshot = db => Object.fromEntries(SYNC_COLS.map(c => [c, new Map((db[c] || []).map(x => [syncKey(x), JSON.stringify(x)]))]));

function differences(before, after) {
  const changes = {};
  for (const c of SYNC_COLS) {
    const up = [], del = [];
    for (const [key, row] of after[c]) if (before[c].get(key) !== row) up.push(JSON.parse(row));
    for (const key of before[c].keys()) if (!after[c].has(key)) del.push(key);
    if (up.length || del.length) changes[c] = { up, del };
  }
  return changes;
}

function overlayChanges(changes) {
  for (const [c, { up, del }] of Object.entries(changes)) {
    const map = new Map(D[c].map(x => [syncKey(x), x]));
    for (const key of del) map.delete(key);
    for (const row of up) map.set(syncKey(row), row);
    D[c] = [...map.values()];
  }
}

function rememberToken(token) {
  SYNC.token = token;
  if (token) sessionStorage.setItem('edu-api-token', token);
  else sessionStorage.removeItem('edu-api-token');
}

async function examApi(route, body) {
  const token = SYNC.token;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch('api/' + route, {
    method: body ? 'POST' : 'GET', headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 304) return null;
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && route !== 'login' && token && token === SYNC.token) examSignedOut();
    throw Object.assign(new Error(value.error || 'Ошибка сервера'), { status: response.status });
  }
  return value;
}

function applyExamState(data, later = {}) {
  if (!data) return;
  const old = D;
  ME = data.user;
  D = normDB({ ...D, ...data.db });
  SYNC.rev = data.rev; SYNC.gradingUntil = data.gradingUntil;
  SYNC.last = syncSnapshot(D);
  overlayChanges(later);
  if (old && S.view !== 'login') notifyDiff(old, D);
  if (LIVE[S.view]) {
    if (fieldFocused() || document.querySelector('.ov')) S.syncPending = true;
    else render();
  }
}

function enqueueExam(job) {
  const token = SYNC.token;
  const pending = SYNC.queue.then(() => {
    if (token !== SYNC.token || !token) throw new Error('Сеанс завершён');
    return job();
  });
  SYNC.queue = pending.catch(() => {});
  return pending;
}

async function flushExam() {
  while (ME && SYNC.token) {
    const base = SYNC.last, sent = syncSnapshot(D), changes = differences(base, sent);
    if (!Object.keys(changes).length) return;
    let response;
    try { response = await examApi('sync', { rev: SYNC.rev, changes }); }
    catch (error) {
      if (!ME || !error.status || error.status >= 500) throw error;
      const remote = await examApi('state'), local = syncSnapshot(D);
      applyExamState(remote, differences(sent, local));
      if (error.status !== 409) throw error;
      // Resend disjoint edits after a concurrent commit. Surface an actual edit conflict.
      const conflict = Object.entries(changes).some(([c, ch]) =>
        [...ch.del, ...ch.up.map(syncKey)].some(key => SYNC.last[c].get(key) !== base[c].get(key) &&
          SYNC.last[c].get(key) !== sent[c].get(key)));
      if (conflict) throw error;
      overlayChanges(differences(base, local));
      continue;
    }
    applyExamState(response, differences(sent, syncSnapshot(D)));
  }
}

function syncPush() {
  if (!ME || SYNC.scheduled) return;
  SYNC.scheduled = true;
  enqueueExam(flushExam).catch(e => toast(e.message)).finally(() => { SYNC.scheduled = false; });
}

function examCommand(route, body) {
  return enqueueExam(async () => {
    await flushExam();
    const before = syncSnapshot(D), response = await examApi(route, body);
    if (response.db) applyExamState(response, differences(before, syncSnapshot(D)));
    return response;
  });
}

function examSignedOut() {
  rememberToken(''); SYNC.rev = -1; SYNC.last = {}; SYNC.gradingUntil = 0;
  stopTimer(); S.run = null; S.pendingRun = null; S.draft = null; S.rdraft = null; S.quiz = null; S.fc = null;
  ME = null; D = normDB({}); applyTheme(); go('login', {}, { force: true, replace: true });
}

async function syncStart() {
  // Older versions cached the complete directory, passwords and marks under this key.
  localStorage.removeItem('edu-exam-v1'); localStorage.removeItem('edu-exam-gradeauth');
  for (const key of Object.keys(localStorage)) if (key.startsWith('edu-exam-run:')) localStorage.removeItem(key);
  sessionStorage.removeItem('edu-exam-session');
  const info = await examApi('info');
  SYNC.demo = info.demo;
  rememberToken(sessionStorage.getItem('edu-api-token') || '');
  if (SYNC.token) {
    applyExamState(await examApi('state'));
    enterExam();
  } else render();
}

setInterval(() => {
  if (!ME || !SYNC.token || SYNC.scheduled || document.visibilityState === 'hidden') return;
  SYNC.scheduled = true;
  enqueueExam(async () => {
    await flushExam();
    const baseline = syncSnapshot(D);
    const state = await examApi('state?since=' + SYNC.rev);
    if (state) applyExamState(state, differences(baseline, syncSnapshot(D)));
  }).catch(e => toast(e.message)).finally(() => { SYNC.scheduled = false; });
}, 2500);
