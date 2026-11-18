'use strict';
/* KU Connect — мессенджер Kozybayev University (отдельный портал под /connect/ на сервере KU Portal).
 * core.js — состояние, API, вход, настройки и тема, уведомления, разметка сообщений.
 * views.js — экраны (лента, чат, канал, задания, центр, настройки); tools.js — инструменты по направлениям.
 *
 * Вход: из KU Portal приходит одноразовый код в адресе после # (#code=…), он обменивается на свой сеанс
 * (/api/connect/redeem) — заново вводить пароль не нужно. Вместе с кодом приходят оформление и язык портала
 * (theme, mode, fs, still, lang) и адрес возврата (back) — как при переходе в онлайн-экзамен.
 * Данные — общий API портала (/api/chat/*, /api/settings, /api/inbox); тексты — словарь портала (../i18n.js).
 */
const app = document.getElementById('app');
const C = { token: null, user: null, srv: null, sec: 'chats', ch: null, filter: 'all', q: '', list: null, overview: null, inbox: [], unread: 0 };
const PORTAL_URL = 'https://sakeda-hub.github.io/ku-portal/'; // если портал не передал адрес возврата

/* ------------------------------ Иконки ------------------------------ */
const I = {
  logo: '<path d="M7 19V5h2.6v6.2L15 5h3.1l-5.4 6.6L18.6 19h-3.2l-5.8-6.4V19H7z" fill="currentColor" stroke="none"/>',
  chat: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h-1z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
  tasks: '<path d="M5.5 4.7h13a1.5 1.5 0 0 1 1.5 1.5v13.3a1.5 1.5 0 0 1-1.5 1.5h-13a1.5 1.5 0 0 1-1.5-1.5V6.2a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M9 3h6v3.4H9z"/><path d="M8.7 13.4l2.2 2.2 4.4-4.6"/>',
  bell: '<path d="M6.2 10.2a5.8 5.8 0 1 1 11.6 0c0 2.9.7 4.5 1.4 5.3.4.4.1 1.1-.5 1.1H5.3c-.6 0-.9-.7-.5-1.1.7-.8 1.4-2.4 1.4-5.3z"/><path d="M10.4 19.7a1.9 1.9 0 0 0 3.2 0"/>',
  inbox: '<path d="M4 13.5 6.5 5h11L20 13.5V19H4z"/><path d="M4 13.5h4.5a3.5 3.5 0 0 0 7 0H20"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5l-5 5a1.6 1.6 0 0 0 2.3 2.3l5-5a4 4 0 0 0 5-5.4l-2.4 2.4-2.2-.6-.6-2.2z"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.4 7.4 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chev: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  send: '<path d="M20.5 3.5 10.3 13.7M20.5 3.5 14 20.5l-3.7-6.8L3.5 10z"/>',
  clip: '<path d="M20 11.5 12.3 19.2a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/>',
  book: '<path d="M12 6.6C10.5 5.1 8.6 4.3 6.2 4.3c-1.1 0-2 .2-2.7.5v13.4c.8-.3 1.7-.5 2.7-.5 2.4 0 4.3.9 5.8 2.4 1.5-1.5 3.4-2.4 5.8-2.4 1 0 1.9.2 2.7.5V4.8c-.8-.3-1.7-.5-2.7-.5-2.4 0-4.3.9-5.8 2.4z"/><path d="M12 6.6v13.5"/>',
  hash: '<path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M4 15h15"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checks: '<path d="m2.5 12.5 4.5 4.5L16.5 7.5"/><path d="m11 16.5.5.5L21 7.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2c.1.8.7 1.3 1.5 1.3h6.2c.8 0 1.4-.5 1.5-1.3L17.5 7"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
  star: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8 2.5-5.2z"/>',
  flag: '<path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11"/>',
  eye: '<path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.1 1.9"/>',
  code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  flask: '<path d="M9.5 3.5h5M10.3 3.5v5.2L5 18.2A1.6 1.6 0 0 0 6.4 20.5h11.2a1.6 1.6 0 0 0 1.4-2.3l-5.3-9.5V3.5"/><path d="M7.5 14.5h9"/>',
  calc: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h1M12 12h1M15.5 12h0M8.5 15.5h1M12 15.5h1M15.5 15.5v1.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  quote: '<path d="M5 18h4.5v-5H6.5c0-2.5 1-4 3-4.5V6C6.5 6.5 5 9 5 13zM14 18h4.5v-5h-3c0-2.5 1-4 3-4.5V6c-3 .5-4.5 3-4.5 7z"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M9.5 2.5h5"/>',
  shield: '<path d="M12 3.2 5 6v5.6c0 4.3 3 7.9 7 9.2 4-1.3 7-4.9 7-9.2V6z"/><path d="m9 12 2.2 2.2L15.3 10"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.6 1.8-1.6h2c2.2 0 3.9-1.7 3.9-3.9 0-3.9-3.8-7-8.5-7z"/><circle cx="7.6" cy="11.3" r="1.1"/><circle cx="10.4" cy="7.6" r="1.1"/><circle cx="15" cy="7.9" r="1.1"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.3 2.4 3.4 5.3 3.4 8.6s-1.1 6.2-3.4 8.6c-2.3-2.4-3.4-5.3-3.4-8.6s1.1-6.2 3.4-8.6z"/>',
  user: '<circle cx="12" cy="8.3" r="3.8"/><path d="M5.6 20a6.4 6.4 0 0 1 12.8 0"/>',
  users: '<circle cx="9" cy="8.4" r="3.3"/><path d="M3.4 19.5a5.6 5.6 0 0 1 11.2 0"/><path d="M15.6 5.4a3.2 3.2 0 0 1 0 6.1M17.4 14.3a5.5 5.5 0 0 1 3.2 5.2"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  moon: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
  device: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7M12 16v4"/>',
  portal: '<path d="M4 11.3 12 4.4l8 6.9"/><path d="M6.6 9.9v9.6h10.8V9.9"/>',
  megaphone: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9a4 4 0 0 1 0 6"/>',
  out: '<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.3 10.5V7.8a3.7 3.7 0 0 1 7.4 0v2.7"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
function svg(name, cls) {
  return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`;
}

/* ------------------------------ Хелперы ------------------------------ */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const isoOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const todayIso = () => isoOf(Date.now());
const LOC = () => ({ en: 'en-GB', kk: 'kk-KZ' }[getLang()] || 'ru-RU');
const timeOf = (ts) => new Date(ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
function whenShort(ts) {
  if (!ts) return '';
  if (isoOf(ts) === todayIso()) return timeOf(ts);
  const d = new Date(ts);
  return Date.now() - ts < 6 * 864e5 ? weekdayName((d.getDay() + 6) % 7).slice(0, 2) : fmtDay(isoOf(ts));
}
function fmtWhen(ts) { return ts ? new Date(ts).toLocaleString(LOC(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' ' + t('МБ') : Math.max(1, Math.round(n / 1024)) + ' ' + t('КБ'); }
/* Аватар: инициалы на цвете, стабильном для человека */
function avatar(fio, id, cls) {
  let h = 0; for (const ch of String(id || fio)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const words = String(fio || '?').trim().split(/\s+/);
  const ini = esc((words[1] ? words[1][0] : '') + (words[0] ? words[0][0] : '?')).toUpperCase();
  return `<span class="ava ${cls || ''}" style="--h:${h % 360}">${ini}</span>`;
}
function toast(text, isErr) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, 3200);
}
function modal(title, bodyHTML, onMount, wide) {
  const ov = document.createElement('div');
  ov.className = 'mdl-ov';
  ov.innerHTML = `<div class="mdl ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mdl-h"><b>${esc(title)}</b><button class="icon-btn" data-x aria-label="${t('Закрыть')}">${svg('x')}</button></div>
    <div class="mdl-b">${bodyHTML}</div></div>`;
  const close = () => { ov.classList.remove('on'); setTimeout(() => ov.remove(), 180); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  const f = ov.querySelector('input, textarea'); if (f) setTimeout(() => f.focus(), 60);
  if (onMount) onMount(ov.querySelector('.mdl-b'), close);
  return close;
}
async function api(path, o) {
  o = o || {};
  o.headers = Object.assign({ 'Content-Type': 'application/json' }, C.token ? { Authorization: 'Bearer ' + C.token } : {});
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch('/api' + path, o);
  if (r.status === 401 && C.token && path !== '/connect/redeem') { signOut(true); throw new Error(t('Сессия истекла')); }
  const j = await r.json().catch(() => ({ error: 'Ошибка сервера' }));
  if (!r.ok) throw new Error(tv(j.error || 'Ошибка сервера'));
  return j;
}

/* ------------------------------ Настройки устройства и тема ------------------------------ */
const PALETTES = { ku: '#05a4ba', arizona: '#006FBF', emerald: '#1f9d6b', violet: '#6d4bd8', coral: '#e0603f', graphite: '#3f4a56', pink: '#d63384' };
const PALETTE_NAMES = { ku: 'Kozybayev', arizona: 'Arizona', emerald: 'Изумрудный', violet: 'Фиолетовый', coral: 'Коралловый', graphite: 'Графит', pink: 'Розовый' };
const PREF_DEFAULTS = {
  followPortal: true, palette: 'auto', mode: 'light', fs: 'md', compact: false, still: false, wallpaper: 'dots',
  enterSend: true, previews: true, sound: true, push: false, notifChat: true, notifTasks: true,
};
const prefsKey = () => 'kuc_prefs:' + (C.user ? C.user.id : 'guest');
function getPrefs() { try { return Object.assign({}, PREF_DEFAULTS, JSON.parse(localStorage.getItem(prefsKey()) || '{}')); } catch { return Object.assign({}, PREF_DEFAULTS); } }
function setPref(k, v) {
  const p = getPrefs(); p[k] = v;
  try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch { }
  applyTheme();
}
/* Оформление портала, пришедшее при переходе (theme/mode/fs/still) — применяется, пока включено «Как в KU Portal» */
let portalLook = null;
try { portalLook = JSON.parse(sessionStorage.getItem('kuc_portal_look') || 'null'); } catch { }
function resolvedTheme() {
  const p = getPrefs();
  const src = p.followPortal && portalLook ? portalLook : p;
  const program = C.user && C.user.program === 'arizona' ? 'arizona' : 'ku';
  const palette = PALETTES[src.palette] ? src.palette : program;
  const mode = src.mode || 'light';
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  return { palette, dark, mode, fs: src.fs || 'md', still: !!src.still || !!p.still, compact: !!p.compact, wallpaper: p.wallpaper };
}
function applyTheme() {
  const th = resolvedTheme(), r = document.documentElement;
  if (th.palette !== 'ku') r.dataset.palette = th.palette; else delete r.dataset.palette;
  if (th.dark) r.dataset.mode = 'dark'; else delete r.dataset.mode;
  if (th.fs !== 'md') r.dataset.fs = th.fs; else delete r.dataset.fs;
  r.toggleAttribute('data-still', th.still);
  r.toggleAttribute('data-compact', th.compact);
  r.dataset.wall = th.wallpaper || 'dots';
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = th.dark ? '#111418' : PALETTES[th.palette];
  try { localStorage.setItem('kuc_theme', JSON.stringify({ palette: th.palette, dark: th.dark, fs: th.fs })); } catch { }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ------------------------------ Разметка сообщений ------------------------------
   Без HTML от пользователя: всё экранируется, поддерживаются ```код```, `код`, **жирный**, ссылки. */
const CODE_KW = {
  python: 'def class return if elif else for while in import from as with try except finally raise lambda yield None True False and or not is pass break continue print',
  js: 'const let var function return if else for while of in new class extends import from export default async await try catch finally throw null undefined true false this typeof',
  sql: 'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE PRIMARY KEY FOREIGN REFERENCES JOIN LEFT RIGHT INNER ON GROUP BY ORDER HAVING LIMIT AND OR NOT NULL AS DISTINCT COUNT SUM AVG',
  bash: 'cd ls echo export sudo git npm pip python cat grep if then fi for do done',
};
function highlight(code, lang) {
  const kw = new Set((CODE_KW[lang] || CODE_KW.js).split(' ').map((w) => (lang === 'sql' ? w.toUpperCase() : w)));
  const re = /(#[^\n]*|\/\/[^\n]*|--[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const [tok, cm, str, num, word] = m;
    const comment = cm && (lang === 'python' || lang === 'bash' ? cm[0] === '#' : lang === 'sql' ? cm.startsWith('--') : cm.startsWith('//'));
    if (comment) out += `<i class="tk-c">${esc(tok)}</i>`;
    else if (str) out += `<i class="tk-s">${esc(tok)}</i>`;
    else if (num) out += `<i class="tk-n">${esc(tok)}</i>`;
    else if (word && kw.has(lang === 'sql' ? word.toUpperCase() : word)) out += `<i class="tk-k">${esc(tok)}</i>`;
    else out += esc(tok);
    last = m.index + tok.length;
  }
  return out + esc(code.slice(last));
}
function inlineMd(s) {
  return esc(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
function md(text) {
  const parts = String(text || '').split(/```(\w*)\n?([\s\S]*?)```/g);
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    let txt = parts[i];
    if (i > 0) txt = txt.replace(/^\n/, ''); // переносы вокруг блока кода не превращаются в пустые строки
    if (i + 2 < parts.length) txt = txt.replace(/\n$/, '');
    out += inlineMd(txt);
    if (i + 2 < parts.length) {
      const lang = (parts[i + 1] || '').toLowerCase(), code = parts[i + 2].replace(/\n$/, '');
      out += `<div class="code"><div class="code-h"><span>${esc(lang || t('код'))}</span><button type="button" data-copy title="${t('Копировать')}">${svg('clip')}${t('Копировать')}</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`;
    }
  }
  return out;
}
function bindCopy(root) {
  root.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => {
    const code = b.closest('.code').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => toast(t('Скопировано')), () => toast(t('Не удалось скопировать'), true));
  }));
}

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
    const r = await fetch('/api/files/' + id, { headers: { Authorization: 'Bearer ' + C.token } });
    if (!r.ok) throw new Error(t('Файл не найден'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob()); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { toast(e.message, true); }
}
const FILE_KIND = (n) => /\.(docx?|odt|rtf)$/i.test(n) ? 'doc' : /\.(pptx?|odp)$/i.test(n) ? 'ppt' : /\.(xlsx?|ods|csv)$/i.test(n) ? 'xls' : /\.pdf$/i.test(n) ? 'pdf' : /\.(png|jpe?g|gif|webp)$/i.test(n) ? 'img' : 'zip';
function fileCard(f) {
  return `<button class="file f-${FILE_KIND(f.name)}" type="button" data-file="${esc(f.id)}" data-name="${esc(f.name)}"><span class="file-ic">${esc((f.name.split('.').pop() || '').slice(0, 4))}</span><span class="file-t"><b>${esc(f.name)}</b><small>${fmtSize(f.size)} · ${t('скачать')}</small></span></button>`;
}
function bindFiles(root) { root.querySelectorAll('[data-file]').forEach((b) => (b.onclick = () => downloadFile(b.dataset.file, b.dataset.name))); }

/* ------------------------------ Уведомления ------------------------------
   Источник — /api/inbox портала. Показ — по настройкам: тост, звук, уведомление браузера (вкладка свёрнута).
   Статус «Не беспокоить» глушит всплывающие уведомления (счётчики остаются). */
const NOTIF = { seen: null, timer: null };
const NOTIF_PREF = { msg: 'notifChat', task: 'notifTasks', material: 'notifTasks' };
function notifText(n) {
  if (n.type === 'msg') return { title: t('Новое сообщение'), body: [n.from, n.text].filter(Boolean).join(': ') };
  if (n.type === 'material') return { title: n.important ? t('Важный материал') : t('Новый материал'), body: `${tv(n.subject)} — ${n.title}` };
  if (n.type === 'task') return { title: n.moved ? t('Срок задания изменён') : t('Новое задание'), body: `${tv(n.subject)} — ${n.title}${n.due ? ' · ' + t('до {d}', { d: fmtDay(n.due) }) : ''}` };
  if (n.type === 'grade') return { title: t('Новая оценка'), body: `${tv(n.subject)} — ${n.score}` };
  if (n.type === 'schedule') return { title: t('Изменение в расписании'), body: tv(n.subject) };
  if (n.type === 'dorm') return { title: t('Обращение в общежитие'), body: n.reply || '' };
  if (n.type === 'login') return { title: t('Новый вход в аккаунт'), body: [n.device, n.ip].filter(Boolean).join(' · ') };
  return { title: t('Уведомление'), body: '' };
}
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [740, 988].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * 0.12;
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o.start(t0); o.stop(t0 + 0.22);
    });
  } catch { }
}
function deliver(n) {
  const p = getPrefs();
  if (NOTIF_PREF[n.type] && !p[NOTIF_PREF[n.type]]) return;
  if (C.srv && C.srv.settings.status === 'dnd') return;
  const { title, body } = notifText(n);
  toast(body ? `${title}: ${body}` : title);
  if (p.sound) chime();
  if (p.push && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(title, { body, tag: 'kuc-' + n.id, icon: '../bird-idle.png' }); } catch { }
  }
}
async function pollInbox() {
  if (!C.user) return;
  try {
    const d = await api('/inbox');
    const fresh = NOTIF.seen ? d.items.filter((x) => !x.read && !NOTIF.seen.has(x.id)) : [];
    C.inbox = d.items; C.inboxUnread = d.unread;
    NOTIF.seen = new Set(d.items.map((x) => x.id));
    fresh.reverse().forEach(deliver);
    if (fresh.length && typeof onInboxChange === 'function') onInboxChange();
  } catch { }
}
function setTitleBadge() { document.title = (C.unread ? `(${C.unread}) ` : '') + 'KU Connect'; }

/* ------------------------------ Вход и запуск ------------------------------ */
function safeBack(u) {
  try {
    const x = new URL(u, location.href);
    if (!/^https?:$/.test(x.protocol)) return null;
    return x.origin === location.origin || /\.github\.io$/i.test(x.hostname) || x.hostname === 'localhost' || x.hostname === '127.0.0.1' ? x.href : null;
  } catch { return null; }
}
const backUrl = () => { try { return safeBack(sessionStorage.getItem('kuc_back') || '') || safeBack(localStorage.getItem('kuc_back') || '') || PORTAL_URL; } catch { return PORTAL_URL; } };
function readLaunchParams() {
  if (!location.hash || location.hash.startsWith('#/')) return null; // #/… — это раздел KU Connect, а не параметры запуска
  const h = new URLSearchParams(location.hash.slice(1));
  const look = { palette: h.get('theme') || '', mode: h.get('mode') || '', fs: h.get('fs') || '', still: h.get('still') === '1' };
  if (look.mode) { portalLook = look; try { sessionStorage.setItem('kuc_portal_look', JSON.stringify(look)); } catch { } }
  const lang = h.get('lang'); if (lang) setLang(lang);
  const back = safeBack(h.get('back') || '');
  if (back) { try { sessionStorage.setItem('kuc_back', back); localStorage.setItem('kuc_back', back); } catch { } }
  history.replaceState(null, '', location.pathname); // код одноразовый — убрать из адреса и истории
  return h.get('code');
}
function signOut(expired) {
  try { localStorage.removeItem('kuc_token'); } catch { }
  C.token = null; C.user = null;
  if (NOTIF.timer) clearInterval(NOTIF.timer);
  stopTimers();
  viewLogin(expired ? t('Сессия истекла — войдите снова') : '');
}
async function boot() {
  const code = readLaunchParams();
  applyTheme();
  try {
    if (code) {
      const d = await api('/connect/redeem', { method: 'POST', body: { code } });
      C.token = d.token; localStorage.setItem('kuc_token', d.token);
    } else {
      C.token = localStorage.getItem('kuc_token') || localStorage.getItem('ku_token'); // ku_token — портал на этом же адресе
    }
    if (!C.token) return viewLogin();
    C.user = (await api('/me')).user;
    C.srv = await api('/settings');
  } catch (e) { return viewLogin(e.message); }
  applyTheme();
  pollInbox();
  NOTIF.timer = setInterval(pollInbox, 20000);
  startApp();
}
window.addEventListener('load', boot);
