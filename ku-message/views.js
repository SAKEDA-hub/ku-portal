'use strict';
/* KU Message — экраны, в духе Telegram и Teams.
 * Слева узкая панель разделов (как в Teams): «Чаты», «Предметы», «Клубы» (у преподавателя ещё «Ученики»), «Настройки»;
 * рядом — список раздела (как в Telegram), справа — открытое:
 *   #/s/<s:id>      — страница предмета: вкладки «Лекции», «Практики», «Задания» (+ «Материалы», если есть);
 *                     публикует преподаватель предмета, студенты читают и скачивают файлы.
 *   #/d/<d:…>       — личная переписка. Студент сам пишет преподавателю; преподаватель открывает чат из вкладки «Ученики».
 *   #/c/<club>      — клуб: «Канал» (публикации и мероприятия — только от глав клуба) и «Чат» участников (#/c/<club>/chat).
 *                     Студент видит только клубы, где он участник: заявки подаются и рассматриваются в KU Portal («Клубы»),
 *                     клуб появляется здесь, когда глава примет заявку. Без клубов раздел «Клубы» у студента скрыт.
 *   #/settings[/…]  — настройки (settings.js).
 * На телефоне панель разделов — внизу, список и открытый экран сменяют друг друга.
 */
const KIND = { lecture: 'Лекция', practice: 'Практика', other: 'Материал' };
const SPACE_TABS = [['lecture', 'Лекции'], ['practice', 'Практики'], ['task', 'Задания'], ['other', 'Материалы']];
const T = { list: null, open: null };
const POLL_LIST_MS = 6000, POLL_OPEN_MS = 3000;
const GROUP_MS = 5 * 60e3; // сообщения одного автора ближе 5 минут — одной группой, как в Telegram
const V = { data: null, sig: '', tab: 'lecture', file: null, sending: false, send: null, reload: null };
const teacher = () => M.user.role === 'teacher';

function stopTimers() { Object.keys(T).forEach((k) => { if (T[k]) clearInterval(T[k]); T[k] = null; }); }

/* ============================ Вход ============================ */
function viewLogin(msg) {
  stopTimers();
  app.innerHTML = `<div class="login wall"><div class="login-card">
    <div class="brand"><span class="logo lg">${svg('logo')}</span><b class="brand-t">KU Message</b></div>
    <p class="muted">${t('Лекции, практики и задания по предметам и личные вопросы преподавателям.')}</p>
    <a class="btn pri wide" href="${esc(backUrl())}">${t('Войти через KU Portal')}</a>
    <div class="or">${t('или')}</div>
    <input class="inp" id="lgEmail" type="email" placeholder="Email" autocomplete="username">
    <input class="inp" id="lgPass" type="password" placeholder="${t('Пароль')}" autocomplete="current-password">
    <div class="err">${msg ? esc(msg) : ''}</div>
    <button class="btn wide" id="lgGo">${t('Войти')}</button>
    <div id="demoBox"></div>
  </div></div>`;
  const login = async (email, password) => {
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (d.need2fa) throw new Error(t('Для аккаунта с двухфакторной защитой войдите через KU Portal'));
      await enter(d.token);
    } catch (e) { app.querySelector('.err').textContent = e.message; }
  };
  const go = () => login(document.getElementById('lgEmail').value.trim(), document.getElementById('lgPass').value);
  document.getElementById('lgGo').onclick = go;
  document.getElementById('lgPass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  demoBox(login);
}
/* Бета-аккаунты (как на входе в портал): вход в один клик */
async function demoBox(login) {
  let d;
  try { d = await api('/demo'); } catch { return; }
  const box = document.getElementById('demoBox');
  if (!box || !d.enabled) return;
  const TRACK = { it: 'IT', bio: 'Биотехнологии', lang: 'Языки' };
  const btn = (a) => `<button class="demo-acc" data-demo="${esc(a.email)}"><span class="ava sm" style="--h:${hue(a.email)}">${initials(a.fio)}</span>
    <span class="demo-t"><b>${esc(a.fio)}</b><small>${esc([a.group || t('Преподаватель'), a.track ? t(TRACK[a.track]) : ''].filter(Boolean).join(' · '))}</small></span></button>`;
  const part = (role, l) => `<div class="demo-lbl">${t(l)}</div><div class="demo-grid">${d.accounts.filter((a) => a.role === role).map(btn).join('')}</div>`;
  box.innerHTML = `<div class="demo-box"><b>${t('Бета-аккаунты')}</b>
    <small>${esc(t('Пароль у всех: {p}. Группы ИСУ — направление IT, группы БТ — биотехнологии.', { p: d.password }))}</small>
    ${part('student', 'Студенты')}${part('teacher', 'Преподаватели')}</div>`;
  box.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = () => login(b.dataset.demo, d.password)));
}

/* ============================ Каркас ============================ */
function railItems() {
  const items = [['chats', 'chat', 'Чаты'], ['subjects', 'book', 'Предметы'], ['clubs', 'flag', 'Клубы']];
  if (teacher()) items.push(['students', 'users', 'Ученики']);
  return items;
}
const TAB_TITLE = { chats: 'Чаты', subjects: 'Предметы', clubs: 'Клубы', students: 'Ученики', settings: 'Настройки' };
function startApp() {
  const u = M.user;
  app.innerHTML = `<div class="km" id="km">
    <nav class="rail" id="rail">
      <a class="rail-logo" href="#/" title="KU Message"><span class="logo">${svg('logo')}</span></a>
      ${railItems().map(([k, ic, l]) => `<button class="rail-i" data-t="${k}">${svg(ic)}<span>${t(l)}</span><em hidden></em></button>`).join('')}
      <span class="grow"></span>
      <button class="rail-i" data-t="settings">${svg('gear')}<span>${t('Настройки')}</span></button>
      <a class="rail-i rail-portal" href="${esc(backUrl())}" title="KU Portal">${svg('home')}<span>Portal</span></a>
      <a class="rail-me" href="#/settings/profile" title="${esc(u.fio)}"><span class="ava" style="--h:${hue(u.id)}">${initials(u.fio)}</span></a>
    </nav>
    <aside class="side">
      <header class="side-h">
        <b class="side-t" id="sideT"></b>
        <span class="grow"></span>
        <a class="ib only-m" href="${esc(backUrl())}" title="KU Portal">${svg('home')}</a>
      </header>
      <label class="search" id="searchBox">${svg('search')}<input id="q" placeholder="${t('Поиск')}" autocomplete="off"></label>
      <div class="list" id="list"></div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  document.getElementById('rail').onclick = (e) => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    if (b.dataset.t === 'settings') { location.hash = '#/settings'; return; }
    M.tab = b.dataset.t; M.q = ''; document.getElementById('q').value = '';
    if (/^#\/settings/.test(location.hash)) location.hash = '#/'; else { paintRail(); paintList(); }
  };
  document.getElementById('q').oninput = (e) => { M.q = e.target.value.trim().toLowerCase(); paintList(); };
  window.onhashchange = route;
  route();
  refreshList();
  T.list = setInterval(refreshList, POLL_LIST_MS);
}
const sumUnread = (list) => (list || []).reduce((n, x) => n + (x.unread || 0), 0);
const clubUnread = (c) => (c.unread ? c.unread.channel + c.unread.chat : 0);
function badges() {
  const d = M.list, c = M.clubs;
  const clubs = c ? myClubs().reduce((n, x) => n + clubUnread(x), 0) : 0;
  return { chats: d ? sumUnread(d.contacts) : 0, subjects: d ? sumUnread(d.spaces) : 0, clubs, students: 0, settings: 0 };
}
/* Клубы, которые видны в мессенджере: у преподавателя (главы) — все, у студента — только те, где он участник */
const myClubs = () => (M.clubs ? M.clubs.items.filter((c) => teacher() || c.joined) : []);
function paintRail() {
  const n = badges();
  const noClubs = !teacher() && M.clubs && !myClubs().length;
  if (noClubs && M.tab === 'clubs') M.tab = 'chats';
  document.querySelectorAll('#rail [data-t]').forEach((b) => {
    if (b.dataset.t === 'clubs') b.hidden = !!noClubs;
    b.classList.toggle('on', b.dataset.t === M.tab);
    const em = b.querySelector('em'); if (!em) return;
    em.hidden = !n[b.dataset.t]; em.textContent = n[b.dataset.t] > 99 ? '99+' : n[b.dataset.t];
  });
  const st = document.getElementById('sideT'); if (st) st.textContent = t(TAB_TITLE[M.tab]);
  const sb = document.getElementById('searchBox'); if (sb) sb.hidden = M.tab === 'settings';
  const total = n.chats + n.subjects + n.clubs;
  document.title = (total ? `(${total}) ` : '') + 'KU Message';
}
function route() {
  if (T.open) { clearInterval(T.open); T.open = null; }
  const h = location.hash, km = document.getElementById('km');
  const st = /^#\/settings(?:\/(\w+))?$/.exec(h);
  if (st) { M.tab = 'settings'; M.ch = null; km.classList.toggle('open', !!st[1]); paintRail(); paintList(); return viewSettings(st[1] || ''); }
  const c = /^#\/c\/([\w-]+)(?:\/(chat))?$/.exec(h);
  if (c) { M.tab = 'clubs'; M.ch = 'club:' + c[1]; km.classList.add('open'); paintRail(); paintList(); return openClub(c[1], c[2] || 'channel'); }
  const m = /^#\/(s|d)\/(.+)$/.exec(h);
  M.ch = m ? decodeURIComponent(m[2]) : null;
  if (m && m[1] === 'd' && !['chats', 'students'].includes(M.tab)) M.tab = teacher() && !(M.list && M.list.contacts.some((x) => x.ch === M.ch && x.last)) ? 'students' : 'chats';
  if (m && m[1] === 's') M.tab = 'subjects';
  if (!m && M.tab === 'settings') M.tab = 'chats';
  km.classList.toggle('open', !!M.ch);
  paintRail(); paintList();
  if (M.ch) openItem(); else paintWelcome();
}
async function refreshList() {
  const [l, c] = await Promise.allSettled([api('/message/list'), api('/clubs')]);
  if (l.status === 'fulfilled') M.list = l.value;
  if (c.status === 'fulfilled') M.clubs = c.value;
  paintRail(); paintList();
}

/* ============================ Списки ============================ */
const subjIcon = (title) => esc(String(title || '?').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?');
/* Строка списка как в Telegram: имя и время сверху, превью и счётчик снизу */
function rowHTML(href, ico, name, sub, when, badge, on, unread) {
  return `<a class="row ${on ? 'on' : ''} ${unread ? 'unread' : ''}" href="${href}">${ico}
    <span class="row-t"><span class="row-1"><b>${esc(name)}</b>${when ? `<small>${when}</small>` : ''}</span>
    <span class="row-2"><span class="row-s">${sub}</span>${badge || ''}</span></span></a>`;
}
function personIco(p, cls) { return `<span class="ava ${cls || ''}" style="--h:${hue(p.id)}">${initials(p.fio)}${p.online ? '<i class="on"></i>' : ''}</span>`; }
const pill = (n) => (n ? `<em class="pill">${n > 99 ? '99+' : n}</em>` : '');
function lastText(c) {
  if (!c.last) return '';
  if (!getPrefs().previews) return c.unread ? t('Новые сообщения') : esc(c.role === 'teacher' ? t('Преподаватель') : c.group || '');
  return `${c.last.from === M.user.id ? `<span class="you">${t('Вы: ')}</span>` : ''}${esc(c.last.text)}`;
}
function paintList() {
  const box = document.getElementById('list'); if (!box) return;
  if (M.tab === 'settings') { box.innerHTML = settingsMenuHTML(); return; }
  const d = M.list;
  if (!d || (M.tab === 'clubs' && !M.clubs)) { box.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; return; }
  const q = (s) => !M.q || String(s).toLowerCase().includes(M.q);
  let html = '';
  if (M.tab === 'subjects') {
    html = d.spaces.filter((s) => q(tv(s.title))).map((s) => rowHTML(`#/s/${encodeURIComponent(s.id)}`, `<span class="sq" style="--h:${hue(s.id)}">${subjIcon(tv(s.title))}</span>`, tv(s.title),
      esc(teacher() ? s.groups.join(', ') : s.teacher),
      s.last ? esc(whenShort(s.last.at)) : '',
      s.unread ? pill(s.unread) : s.nextDue ? `<span class="due-chip">${esc(t('до {d}', { d: fmtDay(s.nextDue) }))}</span>` : '',
      M.ch === s.id, s.unread)).join('') || `<div class="empty-s">${t(teacher() ? 'Предметы появятся, когда вы добавите занятия в расписание.' : 'Предметы появятся, когда преподаватель добавит занятия вашей группе.')}</div>`;
  } else if (M.tab === 'chats') {
    const talks = d.contacts.filter((c) => c.last && q(c.fio)).sort((a, b) => b.last.at - a.last.at);
    html = talks.map((c) => rowHTML(`#/d/${encodeURIComponent(c.ch)}`, personIco(c), c.fio, lastText(c), esc(whenShort(c.last.at)), pill(c.unread), M.ch === c.ch, c.unread)).join('');
    if (!teacher()) {
      const fresh = d.contacts.filter((c) => !c.last && q(c.fio));
      if (fresh.length) html += `<div class="sep">${t('Преподаватели')}</div>` + fresh.map((c) => rowHTML(`#/d/${encodeURIComponent(c.ch)}`, personIco(c), c.fio, esc(t(c.online ? 'в сети' : 'Преподаватель')), '', '', M.ch === c.ch)).join('');
    }
    if (!html) html = `<div class="empty-s">${t(teacher() ? 'Здесь будут переписки со студентами. Написать студенту можно во вкладке «Ученики».' : 'Переписок пока нет.')}</div>`;
  } else if (M.tab === 'clubs') {
    html = clubsListHTML(q);
  } else {
    const groups = [...new Set(d.contacts.map((c) => c.group))].sort();
    html = groups.map((g) => {
      const people = d.contacts.filter((c) => c.group === g && q(c.fio));
      return people.length ? `<div class="sep">${esc(g)}</div>` + people.map((c) => rowHTML(`#/d/${encodeURIComponent(c.ch)}`, personIco(c), c.fio, esc(c.online ? t('в сети') : t('Студент')), '', `<span class="link">${t('Написать')}</span>`, M.ch === c.ch)).join('') : '';
    }).join('') || `<div class="empty-s">${t('Студенты появятся, когда у вас будут занятия с группами.')}</div>`;
  }
  box.innerHTML = html;
}
function clubRow(c) {
  const sub = c.last ? esc(c.last.text) : esc(t('участников: {n}', { n: c.members }));
  return rowHTML(`#/c/${c.id}`, clubIco(c), tv(c.name), sub, c.last ? esc(whenShort(c.last.at)) : '', pill(clubUnread(c)), M.ch === 'club:' + c.id, clubUnread(c));
}
function clubsListHTML(q) {
  return myClubs().filter((c) => q(tv(c.name))).map(clubRow).join('') || `<div class="empty-s">${t('Ничего не найдено.')}</div>`;
}
function paintWelcome() {
  const d = M.list;
  const due = d ? d.spaces.filter((s) => s.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue)) : [];
  document.getElementById('main').innerHTML = `<div class="welcome wall"><div class="welcome-c">
    <span class="logo xl">${svg('logo')}</span>
    <b>${esc(t('Здравствуйте, {n}!', { n: M.user.firstName }))}</b>
    <p class="muted">${t(teacher() ? 'Откройте предмет, чтобы добавить лекцию, практику или задание.' : 'Откройте предмет, чтобы посмотреть лекции и практики, или напишите преподавателю.')}</p>
    ${due.length && !teacher() ? `<div class="soon"><div class="soon-h">${t('Ближайшие сроки сдачи')}</div>${due.slice(0, 4).map((s) => `<a href="#/s/${encodeURIComponent(s.id)}"><span>${esc(tv(s.title))}</span><span class="due-chip">${esc(t('до {d}', { d: fmtDay(s.nextDue) }))}</span></a>`).join('')}</div>` : ''}
  </div></div>`;
}

/* ============================ Открытый предмет / чат ============================ */
async function openItem() {
  Object.assign(V, { data: null, sig: '', file: null, sending: false, send: null, reload: () => load(false) });
  const main = document.getElementById('main');
  main.innerHTML = `<div class="pane"><header class="pane-h"><a class="ib only-m" href="#/">${svg('back')}</a><div class="pane-t"><b>${t('Загрузка…')}</b></div></header><div class="pane-b"><div class="skel big"></div></div></div>`;
  await load(true);
  if (V.data) T.open = setInterval(() => load(false), POLL_OPEN_MS);
}
async function load(first) {
  let d;
  try { d = await api('/message/open?ch=' + encodeURIComponent(M.ch)); }
  catch (e) { if (first) noAccess(e); return; }
  if (!document.querySelector('.pane')) return;
  const sig = JSON.stringify(d);
  if (sig === V.sig) return;
  const firstLoad = !V.data;
  V.data = d; V.sig = sig;
  if (firstLoad) setTimeout(refreshList, 200); // непрочитанное обнулилось
  if (d.kind === 'space') paintSpace(firstLoad); else paintDM(firstLoad);
}
function noAccess(e) { const b = document.querySelector('.pane-b'); if (b) b.innerHTML = `<div class="empty">${svg('lock')}<b>${t('Нет доступа')}</b><span>${esc(e.message)}</span></div>`; }
async function act(path, body, okText) {
  try { await api(path, { method: 'POST', body }); if (okText) toast(okText); V.sig = ''; if (V.reload) await V.reload(); refreshList(); return true; }
  catch (e) { toast(e.message, true); return false; }
}

/* ---------- Предмет (как команда в Teams: шапка-баннер и вкладки) ---------- */
function paintSpace(first) {
  const d = V.data;
  if (first) { const firstNonEmpty = SPACE_TABS.find(([k]) => count(d, k)); V.tab = firstNonEmpty ? firstNonEmpty[0] : 'lecture'; }
  const tabs = SPACE_TABS.filter(([k]) => k !== 'other' || count(d, 'other') || d.manage);
  const pane = document.querySelector('.pane');
  pane.innerHTML = `
    <header class="pane-h space-h" style="--h:${hue(M.ch)}">
      <a class="ib only-m" href="#/">${svg('back')}</a>
      <span class="sq lg" style="--h:${hue(M.ch)}">${subjIcon(tv(d.title))}</span>
      <div class="pane-t"><b>${esc(tv(d.title))}</b><small>${esc(d.teacher)} · ${esc(d.groups.join(', '))}${d.officeHours ? ' · ' + esc(t('консультации: {v}', { v: d.officeHours })) : ''}</small></div>
    </header>
    <nav class="tabs">${tabs.map(([k, l]) => `<button data-k="${k}" class="${V.tab === k ? 'on' : ''}">${t(l)}<span>${count(d, k)}</span></button>`).join('')}
      ${d.manage ? `<span class="grow"></span><button class="btn pri sm" id="addBtn" title="${t(V.tab === 'task' ? 'Задание' : 'Добавить')}">${svg('plus')}<span>${t(V.tab === 'task' ? 'Задание' : 'Добавить')}</span></button>` : ''}</nav>
    <div class="pane-b feed"><div class="col">${V.tab === 'task' ? tasksHTML(d) : postsHTML(d, V.tab)}</div></div>`;
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
function confirmDlg(title, text, run, btn) {
  modal(title, `<p class="muted">${text}</p><button class="btn danger wide" id="cfGo">${btn || t('Удалить')}</button>`, (box, close) => { box.querySelector('#cfGo').onclick = () => { close(); run(); }; });
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

/* ---------- Переписка: общий вид для лички и чата клуба ---------- */
/* o: { group — имена и аватары (чат клуба), people — id → человек, otherRead — до какого времени прочитано (только в личке) } */
function msgsHTML(items, o) {
  const same = (a, b) => a && b && a.from === b.from && isoOf(a.at) === isoOf(b.at) && Math.abs(b.at - a.at) < GROUP_MS;
  let lastDay = '';
  return items.map((m, i) => {
    const day = isoOf(m.at), mine = m.from === M.user.id;
    const sep = day !== lastDay ? `<div class="day"><span>${esc(day === todayIso() ? t('Сегодня') : fmtDay(day, true))}</span></div>` : '';
    lastDay = day;
    const first = !same(items[i - 1], m) || !!sep, last = !same(m, items[i + 1]);
    const p = (o.people && o.people[m.from]) || { id: m.from, fio: '—' };
    const read = mine && o.otherRead != null && o.otherRead >= m.at;
    const side = o.group && !mine ? (last ? personIco(p, 'sm') : '<span class="ava-gap"></span>') : '';
    const who = o.group && !mine && first ? `<b class="who" style="--h:${hue(p.id)}">${esc(p.fio)}${p.role === 'teacher' ? `<i>${t('глава клуба')}</i>` : ''}</b>` : '';
    return `${sep}<div class="msg ${mine ? 'me' : ''} ${first ? 'first' : ''} ${last ? 'last' : ''}">${side}<div class="bub">${who}${m.text ? `<span class="txt">${md(m.text)}</span>` : ''}${m.file ? fileCard(m.file) : ''}
      <span class="meta">${esc(timeOf(m.at))}${mine && 'otherRead' in o ? `<i class="rc ${read ? 'read' : ''}">${svg(read ? 'checks' : 'check')}</i>` : ''}</span></div>
      ${mine ? `<button class="ib sm del" data-del="${esc(m.id)}" title="${t('Удалить')}">${svg('trash')}</button>` : ''}</div>`;
  }).join('');
}
function composerHTML(o) {
  return `<footer class="composer">
    <div class="pend" id="pend" hidden></div>
    <div class="comp">
      ${o.attach ? `<button class="ib" id="attach" title="${t('Прикрепить файл')}">${svg('clip')}</button>` : ''}
      ${o.extra || ''}
      <textarea id="inp" rows="1" maxlength="2000" placeholder="${o.placeholder || t('Сообщение…')}"></textarea>
      <button class="send" id="send" title="${t('Отправить')}">${svg('send')}</button>
    </div>
  </footer>`;
}

/* ---------- Личный чат ---------- */
function paintDM(first) {
  const d = V.data, o = d.other;
  const pane = document.querySelector('.pane');
  if (first || !pane.querySelector('.composer')) {
    pane.innerHTML = `
      <header class="pane-h"><a class="ib only-m" href="#/">${svg('back')}</a>${personIco(o)}
        <div class="pane-t"><b>${esc(o.fio)}</b><small id="dmSub"></small></div></header>
      <div class="pane-b chat wall" id="chatBody"><div class="col" id="chatList"></div></div>
      ${composerHTML({ attach: true, extra: teacher() ? `<button class="ib" id="quick" title="${t('Быстрые ответы')}">${svg('quote')}</button>` : '' })}`;
    V.send = (text, file) => api('/message/send', { method: 'POST', body: { ch: M.ch, text, fileId: file ? file.id : '' } });
    bindComposer();
  }
  const sub = document.getElementById('dmSub');
  sub.textContent = [o.role === 'teacher' ? t('Преподаватель') : o.group, o.online ? t('в сети') : '', o.officeHours ? t('консультации: {v}', { v: o.officeHours }) : ''].filter(Boolean).join(' · ');
  sub.classList.toggle('online', !!o.online);
  const body = document.getElementById('chatBody'), list = document.getElementById('chatList');
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
  list.innerHTML = d.items.length ? msgsHTML(d.items, { otherRead: d.otherRead }) : `<div class="empty chip-empty">${svg('chat')}<span>${t(teacher() ? 'Напишите студенту — сообщение увидит только он.' : 'Задайте вопрос — его увидит только преподаватель.')}</span></div>`;
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
  const at = document.getElementById('attach');
  if (at) at.onclick = async () => {
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
  if ((!text && !V.file) || V.sending || !V.send) return;
  V.sending = true;
  try {
    await V.send(text, V.file);
    inp.value = ''; inp.style.height = 'auto'; setPend(null);
    V.sig = ''; if (V.reload) await V.reload(); refreshList();
    const b = document.getElementById('chatBody'); if (b) b.scrollTop = b.scrollHeight;
  } catch (e) { toast(e.message, true); }
  V.sending = false;
}

/* ============================ Клубы ============================ */
const clubById = (id) => (M.clubs ? M.clubs.items.find((x) => x.id === id) : null);
function meetText(m) { return m ? `${weekdayName(m.day)}, ${m.time}${m.endTime ? '–' + m.endTime : ''} · ${tv(m.place)}` : ''; }
async function refreshClubs() { M.clubs = await api('/clubs'); paintRail(); paintList(); }
async function openClub(id, tab) {
  Object.assign(V, { data: null, sig: '', file: null, sending: false, send: null, reload: null });
  const main = document.getElementById('main');
  main.innerHTML = `<div class="pane"><header class="pane-h"><a class="ib only-m" href="#/">${svg('back')}</a><div class="pane-t"><b>${t('Загрузка…')}</b></div></header><div class="pane-b"><div class="skel big"></div></div></div>`;
  if (!M.clubs) { try { await refreshClubs(); } catch (e) { return noAccess(e); } }
  const c = clubById(id);
  if (!c || (!teacher() && !c.joined)) { main.querySelector('.pane-t b').textContent = t('Клубы'); return noAccess(new Error(t('Клуб появится здесь, когда глава примет вашу заявку в KU Portal.'))); }
  const un = c.unread || { channel: 0, chat: 0 };
  const tabs = [['channel', '', 'Канал', un.channel], ['chat', '/chat', 'Чат', un.chat]];
  main.querySelector('.pane').innerHTML = `
    <header class="pane-h"><a class="ib only-m" href="#/">${svg('back')}</a>${clubIco(c)}
      <div class="pane-t"><b>${esc(tv(c.name))}</b><small>${esc(t('участников: {n}', { n: c.members }))} · ${t(tab === 'chat' ? 'чат участников' : 'канал')}</small></div>
      <button class="ib" id="clInfo" title="${t('О клубе')}">${svg('info')}</button></header>
    <nav class="tabs">${tabs.map(([k, suf, l, n]) => `<a href="#/c/${c.id}${suf}" class="tab ${tab === k ? 'on' : ''}">${t(l)}${n && tab !== k ? `<em class="pill">${n}</em>` : ''}</a>`).join('')}</nav>
    <div class="pinned" id="pinned" hidden></div>
    <div class="pane-b chat wall" id="chatBody"><div class="col" id="chatList"><div class="skel big"></div></div></div>
    ${tab === 'chat' || teacher() ? composerHTML({ placeholder: t(tab === 'chat' ? 'Сообщение участникам…' : 'Публикация в канале…'), extra: tab === 'channel' ? `<button class="ib" id="evNew" title="${t('Мероприятие')}">${svg('calendar')}</button>` : '' })
      : `<footer class="ch-foot"><span>${svg('megaphone')}${t('В канале публикуют только главы клуба')}</span><a class="btn sm" href="#/c/${c.id}/chat">${svg('chat')}${t('Обсудить в чате')}</a></footer>`}`;
  document.getElementById('clInfo').onclick = () => clubInfoDlg(c);
  if (main.querySelector('.composer')) {
    V.send = tab === 'chat' ? (text) => api('/clubs/chat/send', { method: 'POST', body: { id: c.id, text } }) : (text) => api('/clubs/post', { method: 'POST', body: { id: c.id, text } });
    bindComposer();
    const ev = document.getElementById('evNew'); if (ev) ev.onclick = () => clubEventDlg(c);
  }
  V.reload = () => loadClub(c, tab, false);
  await loadClub(c, tab, true);
  if (V.data) T.open = setInterval(() => loadClub(c, tab, false), POLL_OPEN_MS);
}
async function loadClub(c, tab, first) {
  let d;
  try { d = await api(`/clubs/${tab === 'chat' ? 'chat' : 'feed'}?id=${encodeURIComponent(c.id)}`); }
  catch (e) { if (first) noAccess(e); return; }
  const body = document.getElementById('chatBody'), list = document.getElementById('chatList');
  if (!list) return;
  const sig = JSON.stringify(d);
  if (sig === V.sig) return;
  const firstLoad = !V.data;
  V.data = d; V.sig = sig;
  if (firstLoad) setTimeout(refreshList, 200); // непрочитанное обнулилось
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
  if (tab === 'chat') paintClubChat(d, list); else paintChannel(d, list);
  if (firstLoad || atBottom) body.scrollTop = body.scrollHeight;
}
/* Канал — как канал в Telegram: публикации глав клуба и мероприятия с записью; сверху закреплено ближайшее */
function paintChannel(d, list) {
  const next = d.upcoming.find((e) => !e.weekly) || d.upcoming[0];
  const pin = document.getElementById('pinned');
  pin.hidden = !next;
  if (next) pin.innerHTML = `${svg('pin')}<span><b>${t('Ближайшее мероприятие')}</b><small>${esc(tv(next.title))} · ${esc(fmtDay(next.date, true))}, ${esc(next.time)}${next.place ? ' · ' + esc(tv(next.place)) : ''}</small></span>${next.going ? `<em class="going">${t('Вы записаны')}</em>` : ''}`;
  let lastDay = '';
  list.innerHTML = d.posts.length ? d.posts.map((x) => {
    const day = isoOf(x.at);
    const sep = day !== lastDay ? `<div class="day"><span>${esc(day === todayIso() ? t('Сегодня') : fmtDay(day, true))}</span></div>` : '';
    lastDay = day;
    return `${sep}<article class="cpost ${x.type === 'event' ? 'is-ev' : ''}">
      <div class="cp-h">${clubIco(d, 'sm')}<b>${esc(tv(d.name))}</b><small>${x.by.id ? esc(x.by.fio) : ''}</small>
        ${x.mine && x.type === 'post' ? `<button class="ib sm del" data-del="${esc(x.id)}" title="${t('Удалить')}">${svg('trash')}</button>` : ''}</div>
      ${x.type === 'event' ? eventCard(x) : `<p class="txt">${md(x.text)}</p>`}
      <span class="meta">${esc(timeOf(x.at))}</span>
    </article>`;
  }).join('') : `<div class="empty chip-empty">${svg('megaphone')}<span>${t(d.manage ? 'Напишите первую публикацию — её увидят все участники клуба.' : 'В канале пока нет публикаций.')}</span></div>`;
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить публикацию?'), t('Публикация исчезнет у всех участников.'), () => act('/clubs/post/delete', { id: b.dataset.del }))));
  list.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => act('/clubs/event/register', { id: b.dataset.go, on: !!b.dataset.v }, b.dataset.v ? t('Вы записаны на мероприятие') : t('Запись отменена'))));
  list.querySelectorAll('[data-evdel]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить мероприятие?'), t('Мероприятие исчезнет у всех участников.'), () => act('/clubs/event/delete', { id: b.dataset.evdel }, t('Мероприятие удалено')))));
}
function eventCard(e) {
  const full = e.limit && e.count >= e.limit && !e.going;
  const seats = e.limit ? t('мест: {n} из {m}', { n: e.count, m: e.limit }) : t('записались: {n}', { n: e.count });
  return `<div class="ev-card ${e.going ? 'going' : ''} ${e.past ? 'past' : ''}">
    <div class="ev-d"><b>${esc(e.date.slice(8))}</b><small>${esc(fmtDay(e.date).replace(/^\d+\s*/, '').slice(0, 3))}</small></div>
    <div class="ev-b">
      <span class="kicker">${svg('calendar')}${t(e.past ? 'Мероприятие прошло' : 'Мероприятие')}</span>
      <b>${esc(tv(e.title))}</b>
      ${e.text ? `<p class="txt">${md(tv(e.text))}</p>` : ''}
      <small>${esc(fmtDay(e.date, true))}, ${esc(e.time)}${e.endTime ? '–' + esc(e.endTime) : ''}${e.place ? ' · ' + esc(tv(e.place)) : ''}</small>
      <small>${esc(seats)}${e.hours ? ' · ' + esc(t('засчитывается: {h}', { h: t('{n} ч', { n: e.hours }) })) : ''}</small>
      ${e.past ? '' : `<div class="ev-btns">${teacher() ? '' : `<button class="btn ${e.going ? '' : 'pri'} sm" data-go="${esc(e.id)}" data-v="${e.going ? '' : '1'}" ${full ? 'disabled' : ''}>${e.going ? t('Отменить запись') : full ? t('Мест нет') : t('Записаться')}</button>`}
        ${e.mine ? `<button class="btn danger sm" data-evdel="${esc(e.id)}">${t('Удалить')}</button>` : ''}</div>`}
    </div></div>`;
}
function paintClubChat(d, list) {
  const people = Object.fromEntries(d.people.map((p) => [p.id, p]));
  list.innerHTML = d.items.length ? msgsHTML(d.items, { group: true, people })
    : `<div class="empty chip-empty">${svg('users')}<span>${t('Здесь участники клуба обмениваются новостями. Напишите первым!')}</span></div>`;
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirmDlg(t('Удалить сообщение?'), t('Сообщение исчезнет у всех участников.'), () => act('/clubs/chat/delete', { id: b.dataset.del }))));
}
function clubInfoDlg(c) {
  modal(tv(c.name), `<div class="about in-dlg">${clubIco(c, 'xl')}<p>${esc(tv(c.desc))}</p>
      <div class="facts"><span>${svg('users')}${esc(t('участников: {n}', { n: c.members }))}</span>${c.meet ? `<span>${svg('clock')}${esc(meetText(c.meet))}</span>` : ''}${c.since ? `<span>${svg('flag')}${esc(t('Вы в клубе с {d}', { d: fmtDay(isoOf(c.since)) }))}</span>` : ''}</div>
      <p class="hint">${t(teacher() ? 'Заявки на вступление и отметки присутствия — в KU Portal, раздел «Клубы».' : 'Участие в клубе и профиль активности — в KU Portal, раздел «Клубы».')}</p></div>
    <a class="btn wide" href="${esc(backUrl().split('#')[0] + '#/clubs')}">${svg('home')}${t('Открыть «Клубы» в KU Portal')}</a>`);
}
function clubEventDlg(c) {
  const iso = isoOf(Date.now() + 864e5 * 3);
  modal(t('Новое мероприятие'), `
    <input class="inp" id="neTitle" maxlength="120" placeholder="${t('Название, например: Товарищеский матч')}">
    <textarea class="inp" id="neText" rows="3" maxlength="1000" placeholder="${t('Подробности: что взять, во сколько сбор (необязательно)')}"></textarea>
    <label class="lbl">${t('Дата и время')}</label>
    <input class="inp" id="neDate" type="date" min="${todayIso()}" value="${iso}">
    <div class="row2"><input class="inp" id="neTime" type="time" value="16:00" aria-label="${t('Начало')}"><input class="inp" id="neEnd" type="time" value="18:00" aria-label="${t('Окончание')}"></div>
    <input class="inp" id="nePlace" maxlength="120" placeholder="${t('Место')}">
    <div class="row2"><input class="inp" id="neLimit" type="number" min="0" max="1000" placeholder="${t('Мест (0 — без ограничения)')}"><input class="inp" id="neHours" type="number" min="0" max="24" step="0.5" placeholder="${t('Часов в зачёт')}"></div>
    <button class="btn pri wide" id="neGo">${t('Опубликовать в канале')}</button>`, (box, close) => {
    box.querySelector('#neGo').onclick = async () => {
      const g = (s) => box.querySelector(s).value;
      const done = await act('/clubs/event', { clubId: c.id, title: g('#neTitle'), text: g('#neText'), date: g('#neDate'), time: g('#neTime'), endTime: g('#neEnd'), place: g('#nePlace'), limit: g('#neLimit'), hours: g('#neHours') }, t('Мероприятие опубликовано'));
      if (done) close();
    };
  });
}

/* ============================ Быстрые ответы (шаблоны меняются в настройках — settings.js) ============================ */
const QUICK_DEFAULT = ['Добрый день! Посмотрю и отвечу сегодня до конца дня.', 'Материалы уже на странице предмета — вкладка «Лекции».', 'Приходите на консультацию — время указано в моём профиле.'];
const quickKey = () => 'kum_quick:' + M.user.id;
function getQuick() { try { const v = JSON.parse(localStorage.getItem(quickKey()) || 'null'); return Array.isArray(v) && v.length ? v : QUICK_DEFAULT.map((x) => t(x)); } catch { return QUICK_DEFAULT.map((x) => t(x)); } }
