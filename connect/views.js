'use strict';
/* KU Connect — экраны. Раскладка как в Teams/Telegram:
 *   ПК: слева панель разделов, рядом лента чатов, справа переписка; телефон: лента → чат на весь экран, снизу вкладки.
 * Разделы (#/…): chats (#/chat/<канал>), tasks, center (преподаватель — «Центр», студент — «Уведомления»), tools, settings.
 * Канал предмета — только публикации преподавателя (материалы и задания), личный чат — студент ↔ преподаватель.
 */
const SEC = [
  ['chats', 'chat', 'Чаты'], ['tasks', 'tasks', 'Задания'], ['center', 'inbox', 'Центр'], ['tools', 'tool', 'Инструменты'], ['settings', 'gear', 'Настройки'],
];
const secLabel = (id) => (id === 'center' && C.user.role !== 'teacher' ? 'Уведомления' : SEC.find((s) => s[0] === id)[2]);
const MATERIAL_KIND = { lecture: ['Лекция', 'book'], practice: ['Практика', 'tasks'], other: ['Материал', 'clip'] };
const STATUS = { available: ['В сети', 'ok'], busy: ['Занят', 'busy'], away: ['Отошёл', 'away'], dnd: ['Не беспокоить', 'dnd'] };
const T = { list: null, chat: null }; // таймеры обновления
const POLL_LIST_MS = 6000, POLL_CHAT_MS = 3000;
const CV = { data: null, sig: '', file: null, sending: false, tab: 'materials' };

function stopTimers() { Object.keys(T).forEach((k) => { if (T[k]) clearInterval(T[k]); T[k] = null; }); }
function statusDot(p) {
  const st = STATUS[p.status] || STATUS.available;
  return p.online ? `<i class="dot s-${st[1]}" title="${esc(t(st[0]))}"></i>` : '';
}
function statusLine(p) {
  if (!p.online) return t('не в сети');
  const st = STATUS[p.status] || STATUS.available;
  return t(st[0]) + (p.statusText ? ' · ' + p.statusText : '');
}

/* ============================ Вход ============================ */
function viewLogin(msg) {
  stopTimers();
  app.innerHTML = `<div class="login">
    <div class="login-card">
      <div class="brand big"><span class="brand-ic">${svg('chat')}</span><div><b>KU Connect</b><span>Kozybayev University</span></div></div>
      <p class="tx">${t('Мессенджер университета: каналы предметов с лекциями и заданиями, личные вопросы преподавателям.')}</p>
      <a class="btn pri wide" href="${esc(backUrl())}">${svg('portal')}${t('Войти через KU Portal')}</a>
      <div class="or"><span>${t('или')}</span></div>
      <input class="inp" id="lgEmail" type="email" placeholder="Email" autocomplete="username">
      <input class="inp" id="lgPass" type="password" placeholder="${t('Пароль')}" autocomplete="current-password">
      <div class="err">${msg ? esc(msg) : ''}</div>
      <button class="btn ghost wide" id="lgGo">${t('Войти')}</button>
    </div></div>`;
  const go = async () => {
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: document.getElementById('lgEmail').value.trim(), password: document.getElementById('lgPass').value } });
      if (d.need2fa) throw new Error(t('Для аккаунта с двухфакторной защитой войдите через KU Portal'));
      C.token = d.token; localStorage.setItem('kuc_token', d.token); C.user = d.user; C.srv = await api('/settings');
      applyTheme(); pollInbox(); NOTIF.timer = setInterval(pollInbox, 20000); startApp();
    } catch (e) { app.querySelector('.err').textContent = e.message; }
  };
  document.getElementById('lgGo').onclick = go;
  document.getElementById('lgPass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

/* ============================ Каркас ============================ */
function startApp() {
  const u = C.user;
  app.innerHTML = `<div class="cx" id="cx">
    <nav class="rail">
      <button class="brand-ic" id="toChats" title="KU Connect">${svg('chat')}</button>
      ${SEC.map(([id, ic]) => `<a href="#/${id}" class="rail-it" data-sec="${id}" title="${esc(t(secLabel(id)))}">${svg(ic)}<span>${t(secLabel(id))}</span><em class="badge-n" hidden></em></a>`).join('')}
      <span class="grow"></span>
      <a class="rail-it" href="${esc(backUrl())}" title="KU Portal">${svg('portal')}<span>KU Portal</span></a>
      <button class="me" id="meBtn" title="${esc(u.fio)}">${avatar(u.fio, u.id)}<i class="dot s-${(STATUS[C.srv.settings.status] || STATUS.available)[1]}"></i></button>
    </nav>
    <aside class="side" id="side"></aside>
    <main class="main" id="main"></main>
    <nav class="tabbar">${SEC.map(([id, ic]) => `<a href="#/${id}" data-sec="${id}">${svg(ic)}<span>${t(secLabel(id))}</span><em class="badge-n" hidden></em></a>`).join('')}</nav>
  </div>`;
  document.getElementById('toChats').onclick = () => { location.hash = '#/chats'; };
  document.getElementById('meBtn').onclick = () => statusDlg();
  window.onhashchange = route;
  route();
  T.list = setInterval(refreshList, POLL_LIST_MS);
}
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const sec = parts[0] === 'chat' ? 'chats' : SEC.some((s) => s[0] === parts[0]) ? parts[0] : 'chats';
  C.sec = sec;
  C.ch = parts[0] === 'chat' && parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null;
  document.querySelectorAll('[data-sec]').forEach((a) => a.classList.toggle('on', a.dataset.sec === sec));
  const cx = document.getElementById('cx');
  cx.classList.toggle('full', sec !== 'chats');
  cx.classList.toggle('open', !!C.ch);
  if (T.chat) { clearInterval(T.chat); T.chat = null; }
  if (sec === 'chats') { paintSide(); C.ch ? openChat(C.ch) : paintWelcome(); }
  else if (sec === 'tasks') viewTasks();
  else if (sec === 'center') viewCenter();
  else if (sec === 'tools') viewTools();
  else viewSettings();
}
function onInboxChange() { if (C.sec === 'center') viewCenter(); paintBadges(); }
function paintBadges() {
  const set = (sec, n) => document.querySelectorAll(`[data-sec="${sec}"] .badge-n`).forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; });
  set('chats', C.unread);
  set('center', C.user.role === 'teacher' ? (C.overview ? C.overview.awaiting.length : 0) : (C.inboxUnread || 0));
  set('tasks', C.overview && C.overview.deadlines ? C.overview.deadlines.filter((d) => d.due <= isoOf(Date.now() + 2 * 864e5)).length : 0);
  setTitleBadge();
}

/* ============================ Лента чатов ============================ */
async function refreshList() {
  try {
    const [list, ov] = await Promise.all([api('/chat/list'), api('/chat/overview')]);
    C.list = list; C.overview = ov; C.unread = ov.unread;
    paintBadges();
    if (C.sec === 'chats') paintList();
  } catch { }
}
function feedItems() {
  const d = C.list; if (!d) return [];
  const chans = d.channels.map((c) => Object.assign({ kind: 'subject', key: c.id, name: tv(c.title) }, c));
  const dms = d.contacts.map((c) => Object.assign({ kind: 'dm', key: c.ch, name: c.fio }, c));
  return chans.concat(dms).sort((a, b) => ((b.last && b.last.at) || 0) - ((a.last && a.last.at) || 0) || a.name.localeCompare(b.name));
}
function paintSide() {
  const side = document.getElementById('side');
  if (!side.dataset.ready) {
    side.dataset.ready = '1';
    side.innerHTML = `<div class="side-h"><b>${t('Чаты')}</b><span class="tx">${esc(C.user.role === 'teacher' ? t('Преподаватель') : C.user.group)}${C.user.track ? ' · ' + esc(t(TRACK_NAME[C.user.track])) : ''}</span></div>
      <label class="search">${svg('search')}<input id="q" placeholder="${t('Поиск')}" autocomplete="off"></label>
      <div class="chips" id="flt">${[['all', 'Все'], ['subject', 'Каналы'], ['dm', 'Личные']].map(([k, l]) => `<button data-f="${k}" class="${C.filter === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div>
      <div class="list" id="list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;
    side.querySelector('#q').oninput = (e) => { C.q = e.target.value.trim().toLowerCase(); paintList(); };
    side.querySelector('#flt').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; C.filter = b.dataset.f; side.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); paintList(); };
  }
  if (C.list) paintList(); else refreshList();
}
function preview(c) {
  if (!getPrefs().previews) return c.unread ? t('Новые сообщения') : '';
  if (!c.last) return `<i>${t(c.kind === 'subject' ? 'Материалов пока нет' : 'Напишите первым')}</i>`;
  if (c.kind === 'subject') return `<b class="k">${t(c.last.kind === 'task' ? 'Задание' : (MATERIAL_KIND[c.last.kind] || MATERIAL_KIND.other)[0])}:</b> ${esc(c.last.text)}`;
  return `${c.last.from === C.user.id ? `<b class="k">${t('Вы:')}</b> ` : ''}${esc(String(c.last.text).replace(/```[\s\S]*?```/g, '‹' + t('код') + '›'))}`;
}
function listItemHTML(c) {
  const sub = c.kind === 'subject'
    ? `${t('Канал')} · ${esc(C.user.role === 'teacher' ? c.group : c.teacher)}`
    : `${esc(c.role === 'teacher' ? t('Преподаватель') : c.group)} · ${esc(statusLine(c))}`;
  return `<a class="li ${C.ch === c.key ? 'on' : ''} ${c.unread ? 'unread' : ''}" href="#/chat/${encodeURIComponent(c.key)}">
    ${c.kind === 'subject' ? `<span class="ava ch">${svg('hash')}</span>` : `<span class="ava-w">${avatar(c.fio, c.id)}${statusDot(c)}</span>`}
    <span class="li-t"><span class="li-r1"><b>${esc(c.name)}</b><small>${esc(whenShort(c.last && c.last.at))}</small></span>
      <span class="li-sub">${sub}</span>
      <span class="li-r2"><span class="li-p">${preview(c)}</span>${c.unread ? `<em class="pill">${c.unread}</em>` : c.tasksDue ? `<em class="pill warn" title="${t('Открытые задания')}">${c.tasksDue}</em>` : ''}</span></span>
  </a>`;
}
function paintList() {
  const box = document.getElementById('list'); if (!box || !C.list) return;
  const items = feedItems().filter((c) => (C.filter === 'all' || c.kind === C.filter) && (!C.q || c.name.toLowerCase().includes(C.q)));
  const active = items.filter((c) => c.last || c.kind === 'subject'), fresh = items.filter((c) => !c.last && c.kind === 'dm');
  box.innerHTML = (active.map(listItemHTML).join('') || (fresh.length ? '' : `<div class="empty sm">${svg('chat')}<span>${t(C.q ? 'Ничего не найдено' : 'Чатов пока нет')}</span></div>`))
    + (fresh.length ? `<div class="list-sep">${t(C.user.role === 'teacher' ? 'Написать студенту' : 'Написать преподавателю')}</div>${fresh.map(listItemHTML).join('')}` : '');
}
function paintWelcome() {
  const u = C.user, ov = C.overview;
  document.getElementById('main').innerHTML = `<div class="welcome">
    <div class="wl-art">${svg('chat')}</div>
    <b>${esc(t('Здравствуйте, {n}!', { n: u.firstName }))}</b>
    <span>${t(u.role === 'teacher' ? 'Выберите канал, чтобы опубликовать лекцию или задание, или ответьте студентам.' : 'Выберите канал предмета или напишите преподавателю.')}</span>
    ${ov && ov.deadlines && ov.deadlines.length ? `<a class="wl-card" href="#/tasks">${svg('tasks')}<span><b>${t('Ближайший дедлайн')}</b>${esc(ov.deadlines[0].title)} · ${esc(fmtDay(ov.deadlines[0].due))}</span></a>` : ''}
    ${ov && ov.awaiting && ov.awaiting.length ? `<a class="wl-card" href="#/center">${svg('inbox')}<span><b>${t('Ждут ответа')}</b>${esc(t('студентов: {n}', { n: ov.awaiting.length }))}</span></a>` : ''}
  </div>`;
}

/* ============================ Переписка ============================ */
function chatFrame(dm) {
  return `<div class="conv">
    <header class="conv-h">
      <a class="icon-btn only-m" href="#/chats" title="${t('Назад')}">${svg('back')}</a>
      <span id="cvAva"></span>
      <div class="conv-t"><b id="cvTitle">${t('Загрузка…')}</b><span id="cvSub" class="tx"></span></div>
      <div class="conv-a" id="cvAct"></div>
    </header>
    <div id="cvTabs"></div>
    <div class="conv-b ${dm ? 'wall' : ''}" id="cvBody"><div class="conv-in" id="cvList"></div></div>
    ${dm ? composerHTML() : ''}
  </div>`;
}
async function openChat(ch) {
  Object.assign(CV, { data: null, sig: '', file: null, sending: false, tab: 'materials' });
  const dm = ch.startsWith('d:');
  document.getElementById('main').innerHTML = chatFrame(dm);
  if (dm) bindComposer();
  paintList();
  await loadConv(true);
  if (CV.data) T.chat = setInterval(() => loadConv(false), POLL_CHAT_MS);
}
async function loadConv(first) {
  let d;
  try { d = await api('/chat/messages?ch=' + encodeURIComponent(C.ch)); }
  catch (e) {
    if (first) { document.getElementById('cvList').innerHTML = `<div class="empty">${svg('lock')}<b>${t('Чат недоступен')}</b><span>${esc(e.message)}</span></div>`; document.getElementById('cvTitle').textContent = 'KU Connect'; const c = document.querySelector('.composer'); if (c) c.hidden = true; }
    return;
  }
  if (!document.getElementById('cvList')) return;
  const sig = JSON.stringify(d.kind === 'dm' ? [d.items.map((m) => m.id), d.otherRead, d.other] : [d.materials, d.tasks]);
  CV.data = d;
  if (sig === CV.sig) return;
  CV.sig = sig;
  if (first) setTimeout(refreshList, 300); // непрочитанное в ленте обнулилось
  d.kind === 'dm' ? paintDM(first) : paintChannel();
}
async function act(path, body, okText) {
  try { const r = await api(path, { method: 'POST', body }); if (okText) toast(okText); CV.sig = ''; await loadConv(false); return r; }
  catch (e) { toast(e.message, true); return null; }
}
function confirmDlg(title, text, btn, run) {
  modal(title, `<div class="tx">${text}</div><button class="btn danger wide" id="cfGo">${btn}</button>`, (box, close) => { box.querySelector('#cfGo').onclick = () => { close(); run(); }; });
}

/* ---------- Личный чат ---------- */
function composerHTML() {
  const tools = composerTools();
  return `<footer class="composer">
    ${tools.length ? `<div class="tools-row">${tools.map(([ic, l], i) => `<button type="button" class="tool-chip" data-tool="${i}">${svg(ic)}${t(l)}</button>`).join('')}</div>` : ''}
    <div class="pend" id="cvPend" hidden></div>
    <div class="comp-row">
      <button class="icon-btn" id="cvAttach" type="button" title="${t('Прикрепить файл')}">${svg('clip')}</button>
      <textarea class="comp-in" id="cvInp" rows="1" maxlength="2000" placeholder="${t('Сообщение…')}"></textarea>
      <button class="send" id="cvSend" type="button" title="${t('Отправить')}">${svg('send')}</button>
    </div>
    <div class="comp-hint">${esc(t(getPrefs().enterSend ? 'Enter — отправить, Shift+Enter — новая строка · **жирный**, `код`' : 'Ctrl+Enter — отправить · **жирный**, `код`'))}</div>
  </footer>`;
}
function insertText(text) {
  const inp = document.getElementById('cvInp'); if (!inp) return;
  inp.value = inp.value ? inp.value.replace(/\s*$/, '\n') + text : text;
  inp.dispatchEvent(new Event('input')); inp.focus();
}
function bindComposer() {
  const inp = document.getElementById('cvInp');
  inp.oninput = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 180) + 'px'; };
  inp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const enterSend = getPrefs().enterSend;
    if ((enterSend && !e.shiftKey) || (!enterSend && (e.ctrlKey || e.metaKey))) { e.preventDefault(); sendMsg(); }
  };
  document.getElementById('cvSend').onclick = sendMsg;
  document.getElementById('cvAttach').onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { setPend({ uploading: true, name: f.name }); setPend(await uploadFile(f)); } catch (e) { setPend(null); toast(e.message, true); }
  };
  const tools = composerTools();
  document.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => tools[+b.dataset.tool][2](insertText)));
  if (matchMedia('(min-width: 900px)').matches) inp.focus();
}
function setPend(f) {
  CV.file = f && !f.uploading ? f : null;
  const box = document.getElementById('cvPend'); if (!box) return;
  box.hidden = !f;
  box.innerHTML = f ? `${svg('clip')}<b>${esc(f.name)}</b><small>${f.uploading ? t('загрузка…') : fmtSize(f.size)}</small>${f.uploading ? '' : `<button class="icon-btn" id="cvUnpend">${svg('x')}</button>`}` : '';
  const x = document.getElementById('cvUnpend'); if (x) x.onclick = () => setPend(null);
}
async function sendMsg() {
  const inp = document.getElementById('cvInp');
  const text = inp.value.trim();
  if ((!text && !CV.file) || CV.sending) return;
  CV.sending = true;
  try {
    await api('/chat/send', { method: 'POST', body: { ch: C.ch, text, fileId: CV.file ? CV.file.id : '' } });
    inp.value = ''; inp.style.height = 'auto'; setPend(null);
    CV.sig = ''; await loadConv(false);
    const b = document.getElementById('cvBody'); b.scrollTop = b.scrollHeight;
    refreshList();
  } catch (e) { toast(e.message, true); }
  CV.sending = false;
}
function paintDM(first) {
  const d = CV.data, o = d.other;
  document.getElementById('cvAva').innerHTML = `<span class="ava-w">${avatar(o.fio, o.id)}${statusDot(o)}</span>`;
  document.getElementById('cvTitle').textContent = o.fio;
  document.getElementById('cvSub').textContent = (o.role === 'teacher' ? t('Преподаватель') : o.group) + ' · ' + statusLine(o);
  document.getElementById('cvAct').innerHTML = o.officeHours ? `<span class="chip-info" title="${t('Часы консультаций')}">${svg('clock')}${esc(o.officeHours)}</span>` : '';
  const body = document.getElementById('cvBody'), list = document.getElementById('cvList');
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
  let lastDay = '', lastFrom = '';
  list.innerHTML = d.items.length ? d.items.map((m) => {
    const day = isoOf(m.at), mine = m.from === C.user.id;
    const sep = day !== lastDay ? `<div class="day"><span>${esc(day === todayIso() ? t('Сегодня') : fmtDay(day, true))}</span></div>` : '';
    const cont = day === lastDay && lastFrom === m.from;
    lastDay = day; lastFrom = m.from;
    const read = mine && d.otherRead != null && d.otherRead >= m.at;
    return `${sep}<div class="msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''}">
      <div class="bubble">${m.text ? `<div class="md">${md(m.text)}</div>` : ''}${m.file ? fileCard(m.file) : ''}
        <span class="meta">${esc(timeOf(m.at))}${mine ? `<i class="rc ${read ? 'read' : ''}" title="${t(read ? 'Прочитано' : 'Отправлено')}">${svg(read ? 'checks' : 'check')}</i>` : ''}</span></div>
      ${mine ? `<button class="msg-del" data-del="${esc(m.id)}" title="${t('Удалить')}">${svg('trash')}</button>` : ''}
    </div>`;
  }).join('') : `<div class="empty">${avatar(o.fio, o.id, 'xl')}<b>${esc(o.fio)}</b><span>${t(C.user.role === 'student' ? 'Напишите преподавателю — вопрос увидит только он.' : 'Напишите студенту первым.')}</span>${o.officeHours ? `<span class="chip-info">${svg('clock')}${esc(t('Консультации: {v}', { v: o.officeHours }))}</span>` : ''}</div>`;
  bindFiles(list); bindCopy(list);
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить сообщение?'), t('Сообщение исчезнет у обоих участников.'), t('Удалить'), () => act('/chat/delete', { id: b.dataset.del }, t('Сообщение удалено')))));
  if (first || atBottom) body.scrollTop = body.scrollHeight;
}

/* ---------- Канал предмета ---------- */
function paintChannel() {
  const d = CV.data;
  document.getElementById('cvAva').innerHTML = `<span class="ava ch">${svg('hash')}</span>`;
  document.getElementById('cvTitle').textContent = tv(d.title);
  document.getElementById('cvSub').textContent = d.manage ? t('Группа {g} · студентов: {n}', { g: d.group, n: d.members }) : t('Канал · {t}', { t: d.teacher });
  document.getElementById('cvAct').innerHTML = d.manage ? '' : `<span class="chip-info">${svg('eye')}${t('только чтение')}</span>`;
  const tabs = document.getElementById('cvTabs');
  const open = d.tasks.filter((x) => x.due >= todayIso() && !x.done).length;
  tabs.innerHTML = `<div class="tabs">${[['materials', 'Материалы', d.materials.length], ['tasks', 'Задания', d.manage ? d.tasks.length : open]].map(([k, l, n]) =>
    `<button data-tab="${k}" class="${CV.tab === k ? 'on' : ''}">${t(l)}${n ? `<em>${n}</em>` : ''}</button>`).join('')}</div>`;
  tabs.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { CV.tab = b.dataset.tab; CV.sig = ''; paintChannel(); } };
  const list = document.getElementById('cvList');
  const keep = {}; list.querySelectorAll('.composer-card [id]').forEach((el) => { if ('value' in el && el.value) keep[el.id] = el.value; });
  list.innerHTML = CV.tab === 'tasks' ? tasksTabHTML(d) : materialsTabHTML(d);
  Object.entries(keep).forEach(([id, v]) => { const el = list.querySelector('#' + id); if (el && el.type !== 'file') el.value = v; });
  bindFiles(list); bindCopy(list); bindChannel(list, d);
}
function groupsPicker(d) {
  if (!d.siblings || !d.siblings.length) return '';
  return `<div class="grp-pick"><span class="tx">${t('Опубликовать также для групп:')}</span>${d.siblings.map((s) => `<label class="tgl"><input type="checkbox" data-grp="${esc(s.id)}"><span>${esc(s.group)}</span></label>`).join('')}</div>`;
}
function materialsTabHTML(d) {
  const form = d.manage ? `<div class="composer-card">
    <div class="cc-h">${svg('megaphone')}<b>${t('Новая публикация')}</b></div>
    <div class="seg" id="mtKind">${Object.entries(MATERIAL_KIND).map(([k, v], i) => `<button data-v="${k}" class="${i === 0 ? 'on' : ''}">${svg(v[1])}${t(v[0])}</button>`).join('')}</div>
    <input class="inp" id="mtTitle" maxlength="160" placeholder="${t('Тема, например: Лекция 5. Present Perfect')}">
    <textarea class="inp" id="mtText" rows="3" maxlength="2000" placeholder="${t('Описание, ссылки, код в ``` … ``` (необязательно)')}"></textarea>
    ${groupsPicker(d)}
    <div class="cc-f"><button class="btn ghost" id="mtFile" type="button">${svg('clip')}<span id="mtFileN">${t('Файл')}</span></button>
      <label class="tgl imp"><input type="checkbox" id="mtImp"><span>${svg('flag')}${t('Важно')}</span></label>
      <span class="grow"></span><button class="btn pri" id="mtAdd">${t('Опубликовать')}</button></div>
  </div>` : '';
  const items = d.materials.map((m) => {
    const k = MATERIAL_KIND[m.kind] || MATERIAL_KIND.other;
    return `<article class="post ${m.important ? 'imp' : ''}">
      <div class="post-h"><span class="kind k-${esc(m.kind)}">${svg(k[1])}${t(k[0])}</span>${m.important ? `<span class="kind k-imp">${svg('flag')}${t('Важно')}</span>` : ''}<span class="grow"></span><small>${esc(fmtWhen(m.at))}${m.edited ? ' · ' + t('изменено') : ''}</small></div>
      <h3>${esc(m.title)}</h3>
      ${m.text ? `<div class="md">${md(m.text)}</div>` : ''}
      ${m.file ? fileCard(m.file) : ''}
      <div class="post-f"><span class="tx">${esc(m.teacher)}</span><span class="grow"></span>
        ${d.manage ? `<span class="views" title="${t('Просмотрели')}">${svg('eye')}${esc(t('{n} из {m}', { n: m.views || 0, m: d.members }))}</span>
          <button class="icon-btn" data-medit="${esc(m.id)}" title="${t('Дополнить')}">${svg('edit')}</button><button class="icon-btn" data-mdel="${esc(m.id)}" title="${t('Удалить')}">${svg('trash')}</button>` : ''}</div>
    </article>`;
  }).join('');
  return form + (items || `<div class="empty">${svg('book')}<b>${t('Материалов пока нет')}</b><span>${t(d.manage ? 'Опубликуйте первую лекцию или практику — студенты получат уведомление.' : 'Здесь появятся лекции и практики преподавателя.')}</span></div>`);
}
function taskCardHTML(x, d) {
  const today = todayIso();
  const badge = x.done ? `<span class="kind k-ok">${svg('check')}${t('Сделано')}</span>`
    : x.due < today ? `<span class="kind k-late">${t('Срок прошёл')}</span>`
    : x.due === today ? `<span class="kind k-warn">${t('Сегодня')}</span>` : `<span class="kind">${esc(t('до {d}', { d: fmtDay(x.due) }))}</span>`;
  const pct = d.members ? Math.round(x.doneCount / d.members * 100) : 0;
  return `<article class="post task ${x.done ? 'done' : ''}">
    <div class="post-h">${d.manage ? `<span class="kind">${svg('clock')}${esc(fmtDay(x.due, true))}</span>` : badge}<span class="grow"></span><small>${x.edited ? t('изменено') : ''}</small></div>
    <h3>${esc(x.title)}</h3>
    ${x.text ? `<div class="md">${md(x.text)}</div>` : ''}
    ${x.file ? fileCard(x.file) : ''}
    ${d.manage ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
    <div class="post-f">${d.manage
      ? `<span class="tx">${esc(t('Отметили «сделано»: {n} из {m}', { n: x.doneCount, m: d.members }))}</span><span class="grow"></span><button class="icon-btn" data-tedit="${esc(x.id)}" title="${t('Изменить')}">${svg('edit')}</button><button class="icon-btn" data-tdel="${esc(x.id)}" title="${t('Удалить')}">${svg('trash')}</button>`
      : `<span class="tx">${esc(t('Срок: {d}', { d: fmtDay(x.due, true) }))}</span><span class="grow"></span><button class="btn ${x.done ? 'ghost' : 'pri'} sm" data-tdone="${esc(x.id)}" data-v="${x.done ? '' : '1'}">${x.done ? t('Вернуть в работу') : t('Отметить «сделано»')}</button>`}</div>
  </article>`;
}
function tasksTabHTML(d) {
  const form = d.manage ? `<div class="composer-card">
    <div class="cc-h">${svg('tasks')}<b>${t('Новое задание')}</b></div>
    <input class="inp" id="tkTitle" maxlength="160" placeholder="${t('Название, например: Эссе по теме 5')}">
    <textarea class="inp" id="tkText" rows="3" maxlength="2000" placeholder="${t('Что нужно сделать (необязательно)')}"></textarea>
    ${groupsPicker(d)}
    <div class="cc-f"><label class="date-f">${svg('clock')}<input type="date" id="tkDue" min="${todayIso()}" value="${isoOf(Date.now() + 7 * 864e5)}"></label>
      <button class="btn ghost" id="tkFile" type="button">${svg('clip')}<span id="tkFileN">${t('Файл')}</span></button>
      <span class="grow"></span><button class="btn pri" id="tkAdd">${t('Опубликовать')}</button></div>
  </div>` : '';
  return form + (d.tasks.map((x) => taskCardHTML(x, d)).join('') || `<div class="empty">${svg('tasks')}<b>${t('Заданий пока нет')}</b><span>${t(d.manage ? 'Опубликуйте задание с датой сдачи — студенты увидят его здесь и во вкладке «Задания».' : 'Здесь появятся задания со сроками сдачи.')}</span></div>`);
}
function filePickBtn(root, btnId, labelId) {
  let file = null;
  const btn = root.querySelector('#' + btnId); if (!btn) return { get: () => null };
  btn.onclick = async () => {
    const f = await pickFile(); if (!f) return;
    const l = root.querySelector('#' + labelId);
    try { l.textContent = t('загрузка…'); file = await uploadFile(f); l.textContent = file.name; } catch (e) { file = null; l.textContent = t('Файл'); toast(e.message, true); }
  };
  return { get: () => file };
}
function bindChannel(root, d) {
  root.querySelectorAll('[data-tdone]').forEach((b) => (b.onclick = () => act('/chat/task/done', { id: b.dataset.tdone, done: !!b.dataset.v }, b.dataset.v ? t('Отмечено как сделанное') : '').then(refreshList)));
  if (!d.manage) return;
  root.querySelectorAll('.seg').forEach((seg) => (seg.onclick = (e) => { const b = e.target.closest('button'); if (b) seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const val = (id) => (root.querySelector('#' + id) || {}).value || '';
  const groups = () => [...root.querySelectorAll('[data-grp]:checked')].map((x) => x.dataset.grp);
  const published = (r) => toast(r && r.count > 1 ? t('Опубликовано в {n} группах — студенты получат уведомление', { n: r.count }) : t('Опубликовано — студенты получат уведомление'));
  if (CV.tab === 'materials') {
    const fp = filePickBtn(root, 'mtFile', 'mtFileN');
    root.querySelector('#mtAdd').onclick = async () => {
      const r = await act('/chat/material', { ch: C.ch, chs: groups(), kind: root.querySelector('#mtKind .on').dataset.v, title: val('mtTitle'), text: val('mtText'), important: root.querySelector('#mtImp').checked, fileId: fp.get() ? fp.get().id : '' });
      if (r) { published(r); const l = document.getElementById('cvList'); ['mtTitle', 'mtText'].forEach((id) => { const el = l.querySelector('#' + id); if (el) el.value = ''; }); }
    };
  } else {
    const fp = filePickBtn(root, 'tkFile', 'tkFileN');
    root.querySelector('#tkAdd').onclick = async () => {
      const r = await act('/chat/task', { ch: C.ch, chs: groups(), title: val('tkTitle'), text: val('tkText'), due: val('tkDue'), fileId: fp.get() ? fp.get().id : '' });
      if (r) { published(r); const l = document.getElementById('cvList'); ['tkTitle', 'tkText'].forEach((id) => { const el = l.querySelector('#' + id); if (el) el.value = ''; }); }
    };
  }
  root.querySelectorAll('[data-mdel]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить материал?'), t('Материал исчезнет у всех студентов группы.'), t('Удалить'), () => act('/chat/material/delete', { id: b.dataset.mdel }, t('Материал удалён')))));
  root.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить задание?'), t('Задание исчезнет у всех студентов группы.'), t('Удалить'), () => act('/chat/task/delete', { id: b.dataset.tdel }, t('Задание удалено')))));
  root.querySelectorAll('[data-medit]').forEach((b) => (b.onclick = () => editDlg('material', d.materials.find((m) => m.id === b.dataset.medit))));
  root.querySelectorAll('[data-tedit]').forEach((b) => (b.onclick = () => editDlg('task', d.tasks.find((x) => x.id === b.dataset.tedit))));
}
/* Преподаватель дополняет опубликованное: текст, название, срок задания, отметка «Важно» */
function editDlg(kind, x) {
  if (!x) return;
  modal(t(kind === 'task' ? 'Изменить задание' : 'Дополнить материал'), `
    <input class="inp" id="edTitle" maxlength="160" value="${esc(x.title)}">
    <textarea class="inp" id="edText" rows="6" maxlength="2000">${esc(x.text || '')}</textarea>
    ${kind === 'task' ? `<label class="lbl">${t('Сдать до')}</label><input class="inp" type="date" id="edDue" value="${esc(x.due)}">` : `<label class="tgl imp"><input type="checkbox" id="edImp" ${x.important ? 'checked' : ''}><span>${svg('flag')}${t('Важно — закрепить сверху')}</span></label>`}
    <div class="tx">${t(kind === 'task' ? 'Если изменить срок, студенты получат уведомление.' : 'Студенты увидят пометку «изменено».')}</div>
    <button class="btn pri wide" id="edGo">${t('Сохранить')}</button>`, (box, close) => {
    box.querySelector('#edGo').onclick = async () => {
      const body = { id: x.id, title: box.querySelector('#edTitle').value, text: box.querySelector('#edText').value };
      if (kind === 'task') body.due = box.querySelector('#edDue').value; else body.important = box.querySelector('#edImp').checked;
      if (await act(kind === 'task' ? '/chat/task/edit' : '/chat/material/edit', body, t('Сохранено'))) close();
    };
  }, true);
}

/* ============================ Задания (все каналы) ============================ */
async function viewTasks() {
  const main = document.getElementById('main');
  main.innerHTML = `<div class="page"><div class="load"></div></div>`;
  let ov; try { ov = await api('/chat/overview'); C.overview = ov; paintBadges(); } catch (e) { main.innerHTML = `<div class="page"><div class="empty">${esc(e.message)}</div></div>`; return; }
  if (C.sec !== 'tasks') return;
  const teacher = C.user.role === 'teacher';
  const rows = teacher ? ov.tasks : ov.deadlines;
  const left = (due) => { const n = Math.round((new Date(due + 'T00:00') - new Date(todayIso() + 'T00:00')) / 864e5); return n <= 0 ? t('сегодня') : n === 1 ? t('завтра') : t('через {n} дн.', { n }); };
  main.innerHTML = `<div class="page">
    <div class="page-hero"><span class="hero-ic">${svg('tasks')}</span><div><b>${t('Задания')}</b><span>${t(teacher ? 'Как студенты выполняют ваши задания' : 'Все открытые задания по предметам — по сроку сдачи')}</span></div></div>
    ${rows.length ? `<div class="task-list">${rows.map((x) => `<a class="task-row" href="#/chat/${encodeURIComponent(x.ch)}">
      <span class="due ${x.due <= isoOf(Date.now() + 864e5) ? 'hot' : ''}"><b>${esc(x.due.slice(8))}</b><small>${esc(fmtDay(x.due).replace(/^\d+\s*/, '').slice(0, 3))}</small></span>
      <span class="tr-t"><b>${esc(x.title)}</b><span class="tx">${esc(tv(x.subject))} · ${esc(x.group)} · ${esc(left(x.due))}</span>
        ${teacher ? `<span class="progress"><i style="width:${x.members ? Math.round(x.done / x.members * 100) : 0}%"></i></span>` : ''}</span>
      ${teacher ? `<em class="pill">${x.done}/${x.members}</em>` : `<button class="btn pri sm" data-done="${esc(x.id)}">${t('Сделано')}</button>`}
    </a>`).join('')}</div>` : `<div class="empty">${svg('check')}<b>${t(teacher ? 'Активных заданий нет' : 'Все задания сделаны')}</b><span>${t(teacher ? 'Опубликуйте задание в канале предмета.' : 'Новые задания появятся здесь, как только преподаватель их опубликует.')}</span></div>`}
  </div>`;
  main.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    try { await api('/chat/task/done', { method: 'POST', body: { id: b.dataset.done, done: true } }); toast(t('Отмечено как сделанное')); viewTasks(); } catch (er) { toast(er.message, true); }
  }));
}

/* ============================ Центр преподавателя / Уведомления ============================ */
function inboxHTML() {
  const items = (C.inbox || []).slice(0, 20);
  return items.length ? `<div class="feed">${items.map((n) => { const x = notifText(n); return `<div class="feed-it ${n.read ? '' : 'new'}"><span class="feed-ic">${svg(n.type === 'msg' ? 'chat' : n.type === 'task' ? 'tasks' : n.type === 'material' ? 'book' : 'bell')}</span><span><b>${esc(x.title)}</b>${x.body ? `<span>${esc(x.body)}</span>` : ''}<small>${esc(fmtWhen(n.at))}</small></span></div>`; }).join('')}</div>`
    : `<div class="empty sm">${svg('bell')}<span>${t('Новых уведомлений нет')}</span></div>`;
}
async function viewCenter() {
  const main = document.getElementById('main');
  if (!main.querySelector('.page')) main.innerHTML = `<div class="page"><div class="load"></div></div>`;
  let ov; try { ov = await api('/chat/overview'); C.overview = ov; } catch (e) { main.innerHTML = `<div class="page"><div class="empty">${esc(e.message)}</div></div>`; return; }
  if (C.sec !== 'center') return;
  const teacher = C.user.role === 'teacher';
  const stat = (v, l, ic, cls) => `<div class="stat ${cls || ''}">${svg(ic)}<b>${esc(String(v))}</b><span>${t(l)}</span></div>`;
  let body;
  if (teacher) {
    const avg = ov.tasks.length ? Math.round(ov.tasks.reduce((a, x) => a + (x.members ? x.done / x.members : 0), 0) / ov.tasks.length * 100) : 0;
    body = `<div class="stats">${stat(ov.awaiting.length, 'ждут ответа', 'chat', ov.awaiting.length ? 'hot' : '')}${stat(ov.tasks.length, 'активных заданий', 'tasks')}${stat(avg + '%', 'среднее выполнение', 'check')}${stat(ov.unread, 'непрочитанных', 'bell')}</div>
      <div class="cards">
        <section class="card"><h4>${svg('chat')}${t('Ждут ответа')}</h4>${ov.awaiting.length ? ov.awaiting.map((a) => `<a class="row-link" href="#/chat/${encodeURIComponent(a.ch)}">${avatar(a.fio, a.ch)}<span><b>${esc(a.fio)}</b><span class="tx">${esc(a.group)} · ${esc(whenShort(a.at))}</span><span class="li-p">${esc(a.text)}</span></span>${svg('chev')}</a>`).join('') : `<div class="empty sm">${svg('check')}<span>${t('Все студенты получили ответ')}</span></div>`}</section>
        <section class="card"><h4>${svg('tasks')}${t('Выполнение заданий')}</h4>${ov.tasks.length ? ov.tasks.map((x) => `<a class="row-link" href="#/chat/${encodeURIComponent(x.ch)}"><span class="due sm"><b>${esc(x.due.slice(8))}</b></span><span><b>${esc(x.title)}</b><span class="tx">${esc(tv(x.subject))} · ${esc(x.group)} · ${x.done}/${x.members}</span><span class="progress"><i style="width:${x.members ? Math.round(x.done / x.members * 100) : 0}%"></i></span></span></a>`).join('') : `<div class="empty sm">${svg('tasks')}<span>${t('Активных заданий нет')}</span></div>`}</section>
        <section class="card"><h4>${svg('eye')}${t('Просмотры материалов')}</h4>${ov.materials.length ? ov.materials.map((m) => `<a class="row-link" href="#/chat/${encodeURIComponent(m.ch)}"><span class="ava ch sm">${svg((MATERIAL_KIND[m.kind] || MATERIAL_KIND.other)[1])}</span><span><b>${esc(m.title)}</b><span class="tx">${esc(m.group)} · ${esc(t('просмотрели {n} из {m}', { n: m.views, m: m.members }))}</span></span></a>`).join('') : `<div class="empty sm">${svg('book')}<span>${t('Материалов пока нет')}</span></div>`}</section>
        <section class="card"><h4>${svg('bell')}${t('Уведомления')}</h4>${inboxHTML()}</section>
      </div>`;
  } else {
    body = `<div class="cards">
      <section class="card"><h4>${svg('tasks')}${t('Ближайшие дедлайны')}</h4>${ov.deadlines.length ? ov.deadlines.map((x) => `<a class="row-link" href="#/chat/${encodeURIComponent(x.ch)}"><span class="due sm"><b>${esc(x.due.slice(8))}</b></span><span><b>${esc(x.title)}</b><span class="tx">${esc(tv(x.subject))} · ${esc(fmtDay(x.due, true))}</span></span>${svg('chev')}</a>`).join('') : `<div class="empty sm">${svg('check')}<span>${t('Все задания сделаны')}</span></div>`}</section>
      <section class="card"><h4>${svg('bell')}${t('Уведомления')}</h4>${inboxHTML()}</section>
    </div>`;
  }
  main.innerHTML = `<div class="page"><div class="page-hero"><span class="hero-ic">${svg(teacher ? 'inbox' : 'bell')}</span><div><b>${t(teacher ? 'Центр преподавателя' : 'Уведомления')}</b><span>${t(teacher ? 'Вопросы студентов, выполнение заданий и просмотры материалов' : 'Дедлайны и всё, что пришло от преподавателей')}</span></div></div>${body}</div>`;
  paintBadges();
  if (C.inboxUnread) api('/inbox/read', { method: 'POST', body: {} }).then(() => { C.inboxUnread = 0; (C.inbox || []).forEach((x) => { x.read = true; }); paintBadges(); }).catch(() => { });
}

/* ============================ Инструменты ============================ */
function viewTools() {
  const main = document.getElementById('main');
  const paint = () => { main.innerHTML = `<div class="page">${toolsPageHTML()}</div>`; bindTools(main, paint); };
  paint();
}
