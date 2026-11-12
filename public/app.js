'use strict';
/* KU Portal — SPA без зависимостей */

const app = document.getElementById('app');
const S = { token: localStorage.getItem('ku_token') || null, user: null };

/* ------------------------------ Иконки ------------------------------ */
const I = {
  star: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8 2.5-5.2z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3.3v3.4M16 3.3v3.4M3.5 10.2h17"/>',
  book: '<path d="M12 6.6C10.5 5.1 8.6 4.3 6.2 4.3c-1.1 0-2 .2-2.7.5v13.4c.8-.3 1.7-.5 2.7-.5 2.4 0 4.3.9 5.8 2.4 1.5-1.5 3.4-2.4 5.8-2.4 1 0 1.9.2 2.7.5V4.8c-.8-.3-1.7-.5-2.7-.5-2.4 0-4.3.9-5.8 2.4z"/><path d="M12 6.6v13.5"/>',
  clipboard: '<path d="M5.5 4.7h13a1.5 1.5 0 0 1 1.5 1.5v13.3a1.5 1.5 0 0 1-1.5 1.5h-13a1.5 1.5 0 0 1-1.5-1.5V6.2a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M9 3h6v3.4H9z"/><path d="M8.7 13.4l2.2 2.2 4.4-4.6"/>',
  msg: '<path d="M12 3.8a8.2 8.2 0 1 0-4.6 15l5.4 1.6-1.6-5.2A8.2 8.2 0 0 0 12 3.8z"/><path d="M9.9 9.7a2.3 2.3 0 1 1 3.4 2c-.8.5-1.3 1-1.3 1.9"/><path d="M12 16.4v.01"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.1 1.9"/>',
  chart: '<path d="M5 19.5V12M12 19.5V5.5M19 19.5v-8"/>',
  home: '<path d="M4 11.3 12 4.4l8 6.9"/><path d="M6.6 9.9v9.6h10.8V9.9"/>',
  user: '<circle cx="12" cy="8.3" r="3.8"/><path d="M5.6 20a6.4 6.4 0 0 1 12.8 0"/>',
  bell: '<path d="M6.2 10.2a5.8 5.8 0 1 1 11.6 0c0 2.9.7 4.5 1.4 5.3.4.4.1 1.1-.5 1.1H5.3c-.6 0-.9-.7-.5-1.1.7-.8 1.4-2.4 1.4-5.3z"/><path d="M10.4 19.7a1.9 1.9 0 0 0 3.2 0"/>',
  building: '<rect x="6.4" y="3.6" width="11.2" height="16.8" rx="2.2"/><path d="M9.6 7.4h1.3M13.1 7.4h1.3M9.6 10.9h1.3M13.1 10.9h1.3M10.8 20.4v-2.9h2.4v2.9"/>',
  mic: '<rect x="9.4" y="3.6" width="5.2" height="10.8" rx="2.6"/><path d="M6 11.6a6 6 0 0 0 12 0M12 17.6v3"/>',
  send: '<path d="M20.5 3.5 10.3 13.7M20.5 3.5 14 20.5l-3.7-6.8L3.5 10z"/>',
  chev: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  tg: '<path d="M21.5 4.1 18 19.6l-5.6-4.5-2.7 2.7-.5-4.1L18.8 6.9l-11.4 6.3-4.9-1.6z"/>',
  logo: '<path d="M7 19V5h2.6v6.2L15 5h3.1l-5.4 6.6L18.6 19h-3.2l-5.8-6.4V19H7z" fill="currentColor" stroke="none"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5"/><path d="M12 8v.01"/>',
  door: '<path d="M6 20.5V4.8c0-.7.5-1.3 1.2-1.3h9.6c.7 0 1.2.6 1.2 1.3v15.7M4 20.5h16"/><path d="M14.5 12.2v.6"/>',
  users: '<circle cx="9" cy="8.4" r="3.3"/><path d="M3.4 19.5a5.6 5.6 0 0 1 11.2 0"/><path d="M15.6 5.4a3.2 3.2 0 0 1 0 6.1M17.4 14.3a5.5 5.5 0 0 1 3.2 5.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5h9.5a5.5 5.5 0 0 1 0 11H11"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  play: '<path d="M7.5 5.2v13.6L18.5 12z"/>',
  speaker: '<path d="M4 10v4h3.5l5 4.5v-13L7.5 10z"/><path d="M16 9a4.2 4.2 0 0 1 0 6M18.6 6.5a7.8 7.8 0 0 1 0 11"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
};
function mi(icon, text) { return `<span class="mi">${svg(icon)}${text}</span>`; }
function svg(name, cls) {
  return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;
}

/* ------------------------------ Хелперы ------------------------------ */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tm(ts) { return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
const RU_M = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
function dstr(s) {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(String(s || ''));
  if (!m) return s;
  return String(Number(s.slice(8))) + ' ' + RU_M[Number(s.slice(5, 7)) - 1];
}
function stopPoll() {
  if (window.__poll) { clearInterval(window.__poll); window.__poll = null; }
  if (window.__unsub) { const f = window.__unsub; window.__unsub = null; f(); }
}
function toast(text, isErr) {
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
async function api(path, o) {
  o = o || {};
  o.headers = Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}, o.headers || {});
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch('/api' + path, o);
  if (r.status === 401 && S.token) { Live.stop(); S.token = null; localStorage.removeItem('ku_token'); S.user = null; route(); throw new Error('Сессия истекла'); }
  const j = await r.json().catch(() => ({ error: 'Ошибка сервера' }));
  if (!r.ok) throw new Error(j.error || 'Ошибка сервера');
  return j;
}

/* ------------------------------ Общие блоки ------------------------------ */
function navHTML(active) {
  return `<nav class="bnav">
    <a href="#/" class="${active === 'home' ? 'on' : ''}"><span class="ic">${svg('home')}</span>Главная</a>
    <a href="#/profile" class="${active === 'profile' ? 'on' : ''}"><span class="ic">${svg('user')}</span>Профиль</a>
  </nav>`;
}
function headHTML() {
  const u = S.user;
  return `
  <div class="hrow">
    <div>
      <div class="hi">Привет,</div>
      <div class="nm">${esc(u.firstName)}</div>
    </div>
    <div class="nicons">
      <button class="bell" id="bell" title="Уведомления">${svg('bell')}</button>
      <button class="avatar" id="goProfile" title="Профиль">${esc(u.firstName.charAt(0).toUpperCase())}</button>
    </div>
  </div>
  <div class="uni">
    <div class="mark brand-mark"><img src="/bird-idle.png" alt="" /></div>
    <div class="uname">Kozybayev University</div>
  </div>`;
}
function miniHead(title) {
  return `<a class="back" href="#/">${svg('back')} Назад</a><h1 class="ptitle">${esc(title)}</h1>`;
}

/* ============================ Аутентификация ============================ */
let authTab = 'login', authRole = 'student';
function viewAuth(msg) {
  stopPoll();
  app.innerHTML = `
  <div class="auth">
    <div class="logo">
      <div class="mark brand-mark"><img src="/bird-idle.png" alt="" /></div>
      <div>
        <h1>KU Portal</h1>
        <div class="sub">Kozybayev University</div>
      </div>
    </div>
    <div class="tabs">
      <button id="tabLogin" class="${authTab === 'login' ? 'on' : ''}">Вход</button>
      <button id="tabReg" class="${authTab === 'reg' ? 'on' : ''}">Регистрация</button>
    </div>
    <div id="authform"></div>
    <div class="err" id="autherr">${msg ? esc(msg) : ''}</div>
    <div id="demoBox"></div>
  </div>`;
  renderAuthForm();
  renderDemoBox();
  document.getElementById('tabLogin').onclick = () => { authTab = 'login'; viewAuth(); };
  document.getElementById('tabReg').onclick = () => { authTab = 'reg'; viewAuth(); };
}
function renderAuthForm() {
  const box = document.getElementById('authform');
  if (authTab === 'login') {
    box.innerHTML = `
      <input class="inp" id="liEmail" type="email" placeholder="Email">
      <input class="inp" id="liPass" type="password" placeholder="Пароль">
      <button class="btn pri" id="liBtn">Войти</button>`;
    document.getElementById('liBtn').onclick = doLogin;
    document.getElementById('liPass').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
  } else {
    box.innerHTML = `
      <input class="inp" id="rLast" placeholder="Фамилия">
      <input class="inp" id="rFirst" placeholder="Имя">
      <input class="inp" id="rMid" placeholder="Отчество (необязательно)">
      <input class="inp" id="rEmail" type="email" placeholder="Email">
      <input class="inp" id="rPass" type="password" placeholder="Пароль (мин. 4 символа)">
      <label class="lbl">Роль</label>
      <div class="chips">
        <button class="chip ${authRole === 'student' ? 'on' : ''}" id="chStud">Студент</button>
        <button class="chip ${authRole === 'teacher' ? 'on' : ''}" id="chTeach">Преподаватель</button>
      </div>
      <div id="grpWrap">${authRole === 'student' ? '<input class="inp" id="rGroup" placeholder="Группа (например: ИСУ-26-2-а)"><label class="lbl">Оценки и расписание появятся, когда преподаватель добавит их для вашей группы</label>' : ''}</div>
      <button class="btn pri" id="rBtn">Создать аккаунт</button>`;
    document.getElementById('chStud').onclick = () => { authRole = 'student'; renderAuthForm(); };
    document.getElementById('chTeach').onclick = () => { authRole = 'teacher'; renderAuthForm(); };
    document.getElementById('rBtn').onclick = doRegister;
  }
}
/* Блок быстрого входа в тестовые аккаунты (если сервер запущен с демо-данными) */
let demoInfo = null;
async function renderDemoBox() {
  try { if (!demoInfo) demoInfo = await api('/demo'); } catch { return; }
  const box = document.getElementById('demoBox');
  if (!box || !demoInfo.enabled) return;
  const t = demoInfo.accounts.find((a) => a.role === 'teacher');
  const st = demoInfo.accounts.find((a) => a.role === 'student');
  box.innerHTML = `
    <div class="demo-box">
      <b>Тестовый вход</b>
      <div class="tx">Пароль у всех демо-аккаунтов: ${esc(demoInfo.password)}. Для проверки очереди откройте второй аккаунт в окне инкогнито.</div>
      <div class="row2">
        <button class="btn ghost" data-demo="${esc(t.email)}">Преподаватель</button>
        <button class="btn ghost" data-demo="${esc(st.email)}">Студент</button>
      </div>
    </div>`;
  box.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = async () => {
    authErr('');
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: b.dataset.demo, password: demoInfo.password } });
      S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; Live.start(); goHome();
    } catch (e) { authErr(e.message); }
  }));
}
function authErr(m) { const e = document.getElementById('autherr'); if (e) e.textContent = m; }
function goHome() { if (location.hash === '#/' || !location.hash) route(); else location.hash = '#/'; }
async function doLogin() {
  authErr('');
  try {
    const d = await api('/auth/login', { method: 'POST', body: { email: v('liEmail'), password: v('liPass') } });
    S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; Live.start(); goHome();
  } catch (e) { authErr(e.message); }
}
async function doRegister() {
  authErr('');
  try {
    const d = await api('/auth/register', {
      method: 'POST',
      body: {
        lastName: v('rLast'), firstName: v('rFirst'), middleName: v('rMid'),
        email: v('rEmail'), password: v('rPass'), role: authRole, group: authRole === 'student' ? v('rGroup') : '',
      },
    });
    S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; Live.start(); goHome();
  } catch (e) { authErr(e.message); }
}
function v(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

/* ============================ Главная (студент) ============================ */
async function viewHome() {
  stopPoll();
  if (S.user.role === 'teacher') return viewHomeT();
  app.innerHTML = `${headHTML()}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML('home')}`;
  bindHead();
  try {
    const d = await api('/student/dashboard');
    const ring = d.score == null
      ? ringSVG(null)
      : ringSVG(d.score);

    const srvs = [
      ['Рейтинг', 'star', '#/rating'], ['Расписание', 'calendar', '#/schedule'], ['Успеваемость', 'book', '#/grades'],
      ['Экзамен', 'clipboard', '#/exam'], ['AI-помощник', 'msg', '#/ai'], ['Посещаемость', 'clock', '#/stub/Посещаемость'],
      ['Общежитие', 'building', '#/stub/Общежитие'], ['Голосование', 'mic', '#/stub/Голосование'], ['Библиотека', 'chart', '#/stub/Библиотека'],
    ];

    document.getElementById('pagebody').innerHTML = `
      <div class="section-label">Виджеты</div>
      <div class="card scorecard">
        <div>
          <div class="stud-fio">${esc(S.user.fio)}</div>
          <div class="stud-group">${esc(d.group)}</div>
          <span class="pill">Общий балл за семестр</span>
        </div>
        <div class="ring-wrap">${ring}</div>
      </div>
      ${d.next ? `
      <div class="lesson">
        <div class="subj">${esc(d.next.subject)} (${esc(d.next.type)})</div>
        <div class="dt">${esc(d.next.date)}</div>
        <hr class="rule">
        <div class="row">Время: ${esc(d.next.time)}</div>
        <div class="row">Аудитория: ${esc(d.next.room)}</div>
        <div class="row">Преподаватель: ${esc(d.next.teacher)}</div>
        <div class="foot">${svg('info')} Следующее занятие в расписании</div>
      </div>` : `
      <div class="card" style="border-left:8px solid var(--accent)"><div class="next-empty">Ближайших занятий пока нет.<br>Преподаватель ещё не добавил расписание для группы ${esc(d.group)}.</div></div>`}
      <div class="section-label">Сервисы</div>
      <div class="srv-grid">
        ${srvs.map((s, i) => `<button class="srv" data-href="${s[2]}">${svg(s[1])}<span>${s[0]}</span></button>`).join('')}
      </div>
      <a class="news" href="https://ku.edu.kz/ru/" target="_blank" rel="noopener">
        <div class="tg">${svg('tg')}</div>
        <div style="flex:1">
          <b>Сайт Kozybayev University</b>
          <span>Новости, объявления и задания</span>
        </div>
        <div class="chev">${svg('chev')}</div>
      </a>`;
    document.querySelectorAll('.srv').forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
  } catch (e) {
    document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`;
  }
}
function ringSVG(score) {
  const r = 33, c = 2 * Math.PI * r;
  const val = score == null ? 0 : Math.max(0, Math.min(100, score));
  return `<svg width="84" height="84" viewBox="0 0 84 84">
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="8"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${(c * val) / 100} ${c}" transform="rotate(-90 42 42)"/>
    <text x="42" y="49" text-anchor="middle" class="ring-val ${score == null ? 'ring-val-null' : ''}">${score == null ? '—' : score}</text>
  </svg>`;
}
function bindHead() {
  const b = document.getElementById('bell');
  if (b) b.onclick = () => toast('Новых уведомлений нет');
  const p = document.getElementById('goProfile');
  if (p) p.onclick = () => { location.hash = '#/profile'; };
}

/* ============================ Главная (преподаватель) ============================ */
async function viewHomeT() {
  app.innerHTML = `${headHTML()}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML('home')}`;
  bindHead();
  try {
    const d = await api('/teacher/sessions');
    const totalWaiting = d.items.filter((s) => s.status !== 'closed').reduce((a, s) => a + s.waiting, 0);
    const soon = d.items.find((s) => s.status !== 'closed' && (s.waiting > 0 || s.called > 0)) || d.items.find((s) => s.status !== 'closed');
    const srvs = [
      ['Экзамен', 'clipboard', '#/t/queue'], ['Добавить занятие', 'calendar', '#/t/schedule'], ['Оценки', 'star', '#/t/grades'],
      ['Расписание', 'calendar', '#/schedule'], ['AI-помощник', 'msg', '#/ai'], ['Мои предметы', 'book', '#/t/queue'],
    ];
    document.getElementById('pagebody').innerHTML = `
      <div class="section-label">Виджеты</div>
      <div class="card scorecard">
        <div>
          <div class="stud-fio">${esc(S.user.fio)}</div>
          <div class="stud-group">Преподаватель</div>
          <span class="pill">Кабинет преподавателя</span>
        </div>
        <div class="ring-wrap" style="text-align:center">
          <div style="font-size:32px;font-weight:800;color:var(--accent-deep)">${totalWaiting}</div>
          <div class="tx">в очереди</div>
        </div>
      </div>
      ${soon ? `
      <div class="lesson">
        <div class="subj">${esc(soon.subject)}</div>
        <div class="dt">${esc(dstr(soon.date))}, ${esc(soon.time)}</div>
        <hr class="rule">
        <div class="row">Аудитория: ${esc(soon.room || '—')}${soon.group ? ' · Группа: ' + esc(soon.group) : ''}</div>
        <div class="row">${soon.calledFio ? 'Отвечает: ' + esc(soon.calledFio) : 'В очереди: ' + soon.waiting + ' студ.'}</div>
        <div class="foot">${svg('info')} Комната для спикинга</div>
      </div>` : `
      <div class="card" style="border-left:8px solid var(--accent)">
        <div class="next-empty">Активных зачётов пока нет.<br>Откройте комнату в разделе «Экзамен».</div>
      </div>`}
      <div class="section-label">Сервисы</div>
      <div class="srv-grid">
        ${srvs.map((s) => `<button class="srv" data-href="${s[2]}">${svg(s[1])}<span>${s[0]}</span></button>`).join('')}
      </div>`;
    document.querySelectorAll('.srv').forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
  } catch (e) {
    document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`;
  }
}

/* ============================ Расписание ============================ */
async function viewSchedule() {
  stopPoll();
  app.innerHTML = `${miniHead('Расписание')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const d = await api('/schedule');
    if (!d.items.length) {
      document.getElementById('pagebody').innerHTML = `<div class="card next-empty">Занятий пока нет.</div>`;
      return;
    }
    const byDay = {};
    d.items.forEach((r) => { (byDay[r.day] = byDay[r.day] || []).push(r); });
    const DOW = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    document.getElementById('pagebody').innerHTML = Object.keys(byDay).map((day) => `
      <div class="dayhead">${DOW[day]}</div>
      ${byDay[day].map((r) => `
      <div class="card lesson" style="margin-bottom:10px">
        <div class="subj">${esc(r.subject)} (${esc(r.type)})</div>
        <hr class="rule">
        <div class="row">Время: ${esc(r.start)} - ${esc(r.end)}</div>
        <div class="row">Аудитория: ${esc(r.room || '—')}</div>
        ${S.user.role === 'student' ? `<div class="row">Преподаватель: ${esc(r.teacher)}</div>` : `<div class="row">Группа: ${esc(r.group)}</div>`}
      </div>`).join('')}`).join('');
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}

/* ============================ Оценки / Рейтинг ============================ */
async function viewGrades() {
  stopPoll();
  app.innerHTML = `${miniHead('Успеваемость')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const d = await api('/grades');
    document.getElementById('pagebody').innerHTML = `
      <div class="card scorecard">
        <div>
          <div class="stud-fio">${d.avg == null ? 'Оценок пока нет' : 'Средний балл'}</div>
          <div class="stud-group">Общий балл за семестр</div>
        </div>
        <div class="ring-wrap">${ringSVG(d.avg)}</div>
      </div>
      <div class="card">
        ${d.items.length ? d.items.map((g) => `
          <div class="lstrow" style="cursor:default">
            <div>${esc(g.subject)}<div class="tx">${esc(g.teacher)} · ${esc(g.date)}</div></div>
            <div class="r" style="color:var(--accent-deep);font-weight:700">${g.score}</div>
          </div>`).join('') : '<div class="next-empty">Оценки появятся, когда преподаватель выставит их.</div>'}
      </div>`;
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
async function viewRating() {
  stopPoll();
  app.innerHTML = `${miniHead('Рейтинг')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const d = await api('/rating');
    document.getElementById('pagebody').innerHTML = `
      <div class="card"><div class="stud-fio">Группа ${esc(d.group)}</div>
      <div class="stud-group">${d.selfPos ? 'Вы на ' + d.selfPos + '-м месте из ' + d.rows.length : 'Пока нет оценок в группе'}</div></div>
      <div class="card">
        ${d.rows.length ? d.rows.map((r, i) => `
          <div class="lstrow ${r.id === S.user.id ? 'me' : ''}" style="cursor:default">
            <div>${i + 1}. ${esc(r.fio)}</div>
            <div class="r" style="color:var(--accent-deep);font-weight:700">${r.avg == null ? '—' : r.avg}</div>
          </div>`).join('') : '<div class="next-empty">В группе пока нет студентов.</div>'}
      </div>`;
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}

/* ============================ Экзамен: общее ============================ */
let META = null;
async function meta() {
  if (!META) META = await api('/queue/meta');
  return META;
}
function discList() { return META ? META.disciplines : []; }
function discShort(id) {
  const d = discList().find((x) => x.id === id);
  return d ? d.short : (META ? META.other.short : id);
}
function lvl(id) { return (META && META.levels.find((l) => l.id === id)) || { id, name: '—', cefr: '', hint: '' }; }
/* Подпись серьёзности: для английского добавляем CEFR */
function lvlLabel(level, disc) { const l = lvl(level); return l.name + (disc === 'english' && l.cefr ? ' · ' + l.cefr : ''); }
function lvlBadge(level, disc) { return `<span class="lvb lv${level}"><i></i>${esc(lvlLabel(level, disc))}</span>`; }
const ROOM_ST = { open: ['Открыта', 'st-open'], paused: ['Пауза', 'st-paused'], closed: ['Закрыта', 'st-closed'] };
function stBadge(st) { const x = ROOM_ST[st] || ['—', '']; return `<span class="stb ${x[1]}">${x[0]}</span>`; }
function minsAgo(ts) { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? 'только что' : m + ' мин назад'; }
function etaText(m) { return m == null ? '' : m < 60 ? `≈ ${m} мин` : `≈ ${Math.floor(m / 60)} ч ${m % 60} мин`; }
function lsGet(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { } }

/* Подписка текущего экрана на live-события; снимается в stopPoll() при смене экрана */
function onLive(fn) {
  const off = Live.on(fn);
  const prev = window.__unsub;
  window.__unsub = () => { off(); if (prev) prev(); };
}
/* Склейка частых событий в одну перерисовку */
function debounce(fn, ms) { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* -------- Таймер ответа -------- */
/* Часы клиента могут отставать/спешить: считаем время по серверу (поправка из serverNow в ответах API) */
let clockOff = 0;
function syncClock(serverNow) { if (serverNow) clockOff = serverNow - Date.now(); }
function nowS() { return Date.now() + clockOff; }
function mmss(sec) {
  const a = Math.abs(Math.floor(sec));
  return (sec < 0 ? '+' : '') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
}
/* Фаза ответа: run → warn (осталось ≤ warnSec) → over (лимит вышел) */
function answerPhase(startedAt, limitSec, warnSec) {
  const el = (nowS() - startedAt) / 1000;
  const left = limitSec - el;
  return { el, left, phase: left <= 0 ? 'over' : left <= warnSec ? 'warn' : 'run', pct: Math.min(100, (el / limitSec) * 100) };
}
/* Секундный тикер экрана; снимается вместе с подписками в stopPoll() */
function startTicker(fn) {
  const id = setInterval(fn, 1000);
  const prev = window.__unsub;
  window.__unsub = () => { clearInterval(id); if (prev) prev(); };
  fn();
}
function tone(freqs, gap) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    freqs.forEach((f, i) => {
      const t = i * (gap || 0.25), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => ctx.close(), 400 + freqs.length * 300);
  } catch { }
}

/*
 * Точка расширения раздела «Экзамен» (см. AGENTS.md, раздел «Модули очереди»).
 * Будущие модули — пробные тесты, задания по грамматике и вокабуляру, редактор заданий преподавателя —
 * регистрируются через registerQueueModule() и получают свою кнопку в разделе очереди и маршрут
 * #/exam/m/<id> (студент) или #/t/m/<id> (преподаватель). Пока реестр пуст, на сайте ничего не выводится.
 */
const QUEUE_MODULES = [];
function registerQueueModule(mod) {
  if (!mod || !/^[a-z][\w-]{1,30}$/.test(mod.id) || typeof mod.render !== 'function') throw new Error('queue module: нужны id и render()');
  if (QUEUE_MODULES.some((m) => m.id === mod.id)) return;
  QUEUE_MODULES.push(Object.assign({ roles: ['student', 'teacher'], disciplines: null, icon: 'book' }, mod));
}
function queueModulesFor(role, disc) {
  return QUEUE_MODULES.filter((m) => m.roles.includes(role) && (!m.disciplines || !disc || disc === 'all' || m.disciplines.includes(disc)));
}
function moduleBar(role, disc) {
  const list = queueModulesFor(role, disc);
  if (!list.length) return '';
  const base = role === 'teacher' ? '#/t/m/' : '#/exam/m/';
  return `<div class="modbar">${list.map((m) => `<a class="modbtn" href="${base}${m.id}${disc && disc !== 'all' ? '?d=' + encodeURIComponent(disc) : ''}">${svg(m.icon)}<span>${esc(m.title)}</span></a>`).join('')}</div>`;
}
async function viewQueueModule(role, id) {
  stopPoll();
  const mod = QUEUE_MODULES.find((m) => m.id === id && m.roles.includes(role));
  if (!mod) { location.hash = role === 'teacher' ? '#/t/queue' : '#/exam'; return; }
  const disc = (location.hash.split('?d=')[1] || '').split('&')[0] || null;
  app.innerHTML = `<a class="back" href="${role === 'teacher' ? '#/t/queue' : '#/exam'}">${svg('back')} Очередь</a><h1 class="ptitle">${esc(mod.title)}</h1><div id="pagebody"></div>${navHTML()}`;
  try { await meta(); } catch { }
  await mod.render(document.getElementById('pagebody'), {
    role, user: S.user, discipline: disc ? decodeURIComponent(disc) : null, meta: META,
    api, esc, svg, toast, onLive, lvlLabel, lvlBadge, discShort,
  });
}

/* -------- Live: SSE с одноразовым ticket, экспоненциальный реконнект, fallback на polling -------- */
const Live = {
  es: null, subs: new Set(), retry: 0, timer: null, poll: null, connected: false,
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); },
  emit(ev) { for (const fn of Array.from(this.subs)) { try { fn(ev); } catch (e) { console.error(e); } } },
  async start() {
    if (!S.token || this.es || typeof EventSource === 'undefined') { if (typeof EventSource === 'undefined') this.startPoll(); return; }
    clearTimeout(this.timer);
    let ticket;
    try { ticket = (await api('/events/ticket', { method: 'POST', body: {} })).ticket; }
    catch { return this.reconnect(); }
    if (!S.token) return;
    const es = new EventSource('/api/events?ticket=' + encodeURIComponent(ticket));
    this.es = es;
    es.onopen = () => { this.retry = 0; this.connected = true; this.stopPoll(); };
    es.onmessage = (m) => {
      let ev; try { ev = JSON.parse(m.data); } catch { return; }
      if (ev.type === 'hello') { this.emit({ type: 'resync' }); return; } // после реконнекта — догоняем пропущенное
      onGlobalEvent(ev);
      this.emit(ev);
    };
    // Ticket одноразовый, поэтому встроенный автореконнект EventSource не подходит — переподключаемся сами
    es.onerror = () => { es.close(); if (this.es === es) this.es = null; this.connected = false; this.reconnect(); };
  },
  reconnect() {
    if (!S.token) return;
    this.startPoll();
    const delay = Math.min(30000, 1000 * Math.pow(2, this.retry++));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.start(), delay);
  },
  startPoll() { if (!this.poll) this.poll = setInterval(() => this.emit({ type: 'tick' }), 5000); },
  stopPoll() { if (this.poll) { clearInterval(this.poll); this.poll = null; } },
  stop() {
    clearTimeout(this.timer); this.stopPoll(); this.retry = 0; this.connected = false;
    if (this.es) { this.es.close(); this.es = null; }
  },
};

/* -------- Глобальные уведомления студента (на любом экране) -------- */
function onGlobalEvent(ev) {
  if (!S.user || S.user.role !== 'student') return;
  if (ev.type === 'called') showCallAlert(ev);
  else if (ev.type === 'soon') {
    const txt = ev.pos === 1 ? 'Вы следующий' : 'Перед вами один человек';
    toast(`${txt}: ${ev.discipline}${ev.room ? ', ауд. ' + ev.room : ''}. Подготовьтесь`);
    tone([660, 880]);
    if (navigator.vibrate) navigator.vibrate(200);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(txt, { body: ev.discipline + (ev.room ? ' · ауд. ' + ev.room : ''), tag: 'ku-soon' }); } catch { }
    }
  }
  else if (ev.type === 'started') closeCallAlert();
  else if (ev.type === 'done') {
    closeCallAlert();
    toast((ev.score != null ? `Ответ принят. Балл: ${ev.score}` : 'Ответ принят') + (ev.comment ? `. Комментарий: ${ev.comment}` : ''));
  }
  else if (ev.type === 'absent') { closeCallAlert(); toast('Вас отметили как отсутствующего', true); }
  else if (ev.type === 'requeue') { closeCallAlert(); toast('Вас вернули в очередь'); }
  else if (ev.type === 'removed') { closeCallAlert(); toast('Преподаватель убрал вас из очереди', true); }
  else if (ev.type === 'cancelled') { closeCallAlert(); toast('Комната закрыта, запись отменена', true); }
}
let titleBlink = null;
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.28, 0.56].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.24);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { }
}
async function showCallAlert(ev) {
  try { await meta(); } catch { } // справочник уровней нужен для бейджа на любом экране
  closeCallAlert();
  const where = ev.room ? 'Аудитория ' + ev.room : 'Подойдите к преподавателю';
  const el = document.createElement('div');
  el.className = 'callov'; el.id = 'callov';
  el.innerHTML = `
    <div class="callbox lvbord${ev.level}">
      <div class="callpulse">${svg('bell')}</div>
      <div class="calltitle">Вас вызывают на спикинг</div>
      <div class="callsub">${esc(ev.discipline)}${ev.title ? ' · ' + esc(ev.title) : ''}</div>
      <div class="callroom">${esc(where)}</div>
      <div style="margin:10px 0 4px">${lvlBadge(ev.level, ev.disciplineId)}</div>
      <div class="tx">${esc(ev.teacher)}</div>
      <button class="btn pri big" id="callAck" style="margin-top:16px">Иду</button>
      <button class="btn ghost" id="callOpen" style="margin-top:8px">Открыть комнату</button>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('callAck').onclick = async () => {
    try { await api('/exam/queue/' + ev.entryId + '/ack', { method: 'POST', body: {} }); } catch (e) { toast(e.message, true); }
    closeCallAlert();
  };
  document.getElementById('callOpen').onclick = () => { closeCallAlert(); location.hash = '#/exam/' + ev.sessionId; };
  beep();
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification('Вас вызывают на спикинг', { body: `${ev.discipline} · ${where}`, tag: 'ku-call' }); } catch { }
  }
  const orig = document.title;
  let f = false;
  clearInterval(titleBlink);
  titleBlink = setInterval(() => { document.title = (f = !f) ? '● Вас вызывают' : orig; }, 900);
  el.dataset.title = orig;
}
function closeCallAlert() {
  const el = document.getElementById('callov');
  if (titleBlink) { clearInterval(titleBlink); titleBlink = null; }
  if (el) { if (el.dataset.title) document.title = el.dataset.title; el.remove(); }
}
function askNotify() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { });
}

/* ============================ Очередь: студент — вкладки предметов ============================ */
let qTab = null, qLevel = 0;
async function viewExamList(tab) {
  stopPoll();
  app.innerHTML = `${miniHead('Экзамен')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try { await meta(); } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  qTab = tab || qTab || lsGet('ku_qtab', 'english');
  qLevel = Number(lsGet('ku_qlvl', '0')) || 0;
  await paintExamList();
  const re = debounce(() => paintExamList(true), 250);
  onLive(() => re()); // любое событие (room/tick/resync/called…) — перечитываем список
}
async function paintExamList(silent) {
  const pb = document.getElementById('pagebody');
  if (!pb) return;
  let d;
  try {
    const qs = '?discipline=' + encodeURIComponent(qTab) + (qLevel ? '&level=' + qLevel : '');
    d = await api('/exam/sessions' + qs);
  } catch (e) { if (!silent) pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  const key = JSON.stringify([qTab, qLevel, d]);
  if (silent && pb.dataset.key === key) return;
  pb.dataset.key = key;

  const tabs = discList().slice();
  if (d.tabs.other || qTab === 'other') tabs.push(META.other);
  const scrollX = (document.getElementById('qtabs') || {}).scrollLeft || 0;

  pb.innerHTML = `
    ${d.my.length ? `<div class="mystrip">${d.my.map((m) => `
      <button class="mycard ${m.status === 'called' ? 'called' : ''}" data-open="${m.session.id}">
        <div class="mc-top">${esc(discShort(m.session.discipline))} ${lvlBadge(m.session.level, m.session.discipline)}</div>
        <div class="mc-big">${m.status === 'called' ? 'Вас вызвали' : '№ ' + m.pos}</div>
        <div class="tx">${m.status === 'called' ? (m.session.room ? 'Ауд. ' + esc(m.session.room) : 'Подойдите к преподавателю') : etaText(m.etaMin)}</div>
      </button>`).join('')}</div>` : ''}
    <div class="qtabs" id="qtabs" role="tablist">
      ${tabs.map((t) => {
        const c = d.tabs[t.id];
        return `<button role="tab" class="qtab ${t.id === qTab ? 'on' : ''}" data-tab="${t.id}" aria-selected="${t.id === qTab}">
          ${esc(t.short)}${c && c.open ? `<b class="qcnt">${c.open}</b>` : ''}</button>`;
      }).join('')}
    </div>
    <div class="lvfilter">
      <button class="lvf ${!qLevel ? 'on' : ''}" data-lv="0">Все уровни</button>
      ${META.levels.map((l) => `<button class="lvf lvf${l.id} ${qLevel === l.id ? 'on' : ''}" data-lv="${l.id}">${esc(lvlLabel(l.id, qTab))}</button>`).join('')}
    </div>
    <div class="qhead-row">
      <div class="qhead">${esc((tabs.find((t) => t.id === qTab) || {}).name || '')}</div>
      <a class="linkbtn" href="#/exam/results">${svg('star')}Мои результаты</a>
    </div>
    ${moduleBar('student', qTab)}
    ${d.items.length ? d.items.map((s) => roomCardStudent(s)).join('') : `
      <div class="card next-empty">${qLevel ? 'Нет комнат с такой серьёзностью.' : 'По этому предмету комнат пока нет.'}<br>Они появятся, когда преподаватель откроет комнату для спикинга.</div>`}`;

  const qt = document.getElementById('qtabs');
  qt.scrollLeft = scrollX;
  const act = qt.querySelector('.qtab.on');
  if (act && !silent) act.scrollIntoView({ inline: 'center', block: 'nearest' });
  qt.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    qTab = b.dataset.tab; lsSet('ku_qtab', qTab);
    history.replaceState(null, '', '#/exam/tab/' + qTab);
    paintExamList();
  }));
  pb.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => { qLevel = Number(b.dataset.lv); lsSet('ku_qlvl', String(qLevel)); paintExamList(); }));
  pb.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { location.hash = '#/exam/' + b.dataset.open; }));
}
function roomCardStudent(s) {
  const l = lvl(s.level);
  return `
    <button class="card room lvbord${s.level} ${s.status !== 'open' ? 'dim' : ''}" data-open="${s.id}">
      <div class="room-top">
        ${lvlBadge(s.level, s.discipline)} ${stBadge(s.status)}
        ${s.my ? `<span class="badge ok">${s.my.status === 'called' ? 'Вас вызвали' : 'Вы № ' + s.my.pos}</span>` : ''}
      </div>
      <div class="stud-fio" style="font-size:18px;margin-top:8px">${esc(s.title || s.subject)}</div>
      <div class="stud-group" style="margin:4px 0 6px">${esc(s.teacher)}</div>
      <div class="tx">${esc(l.hint)}</div>
      <div class="room-meta">
        ${mi('door', esc(s.room || '—'))}${mi('calendar', esc(dstr(s.date)) + ', ' + esc(s.time))}
        ${mi('users', s.waiting + (s.capacity ? '/' + s.capacity : ''))}
        ${s.status === 'open' && !s.my ? mi('clock', etaText(s.etaMin)) : ''}
      </div>
    </button>`;
}

/* ============================ Очередь: студент — комната ============================ */
let examSessionId = null;
async function viewExamDetail(id) {
  stopPoll();
  examSessionId = id;
  app.innerHTML = `${miniHead('Комната')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try { await meta(); } catch { }
  await renderExamDetail(id);
  const re = debounce(() => renderExamDetail(id, true), 200);
  onLive((ev) => { if (ev.type === 'tick' || ev.type === 'resync' || ev.sessionId === id) re(); });
  // Тикаем раз в 30 с, чтобы «вызвали N мин назад» и ETA не устаревали; таймеры ответа — каждую секунду
  window.__poll = setInterval(() => renderExamDetail(id, true, true), 30000);
  startTicker(tickStudentTimers);
}
async function renderExamDetail(id, silent, force) {
  let d;
  try { d = await api('/exam/sessions/' + id); }
  catch (e) { const pb = document.getElementById('pagebody'); if (pb && !silent) pb.innerHTML = `<div class="load">${esc(e.message)}</div><a class="back" style="justify-content:center;width:100%" href="#/exam">← К комнатам</a>`; return; }
  if (examSessionId !== id) return;
  const pb = document.getElementById('pagebody');
  if (!pb) return;
  syncClock(d.serverNow);
  const key = JSON.stringify(Object.assign({}, d, { serverNow: 0 }));
  if (silent && !force && pb.dataset.key === key) return;
  pb.dataset.key = key;
  const s = d.session, me = d.myEntry, l = lvl(s.level);
  const head = `
    <div class="card room lvbord${s.level}" style="cursor:default">
      <div class="room-top">${lvlBadge(s.level, s.discipline)} ${stBadge(s.status)}</div>
      <div class="stud-fio" style="font-size:20px;margin-top:8px">${esc(s.title || s.subject)}</div>
      <div class="stud-group" style="margin:4px 0 6px">${esc(s.disciplineName)} · ${esc(s.teacher)}</div>
      <div class="tx">${esc(l.hint)}</div>
      <div class="room-meta">${mi('door', esc(s.room || '—'))}${mi('calendar', esc(dstr(s.date)) + ', ' + esc(s.time))}${mi('users', d.waiting + (s.capacity ? '/' + s.capacity : ''))}</div>
    </div>`;
  const list = `
    <div class="card">
      ${d.calledNow.length ? `<div class="tx" style="margin-bottom:8px">Сейчас отвечают:</div>${d.calledNow.map((c) => `<div class="lstrow called ${c.me ? 'me' : ''}" style="cursor:default"><div>${esc(c.fio)} ${c.me ? '<b style="color:var(--accent)">(вы)</b>' : ''}</div><div class="r">${c.startedAt ? `отвечает <b data-el="${c.startedAt}">${mmss((nowS() - c.startedAt) / 1000)}</b>` : 'идёт к аудитории'}</div></div>`).join('')}` : ''}
      <div class="tx" style="margin:6px 0 10px">В очереди (${d.waiting}):</div>
      ${d.queue.length ? d.queue.map((q) => `<div class="lstrow ${q.me ? 'me' : ''}" style="cursor:default"><div>${q.pos}. ${esc(q.fio)} ${q.me ? '<b style="color:var(--accent)">(вы)</b>' : ''}</div><div class="r">${tm(q.ts)}</div></div>`).join('') : '<div class="tx">Очередь пуста.</div>'}
    </div>`;
  let main;
  if (me && me.status === 'called' && me.startedAt) {
    // Студент уже отвечает — показываем, сколько времени прошло и сколько осталось
    main = `
      <div class="card exhead">
        <div class="tx">Идёт ваш ответ</div>
        <div class="tclock" data-st="${me.startedAt}" data-lim="${me.limitSec}" data-warn="${s.warnSec}">${mmss((nowS() - me.startedAt) / 1000)}</div>
        <div class="progress tbar"><i data-bar style="width:0%"></i></div>
        <div class="qcap" data-left></div>
      </div>`;
  } else if (me && me.status === 'called') {
    main = `
      <div class="card exhead calledbox">
        <div class="qnum" style="font-size:30px">Вас вызвали</div>
        <div class="callroom">${s.room ? 'Аудитория ' + esc(s.room) : 'Подойдите к преподавателю'}</div>
        <div class="qcap">${minsAgo(me.calledAt)}${me.ackAt ? ' · вы подтвердили' : ''}</div>
        ${me.ackAt ? '' : '<button class="btn pri big" id="ackBtn">Иду</button>'}
      </div>`;
  } else if (me) {
    main = `
      <div class="card exhead">
        <div class="qnum">№ ${me.pos}</div>
        <div class="qcap">Ваша позиция · ожидание ${etaText(me.etaMin)}</div>
        <div class="progress"><i style="width:${Math.max(6, 100 - ((me.pos - 1) / Math.max(1, d.waiting)) * 100)}%"></i></div>
        ${s.status === 'paused' ? '<div class="tx" style="margin-top:10px;color:var(--yellow)">Преподаватель поставил комнату на паузу — ваше место сохранено.</div>' : ''}
        ${'Notification' in window && Notification.permission === 'default' ? '<button class="btn ghost" id="notifBtn" style="margin-top:12px">' + svg('bell') + 'Включить уведомления о вызове</button>' : ''}
      </div>`;
  } else if (s.status === 'open') {
    const full = s.capacity && d.waiting >= s.capacity;
    main = `
      <div style="margin:6px 14px 12px">
        <button class="btn pri big" id="joinBtn" ${full ? 'disabled' : ''}>${full ? 'Очередь заполнена' : 'Встать в очередь'}</button>
        <div class="tx" style="text-align:center;margin-top:8px">Примерное ожидание: ${etaText(d.etaNew)}</div>
      </div>`;
  } else {
    main = `<div class="card next-empty">${s.status === 'paused' ? 'Запись временно приостановлена преподавателем.' : 'Комната закрыта.'}</div>`;
  }
  pb.innerHTML = head + main + list + `
    ${me ? '<div style="margin:8px 14px"><button class="btn danger-ghost" id="leaveBtn">Выйти из очереди</button></div>' : ''}
    <a class="back" style="justify-content:center;width:100%" href="#/exam/tab/${esc(s.discipline)}">← К комнатам предмета</a>`;

  const jb = document.getElementById('joinBtn');
  if (jb) jb.onclick = async () => {
    askNotify();
    jb.disabled = true; jb.textContent = 'Записываем…';
    try {
      const r = await api('/exam/sessions/' + id + '/join', { method: 'POST', body: {} });
      toast(`Вы в очереди: № ${r.pos} (${etaText(r.etaMin)})`);
      await renderExamDetail(id, true, true);
    } catch (e) { toast(e.message, true); jb.disabled = false; jb.textContent = 'Встать в очередь'; }
  };
  const lb = document.getElementById('leaveBtn');
  if (lb) lb.onclick = async () => {
    if (!confirm('Выйти из очереди? Место будет потеряно.')) return;
    try { await api('/exam/queue/leave', { method: 'POST', body: { entryId: me.id } }); toast('Вы вышли из очереди'); renderExamDetail(id, true, true); }
    catch (e) { toast(e.message, true); }
  };
  const ab = document.getElementById('ackBtn');
  if (ab) ab.onclick = async () => {
    try { await api('/exam/queue/' + me.id + '/ack', { method: 'POST', body: {} }); closeCallAlert(); renderExamDetail(id, true, true); }
    catch (e) { toast(e.message, true); }
  };
  const nb = document.getElementById('notifBtn');
  if (nb) nb.onclick = () => { Notification.requestPermission().then(() => renderExamDetail(id, true, true)).catch(() => { }); };
  tickStudentTimers();
}
function tickStudentTimers() {
  document.querySelectorAll('[data-el]').forEach((el) => { el.textContent = mmss((nowS() - Number(el.dataset.el)) / 1000); });
  const c = document.querySelector('.tclock[data-st]');
  if (!c) return;
  const ph = answerPhase(Number(c.dataset.st), Number(c.dataset.lim), Number(c.dataset.warn));
  c.textContent = mmss(ph.el);
  c.className = 'tclock ph-' + ph.phase;
  const bar = document.querySelector('[data-bar]'); if (bar) { bar.style.width = ph.pct + '%'; bar.parentNode.className = 'progress tbar ph-' + ph.phase; }
  const left = document.querySelector('[data-left]');
  if (left) left.textContent = ph.left > 0 ? `Осталось ${mmss(ph.left)} из ${Math.round(Number(c.dataset.lim) / 60)} мин` : 'Время вышло, преподаватель скоро выставит оценку';
}

/* ============================ Очередь: студент — мои результаты ============================ */
async function viewMyResults() {
  stopPoll();
  app.innerHTML = `<a class="back" href="#/exam">${svg('back')} Очередь</a><h1 class="ptitle">Мои результаты</h1><div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try { await meta(); } catch { }
  const paint = async () => {
    const pb = document.getElementById('pagebody');
    if (!pb) return;
    let d;
    try { d = await api('/exam/my-results'); } catch (e) { pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
    const done = d.items.filter((x) => x.status === 'done');
    pb.innerHTML = `
      <div class="card scorecard">
        <div><div class="stud-fio">Спикинг</div><div class="stud-group">Сдано: ${done.length} · пропусков: ${d.items.length - done.length}</div><span class="pill">Средний балл за ответы</span></div>
        <div class="ring-wrap">${ringSVG(d.avg)}</div>
      </div>
      ${d.items.length ? d.items.map((r) => `
        <div class="card room lvbord${r.level}" style="cursor:default">
          <div class="room-top">${lvlBadge(r.level, r.discipline)}<span class="badge">${esc(discShort(r.discipline))}</span>
            ${r.status === 'done' ? (r.score != null ? `<span class="badge ok">${r.score} б.</span>` : '<span class="badge ok">Принят</span>') : '<span class="badge warn">Не пришёл</span>'}</div>
          <div class="room-title">${esc(r.title)}</div>
          <div class="room-sub">${esc(r.teacher)}</div>
          <div class="room-meta">${mi('calendar', new Date(r.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}${r.durSec ? mi('clock', mmss(r.durSec)) : ''}${r.room ? mi('door', esc(r.room)) : ''}</div>
          ${r.comment ? `<div class="fbk">${esc(r.comment)}</div>` : ''}
        </div>`).join('') : '<div class="card next-empty">Результатов пока нет. Они появятся после первого ответа.</div>'}`;
  };
  await paint();
  onLive((ev) => { if (ev.type === 'done' || ev.type === 'absent' || ev.type === 'resync') paint(); });
}

/* ============================ AI-помощник ============================ */
const AI_INIT = [{ role: 'assistant', content: 'Здравствуйте! Я помощник Kozybayev University 🎓\n\nМогу объяснить информацию из материалов университета: о программах обучения, стоимости, поступлении, общежитии и правилах. В ответе укажу источники.' }];
let aiHistory = null;
async function viewAI() {
  stopPoll();
  aiHistory = aiHistory ? AI_INIT.concat(aiHistory.slice(AI_INIT.length)) : AI_INIT.slice();
  app.innerHTML = `
    <div class="chatpage" style="height:100vh">
      <div class="chathead">
        <div class="avatar bird-avatar"><img src="/bird-idle.png" alt="" /></div>
        <div style="flex:1">
          <b>AI-помощник</b>
          <div class="st"><span class="dot" id="aidot"></span><span id="aist">уточняю статус…</span></div>
        </div>
        <a class="back" style="padding:0" href="#/">${svg('back')}</a>
      </div>
      <div class="chatbody" id="chatbody"><div class="chatwrap" id="chatwrap"></div></div>
      <div class="chatbar">
        <input class="inp" id="chatinp" placeholder="Задайте вопрос…" autocomplete="off">
        <button class="sendbtn" id="chatsend">${svg('send')}</button>
      </div>
    </div>`;
  paintChat();
  const body = document.getElementById('chatbody');
  body.scrollTop = body.scrollHeight;
  const inp = document.getElementById('chatinp');
  inp.onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };
  document.getElementById('chatsend').onclick = sendChat;
  api('/ai/status').then((st) => {
    const dot = document.getElementById('aidot'), stt = document.getElementById('aist');
    if (!dot) return;
    if (st.online) { dot.classList.add('on'); stt.textContent = 'Gemma подключена · база KU: ' + st.ctx + ' фрагментов'; }
    else stt.textContent = 'Gemma недоступна · проверьте соединение с LM Studio';
  }).catch(() => { });
}
function paintChat() {
  const w = document.getElementById('chatwrap');
  if (!w) return;
  w.innerHTML = aiHistory.map((m) =>
    `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}" style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'}">${esc(m.content)}${m.src ? `<div class="src">${esc(m.src)}</div>` : ''}</div>`
  ).join('');
}
async function sendChat() {
  const inp = document.getElementById('chatinp');
  if (!inp) return;
  const t = inp.value.trim();
  if (!t) return;
  inp.value = '';
  aiHistory.push({ role: 'user', content: t });
  const w = document.getElementById('chatwrap');
  w.insertAdjacentHTML('beforeend', `<div class="msg bot" id="typing"><span class="typing"><i></i><i></i><i></i></span></div>`);
  const body = document.getElementById('chatbody');
  body.scrollTop = body.scrollHeight;
  try {
    const r = await api('/ai/chat', { method: 'POST', body: { message: t, history: aiHistory.slice(-9) } });
    document.getElementById('typing') && document.getElementById('typing').remove();
    aiHistory.push({ role: 'assistant', content: r.reply, src: r.src });
  } catch (e) {
    document.getElementById('typing') && document.getElementById('typing').remove();
    aiHistory.push({ role: 'assistant', content: e.message });
  }
  paintChat();
  body.scrollTop = body.scrollHeight;
}

/* ============================ Очередь: преподаватель ============================ */
let tTab = 'all', tForm = { discipline: null, level: 2 };
async function viewTQueue() {
  stopPoll();
  app.innerHTML = `${miniHead('Экзамен')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try { await meta(); } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  tTab = lsGet('ku_ttab', 'all');
  if (!tForm.discipline) tForm.discipline = tTab !== 'all' ? tTab : 'english';
  const pb = document.getElementById('pagebody');
  pb.innerHTML = `
    <details class="card newroom" id="newRoom">
      <summary>${svg('plus')}Новая комната для спикинга</summary>
      <label class="lbl">Предмет (вкладка у студентов)</label>
      <div class="discgrid" id="nrDisc"></div>
      <label class="lbl">Серьёзность комнаты</label>
      <div class="lvpick" id="nrLevel"></div>
      <div class="tx" id="nrHint" style="margin:-2px 0 10px"></div>
      <label class="lbl">Тема / название (необяз.)</label>
      <input class="inp" id="nrTitle" maxlength="80" placeholder="Например: Speaking — Travel &amp; Tourism">
      <div class="row2">
        <div><label class="lbl">Аудитория</label><input class="inp" id="nrRoom" maxlength="40" placeholder="301"></div>
        <div><label class="lbl">Группа</label><input class="inp" id="nrGroup" maxlength="40" placeholder="для всех"></div>
      </div>
      <div class="row2">
        <div><label class="lbl">Дата</label><input class="inp" id="nrDate" type="date"></div>
        <div><label class="lbl">Время</label><input class="inp" id="nrTime" type="time"></div>
      </div>
      <div class="row2">
        <div><label class="lbl">Минут на ответ</label><input class="inp" id="nrSlot" type="number" min="1" max="60" value="7"></div>
        <div><label class="lbl">Предупредить за, сек</label><input class="inp" id="nrWarn" type="number" min="0" max="600" value="60"></div>
      </div>
      <label class="lbl">Лимит очереди (0 — без лимита)</label>
      <input class="inp" id="nrCap" type="number" min="0" max="500" value="0">
      <div class="tx" style="margin-bottom:10px">Пустые дата/время — комната открывается «сейчас».</div>
      <button class="btn pri" id="nrBtn">Открыть комнату</button>
    </details>
    <div class="qtabs" id="ttabs"></div>
    <div id="tModules"></div>
    <div id="tSessions"><div class="load">Загрузка…</div></div>`;
  paintNewRoomForm();
  document.getElementById('nrBtn').onclick = createRoom;
  await renderTList();
  const re = debounce(() => renderTList(true), 250);
  onLive(() => re());
}
function paintNewRoomForm() {
  const dg = document.getElementById('nrDisc');
  if (!dg) return;
  dg.innerHTML = discList().map((d) => `<button type="button" class="dchip ${tForm.discipline === d.id ? 'on' : ''}" data-d="${d.id}">${esc(d.short)}</button>`).join('');
  dg.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { tForm.discipline = b.dataset.d; paintNewRoomForm(); }));
  const lp = document.getElementById('nrLevel');
  lp.innerHTML = META.levels.map((l) => `<button type="button" class="lvopt lvopt${l.id} ${tForm.level === l.id ? 'on' : ''}" data-l="${l.id}">
      <b>${l.id}</b><span>${esc(lvlLabel(l.id, tForm.discipline))}</span></button>`).join('');
  lp.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { tForm.level = Number(b.dataset.l); paintNewRoomForm(); }));
  document.getElementById('nrHint').textContent = lvl(tForm.level).hint;
}
async function createRoom() {
  const btn = document.getElementById('nrBtn');
  btn.disabled = true;
  try {
    const r = await api('/teacher/sessions', {
      method: 'POST',
      body: {
        discipline: tForm.discipline, level: tForm.level, title: v('nrTitle'), room: v('nrRoom'), group: v('nrGroup'),
        date: v('nrDate'), time: v('nrTime'), slotMin: Number(v('nrSlot') || 7), warnSec: Number(v('nrWarn') || 60), capacity: Number(v('nrCap') || 0),
      },
    });
    toast('Комната открыта — студенты видят её во вкладке «' + discShort(tForm.discipline) + '»');
    location.hash = '#/t/room/' + r.id;
  } catch (e) { toast(e.message, true); btn.disabled = false; }
}
async function renderTList(silent) {
  const box = document.getElementById('tSessions');
  if (!box) return;
  let d;
  try { d = await api('/teacher/sessions'); } catch (e) { if (!silent) box.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  const key = JSON.stringify([tTab, d]);
  if (silent && box.dataset.key === key) return;
  box.dataset.key = key;
  const cnt = {};
  d.items.forEach((s) => { if (s.status !== 'closed') cnt[s.discipline] = (cnt[s.discipline] || 0) + 1; });
  const tabs = [{ id: 'all', short: 'Все' }].concat(discList());
  if (d.items.some((s) => s.discipline === 'other')) tabs.push(META.other);
  const tt = document.getElementById('ttabs');
  tt.innerHTML = tabs.map((t) => {
    const c = t.id === 'all' ? Object.values(cnt).reduce((a, b) => a + b, 0) : cnt[t.id];
    return `<button class="qtab ${tTab === t.id ? 'on' : ''}" data-tab="${t.id}">${esc(t.short)}${c ? `<b class="qcnt">${c}</b>` : ''}</button>`;
  }).join('');
  tt.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    tTab = b.dataset.tab; lsSet('ku_ttab', tTab);
    if (tTab !== 'all') { tForm.discipline = tTab; paintNewRoomForm(); }
    renderTList();
  }));
  const tm_ = document.getElementById('tModules');
  if (tm_) tm_.innerHTML = moduleBar('teacher', tTab); // модули очереди (AGENTS.md); пустой реестр — пусто
  const items = d.items.filter((s) => tTab === 'all' || s.discipline === tTab);
  box.innerHTML = items.length ? items.map((s) => `
    <button class="card room lvbord${s.level} ${s.status === 'closed' ? 'dim' : ''}" data-room="${s.id}">
      <div class="room-top">${lvlBadge(s.level, s.discipline)} ${stBadge(s.status)} <span class="badge">${esc(discShort(s.discipline))}</span></div>
      <div class="stud-fio" style="font-size:17.5px;margin-top:8px">${esc(s.title || s.subject)}</div>
      <div class="room-meta">${mi('door', esc(s.room || '—'))}${mi('calendar', esc(dstr(s.date)) + ', ' + esc(s.time))}${s.group ? mi('users', esc(s.group)) : ''}</div>
      <div class="room-meta"><span class="badge">${s.waiting} ждут</span>${s.called ? `<span class="badge warn">${s.called} вызван(о)</span>` : ''}<span class="badge ok">${s.done} принято</span></div>
      ${s.calledFio ? `<div class="tx" style="margin-top:6px">Отвечает: <b style="color:var(--accent)">${esc(s.calledFio)}</b></div>` : ''}
    </button>`).join('')
    : `<div class="card next-empty">${tTab === 'all' ? 'Комнат пока нет — откройте первую выше.' : 'По этому предмету комнат нет.'}</div>`;
  box.querySelectorAll('[data-room]').forEach((b) => (b.onclick = () => { location.hash = '#/t/room/' + b.dataset.room; }));
}

/* -------- Пульт комнаты: вызов, таймер ответа, приём с баллом, неявка, возврат, серьёзность -------- */
let tRoomId = null;
const tAlerted = {}; // entryId → последняя фаза, о которой уже предупредили (чтобы не повторять звук)
function tSoundOn() { return lsGet('ku_tsound', '1') === '1'; }
async function viewTRoom(id) {
  stopPoll();
  tRoomId = id;
  app.innerHTML = `<a class="back" href="#/t/queue">${svg('back')} Комнаты</a><h1 class="ptitle">Пульт комнаты</h1><div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try { await meta(); } catch { }
  await paintTRoom(id);
  const re = debounce(() => paintTRoom(id, true), 150);
  onLive((ev) => { if (ev.type === 'tick' || ev.type === 'resync' || ev.sessionId === id) re(); });
  window.__poll = setInterval(() => paintTRoom(id, true, true), 30000); // подписи «вызван N мин назад»
  startTicker(tickTeacherTimers);
}
/* Каждую секунду обновляем только цифры таймеров, без перерисовки страницы */
function tickTeacherTimers() {
  document.querySelectorAll('[data-el]').forEach((el) => { el.textContent = mmss((nowS() - Number(el.dataset.el)) / 1000); });
  document.querySelectorAll('.tcard[data-st]').forEach((card) => {
    const ph = answerPhase(Number(card.dataset.st), Number(card.dataset.lim), Number(card.dataset.warn));
    card.classList.remove('ph-run', 'ph-warn', 'ph-over');
    card.classList.add('ph-' + ph.phase);
    card.querySelector('[data-clock]').textContent = mmss(ph.el);
    card.querySelector('[data-bar]').style.width = ph.pct + '%';
    card.querySelector('[data-state]').textContent =
      ph.phase === 'over' ? `Время вышло ${mmss(-ph.left)} назад. Пора заканчивать и выставлять оценку`
        : ph.phase === 'warn' ? `Осталось ${mmss(ph.left)}. Пора подводить итог`
          : `Осталось ${mmss(ph.left)} из ${Math.round(Number(card.dataset.lim) / 60)} мин`;
    alertPhase(card.dataset.entry, ph.phase, card.dataset.fio);
  });
}
function alertPhase(entryId, phase, fio) {
  const prev = tAlerted[entryId];
  if (prev === phase || phase === 'run') { tAlerted[entryId] = phase; return; }
  tAlerted[entryId] = phase;
  if (phase === 'warn') {
    toast(`${fio}: осталось меньше минуты`);
    if (tSoundOn()) tone([740, 740]);
  } else if (phase === 'over') {
    toast(`${fio}: время вышло, пора выставить оценку`, true);
    if (tSoundOn()) tone([880, 660, 880, 660], 0.22);
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification('Время ответа вышло', { body: `${fio}: пора выставить оценку`, tag: 'ku-over-' + entryId }); } catch { }
    }
    const box = document.querySelector(`.tcard[data-entry="${entryId}"] .gradebox`);
    if (box) box.classList.add('attn');
  }
}
async function downloadCsv(id) {
  try {
    const r = await fetch('/api/teacher/sessions/' + id + '/export.csv', { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Не удалось выгрузить');
    const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'vedomost.csv';
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast(e.message, true); }
}
async function paintTRoom(id, silent, force) {
  const pb = document.getElementById('pagebody');
  if (!pb || tRoomId !== id) return;
  let d;
  try { d = await api('/teacher/sessions/' + id + '/queue'); }
  catch (e) { if (!silent) pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  syncClock(d.serverNow);
  const key = JSON.stringify(Object.assign({}, d, { serverNow: 0 }));
  if (silent && !force && pb.dataset.key === key) return;
  // Не перерисовываем, пока преподаватель вводит балл или комментарий — иначе потеряется ввод
  const ae = document.activeElement;
  if (silent && ae && pb.contains(ae) && ae.matches('input, textarea')) return;
  pb.dataset.key = key;
  const s = d.session;
  const closed = s.status === 'closed';
  const warnSec = s.warnSec != null ? s.warnSec : 60;
  const calledCard = (r) => `
    <div class="tcard ${r.startedAt ? 'ph-run' : 'ph-wait'}" data-entry="${r.id}" data-fio="${esc(r.fio)}"
      ${r.startedAt ? `data-st="${r.startedAt}" data-lim="${r.limitSec}" data-warn="${warnSec}"` : ''}>
      <div class="tcard-top">
        <div><b>${esc(r.fio)}</b><div class="tx">${esc(r.group)} · ${r.ackAt ? '<span style="color:var(--ok)">подтвердил вызов</span>' : 'не подтвердил вызов'}</div></div>
        <button class="abtn" data-rq="${r.id}" data-front="1" title="Вернуть в начало очереди" aria-label="Вернуть в начало очереди">${svg('undo')}</button>
      </div>
      ${r.startedAt ? `
        <div class="tclock" data-clock>00:00</div>
        <div class="progress tbar"><i data-bar style="width:0%"></i></div>
        <div class="tstate" data-state></div>
        <div class="trow">
          <button class="abtn" data-ext="${r.id}" data-sec="60">+1 мин</button>
          <button class="abtn" data-ext="${r.id}" data-sec="120">+2 мин</button>
          <span class="tx" style="margin-left:auto">лимит ${Math.round(r.limitSec / 60 * 10) / 10} мин</span>
        </div>` : `
        <div class="tx" style="margin:10px 0">Вызван <b data-el="${r.calledAt}">00:00</b> назад. Когда студент начнёт отвечать, запустите таймер.</div>
        <button class="btn pri" data-start="${r.id}">${svg('play')}Начать ответ</button>`}
      <div class="gradebox">
        <div class="row2">
          <input class="inp sc" data-sc="${r.id}" type="number" min="0" max="100" inputmode="numeric" placeholder="Балл 0–100">
          <button class="btn ok-btn" data-acc="${r.id}">Принять</button>
        </div>
        <textarea class="inp cm" data-cm="${r.id}" rows="2" maxlength="300" placeholder="Комментарий студенту (необязательно)"></textarea>
        <button class="btn danger-ghost slim" data-abs="${r.id}">Не пришёл</button>
      </div>
    </div>`;
  const waitRow = (r) => `
    <div class="lstrow" style="cursor:default">
      <div><b>${r.pos}.</b> ${esc(r.fio)}<div class="tx">${esc(r.group)} · в ${tm(r.ts)}</div></div>
      <div class="actrow">
        ${closed ? '' : `<button class="abtn" data-call="${r.id}">Вызвать</button>`}
        <button class="abtn bad" data-rm="${r.id}" title="Убрать из очереди" aria-label="Убрать из очереди">${svg('x')}</button>
      </div>
    </div>`;
  pb.innerHTML = `
    <div class="card room lvbord${s.level}" style="cursor:default">
      <div class="room-top">${lvlBadge(s.level, s.discipline)} ${stBadge(s.status)} <span class="badge">${esc(discShort(s.discipline))}</span></div>
      <div class="room-title">${esc(s.title || s.subject)}</div>
      <div class="room-meta">${mi('door', esc(s.room || '—'))}${mi('calendar', esc(dstr(s.date)) + ', ' + esc(s.time))}${s.group ? mi('users', esc(s.group)) : ''}${mi('clock', s.slotMin + ' мин на ответ')}</div>
      <div class="room-meta">
        <span class="badge">${d.waiting.length} ждут</span><span class="badge ok">${d.done.length} принято</span>
        ${d.absent.length ? `<span class="badge warn">${d.absent.length} не пришли</span>` : ''}
        <span class="badge">в среднем ${d.stats.avgMin} мин</span>
        ${d.stats.avgScore != null ? `<span class="badge">средний балл ${d.stats.avgScore}</span>` : ''}
      </div>
      ${closed ? '' : `
      <label class="lbl">Серьёзность — меняется на лету, студенты увидят сразу</label>
      <div class="lvpick" id="lvLive">${META.levels.map((l) => `<button class="lvopt lvopt${l.id} ${s.level === l.id ? 'on' : ''}" data-setlv="${l.id}"><b>${l.id}</b><span>${esc(lvlLabel(l.id, s.discipline))}</span></button>`).join('')}</div>`}
    </div>
    ${d.called.length ? `<div class="card"><div class="tx-head"><span>Сейчас отвечают</span>
      <button class="linkbtn" id="sndBtn">${svg(tSoundOn() ? 'speaker' : 'x')}Звук ${tSoundOn() ? 'вкл' : 'выкл'}</button></div>${d.called.map(calledCard).join('')}</div>` : ''}
    ${closed ? '' : `
    <div style="margin:0 14px 12px">
      <button class="btn pri big" id="callNext" ${d.waiting.length ? '' : 'disabled'}>${d.waiting.length ? svg('speaker') + 'Вызвать: ' + esc(d.waiting[0].fio.split(' ').slice(0, 2).join(' ')) : 'Очередь пуста'}</button>
      ${d.called.length && d.waiting.length ? '<div class="warn-note">Уже есть вызванный студент</div>' : ''}
    </div>`}
    <div class="card">
      <div class="tx" style="margin-bottom:8px">Очередь (${d.waiting.length}):</div>
      ${d.waiting.length ? d.waiting.map(waitRow).join('') : '<div class="tx">Пока никого.</div>'}
    </div>
    ${d.absent.length ? `<div class="card"><div class="tx" style="margin-bottom:8px">Не пришли (${d.absent.length}):</div>${d.absent.map((r) => `
      <div class="lstrow" style="cursor:default"><div>${esc(r.fio)}<div class="tx">${esc(r.group)}</div></div>
      ${closed ? '' : `<button class="abtn" data-rq="${r.id}">В очередь</button>`}</div>`).join('')}</div>` : ''}
    ${d.done.length ? `<div class="card"><div class="tx-head"><span>Принято (${d.done.length})</span>
      <button class="linkbtn" id="csvBtn">${svg('clipboard')}Ведомость CSV</button></div>${d.done.map((r) => `
      <div class="lstrow" style="cursor:default;align-items:flex-start"><div>${esc(r.fio)}<div class="tx">${esc(r.group)} · ${r.doneAt ? tm(r.doneAt) : ''}${r.durSec ? ' · ' + mmss(r.durSec) : ''}</div>
      ${r.comment ? `<div class="fbk sm">${esc(r.comment)}</div>` : ''}</div>
      <span class="badge ok">${r.score != null ? r.score + ' б.' : 'Принят'}</span></div>`).join('')}</div>` : ''}
    ${closed ? (d.done.length ? '' : '') : `
    <div class="card">
      <div class="row2">
        <div><label class="lbl">Аудитория</label><input class="inp" id="edRoom" value="${esc(s.room || '')}" maxlength="40"></div>
        <div><label class="lbl">Минут на ответ</label><input class="inp" id="edSlot" type="number" min="1" max="60" value="${s.slotMin}"></div>
      </div>
      <div class="row2">
        <div><label class="lbl">Предупредить за, сек</label><input class="inp" id="edWarn" type="number" min="0" max="600" value="${warnSec}"></div>
        <div><label class="lbl">Лимит очереди</label><input class="inp" id="edCap" type="number" min="0" max="500" value="${s.capacity}"></div>
      </div>
      <button class="btn ghost" id="edSave" style="margin-bottom:10px">Сохранить настройки</button>
      <div class="row2">
        <button class="btn ghost" id="pauseBtn">${s.status === 'paused' ? svg('play') + 'Возобновить' : svg('pause') + 'Пауза записи'}</button>
        <button class="btn danger-ghost" id="closeBtn">Закрыть комнату</button>
      </div>
    </div>`}`;

  const patch = async (body, msg) => {
    try { await api('/teacher/sessions/' + id, { method: 'PATCH', body }); if (msg) toast(msg); paintTRoom(id, true, true); }
    catch (e) { toast(e.message, true); }
  };
  const act = async (eid, action, body, msg) => {
    try { await api('/teacher/queue/' + eid + '/' + action, { method: 'POST', body: body || {} }); if (msg) toast(msg); paintTRoom(id, true, true); }
    catch (e) { toast(e.message, true); }
  };
  pb.querySelectorAll('[data-setlv]').forEach((b) => (b.onclick = () => {
    const lv = Number(b.dataset.setlv);
    if (lv !== s.level) patch({ level: lv }, 'Серьёзность: ' + lvlLabel(lv, s.discipline));
  }));
  const cn = document.getElementById('callNext');
  if (cn) cn.onclick = async () => {
    cn.disabled = true;
    askNotify();
    try { await api('/teacher/sessions/' + id + '/call-next', { method: 'POST', body: {} }); toast('Студент вызван — ему пришло уведомление'); }
    catch (e) { toast(e.message, true); }
    paintTRoom(id, true, true);
  };
  pb.querySelectorAll('[data-call]').forEach((b) => (b.onclick = () => act(b.dataset.call, 'call', {}, 'Студент вызван')));
  pb.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => act(b.dataset.start, 'start', {}, 'Таймер запущен')));
  pb.querySelectorAll('[data-ext]').forEach((b) => (b.onclick = () => {
    delete tAlerted[b.dataset.ext]; // после продления предупреждения сработают заново
    act(b.dataset.ext, 'extend', { sec: Number(b.dataset.sec) }, 'Время продлено');
  }));
  pb.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => {
    const eid = b.dataset.acc;
    const raw = (pb.querySelector('[data-sc="' + eid + '"]') || {}).value || '';
    const comment = ((pb.querySelector('[data-cm="' + eid + '"]') || {}).value || '').trim();
    const body = {};
    if (raw.trim() !== '') body.score = Number(raw);
    if (comment) body.comment = comment;
    b.blur();
    act(eid, 'accept', body, raw.trim() === '' ? 'Принят' : 'Принят, балл ' + raw + ' записан в успеваемость');
  }));
  pb.querySelectorAll('.sc').forEach((inp) => (inp.onkeydown = (e) => { if (e.key === 'Enter') pb.querySelector('[data-acc="' + inp.dataset.sc + '"]').click(); }));
  pb.querySelectorAll('[data-abs]').forEach((b) => (b.onclick = () => act(b.dataset.abs, 'absent', {}, 'Отмечен как отсутствующий')));
  pb.querySelectorAll('[data-rq]').forEach((b) => (b.onclick = () => act(b.dataset.rq, 'requeue', { front: !!b.dataset.front }, b.dataset.front ? 'Возвращён в начало очереди' : 'Возвращён в конец очереди')));
  pb.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (confirm('Убрать студента из очереди?')) act(b.dataset.rm, 'remove', {}, 'Убран из очереди'); }));
  const snd = document.getElementById('sndBtn');
  if (snd) snd.onclick = () => { lsSet('ku_tsound', tSoundOn() ? '0' : '1'); paintTRoom(id, true, true); };
  const csv = document.getElementById('csvBtn');
  if (csv) csv.onclick = () => downloadCsv(id);
  const es = document.getElementById('edSave');
  if (es) es.onclick = () => patch({ room: v('edRoom'), slotMin: Number(v('edSlot')), warnSec: Number(v('edWarn')), capacity: Number(v('edCap')) }, 'Сохранено');
  const pz = document.getElementById('pauseBtn');
  if (pz) pz.onclick = () => patch({ status: s.status === 'paused' ? 'open' : 'paused' }, s.status === 'paused' ? 'Запись возобновлена' : 'Запись на паузе — очередь сохранена');
  const cl = document.getElementById('closeBtn');
  if (cl) cl.onclick = () => {
    const n = d.waiting.length + d.called.length;
    if (confirm(n ? `Закрыть комнату? ${n} студ. в очереди получат отмену.` : 'Закрыть комнату?')) patch({ status: 'closed' }, 'Комната закрыта');
  };
  tickTeacherTimers();
}

/* --- преподаватель: расписание --- */
async function viewTSchedule() {
  stopPoll();
  app.innerHTML = `${miniHead('Добавить занятие')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    const pb = document.getElementById('pagebody');
    if (!subs.items.length) {
      pb.innerHTML = `<div class="card next-empty">Сначала откройте комнату в «Электронной очереди» — предмет создастся автоматически.</div>`;
      return;
    }
    pb.innerHTML = `
      <div class="card">
        <label class="lbl">Предмет</label>
        <select class="inp" id="scSubj">${subs.items.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <label class="lbl">Тип занятия</label>
        <select class="inp" id="scType"><option>Лек.</option><option>Практ.</option><option>Лаб.</option></select>
        <label class="lbl">Группа</label>
        <input class="inp" id="scGroup" placeholder="Например: ИСУ-26-2-а">
        <label class="lbl">День недели</label>
        <select class="inp" id="scDay">
          <option value="0">Понедельник</option><option value="1">Вторник</option><option value="2">Среда</option>
          <option value="3">Четверг</option><option value="4">Пятница</option><option value="5">Суббота</option>
        </select>
        <div class="row2">
          <div><label class="lbl">Начало</label><input class="inp" id="scStart" type="time"></div>
          <div><label class="lbl">Конец</label><input class="inp" id="scEnd" type="time"></div>
        </div>
        <label class="lbl">Аудитория</label>
        <input class="inp" id="scRoom" placeholder="119 (1/1)">
        <button class="btn pri" id="scBtn">Добавить занятие</button>
      </div>
      <div class="ptitle" style="padding:2px 0 10px">Мои занятия</div>
      <div id="scList"></div>`;
    document.getElementById('scBtn').onclick = async () => {
      try {
        await api('/teacher/schedule', {
          method: 'POST',
          body: { subjectId: v('scSubj'), type: v('scType'), group: v('scGroup'), day: Number(v('scDay')), startTime: v('scStart'), endTime: v('scEnd'), room: v('scRoom') },
        });
        toast('Занятие добавлено'); paintScList();
      } catch (e) { toast(e.message, true); }
    };
    paintScList();
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
async function paintScList() {
  const box = document.getElementById('scList');
  if (!box) return;
  const d = await api('/schedule').catch((e) => ({ items: [] }));
  box.innerHTML = d.items.length ? d.items.map((r) => `
    <div class="card" style="padding:14px"><div class="stud-fio" style="font-size:16px">${esc(r.subject)} (${esc(r.type)})</div>
    <div class="stud-group">${esc(r.dayName)} · ${esc(r.start)}-${esc(r.end)} · ауд. ${esc(r.room || '—')} · ${esc(r.group)}</div></div>`).join('')
    : '<div class="card next-empty">Занятий пока нет.</div>';
}

/* --- преподаватель: оценки --- */
async function viewTGrades() {
  stopPoll();
  app.innerHTML = `${miniHead('Выставить оценки')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    if (!subs.items.length) return (document.getElementById('pagebody').innerHTML = `<div class="card next-empty">Сначала откройте комнату в «Электронной очереди» — предмет создастся автоматически.</div>`);
    document.getElementById('pagebody').innerHTML = `
      <div class="card">
        <label class="lbl">Предмет</label>
        <select class="inp" id="gSubj">${subs.items.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <label class="lbl">Группа студентов</label>
        <div class="row2">
          <input class="inp" id="gGroup" placeholder="ИСУ-26-2-а" style="margin:0">
          <button class="btn ghost" id="gFind" style="max-width:120px">Найти</button>
        </div>
      </div>
      <div id="gStuds"></div>`;
    document.getElementById('gFind').onclick = findStudents;
    findStudents();
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
async function findStudents() {
  const g = v('gGroup');
  const d = await api('/teacher/students' + (g ? '?group=' + encodeURIComponent(g) : ''));
  const box = document.getElementById('gStuds');
  box.innerHTML = `<div class="ptitle" style="padding:2px 0 10px">Студенты (${d.items.length})</div>` + (d.items.length
    ? d.items.map((s) => `
      <div class="card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div><div style="font-size:15.5px">${esc(s.fio)}</div><div class="tx">${esc(s.group)}</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="inp small" style="margin:0;width:84px" placeholder="0-100" data-sc="${s.id}">
          <button class="badge" style="border:0;cursor:pointer;padding:9px 13px" data-put="${s.id}">Выставить</button>
        </div>
      </div>`).join('')
    : '<div class="card next-empty">Студентов такой группы нет.</div>');
  box.querySelectorAll('[data-put]').forEach((b) => (b.onclick = async () => {
    const sid = b.dataset.put;
    const val = box.querySelector('[data-sc="' + sid + '"]').value;
    try {
      await api('/teacher/grades', { method: 'POST', body: { studentId: sid, subjectId: v('gSubj'), score: Number(val) } });
      toast('Оценка выставлена'); b.textContent = '✓'; b.disabled = true;
    } catch (e) { toast(e.message, true); }
  }));
}

/* ============================ Профиль ============================ */
function viewProfile() {
  stopPoll();
  const u = S.user;
  app.innerHTML = `
    ${miniHead('Профиль')}
    <div class="card profcard">
      <div class="avatar">${esc(u.firstName.charAt(0).toUpperCase())}</div>
      <div>
        <div class="pf-fio">${esc(u.fio)}</div>
        <div class="pf-sub">${u.role === 'teacher' ? 'Преподаватель' : 'Студент'}${u.group ? ' · ' + esc(u.group) : ''}</div>
        <div class="pf-sub">${esc(u.email)}</div>
      </div>
    </div>
    ${u.role === 'teacher' ? `<a class="card lstrow" style="display:flex" href="#/t/queue"><div>📋 Экзамен</div><div class="chev">${svg('chev')}</div></a>` : `<a class="card lstrow" style="display:flex" href="#/exam"><div>📝 Экзамен</div><div class="chev">${svg('chev')}</div></a>`}
    <a class="card lstrow" style="display:flex" href="#/ai"><div>🤖 AI-помощник</div><div class="chev">${svg('chev')}</div></a>
    <div style="margin:10px 14px"><button class="btn danger-ghost" id="outBtn">Выйти из аккаунта</button></div>
    <div class="tx" style="text-align:center;margin-top:14px">KU Portal v1.0 · Kozybayev University</div>
    ${navHTML('profile')}`;
  document.getElementById('outBtn').onclick = async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { }
    Live.stop(); closeCallAlert(); localStorage.removeItem('ku_token'); S.token = null; S.user = null; aiHistory = null; goHome();
  };
}

/* ============================ Заглушки ============================ */
function viewStub(name) {
  app.innerHTML = `
    ${miniHead(name)}
    <div class="stub">${svg('building')}<b>${esc(name)}</b>Раздел в разработке.<br>Скоро здесь появятся сервисы университета.</div>
    ${navHTML()}`;
}

/* ============================ Роутер ============================ */
function route() {
  stopPoll();
  if (!S.user) return viewAuth();
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  switch (parts[0]) {
    case undefined: return viewHome();
    case 'schedule': return viewSchedule();
    case 'grades': return S.user.role === 'teacher' ? viewTGrades() : viewGrades();
    case 'rating': return viewRating();
    case 'exam':
      if (S.user.role === 'teacher') return viewTQueue();
      if (parts[1] === 'tab') return viewExamList(parts[2]);
      if (parts[1] === 'results') return viewMyResults();
      if (parts[1] === 'm' && parts[2]) return viewQueueModule('student', parts[2].split('?')[0]);
      return parts[1] ? viewExamDetail(parts[1]) : viewExamList();
    case 'ai': return viewAI();
    case 't':
      if (S.user.role !== 'teacher') return viewHome();
      if (parts[1] === 'room' && parts[2]) return viewTRoom(parts[2]);
      if (parts[1] === 'm' && parts[2]) return viewQueueModule('teacher', parts[2].split('?')[0]);
      return parts[1] === 'schedule' ? viewTSchedule() : parts[1] === 'grades' ? viewTGrades() : viewTQueue();
    case 'profile': return viewProfile();
    case 'stub': return viewStub(parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : '');
    default: return viewHome();
  }
}
window.addEventListener('hashchange', route);
(async function init() {
  if (S.token) {
    try { S.user = (await api('/me')).user; Live.start(); }
    catch { S.token = null; localStorage.removeItem('ku_token'); }
  }
  if (!location.hash) location.hash = '#/';
  route();
})();
