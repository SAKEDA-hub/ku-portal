'use strict';
/* KU Portal → KU Connect (мессенджер университета, отдельный портал под /connect/ на сервере, папка connect/).
 *
 * Пункт меню «Connect» (#/chats) — страница входа, как «Экзамен»: что нового (непрочитанное, дедлайны / кто ждёт ответа),
 * кнопка «Открыть KU Connect» с тем же переходом, что и в онлайн-экзамен.
 * Пользователь не входит заново: портал получает одноразовый код (/api/connect/handoff, 60 с) и передаёт его в адресе
 * после # вместе с оформлением и языком портала (theme, mode, fs, still, lang) и адресом возврата (back).
 * Здесь же — значок непрочитанного у пункта меню и карточка KU Connect на главной.
 * Подключается перед app.js; хелперы app.js используются только во время вызова.
 */
const CHAT = { unread: 0 };
const connectPath = () => (window.KU_API_BASE || '') + '/connect/'; // как API_BASE в app.js (он подключается позже)

/* ---------- значок непрочитанного у пункта меню ---------- */
async function pollChatUnread() {
  if (!S.user) return;
  try { CHAT.unread = (await api('/chat/overview')).unread || 0; paintChatBadge(); } catch { }
}
function paintChatBadge() {
  document.querySelectorAll('[data-nav="chats"]').forEach((a) => {
    const old = a.querySelector('.nav-n'); if (old) old.remove();
    if (CHAT.unread) a.querySelector('.ic').insertAdjacentHTML('beforeend', `<span class="nav-n">${CHAT.unread > 9 ? '9+' : CHAT.unread}</span>`);
  });
}

/* ---------- переход ---------- */
function connectUrl(code) {
  const u = new URL(connectPath(), location.origin);
  const th = resolvedTheme();
  const h = new URLSearchParams({ code, back: location.href.split('#')[0] + '#/chats', lang: getLang(), theme: th.palette, mode: th.mode || 'light', fs: th.fs || 'md', still: th.still ? '1' : '0' });
  u.hash = h.toString(); // после # — на сервер не уходит, KU Connect сразу убирает его из адреса
  return u.href;
}
async function openConnect(newTab) {
  const w = newTab ? window.open('about:blank', '_blank') : null; // окно — сразу по клику, иначе браузер заблокирует
  try {
    const { code } = await api('/connect/handoff', { method: 'POST', body: {} });
    const href = connectUrl(code);
    if (w) { w.opener = null; w.location.href = href; } else appTransition(href, { icon: 'chat', title: t('Открываем KU Connect…'), sub: t('Переходим в мессенджер университета') });
  } catch (e) { if (w) w.close(); toast(e.message, true); }
}

/* ---------- карточка на главной ---------- */
async function paintConnectWidget(box) {
  if (!box) return;
  let ov; try { ov = await api('/chat/overview'); } catch { box.remove(); return; }
  if (!box.isConnected) return;
  CHAT.unread = ov.unread || 0; paintChatBadge();
  const teacher = S.user.role === 'teacher';
  const line = teacher
    ? (ov.awaiting.length ? t('Ждут ответа: {n}', { n: ov.awaiting.length }) : t('Все студенты получили ответ'))
    : (ov.deadlines.length ? t('Ближайший дедлайн: {t} · {d}', { t: ov.deadlines[0].title, d: fmtDay(ov.deadlines[0].due) }) : t('Открытых заданий нет'));
  box.innerHTML = `
    <div class="kc-w-ic">${svg('chat')}${CHAT.unread ? `<span class="nav-n">${CHAT.unread > 9 ? '9+' : CHAT.unread}</span>` : ''}</div>
    <div class="kc-w-t"><b>KU Connect</b><span>${CHAT.unread ? esc(t('Новых сообщений: {n}', { n: CHAT.unread })) + ' · ' : ''}${esc(line)}</span></div>
    <div class="chev">${svg('chev')}</div>`;
  box.onclick = () => { location.hash = '#/chats'; };
}

/* ---------- страница «Connect» ---------- */
const CONNECT_FEATURES = {
  student: [
    ['book', 'Каналы предметов', 'Лекции, практики и материалы от преподавателей — с файлами Word, PowerPoint, PDF.'],
    ['clipboard', 'Задания и дедлайны', 'Все задания по предметам в одном списке, отметка «сделано».'],
    ['users', 'Вопрос преподавателю', 'Личный чат с преподавателями вашей группы, статус и часы консультаций.'],
    ['cpu', 'Инструменты по направлению', 'ИСУ — код с подсветкой и репозитории, БТ — протокол опыта и калькулятор разведения.'],
  ],
  teacher: [
    ['plus', 'Публикации в каналы', 'Лекции и практики сразу в несколько групп, пометка «Важно», правки с отметкой «изменено».'],
    ['chart', 'Центр преподавателя', 'Кто ждёт ответа, как выполняют задания, сколько студентов посмотрели материал.'],
    ['users', 'Личные вопросы студентов', 'Быстрые ответы-шаблоны, статус «Не беспокоить», часы консультаций.'],
    ['cpu', 'Инструменты кафедры', 'IT — блоки кода, биотехнологии — протоколы и расчёты, языки — словари к уроку.'],
  ],
};
async function viewConnect() {
  stopPoll();
  const teacher = S.user.role === 'teacher';
  app.innerHTML = `${miniHead('KU Connect')}<div id="pagebody">
    <div class="card oe-hero kc-hero">
      <div class="oe-bridge sm" aria-hidden="true"><span class="oe-app ku">${svg(programOf(S.user).icon)}</span><span class="oe-track"><i></i></span><span class="oe-app kc">${svg('chat')}</span></div>
      <div class="oe-kicker">${t('Мессенджер университета')}</div>
      <div class="oe-title">KU Connect</div>
      <div class="tx oe-lead">${t(teacher ? 'Публикуйте лекции и задания в каналы групп и отвечайте студентам — в отдельном удобном приложении.' : 'Каналы предметов с лекциями и заданиями и личные вопросы преподавателям — в отдельном удобном приложении.')}</div>
      <div class="oe-status" id="kcStatus"><i></i><span>${t('Проверяем доступность…')}</span></div>
      <div class="kc-sum" id="kcSum"></div>
      <button class="btn pri oe-go" id="kcGo">${svg('chat')}${t('Открыть KU Connect')}</button>
      <button class="btn ghost oe-new" id="kcNew">${svg('external')}${t('Открыть в новой вкладке')}</button>
    </div>
    <div class="oe-feat">${CONNECT_FEATURES[teacher ? 'teacher' : 'student'].map(([ic, ti, d]) => `
      <div class="card oe-fi"><span class="oe-fic">${svg(ic)}</span><div><b>${esc(t(ti))}</b><div class="tx">${esc(t(d))}</div></div></div>`).join('')}</div>
    <div class="card oe-note"><span class="oe-fic">${svg('info')}</span>
      <div class="tx"><b>${t('Входить заново не нужно.')}</b> ${t('KU Connect откроется под вашим аккаунтом, с оформлением и языком портала. Вернуться — кнопкой «KU Portal» слева.')}</div></div>
  </div>${navHTML('chats')}`;
  document.getElementById('kcGo').onclick = () => openConnect(false);
  document.getElementById('kcNew').onclick = () => openConnect(true);
  const st = document.getElementById('kcStatus');
  fetch((window.KU_API_BASE || '') + '/api/version', { cache: 'no-store' }) // KU Connect живёт на том же сервере, что и API
    .then((r) => { if (st.isConnected) { st.className = 'oe-status ' + (r.ok ? 'ok' : 'bad'); st.querySelector('span').textContent = r.ok ? t('KU Connect доступен') : t('KU Connect временно недоступен'); } })
    .catch(() => { if (st.isConnected) { st.className = 'oe-status bad'; st.querySelector('span').textContent = t('Не удалось связаться с KU Connect'); } });
  try {
    const ov = await api('/chat/overview');
    CHAT.unread = ov.unread || 0; paintChatBadge();
    const sum = document.getElementById('kcSum'); if (!sum) return;
    const chip = (n, l, hot) => `<span class="kc-chip ${hot ? 'hot' : ''}"><b>${n}</b>${esc(t(l))}</span>`;
    sum.innerHTML = chip(ov.unread, 'непрочитанных', ov.unread) + (teacher
      ? chip(ov.awaiting.length, 'ждут ответа', ov.awaiting.length) + chip(ov.tasks.length, 'активных заданий')
      : chip(ov.deadlines.length, 'открытых заданий', ov.deadlines.some((d) => d.due <= new Date(Date.now() + 864e5).toISOString().slice(0, 10))));
  } catch { }
}
