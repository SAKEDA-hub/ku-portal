'use strict';
/* KU Portal — мессенджер университета (сервер: portal-features.js, /api/chat/*, /api/files). Пункт «Сообщения» в верхнем меню.
 *
 * #/chats        — лента: каналы предметов и личные чаты с преподавателями, по последней активности;
 *                  ниже — с кем ещё можно начать переписку.
 * #/chat/s:…     — канал предмета (только чтение для студента): вкладки «Материалы» (лекции, практики) и «Задания».
 *                  Преподаватель предмета публикует материалы и задания на дату, с файлами, и удаляет их.
 * #/chat/d:…     — личная переписка студента с преподавателем, с файлами. Студенты между собой не пишут.
 * Всё хранится на сервере и не очищается. Открытый чат обновляется раз в 4 секунды.
 * Подключается перед app.js; хелперы app.js (api, svg, esc, t, toast, modal, …) используются только во время вызова.
 */
const CHAT_POLL_MS = 4000;
const FILE_LIMIT = 10 * 1024 * 1024;
const FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.odt,.odp,.ods,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.7z';
const MATERIAL_KIND = { lecture: ['Лекция', 'book'], practice: ['Практика', 'clipboard'], other: ['Материал', 'clip'] };
const CHAT = { unread: 0 };

/* ---------- файлы ---------- */
function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' ' + t('МБ') : Math.max(1, Math.round(n / 1024)) + ' ' + t('КБ'); }
function pickFile() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = FILE_ACCEPT;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
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
async function downloadFile(f) {
  try {
    const r = await fetch(API_BASE + '/api/files/' + f.id, { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok) throw new Error(t('Файл не найден'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob()); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { toast(e.message, true); }
}
function fileChip(f) {
  return `<button class="mc-file" type="button" data-file="${esc(f.id)}" data-name="${esc(f.name)}">${svg('clip')}<span>${esc(f.name)}</span><small>${fmtSize(f.size)}</small></button>`;
}
function bindFiles(root) {
  root.querySelectorAll('[data-file]').forEach((b) => (b.onclick = () => downloadFile({ id: b.dataset.file, name: b.dataset.name })));
}
/* Кнопка «Прикрепить» в формах: загружает файл и показывает его имя; get() — загруженный файл */
function filePicker(btn, label) {
  let file = null;
  btn.onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { label.textContent = t('загрузка…'); file = await uploadFile(f); label.textContent = file.name; }
    catch (e) { file = null; label.textContent = t('Прикрепить'); toast(e.message, true); }
  };
  return { get: () => file };
}
const initials = (fio) => esc(String(fio || '?').trim().charAt(0).toUpperCase());
const timeOf = (ts) => new Date(ts).toLocaleTimeString({ en: 'en-GB', kk: 'kk-KZ' }[getLang()] || 'ru-RU', { hour: '2-digit', minute: '2-digit' });
const isoOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const todayIso = () => isoOf(Date.now());
function onlineText(x) { return x.online ? t('в сети') : t('не в сети'); }

/* ---------- непрочитанные: значок у «Сообщения» в меню ---------- */
const unreadOf = (d) => d.channels.concat(d.contacts).reduce((a, c) => a + (c.unread || 0), 0);
async function pollChatUnread() {
  if (!S.user) return;
  try { CHAT.unread = unreadOf(await api('/chat/list')); paintChatBadge(); } catch { }
}
function paintChatBadge() {
  document.querySelectorAll('[data-nav="chats"]').forEach((a) => {
    const old = a.querySelector('.nav-n'); if (old) old.remove();
    if (CHAT.unread) a.querySelector('.ic').insertAdjacentHTML('beforeend', `<span class="nav-n">${CHAT.unread > 9 ? '9+' : CHAT.unread}</span>`);
  });
}

/* ============================ Лента чатов ============================ */
async function viewChats() {
  stopPoll();
  app.innerHTML = `${miniHead('Сообщения')}<div id="pagebody" class="mlist"><div class="load">${t('Загрузка…')}</div></div>${navHTML('chats')}`;
  const paint = async () => {
    const pb = document.getElementById('pagebody');
    try {
      const d = await api('/chat/list');
      if (!pb.isConnected) return;
      CHAT.unread = unreadOf(d);
      pb.innerHTML = chatListHTML(d);
      pb.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { location.hash = '#/chat/' + encodeURIComponent(b.dataset.ch); }));
      paintChatBadge();
    } catch (e) { pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; }
  };
  await paint();
  window.__poll = setInterval(paint, CHAT_POLL_MS * 3);
}
function feedPreview(c) {
  if (!c.last) return `<i>${t(c.kind === 'subject' ? 'Материалов пока нет' : 'Сообщений пока нет')}</i>`;
  if (c.kind === 'subject') return `<b class="ml-k">${t(c.last.kind === 'task' ? 'Задание' : (MATERIAL_KIND[c.last.kind] || MATERIAL_KIND.other)[0])}:</b> ${esc(c.last.text)}`;
  return `${c.last.from === S.user.id ? t('Вы: ') : ''}${esc(c.last.text)}`;
}
function feedItem(c) {
  const channel = c.kind === 'subject';
  const sub = channel
    ? `${t('Канал')} · ${S.user.role === 'teacher' ? esc(t('Группа {g}', { g: c.group })) : esc(c.teacher)}${c.tasksDue ? ` · <em>${t('заданий: {n}', { n: c.tasksDue })}</em>` : ''}`
    : `${c.role === 'teacher' ? t('Преподаватель') : esc(c.group)} · ${onlineText(c)}`;
  return `<button class="card ml-it" data-ch="${esc(channel ? c.id : c.ch)}">
    ${channel ? `<span class="ml-ava ch">${svg('book')}</span>` : `<span class="ml-ava">${initials(c.fio)}${c.online ? '<i class="ml-on"></i>' : ''}</span>`}
    <div class="ml-t"><b>${esc(channel ? tv(c.title) : c.fio)}</b><span class="tx">${sub}</span><span class="ml-p">${feedPreview(c)}</span></div>
    <div class="ml-r">${c.last ? `<small>${esc(fmtWhen(c.last.at))}</small>` : ''}${c.unread ? `<span class="ml-n">${c.unread}</span>` : ''}</div>
  </button>`;
}
function chatListHTML(d) {
  const teacher = S.user.role === 'teacher';
  const channels = d.channels.map((c) => Object.assign({ kind: 'subject' }, c));
  const talks = d.contacts.filter((c) => c.last).map((c) => Object.assign({ kind: 'dm' }, c));
  const feed = channels.concat(talks).sort((a, b) => ((b.last && b.last.at) || 0) - ((a.last && a.last.at) || 0));
  const fresh = d.contacts.filter((c) => !c.last).map((c) => Object.assign({ kind: 'dm' }, c));
  const empty = teacher
    ? t('Каналы появятся, когда вы добавите занятия группам в расписание.')
    : t('Каналы появятся, когда преподаватель добавит занятия вашей группе в расписание.');
  return `${feed.map(feedItem).join('') || `<div class="card next-empty">${empty}</div>`}
    ${fresh.length ? `<div class="section-label">${teacher ? t('Написать студенту') : t('Написать преподавателю')}</div>${fresh.map(feedItem).join('')}` : ''}`;
}

/* ============================ Чат: общий каркас ============================ */
const MC = { ch: '', tab: 'materials', data: null, sig: '', file: null, sending: false };
function chatShell(withBar) {
  return `<div class="chatpage mchat">
    <div class="chathead">
      <a class="chat-act" href="#/chats" title="${t('Назад')}">${svg('back')}<span>${t('Назад')}</span></a>
      <span class="ml-ava" id="mcAva"></span>
      <div class="chathead-t"><b id="mcTitle">${t('Загрузка…')}</b><div class="st"><span class="dot" id="mcDot" hidden></span><span id="mcSub"></span></div></div>
    </div>
    <div id="mcTabs"></div>
    <div class="chatbody" id="mcBody"><div class="chatwrap" id="mcList"></div></div>
    ${withBar ? `<div class="chatbar" id="mcBar">
      <button class="mc-attach" id="mcAttach" type="button" title="${t('Прикрепить файл')}">${svg('clip')}</button>
      <div class="mc-in"><div class="mc-pend" id="mcPend" hidden></div><input class="inp" id="mcInp" placeholder="${t('Сообщение…')}" autocomplete="off" maxlength="2000"></div>
      <button class="sendbtn" id="mcSend" type="button" title="${t('Отправить')}">${svg('send')}<span>${t('Отправить')}</span></button>
    </div>` : ''}
  </div>`;
}
async function viewChat(ch) {
  stopPoll();
  Object.assign(MC, { ch, tab: 'materials', data: null, sig: '', file: null, sending: false });
  const dm = ch.startsWith('d:');
  app.innerHTML = chatShell(dm);
  if (dm) bindChatBar();
  await loadChat(true);
  if (!MC.data) return;
  window.__poll = setInterval(() => loadChat(false), CHAT_POLL_MS);
}
async function loadChat(first) {
  let d;
  try { d = await api('/chat/messages?ch=' + encodeURIComponent(MC.ch)); }
  catch (e) {
    const l = document.getElementById('mcList');
    if (first && l) { l.innerHTML = `<div class="load">${esc(e.message)}</div>`; document.getElementById('mcTitle').textContent = t('Чат недоступен'); const bar = document.getElementById('mcBar'); if (bar) bar.hidden = true; }
    return;
  }
  if (!document.getElementById('mcList')) return;
  const sig = JSON.stringify(d.kind === 'dm' ? [d.items.map((m) => m.id), d.other.online] : [d.materials.map((m) => m.id), d.tasks]);
  MC.data = d;
  if (sig === MC.sig) return;
  MC.sig = sig;
  if (d.kind === 'dm') paintDM(first); else paintChannel();
}
async function chatAct(path, body, okText) {
  try { await api(path, { method: 'POST', body }); if (okText) toast(okText); MC.sig = ''; await loadChat(false); }
  catch (e) { toast(e.message, true); }
}
function confirmDelete(title, text, run) {
  modal(title, `<div class="tx">${text}</div><button class="btn danger-ghost" id="mdDel">${t('Удалить')}</button>`, (box, close) => {
    box.querySelector('#mdDel').onclick = () => { close(); run(); };
  });
}

/* ============================ Личная переписка ============================ */
function bindChatBar() {
  const inp = document.getElementById('mcInp');
  inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };
  document.getElementById('mcSend').onclick = sendMsg;
  document.getElementById('mcAttach').onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { setPending({ uploading: true, name: f.name }); setPending(await uploadFile(f)); }
    catch (e) { setPending(null); toast(e.message, true); }
  };
  if (matchMedia('(min-width: 1024px)').matches) inp.focus();
}
function setPending(f) {
  MC.file = f && !f.uploading ? f : null;
  const box = document.getElementById('mcPend'); if (!box) return;
  box.hidden = !f;
  box.innerHTML = f ? `${svg('clip')}<span>${esc(f.name)}</span>${f.uploading ? `<small>${t('загрузка…')}</small>` : `<small>${fmtSize(f.size)}</small><button type="button" id="mcUnpend" title="${t('Убрать')}">${svg('x')}</button>`}` : '';
  const x = document.getElementById('mcUnpend'); if (x) x.onclick = () => setPending(null);
}
function paintDM(first) {
  const d = MC.data, o = d.other;
  const ava = document.getElementById('mcAva'), dot = document.getElementById('mcDot');
  ava.className = 'ml-ava'; ava.innerHTML = initials(o.fio);
  document.getElementById('mcTitle').textContent = o.fio;
  document.getElementById('mcSub').textContent = (o.role === 'teacher' ? t('Преподаватель') : o.group) + ' · ' + onlineText(o);
  dot.hidden = false; dot.classList.toggle('on', o.online);
  const body = document.getElementById('mcBody'), list = document.getElementById('mcList');
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  let lastDay = '';
  list.innerHTML = d.items.length ? d.items.map((m) => {
    const day = isoOf(m.at), mine = m.from === S.user.id;
    const sep = day !== lastDay ? `<div class="mc-day">${esc(day === todayIso() ? t('Сегодня') : fmtDay(day, true))}</div>` : '';
    lastDay = day;
    return `${sep}<div class="mc-msg ${mine ? 'me' : ''}">
      <div class="msg ${mine ? 'user' : 'bot'}">${m.text ? esc(m.text) : ''}${m.file ? fileChip(m.file) : ''}</div>
      <div class="mc-meta">${esc(timeOf(m.at))}${mine ? `<span class="mc-tools"><button type="button" data-del="${esc(m.id)}" title="${t('Удалить')}">${svg('trash')}</button></span>` : ''}</div>
    </div>`;
  }).join('') : `<div class="next-empty mc-empty">${S.user.role === 'student' ? t('Напишите преподавателю — вопрос увидит только он.') : t('Напишите первое сообщение.')}</div>`;
  bindFiles(list);
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirmDelete(t('Удалить сообщение?'), t('Сообщение исчезнет у обоих участников.'), () => chatAct('/chat/delete', { id: b.dataset.del }, t('Сообщение удалено')))));
  if (first || atBottom) body.scrollTop = body.scrollHeight;
}
async function sendMsg() {
  const inp = document.getElementById('mcInp');
  const text = inp.value.trim();
  if ((!text && !MC.file) || MC.sending) return;
  MC.sending = true;
  try {
    await api('/chat/send', { method: 'POST', body: { ch: MC.ch, text, fileId: MC.file ? MC.file.id : '' } });
    inp.value = ''; setPending(null);
    MC.sig = ''; await loadChat(false);
    const b = document.getElementById('mcBody'); b.scrollTop = b.scrollHeight;
  } catch (e) { toast(e.message, true); }
  MC.sending = false;
}

/* ============================ Канал предмета ============================ */
function paintChannel() {
  const d = MC.data;
  const ava = document.getElementById('mcAva');
  ava.className = 'ml-ava ch'; ava.innerHTML = svg('book');
  document.getElementById('mcTitle').textContent = tv(d.title);
  document.getElementById('mcSub').textContent = d.manage ? t('Группа {g} · студентов: {n}', { g: d.group, n: d.members }) : t('Канал · {t}', { t: d.teacher });
  const tabs = document.getElementById('mcTabs');
  if (!tabs.innerHTML) {
    tabs.innerHTML = `<div class="tabs mc-tabs" id="mcTabSw"><button data-tab="materials" class="on">${t('Материалы')}</button><button data-tab="tasks">${t('Задания')}</button></div>`;
    tabs.querySelector('#mcTabSw').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { MC.tab = b.dataset.tab; paintChannel(); } };
  }
  tabs.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === MC.tab));
  const open = d.tasks.filter((x) => x.due >= todayIso() && !x.done).length;
  tabs.querySelector('[data-tab="tasks"]').innerHTML = t('Задания') + (open && !d.manage ? ` <span class="ml-n">${open}</span>` : '');
  const list = document.getElementById('mcList');
  const keep = keepForm(list);
  list.innerHTML = `<div class="mc-tasks-in">${MC.tab === 'tasks' ? tasksHTML(d) : materialsHTML(d)}</div>`;
  restoreForm(list, keep);
  bindFiles(list);
  bindChannel(list, d);
}
/* Поля формы не должны стираться, когда лента обновляется в фоне */
function keepForm(root) {
  const vals = {};
  root.querySelectorAll('.mc-newtask .inp').forEach((el) => { if (el.id) vals[el.id] = el.value; });
  return vals;
}
function restoreForm(root, vals) { Object.entries(vals).forEach(([id, v]) => { const el = root.querySelector('#' + id); if (el && v) el.value = v; }); }
function materialsHTML(d) {
  const form = d.manage ? `<div class="card mc-newtask">
    <b>${t('Опубликовать материал')}</b>
    <div class="chips svc-wrap" id="mtKind">${Object.entries(MATERIAL_KIND).map(([k, v], i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-v="${k}">${t(v[0])}</button>`).join('')}</div>
    <input class="inp" id="mtTitle" maxlength="160" placeholder="${t('Тема, например: Лекция 5. Present Perfect')}">
    <textarea class="inp" id="mtText" rows="3" maxlength="2000" placeholder="${t('Описание или ссылка (необязательно)')}"></textarea>
    <button class="btn ghost" id="mtFile" type="button">${svg('clip')}<span id="mtFileN">${t('Прикрепить')}</span></button>
    <button class="btn pri" id="mtAdd">${t('Опубликовать')}</button>
  </div>` : '';
  const items = d.materials.map((m) => {
    const k = MATERIAL_KIND[m.kind] || MATERIAL_KIND.other;
    return `<div class="card mc-mat">
      <div class="svc-row"><span class="badge mat-${esc(m.kind)}">${svg(k[1])}${t(k[0])}</span><small class="tx">${esc(fmtWhen(m.at))}</small></div>
      <b>${esc(m.title)}</b>
      ${m.text ? `<div class="mc-task-t">${esc(m.text)}</div>` : ''}
      ${m.file ? fileChip(m.file) : ''}
      <div class="mc-task-f"><span class="tx">${esc(m.teacher)}</span>${d.manage ? `<button class="btn danger-ghost sm" data-mdel="${esc(m.id)}">${t('Удалить')}</button>` : ''}</div>
    </div>`;
  }).join('');
  return form + (items || `<div class="card next-empty">${t('Преподаватель ещё не публиковал материалы.')}</div>`);
}
function taskHTML(x, d, today) {
  const badge = x.done ? `<span class="badge ok">${t('Сделано')}</span>`
    : x.due < today ? `<span class="badge bad">${t('Срок прошёл')}</span>`
    : x.due === today ? `<span class="badge warn">${t('Сегодня')}</span>` : `<span class="badge">${esc(t('до {d}', { d: fmtDay(x.due) }))}</span>`;
  return `<div class="card mc-task ${x.done ? 'done' : ''}">
    <div class="svc-row"><b>${esc(x.title)}</b>${d.manage ? `<span class="badge">${esc(fmtDay(x.due, true))}</span>` : badge}</div>
    ${x.text ? `<div class="mc-task-t">${esc(x.text)}</div>` : ''}
    ${x.file ? fileChip(x.file) : ''}
    <div class="mc-task-f">${d.manage
      ? `<span class="tx">${esc(t('Отметили «сделано»: {n} из {m}', { n: x.doneCount, m: d.members }))}</span><button class="btn danger-ghost sm" data-tdel="${esc(x.id)}">${t('Удалить')}</button>`
      : `<span class="tx">${esc(t('Срок: {d}', { d: fmtDay(x.due, true) }))}</span><button class="btn ${x.done ? 'ghost' : 'pri'} sm" data-tdone="${esc(x.id)}" data-v="${x.done ? '' : '1'}">${x.done ? t('Вернуть в работу') : t('Отметить «сделано»')}</button>`}
    </div></div>`;
}
function tasksHTML(d) {
  const today = todayIso();
  const form = d.manage ? `<div class="card mc-newtask">
    <b>${t('Новое задание')}</b>
    <input class="inp" id="tkTitle" maxlength="160" placeholder="${t('Название, например: Эссе по теме 5')}">
    <textarea class="inp" id="tkText" rows="3" maxlength="2000" placeholder="${t('Что нужно сделать (необязательно)')}"></textarea>
    <div class="row2"><div><label class="lbl">${t('Сдать до')}</label><input class="inp" id="tkDue" type="date" min="${today}" value="${today}"></div>
      <div><label class="lbl">${t('Файл')}</label><button class="btn ghost" id="tkFile" type="button">${svg('clip')}<span id="tkFileN">${t('Прикрепить')}</span></button></div></div>
    <button class="btn pri" id="tkAdd">${t('Опубликовать задание')}</button>
  </div>` : '';
  return form + (d.tasks.map((x) => taskHTML(x, d, today)).join('') || `<div class="card next-empty">${t('Заданий пока нет.')}</div>`);
}
function bindChannel(root, d) {
  root.querySelectorAll('[data-tdone]').forEach((b) => (b.onclick = () => chatAct('/chat/task/done', { id: b.dataset.tdone, done: !!b.dataset.v }, b.dataset.v ? t('Отмечено как сделанное') : '')));
  root.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = () => confirmDelete(t('Удалить задание?'), t('Задание исчезнет у всех студентов группы.'), () => chatAct('/chat/task/delete', { id: b.dataset.tdel }, t('Задание удалено')))));
  root.querySelectorAll('[data-mdel]').forEach((b) => (b.onclick = () => confirmDelete(t('Удалить материал?'), t('Материал исчезнет у всех студентов группы.'), () => chatAct('/chat/material/delete', { id: b.dataset.mdel }, t('Материал удалён')))));
  if (!d.manage) return;
  const kind = root.querySelector('#mtKind');
  if (kind) kind.onclick = (e) => { const b = e.target.closest('.chip'); if (b) kind.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); };
  const val = (id) => (root.querySelector('#' + id) || {}).value || '';
  const clear = (...ids) => ids.forEach((id) => { const el = root.querySelector('#' + id); if (el) el.value = ''; });
  if (MC.tab === 'materials') {
    const fp = filePicker(root.querySelector('#mtFile'), root.querySelector('#mtFileN'));
    root.querySelector('#mtAdd').onclick = async () => {
      const k = root.querySelector('#mtKind .chip.on');
      try {
        await api('/chat/material', { method: 'POST', body: { ch: MC.ch, kind: k ? k.dataset.v : 'other', title: val('mtTitle'), text: val('mtText'), fileId: fp.get() ? fp.get().id : '' } });
        clear('mtTitle', 'mtText'); toast(t('Материал опубликован — студенты получат уведомление'));
        MC.sig = ''; await loadChat(false);
      } catch (e) { toast(e.message, true); }
    };
  } else {
    const fp = filePicker(root.querySelector('#tkFile'), root.querySelector('#tkFileN'));
    root.querySelector('#tkAdd').onclick = async () => {
      try {
        await api('/chat/task', { method: 'POST', body: { ch: MC.ch, title: val('tkTitle'), text: val('tkText'), due: val('tkDue'), fileId: fp.get() ? fp.get().id : '' } });
        clear('tkTitle', 'tkText'); toast(t('Задание опубликовано — студенты получат уведомление'));
        MC.sig = ''; await loadChat(false);
      } catch (e) { toast(e.message, true); }
    };
  }
}
