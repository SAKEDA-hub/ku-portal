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
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.4 7.4 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
  shield: '<path d="M12 3.2 5 6v5.6c0 4.3 3 7.9 7 9.2 4-1.3 7-4.9 7-9.2V6z"/><path d="m9 12 2.2 2.2L15.3 10"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.3 2.4 3.4 5.3 3.4 8.6s-1.1 6.2-3.4 8.6c-2.3-2.4-3.4-5.3-3.4-8.6s1.1-6.2 3.4-8.6z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.6 1.8-1.6h2c2.2 0 3.9-1.7 3.9-3.9 0-3.9-3.8-7-8.5-7z"/><circle cx="7.6" cy="11.3" r="1.1"/><circle cx="10.4" cy="7.6" r="1.1"/><circle cx="15" cy="7.9" r="1.1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.3 10.5V7.8a3.7 3.7 0 0 1 7.4 0v2.7"/>',
  eye: '<path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  help: '<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9M12 16.6v.01"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  moon: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
  device: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7M12 16v4"/>',
  type: '<path d="M4.5 6.5v-2h15v2M12 4.5v15M9 19.5h6"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2c.1.8.7 1.3 1.5 1.3h6.2c.8 0 1.4-.5 1.5-1.3L17.5 7"/>',
  cap: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v4.2c2.9 2.3 8.1 2.3 11 0v-4.2M21.5 9.5v5"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
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
  if (r.status === 401 && S.token) { S.token = null; localStorage.removeItem('ku_token'); S.user = null; route(); throw new Error('Сессия истекла'); }
  const j = await r.json().catch(() => ({ error: 'Ошибка сервера' }));
  if (!r.ok) throw new Error(j.error || 'Ошибка сервера');
  return j;
}

/* ------------------------- Программа, цвета и тема ------------------------- */
/* У пользователя есть программа: Kozybayev University или международная программа University of Arizona.
   Цвет сайта по умолчанию («Авто») берётся из программы; в «Настройках» можно выбрать другой цвет
   и режим — светлый / тёмный / как в системе. На <html>: data-palette (палитра) и data-mode="dark".
   Онлайн-экзамен получает цвет программы (inCampus / «Международный кампус») и выбранный режим, см. examLaunchUrl(). */
const PROGRAMS = {
  ku: { id: 'ku', name: 'Kozybayev University', short: 'Kozybayev University', icon: 'logo', palette: 'ku', examTheme: 'incampus' },
  arizona: { id: 'arizona', name: 'University of Arizona', short: 'University of Arizona · международная программа', icon: 'cap', palette: 'arizona', examTheme: 'intl' },
};
const programOf = (u) => PROGRAMS[(u && u.program) || 'ku'] || PROGRAMS.ku;
const PALETTES = {
  ku: { name: 'Kozybayev', color: '#05a4ba' },
  arizona: { name: 'Arizona', color: '#0C234B' },
  emerald: { name: 'Изумрудный', color: '#1f9d6b' },
  violet: { name: 'Фиолетовый', color: '#6d4bd8' },
  coral: { name: 'Коралловый', color: '#e0603f' },
  graphite: { name: 'Графит', color: '#3f4a56' },
};
const MODES = { light: 'Светлая', dark: 'Тёмная', system: 'Как в системе' };

/* Настройки хранятся в браузере отдельно для каждого пользователя */
const PREF_DEFAULTS = {
  palette: 'auto', mode: 'light', fontSize: 'md', reduceMotion: false, compact: false,
  notifPush: true, notifGrades: true, notifSchedule: true, notifExam: true, notifEmail: false, notifSound: true,
  twoFactor: false, showInRating: true, showOnline: true, loginAlerts: true,
};
const prefsKey = () => 'ku_prefs:' + (S.user ? S.user.id : 'guest');
function getPrefs() {
  try { return Object.assign({}, PREF_DEFAULTS, JSON.parse(localStorage.getItem(prefsKey()) || '{}')); } catch { return Object.assign({}, PREF_DEFAULTS); }
}
function setPref(key, val) {
  const p = getPrefs(); p[key] = val;
  try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch { }
  if (key === 'palette' || key === 'mode' || key === 'fontSize' || key === 'compact' || key === 'reduceMotion') applyTheme();
}
const sysDark = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
const FONT_SIZES = ['sm', 'md', 'lg', 'xl'];
function resolvedTheme() {
  if (!S.user) return { palette: 'ku', dark: false, fs: 'md' };
  const p = getPrefs();
  const palette = p.palette === 'auto' || !PALETTES[p.palette] ? programOf(S.user).palette : p.palette;
  const dark = p.mode === 'dark' || (p.mode === 'system' && sysDark());
  const fs = FONT_SIZES.includes(p.fontSize) ? p.fontSize : 'md';
  return { palette, dark, mode: p.mode, fs, compact: !!p.compact, still: !!p.reduceMotion };
}
function applyTheme() {
  const t = resolvedTheme();
  const root = document.documentElement;
  if (t.palette !== 'ku') root.dataset.palette = t.palette; else delete root.dataset.palette;
  if (t.dark) root.dataset.mode = 'dark'; else delete root.dataset.mode;
  // размер текста (--fs в style.css), компактный режим и «меньше анимации»
  if (t.fs !== 'md') root.dataset.fs = t.fs; else delete root.dataset.fs;
  if (t.compact) root.dataset.compact = ''; else delete root.dataset.compact;
  if (t.still) root.dataset.still = ''; else delete root.dataset.still;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.dark ? '#15181c' : PALETTES[t.palette].color;
  // для скрипта в index.html: применить тему до загрузки app.js, без «мигания»
  try { if (S.user) localStorage.setItem('ku_theme', JSON.stringify({ palette: t.palette, mode: t.mode, fs: t.fs, compact: t.compact, still: t.still })); else localStorage.removeItem('ku_theme'); } catch { }
}
if (window.matchMedia) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onSys = () => { if (S.user && getPrefs().mode === 'system') applyTheme(); };
  if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
}

/* ------------------------------ Общие блоки ------------------------------ */
function navHTML(active) {
  const it = (href, key, icon, label) => `<a href="${href}" class="${active === key ? 'on' : ''}"><span class="ic">${svg(icon)}</span>${label}</a>`;
  return `<nav class="bnav">
    <span class="bnav-brand">${svg(programOf(S.user).icon)}<b>KU Portal</b></span>
    ${it('#/', 'home', 'home', 'Главная')}
    ${it('#/exam', 'exam', 'clipboard', 'Экзамен')}
    ${it('#/profile', 'profile', 'user', 'Кабинет')}
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
    <div class="mark">${svg(programOf(u).icon)}</div>
    <div class="uname">${esc(programOf(u).name)}</div>
  </div>`;
}
function miniHead(title) {
  return `<a class="back" href="#/">${svg('back')} Назад</a><h1 class="ptitle">${esc(title)}</h1>`;
}

/* ============================ Аутентификация ============================ */
let authTab = 'login', authRole = 'student', authProgram = 'ku';
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
      <label class="lbl">Программа</label>
      <div class="chips">
        <button class="chip ${authProgram === 'ku' ? 'on' : ''}" id="chKU">Kozybayev University</button>
        <button class="chip ${authProgram === 'arizona' ? 'on' : ''}" id="chAZ">University of Arizona</button>
      </div>
      <div id="grpWrap">${authRole === 'student' ? '<input class="inp" id="rGroup" placeholder="Группа (например: ИСУ-26-2-а)"><label class="lbl">Оценки и расписание появятся, когда преподаватель добавит их для вашей группы</label>' : ''}</div>
      <button class="btn pri" id="rBtn">Создать аккаунт</button>`;
    document.getElementById('chStud').onclick = () => { authRole = 'student'; renderAuthForm(); };
    document.getElementById('chTeach').onclick = () => { authRole = 'teacher'; renderAuthForm(); };
    // Выбор программы — без перерисовки формы, чтобы не стереть введённые поля
    const pickProgram = (pr) => {
      authProgram = pr;
      document.getElementById('chKU').classList.toggle('on', pr === 'ku');
      document.getElementById('chAZ').classList.toggle('on', pr === 'arizona');
    };
    document.getElementById('chKU').onclick = () => pickProgram('ku');
    document.getElementById('chAZ').onclick = () => pickProgram('arizona');
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
      <div class="tx">Пароль у всех демо-аккаунтов: ${esc(demoInfo.password)}. Преподаватель — международная программа University of Arizona, студент — Kozybayev University.</div>
      <div class="row2">
        <button class="btn ghost" data-demo="${esc(t.email)}">Преподаватель<small class="demo-pr">${esc(programOf(t).name)}</small></button>
        <button class="btn ghost" data-demo="${esc(st.email)}">Студент<small class="demo-pr">${esc(programOf(st).name)}</small></button>
      </div>
    </div>`;
  box.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = async () => {
    authErr('');
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: b.dataset.demo, password: demoInfo.password } });
      S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; goHome();
    } catch (e) { authErr(e.message); }
  }));
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
        email: v('rEmail'), password: v('rPass'), role: authRole, program: authProgram, group: authRole === 'student' ? v('rGroup') : '',
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
  app.innerHTML = `${headHTML()}<div id="pagebody" class="dash"><div class="load">Загрузка…</div></div>${navHTML('home')}`;
  bindHead();
  try {
    const d = await api('/student/dashboard');
    const ring = d.score == null
      ? ringSVG(null)
      : ringSVG(d.score);

    const srvs = [
      // «Экзамен» здесь не дублируем — он есть в главном меню
      ['Рейтинг', 'star', '#/rating'], ['Расписание', 'calendar', '#/schedule'], ['Успеваемость', 'book', '#/grades'],
      ['AI-помощник', 'msg', '#/ai'], ['Посещаемость', 'clock', '#/stub/Посещаемость'],
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
  app.innerHTML = `${headHTML()}<div id="pagebody" class="dash"><div class="load">Загрузка…</div></div>${navHTML('home')}`;
  bindHead();
  try {
    const d = await api('/teacher/subjects');
    const srvs = [
      // «Экзамен» — в главном меню и в карточке выше; «Мои предметы» вели туда же, что и «Оценки»
      ['Добавить занятие', 'plus', '#/t/schedule'], ['Оценки', 'star', '#/t/grades'],
      ['Расписание', 'calendar', '#/schedule'], ['AI-помощник', 'msg', '#/ai'],
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
          <div style="font-size:calc(32px * var(--fs));font-weight:800;color:var(--accent-deep)">${d.items.length}</div>
          <div class="tx">предметов</div>
        </div>
      </div>
      <a class="lesson" href="#/exam" style="display:block;color:inherit">
        <div class="subj">Онлайн-экзамен</div>
        <div class="dt">Тесты, writing, speaking и ведомость</div>
        <hr class="rule">
        <div class="row">Создавайте тесты и открывайте комнаты экзамена для групп</div>
        <div class="foot">${svg('info')} Раздел «Экзамен»</div>
      </a>
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

/* ============================ Экзамен → Онлайн-экзамен ============================ */
/*
 * Раздел «Экзамен» — вход в сервис «Онлайн-экзамен» (github.com/StephCurrysvg/exam-sync),
 * встроенный в этот же сервер по адресу /exam-sync/ (exam-sync/handler.js).
 * Сайт экзаменов показывает кнопку «KU Portal» для возврата сюда (параметры from/back).
 */
const EXAM_SYNC_PATH = '/exam-sync/';
I.monitor = '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7M12 16v4"/><path d="m9.2 10.4 1.9 1.9 3.8-3.9"/>';
I.external = '<path d="M13.5 4.5h6v6"/><path d="M19.5 4.5 11 13"/><path d="M17.5 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h4.5"/>';
const EXAM_FEATURES = {
  student: [
    ['clipboard', 'Тесты онлайн', 'Grammar, vocabulary и другие тесты с таймером — прогресс сохраняется, если закрыть вкладку.'],
    ['book', 'Writing', 'Письменная часть экзамена прямо в браузере, черновик не потеряется.'],
    ['mic', 'Speaking-очередь', 'Комнаты экзамена с очередью на устную часть и live-обновлениями.'],
    ['star', 'Результаты', 'Баллы по частям экзамена и разбор ответов.'],
  ],
  teacher: [
    ['plus', 'Редактор тестов', 'Создание тестов с разными типами вопросов, импорт и экспорт.'],
    ['door', 'Комнаты экзамена', 'Собираете экзамен из тестов, writing и speaking, открываете комнату группе.'],
    ['users', 'Speaking-очередь', 'Вызов студентов, таймер ответа, оценка устной части.'],
    ['chart', 'Ведомость', 'Сводные баллы студентов по всем частям экзамена.'],
  ],
};
function examLaunchUrl() {
  const u = new URL(EXAM_SYNC_PATH, location.origin);
  u.searchParams.set('from', 'ku-portal');
  u.searchParams.set('back', location.origin + '/#/exam');
  u.searchParams.set('theme', programOf(S.user).examTheme); // цвета экзамена — по программе пользователя
  const m = getPrefs().mode; if (m !== 'light') u.searchParams.set('mode', m); // светлая — исходный вид экзамена; тёмная/системная — передаём
  return u.href;
}
function examTransition(href) {
  const ov = document.createElement('div');
  ov.className = 'oe-ov';
  ov.setAttribute('role', 'status');
  ov.setAttribute('aria-live', 'polite');
  ov.innerHTML = `
    <div class="oe-ov-in">
      <div class="oe-bridge"><span class="oe-app ku">${svg(programOf(S.user).icon)}</span><span class="oe-track"><i></i></span><span class="oe-app ex">${svg('monitor')}</span></div>
      <div class="oe-ov-t">Открываем онлайн-экзамен…</div>
      <div class="oe-ov-s">Переходим в сервис экзаменов</div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  const reduced = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || getPrefs().reduceMotion;
  setTimeout(() => { location.href = href; }, reduced ? 50 : 900);
  // Вернулись кнопкой «Назад» из bfcache — убрать оверлей
  window.addEventListener('pageshow', function h(e) { if (e.persisted) { ov.remove(); window.removeEventListener('pageshow', h); } });
}
function viewExam() {
  stopPoll();
  const teacher = S.user.role === 'teacher';
  const href = examLaunchUrl();
  app.innerHTML = `${miniHead('Экзамен')}<div id="pagebody">
    <div class="card oe-hero">
      <div class="oe-bridge sm" aria-hidden="true"><span class="oe-app ku">${svg(programOf(S.user).icon)}</span><span class="oe-track"><i></i></span><span class="oe-app ex">${svg('monitor')}</span></div>
      <div class="oe-kicker">Сервис экзаменов</div>
      <div class="oe-title">Онлайн-экзамен</div>
      <div class="tx oe-lead">${teacher
        ? 'Отдельный сайт для проведения письменных экзаменов: тесты, writing, speaking и ведомость в одном месте.'
        : 'Отдельный сайт для сдачи экзамена онлайн: тесты, writing и запись на speaking в одном месте.'}</div>
      <div class="oe-status" id="oeStatus"><i></i><span>Проверяем доступность сайта…</span></div>
      <a class="btn pri oe-go" id="oeGo" href="${esc(href)}">${svg('monitor')}Перейти к онлайн-экзамену</a>
      <a class="btn ghost oe-new" href="${esc(href)}" target="_blank" rel="noopener">${svg('external')}Открыть в новой вкладке</a>
    </div>
    <div class="oe-feat">
      ${EXAM_FEATURES[teacher ? 'teacher' : 'student'].map(([ic, t, d]) => `
        <div class="card oe-fi"><span class="oe-fic">${svg(ic)}</span><div><b>${esc(t)}</b><div class="tx">${esc(d)}</div></div></div>`).join('')}
    </div>
    <div class="card oe-note">
      <span class="oe-fic">${svg('info')}</span>
      <div class="tx"><b>Вход на сайте экзаменов отдельный.</b> Используйте логин и пароль, которые выдал преподаватель.
        Вернуться в портал можно кнопкой «KU Portal» в верхней панели сайта экзаменов.</div>
    </div>
  </div>${navHTML('exam')}`;

  const st = document.getElementById('oeStatus');
  const setSt = (cls, text) => { if (!st.isConnected) return; st.className = 'oe-status ' + cls; st.querySelector('span').textContent = text; };
  fetch(EXAM_SYNC_PATH + 'api/state', { method: 'HEAD', cache: 'no-store' })
    .then((r) => setSt(r.ok ? 'ok' : 'bad', r.ok ? 'Сайт доступен' : 'Сайт экзаменов временно недоступен'))
    .catch(() => setSt('bad', 'Не удалось связаться с сайтом экзаменов'));

  document.getElementById('oeGo').addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // открыть в новой вкладке — как обычно
    e.preventDefault();
    examTransition(href);
  });
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
    <div class="card" style="padding:14px"><div class="stud-fio" style="font-size:calc(16px * var(--fs))">${esc(r.subject)} (${esc(r.type)})</div>
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
        <div><div style="font-size:calc(15.5px * var(--fs))">${esc(s.fio)}</div><div class="tx">${esc(s.group)}</div></div>
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

/* ============================ Личный кабинет = профиль + все настройки ============================ */
/* Один экран: слева (на ноутбуке) карточка профиля и оглавление разделов, справа — разделы настроек.
   На телефоне оглавление — прокручиваемая строка чипов над разделами.
   Работают: «Оформление» (тема, цвет, размер текста, компактный режим, меньше анимации) и язык.
   Остальные переключатели только запоминаются в браузере — разделы помечены «в разработке». */
const CAB_SECTIONS = [
  ['appearance', 'palette', 'Оформление'],
  ['language', 'globe', 'Язык и регион'],
  ['notifications', 'bell', 'Уведомления'],
  ['security', 'shield', 'Безопасность'],
  ['privacy', 'eye', 'Конфиденциальность'],
  ['account', 'user', 'Аккаунт'],
];
function swRow(key, icon, title, sub) {
  const on = !!getPrefs()[key];
  return `<div class="set-row"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${title}</b>${sub ? `<span class="tx">${sub}</span>` : ''}</div>
    <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(title)}" data-sw="${key}"><i></i></button></div>`;
}
function linkRow(icon, title, sub, act, cls) {
  return `<button class="set-row link ${cls || ''}" data-act="${act}"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${title}</b>${sub ? `<span class="tx">${sub}</span>` : ''}</div><span class="chev">${svg('chev')}</span></button>`;
}
function segRow(key, icon, title, opts, cur) {
  if (cur === undefined) cur = getPrefs()[key];
  return `<div class="set-row wrap"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${title}</b></div>
    <div class="seg2 txt" role="radiogroup" aria-label="${esc(title)}">${opts.map(([v, l]) => `<button role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-seg="${key}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}
function modePreview(m, cur) {
  return `<button class="mode-card ${cur === m ? 'on' : ''}" data-mode="${m}" role="radio" aria-checked="${cur === m}">
    <span class="mp mp-${m}"><i></i><i></i><i></i></span>
    <span class="mc-l">${svg(m === 'light' ? 'sun' : m === 'dark' ? 'moon' : 'device')}${MODES[m]}</span></button>`;
}
function secHead(id, title, soon) {
  const ic = CAB_SECTIONS.find((s) => s[0] === id)[1];
  return `<h2>${svg(ic)}${title}${soon ? '<span class="soon">в разработке</span>' : ''}</h2>`;
}
function viewProfile(section) {
  stopPoll();
  const u = S.user, p = getPrefs(), pr = programOf(u);
  const autoName = PALETTES[pr.palette].name;
  app.innerHTML = `
    ${miniHead('Личный кабинет')}
    <div id="pagebody" class="cab">
      <aside class="cab-side">
        <div class="card profcard">
          <div class="avatar">${esc(u.firstName.charAt(0).toUpperCase())}</div>
          <div class="pf-main">
            <div class="pf-fio">${esc(u.fio)}</div>
            <div class="pf-sub">${u.role === 'teacher' ? 'Преподаватель' : 'Студент'}${u.group ? ' · ' + esc(u.group) : ''}</div>
            <div class="pf-sub pf-mail">${esc(u.email)}</div>
            <span class="pill pf-uni">${svg(pr.icon)}${esc(pr.name)}</span>
          </div>
        </div>
        <nav class="cab-nav" aria-label="Разделы настроек">
          ${CAB_SECTIONS.map(([id, ic, title]) => `<a href="#/profile/${id}" data-sec="${id}">${svg(ic)}<span>${title}</span></a>`).join('')}
        </nav>
      </aside>
      <div class="cab-main">
        <section class="card set-sec" id="set-appearance">
          ${secHead('appearance', 'Оформление')}
          <div class="set-lbl">Тема</div>
          <div class="mode-cards" role="radiogroup" aria-label="Тема">${['light', 'dark', 'system'].map((m) => modePreview(m, p.mode)).join('')}</div>
          <div class="set-lbl">Цвет сайта</div>
          <div class="swatches" role="radiogroup" aria-label="Цвет сайта">
            <button class="swatch auto ${p.palette === 'auto' ? 'on' : ''}" data-pal="auto" role="radio" aria-checked="${p.palette === 'auto'}" title="Авто · ${esc(autoName)}" style="--sw:${PALETTES[pr.palette].color}"><i></i><span>Авто</span></button>
            ${Object.entries(PALETTES).map(([id, x]) => `<button class="swatch ${p.palette === id ? 'on' : ''}" data-pal="${id}" role="radio" aria-checked="${p.palette === id}" title="${esc(x.name)}" style="--sw:${x.color}"><i></i><span>${esc(x.name)}</span></button>`).join('')}
          </div>
          <div class="tx set-note">«Авто» — цвет вашей программы (${esc(pr.name)}). Тема и цвет применяются и в онлайн-экзамене.</div>
          ${segRow('fontSize', 'type', 'Размер текста', [['sm', 'Мелкий'], ['md', 'Обычный'], ['lg', 'Крупный'], ['xl', 'Очень крупный']])}
          ${swRow('compact', 'device', 'Компактный режим', 'Плотнее карточки и списки')}
          ${swRow('reduceMotion', 'play', 'Меньше анимации', 'Отключить плавные переходы')}
        </section>

        <section class="card set-sec" id="set-language">
          ${secHead('language', 'Язык и регион')}
          ${segRow('lang', 'globe', 'Язык интерфейса', [['ru', 'Русский'], ['kk', 'Қазақша'], ['en', 'English']])}
          <div class="set-row"><span class="sr-ic">${svg('clock')}</span><div class="sr-t"><b>Часовой пояс</b><span class="tx">Астана, Костанай (UTC+5)</span></div></div>
          <div class="set-row"><span class="sr-ic">${svg('calendar')}</span><div class="sr-t"><b>Начало недели</b><span class="tx">Понедельник</span></div></div>
        </section>

        <section class="card set-sec" id="set-notifications">
          ${secHead('notifications', 'Уведомления', true)}
          ${swRow('notifPush', 'bell', 'Push-уведомления', 'На телефоне и в браузере')}
          ${swRow('notifGrades', 'star', 'Новые оценки', 'Когда преподаватель выставит балл')}
          ${swRow('notifSchedule', 'calendar', 'Изменения в расписании', 'Перенос и отмена занятий')}
          ${swRow('notifExam', 'clipboard', 'Экзамены', 'Напоминание за день и за час')}
          ${swRow('notifSound', 'speaker', 'Звук', 'Звуковой сигнал уведомлений')}
          ${swRow('notifEmail', 'send', 'Email-рассылка', esc(u.email))}
        </section>

        <section class="card set-sec" id="set-security">
          ${secHead('security', 'Безопасность', true)}
          ${linkRow('lock', 'Сменить пароль', 'Последнее изменение: при регистрации', 'soon')}
          ${swRow('twoFactor', 'shield', 'Двухфакторная аутентификация', 'Код подтверждения при входе')}
          ${swRow('loginAlerts', 'bell', 'Оповещать о новом входе', 'Письмо при входе с нового устройства')}
          ${linkRow('device', 'Активные сеансы', 'Это устройство · сейчас', 'soon')}
        </section>

        <section class="card set-sec" id="set-privacy">
          ${secHead('privacy', 'Конфиденциальность', true)}
          ${swRow('showInRating', 'chart', 'Показывать меня в рейтинге группы', 'Одногруппники видят ваше место')}
          ${swRow('showOnline', 'users', 'Статус «в сети»', 'Видно преподавателям и группе')}
          ${linkRow('download', 'Скачать мои данные', 'Оценки, расписание, профиль', 'soon')}
        </section>

        <section class="card set-sec" id="set-account">
          ${secHead('account', 'Аккаунт')}
          ${linkRow('info', 'О приложении', 'KU Portal v1.2', 'about')}
          ${linkRow('trash', 'Удалить аккаунт', 'Обратитесь в деканат', 'soon', 'danger')}
          <button class="btn danger-ghost cab-out" id="outBtn">Выйти из аккаунта</button>
        </section>
      </div>
    </div>
    ${navHTML('profile')}`;

  const pb = document.getElementById('pagebody');
  const rerender = () => { const y = window.scrollY; viewProfile(); window.scrollTo(0, y); };
  pb.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { setPref('mode', b.dataset.mode); rerender(); }));
  pb.querySelectorAll('[data-pal]').forEach((b) => (b.onclick = () => { setPref('palette', b.dataset.pal); rerender(); }));
  pb.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { setPref(b.dataset.seg, b.dataset.v); rerender(); }));
  pb.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = () => {
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
    setPref(b.dataset.sw, on);
  }));
  pb.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'about') toast('KU Portal v1.2 · ' + pr.name);
    else toast('Скоро будет доступно');
  }));
  // оглавление: плавный переход к разделу без перерисовки страницы
  pb.querySelectorAll('[data-sec]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const el = document.getElementById('set-' + a.dataset.sec);
    if (el) el.scrollIntoView({ block: 'start', behavior: getPrefs().reduceMotion ? 'auto' : 'smooth' });
    history.replaceState(null, '', '#/profile/' + a.dataset.sec);
    markSec(a.dataset.sec);
  }));
  const markSec = (id) => pb.querySelectorAll('[data-sec]').forEach((a) => a.classList.toggle('on', a.dataset.sec === id));
  markSec(section || 'appearance');
  document.getElementById('outBtn').onclick = logout;
  if (section) { const el = document.getElementById('set-' + section); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { }
  localStorage.removeItem('ku_token'); S.token = null; S.user = null; aiHistory = null; goHome();
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
  applyTheme(); // цвета пользователя; до входа и после выхода — KU
  if (!S.user) return viewAuth();
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  switch (parts[0]) {
    case undefined: return viewHome();
    case 'schedule': return viewSchedule();
    case 'grades': return S.user.role === 'teacher' ? viewTGrades() : viewGrades();
    case 'rating': return viewRating();
    case 'exam': return viewExam(); // старые адреса #/exam/... (комнаты очереди) тоже ведут сюда
    case 'ai': return viewAI();
    case 't':
      if (S.user.role !== 'teacher') return viewHome();
      if (parts[1] === 'schedule') return viewTSchedule();
      if (parts[1] === 'grades') return viewTGrades();
      return viewExam(); // #/t/queue, #/t/room/... — бывшая очередь
    case 'profile': return viewProfile(parts[1]);
    case 'settings': return viewProfile(parts[1]); // старые адреса настроек — теперь это личный кабинет
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
