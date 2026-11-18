'use strict';
/* KU Message — мессенджер Kozybayev University (отдельное приложение под /ku-message/ на сервере портала).
 * core.js — состояние, API, вход, оформление, файлы, уведомления; views.js — экраны.
 *
 * Вход: портал передаёт одноразовый код в адресе после # (#code=…), он обменивается на свой сеанс
 * (/api/message/redeem) — пароль заново не нужен. Вместе с кодом приходят оформление и язык портала
 * (theme, mode, lang) и адрес возврата (back). API — /api/message/*, /api/files, /api/settings, /api/inbox.
 */
const app = document.getElementById('app');
const M = { token: null, user: null, srv: null, tab: 'subjects', ch: null, list: null, q: '' };
const PORTAL_URL = 'https://sakeda-hub.github.io/ku-portal/'; // если портал не передал адрес возврата

/* ------------------------------ Иконки ------------------------------ */
const I = {
  /* логотип KU Message — две реплики диалога (как «шапочка» у онлайн-экзамена) */
  logo: '<path d="M3.5 6.2a2.2 2.2 0 0 1 2.2-2.2h8.6a2.2 2.2 0 0 1 2.2 2.2v5.1a2.2 2.2 0 0 1-2.2 2.2H9.2L5.8 16.3v-2.8h-.1a2.2 2.2 0 0 1-2.2-2.2z"/><path d="M19.6 9.4h.2a2 2 0 0 1 2 2v4.6a2 2 0 0 1-2 2h-.3v2.6l-3.1-2.6h-4.3a2 2 0 0 1-1.9-1.4"/><path d="M7.2 8.6h5.6"/>',
  user: '<circle cx="12" cy="8.3" r="3.8"/><path d="M5.6 20a6.4 6.4 0 0 1 12.8 0"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.6 1.8-1.6h2c2.2 0 3.9-1.7 3.9-3.9 0-3.9-3.8-7-8.5-7z"/><circle cx="7.6" cy="11.3" r="1.1"/><circle cx="10.4" cy="7.6" r="1.1"/><circle cx="15" cy="7.9" r="1.1"/>',
  bell: '<path d="M6.2 10.2a5.8 5.8 0 1 1 11.6 0c0 2.9.7 4.5 1.4 5.3.4.4.1 1.1-.5 1.1H5.3c-.6 0-.9-.7-.5-1.1.7-.8 1.4-2.4 1.4-5.3z"/><path d="M10.4 19.7a1.9 1.9 0 0 0 3.2 0"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.3 2.4 3.4 5.3 3.4 8.6s-1.1 6.2-3.4 8.6c-2.3-2.4-3.4-5.3-3.4-8.6s1.1-6.2 3.4-8.6z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  moon: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
  device: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7M12 16v4"/>',
  book: '<path d="M12 6.6C10.5 5.1 8.6 4.3 6.2 4.3c-1.1 0-2 .2-2.7.5v13.4c.8-.3 1.7-.5 2.7-.5 2.4 0 4.3.9 5.8 2.4 1.5-1.5 3.4-2.4 5.8-2.4 1 0 1.9.2 2.7.5V4.8c-.8-.3-1.7-.5-2.7-.5-2.4 0-4.3.9-5.8 2.4z"/><path d="M12 6.6v13.5"/>',
  chat: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h-1z"/>',
  users: '<circle cx="9" cy="8.4" r="3.3"/><path d="M3.4 19.5a5.6 5.6 0 0 1 11.2 0"/><path d="M15.6 5.4a3.2 3.2 0 0 1 0 6.1M17.4 14.3a5.5 5.5 0 0 1 3.2 5.2"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.4 7.4 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  home: '<path d="M4 11.3 12 4.4l8 6.9"/><path d="M6.6 9.9v9.6h10.8V9.9"/>',
  send: '<path d="M20.5 3.5 10.3 13.7M20.5 3.5 14 20.5l-3.7-6.8L3.5 10z"/>',
  clip: '<path d="M20 11.5 12.3 19.2a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checks: '<path d="m2.5 12.5 4.5 4.5L16.5 7.5"/><path d="m11 16.5.5.5L21 7.5"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2c.1.8.7 1.3 1.5 1.3h6.2c.8 0 1.4-.5 1.5-1.3L17.5 7"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.1 1.9"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v12.5H7z"/><path d="M14 3.5V8h4.5"/>',
  quote: '<path d="M5 18h4.5v-5H6.5c0-2.5 1-4 3-4.5V6C6.5 6.5 5 9 5 13zM14 18h4.5v-5h-3c0-2.5 1-4 3-4.5V6c-3 .5-4.5 3-4.5 7z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.3 10.5V7.8a3.7 3.7 0 0 1 7.4 0v2.7"/>',
};
function svg(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`; }

/* ------------------------------ Хелперы ------------------------------ */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const isoOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const todayIso = () => isoOf(Date.now());
const LOC = () => ({ en: 'en-GB', kk: 'kk-KZ' }[getLang()] || 'ru-RU');
const timeOf = (ts) => new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
const whenShort = (ts) => (!ts ? '' : isoOf(ts) === todayIso() ? timeOf(ts) : fmtDay(isoOf(ts)));
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' ' + t('МБ') : Math.max(1, Math.round(n / 1024)) + ' ' + t('КБ'));
const daysLeft = (iso) => Math.round((new Date(iso + 'T00:00') - new Date(todayIso() + 'T00:00')) / 864e5);
function initials(fio) { const w = String(fio || '?').trim().split(/\s+/); return esc(((w[1] || '')[0] || '') + ((w[0] || '?')[0])).toUpperCase(); }
/* Только **жирный** и ссылки; всё остальное — экранированный текст */
function md(s) {
  return esc(s).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
function toast(text, isErr) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function modal(title, bodyHTML, onMount) {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="dlg-h"><b>${esc(title)}</b><button class="ib" data-x aria-label="${t('Закрыть')}">${svg('x')}</button></div>
    <div class="dlg-b">${bodyHTML}</div></div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  const f = ov.querySelector('input:not([type=checkbox]), textarea'); if (f) setTimeout(() => f.focus(), 50);
  if (onMount) onMount(ov.querySelector('.dlg-b'), close);
  return close;
}
async function api(path, o) {
  o = o || {};
  o.headers = Object.assign({ 'Content-Type': 'application/json' }, M.token ? { Authorization: 'Bearer ' + M.token } : {});
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch('/api' + path, o);
  if (r.status === 401 && M.token && path !== '/message/redeem') { signOut(true); throw new Error(t('Сессия истекла')); }
  const j = await r.json().catch(() => ({ error: 'Ошибка сервера' }));
  if (!r.ok) throw new Error(tv(j.error || 'Ошибка сервера'));
  return j;
}

/* ------------------------------ Оформление ------------------------------
   По умолчанию — как в KU Portal (тема и цвет приходят при переходе); в настройках можно выбрать свои тему и цвет. */
const PALETTES = { ku: '#05a4ba', arizona: '#006FBF', emerald: '#1f9d6b', violet: '#6d4bd8', coral: '#e0603f', graphite: '#3f4a56', pink: '#d63384' };
const PREF_DEFAULTS = { followPortal: true, mode: 'light', palette: 'auto', enterSend: true, previews: true, sound: true, push: false };
const prefsKey = () => 'kum_prefs:' + (M.user ? M.user.id : 'guest');
function getPrefs() { try { return Object.assign({}, PREF_DEFAULTS, JSON.parse(localStorage.getItem(prefsKey()) || '{}')); } catch { return Object.assign({}, PREF_DEFAULTS); } }
function setPref(k, v) { const p = getPrefs(); p[k] = v; try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch { } applyTheme(); }
let portalLook = null;
try { portalLook = JSON.parse(sessionStorage.getItem('kum_look') || 'null'); } catch { }
function applyTheme() {
  const p = getPrefs(), look = p.followPortal && portalLook ? portalLook : null;
  const program = M.user && M.user.program === 'arizona' ? 'arizona' : 'ku';
  const own = PALETTES[p.palette] ? p.palette : program; // «Авто» — цвет программы пользователя
  const palette = look ? (PALETTES[look.palette] ? look.palette : program) : own;
  const mode = look ? look.mode : p.mode;
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const r = document.documentElement;
  if (palette !== 'ku') r.dataset.palette = palette; else delete r.dataset.palette;
  if (dark) r.dataset.mode = 'dark'; else delete r.dataset.mode;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#16191d' : '#ffffff';
  try { localStorage.setItem('kum_theme', JSON.stringify({ palette, dark })); } catch { }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ------------------------------ Файлы ------------------------------ */
const FILE_LIMIT = 10 * 1024 * 1024;
const FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.odt,.odp,.ods,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.7z';
function pickFile() {
  return new Promise((resolve) => { const i = document.createElement('input'); i.type = 'file'; i.accept = FILE_ACCEPT; i.onchange = () => resolve(i.files[0] || null); i.click(); });
}
async function uploadFile(file) {
  if (file.size > FILE_LIMIT) throw new Error(t('Файл больше 10 МБ'));
  const data = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error(t('Не удалось прочитать файл')));
    fr.readAsDataURL(file);
  });
  return api('/files', { method: 'POST', body: { name: file.name, data } });
}
async function downloadFile(id, name) {
  try {
    const r = await fetch('/api/files/' + id, { headers: { Authorization: 'Bearer ' + M.token } });
    if (!r.ok) throw new Error(t('Файл не найден'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob()); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { toast(e.message, true); }
}
function fileCard(f) {
  const ext = (f.name.split('.').pop() || '').toLowerCase().slice(0, 4);
  return `<button class="file" type="button" data-file="${esc(f.id)}" data-name="${esc(f.name)}"><span class="file-ic">${esc(ext)}</span><span class="file-t"><b>${esc(f.name)}</b><small>${fmtSize(f.size)}</small></span></button>`;
}
function bindFiles(root) { root.querySelectorAll('[data-file]').forEach((b) => (b.onclick = () => downloadFile(b.dataset.file, b.dataset.name))); }

/* ------------------------------ Уведомления ------------------------------
   Источник — /api/inbox портала: личные сообщения, новые лекции и практики, задания. Тост, звук, уведомление браузера. */
const NOTIF = { seen: null, timer: null };
function notifText(n) {
  if (n.type === 'msg') return [t('Новое сообщение'), [n.from, n.text].filter(Boolean).join(': ')];
  if (n.type === 'material') return [t('Новый материал'), `${tv(n.subject)} — ${n.title}`];
  if (n.type === 'task') return [n.moved ? t('Срок задания изменён') : t('Новое задание'), `${tv(n.subject)} — ${n.title}${n.due ? ' · ' + t('до {d}', { d: fmtDay(n.due) }) : ''}`];
  return null;
}
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime;
    o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    o.start(t0); o.stop(t0 + 0.26);
  } catch { }
}
async function pollInbox() {
  if (!M.user) return;
  try {
    const d = await api('/inbox');
    const fresh = NOTIF.seen ? d.items.filter((x) => !x.read && !NOTIF.seen.has(x.id)) : [];
    NOTIF.seen = new Set(d.items.map((x) => x.id));
    const p = getPrefs();
    fresh.reverse().map(notifText).filter(Boolean).forEach(([title, body]) => {
      toast(`${title}: ${body}`);
      if (p.sound) chime();
      if (p.push && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        try { new Notification(title, { body, icon: '../bird-idle.png' }); } catch { }
      }
    });
  } catch { }
}

/* ------------------------------ Вход и запуск ------------------------------ */
function safeBack(u) {
  try {
    const x = new URL(u, location.href);
    if (!/^https?:$/.test(x.protocol)) return null;
    return x.origin === location.origin || /\.github\.io$/i.test(x.hostname) || x.hostname === 'localhost' || x.hostname === '127.0.0.1' ? x.href : null;
  } catch { return null; }
}
function backUrl() { try { return safeBack(localStorage.getItem('kum_back') || '') || PORTAL_URL; } catch { return PORTAL_URL; } }
/* Параметры перехода из портала (#code=…&theme=…&mode=…&lang=…&back=…). Адрес вида #/… — раздел KU Message. */
function readLaunchParams() {
  if (!location.hash || location.hash.startsWith('#/')) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('mode')) { portalLook = { palette: h.get('theme') || '', mode: h.get('mode') }; try { sessionStorage.setItem('kum_look', JSON.stringify(portalLook)); } catch { } }
  if (h.get('lang')) setLang(h.get('lang'));
  const back = safeBack(h.get('back') || ''); if (back) { try { localStorage.setItem('kum_back', back); } catch { } }
  history.replaceState(null, '', location.pathname); // код одноразовый — убрать из адреса и истории
  return h.get('code');
}
function signOut(expired) {
  try { localStorage.removeItem('kum_token'); } catch { }
  M.token = null; M.user = null;
  if (NOTIF.timer) clearInterval(NOTIF.timer);
  stopTimers();
  viewLogin(expired ? t('Сессия истекла — войдите снова') : '');
}
async function enter(token) {
  M.token = token; localStorage.setItem('kum_token', token);
  M.user = (await api('/me')).user;
  M.srv = await api('/settings');
  M.tab = 'subjects';
  applyTheme();
  pollInbox(); NOTIF.timer = setInterval(pollInbox, 20000);
  startApp();
}
async function boot() {
  const code = readLaunchParams();
  applyTheme();
  try {
    if (code) return await enter((await api('/message/redeem', { method: 'POST', body: { code } })).token);
    const token = localStorage.getItem('kum_token') || localStorage.getItem('ku_token'); // ku_token — портал на этом же адресе
    if (!token) return viewLogin();
    await enter(token);
  } catch (e) { viewLogin(e.message); }
}
window.addEventListener('load', boot);
