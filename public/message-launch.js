'use strict';
/* KU Portal → KU Message (мессенджер университета, отдельное приложение под /ku-message/ на сервере, папка ku-message/).
 *
 * Пункт меню «KU Message» (#/chats) — страница входа, как «Экзамен»: что нового и кнопка «Открыть KU Message»
 * с тем же переходом, что и в онлайн-экзамен (appTransition). Пользователь не входит заново: портал получает
 * одноразовый код (/api/message/handoff, 60 с) и передаёт его в адресе после # вместе с оформлением и языком портала
 * и адресом возврата. Здесь же — значок непрочитанного у пункта меню.
 * Подключается перед app.js; хелперы app.js используются только во время вызова.
 */
const CHAT = { unread: 0 };
const messagePath = () => (window.KU_API_BASE || '') + '/ku-message/'; // как API_BASE в app.js (он подключается позже)

async function pollChatUnread() {
  if (!S.user) return;
  try { CHAT.unread = (await api('/message/overview')).unread || 0; paintChatBadge(); } catch { }
}
function paintChatBadge() {
  document.querySelectorAll('[data-nav="message"]').forEach((a) => {
    const old = a.querySelector('.nav-n'); if (old) old.remove();
    if (CHAT.unread) a.querySelector('.ic').insertAdjacentHTML('beforeend', `<span class="nav-n">${CHAT.unread > 9 ? '9+' : CHAT.unread}</span>`);
  });
}
async function openMessage(newTab, open) { // open — раздел KU Message, например '/c/<клуб>' (канал клуба)
  const w = newTab ? window.open('about:blank', '_blank') : null; // окно — сразу по клику, иначе браузер заблокирует
  try {
    const { code } = await api('/message/handoff', { method: 'POST', body: {} });
    const th = resolvedTheme();
    const u = new URL(messagePath(), location.origin);
    u.hash = new URLSearchParams({ code, back: location.href.split('#')[0] + '#/chats', lang: getLang(), theme: th.palette, mode: th.mode || 'light', ...(open ? { open } : {}) }).toString();
    if (w) { w.opener = null; w.location.href = u.href; }
    else appTransition(u.href, { icon: 'kumsg', title: t('Открываем KU Message…'), sub: t('Переходим в мессенджер университета') });
  } catch (e) { if (w) w.close(); toast(e.message, true); }
}

/* ---------- страница «KU Message» ---------- */
const MESSAGE_FEATURES = {
  student: [
    ['book', 'Страницы предметов', 'Лекции и практики по порядку — с файлами Word, PowerPoint, PDF.'],
    ['clipboard', 'Задания со сроком', 'Курсовые, проекты и рефераты — с отсчётом дней до сдачи.'],
    ['users', 'Вопрос преподавателю', 'Личный чат с преподавателями вашей группы и часы консультаций.'],
    ['bell', 'Уведомления', 'О новых лекциях, заданиях и ответах преподавателя.'],
  ],
  teacher: [
    ['plus', 'Публикации', 'Лекции, практики и задания — одна страница предмета для всех групп.'],
    ['users', 'Ученики', 'Студенты ваших групп — можно написать любому.'],
    ['kumsg', 'Быстрые ответы', 'Шаблоны для частых ответов студентам.'],
    ['clock', 'Консультации', 'Часы консультаций видны студентам в чате с вами.'],
  ],
};
async function viewMessage() {
  stopPoll();
  const teacher = S.user.role === 'teacher';
  app.innerHTML = `${miniHead('KU Message')}<div id="pagebody">
    <div class="card oe-hero">
      <div class="oe-bridge sm" aria-hidden="true"><span class="oe-app ku">${svg(programOf(S.user).icon)}</span><span class="oe-track"><i></i></span><span class="oe-app ex">${svg('kumsg')}</span></div>
      <div class="oe-kicker">${t('Мессенджер университета')}</div>
      <div class="oe-title">KU Message</div>
      <div class="tx oe-lead">${t(teacher ? 'Публикуйте лекции, практики и задания и отвечайте студентам — в отдельном приложении.' : 'Лекции, практики и задания по предметам и вопросы преподавателям — в отдельном приложении.')}</div>
      <div class="oe-status" id="kmStatus"><i></i><span>${t('Проверяем доступность…')}</span></div>
      <div class="km-sum" id="kmSum"></div>
      <button class="btn pri oe-go" id="kmGo">${svg('kumsg')}${t('Открыть KU Message')}</button>
      <button class="btn ghost oe-new" id="kmNew">${svg('external')}${t('Открыть в новой вкладке')}</button>
    </div>
    <div class="oe-feat">${MESSAGE_FEATURES[teacher ? 'teacher' : 'student'].map(([ic, ti, d]) => `
      <div class="card oe-fi"><span class="oe-fic">${svg(ic)}</span><div><b>${esc(t(ti))}</b><div class="tx">${esc(t(d))}</div></div></div>`).join('')}</div>
    <div class="card oe-note"><span class="oe-fic">${svg('info')}</span>
      <div class="tx"><b>${t('Входить заново не нужно.')}</b> ${t('KU Message откроется под вашим аккаунтом, с оформлением и языком портала. Вернуться — кнопкой с домиком.')}</div></div>
  </div>${navHTML('message')}`;
  document.getElementById('kmGo').onclick = () => openMessage(false);
  document.getElementById('kmNew').onclick = () => openMessage(true);
  const st = document.getElementById('kmStatus');
  fetch((window.KU_API_BASE || '') + '/api/version', { cache: 'no-store' }) // KU Message живёт на том же сервере, что и API
    .then((r) => { if (st.isConnected) { st.className = 'oe-status ' + (r.ok ? 'ok' : 'bad'); st.querySelector('span').textContent = t(r.ok ? 'KU Message доступен' : 'KU Message временно недоступен'); } })
    .catch(() => { if (st.isConnected) { st.className = 'oe-status bad'; st.querySelector('span').textContent = t('Не удалось связаться с KU Message'); } });
  try {
    const ov = await api('/message/overview');
    CHAT.unread = ov.unread || 0; paintChatBadge();
    const sum = document.getElementById('kmSum'); if (!sum) return;
    const chip = (n, l, hot) => `<span class="km-chip ${hot ? 'hot' : ''}"><b>${n}</b>${esc(t(l))}</span>`;
    sum.innerHTML = chip(ov.unread, 'непрочитанных', ov.unread) + (teacher ? '' : chip(ov.deadlines.length, 'заданий со сроком', ov.deadlines.some((d) => d.due <= new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10))));
  } catch { }
}
