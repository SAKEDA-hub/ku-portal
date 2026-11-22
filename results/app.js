'use strict';
const app = document.getElementById('app');
const TOKEN_KEY = 'ku-results-token';
const MANUAL_KEY = 'ku-results-manual'; // вышел вручную — в этой вкладке не входить через портал автоматически
let token = sessionStorage.getItem(TOKEN_KEY) || '';
let data = null;
let groupFilter = '', studentFilter = '';
const portalToken = () => { try { return localStorage.getItem('ku_token') || ''; } catch { return ''; } };
const staffView = u => u.role === 'teacher' || u.role === 'admin'; // база открыта только преподавателям и администрации
const roleName = u => u.role === 'admin' ? 'Администратор' : 'Преподаватель';
const groupOf = u => [u.direction, u.year, u.group].filter(Boolean).join(' · ');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.body && typeof options.body !== 'string') { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
  const response = await fetch('/api/results/' + path, Object.assign({}, options, { headers, cache:'no-store' }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Ошибка сервера');
  return body;
}
/* Вход через KU Portal: тот же браузер уже знает сеанс портала */
async function portalLogin() {
  const response = await fetch('/api/results/portal-login', { method: 'POST', headers: { Authorization: 'Bearer ' + portalToken() }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (response.ok) { token = body.token; sessionStorage.setItem(TOKEN_KEY, token); return load(); }
  if (response.status === 403) return noAccessView(body.error);
  loginView();
}
function noAccessView(message) {
  app.innerHTML = `<section class="card" style="max-width:520px;margin:6vh auto"><h1>Учебная база</h1><div class="notice">${esc(message || 'Доступ закрыт')}</div><p><a href="/">← Вернуться в KU Portal</a></p></section>`;
}
function loginView(message = '') {
  app.innerHTML = `<section class="card" style="max-width:480px;margin:6vh auto"><h1>Учебная база результатов</h1><p class="muted">Вход выполняется через ваш аккаунт KU Portal.</p><div class="error">${esc(message)}</div><a class="btn" href="/">Войти через KU Portal</a></section>`;
}
const totalMax = test => (data.components || []).filter(c => c.testId === test.id).reduce((s,c) => s + c.maxPoints, 0);
function render() {
  const u = data.user;
  const results = data.results || [];
  if (!results.length) {
    app.innerHTML = `<section class="card"><h1>Учебная база результатов</h1><div class="notice">База подключена, но в ней пока нет результатов.</div><button class="secondary" id="logout">Выйти</button></section>${staffView(u) ? teacherForms() : ''}`;
    bindTeacher(); bindLogout(); return;
  }
  const groups = [...new Set((data.users || []).filter(x => x.role === 'student').map(groupOf).filter(Boolean))].sort();
  const students = (data.users || []).filter(x => x.role === 'student' && (!groupFilter || groupOf(x) === groupFilter));
  const shown = results.filter(r => !staffView(u) || ((!groupFilter || groupOf(r.user || {}) === groupFilter) && (!studentFilter || (r.user || {}).id === studentFilter)));
  const filters = staffView(u) ? `<div class="form filters"><select id="f-group"><option value="">Все группы (${groups.length})</option>${groups.map(g => `<option ${g === groupFilter ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select><select id="f-student"><option value="">Все студенты (${students.length})</option>${students.map(x => `<option value="${esc(x.id)}" ${x.id === studentFilter ? 'selected' : ''}>${esc(x.username)}</option>`).join('')}</select><span class="muted">Показано: ${shown.length}</span></div>` : '';
  const rows = shown.map(r => {
    const user = r.user || {};
    const test = r.test || {};
    const cells = (r.scores || []).map(s => {
      const component = s.component || {};
      return `<span class="score"><span>${esc(component.skill || 'балл')}:</span>${staffView(u) ? `<input type="number" min="0" max="${component.maxPoints}" value="${s.points}" data-score="${esc(r.id)}" data-component="${esc(component.id)}"><button class="secondary" data-save-score="${esc(r.id)}" data-component="${esc(component.id)}">Сохранить</button>` : `<b>${s.points}/${component.maxPoints}</b>`}${component.docxFilename ? `<a href="#" data-file="${esc(component.id)}" data-filename="${esc(component.docxFilename)}">Word: ${esc(component.docxFilename)}</a>` : ''}</span>`;
    }).join('');
    return `<tr><td>${esc(user.username || '')}<br><span class="pill">${esc([user.direction,user.year,user.group].filter(Boolean).join(' · '))}</span></td><td>${esc(test.title || '')}<br><span class="muted">${totalMax(test)} максимум</span></td><td><b>${r.totalScore}/100</b></td><td>${cells}</td></tr>`;
  }).join('');
  app.innerHTML = `<section class="card"><div class="form" style="align-items:center"><div><h1>Учебная база результатов</h1><span class="muted">${esc(u.username)} · ${roleName(u)}${u.portal ? ' · вход через KU Portal' : ''}</span></div><button class="secondary" id="logout">Выйти</button></div>${filters}<div class="table-wrap"><table><thead><tr><th>Студент</th><th>Тест</th><th>Итог</th><th>Баллы по навыкам</th></tr></thead><tbody>${rows}</tbody></table></div></section>${staffView(u) ? teacherForms() : ''}`;
  bindLogout(); bindTeacher(); bindFiles();
  const fg = document.getElementById('f-group'), fs = document.getElementById('f-student');
  if (fg) fg.onchange = () => { groupFilter = fg.value; studentFilter = ''; render(); };
  if (fs) fs.onchange = () => { studentFilter = fs.value; render(); };
}
function teacherForms() {
  return `<section class="card"><h2>Добавить тест</h2><form id="new-test"><div class="form"><input id="test-title" placeholder="Название теста" required><button>Создать тест</button></div><div class="parts">${[['тесты',20],['письмо',40],['говорение',40]].map(([skill,max]) => `<label><input type="checkbox" data-skill="${skill}"> ${skill} максимум <input type="number" data-max="${skill}" min="1" max="100" value="${max}"></label>`).join('')}</div></form><div class="error" id="teacher-error"></div></section><section class="card"><h2>Прикрепить Word-файл</h2><div class="form"><select id="file-component"><option value="">Выберите тест и навык</option>${data.components.map(c => `<option value="${esc(c.id)}">${esc((data.tests.find(t=>t.id===c.testId)||{}).title)} · ${esc(c.skill)}</option>`).join('')}</select><input id="docx" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><button id="upload-docx" type="button">Загрузить</button></div><div class="muted">DOCX, до 5 МБ. Файл доступен только после входа.</div></section>`;
}
function bindTeacher() {
  if (!staffView(data.user)) return;
  const form = document.getElementById('new-test');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const components = [...form.querySelectorAll('[data-skill]:checked')].map(x => ({ skill:x.dataset.skill, maxPoints:Number(form.querySelector(`[data-max="${x.dataset.skill}"]`).value) }));
    try { await api('tests', { method:'POST', body:{ title:document.getElementById('test-title').value, components } }); await load(); }
    catch (err) { document.getElementById('teacher-error').textContent = err.message; }
  };
  bindUpload();
  app.querySelectorAll('[data-save-score]').forEach(b => b.onclick = async () => {
    const input = app.querySelector(`[data-score="${b.dataset.saveScore}"][data-component="${b.dataset.component}"]`);
    try { await api('scores', { method:'POST', body:{ resultId:b.dataset.saveScore, componentId:b.dataset.component, points:Number(input.value) } }); await load(); }
    catch (err) { alert(err.message); }
  });
}
function bindFiles() {
  app.querySelectorAll('[data-file]').forEach(a => a.onclick = async e => {
    e.preventDefault();
    try {
      const r = await fetch('/api/results/test-file/' + encodeURIComponent(a.dataset.file), { headers:{ Authorization:'Bearer ' + token }, cache:'no-store' });
      if (!r.ok) throw new Error('Не удалось скачать файл');
      const blob = await r.blob(), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = a.dataset.filename || 'test.docx'; link.click(); URL.revokeObjectURL(link.href);
    } catch (err) { alert(err.message); }
  });
}
function bindUpload() {
  const upload = document.getElementById('upload-docx');
  if (upload) upload.onclick = async () => {
    const file = document.getElementById('docx').files[0], componentId = document.getElementById('file-component').value;
    if (!file || !componentId) return alert('Выберите навык и DOCX-файл.');
    if (file.size > 5 * 1024 * 1024) return alert('Файл больше 5 МБ.');
    const base64 = await new Promise((resolve,reject) => { const r=new FileReader(); r.onload=()=>resolve(String(r.result).split(',')[1]); r.onerror=reject; r.readAsDataURL(file); });
    try { await api('test-file', { method:'POST', body:{ componentId, filename:file.name, data:base64 } }); await load(); }
    catch (err) { alert(err.message); }
  };
}
function bindLogout() { const b = document.getElementById('logout'); if (b) b.onclick = async () => { try { await api('logout', {method:'POST'}); } catch {} token=''; sessionStorage.removeItem(TOKEN_KEY); sessionStorage.setItem(MANUAL_KEY, '1'); loginView(); }; }
async function load() {
  try { const r = await api('results'); data = Object.assign({user:(await api('me')).user}, r); render(); }
  catch (e) { token=''; sessionStorage.removeItem(TOKEN_KEY); loginView(e.message === 'Войдите в систему' ? '' : e.message); }
}
if (token) load();
else if (portalToken() && !sessionStorage.getItem(MANUAL_KEY)) portalLogin().catch(() => loginView());
else loginView();
