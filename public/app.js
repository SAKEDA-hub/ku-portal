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
const PALETTES = {
  ku: { name: 'Kozybayev', color: '#05a4ba' },
  arizona: { name: 'Arizona', color: '#0C234B' },
  emerald: { name: 'Изумрудный', color: '#1f9d6b' },
  violet: { name: 'Фиолетовый', color: '#6d4bd8' },
  coral: { name: 'Коралловый', color: '#e0603f' },
  graphite: { name: 'Графит', color: '#3f4a56' },
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
function notifText(n) {
  if (n.type === 'grade') return { title: t('Новая оценка'), body: `${tv(n.subject)} — ${n.score}` };
  if (n.type === 'schedule') return { title: t('Изменение в расписании'), body: `${tv(n.subject)} · ${weekdayName(n.day)} ${n.start}${n.room ? ' · ' + t('ауд.') + ' ' + n.room : ''}` };
  if (n.type === 'login') return { title: t('Новый вход в аккаунт'), body: [n.device, n.ip].filter(Boolean).join(' · ') };
  if (n.type === 'exam') return { title: t('Экзамен открыт'), body: n.title || '' };
  return { title: t('Уведомление'), body: '' };
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
  toast(body ? `${title}: ${body}` : title);
  if (p.notifSound) chime();
  if (p.notifPush && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { const x = new Notification(title, { body, tag: 'ku-' + (n.id || n.type) }); x.onclick = () => { window.focus(); x.close(); }; } catch { }
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
    const r = await fetch(EXAM_SYNC_PATH + 'api/state', { cache: 'no-store' });
    if (!r.ok) return;
    const rooms = ((await r.json()).db || {}).rooms || [];
    const open = rooms.filter((x) => x.open);
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
  pollInbox(); pollExams();
  NOTIF.timer = setInterval(() => { pollInbox(); pollExams(); }, 30000);
}
function stopNotif() {
  if (NOTIF.timer) clearInterval(NOTIF.timer);
  Object.assign(NOTIF, { unread: 0, items: [], seen: null, timer: null, examOpen: null });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.user) pollInbox(); });
function openInbox() {
  const list = NOTIF.items;
  modal(t('Уведомления'), list.length
    ? `<div class="inbox">${list.map((n) => { const x = notifText(n); return `<div class="inbox-it ${n.read ? '' : 'new'}"><b>${esc(x.title)}</b>${x.body ? `<span>${esc(x.body)}</span>` : ''}<small>${esc(fmtWhen(n.at))}</small></div>`; }).join('')}</div>`
    : `<div class="next-empty">${t('Новых уведомлений нет')}</div>`);
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
function navHTML(active) {
  const it = (href, key, icon, label) => `<a href="${href}" class="${active === key ? 'on' : ''}"><span class="ic">${svg(icon)}</span>${t(label)}</a>`;
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
      <div class="hi">${t('Привет,')}</div>
      <div class="nm">${esc(u.firstName)}</div>
    </div>
    <div class="nicons">
      <button class="bell" id="bell" title="${t('Уведомления')}">${svg('bell')}${NOTIF.unread ? `<span class="bell-n">${NOTIF.unread > 9 ? '9+' : NOTIF.unread}</span>` : ''}</button>
      <button class="avatar" id="goProfile" title="${t('Кабинет')}">${esc(u.firstName.charAt(0).toUpperCase())}</button>
    </div>
  </div>
  <div class="uni">
    <div class="mark brand-mark"><img src="/bird-idle.png" alt="" /></div>
    <div class="uname">${esc(programOf(u).name)}</div>
  </div>`;
}
function miniHead(title) {
  return `<a class="back" href="#/">${svg('back')} ${t('Назад')}</a><h1 class="ptitle">${esc(t(title))}</h1>`;
}

/* ============================ Аутентификация ============================ */
let authTab = 'login', authRole = 'student', authProgram = 'ku';
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
    <div class="seg2 txt auth-lang" role="radiogroup" aria-label="${t('Язык')}">${Object.entries(LANGS).map(([k, n]) => `<button role="radio" lang="${k}" aria-checked="${getLang() === k}" class="${getLang() === k ? 'on' : ''}" data-lang="${k}">${n}</button>`).join('')}</div>
    <div class="tabs">
      <button id="tabLogin" class="${authTab === 'login' ? 'on' : ''}">${t('Вход')}</button>
      <button id="tabReg" class="${authTab === 'reg' ? 'on' : ''}">${t('Регистрация')}</button>
    </div>
    <div id="authform"></div>
    <div class="err" id="autherr">${msg ? esc(msg) : ''}</div>
    <div id="demoBox"></div>
  </div>`;
  renderAuthForm();
  renderDemoBox();
  app.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); viewAuth(); }));
  document.getElementById('tabLogin').onclick = () => { authTab = 'login'; viewAuth(); };
  document.getElementById('tabReg').onclick = () => { authTab = 'reg'; viewAuth(); };
}
function renderAuthForm() {
  const box = document.getElementById('authform');
  if (authTab === 'login') {
    box.innerHTML = `
      <input class="inp" id="liEmail" type="email" placeholder="Email">
      <input class="inp" id="liPass" type="password" placeholder="${t('Пароль')}">
      <button class="btn pri" id="liBtn">${t('Войти')}</button>`;
    document.getElementById('liBtn').onclick = doLogin;
    document.getElementById('liPass').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
  } else {
    box.innerHTML = `
      <input class="inp" id="rLast" placeholder="${t('Фамилия')}">
      <input class="inp" id="rFirst" placeholder="${t('Имя')}">
      <input class="inp" id="rMid" placeholder="${t('Отчество (необязательно)')}">
      <input class="inp" id="rEmail" type="email" placeholder="Email">
      <input class="inp" id="rPass" type="password" placeholder="${t('Пароль (мин. 4 символа)')}">
      <label class="lbl">${t('Роль')}</label>
      <div class="chips">
        <button class="chip ${authRole === 'student' ? 'on' : ''}" id="chStud">${t('Студент')}</button>
        <button class="chip ${authRole === 'teacher' ? 'on' : ''}" id="chTeach">${t('Преподаватель')}</button>
      </div>
      <label class="lbl">${t('Программа')}</label>
      <div class="chips">
        <button class="chip ${authProgram === 'ku' ? 'on' : ''}" id="chKU">Kozybayev University</button>
        <button class="chip ${authProgram === 'arizona' ? 'on' : ''}" id="chAZ">University of Arizona</button>
      </div>
      <div id="grpWrap">${authRole === 'student' ? `<input class="inp" id="rGroup" placeholder="${t('Группа (например: ИСУ-26-2-а)')}"><label class="lbl">${t('Оценки и расписание появятся, когда преподаватель добавит их для вашей группы')}</label>` : ''}</div>
      <button class="btn pri" id="rBtn">${t('Создать аккаунт')}</button>`;
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
  const te = demoInfo.accounts.find((a) => a.role === 'teacher');
  const st = demoInfo.accounts.find((a) => a.role === 'student');
  box.innerHTML = `
    <div class="demo-box">
      <b>${t('Тестовый вход')}</b>
      <div class="tx">${esc(t('Пароль у всех демо-аккаунтов: {p}. Преподаватель — международная программа University of Arizona, студент — Kozybayev University.', { p: demoInfo.password }))}</div>
      <div class="row2">
        <button class="btn ghost" data-demo="${esc(te.email)}">${t('Преподаватель')}<small class="demo-pr">${esc(programOf(te).name)}</small></button>
        <button class="btn ghost" data-demo="${esc(st.email)}">${t('Студент')}<small class="demo-pr">${esc(programOf(st).name)}</small></button>
      </div>
    </div>`;
  box.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = async () => {
    authErr('');
    try { await loginWith(b.dataset.demo, demoInfo.password); } catch (e) { authErr(e.message); }
  }));
}
function authErr(m) { const e = document.getElementById('autherr'); if (e) e.textContent = m; }
/* Идентификатор устройства (для оповещения о входе с нового устройства) — случайный, хранится в браузере */
function deviceId() {
  try {
    let d = localStorage.getItem('ku_device');
    if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('ku_device', d); }
    return d;
  } catch { return ''; }
}
/* Вход: пароль → (если включена двухфакторная аутентификация) код из приложения-аутентификатора */
async function loginWith(email, password, code) {
  const d = await api('/auth/login', { method: 'POST', body: { email, password, code, deviceId: deviceId() } });
  if (d.need2fa) return showCodeStep(email, password);
  S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; goHome();
}
function showCodeStep(email, password) {
  const box = document.getElementById('authform');
  if (!box) return;
  authErr('');
  box.innerHTML = `
    <div class="tx code-hint">${t('Введите 6-значный код из приложения-аутентификатора')}</div>
    <input class="inp" id="liCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">
    <button class="btn pri" id="liCodeBtn">${t('Подтвердить')}</button>
    <button class="btn ghost" id="liCodeBack" style="margin-top:8px">${t('Назад')}</button>`;
  const go = async () => { authErr(''); try { await loginWith(email, password, v('liCode')); } catch (e) { authErr(e.message); } };
  document.getElementById('liCodeBtn').onclick = go;
  document.getElementById('liCode').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  document.getElementById('liCodeBack').onclick = () => viewAuth();
  document.getElementById('liCode').focus();
}
function goHome() { if (location.hash === '#/' || !location.hash) route(); else location.hash = '#/'; }
async function doLogin() {
  authErr('');
  try { await loginWith(v('liEmail'), v('liPass')); } catch (e) { authErr(e.message); }
}
async function doRegister() {
  authErr('');
  try {
    const d = await api('/auth/register', {
      method: 'POST',
      body: {
        lastName: v('rLast'), firstName: v('rFirst'), middleName: v('rMid'),
        email: v('rEmail'), password: v('rPass'), role: authRole, program: authProgram, group: authRole === 'student' ? v('rGroup') : '',
        deviceId: deviceId(),
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
      ['Запись на зачёт', 'clipboard', '#/credit'], ['AI-помощник', 'msg', '#/ai'], ['Посещаемость', 'clock', '#/attendance'],
      ['Общежитие', 'building', '#/dorm'], ['Голосование', 'mic', '#/voting'], ['Библиотека', 'chart', '#/library'],
      // последние пять — демо-сервисы (public/services.js)
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
      <a class="news" href="https://ku.edu.kz/ru/" target="_blank" rel="noopener">
        <div class="tg">${svg('tg')}</div>
        <div style="flex:1">
          <b>${t('Сайт Kozybayev University')}</b>
          <span>${t('Новости, объявления и задания')}</span>
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
      // «Экзамен» — в главном меню и в карточке выше; «Мои предметы» вели туда же, что и «Оценки»
      ['Добавить занятие', 'plus', '#/t/schedule'], ['Оценки', 'star', '#/t/grades'],
      ['Расписание', 'calendar', '#/schedule'], ['AI-помощник', 'msg', '#/ai'],
    ];
    document.getElementById('pagebody').innerHTML = `
      <div class="section-label">${t('Виджеты')}</div>
      <div class="card scorecard">
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
      <a class="lesson" href="#/exam" style="display:block;color:inherit">
        <div class="subj">${t('Онлайн-экзамен')}</div>
        <div class="dt">${t('Тесты, writing, speaking и ведомость')}</div>
        <hr class="rule">
        <div class="row">${t('Создавайте тесты и открывайте комнаты экзамена для групп')}</div>
        <div class="foot">${svg('info')} ${t('Раздел «Экзамен»')}</div>
      </a>
      <div class="section-label">${t('Сервисы')}</div>
      <div class="srv-grid">
        ${srvs.map((s) => `<button class="srv" data-href="${s[2]}">${svg(s[1])}<span>${t(s[0])}</span></button>`).join('')}
      </div>`;
    document.querySelectorAll('.srv').forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
  } catch (e) {
    document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`;
  }
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
      <div class="stud-group">${d.selfPos ? t('Вы на {n}-м месте из {total}', { n: d.selfPos, total: d.rows.length }) : t('Пока нет оценок в группе')}</div></div>
      <div class="card">
        ${d.rows.length ? d.rows.map((r, i) => `
          <div class="lstrow ${r.id === S.user.id ? 'me' : ''}" style="cursor:default">
            <div>${i + 1}. ${r.hidden ? `<span class="tx">${t('Студент скрыл себя в рейтинге')}</span>` : esc(r.fio)}${r.online ? `<span class="online-dot" title="${t('В сети')}"></span>` : ''}</div>
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
const EXAM_COLOR = { ku: 'incampus', arizona: 'intl' }; // палитра портала → цвет онлайн-экзамена
function examLaunchUrl() {
  const u = new URL(EXAM_SYNC_PATH, location.origin);
  u.searchParams.set('from', 'ku-portal');
  u.searchParams.set('back', location.origin + '/#/exam');
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
  const ov = document.createElement('div');
  ov.className = 'oe-ov';
  ov.setAttribute('role', 'status');
  ov.setAttribute('aria-live', 'polite');
  ov.innerHTML = `
    <div class="oe-ov-in">
      <div class="oe-bridge"><span class="oe-app ku">${svg(programOf(S.user).icon)}</span><span class="oe-track"><i></i></span><span class="oe-app ex">${svg('monitor')}</span></div>
      <div class="oe-ov-t">${t('Открываем онлайн-экзамен…')}</div>
      <div class="oe-ov-s">${t('Переходим в сервис экзаменов')}</div>
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
      <div class="oe-kicker">${t('Сервис экзаменов')}</div>
      <div class="oe-title">${t('Онлайн-экзамен')}</div>
      <div class="tx oe-lead">${teacher
        ? t('Отдельный сайт для проведения письменных экзаменов: тесты, writing, speaking и ведомость в одном месте.')
        : t('Отдельный сайт для сдачи экзамена онлайн: тесты, writing и запись на speaking в одном месте.')}</div>
      <div class="oe-status" id="oeStatus"><i></i><span>${t('Проверяем доступность сайта…')}</span></div>
      <a class="btn pri oe-go" id="oeGo" href="${esc(href)}">${svg('monitor')}${t('Перейти к онлайн-экзамену')}</a>
      <a class="btn ghost oe-new" href="${esc(href)}" target="_blank" rel="noopener">${svg('external')}${t('Открыть в новой вкладке')}</a>
    </div>
    <div class="oe-feat">
      ${EXAM_FEATURES[teacher ? 'teacher' : 'student'].map(([ic, ti, d]) => `
        <div class="card oe-fi"><span class="oe-fic">${svg(ic)}</span><div><b>${esc(t(ti))}</b><div class="tx">${esc(t(d))}</div></div></div>`).join('')}
    </div>
    <div class="card oe-note">
      <span class="oe-fic">${svg('info')}</span>
      <div class="tx"><b>${t('Вход на сайте экзаменов отдельный.')}</b> ${t('Используйте логин и пароль, которые выдал преподаватель. Вернуться в портал можно кнопкой «KU Portal» в верхней панели сайта экзаменов.')}</div>
    </div>
  </div>${navHTML('exam')}`;

  const st = document.getElementById('oeStatus');
  const setSt = (cls, text) => { if (!st.isConnected) return; st.className = 'oe-status ' + cls; st.querySelector('span').textContent = text; };
  fetch(EXAM_SYNC_PATH + 'api/state', { method: 'HEAD', cache: 'no-store' })
    .then((r) => setSt(r.ok ? 'ok' : 'bad', r.ok ? t('Сайт доступен') : t('Сайт экзаменов временно недоступен')))
    .catch(() => setSt('bad', t('Не удалось связаться с сайтом экзаменов')));

  document.getElementById('oeGo').addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // открыть в новой вкладке — как обычно
    e.preventDefault();
    examTransition(href);
  });
}

/* ============================ AI-помощник ============================ */
const AI_INIT = [{ role: 'assistant', content: 'Здравствуйте! Я AI-помощник Kozybayev University 🎓\n\nСпрашивайте что-нибудь о вузе: поступление, специальности, общежитие, расписание и т.д. Информацию беру с официального сайта ku.edu.kz.', fixed: true }];
/* Фиксированные ответы (приветствие, ответы сервера без модели) переводятся при выводе;
   ответы модели приходят на языке вопроса и не трогаются. */
function aiText(m) {
  if (m.role === 'user') return m.content;
  const pre = 'Нашёл на сайте ku.edu.kz:\n\n';
  if (m.content.startsWith(pre)) return t('Нашёл на сайте ku.edu.kz:') + '\n\n' + m.content.slice(pre.length);
  return tv(m.content);
}
let aiHistory = null;
/* Быстрые вопросы — показываются, пока в чате только приветствие */
const AI_SUGGEST = ['Как поступить в университет?', 'Какие есть специальности?', 'Есть ли общежитие?', 'Сколько стоит обучение?'];
async function viewAI() {
  stopPoll();
  aiHistory = aiHistory ? AI_INIT.concat(aiHistory.slice(AI_INIT.length)) : AI_INIT.slice();
  app.innerHTML = `
    <div class="chatpage">
      <div class="chathead">
        <div class="bird-avatar"><img src="/bird-idle.png" alt="" /></div>
        <div class="chathead-t">
          <b>${t('AI-помощник')}</b>
          <div class="st"><span class="dot" id="aidot"></span><span id="aist">${t('уточняю статус…')}</span></div>
        </div>
        <button class="chat-act" id="chatnew" type="button" title="${t('Новый чат')}">${svg('plus')}<span>${t('Новый чат')}</span></button>
        <a class="chat-act" href="#/" title="${t('На главную')}">${svg('back')}<span>${t('На главную')}</span></a>
      </div>
      <div class="chatbody" id="chatbody"><div class="chatwrap" id="chatwrap"></div></div>
      <div class="chatbar">
        <input class="inp" id="chatinp" placeholder="${t('Задайте вопрос…')}" autocomplete="off">
        <button class="sendbtn" id="chatsend" type="button" title="${t('Отправить')}">${svg('send')}<span>${t('Отправить')}</span></button>
      </div>
    </div>`;
  paintChat();
  const body = document.getElementById('chatbody');
  body.scrollTop = body.scrollHeight;
  const inp = document.getElementById('chatinp');
  inp.onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };
  document.getElementById('chatsend').onclick = () => sendChat();
  document.getElementById('chatnew').onclick = () => { aiHistory = AI_INIT.slice(); paintChat(); inp.focus(); };
  if (matchMedia('(min-width: 1024px)').matches) inp.focus();
  api('/ai/status').then((st) => {
    const dot = document.getElementById('aidot'), stt = document.getElementById('aist');
    if (!dot) return;
    if (st.online) { dot.classList.add('on'); stt.textContent = t('Gemma подключена · база KU: {n} фрагментов', { n: st.ctx }); }
    else stt.textContent = t('Gemma недоступна · проверьте соединение с LM Studio');
  }).catch(() => { });
}
function paintChat() {
  const w = document.getElementById('chatwrap');
  if (!w) return;
  w.innerHTML = aiHistory.map((m) => m.role === 'user'
    ? `<div class="msg user">${esc(aiText(m))}</div>`
    : `<div class="msgrow"><div class="ai-ava"><img src="/bird-idle.png" alt="" /></div><div class="msg bot">${esc(aiText(m))}${m.src ? `<div class="src">${esc(m.src)}</div>` : ''}</div></div>`
  ).join('') + (aiHistory.length === AI_INIT.length
    ? `<div class="ai-sugg">${AI_SUGGEST.map((q) => `<button class="ai-q" type="button" data-q="${esc(t(q))}">${esc(t(q))}</button>`).join('')}</div>`
    : '');
  w.querySelectorAll('.ai-q').forEach((b) => { b.onclick = () => sendChat(b.dataset.q); });
}
async function sendChat(preset) {
  const inp = document.getElementById('chatinp');
  if (!inp) return;
  const t = (typeof preset === 'string' ? preset : inp.value).trim();
  if (!t) return;
  inp.value = '';
  aiHistory.push({ role: 'user', content: t });
  paintChat();
  const w = document.getElementById('chatwrap');
  w.insertAdjacentHTML('beforeend', `<div class="msgrow" id="typing"><div class="ai-ava"><img src="/bird-idle.png" alt="" /></div><div class="msg bot"><span class="typing"><i></i><i></i><i></i></span></div></div>`);
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
  app.innerHTML = `${miniHead('Добавить занятие')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    const pb = document.getElementById('pagebody');
    if (!subs.items.length) {
      pb.innerHTML = `<div class="card next-empty">${t('У вас пока нет предметов.')}</div>`;
      return;
    }
    pb.innerHTML = `
      <div class="card">
        <label class="lbl">${t('Предмет')}</label>
        <select class="inp" id="scSubj">${subs.items.map((s) => `<option value="${s.id}">${esc(tv(s.name))}</option>`).join('')}</select>
        <label class="lbl">${t('Тип занятия')}</label>
        <select class="inp" id="scType">${['Лек.', 'Практ.', 'Лаб.'].map((x) => `<option value="${x}">${t(x)}</option>`).join('')}</select>
        <label class="lbl">${t('Группа')}</label>
        <input class="inp" id="scGroup" placeholder="${t('Например: ИСУ-26-2-а')}">
        <label class="lbl">${t('День недели')}</label>
        <select class="inp" id="scDay">${[0, 1, 2, 3, 4, 5].map((i) => `<option value="${i}">${esc(weekdayName(i))}</option>`).join('')}</select>
        <div class="row2">
          <div><label class="lbl">${t('Начало')}</label><input class="inp" id="scStart" type="time"></div>
          <div><label class="lbl">${t('Конец')}</label><input class="inp" id="scEnd" type="time"></div>
        </div>
        <label class="lbl">${t('Аудитория')}</label>
        <input class="inp" id="scRoom" placeholder="119 (1/1)">
        <button class="btn pri" id="scBtn">${t('Добавить занятие')}</button>
      </div>
      <div class="ptitle" style="padding:2px 0 10px">${t('Мои занятия')}</div>
      <div id="scList"></div>`;
    document.getElementById('scBtn').onclick = async () => {
      try {
        await api('/teacher/schedule', {
          method: 'POST',
          body: { subjectId: v('scSubj'), type: v('scType'), group: v('scGroup'), day: Number(v('scDay')), startTime: v('scStart'), endTime: v('scEnd'), room: v('scRoom') },
        });
        toast(t('Занятие добавлено')); paintScList();
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
    <div class="card" style="padding:14px"><div class="stud-fio" style="font-size:calc(16px * var(--fs))">${esc(tv(r.subject))} (${esc(tv(r.type))})</div>
    <div class="stud-group">${esc(weekdayName(r.day))} · ${esc(r.start)}-${esc(r.end)} · ${esc(t('ауд. {r}', { r: r.room || '—' }))} · ${esc(r.group)}</div></div>`).join('')
    : `<div class="card next-empty">${t('Занятий пока нет.')}</div>`;
}

/* --- преподаватель: оценки --- */
async function viewTGrades() {
  stopPoll();
  app.innerHTML = `${miniHead('Выставить оценки')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    if (!subs.items.length) return (document.getElementById('pagebody').innerHTML = `<div class="card next-empty">${t('У вас пока нет предметов.')}</div>`);
    document.getElementById('pagebody').innerHTML = `
      <div class="card">
        <label class="lbl">${t('Предмет')}</label>
        <select class="inp" id="gSubj">${subs.items.map((s) => `<option value="${s.id}">${esc(tv(s.name))}</option>`).join('')}</select>
        <label class="lbl">${t('Группа студентов')}</label>
        <div class="row2">
          <input class="inp" id="gGroup" placeholder="ИСУ-26-2-а" style="margin:0">
          <button class="btn ghost" id="gFind" style="max-width:120px">${t('Найти')}</button>
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
  box.innerHTML = `<div class="ptitle" style="padding:2px 0 10px">${t('Студенты ({n})', { n: d.items.length })}</div>` + (d.items.length
    ? d.items.map((s) => `
      <div class="card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div><div style="font-size:calc(15.5px * var(--fs))">${esc(s.fio)}${s.online ? `<span class="online-dot" title="${t('В сети')}"></span>` : ''}</div><div class="tx">${esc(s.group)}</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="inp small" style="margin:0;width:84px" placeholder="0-100" data-sc="${s.id}">
          <button class="badge" style="border:0;cursor:pointer;padding:9px 13px" data-put="${s.id}">${t('Выставить')}</button>
        </div>
      </div>`).join('')
    : `<div class="card next-empty">${t('Студентов такой группы нет.')}</div>`);
  box.querySelectorAll('[data-put]').forEach((b) => (b.onclick = async () => {
    const sid = b.dataset.put;
    const val = box.querySelector('[data-sc="' + sid + '"]').value;
    try {
      await api('/teacher/grades', { method: 'POST', body: { studentId: sid, subjectId: v('gSubj'), score: Number(val) } });
      toast(t('Оценка выставлена')); b.textContent = '✓'; b.disabled = true;
    } catch (e) { toast(e.message, true); }
  }));
}

/* ============================ Личный кабинет = профиль + все настройки ============================ */
/* Один экран: слева (на ноутбуке) карточка профиля и оглавление разделов, справа — разделы настроек.
   На телефоне оглавление — прокручиваемая строка чипов над разделами.
   Все разделы работают:
   - «Оформление», «Язык» — в браузере (ku_prefs:<id>, ku_lang), тема передаётся и в онлайн-экзамен;
   - «Уведомления» — в браузере: тост, звук, уведомления браузера, фильтры по типам (см. NOTIF);
   - «Безопасность», «Конфиденциальность», «Аккаунт» — на сервере (/api/settings, /api/auth/password, /api/2fa/*,
     /api/sessions*, /api/export, /api/account/delete). */
const CAB_SECTIONS = [
  ['appearance', 'palette', 'Оформление'],
  ['language', 'globe', 'Язык и регион'],
  ['notifications', 'bell', 'Уведомления'],
  ['security', 'shield', 'Безопасность'],
  ['privacy', 'eye', 'Конфиденциальность'],
  ['account', 'user', 'Аккаунт'],
];
const SRV_KEYS = ['showInRating', 'showOnline', 'loginAlerts']; // хранятся на сервере
let SRV = null; // { settings, twoFactor, passChangedAt, demo }
function prefVal(key) {
  if (SRV_KEYS.includes(key)) return !!(SRV && SRV.settings[key]);
  if (key === 'notifPush') return !!getPrefs().notifPush && 'Notification' in window && Notification.permission === 'granted';
  return !!getPrefs()[key];
}
function swRow(key, icon, title, sub, o) {
  o = o || {};
  const on = o.locked !== undefined ? o.locked : prefVal(key);
  return `<div class="set-row"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${t(title)}</b>${sub ? `<span class="tx">${o.raw ? sub : tv(sub)}</span>` : ''}</div>
    <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(t(title))}" data-sw="${key}" ${o.locked !== undefined ? 'disabled' : ''}><i></i></button></div>`;
}
function linkRow(icon, title, sub, act, cls) {
  return `<button class="set-row link ${cls || ''}" data-act="${act}"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${t(title)}</b>${sub ? `<span class="tx">${sub}</span>` : ''}</div><span class="chev">${svg('chev')}</span></button>`;
}
function segRow(key, icon, title, opts, cur) {
  if (cur === undefined) cur = getPrefs()[key];
  return `<div class="set-row wrap"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${t(title)}</b></div>
    <div class="seg2 txt" role="radiogroup" aria-label="${esc(t(title))}">${opts.map(([v, l]) => `<button role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-seg="${key}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}
function modePreview(m, cur) {
  return `<button class="mode-card ${cur === m ? 'on' : ''}" data-mode="${m}" role="radio" aria-checked="${cur === m}">
    <span class="mp mp-${m}"><i></i><i></i><i></i></span>
    <span class="mc-l">${svg(m === 'light' ? 'sun' : m === 'dark' ? 'moon' : 'device')}${t(MODES[m])}</span></button>`;
}
function secHead(id, title) {
  const ic = CAB_SECTIONS.find((s) => s[0] === id)[1];
  return `<h2>${svg(ic)}${t(title)}</h2>`;
}
function permText() {
  if (!('Notification' in window)) return t('Браузер не поддерживает уведомления');
  if (Notification.permission === 'granted') return t('Разрешено в браузере · когда вкладка свёрнута');
  if (Notification.permission === 'denied') return t('Запрещено в настройках браузера');
  return t('Когда вкладка свёрнута · нужно разрешение браузера');
}
async function viewProfile(section) {
  stopPoll();
  try { SRV = await api('/settings'); } catch { if (!S.user) return; }
  paintProfile(section);
}
function paintProfile(section) {
  const u = S.user, p = getPrefs(), pr = programOf(u);
  const autoName = t(PALETTES[pr.palette].name);
  const srv = SRV || { settings: {}, twoFactor: false, passChangedAt: null, demo: false };
  app.innerHTML = `
    ${miniHead('Личный кабинет')}
    <div id="pagebody" class="cab">
      <aside class="cab-side">
        <div class="card profcard">
          <div class="avatar">${esc(u.firstName.charAt(0).toUpperCase())}</div>
          <div class="pf-main">
            <div class="pf-fio">${esc(u.fio)}</div>
            <div class="pf-sub">${u.role === 'teacher' ? t('Преподаватель') : t('Студент')}${u.group ? ' · ' + esc(u.group) : ''}</div>
            <div class="pf-sub pf-mail">${esc(u.email)}</div>
            <span class="pill pf-uni">${svg(pr.icon)}${esc(pr.name)}</span>
          </div>
        </div>
        <nav class="cab-nav" aria-label="${t('Разделы настроек')}">
          ${CAB_SECTIONS.map(([id, ic, title]) => `<a href="#/profile/${id}" data-sec="${id}">${svg(ic)}<span>${t(title)}</span></a>`).join('')}
        </nav>
      </aside>
      <div class="cab-main">
        <section class="card set-sec" id="set-appearance">
          ${secHead('appearance', 'Оформление')}
          <div class="set-lbl">${t('Тема')}</div>
          <div class="mode-cards" role="radiogroup" aria-label="${t('Тема')}">${['light', 'dark', 'system'].map((m) => modePreview(m, p.mode)).join('')}</div>
          <div class="set-lbl">${t('Цвет сайта')}</div>
          <div class="swatches" role="radiogroup" aria-label="${t('Цвет сайта')}">
            <button class="swatch auto ${p.palette === 'auto' ? 'on' : ''}" data-pal="auto" role="radio" aria-checked="${p.palette === 'auto'}" title="${t('Авто')} · ${esc(autoName)}" style="--sw:${PALETTES[pr.palette].color}"><i></i><span>${t('Авто')}</span></button>
            ${Object.entries(PALETTES).map(([id, x]) => `<button class="swatch ${p.palette === id ? 'on' : ''}" data-pal="${id}" role="radio" aria-checked="${p.palette === id}" title="${esc(t(x.name))}" style="--sw:${x.color}"><i></i><span>${esc(t(x.name))}</span></button>`).join('')}
          </div>
          <div class="tx set-note">${esc(t('«Авто» — цвет вашей программы ({p}). Тема, цвет, размер текста и «меньше анимации» применяются и в онлайн-экзамене.', { p: pr.name }))}</div>
          ${segRow('fontSize', 'type', 'Размер текста', [['sm', t('Мелкий')], ['md', t('Обычный')], ['lg', t('Крупный')], ['xl', t('Очень крупный')]])}
          ${swRow('compact', 'device', 'Компактный режим', 'Плотнее карточки и списки')}
          ${swRow('reduceMotion', 'play', 'Меньше анимации', 'Отключить плавные переходы')}
        </section>

        <section class="card set-sec" id="set-language">
          ${secHead('language', 'Язык и регион')}
          ${segRow('lang', 'globe', 'Язык интерфейса', Object.entries(LANGS), getLang())}
          <div class="set-row"><span class="sr-ic">${svg('clock')}</span><div class="sr-t"><b>${t('Часовой пояс')}</b><span class="tx">${t('Астана, Костанай (UTC+5)')}</span></div></div>
          <div class="set-row"><span class="sr-ic">${svg('calendar')}</span><div class="sr-t"><b>${t('Начало недели')}</b><span class="tx">${esc(weekdayName(0))}</span></div></div>
        </section>

        <section class="card set-sec" id="set-notifications">
          ${secHead('notifications', 'Уведомления')}
          ${swRow('notifPush', 'bell', 'Уведомления браузера', esc(permText()), { raw: true })}
          ${u.role === 'student' ? swRow('notifGrades', 'star', 'Новые оценки', 'Когда преподаватель выставит балл') : ''}
          ${u.role === 'student' ? swRow('notifSchedule', 'calendar', 'Изменения в расписании', 'Новые занятия вашей группы') : ''}
          ${swRow('notifExam', 'clipboard', 'Экзамены', 'Когда в онлайн-экзамене открывается комната')}
          ${swRow('notifSound', 'speaker', 'Звук', 'Звуковой сигнал уведомлений')}
          ${linkRow('bell', 'Проверить уведомление', esc(t('Показать тестовое уведомление')), 'testNotif')}
          ${swRow('notifEmail', 'send', 'Email-рассылка', esc(t('Недоступно: на сервере не настроена отправка почты')), { locked: false, raw: true })}
        </section>

        <section class="card set-sec" id="set-security">
          ${secHead('security', 'Безопасность')}
          ${linkRow('lock', 'Сменить пароль', esc(srv.passChangedAt ? t('Последнее изменение: {d}', { d: fmtWhen(srv.passChangedAt) }) : t('Последнее изменение: при регистрации')), 'password')}
          ${linkRow('shield', 'Двухфакторная аутентификация', esc(srv.twoFactor ? t('Включена · код из приложения при входе') : t('Выключена · код из приложения при входе')), 'twofa')}
          ${swRow('loginAlerts', 'bell', 'Оповещать о новом входе', 'Уведомление в портале при входе с нового устройства')}
          ${linkRow('device', 'Активные сеансы', esc(t('Устройства, где выполнен вход')), 'sessions')}
        </section>

        <section class="card set-sec" id="set-privacy">
          ${secHead('privacy', 'Конфиденциальность')}
          ${u.role === 'student' ? swRow('showInRating', 'chart', 'Показывать меня в рейтинге группы', 'Если выключить — одногруппники увидят строку без имени') : ''}
          ${swRow('showOnline', 'users', 'Статус «в сети»', u.role === 'student' ? 'Видно преподавателям и группе' : 'Видно в списках портала')}
          ${linkRow('download', 'Скачать мои данные', esc(t('Оценки, расписание, профиль')) + ' · JSON', 'export')}
        </section>

        <section class="card set-sec" id="set-account">
          ${secHead('account', 'Аккаунт')}
          ${linkRow('info', 'О приложении', 'KU Portal v1.3', 'about')}
          ${linkRow('trash', 'Удалить аккаунт', esc(srv.demo ? t('Тестовый аккаунт удалить нельзя') : t('Безвозвратно, с подтверждением паролем')), 'delete', 'danger')}
          <button class="btn danger-ghost cab-out" id="outBtn">${t('Выйти из аккаунта')}</button>
        </section>
      </div>
    </div>
    ${navHTML('profile')}`;

  const pb = document.getElementById('pagebody');
  const rerender = () => { const y = window.scrollY; paintProfile(); window.scrollTo(0, y); };
  pb.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { setPref('mode', b.dataset.mode); rerender(); }));
  pb.querySelectorAll('[data-pal]').forEach((b) => (b.onclick = () => { setPref('palette', b.dataset.pal); rerender(); }));
  pb.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => {
    if (b.dataset.seg === 'lang') setLang(b.dataset.v); // язык — настройка устройства (i18n.js)
    else setPref(b.dataset.seg, b.dataset.v);
    rerender();
  }));
  pb.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = async () => {
    if (b.disabled) return;
    const key = b.dataset.sw, on = !b.classList.contains('on');
    const paint = (v) => { b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); };
    if (key === 'notifPush' && on && !(await askNotifPermission())) { rerender(); return; }
    paint(on);
    if (SRV_KEYS.includes(key)) {
      try { SRV.settings = (await api('/settings', { method: 'POST', body: { [key]: on } })).settings; }
      catch (e) { paint(!on); toast(e.message, true); }
    } else {
      setPref(key, on);
      if (key === 'notifPush') rerender();
      if (key === 'notifExam' && on) { NOTIF.examOpen = null; pollExams(); }
    }
  }));
  pb.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'about') toast('KU Portal v1.3 · ' + pr.name);
    else if (a === 'testNotif') testNotif();
    else if (a === 'password') changePasswordDlg(rerender);
    else if (a === 'twofa') twoFactorDlg(rerender);
    else if (a === 'sessions') sessionsDlg();
    else if (a === 'export') exportData();
    else if (a === 'delete') deleteAccountDlg();
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

/* ---------- Диалоги раздела «Безопасность» / «Конфиденциальность» / «Аккаунт» ---------- */
const formErr = (box, m) => { const e = box.querySelector('.err'); if (e) e.textContent = m || ''; };
function changePasswordDlg(done) {
  modal(t('Сменить пароль'), `
    <input class="inp" id="pwCur" type="password" autocomplete="current-password" placeholder="${t('Текущий пароль')}">
    <input class="inp" id="pwNew" type="password" autocomplete="new-password" placeholder="${t('Новый пароль (мин. 4 символа)')}">
    <input class="inp" id="pwNew2" type="password" autocomplete="new-password" placeholder="${t('Повторите новый пароль')}">
    <div class="tx">${t('После смены пароля вход на других устройствах будет завершён.')}</div>
    <div class="err"></div>
    <button class="btn pri" id="pwSave">${t('Сохранить')}</button>`, (box, close) => {
    box.querySelector('#pwSave').onclick = async () => {
      const cur = box.querySelector('#pwCur').value, nx = box.querySelector('#pwNew').value;
      if (nx !== box.querySelector('#pwNew2').value) return formErr(box, t('Пароли не совпадают'));
      try {
        const d = await api('/auth/password', { method: 'POST', body: { current: cur, next: nx } });
        if (SRV) SRV.passChangedAt = d.passChangedAt;
        close(); toast(t('Пароль изменён')); done && done();
      } catch (e) { formErr(box, e.message); }
    };
  });
}
function twoFactorDlg(done) {
  if (SRV && SRV.twoFactor) {
    return modal(t('Двухфакторная аутентификация'), `
      <div class="tx">${t('Чтобы выключить, введите пароль от аккаунта.')}</div>
      <input class="inp" id="tfPass" type="password" autocomplete="current-password" placeholder="${t('Пароль')}">
      <div class="err"></div>
      <button class="btn danger-ghost" id="tfOff">${t('Выключить')}</button>`, (box, close) => {
      box.querySelector('#tfOff').onclick = async () => {
        try { await api('/2fa/disable', { method: 'POST', body: { password: box.querySelector('#tfPass').value } }); SRV.twoFactor = false; close(); toast(t('Двухфакторная аутентификация выключена')); done && done(); }
        catch (e) { formErr(box, e.message); }
      };
    });
  }
  modal(t('Двухфакторная аутентификация'), `<div class="load">${t('Загрузка…')}</div>`, async (box, close) => {
    try {
      const d = await api('/2fa/setup', { method: 'POST', body: {} });
      box.innerHTML = `
        <ol class="tf-steps">
          <li>${t('Установите приложение-аутентификатор: Google Authenticator, Microsoft Authenticator, Aegis и т.п.')}</li>
          <li>${t('Добавьте аккаунт по ключу (ввести вручную) или откройте ссылку на телефоне:')}
            <div class="tf-key" id="tfKey">${esc(d.secret.replace(/(.{4})/g, '$1 ').trim())}</div>
            <div class="row2"><button class="btn ghost" id="tfCopy">${t('Скопировать ключ')}</button><a class="btn ghost" href="${esc(d.uri)}">${t('Открыть в приложении')}</a></div></li>
          <li>${t('Введите 6-значный код из приложения:')}</li>
        </ol>
        <input class="inp" id="tfCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">
        <div class="err"></div>
        <button class="btn pri" id="tfOn">${t('Включить')}</button>`;
      box.querySelector('#tfCopy').onclick = () => { try { navigator.clipboard.writeText(d.secret); toast(t('Ключ скопирован')); } catch { } };
      const on = async () => {
        try { await api('/2fa/enable', { method: 'POST', body: { code: box.querySelector('#tfCode').value } }); SRV.twoFactor = true; close(); toast(t('Двухфакторная аутентификация включена')); done && done(); }
        catch (e) { formErr(box, e.message); }
      };
      box.querySelector('#tfOn').onclick = on;
      box.querySelector('#tfCode').onkeydown = (e) => { if (e.key === 'Enter') on(); };
    } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  });
}
function sessionsDlg() {
  modal(t('Активные сеансы'), `<div class="load">${t('Загрузка…')}</div>`, async function paint(box) {
    try {
      const d = await api('/sessions');
      const others = d.items.filter((x) => !x.current).length + (d.legacy || 0);
      box.innerHTML = `<div class="sess">${d.items.map((x) => `
        <div class="sess-it">
          <span class="sr-ic">${svg('device')}</span>
          <div class="sr-t"><b>${esc(x.device || t('Неизвестное устройство'))}${x.current ? ` <span class="pill">${t('Это устройство')}</span>` : ''}</b>
            <span class="tx">${esc([x.ip, t('активность: {d}', { d: fmtWhen(x.lastSeen) })].filter(Boolean).join(' · '))}</span></div>
          ${x.current ? '' : `<button class="btn ghost sm" data-rv="${esc(x.sid)}">${t('Завершить')}</button>`}
        </div>`).join('')}</div>
        ${d.legacy ? `<div class="tx">${t('Ещё сеансов без сведений об устройстве: {n}', { n: d.legacy })}</div>` : ''}
        ${others ? `<button class="btn danger-ghost" id="rvAll" style="margin-top:10px">${t('Завершить все другие сеансы')}</button>` : `<div class="tx" style="margin-top:8px">${t('Других активных сеансов нет.')}</div>`}`;
      box.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = async () => { try { await api('/sessions/revoke', { method: 'POST', body: { sid: b.dataset.rv } }); toast(t('Сеанс завершён')); paint(box); } catch (e) { toast(e.message, true); } }));
      const all = box.querySelector('#rvAll');
      if (all) all.onclick = async () => { try { const r = await api('/sessions/revoke', { method: 'POST', body: { all: true } }); toast(t('Завершено сеансов: {n}', { n: r.revoked })); paint(box); } catch (e) { toast(e.message, true); } };
    } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  });
}
async function exportData() {
  try {
    const r = await fetch('/api/export', { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok) throw new Error(t('Не удалось скачать данные'));
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ku-portal-${S.user.id}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('Файл с данными скачан'));
  } catch (e) { toast(e.message, true); }
}
function deleteAccountDlg() {
  if (SRV && SRV.demo) return toast(t('Тестовый аккаунт удалить нельзя'), true);
  modal(t('Удалить аккаунт'), `
    <div class="tx">${t('Аккаунт, оценки и настройки будут удалены безвозвратно. Для подтверждения введите пароль.')}</div>
    <input class="inp" id="delPass" type="password" autocomplete="current-password" placeholder="${t('Пароль')}">
    <div class="err"></div>
    <button class="btn danger-ghost" id="delGo">${t('Удалить навсегда')}</button>`, (box, close) => {
    box.querySelector('#delGo').onclick = async () => {
      try {
        await api('/account/delete', { method: 'POST', body: { password: box.querySelector('#delPass').value } });
        close();
        try { localStorage.removeItem(prefsKey()); localStorage.removeItem('ku_theme'); } catch { }
        localStorage.removeItem('ku_token'); S.token = null; S.user = null; SRV = null; stopNotif();
        toast(t('Аккаунт удалён')); goHome();
      } catch (e) { formErr(box, e.message); }
    };
  });
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { }
  localStorage.removeItem('ku_token'); S.token = null; S.user = null; aiHistory = null; stopNotif(); goHome();
}

/* ============================ Заглушки ============================ */
function viewStub(name) {
  app.innerHTML = `
    ${miniHead(name)}
    <div class="stub">${svg('building')}<b>${esc(t(name))}</b>${t('Раздел в разработке.')}<br>${t('Скоро здесь появятся сервисы университета.')}</div>
    ${navHTML()}`;
}

/* ============================ Роутер ============================ */
function route() {
  stopPoll();
  applyTheme(); // цвета пользователя; до входа и после выхода — KU
  if (!S.user) { stopNotif(); return viewAuth(); }
  startNotif();
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
    // демо-сервисы студента (public/services.js)
    case 'credit': return viewCredit();
    case 'attendance': return viewAttendance();
    case 'dorm': return viewDorm();
    case 'voting': return viewVoting();
    case 'library': return viewLibrary();
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
