'use strict';
/* KU Portal — мессенджер университета (сервер: portal-features.js, /api/chat/*, /api/files).
 *
 * #/chats        — список: каналы предметов (из расписания группы) и личные сообщения с преподавателями / студентами;
 * #/chat/<канал> — переписка. В канале предмета две вкладки: «Чат» и «Задания».
 * Студент: пишет, прикрепляет файлы, отмечает задания выполненными.
 * Преподаватель дополнительно: публикует задания на дату (с файлом), закрепляет и удаляет сообщения, видит, сколько студентов выполнили.
 * Переписка хранится на сервере и не очищается. Новые сообщения подтягиваются раз в 4 секунды, пока чат открыт.
 * Подключается перед app.js; хелперы app.js (api, svg, esc, t, toast, modal, …) используются только во время вызова.
 */
const CHAT_POLL_MS = 4000;
const FILE_LIMIT = 10 * 1024 * 1024;
const FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.odt,.odp,.ods,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.7z';
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
const initials = (fio) => esc(String(fio || '?').trim().charAt(0).toUpperCase());
const timeOf = (ts) => new Date(ts).toLocaleTimeString({ en: 'en-GB', kk: 'kk-KZ' }[getLang()] || 'ru-RU', { hour: '2-digit', minute: '2-digit' });
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const isoOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function onlineText(x) { return x.online ? t('в сети') : t('не в сети'); }

/* ---------- непрочитанные: значок у «Сообщения» в меню ---------- */
async function pollChatUnread() {
  if (!S.user) return;
  try {
    const d = await api('/chat/list');
    CHAT.unread = d.channels.concat(d.contacts).reduce((a, c) => a + (c.unread || 0), 0);
    paintChatBadge();
  } catch { }
}
function paintChatBadge() {
  document.querySelectorAll('[data-nav="chats"]').forEach((a) => {
    const old = a.querySelector('.nav-n'); if (old) old.remove();
    if (CHAT.unread) a.querySelector('.ic').insertAdjacentHTML('beforeend', `<span class="nav-n">${CHAT.unread > 9 ? '9+' : CHAT.unread}</span>`);
  });
}

/* ============================ Список чатов ============================ */
async function viewChats() {
  stopPoll();
  app.innerHTML = `${miniHead('Сообщения')}<div id="pagebody" class="mlist"><div class="load">${t('Загрузка…')}</div></div>${navHTML('chats')}`;
  const paint = async () => {
    const pb = document.getElementById('pagebody');
    try {
      const d = await api('/chat/list');
      if (!pb.isConnected) return;
      CHAT.unread = d.channels.concat(d.contacts).reduce((a, c) => a + (c.unread || 0), 0);
      pb.innerHTML = chatListHTML(d);
      pb.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { location.hash = '#/chat/' + encodeURIComponent(b.dataset.ch); }));
      paintChatBadge();
    } catch (e) { pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; }
  };
  await paint();
  window.__poll = setInterval(paint, CHAT_POLL_MS * 3);
}
function chatListHTML(d) {
  const teacher = S.user.role === 'teacher';
  const preview = (c) => c.last ? `${c.last.from === S.user.id ? t('Вы: ') : ''}${esc(c.last.text)}` : `<i>${t('Сообщений пока нет')}</i>`;
  const right = (c) => `<div class="ml-r">${c.last ? `<small>${esc(fmtWhen(c.last.at))}</small>` : ''}${c.unread ? `<span class="ml-n">${c.unread}</span>` : ''}</div>`;
  const channels = d.channels.map((c) => `
    <button class="card ml-it" data-ch="${esc(c.id)}">
      <span class="ml-ava ch">${svg('book')}</span>
      <div class="ml-t"><b>${esc(tv(c.title))}</b>
        <span class="tx">${teacher ? esc(t('Группа {g}', { g: c.group })) : esc(c.teacher)}${c.tasksDue ? ` · <em>${t('заданий: {n}', { n: c.tasksDue })}</em>` : ''}</span>
        <span class="ml-p">${preview(c)}</span></div>${right(c)}
    </button>`).join('');
  const contacts = d.contacts.map((c) => `
    <button class="card ml-it" data-ch="${esc(c.ch)}">
      <span class="ml-ava">${initials(c.fio)}${c.online ? '<i class="ml-on"></i>' : ''}</span>
      <div class="ml-t"><b>${esc(c.fio)}</b>
        <span class="tx">${c.role === 'teacher' ? t('Преподаватель') : esc(c.group)} · ${onlineText(c)}</span>
        <span class="ml-p">${preview(c)}</span></div>${right(c)}
    </button>`).join('');
  const empty = teacher
    ? t('Каналы появятся, когда вы добавите занятия группам в расписание.')
    : t('Каналы появятся, когда преподаватель добавит занятия вашей группе в расписание.');
  return `
    <div class="section-label">${t('Каналы предметов')}</div>
    ${channels || `<div class="card next-empty">${empty}</div>`}
    <div class="section-label">${teacher ? t('Студенты') : t('Преподаватели')}</div>
    ${contacts || `<div class="card next-empty">${t('Пока некому написать.')}</div>`}`;
}

/* ============================ Переписка ============================ */
const MC = { ch: '', tab: 'chat', data: null, sig: '', file: null, sending: false };
async function viewChat(ch) {
  stopPoll();
  Object.assign(MC, { ch, tab: 'chat', data: null, sig: '', file: null, sending: false });
  app.innerHTML = `
    <div class="chatpage mchat">
      <div class="chathead">
        <a class="chat-act" href="#/chats" title="${t('Назад')}">${svg('back')}<span>${t('Назад')}</span></a>
        <span class="ml-ava" id="mcAva"></span>
        <div class="chathead-t"><b id="mcTitle">${t('Загрузка…')}</b><div class="st"><span class="dot" id="mcDot"></span><span id="mcSub"></span></div></div>
      </div>
      <div id="mcTabs"></div>
      <div class="mc-pinned" id="mcPinned" hidden></div>
      <div class="chatbody" id="mcBody"><div class="chatwrap" id="mcList"></div></div>
      <div class="chatbody mc-tasks" id="mcTasks" hidden></div>
      <div class="chatbar" id="mcBar">
        <button class="mc-attach" id="mcAttach" type="button" title="${t('Прикрепить файл')}">${svg('clip')}</button>
        <div class="mc-in"><div class="mc-pend" id="mcPend" hidden></div><input class="inp" id="mcInp" placeholder="${t('Сообщение…')}" autocomplete="off" maxlength="2000"></div>
        <button class="sendbtn" id="mcSend" type="button" title="${t('Отправить')}">${svg('send')}<span>${t('Отправить')}</span></button>
      </div>
    </div>`;
  const inp = document.getElementById('mcInp');
  inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };
  document.getElementById('mcSend').onclick = sendMsg;
  document.getElementById('mcAttach').onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { setPending({ uploading: true, name: f.name }); setPending(await uploadFile(f)); }
    catch (e) { setPending(null); toast(e.message, true); }
  };
  await loadChat(true);
  if (!MC.data) return;
  window.__poll = setInterval(() => loadChat(false), CHAT_POLL_MS);
  if (matchMedia('(min-width: 1024px)').matches) inp.focus();
}
function setPending(f) {
  MC.file = f && !f.uploading ? f : null;
  const box = document.getElementById('mcPend'); if (!box) return;
  box.hidden = !f;
  box.innerHTML = f ? `${svg('clip')}<span>${esc(f.name)}</span>${f.uploading ? `<small>${t('загрузка…')}</small>` : `<small>${fmtSize(f.size)}</small><button type="button" id="mcUnpend" title="${t('Убрать')}">${svg('x')}</button>`}` : '';
  const x = document.getElementById('mcUnpend'); if (x) x.onclick = () => setPending(null);
}
async function loadChat(first) {
  let d;
  try { d = await api('/chat/messages?ch=' + encodeURIComponent(MC.ch)); }
  catch (e) {
    const l = document.getElementById('mcList');
    if (first && l) { l.innerHTML = `<div class="load">${esc(e.message)}</div>`; document.getElementById('mcTitle').textContent = t('Чат недоступен'); document.getElementById('mcBar').hidden = true; }
    return;
  }
  if (!document.getElementById('mcList')) return;
  const sig = JSON.stringify([d.items.map((m) => m.id + (m.pinned ? 'p' : '')), d.tasks, d.other && d.other.online]);
  const body = document.getElementById('mcBody');
  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  MC.data = d;
  if (sig === MC.sig) return;
  MC.sig = sig;
  paintChatHead();
  paintMessages();
  paintPinned();
  if (d.kind === 'subject') paintTasks();
  if (first || atBottom) body.scrollTop = body.scrollHeight;
}
function paintChatHead() {
  const d = MC.data;
  const ava = document.getElementById('mcAva'), dot = document.getElementById('mcDot');
  if (d.kind === 'subject') {
    ava.className = 'ml-ava ch'; ava.innerHTML = svg('book');
    document.getElementById('mcTitle').textContent = tv(d.title);
    document.getElementById('mcSub').textContent = t('Группа {g} · студентов: {n}', { g: d.group, n: d.members });
    dot.hidden = true;
    const tabs = document.getElementById('mcTabs');
    if (!tabs.innerHTML) {
      tabs.innerHTML = `<div class="tabs mc-tabs" id="mcTabSw"><button data-tab="chat" class="on">${t('Чат')}</button><button data-tab="tasks">${t('Задания')}</button></div>`;
      tabs.querySelector('#mcTabSw').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); };
    }
  } else {
    ava.className = 'ml-ava'; ava.innerHTML = initials(d.other.fio);
    document.getElementById('mcTitle').textContent = d.other.fio;
    document.getElementById('mcSub').textContent = (d.other.role === 'teacher' ? t('Преподаватель') : d.other.group) + ' · ' + onlineText(d.other);
    dot.hidden = false; dot.classList.toggle('on', d.other.online);
  }
}
function paintTabCount() {
  const b = document.querySelector('#mcTabSw [data-tab="tasks"]'); if (!b || !MC.data.tasks) return;
  const open = MC.data.tasks.filter((x) => x.due >= todayIso() && !x.done).length;
  b.innerHTML = t('Задания') + (open && S.user.role === 'student' ? ` <span class="ml-n">${open}</span>` : '');
}
function switchTab(tab) {
  MC.tab = tab;
  document.querySelectorAll('#mcTabSw [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.getElementById('mcBody').hidden = tab !== 'chat';
  document.getElementById('mcPinned').hidden = tab !== 'chat' || !(MC.data.pinned || []).length;
  document.getElementById('mcBar').hidden = tab !== 'chat';
  document.getElementById('mcTasks').hidden = tab !== 'tasks';
  if (tab === 'chat') { const b = document.getElementById('mcBody'); b.scrollTop = b.scrollHeight; }
}
function msgHTML(m, d) {
  const mine = m.from === S.user.id;
  const canDel = mine || d.manage;
  const tools = canDel ? `<span class="mc-tools">
      ${d.manage ? `<button type="button" data-pin="${esc(m.id)}" data-on="${m.pinned ? '' : '1'}" title="${t(m.pinned ? 'Открепить' : 'Закрепить')}">${svg('pin')}</button>` : ''}
      <button type="button" data-del="${esc(m.id)}" title="${t('Удалить')}">${svg('trash')}</button></span>` : '';
  return `<div class="mc-msg ${mine ? 'me' : ''} ${m.pinned ? 'pinned' : ''}">
    ${mine ? '' : `<div class="mc-from">${esc(m.fromFio)}${m.fromRole === 'teacher' ? ` <span class="mc-role">${t('Преподаватель')}</span>` : ''}</div>`}
    <div class="msg ${mine ? 'user' : 'bot'}">${m.text ? esc(m.text) : ''}${m.file ? fileChip(m.file) : ''}</div>
    <div class="mc-meta">${m.pinned ? svg('pin') : ''}${esc(timeOf(m.at))}${tools}</div>
  </div>`;
}
function paintMessages() {
  const d = MC.data, list = document.getElementById('mcList');
  let lastDay = '';
  list.innerHTML = d.items.length ? d.items.map((m) => {
    const day = isoOf(m.at);
    const sep = day !== lastDay ? `<div class="mc-day">${esc(day === todayIso() ? t('Сегодня') : fmtDay(day, true))}</div>` : '';
    lastDay = day;
    return sep + msgHTML(m, d);
  }).join('') : `<div class="next-empty mc-empty">${d.kind === 'subject' ? t('Здесь будет обсуждение предмета. Напишите первое сообщение!') : t('Напишите первое сообщение.')}</div>`;
  bindFiles(list);
  list.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = () => chatAct('/chat/pin', { id: b.dataset.pin, on: !!b.dataset.on }, b.dataset.on ? t('Сообщение закреплено') : t('Сообщение откреплено'))));
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => modal(t('Удалить сообщение?'), `<div class="tx">${t('Сообщение исчезнет у всех участников чата.')}</div><button class="btn danger-ghost" id="mdDel">${t('Удалить')}</button>`, (box, close) => {
    box.querySelector('#mdDel').onclick = () => { close(); chatAct('/chat/delete', { id: b.dataset.del }, t('Сообщение удалено')); };
  })));
}
function paintPinned() {
  const pins = MC.data.pinned || [], box = document.getElementById('mcPinned');
  box.hidden = MC.tab !== 'chat' || !pins.length;
  box.innerHTML = pins.slice(-3).map((m) => `<div class="mc-pin">${svg('pin')}<span><b>${esc(m.fromFio)}:</b> ${esc(m.text || (m.file ? m.file.name : ''))}</span></div>`).join('');
}
async function chatAct(path, body, okText) {
  try { await api(path, { method: 'POST', body }); if (okText) toast(okText); MC.sig = ''; await loadChat(false); }
  catch (e) { toast(e.message, true); }
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

/* ---------- Задания канала ---------- */
function taskHTML(x, d, today) {
  const teacher = d.manage;
  const badge = x.done ? `<span class="badge ok">${t('Сделано')}</span>`
    : x.due < today ? `<span class="badge bad">${t('Срок прошёл')}</span>`
    : x.due === today ? `<span class="badge warn">${t('Сегодня')}</span>` : `<span class="badge">${esc(t('до {d}', { d: fmtDay(x.due) }))}</span>`;
  return `<div class="card mc-task ${x.done ? 'done' : ''}">
    <div class="svc-row"><b>${esc(x.title)}</b>${teacher ? `<span class="badge">${esc(fmtDay(x.due, true))}</span>` : badge}</div>
    ${x.text ? `<div class="mc-task-t">${esc(x.text)}</div>` : ''}
    ${x.file ? fileChip(x.file) : ''}
    <div class="mc-task-f">${teacher
      ? `<span class="tx">${esc(t('Отметили «сделано»: {n} из {m}', { n: x.doneCount, m: d.members }))}</span><button class="btn danger-ghost sm" data-tdel="${esc(x.id)}">${t('Удалить')}</button>`
      : `<span class="tx">${esc(t('Срок: {d}', { d: fmtDay(x.due, true) }))}</span><button class="btn ${x.done ? 'ghost' : 'pri'} sm" data-tdone="${esc(x.id)}" data-v="${x.done ? '' : '1'}">${x.done ? t('Вернуть в работу') : t('Отметить «сделано»')}</button>`}
    </div></div>`;
}
function paintTasks() {
  const d = MC.data, box = document.getElementById('mcTasks'), today = todayIso();
  const form = d.manage ? `<div class="card mc-newtask">
      <b>${t('Новое задание')}</b>
      <input class="inp" id="tkTitle" maxlength="160" placeholder="${t('Название, например: Эссе по теме 5')}">
      <textarea class="inp" id="tkText" rows="3" maxlength="2000" placeholder="${t('Что нужно сделать (необязательно)')}"></textarea>
      <div class="row2"><div><label class="lbl">${t('Сдать до')}</label><input class="inp" id="tkDue" type="date" min="${today}" value="${today}"></div>
        <div><label class="lbl">${t('Файл')}</label><button class="btn ghost" id="tkFile" type="button">${svg('clip')}<span id="tkFileN">${t('Прикрепить')}</span></button></div></div>
      <button class="btn pri" id="tkAdd">${t('Опубликовать задание')}</button>
    </div>` : '';
  const keep = d.manage && box.querySelector('#tkTitle') ? { title: box.querySelector('#tkTitle').value, text: box.querySelector('#tkText').value } : null;
  box.innerHTML = `<div class="mc-tasks-in">${form}${d.tasks.map((x) => taskHTML(x, d, today)).join('') || `<div class="card next-empty">${t('Заданий пока нет.')}</div>`}</div>`;
  if (keep) { box.querySelector('#tkTitle').value = keep.title; box.querySelector('#tkText').value = keep.text; }
  bindFiles(box);
  paintTabCount();
  box.querySelectorAll('[data-tdone]').forEach((b) => (b.onclick = () => chatAct('/chat/task/done', { id: b.dataset.tdone, done: !!b.dataset.v }, b.dataset.v ? t('Отмечено как сделанное') : '')));
  box.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = () => chatAct('/chat/task/delete', { id: b.dataset.tdel }, t('Задание удалено'))));
  if (d.manage) bindTaskForm(box);
}
function bindTaskForm(box) {
  let file = null;
  box.querySelector('#tkFile').onclick = async () => {
    const f = await pickFile(); if (!f) return;
    const n = box.querySelector('#tkFileN');
    try { n.textContent = t('загрузка…'); file = await uploadFile(f); n.textContent = file.name; }
    catch (e) { n.textContent = t('Прикрепить'); toast(e.message, true); }
  };
  box.querySelector('#tkAdd').onclick = async () => {
    try {
      await api('/chat/task', { method: 'POST', body: { ch: MC.ch, title: box.querySelector('#tkTitle').value, text: box.querySelector('#tkText').value, due: box.querySelector('#tkDue').value, fileId: file ? file.id : '' } });
      box.querySelector('#tkTitle').value = ''; box.querySelector('#tkText').value = '';
      toast(t('Задание опубликовано — студенты получат уведомление'));
      MC.sig = ''; await loadChat(false);
    } catch (e) { toast(e.message, true); }
  };
}
