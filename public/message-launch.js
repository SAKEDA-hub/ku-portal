'use strict';
/* KU Portal → KU Message (мессенджер университета, отдельное приложение под /ku-message/ на сервере, папка ku-message/).
 *
 * Пункт меню «KU Message» открывает мессенджер сразу без промежуточного экрана. Пользователь не входит заново: портал получает
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
    u.hash = new URLSearchParams({ code, back: serviceReturnUrl(), lang: getLang(), theme: th.palette, mode: th.mode || 'light', ...(open ? { open } : {}) }).toString();
    if (w) { w.opener = null; w.location.href = u.href; }
    else appTransition(u.href);
  } catch (e) { if (w) w.close(); toast(e.message, true); }
}

/* ---------- «KU Message» в меню: сразу в мессенджер ----------
   Адрес в истории меняется на главную, чтобы «Назад» из мессенджера не открывал его снова. */
function viewMessage(open) {
  stopPoll();
  history.replaceState(null, '', '#/');
  viewHome();
  openMessage(false, open);
}
