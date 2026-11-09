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
};
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
function stopPoll() { if (window.__poll) { clearInterval(window.__poll); window.__poll = null; } }
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
  if (r.status === 401 && S.token) { S.token = null; localStorage.removeItem('ku_token'); S.user = null; route(); throw new Error('Сессия истекла'); }
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
    <div class="mark">${svg('logo')}</div>
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
      <div class="mark">${svg('logo')}</div>
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
  </div>`;
  renderAuthForm();
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
function authErr(m) { const e = document.getElementById('autherr'); if (e) e.textContent = m; }
function goHome() { if (location.hash === '#/' || !location.hash) route(); else location.hash = '#/'; }
async function doLogin() {
  authErr('');
  try {
    const d = await api('/auth/login', { method: 'POST', body: { email: v('liEmail'), password: v('liPass') } });
    S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; goHome();
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
    S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; goHome();
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
      ['Запись на зачёт', 'clipboard', '#/exam'], ['AI-помощник', 'msg', '#/ai'], ['Посещаемость', 'clock', '#/stub/Посещаемость'],
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
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="#3d372a" stroke-width="9"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--yellow)" stroke-width="9" stroke-linecap="round"
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
    const totalWaiting = d.items.reduce((a, s) => a + s.waiting, 0);
    const soon = d.items.find((s) => s.waiting > 0) || d.items[0];
    const srvs = [
      ['Зачёты (очередь)', 'clipboard', '#/t/queue'], ['Добавить занятие', 'calendar', '#/t/schedule'], ['Оценки', 'star', '#/t/grades'],
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
          <div style="font-size:34px;font-weight:800;color:var(--accent)">${totalWaiting}</div>
          <div class="tx">в очереди</div>
        </div>
      </div>
      ${soon ? `
      <div class="lesson">
        <div class="subj">${esc(soon.subject)}</div>
        <div class="dt">${esc(dstr(soon.date))}, ${esc(soon.time)}</div>
        <hr class="rule">
        <div class="row">Аудитория: ${esc(soon.room || '—')}${soon.group ? ' · Группа: ' + esc(soon.group) : ''}</div>
        <div class="row">${soon.now ? 'Сейчас на зачёте: ' + esc(soon.now) : 'В очереди: ' + soon.waiting + ' студ.'}</div>
        <div class="foot">${svg('info')} Ближайший зачёт</div>
      </div>` : `
      <div class="card" style="border-left:8px solid var(--accent)">
        <div class="next-empty">Активных зачётов пока нет.<br>Создайте первый в разделе «Зачёты».</div>
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
            <div class="r" style="color:var(--yellow);font-weight:700">${g.score}</div>
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
            <div class="r" style="color:var(--yellow);font-weight:700">${r.avg == null ? '—' : r.avg}</div>
          </div>`).join('') : '<div class="next-empty">В группе пока нет студентов.</div>'}
      </div>`;
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}

/* ============================ Запись на зачёт ============================ */
async function viewExamList() {
  stopPoll();
  app.innerHTML = `${miniHead('Запись на зачёт')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const d = await api('/exam/sessions');
    document.getElementById('pagebody').innerHTML =
      `<div class="ptitle" style="padding:0 0 12px">Доступные зачёты</div>` + (
        d.items.length
          ? d.items.map((s) => `
        <button class="card" style="width:calc(100% - 28px);text-align:left;cursor:pointer;border:0" data-id="${s.id}">
          <div class="stud-fio" style="font-size:18px">${esc(s.subject)}</div>
          <div class="stud-group">${esc(s.teacher)}</div>
          <div class="tx" style="margin-top:4px">📅 ${esc(dstr(s.date))} · ${esc(s.time)}${s.room ? ' · ауд. ' + esc(s.room) : ''}</div>
          <div class="row2" style="margin-top:10px">
            <span class="badge">В очереди: ${s.waiting}</span>
            ${s.mine ? '<span class="badge" style="background:rgba(76,175,80,.18);color:#7bd47b">Записаны ✓</span>' : ''}
          </div>
        </button>`).join('')
          : `<div class="card next-empty">Пока нет доступных зачётов.<br>Они появятся, когда преподаватель создаст запись.</div>`
      );
    document.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => { location.hash = '#/exam/' + b.dataset.id; }));
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}

let examSessionId = null;
async function viewExamDetail(id) {
  stopPoll();
  examSessionId = id;
  window.__examSnap = window.__examSnap || {};
  window.__examSnap[id] = null;
  app.innerHTML = `${miniHead('Запись на зачёт')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  await renderExamDetail(id);
  window.__poll = setInterval(async () => {
    if (location.hash.startsWith('#/exam/') && examSessionId) await renderExamDetail(examSessionId, true);
  }, 2800);
}
async function renderExamDetail(id, silent) {
  let d;
  try { d = await api('/exam/sessions/' + id); }
  catch (e) { const pb = document.getElementById('pagebody'); if (pb && !silent) pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  if (examSessionId !== id) return;
  window.__examSnap = window.__examSnap || {};
  const key = JSON.stringify([d.session, d.waiting, d.myEntry, d.queue]);
  if (silent && window.__examSnap[id] === key) return; // нет изменений — не трогаем DOM
  window.__examSnap[id] = key;
  const pb = document.getElementById('pagebody');
  if (!pb) return;
  if (d.myEntry) {
    pb.innerHTML = `
      <div class="card exhead">
        <div class="stud-fio" style="font-size:19px">${esc(d.session.subject)}</div>
        <div class="stud-group">${esc(d.session.teacher)}</div>
        <div class="tx">📅 ${esc(dstr(d.session.date))} · ${esc(d.session.time)}${d.session.room ? ' · ауд. ' + esc(d.session.room) : ''}</div>
        <div class="qnum">№ ${d.myEntry.pos}</div>
        <div class="qcap">Ваша позиция в очереди · всего в очереди: ${d.waiting}</div>
      </div>
      <div class="card">
        <div class="tx" style="margin-bottom:10px">Кто в очереди:</div>
        ${d.queue.map((q) => `<div class="lstrow ${q.me ? 'me' : ''}" style="cursor:default"><div>${q.pos}. ${esc(q.fio)} ${q.me ? '<b style="color:var(--accent)">(вы)</b>' : ''}</div><div class="r">${tm(q.ts)}</div></div>`).join('')}
      </div>
      <div style="margin:8px 14px">
        <button class="btn danger-ghost" id="leaveBtn">Отменить запись</button>
      </div>`;
    document.getElementById('leaveBtn').onclick = async () => {
      try { await api('/exam/queue/leave', { method: 'POST', body: { entryId: d.myEntry.id } }); toast('Вы отменили запись'); renderExamDetail(id, true); }
      catch (e) { toast(e.message, true); }
    };
  } else {
    pb.innerHTML = `
      <div class="card">
        <div class="stud-fio" style="font-size:21px">${esc(d.session.subject)}</div>
        <div class="stud-group">${esc(d.session.teacher)}</div>
        <hr class="rule">
        <div class="row" style="color:#d5d7da;font-size:15.5px;line-height:1.8">
          📅 Дата: ${esc(dstr(d.session.date))}<br>
          🕘 Время: ${esc(d.session.time)}<br>
          🚪 Аудитория: ${esc(d.session.room || '—')}<br>
          👥 В очереди сейчас: ${d.waiting}
        </div>
      </div>
      <div style="margin:6px 14px">
        <button class="btn pri big" id="joinBtn">Записаться</button>
      </div>
      <a class="back" style="justify-content:center;width:100%" href="#/exam">← К списку зачётов</a>`;
    const btn = document.getElementById('joinBtn');
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Записываем…';
      try {
        const r = await api('/exam/sessions/' + id + '/join', { method: 'POST', body: {} });
        toast('Вы записаны! Вы ' + r.pos + '-й в очереди');
        await renderExamDetail(id, true);
      } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Записаться'; }
    };
  }
}

/* ============================ AI-помощник ============================ */
const AI_INIT = [{ role: 'assistant', content: 'Здравствуйте! Я AI-помощник Kozybayev University 🎓\n\nСпрашивайте что-нибудь о вузе: поступление, специальности, общежитие, расписание и т.д. Информацию беру с официального сайта ku.edu.kz.' }];
let aiHistory = null;
async function viewAI() {
  stopPoll();
  aiHistory = aiHistory ? AI_INIT.concat(aiHistory.slice(AI_INIT.length)) : AI_INIT.slice();
  app.innerHTML = `
    <div class="chatpage" style="height:100vh">
      <div class="chathead">
        <div class="avatar">${svg('msg')}</div>
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
    if (st.online) { dot.classList.add('on'); stt.textContent = 'модель: ' + st.model; }
    else stt.textContent = 'модель не найдена, режим поиска по сайту';
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

/* ============================ Панель преподавателя ============================ */
async function viewTQueue() {
  stopPoll();
  app.innerHTML = `${miniHead('Зачёты и очередь')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    renderTQueue(subs.items);
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
function renderTQueue(subjects) {
  const pb = document.getElementById('pagebody');
  if (!pb) return;
  pb.innerHTML = `
    <div class="card">
      <div class="stud-fio" style="font-size:17px;margin-bottom:8px">Новый зачёт</div>
      ${subjects.length ? `
      <label class="lbl">Предмет</label>
      <select class="inp" id="nsSubj">${subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : `
      <div class="tx" style="margin-bottom:8px">Сначала добавьте предмет:</div>
      <input class="inp" id="newSubj" placeholder="Например: Политология">`}
      <div class="row2">
        <div><label class="lbl">Дата</label><input class="inp" id="nsDate" type="date"></div>
        <div><label class="lbl">Время</label><input class="inp" id="nsTime" type="time"></div>
      </div>
      <div class="row2">
        <div><label class="lbl">Аудитория</label><input class="inp" id="nsRoom" placeholder="301"></div>
        <div><label class="lbl">Группа (необяз.)</label><input class="inp" id="nsGroup" placeholder="для всех"></div>
      </div>
      <button class="btn pri" id="nsBtn">${subjects.length ? 'Создать зачёт' : 'Добавить предмет и создать'}</button>
    </div>
    <div class="ptitle" style="padding:2px 0 10px">Мои зачёты</div>
    <div id="tSessions"><div class="load">Загрузка…</div></div>`;
  const nsBtn = document.getElementById('nsBtn');
  nsBtn.onclick = async () => {
    nsBtn.disabled = true;
    try {
      if (!subjects.length) {
        const name = v('newSubj');
        if (name.length < 2) throw new Error('Введите название предмета');
        await api('/teacher/subjects', { method: 'POST', body: { name } });
        toast('Предмет "' + name + '" добавлен — выберите его и заполните дату/время');
        nsBtn.disabled = false;
        return viewTQueue();
      }
      await api('/teacher/sessions', {
        method: 'POST',
        body: { subjectId: v('nsSubj'), date: v('nsDate'), time: v('nsTime'), room: v('nsRoom'), group: v('nsGroup') },
      });
      toast('Зачёт создан');
      await renderTList();
      nsBtn.disabled = false;
    } catch (e) { toast(e.message, true); nsBtn.disabled = false; }
  };
  renderTList();
}
async function renderTList() {
  const box = document.getElementById('tSessions');
  if (!box) return;
  try {
    const d = await api('/teacher/sessions');
    box.innerHTML = d.items.length ? d.items.map((s) => `
      <div class="card" style="padding:16px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div>
            <div class="stud-fio" style="font-size:17.5px">${esc(s.subject)}</div>
            <div class="stud-group">${esc(dstr(s.date))} · ${esc(s.time)}${s.room ? ' · ауд. ' + esc(s.room) : ''}${s.group ? ' · ' + esc(s.group) : ''}</div>
          </div>
          <span class="badge">${s.waiting} в очереди</span>
        </div>
        <div class="row2" style="margin-top:8px">
          <button class="btn ghost" data-q="${s.id}">${s.now ? 'Сейчас: ' + esc(s.now.slice(0, 22)) : 'Открыть очередь'}</button>
        </div>
        <div id="qd_${s.id}"></div>
      </div>`).join('')
      : `<div class="card next-empty">Зачётов пока нет — создайте первый выше.</div>`;
    box.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => toggleTQueue(b.dataset.q, b)));
  } catch (e) { box.innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
let openQ = null;
async function toggleTQueue(sid, btn) {
  if (openQ === sid) {
    document.getElementById('qd_' + sid) && (document.getElementById('qd_' + sid).innerHTML = '');
    openQ = null; btn.textContent = 'Открыть очередь'; stopPoll(); return;
  }
  document.querySelectorAll('[id^=qd_]').forEach((x) => (x.innerHTML = ''));
  window.__tqSnap = window.__tqSnap || {};
  window.__tqSnap[sid] = null;
  openQ = sid;
  const box = document.getElementById('qd_' + sid);
  box.innerHTML = '<div class="load">Загрузка…</div>';
  await paintTQueue(sid);
  if (window.__poll) clearInterval(window.__poll);
  window.__poll = setInterval(async () => { if (openQ === sid) paintTQueue(sid); }, 3000);
}
async function paintTQueue(sid) {
  const box = document.getElementById('qd_' + sid);
  if (!box) return;
  let d;
  try { d = await api('/teacher/sessions/' + sid + '/queue'); }
  catch (e) { box.innerHTML = `<div class="tx" style="color:var(--danger)">${esc(e.message)}</div>`; return; }
  window.__tqSnap = window.__tqSnap || {};
  const key = JSON.stringify([d.session, d.waiting, d.done]);
  if (window.__tqSnap[sid] === key) return; // без изменений не обновляем
  window.__tqSnap[sid] = key;
  const row = (r, waiting) => `
    <div class="lstrow"><div><b>${waiting ? r.pos + '. ' : ''}</b>${esc(r.fio)}<div class="tx">${esc(r.group)} · в ${tm(r.ts)}</div></div>
    ${waiting ? `<button class="badge" style="border:0;cursor:pointer;padding:8px 14px;font-size:13px" data-acc="${r.id}">Принять ✓</button>` : '<span class="badge" style="background:rgba(76,175,80,.18);color:#7bd47b">Принят</span>'}</div>`;
  box.innerHTML = `
    <div class="tqcont" style="margin-top:10px">
      ${d.now && 0 ? '' : ''}
      ${d.waiting.length ? `<div class="stud-group" style="margin:4px 0 8px">Сейчас на зачёте: <b style="color:var(--accent)">${esc(d.waiting[0].fio)}</b></div>` : '<div class="tx" style="margin:6px 0">Очередь пуста.</div>'}
      ${d.waiting.map((r) => row(r, true)).join('')}
      ${d.done.length ? `<div class="stud-group" style="margin:10px 0 6px"> Принято сегодня: ${d.done.length}</div>${d.done.map((r) => row(r, false)).join('')}` : ''}
    </div>`;
  box.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = async () => {
    try { await api('/teacher/queue/' + b.dataset.acc + '/accept', { method: 'POST', body: {} }); paintTQueue(sid); }
    catch (e) { toast(e.message, true); }
  }));
}

/* --- преподаватель: расписание --- */
async function viewTSchedule() {
  stopPoll();
  app.innerHTML = `${miniHead('Добавить занятие')}<div id="pagebody"><div class="load">Загрузка…</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    const pb = document.getElementById('pagebody');
    if (!subs.items.length) {
      pb.innerHTML = `<div class="card next-empty">Сначала добавьте предмет в разделе «Зачёты».</div>`;
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
    if (!subs.items.length) return (document.getElementById('pagebody').innerHTML = `<div class="card next-empty">Сначала добавьте предмет в разделе «Зачёты».</div>`);
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
    ${u.role === 'teacher' ? `<a class="card lstrow" style="display:flex" href="#/t/queue"><div>📋 Мои зачёты и очередь</div><div class="chev">${svg('chev')}</div></a>` : `<a class="card lstrow" style="display:flex" href="#/exam"><div>📝 Запись на зачёт</div><div class="chev">${svg('chev')}</div></a>`}
    <a class="card lstrow" style="display:flex" href="#/ai"><div>🤖 AI-помощник</div><div class="chev">${svg('chev')}</div></a>
    <div style="margin:10px 14px"><button class="btn danger-ghost" id="outBtn">Выйти из аккаунта</button></div>
    <div class="tx" style="text-align:center;margin-top:14px">KU Portal v1.0 · Kozybayev University</div>
    ${navHTML('profile')}`;
  document.getElementById('outBtn').onclick = async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { }
    localStorage.removeItem('ku_token'); S.token = null; S.user = null; aiHistory = null; goHome();
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
    case 'exam': return parts[1] ? viewExamDetail(parts[1]) : viewExamList();
    case 'ai': return viewAI();
    case 't': return parts[1] === 'schedule' ? viewTSchedule() : parts[1] === 'grades' ? viewTGrades() : viewTQueue();
    case 'profile': return viewProfile();
    case 'stub': return viewStub(parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : '');
    default: return viewHome();
  }
}
window.addEventListener('hashchange', route);
(async function init() {
  if (S.token) {
    try { S.user = (await api('/me')).user; }
    catch { S.token = null; localStorage.removeItem('ku_token'); }
  }
  if (!location.hash) location.hash = '#/';
  route();
})();
