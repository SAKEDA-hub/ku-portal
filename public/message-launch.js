'use strict';
/* KU Portal → KU Message (мессенджер университета, отдельное приложение под /ku-message/ на сервере, папка ku-message/).
 *
 * Вход один — пункт «KU Message» в верхнем меню: сразу переход с той же анимацией, что и в онлайн-экзамен (appTransition).
 * Пользователь не входит заново: портал получает одноразовый код (/api/message/handoff, 60 с) и передаёт его
 * в адресе после # вместе с оформлением и языком портала и адресом возврата. Здесь же — значок непрочитанного у пункта меню.
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
async function openMessage() {
  try {
    const { code } = await api('/message/handoff', { method: 'POST', body: {} });
    const th = resolvedTheme();
    const u = new URL(messagePath(), location.origin);
    u.hash = new URLSearchParams({ code, back: location.href.split('#')[0] + '#/', lang: getLang(), theme: th.palette, mode: th.mode || 'light' }).toString();
    appTransition(u.href, { icon: 'chat', title: t('Открываем KU Message…'), sub: t('Переходим в мессенджер университета') });
  } catch (e) { toast(e.message, true); }
}
