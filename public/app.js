'use strict';
/* KU Portal — SPA без зависимостей */

const app = document.getElementById('app');
const API_BASE = window.KU_API_BASE || ''; // '' — API на том же адресе; на GitHub Pages — адрес сервера (public/config.js)
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
  clip: '<path d="M20 11.5 12.3 19.2a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/>',
  pin: '<path d="M9 4h6l-1 6 3.5 3.5h-11L10 10z"/><path d="M12 13.5V20"/>',
  kumsg: '<path d="M3.5 6.2a2.2 2.2 0 0 1 2.2-2.2h8.6a2.2 2.2 0 0 1 2.2 2.2v5.1a2.2 2.2 0 0 1-2.2 2.2H9.2L5.8 16.3v-2.8h-.1a2.2 2.2 0 0 1-2.2-2.2z"/><path d="M19.6 9.4h.2a2 2 0 0 1 2 2v4.6a2 2 0 0 1-2 2h-.3v2.6l-3.1-2.6h-4.3a2 2 0 0 1-1.9-1.4"/><path d="M7.2 8.6h5.6"/>',
  chat: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h-1z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7.6 3.6 2.6-1.4 4.2H9.8l-1.4-4.2z"/><path d="M12 3.5v4.1M15.6 10.2l4.1-1.1M14.2 14.4l2.4 3.5M9.8 14.4l-2.4 3.5M8.4 10.2 4.3 9.1"/>',
  hoop: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17"/><path d="M6 6a8.5 8.5 0 0 1 0 12M18 6a8.5 8.5 0 0 0 0 12"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.6-7.5 10-7.5 10z"/>',
  crown: '<path d="m4 8 4 4 4-6.5 4 6.5 4-4-1.6 10H5.6z"/><path d="M5.6 20h12.8"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
};
function svg(name, cls) {
  return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;
}

/* ------------------------------ Хелперы ------------------------------ */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stopPoll() {
  if (window.__poll) { clearInterval(window.__poll); window.__poll = null; }
  if (window.__unsub) { const f = window.__unsub; window.__unsub = null; f(); }
}
function toast(text, isErr, onClick) {
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '') + (onClick ? ' link' : '');
  t.textContent = text;
  if (onClick) { t.setAttribute('role', 'button'); t.tabIndex = 0; t.onclick = () => { t.remove(); onClick(); }; }
  document.body.appendChild(t);
  setTimeout(() => t.remove(), onClick ? 6000 : 3200);
}
async function api(path, o) {
  o = o || {};
  o.headers = Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}, o.headers || {});
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch(API_BASE + '/api' + path, o);
  if (r.status === 401 && S.token) { S.token = null; localStorage.removeItem('ku_token'); S.user = null; route(); throw new Error(t('Сессия истекла')); }
  const j = await r.json().catch(() => ({ error: 'Ошибка сервера' }));
  if (!r.ok) throw new Error(tv(j.error || 'Ошибка сервера')); // ошибки сервера — на русском, переводим по словарю
  return j;
}

/* ------------------------- Программа, цвета и тема ------------------------- */
/* У пользователя есть программа: Kozybayev University или международная программа University of Arizona.
   Цвет сайта по умолчанию («Авто») берётся из программы; в «Настройках» можно выбрать другой цвет
   и режим — светлый / тёмный / как в системе. На <html>: data-palette (палитра) и data-mode="dark".
   Онлайн-экзамен получает цвет программы (inCampus / «Международный кампус») и выбранный режим, см. examLaunchUrl(). */
const PROGRAMS = {
  ku: { id: 'ku', name: 'Kozybayev University', short: 'Kozybayev University', icon: 'logo', palette: 'ku', examTheme: 'incampus' },
  arizona: { id: 'arizona', name: 'University of Arizona', short: 'University of Arizona · международная программа' /* t() при выводе */, icon: 'cap', palette: 'arizona', examTheme: 'intl' },
};
const programOf = (u) => PROGRAMS[(u && u.program) || 'ku'] || PROGRAMS.ku;
/* Роль и служебные права (назначает администратор): руководство клубами ('*' — все), общежитие */
const permsOf = (u) => (u && u.perms) || { clubs: [], dorm: false, results: false };
const leadsClubs = (u) => permsOf(u).clubs.length > 0;
function roleLabel(u) {
  if (u.role === 'teacher') return t('Преподаватель');
  if (u.role === 'student') return t('Студент');
  const p = permsOf(u);
  return t(p.clubs.includes('*') ? 'Менеджер' : p.clubs.length ? 'Руководитель клуба' : p.dorm ? 'Администрация общежития' : 'Сотрудник');
}
/* Служебные плитки на главной: клубы — руководителям, общежитие — администрации (студентам — всегда),
   учебная база результатов — только по праву «учебная база» (администрация; преподавателям она убрана, ревью п.6) */
const seesResults = (u) => !!permsOf(u).results;
function serviceTiles(u) {
  const p = permsOf(u), out = [];
  if (p.admin) out.push(['Администрирование', 'shield', '#/admin']);
  if (seesResults(u)) out.push(['Учебная база', 'chart', '#/results']);
  if (u.role === 'student' || p.clubs.length) out.push(['Клубы', 'ball', '#/clubs']);
  if (u.role === 'student' || p.dorm) out.push(['Общежитие', 'building', '#/dorm']);
  if (u.role === 'teacher') out.push(['Помощь', 'info', '#/help']); // обращения к администрации (public/services.js, server/help.js)
  out.push(['Голосование', 'mic', '#/voting']); // опросы — всем (server/polls.js); «Сообщения» — в верхнем меню
  return out;
}
const PALETTES = {
  ku: { name: 'Kozybayev', color: '#05a4ba' },
  arizona: { name: 'Arizona', color: '#0C234B' },
  emerald: { name: 'Изумрудный', color: '#1f9d6b' },
  violet: { name: 'Фиолетовый', color: '#6d4bd8' },
  coral: { name: 'Коралловый', color: '#e0603f' },
  graphite: { name: 'Графит', color: '#3f4a56' },
  pink: { name: 'Розовый', color: '#d63384' },
};
const MODES = { light: 'Светлая', dark: 'Тёмная', system: 'Как в системе' }; // названия — через t() при выводе

/* Настройки хранятся в браузере отдельно для каждого пользователя */
const PREF_DEFAULTS = {
  palette: 'auto', mode: 'light', fontSize: 'md', reduceMotion: false, compact: false,
  // уведомления (см. NOTIF); конфиденциальность, 2FA и оповещения о входе хранятся на сервере (/api/settings)
  notifPush: false, notifGrades: true, notifSchedule: true, notifExam: true, notifSound: true,
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

/* ------------------------------ Модальное окно ------------------------------ */
function modal(title, bodyHTML, onMount) {
  const ov = document.createElement('div');
  ov.className = 'mdl-ov';
  ov.innerHTML = `<div class="mdl" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mdl-h"><b>${esc(title)}</b><button class="mdl-x" data-x aria-label="${t('Закрыть')}">${svg('x')}</button></div>
    <div class="mdl-b">${bodyHTML}</div></div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  const f = ov.querySelector('input'); if (f) setTimeout(() => f.focus(), 30);
  if (onMount) onMount(ov.querySelector('.mdl-b'), close);
  return close;
}
function fmtWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts), loc = { en: 'en-GB', kk: 'kk-KZ' }[getLang()] || 'ru-RU';
  return d.toLocaleString(loc, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------ Уведомления ------------------------------
   Источник — сервер (/api/inbox): новые оценки, изменения расписания, вход с нового устройства.
   Плюс открытие экзамена в «Онлайн-экзамене» (/exam-sync/api/state). Опрос раз в 30 с, пока пользователь вошёл.
   Как показывать — по настройкам «Уведомления»: тост в портале всегда, звук (notifSound),
   системное уведомление браузера (notifPush, нужно разрешение), фильтры по типам (notifGrades / notifSchedule / notifExam). */
const NOTIF = { unread: 0, items: [], seen: null, timer: null, examOpen: null };
const notifTypePref = { grade: 'notifGrades', schedule: 'notifSchedule', exam: 'notifExam' };
const DORM_STATUS_TEXT = { new: 'Принята', work: 'В работе', done: 'Выполнена', rejected: 'Отклонена' };
const HELP_STATUS_TEXT = { new: 'Принято', work: 'В работе', done: 'Решено', rejected: 'Отклонено' }; // обращения преподавателя (server/help.js)
function notifText(n) {
  if (n.type === 'grade') return { title: t('Новая оценка'), body: `${tv(n.subject)} — ${n.score}` };
  if (n.type === 'schedule') return { title: t('Изменение в расписании'), body: `${tv(n.subject)} · ${weekdayName(n.day)} ${n.start}${n.room ? ' · ' + t('ауд.') + ' ' + n.room : ''}` };
  if (n.type === 'login') return { title: t('Новый вход в аккаунт'), body: [n.device, n.ip].filter(Boolean).join(' · ') };
  if (n.type === 'exam') return { title: t('Экзамен открыт'), body: n.title || '' };
  if (n.type === 'msg') return { title: t('Новое сообщение'), body: [n.from, n.text].filter(Boolean).join(': ') };
  if (n.type === 'material') return { title: t('Новый материал'), body: `${tv(n.subject)} — ${n.title}` };
  if (n.type === 'task') return { title: t('Новое задание'), body: `${tv(n.subject)} — ${n.title}${n.due ? ' · ' + t('до {d}', { d: fmtDay(n.due) }) : ''}` };
  if (n.type === 'club') return { title: t(n.accepted ? 'Заявка принята' : 'Заявка отклонена'), body: n.accepted ? t('Вы в клубе «{c}» — канал и чат открыты', { c: tv(n.club) }) : tv(n.club) };
  if (n.type === 'help') return { title: t('Ответ на обращение'), body: [t(HELP_STATUS_TEXT[n.status] || ''), n.reply].filter(Boolean).join(' · ') };
  if (n.type === 'dorm') return { title: t('Обращение в общежитие'), body: [t(DORM_STATUS_TEXT[n.status] || ''), n.category ? tv(n.category) : '', n.reply].filter(Boolean).join(' · ') };
  return { title: t('Уведомление'), body: '' };
}
/* Куда ведёт уведомление (ревью п.3): сообщение — в этот чат KU Message, материал и задание — на страницу предмета,
   клуб — в канал клуба, оценка, расписание, общежитие, помощь — в свой раздел портала. null — уведомление без перехода. */
function notifTarget(n) {
  const km = (open) => () => openMessage(false, open);
  if (n.type === 'msg') return km(n.ch ? '/d/' + encodeURIComponent(n.ch) : '');
  if (n.type === 'material' || n.type === 'task') return km(n.ch ? '/s/' + encodeURIComponent(n.ch) : '');
  if (n.type === 'club') return n.accepted && n.clubId ? km('/c/' + n.clubId) : () => { location.hash = '#/clubs'; };
  const hash = { grade: '#/grades', schedule: '#/schedule', dorm: '#/dorm', help: '#/help', login: '#/profile/security', exam: '#/exam' }[n.type];
  return hash ? () => { location.hash = hash; } : null;
}
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [880, 660].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * 0.18;
      o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.start(t0); o.stop(t0 + 0.17);
    });
  } catch { }
}
function deliver(n) {
  const p = getPrefs();
  if (notifTypePref[n.type] && !p[notifTypePref[n.type]]) return; // этот тип уведомлений выключен
  const { title, body } = notifText(n);
  toast(body ? `${title}: ${body}` : title, false, notifTarget(n) || undefined);
  if (p.notifSound) chime();
  if (p.notifPush && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { const go = notifTarget(n); const x = new Notification(title, { body, tag: 'ku-' + (n.id || n.type) }); x.onclick = () => { window.focus(); x.close(); if (go) go(); }; } catch { }
  }
}
function paintBell() {
  const b = document.getElementById('bell'); if (!b) return;
  const old = b.querySelector('.bell-n'); if (old) old.remove();
  if (NOTIF.unread) { const sp = document.createElement('span'); sp.className = 'bell-n'; sp.textContent = NOTIF.unread > 9 ? '9+' : NOTIF.unread; b.appendChild(sp); }
}
async function pollInbox() {
  if (!S.user) return;
  try {
    const d = await api('/inbox');
    const fresh = NOTIF.seen ? d.items.filter((x) => !x.read && !NOTIF.seen.has(x.id)) : [];
    NOTIF.items = d.items; NOTIF.unread = d.unread;
    NOTIF.seen = new Set(d.items.map((x) => x.id));
    fresh.reverse().forEach(deliver); // при первом опросе после входа — только счётчик, без всплывающих
    paintBell();
  } catch { }
}
/* Открытие экзамена: комнаты «Онлайн-экзамена», которые стали открытыми с прошлой проверки */
async function pollExams() {
  if (!S.user || !getPrefs().notifExam) return;
  try {
    const { rooms: open } = await api('/exams/open');
    const key = 'ku_exam_open:' + S.user.id;
    let known = NOTIF.examOpen;
    if (!known) { try { known = new Set(JSON.parse(localStorage.getItem(key) || 'null') || open.map((x) => x.id)); } catch { known = new Set(open.map((x) => x.id)); } }
    open.filter((x) => !known.has(x.id)).forEach((x) => deliver({ type: 'exam', id: 'exam-' + x.id, title: x.title }));
    NOTIF.examOpen = new Set(open.map((x) => x.id));
    try { localStorage.setItem(key, JSON.stringify([...NOTIF.examOpen])); } catch { }
  } catch { }
}
function startNotif() {
  if (NOTIF.timer || !S.user) return;
  pollInbox(); pollExams(); pollChatUnread();
  NOTIF.timer = setInterval(() => { pollInbox(); pollExams(); pollChatUnread(); }, 30000);
}
function stopNotif() {
  if (NOTIF.timer) clearInterval(NOTIF.timer);
  Object.assign(NOTIF, { unread: 0, items: [], seen: null, timer: null, examOpen: null });
  CHAT.unread = 0;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.user) pollInbox(); });
function openInbox() {
  const list = NOTIF.items;
  // уведомление с переходом — кнопка: открывает чат, предмет или раздел (notifTarget)
  modal(t('Уведомления'), list.length
    ? `<div class="inbox">${list.map((n, i) => { const x = notifText(n), go = !!notifTarget(n), tag = go ? 'button' : 'div';
      return `<${tag} class="inbox-it ${n.read ? '' : 'new'} ${go ? 'go' : ''}" ${go ? `type="button" data-n="${i}"` : ''}><b>${esc(x.title)}</b>${x.body ? `<span>${esc(x.body)}</span>` : ''}<small>${esc(fmtWhen(n.at))}</small></${tag}>`; }).join('')}</div>`
    : `<div class="next-empty">${t('Новых уведомлений нет')}</div>`, (box, close) => {
    box.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { const go = notifTarget(list[+b.dataset.n]); close(); if (go) go(); }));
  });
  if (NOTIF.unread) {
    api('/inbox/read', { method: 'POST', body: {} }).then(() => { NOTIF.unread = 0; NOTIF.items.forEach((x) => { x.read = true; }); paintBell(); }).catch(() => { });
  }
}
/* Проверка: тост + звук (если включён) + уведомление браузера (если включено и разрешено) — сразу, без ожидания */
function testNotif() {
  const p = getPrefs(), body = t('Так будут выглядеть уведомления KU Portal');
  toast(t('Уведомление') + ': ' + body);
  if (p.notifSound) chime();
  if (p.notifPush && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(t('Уведомление'), { body, tag: 'ku-test' }); } catch { } }
}
async function askNotifPermission() {
  if (!('Notification' in window)) { toast(t('Браузер не поддерживает уведомления'), true); return false; }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') { toast(t('Уведомления запрещены в настройках браузера для этого сайта'), true); return false; }
  const r = await Notification.requestPermission();
  if (r !== 'granted') toast(t('Разрешение не выдано'), true);
  return r === 'granted';
}

/* ------------------------------ Общие блоки ------------------------------ */
/* Верхнее меню. «KU Message» и «Экзамен» открывают отдельные сервисы сразу, без промежуточной страницы.
   Значок и надпись «KU Portal» ведут на главную. */
function navHTML(active) {
  const it = (href, key, icon, label) => `<a href="${href}" data-nav="${key}" class="${active === key ? 'on' : ''}"><span class="ic">${svg(icon)}</span>${t(label)}</a>`;
  return `<nav class="bnav">
    <a class="bnav-brand" href="#/" title="${t('Главная')}">${svg(programOf(S.user).icon)}<b>KU Portal</b></a>
    ${it('#/', 'home', 'home', 'Главная')}
    ${it('#/chats', 'message', 'kumsg', 'KU Message')}
    ${S.user.role === 'staff' ? '' : it('#/exam', 'exam', 'clipboard', 'Экзамен')}
    ${it('#/profile', 'profile', 'user', 'Кабинет')}
  </nav>`;
}
function headHTML() {
  const u = S.user;
  return `
  <div class="hrow">
    <div>
      <div class="hi">${t('Привет,')}</div>
      <div class="nm">${esc(u.firstName)}</div>
    </div>
    <div class="nicons">
      <button class="bell" id="bell" title="${t('Уведомления')}">${svg('bell')}${NOTIF.unread ? `<span class="bell-n">${NOTIF.unread > 9 ? '9+' : NOTIF.unread}</span>` : ''}</button>
      <button class="avatar" id="goProfile" title="${t('Кабинет')}">${esc(u.firstName.charAt(0).toUpperCase())}</button>
    </div>
  </div>
  <a class="uni" href="#/">
    <div class="mark brand-mark"><img src="bird-idle.png" alt="" /></div>
    <div class="uname">${esc(programOf(u).name)}</div>
  </a>`;
}
function miniHead(title) {
  return `<a class="back" href="#/">${svg('back')} ${t('Назад')}</a><h1 class="ptitle">${esc(t(title))}</h1>`;
}

/* ============================ Главная (студент) ============================ */
const KU_SITE_URL = 'https://stikech.github.io/ku-frontend/ku.edu.kz/ru/'; // новый сайт Kozybayev University
/* Нижняя панель со ссылкой на сайт университета — на главной у всех ролей */
function siteCardHTML() {
  return `<a class="news" href="${KU_SITE_URL}" target="_blank" rel="noopener">
        <div class="tg">${svg('tg')}</div>
        <div style="flex:1">
          <b>${t('Сайт Kozybayev University')}</b>
          <span>${t('Новости, объявления и задания')}</span>
        </div>
        <div class="chev">${svg('chev')}</div>
      </a>`;
}
async function viewHome() {
  stopPoll();
  if (S.user.role === 'teacher') return viewHomeT();
  if (S.user.role === 'staff') return viewHomeS();
  app.innerHTML = `${headHTML()}<div id="pagebody" class="dash"><div class="load">${t('Загрузка…')}</div></div>${navHTML('home')}`;
  bindHead();
  try {
    const d = await api('/student/dashboard');
    const ring = d.score == null
      ? ringSVG(null)
      : ringSVG(d.score);

    const srvs = [
      // «Экзамен» здесь не дублируем — он есть в главном меню
      ['Рейтинг', 'star', '#/rating'], ['Расписание', 'calendar', '#/schedule'], ['Успеваемость', 'book', '#/grades'],
      ...serviceTiles(S.user),
    ];

    document.getElementById('pagebody').innerHTML = `
      <div class="section-label">${t('Виджеты')}</div>
      <div class="card scorecard">
        <div>
          <div class="stud-fio">${esc(S.user.fio)}</div>
          <div class="stud-group">${esc(d.group)}</div>
          <span class="pill">${t('Общий балл за семестр')}</span>
        </div>
        <div class="ring-wrap">${ring}</div>
      </div>
      ${d.next ? `
      <div class="lesson">
        <div class="subj">${esc(tv(d.next.subject))} (${esc(tv(d.next.type))})</div>
        <div class="dt">${esc(d.next.iso ? fmtDay(d.next.iso, true) : d.next.date)}</div>
        <hr class="rule">
        <div class="row">${esc(t('Время: {v}', { v: d.next.time }))}</div>
        <div class="row">${esc(t('Аудитория: {v}', { v: d.next.room }))}</div>
        <div class="row">${esc(t('Преподаватель: {v}', { v: d.next.teacher }))}</div>
        <div class="foot">${svg('info')} ${t('Следующее занятие в расписании')}</div>
      </div>` : `
      <div class="card" style="border-left:8px solid var(--accent)"><div class="next-empty">${t('Ближайших занятий пока нет.')}<br>${esc(t('Преподаватель ещё не добавил расписание для группы {g}.', { g: d.group }))}</div></div>`}
      <div class="section-label">${t('Сервисы')}</div>
      <div class="srv-grid">
        ${srvs.map((s) => `<button class="srv" data-href="${s[2]}">${svg(s[1])}<span>${t(s[0])}</span></button>`).join('')}
      </div>
      ${siteCardHTML()}`;
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
  if (b) b.onclick = openInbox;
  const p = document.getElementById('goProfile');
  if (p) p.onclick = () => { location.hash = '#/profile'; };
}

/* ============================ Главная (преподаватель) ============================ */
async function viewHomeT() {
  app.innerHTML = `${headHTML()}<div id="pagebody" class="dash"><div class="load">${t('Загрузка…')}</div></div>${navHTML('home')}`;
  bindHead();
  try {
    const d = await api('/teacher/subjects');
    const srvs = [
      // «Экзамен» — в главном меню; «Добавить занятие» убрано (ревью п.8): группы преподавателю назначает администратор
      ['Оценки', 'star', '#/t/grades'], ['Расписание', 'calendar', '#/schedule'],
      ...serviceTiles(S.user), // клубы и общежитие — только если администратор назначил; «Сообщения» — в верхнем меню
    ];
    document.getElementById('pagebody').innerHTML = `
      <div class="section-label">${t('Виджеты')}</div>
      <div class="card scorecard wide">
        <div>
          <div class="stud-fio">${esc(S.user.fio)}</div>
          <div class="stud-group">${t('Преподаватель')}</div>
          <span class="pill">${t('Кабинет преподавателя')}</span>
        </div>
        <div class="ring-wrap" style="text-align:center">
          <div style="font-size:calc(32px * var(--fs));font-weight:800;color:var(--accent-deep)">${d.items.length}</div>
          <div class="tx">${t('предметов')}</div>
        </div>
      </div>
      <div class="section-label">${t('Сервисы')}</div>
      <div class="srv-grid">
        ${srvs.map((s) => `<button class="srv" data-href="${s[2]}">${svg(s[1])}<span>${t(s[0])}</span></button>`).join('')}
      </div>
      ${siteCardHTML()}`;
    document.querySelectorAll('.srv').forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
  } catch (e) {
    document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`;
  }
}

/* ============================ Главная (сотрудник: менеджер, руководитель клуба) ============================ */
function viewHomeS() {
  const tiles = serviceTiles(S.user);
  app.innerHTML = `${headHTML()}<div id="pagebody" class="dash">
      <div class="section-label">${t('Виджеты')}</div>
      <div class="card scorecard wide">
        <div>
          <div class="stud-fio">${esc(S.user.fio)}</div>
          <div class="stud-group">${esc(roleLabel(S.user))}</div>
          <span class="pill">${t('Кабинет сотрудника')}</span>
        </div>
      </div>
      <div class="section-label">${t('Сервисы')}</div>
      ${tiles.length ? `<div class="srv-grid">${tiles.map((s) => `<button class="srv" data-href="${s[2]}">${svg(s[1])}<span>${t(s[0])}</span></button>`).join('')}</div>`
        : `<div class="card next-empty">${t('Администратор портала ещё не назначил вам обязанности. Когда назначит — здесь появятся клубы или общежитие.')}</div>`}
      ${siteCardHTML()}
    </div>${navHTML('home')}`;
  bindHead();
  document.querySelectorAll('.srv').forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
}

/* ============================ Расписание ============================ */
async function viewSchedule() {
  stopPoll();
  app.innerHTML = `${miniHead('Расписание')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  try {
    const d = await api('/schedule');
    if (!d.items.length) {
      document.getElementById('pagebody').innerHTML = `<div class="card next-empty">${t('Занятий пока нет.')}</div>`;
      return;
    }
    const byDay = {};
    d.items.forEach((r) => { (byDay[r.day] = byDay[r.day] || []).push(r); });
    document.getElementById('pagebody').innerHTML = Object.keys(byDay).map((day) => `
      <div class="dayhead">${esc(weekdayName(Number(day)))}</div>
      ${byDay[day].map((r) => `
      <div class="card lesson" style="margin-bottom:10px">
        <div class="subj">${esc(tv(r.subject))} (${esc(tv(r.type))})</div>
        <hr class="rule">
        <div class="row">${esc(t('Время: {v}', { v: r.start + ' - ' + r.end }))}</div>
        <div class="row">${esc(t('Аудитория: {v}', { v: r.room || '—' }))}</div>
        <div class="row">${S.user.role === 'student' ? esc(t('Преподаватель: {v}', { v: r.teacher })) : esc(t('Группа: {v}', { v: r.group }))}</div>
      </div>`).join('')}`).join('');
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}

/* ============================ Оценки / Рейтинг ============================ */
async function viewGrades() {
  stopPoll();
  app.innerHTML = `${miniHead('Успеваемость')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  try {
    const d = await api('/grades');
    document.getElementById('pagebody').innerHTML = `
      <div class="card scorecard">
        <div>
          <div class="stud-fio">${d.avg == null ? t('Оценок пока нет') : t('Средний балл')}</div>
          <div class="stud-group">${t('Общий балл за семестр')}</div>
        </div>
        <div class="ring-wrap">${ringSVG(d.avg)}</div>
      </div>
      <div class="card">
        ${d.items.length ? d.items.map((g) => `
          <div class="lstrow" style="cursor:default">
            <div>${esc(tv(g.subject))}<div class="tx">${esc(g.teacher)} · ${esc(fmtDay(g.date))}</div></div>
            <div class="r" style="color:var(--accent-deep);font-weight:700">${g.score}</div>
          </div>`).join('') : `<div class="next-empty">${t('Оценки появятся, когда преподаватель выставит их.')}</div>`}
      </div>`;
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
async function viewRating() {
  stopPoll();
  app.innerHTML = `${miniHead('Рейтинг')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  try {
    const d = await api('/rating');
    document.getElementById('pagebody').innerHTML = `
      <div class="card"><div class="stud-fio">${esc(t('Группа {g}', { g: d.group }))}</div>
      <div class="stud-group">${d.selfPos ? t('Вы на {n}-м месте из {total}', { n: d.selfPos, total: d.total }) : t('Пока нет оценок в группе')}</div>
      ${d.selfHidden ? `<div class="tx" style="margin-top:6px">${t('Вы скрыты из рейтинга: одногруппники вас не видят. Изменить — Кабинет → Конфиденциальность.')}</div>` : ''}</div>
      <div class="card">
        ${d.rows.length ? d.rows.map((r, i) => `
          <div class="lstrow ${r.id === S.user.id ? 'me' : ''}" style="cursor:default">
            <div>${r.pos}. ${esc(r.fio)}${r.online ? `<span class="online-dot" title="${t('В сети')}"></span>` : ''}</div>
            <div class="r" style="color:var(--accent-deep);font-weight:700">${r.avg == null ? '—' : r.avg}</div>
          </div>`).join('') : `<div class="next-empty">${t('В группе пока нет студентов.')}</div>`}
      </div>`;
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}

/* ============================ Экзамен → Онлайн-экзамен ============================ */
/*
 * Раздел «Экзамен» — вход в сервис «Онлайн-экзамен» (github.com/StephCurrysvg/exam-sync),
 * встроенный в этот же сервер по адресу /exam-sync/ (exam-sync/handler.js).
 * Сайт экзаменов показывает кнопку «KU Portal» для возврата сюда (параметры from/back).
 */
const EXAM_SYNC_PATH = API_BASE + '/exam-sync/'; // онлайн-экзамен живёт на сервере портала
I.monitor = '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7M12 16v4"/><path d="m9.2 10.4 1.9 1.9 3.8-3.9"/>';
const EXAM_COLOR = { ku: 'incampus', arizona: 'intl' }; // палитра портала → цвет онлайн-экзамена
function examLaunchUrl() {
  const u = new URL(EXAM_SYNC_PATH, location.origin);
  u.searchParams.set('from', 'ku-portal');
  u.searchParams.set('back', location.href.split('#')[0] + '#/'); // с учётом пути (GitHub Pages: /ku-portal/); на главную, иначе экзамен откроется снова
  u.searchParams.set('lang', getLang()); // язык интерфейса — и в онлайн-экзамене
  // Оформление портала целиком: цвет (с учётом «Авто»), режим, размер текста, «меньше анимации».
  // Kozybayev → inCampus, Arizona → «Международный кампус», остальные палитры в экзамене называются так же.
  const th = resolvedTheme();
  u.searchParams.set('theme', EXAM_COLOR[th.palette] || th.palette);
  u.searchParams.set('mode', th.mode || 'light'); // всегда явно: иначе «Авто» в экзамене включит тёмный inCampus при светлом портале
  u.searchParams.set('fs', th.fs || 'md');
  u.searchParams.set('still', th.still ? '1' : '0');
  return u.href;
}
function examTransition(href) {
  appTransition(href, { icon: 'monitor', title: t('Открываем онлайн-экзамен…'), sub: t('Переходим в сервис экзаменов') });
}
/* Переход в отдельный сервис (онлайн-экзамен, KU Message): мост «портал → сервис» и плавный уход со страницы */
function appTransition(href, o) {
  const ov = document.createElement('div');
  ov.className = 'oe-ov';
  ov.setAttribute('role', 'status');
  ov.setAttribute('aria-live', 'polite');
  ov.innerHTML = `
    <div class="oe-ov-in">
      <div class="oe-bridge"><span class="oe-app ku">${svg(programOf(S.user).icon)}</span><span class="oe-track"><i></i></span><span class="oe-app ex">${svg(o.icon)}</span></div>
      <div class="oe-ov-t">${esc(o.title)}</div>
      <div class="oe-ov-s">${esc(o.sub)}</div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  const reduced = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || getPrefs().reduceMotion;
  setTimeout(() => { location.href = href; }, reduced ? 50 : 900);
  // Вернулись кнопкой «Назад» из bfcache — убрать оверлей
  window.addEventListener('pageshow', function h(e) { if (e.persisted) { ov.remove(); window.removeEventListener('pageshow', h); } });
}
/* «Экзамен» в меню — сразу переход в онлайн-экзамен (ревью п.1: без промежуточной страницы).
   Адрес в истории меняется на главную, чтобы «Назад» из экзамена не открывал его снова. */
function viewExam() {
  stopPoll();
  history.replaceState(null, '', '#/');
  viewHome();
  examTransition(examLaunchUrl());
}

/* ============================ Заглушки ============================ */
function viewStub(name) {
  app.innerHTML = `
    ${miniHead(name)}
    <div class="stub">${svg('building')}<b>${esc(t(name))}</b>${t('Раздел в разработке.')}<br>${t('Скоро здесь появятся сервисы университета.')}</div>
    ${navHTML()}`;
}

/* ============================ Роутер ============================ */
let askedNewPassword = false;
function route() {
  stopPoll();
  applyTheme(); // цвета пользователя; до входа и после выхода — KU
  const resetMatch = /^#\/reset\/([0-9a-f]{48})$/.exec(location.hash); // ссылка из письма восстановления (public/auth.js)
  if (resetMatch && !S.user) { stopNotif(); return viewReset(resetMatch[1]); }
  if (!S.user) { stopNotif(); return location.hash === '#/forgot' ? viewForgot() : viewAuth(); }
  startNotif();
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  // пароль сброшен администратором — сначала свой пароль вместо временного
  // сервер до смены пароля отвечает только кабинету (MUST_CHANGE_ALLOWED в server.js)
  if (S.user.mustChangePassword) {
    if (!askedNewPassword) {
      askedNewPassword = true;
      setTimeout(() => { toast(t('Пароль выдан администратором — задайте свой')); changePasswordDlg(() => route()); }, 300);
    }
    return viewProfile('security');
  }
  switch (parts[0]) {
    case undefined: return viewHome();
    case 'schedule': return S.user.role === 'staff' ? viewHome() : viewSchedule();
    case 'grades': return S.user.role === 'teacher' ? viewTGrades() : S.user.role === 'student' ? viewGrades() : viewHome();
    case 'rating': return S.user.role === 'student' ? viewRating() : viewHome();
    case 'exam': return S.user.role === 'staff' ? viewHome() : viewExam(); // старые адреса #/exam/... (комнаты очереди) тоже ведут сюда
    case 'chats': case 'chat': return viewMessage(); // KU Message — отдельное приложение (public/message-launch.js, ku-message/)
    case 'help': return S.user.role === 'teacher' ? viewHelp() : viewHome(); // обращения преподавателя (public/services.js)
    case 'clubs': // клубы — студентам и руководителям клубов
      if (S.user.role !== 'student' && !leadsClubs(S.user)) return viewHome();
      return viewClubs(parts[1] ? decodeURIComponent(parts[1]) : '');
    case 't':
      if (S.user.role !== 'teacher') return viewHome();
      if (parts[1] === 'grades') return viewTGrades(); // #/t/schedule («Добавить занятие») убран — ведёт на главную
      return viewHome(); // #/t/queue, #/t/room/... — бывшая очередь
    case 'profile': return viewProfile(parts[1]);
    case 'settings': return viewProfile(parts[1]); // старые адреса настроек — теперь это личный кабинет
    case 'admin': // админ-панель — отдельная страница (admin/), вход по сеансу портала
      if (!permsOf(S.user).admin) return viewHome();
      location.href = '/admin/'; return;
    case 'results': // учебная база — отдельная страница, вход в неё по сеансу портала
      if (!seesResults(S.user)) return viewHome();
      location.href = '/results/'; return;
    case 'dorm': return S.user.role === 'student' || permsOf(S.user).dorm ? viewDorm() : viewHome(); // public/campus.js
    case 'voting': return viewVoting(); // опросы (public/services.js, server/polls.js)
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
