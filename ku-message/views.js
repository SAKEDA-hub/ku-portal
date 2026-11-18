'use strict';
/* KU Message — экраны. Слева: вкладки «Предметы» / «Чаты» (у преподавателя ещё «Ученики»), справа — открытое.
 *   #/s/<s:id>  — страница предмета как в Teams: вкладки «Лекции», «Практики», «Задания» (+ «Материалы», если есть);
 *                 публикует преподаватель предмета, студенты читают и скачивают файлы.
 *   #/d/<d:…>   — личная переписка. Студент сам пишет преподавателю; преподаватель открывает чат из вкладки «Ученики».
 * На телефоне список и открытый экран сменяют друг друга.
 */
const KIND = { lecture: 'Лекция', practice: 'Практика', other: 'Материал' };
const SPACE_TABS = [['lecture', 'Лекции'], ['practice', 'Практики'], ['task', 'Задания'], ['other', 'Материалы']];
const T = { list: null, open: null };
const POLL_LIST_MS = 6000, POLL_OPEN_MS = 3000;
const V = { data: null, sig: '', tab: 'lecture', file: null, sending: false };
const teacher = () => M.user.role === 'teacher';

function stopTimers() { Object.keys(T).forEach((k) => { if (T[k]) clearInterval(T[k]); T[k] = null; }); }

/* ============================ Вход ============================ */
function viewLogin(msg) {
  stopTimers();
  app.innerHTML = `<div class="login"><div class="login-card">
    <div class="brand"><span class="logo lg">${svg('logo')}</span><b class="brand-t">KU Message</b></div>
    <p class="muted">${t('Лекции, практики и задания по предметам и личные вопросы преподавателям.')}</p>
    <a class="btn pri wide" href="${esc(backUrl())}">${t('Войти через KU Portal')}</a>
    <div class="or">${t('или')}</div>
    <input class="inp" id="lgEmail" type="email" placeholder="Email" autocomplete="username">
    <input class="inp" id="lgPass" type="password" placeholder="${t('Пароль')}" autocomplete="current-password">
    <div class="err">${msg ? esc(msg) : ''}</div>
    <button class="btn wide" id="lgGo">${t('Войти')}</button>
  </div></div>`;
  const go = async () => {
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: document.getElementById('lgEmail').value.trim(), password: document.getElementById('lgPass').value } });
      if (d.need2fa) throw new Error(t('Для аккаунта с двухфакторной защитой войдите через KU Portal'));
      await enter(d.token);
    } catch (e) { app.querySelector('.err').textContent = e.message; }
  };
  document.getElementById('lgGo').onclick = go;
  document.getElementById('lgPass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

/* ============================ Каркас ============================ */
function sideTabs() { return teacher() ? [['subjects', 'Предметы'], ['chats', 'Чаты'], ['students', 'Ученики']] : [['subjects', 'Предметы'], ['chats', 'Чаты']]; }
function startApp() {
  const u = M.user;
  app.innerHTML = `<div class="km" id="km">
    <aside class="side">
      <header class="side-h">
        <a class="brand" href="#/" title="KU Message"><span class="logo">${svg('logo')}</span><b class="brand-t">KU Message</b></a>
        <span class="grow"></span>
        <a class="ib" href="#/settings" title="${t('Настройки')}">${svg('gear')}</a>
        <a class="ib" href="${esc(backUrl())}" title="KU Portal">${svg('home')}</a>
      </header>
      <div class="seg" id="sideTabs">${sideTabs().map(([k, l]) => `<button data-t="${k}">${t(l)}<em hidden></em></button>`).join('')}</div>
      <label class="search">${svg('search')}<input id="q" placeholder="${t('Поиск')}" autocomplete="off"></label>
      <div class="list" id="list"></div>
      <footer class="me"><span class="ava">${initials(u.fio)}</span><span><b>${esc(u.fio)}</b><small>${esc(teacher() ? t('Преподаватель') : u.group)}</small></span></footer>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  document.getElementById('sideTabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { M.tab = b.dataset.t; paintTabs(); paintList(); } };
  document.getElementById('q').oninput = (e) => { M.q = e.target.value.trim().toLowerCase(); paintList(); };
  window.onhashchange = route;
  paintTabs();
  route();
  refreshList();
  T.list = setInterval(refreshList, POLL_LIST_MS);
}
function paintTabs() {
  const d = M.list;
  const unread = (list) => (list || []).reduce((n, x) => n + (x.unread || 0), 0);
  document.querySelectorAll('#sideTabs [data-t]').forEach((b) => {
    b.classList.toggle('on', b.dataset.t === M.tab);
    const n = !d ? 0 : b.dataset.t === 'subjects' ? unread(d.spaces) : b.dataset.t === 'chats' ? unread(d.contacts) : 0;
    const em = b.querySelector('em'); em.hidden = !n; em.textContent = n;
  });
  const total = d ? unread(d.spaces) + unread(d.contacts) : 0;
  document.title = (total ? `(${total}) ` : '') + 'KU Message';
}
function route() {
  if (T.open) { clearInterval(T.open); T.open = null; }
  if (location.hash === '#/settings') { M.ch = null; document.getElementById('km').classList.add('open'); paintTabs(); paintList(); return viewSettings(); }
  const m = /^#\/(s|d)\/(.+)$/.exec(location.hash);
  M.ch = m ? decodeURIComponent(m[2]) : null;
  if (m && M.tab === 'subjects' && m[1] === 'd') M.tab = teacher() && !(M.list && M.list.contacts.some((c) => c.ch === M.ch && c.last)) ? 'students' : 'chats';
  if (m && m[1] === 's') M.tab = 'subjects';
  document.getElementById('km').classList.toggle('open', !!M.ch);
  if (T.open) { clearInterval(T.open); T.open = null; }
  paintTabs(); paintList();
  if (M.ch) openItem(); else paintWelcome();
}
async function refreshList() {
  try { M.list = await api('/message/list'); paintTabs(); paintList(); } catch { }
}

/* ============================ Списки ============================ */
const subjIcon = (title) => esc(String(title || '?').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?');
function rowHTML(href, ico, name, sub, right, on, unread) {
  return `<a class="row ${on ? 'on' : ''} ${unread ? 'unread' : ''}" href="${href}">${ico}<span class="row-t"><b>${esc(name)}</b><small>${sub}</small></span><span class="row-r">${right}</span></a>`;
}
function personIco(p) { return `<span class="ava">${initials(p.fio)}${p.online ? '<i class="on"></i>' : ''}</span>`; }
function lastText(c) {
  if (!c.last) return '';
  if (!getPrefs().previews) return c.unread ? t('Новые сообщения') : esc(c.role === 'teacher' ? t('Преподаватель') : c.group || '');
  return `${c.last.from === M.user.id ? t('Вы: ') : ''}${esc(c.last.text)}`;
}
function paintList() {
  const box = document.getElementById('list'); if (!box) return;
  const d = M.list;
  if (!d) { box.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; return; }
  const q = (s) => !M.q || String(s).toLowerCase().includes(M.q);
  let html = '';
  if (M.tab === 'subjects') {
    const items = d.spaces.filter((s) => q(tv(s.title)));
    html = items.map((s) => rowHTML(`#/s/${encodeURIComponent(s.id)}`, `<span class="sq">${subjIcon(tv(s.title))}</span>`, tv(s.title),
      esc(teacher() ? s.groups.join(', ') : s.teacher),
      s.unread ? `<em class="pill">${s.unread}</em>` : s.nextDue ? `<span class="due-chip">${esc(t('до {d}', { d: fmtDay(s.nextDue) }))}</span>` : '',
      M.ch === s.id, s.unread)).join('') || `<div class="empty-s">${t(teacher() ? 'Предметы появятся, когда вы добавите занятия в расписание.' : 'Предметы появятся, когда преподаватель добавит занятия вашей группе.')}</div>`;
  } else if (M.tab === 'chats') {
    const talks = d.contacts.filter((c) => c.last && q(c.fio)).sort((a, b) => b.last.at - a.last.at);
    html = talks.map((c) => rowHTML(`#/d/${encodeURIComponent(c.ch)}`, personIco(c), c.fio, lastText(c), `<small>${esc(whenShort(c.last.at))}</small>${c.unread ? `<em class="pill">${c.unread}</em>` : ''}`, M.ch === c.ch, c.unread)).join('');
    if (!teacher()) {
      const fresh = d.contacts.filter((c) => !c.last && q(c.fio));
      if (fresh.length) html += `<div class="sep">${t('Преподаватели')}</div>` + fresh.map((c) => rowHTML(`#/d/${encodeURIComponent(c.ch)}`, personIco(c), c.fio, esc(t(c.online ? 'в сети' : 'Преподаватель')), '', M.ch === c.ch)).join('');
    }
    if (!html) html = `<div class="empty-s">${t(teacher() ? 'Здесь будут переписки со студентами. Написать студенту можно во вкладке «Ученики».' : 'Переписок пока нет.')}</div>`;
  } else {
    const groups = [...new Set(d.contacts.map((c) => c.group))].sort();
    html = groups.map((g) => {
      const people = d.contacts.filter((c) => c.group === g && q(c.fio));
      return people.length ? `<div class="sep">${esc(g)}</div>` + people.map((c) => rowHTML(`#/d/${encodeURIComponent(c.ch)}`, personIco(c), c.fio, esc(c.online ? t('в сети') : t('Студент')), `<span class="link">${t('Написать')}</span>`, M.ch === c.ch)).join('') : '';
    }).join('') || `<div class="empty-s">${t('Студенты появятся, когда у вас будут занятия с группами.')}</div>`;
  }
  box.innerHTML = html;
}
function paintWelcome() {
  const d = M.list;
  const due = d ? d.spaces.filter((s) => s.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue)) : [];
  document.getElementById('main').innerHTML = `<div class="welcome">
    <b>${esc(t('Здравствуйте, {n}!', { n: M.user.firstName }))}</b>
    <p class="muted">${t(teacher() ? 'Откройте предмет, чтобы добавить лекцию, практику или задание.' : 'Откройте предмет, чтобы посмотреть лекции и практики, или напишите преподавателю.')}</p>
    ${due.length && !teacher() ? `<div class="soon"><div class="soon-h">${t('Ближайшие сроки сдачи')}</div>${due.slice(0, 4).map((s) => `<a href="#/s/${encodeURIComponent(s.id)}"><span>${esc(tv(s.title))}</span><span class="due-chip">${esc(t('до {d}', { d: fmtDay(s.nextDue) }))}</span></a>`).join('')}</div>` : ''}
  </div>`;
}

/* ============================ Открытый предмет / чат ============================ */
async function openItem() {
  Object.assign(V, { data: null, sig: '', file: null, sending: false });
  const main = document.getElementById('main');
  main.innerHTML = `<div class="pane"><header class="pane-h"><a class="ib only-m" href="#/">${svg('back')}</a><div class="pane-t"><b>${t('Загрузка…')}</b></div></header><div class="pane-b"><div class="skel big"></div></div></div>`;
  await load(true);
  if (V.data) T.open = setInterval(() => load(false), POLL_OPEN_MS);
}
async function load(first) {
  let d;
  try { d = await api('/message/open?ch=' + encodeURIComponent(M.ch)); }
  catch (e) { if (first) document.querySelector('.pane-b').innerHTML = `<div class="empty">${svg('lock')}<b>${t('Нет доступа')}</b><span>${esc(e.message)}</span></div>`; return; }
  if (!document.querySelector('.pane')) return;
  const sig = JSON.stringify(d);
  if (sig === V.sig) return;
  const firstLoad = !V.data;
  V.data = d; V.sig = sig;
  if (firstLoad) setTimeout(refreshList, 200); // непрочитанное обнулилось
  if (d.kind === 'space') paintSpace(firstLoad); else paintDM(firstLoad);
}
async function act(path, body, okText) {
  try { await api(path, { method: 'POST', body }); if (okText) toast(okText); V.sig = ''; await load(false); refreshList(); return true; }
  catch (e) { toast(e.message, true); return false; }
}

/* ---------- Предмет ---------- */
function paintSpace(first) {
  const d = V.data;
  if (first) { const firstNonEmpty = SPACE_TABS.find(([k]) => count(d, k)); V.tab = firstNonEmpty ? firstNonEmpty[0] : 'lecture'; }
  const tabs = SPACE_TABS.filter(([k]) => k !== 'other' || count(d, 'other') || d.manage);
  const pane = document.querySelector('.pane');
  pane.innerHTML = `
    <header class="pane-h space-h">
      <a class="ib only-m" href="#/">${svg('back')}</a>
      <span class="sq lg">${subjIcon(tv(d.title))}</span>
      <div class="pane-t"><b>${esc(tv(d.title))}</b><small>${esc(d.teacher)} · ${esc(d.groups.join(', '))}${d.officeHours ? ' · ' + esc(t('консультации: {v}', { v: d.officeHours })) : ''}</small></div>
    </header>
    <nav class="tabs">${tabs.map(([k, l]) => `<button data-k="${k}" class="${V.tab === k ? 'on' : ''}">${t(l)}<span>${count(d, k)}</span></button>`).join('')}
      ${d.manage ? `<span class="grow"></span><button class="btn pri sm" id="addBtn" title="${t(V.tab === 'task' ? 'Задание' : 'Добавить')}">${svg('plus')}<span>${t(V.tab === 'task' ? 'Задание' : 'Добавить')}</span></button>` : ''}</nav>
    <div class="pane-b"><div class="col">${V.tab === 'task' ? tasksHTML(d) : postsHTML(d, V.tab)}</div></div>`;
  pane.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { V.tab = b.dataset.k; paintSpace(false); } };
  const add = pane.querySelector('#addBtn'); if (add) add.onclick = () => (V.tab === 'task' ? taskDlg() : materialDlg(V.tab));
  bindFiles(pane);
  pane.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { const k = b.dataset.kind; const x = (k === 'task' ? d.tasks : d.materials).find((r) => r.id === b.dataset.edit); k === 'task' ? taskDlg(x) : materialDlg(x.kind, x); }));
  pane.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить?'), t('Публикация исчезнет у всех студентов.'), () => act(b.dataset.kind === 'task' ? '/message/task/delete' : '/message/material/delete', { id: b.dataset.del }, t('Удалено')))));
}
const count = (d, k) => (k === 'task' ? d.tasks.length : d.materials.filter((m) => m.kind === k).length);
function manageBtns(d, id, kind) {
  return d.manage ? `<span class="acts"><button class="ib sm" data-edit="${esc(id)}" data-kind="${kind}" title="${t('Изменить')}">${svg('edit')}</button><button class="ib sm" data-del="${esc(id)}" data-kind="${kind}" title="${t('Удалить')}">${svg('trash')}</button></span>` : '';
}
function postsHTML(d, kind) {
  const list = d.materials.filter((m) => m.kind === kind).sort((a, b) => a.at - b.at); // по порядку: Лекция 1, 2, 3…
  if (!list.length) return `<div class="empty">${svg('book')}<b>${t(kind === 'lecture' ? 'Лекций пока нет' : kind === 'practice' ? 'Практик пока нет' : 'Материалов пока нет')}</b><span>${t(d.manage ? 'Нажмите «Добавить», чтобы опубликовать — студенты получат уведомление.' : 'Когда преподаватель опубликует, они появятся здесь.')}</span></div>`;
  return list.map((m, i) => `<article class="post">
    <div class="num">${kind === 'other' ? svg('file') : i + 1}</div>
    <div class="post-c">
      <div class="post-h"><span class="kicker">${t(KIND[kind])}${kind === 'other' ? '' : ' ' + (i + 1)}</span><small>${esc(fmtDay(isoOf(m.at)))}${m.edited ? ' · ' + t('изменено') : ''}</small>${manageBtns(d, m.id, 'material')}</div>
      <h3>${esc(m.title)}</h3>
      ${m.text ? `<p class="txt">${md(m.text)}</p>` : ''}
      ${m.file ? fileCard(m.file) : ''}
    </div></article>`).join('');
}
function tasksHTML(d) {
  if (!d.tasks.length) return `<div class="empty">${svg('clock')}<b>${t('Заданий нет')}</b><span>${t(d.manage ? 'Здесь — работы с долгим сроком сдачи (не меньше недели): проекты, курсовые, рефераты.' : 'Здесь появятся работы с долгим сроком сдачи: проекты, курсовые, рефераты.')}</span></div>`;
  return d.tasks.map((x) => {
    const n = daysLeft(x.due);
    return `<article class="post task ${n < 0 ? 'past' : ''}">
      <div class="date"><b>${esc(x.due.slice(8))}</b><small>${esc(fmtDay(x.due).replace(/^\d+\s*/, '').slice(0, 3))}</small></div>
      <div class="post-c">
        <div class="post-h"><span class="kicker ${n >= 0 && n <= 3 ? 'hot' : ''}">${n < 0 ? t('срок прошёл') : n === 0 ? t('сдать сегодня') : t('осталось {n} дн.', { n })}</span><small>${esc(t('до {d}', { d: fmtDay(x.due) }))}${x.edited ? ' · ' + t('изменено') : ''}</small>${manageBtns(d, x.id, 'task')}</div>
        <h3>${esc(x.title)}</h3>
        ${x.text ? `<p class="txt">${md(x.text)}</p>` : ''}
        ${x.file ? fileCard(x.file) : ''}
      </div></article>`;
  }).join('');
}
function confirmDlg(title, text, run) {
  modal(title, `<p class="muted">${text}</p><button class="btn danger wide" id="cfGo">${t('Удалить')}</button>`, (box, close) => { box.querySelector('#cfGo').onclick = () => { close(); run(); }; });
}
function fileField(box) {
  let file = null;
  const btn = box.querySelector('#fFile'), lbl = box.querySelector('#fFileN');
  btn.onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { lbl.textContent = t('загрузка…'); file = await uploadFile(f); lbl.textContent = file.name; } catch (e) { file = null; lbl.textContent = t('Прикрепить файл'); toast(e.message, true); }
  };
  return () => file;
}
/* Публикация лекции / практики / материала; x — редактирование существующей */
function materialDlg(kind, x) {
  modal(t(x ? 'Изменить' : kind === 'lecture' ? 'Новая лекция' : kind === 'practice' ? 'Новая практика' : 'Новый материал'), `
    <input class="inp" id="fTitle" maxlength="160" placeholder="${t('Тема')}" value="${esc(x ? x.title : '')}">
    <textarea class="inp" id="fText" rows="5" maxlength="2000" placeholder="${t('Описание или ссылка (необязательно)')}">${esc(x ? x.text : '')}</textarea>
    ${x ? '' : `<button class="btn" id="fFile" type="button">${svg('clip')}<span id="fFileN">${t('Прикрепить файл')}</span></button>`}
    <button class="btn pri wide" id="fGo">${t(x ? 'Сохранить' : 'Опубликовать')}</button>`, (box, close) => {
    const file = x ? () => null : fileField(box);
    box.querySelector('#fGo').onclick = async () => {
      const title = box.querySelector('#fTitle').value, text = box.querySelector('#fText').value;
      const done = x ? await act('/message/material/edit', { id: x.id, title, text }, t('Сохранено'))
        : await act('/message/material', { ch: M.ch, kind, title, text, fileId: file() ? file().id : '' }, t('Опубликовано — студенты получат уведомление'));
      if (done) close();
    };
  });
}
function taskDlg(x) {
  const min = x ? todayIso() : V.data.minDue;
  modal(t(x ? 'Изменить задание' : 'Новое задание'), `
    <input class="inp" id="fTitle" maxlength="160" placeholder="${t('Название, например: Курсовой проект')}" value="${esc(x ? x.title : '')}">
    <textarea class="inp" id="fText" rows="4" maxlength="2000" placeholder="${t('Что нужно сделать (необязательно)')}">${esc(x ? x.text : '')}</textarea>
    <label class="lbl">${t('Срок сдачи')}</label>
    <input class="inp" id="fDue" type="date" min="${min}" value="${esc(x ? x.due : V.data.minDue)}">
    ${x ? `<p class="muted sm">${t('Если изменить срок, студенты получат уведомление.')}</p>` : `<p class="muted sm">${t('Только задания с долгим сроком — не меньше недели.')}</p><button class="btn" id="fFile" type="button">${svg('clip')}<span id="fFileN">${t('Прикрепить файл')}</span></button>`}
    <button class="btn pri wide" id="fGo">${t(x ? 'Сохранить' : 'Опубликовать')}</button>`, (box, close) => {
    const file = x ? () => null : fileField(box);
    box.querySelector('#fGo').onclick = async () => {
      const body = { title: box.querySelector('#fTitle').value, text: box.querySelector('#fText').value, due: box.querySelector('#fDue').value };
      const done = x ? await act('/message/task/edit', Object.assign({ id: x.id }, body), t('Сохранено'))
        : await act('/message/task', Object.assign({ ch: M.ch, fileId: file() ? file().id : '' }, body), t('Опубликовано — студенты получат уведомление'));
      if (done) close();
    };
  });
}

/* ---------- Личный чат ---------- */
function paintDM(first) {
  const d = V.data, o = d.other;
  let pane = document.querySelector('.pane');
  if (first || !pane.querySelector('.composer')) {
    pane.innerHTML = `
      <header class="pane-h"><a class="ib only-m" href="#/">${svg('back')}</a>${personIco(o)}
        <div class="pane-t"><b>${esc(o.fio)}</b><small id="dmSub"></small></div></header>
      <div class="pane-b chat" id="chatBody"><div class="col" id="chatList"></div></div>
      <footer class="composer">
        <div class="pend" id="pend" hidden></div>
        <div class="comp">
          <button class="ib" id="attach" title="${t('Прикрепить файл')}">${svg('clip')}</button>
          ${teacher() ? `<button class="ib" id="quick" title="${t('Быстрые ответы')}">${svg('quote')}</button>` : ''}
          <textarea id="inp" rows="1" maxlength="2000" placeholder="${t('Сообщение…')}"></textarea>
          <button class="send" id="send" title="${t('Отправить')}">${svg('send')}</button>
        </div>
      </footer>`;
    bindComposer();
  }
  document.getElementById('dmSub').textContent = [o.role === 'teacher' ? t('Преподаватель') : o.group, o.online ? t('в сети') : '', o.officeHours ? t('консультации: {v}', { v: o.officeHours }) : ''].filter(Boolean).join(' · ');
  const body = document.getElementById('chatBody'), list = document.getElementById('chatList');
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
  let lastDay = '';
  list.innerHTML = d.items.length ? d.items.map((m) => {
    const day = isoOf(m.at), mine = m.from === M.user.id;
    const sep = day !== lastDay ? `<div class="day">${esc(day === todayIso() ? t('Сегодня') : fmtDay(day, true))}</div>` : '';
    lastDay = day;
    const read = mine && d.otherRead != null && d.otherRead >= m.at;
    return `${sep}<div class="msg ${mine ? 'me' : ''}"><div class="bub">${m.text ? `<span class="txt">${md(m.text)}</span>` : ''}${m.file ? fileCard(m.file) : ''}
      <span class="meta">${esc(timeOf(m.at))}${mine ? `<i class="rc ${read ? 'read' : ''}">${svg(read ? 'checks' : 'check')}</i>` : ''}</span></div>
      ${mine ? `<button class="ib sm del" data-del="${esc(m.id)}" title="${t('Удалить')}">${svg('trash')}</button>` : ''}</div>`;
  }).join('') : `<div class="empty">${svg('chat')}<span>${t(teacher() ? 'Напишите студенту — сообщение увидит только он.' : 'Задайте вопрос — его увидит только преподаватель.')}</span></div>`;
  bindFiles(list);
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить сообщение?'), t('Сообщение исчезнет у обоих.'), () => act('/message/delete', { id: b.dataset.del }))));
  if (first || atBottom) body.scrollTop = body.scrollHeight;
}
function bindComposer() {
  const inp = document.getElementById('inp');
  inp.oninput = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 160) + 'px'; };
  inp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const enterSend = getPrefs().enterSend; // иначе — Ctrl+Enter
    if ((enterSend && !e.shiftKey) || (!enterSend && (e.ctrlKey || e.metaKey))) { e.preventDefault(); sendMsg(); }
  };
  document.getElementById('send').onclick = sendMsg;
  document.getElementById('attach').onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { setPend({ name: f.name, uploading: true }); setPend(await uploadFile(f)); } catch (e) { setPend(null); toast(e.message, true); }
  };
  const q = document.getElementById('quick');
  if (q) q.onclick = () => modal(t('Быстрые ответы'), `<div class="qr">${getQuick().map((x, i) => `<button data-i="${i}">${esc(x)}</button>`).join('')}</div><p class="muted sm">${t('Шаблоны меняются в настройках.')}</p>`, (box, close) => {
    box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { inp.value = (inp.value ? inp.value + '\n' : '') + getQuick()[+b.dataset.i]; inp.dispatchEvent(new Event('input')); close(); inp.focus(); }));
  });
  if (matchMedia('(min-width: 900px)').matches) inp.focus();
}
function setPend(f) {
  V.file = f && !f.uploading ? f : null;
  const box = document.getElementById('pend'); if (!box) return;
  box.hidden = !f;
  box.innerHTML = f ? `${svg('clip')}<b>${esc(f.name)}</b><small>${f.uploading ? t('загрузка…') : fmtSize(f.size)}</small>${f.uploading ? '' : `<button class="ib sm" id="unpend">${svg('x')}</button>`}` : '';
  const x = document.getElementById('unpend'); if (x) x.onclick = () => setPend(null);
}
async function sendMsg() {
  const inp = document.getElementById('inp');
  const text = inp.value.trim();
  if ((!text && !V.file) || V.sending) return;
  V.sending = true;
  try {
    await api('/message/send', { method: 'POST', body: { ch: M.ch, text, fileId: V.file ? V.file.id : '' } });
    inp.value = ''; inp.style.height = 'auto'; setPend(null);
    V.sig = ''; await load(false); refreshList();
    const b = document.getElementById('chatBody'); b.scrollTop = b.scrollHeight;
  } catch (e) { toast(e.message, true); }
  V.sending = false;
}

/* ============================ Быстрые ответы (шаблоны меняются в настройках — settings.js) ============================ */
const QUICK_DEFAULT = ['Добрый день! Посмотрю и отвечу сегодня до конца дня.', 'Материалы уже на странице предмета — вкладка «Лекции».', 'Приходите на консультацию — время указано в моём профиле.'];
const quickKey = () => 'kum_quick:' + M.user.id;
function getQuick() { try { const v = JSON.parse(localStorage.getItem(quickKey()) || 'null'); return Array.isArray(v) && v.length ? v : QUICK_DEFAULT.map((x) => t(x)); } catch { return QUICK_DEFAULT.map((x) => t(x)); } }
