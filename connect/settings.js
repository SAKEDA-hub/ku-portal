'use strict';
/* KU Connect — настройки. Устроены как в KU Portal и онлайн-экзамене:
 *   на сервере (общие с порталом, /api/settings): статус и его текст, часы консультаций (преподаватель),
 *     «в сети», отметки о прочтении — видны другим людям, поэтому одинаковы в портале и в KU Connect;
 *   в браузере (kuc_prefs:<id>): оформление (или «Как в KU Portal» — тема приходит при переходе),
 *     обои чата, плотность, отправка по Enter, предпросмотр, звук, уведомления браузера, типы уведомлений.
 */
const SET_SECTIONS = [['profile', 'user', 'Профиль и статус'], ['look', 'palette', 'Оформление'], ['chats', 'chat', 'Чаты'], ['notif', 'bell', 'Уведомления'], ['privacy', 'shield', 'Конфиденциальность'], ['lang', 'globe', 'Язык'], ['account', 'portal', 'Аккаунт']];
const MODES = [['light', 'Светлая', 'sun'], ['dark', 'Тёмная', 'moon'], ['system', 'Как в системе', 'device']];
const WALLS = [['none', 'Без узора'], ['dots', 'Точки'], ['grid', 'Сетка'], ['glow', 'Сияние']];

async function saveSrv(patch) {
  try { C.srv.settings = (await api('/settings', { method: 'POST', body: patch })).settings; return true; }
  catch (e) { toast(e.message, true); return false; }
}
function swHTML(key, title, sub, on, srv) {
  return `<div class="set-row"><div class="sr-t"><b>${t(title)}</b>${sub ? `<span>${t(sub)}</span>` : ''}</div>
    <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(t(title))}" data-sw="${key}" data-srv="${srv ? 1 : ''}"><i></i></button></div>`;
}
function statusPickerHTML() {
  const cur = C.srv.settings.status;
  return `<div class="status-pick">${Object.entries(STATUS).map(([k, v]) => `<button data-st="${k}" class="${cur === k ? 'on' : ''}"><i class="dot s-${v[1]}"></i>${t(v[0])}</button>`).join('')}</div>`;
}
function statusDlg() {
  modal(t('Мой статус'), `${statusPickerHTML()}
    <input class="inp" id="stText" maxlength="60" placeholder="${t('Подпись, например: на паре до 12:00')}" value="${esc(C.srv.settings.statusText)}">
    <div class="tx">${t('«Не беспокоить» отключает всплывающие уведомления. Статус видят собеседники.')}</div>
    <button class="btn pri wide" id="stSave">${t('Сохранить')}</button>`, (box, close) => {
    let st = C.srv.settings.status;
    box.querySelector('.status-pick').onclick = (e) => { const b = e.target.closest('[data-st]'); if (!b) return; st = b.dataset.st; box.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); };
    box.querySelector('#stSave').onclick = async () => { if (await saveSrv({ status: st, statusText: box.querySelector('#stText').value })) { close(); toast(t('Статус обновлён')); paintMe(); if (C.sec === 'settings') viewSettings(); } };
  });
}
function paintMe() {
  const dot = document.querySelector('#meBtn .dot');
  if (dot) dot.className = 'dot s-' + (STATUS[C.srv.settings.status] || STATUS.available)[1];
}
function permText() {
  if (!('Notification' in window)) return 'Браузер не поддерживает уведомления';
  if (Notification.permission === 'granted') return 'Разрешено — когда вкладка свёрнута';
  if (Notification.permission === 'denied') return 'Запрещено в настройках браузера';
  return 'Когда вкладка свёрнута · нужно разрешение браузера';
}
function settingsHTML() {
  const u = C.user, p = getPrefs(), s = C.srv.settings, th = resolvedTheme();
  const follow = p.followPortal && !!portalLook;
  const sec = (id, body) => { const x = SET_SECTIONS.find((y) => y[0] === id); return `<section class="set-sec" id="set-${id}"><h3>${svg(x[1])}${t(x[2])}</h3>${body}</section>`; };
  return `<div class="page set-page">
    <div class="page-hero"><span class="hero-ic">${svg('gear')}</span><div><b>${t('Настройки')}</b><span>${t('Оформление и уведомления — на этом устройстве, статус и конфиденциальность — для всего KU Portal')}</span></div></div>
    <nav class="set-nav">${SET_SECTIONS.map(([id, ic, l]) => `<a href="#set-${id}" data-go="${id}">${svg(ic)}${t(l)}</a>`).join('')}</nav>
    <div class="set-main">
    ${sec('profile', `<div class="prof">${avatar(u.fio, u.id, 'xl')}<div><b>${esc(u.fio)}</b><span class="tx">${t(u.role === 'teacher' ? 'Преподаватель' : 'Студент')}${u.group ? ' · ' + esc(u.group) : ''}${u.track ? ' · ' + esc(t(TRACK_NAME[u.track])) : ''}</span><span class="tx">${esc(u.email)}</span></div></div>
      <div class="set-lbl">${t('Статус')}</div>${statusPickerHTML()}
      <input class="inp" id="setStText" maxlength="60" placeholder="${t('Подпись, например: на паре до 12:00')}" value="${esc(s.statusText)}">
      ${u.role === 'teacher' ? `<div class="set-lbl">${t('Часы консультаций')}</div><input class="inp" id="setOffice" maxlength="80" placeholder="${t('Например: Пн, Ср 14:00–15:00, ауд. 214')}" value="${esc(s.officeHours)}"><div class="tx">${t('Студенты видят их в личном чате с вами.')}</div>` : ''}
      <button class="btn pri" id="setProfSave">${t('Сохранить')}</button>`)}
    ${sec('look', `${portalLook ? swHTML('followPortal', 'Как в KU Portal', 'Тема, цвет и размер текста — те же, что в портале', follow) : ''}
      <div class="${follow ? 'disabled' : ''}">
        <div class="set-lbl">${t('Тема')}</div>
        <div class="modes">${MODES.map(([m, l, ic]) => `<button class="mode ${th.mode === m ? 'on' : ''}" data-mode="${m}"><span class="mp mp-${m}"><i></i><i></i><i></i></span><span>${svg(ic)}${t(l)}</span></button>`).join('')}</div>
        <div class="set-lbl">${t('Цвет')}</div>
        <div class="swatches"><button class="swatch ${p.palette === 'auto' ? 'on' : ''}" data-pal="auto" style="--sw:${PALETTES[u.program === 'arizona' ? 'arizona' : 'ku']}"><i></i><span>${t('Авто')}</span></button>${Object.entries(PALETTES).map(([k, c]) => `<button class="swatch ${p.palette === k ? 'on' : ''}" data-pal="${k}" style="--sw:${c}"><i></i><span>${t(PALETTE_NAMES[k])}</span></button>`).join('')}</div>
        <div class="set-lbl">${t('Размер текста')}</div>
        <div class="seg">${[['sm', 'Мелкий'], ['md', 'Обычный'], ['lg', 'Крупный'], ['xl', 'Очень крупный']].map(([k, l]) => `<button data-fs="${k}" class="${th.fs === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div>
      </div>
      <div class="set-lbl">${t('Обои в чатах')}</div>
      <div class="walls">${WALLS.map(([k, l]) => `<button class="wallopt w-${k} ${p.wallpaper === k ? 'on' : ''}" data-wall="${k}"><i></i><span>${t(l)}</span></button>`).join('')}</div>
      ${swHTML('compact', 'Компактный режим', 'Плотнее список чатов и сообщения', p.compact)}
      ${swHTML('still', 'Меньше анимации', 'Отключить плавные переходы', p.still)}`)}
    ${sec('chats', `${swHTML('enterSend', 'Отправка по Enter', 'Выключите, чтобы отправлять по Ctrl+Enter', p.enterSend)}
      ${swHTML('previews', 'Предпросмотр сообщений', 'Показывать текст последнего сообщения в списке чатов', p.previews)}`)}
    ${sec('notif', `${swHTML('push', 'Уведомления браузера', permText(), p.push && 'Notification' in window && Notification.permission === 'granted')}
      ${swHTML('sound', 'Звук', 'Короткий сигнал при новом уведомлении', p.sound)}
      ${swHTML('notifChat', 'Личные сообщения', u.role === 'teacher' ? 'Когда вам пишет студент' : 'Когда вам отвечает преподаватель', p.notifChat)}
      ${swHTML('notifTasks', 'Материалы и задания', 'Когда преподаватель публикует лекцию, практику или задание', p.notifTasks)}
      <button class="btn ghost" id="setTest">${svg('bell')}${t('Проверить уведомление')}</button>`)}
    ${sec('privacy', `${swHTML('showOnline', 'Статус «в сети»', u.role === 'teacher' ? 'Видно студентам в сообщениях' : 'Видно преподавателям и группе', s.showOnline, true)}
      ${swHTML('readReceipts', 'Отметки о прочтении', 'Собеседник видит ✓✓, когда вы прочитали. Если выключить — вы тоже не увидите его отметки', s.readReceipts, true)}`)}
    ${sec('lang', `<div class="seg">${Object.entries(LANGS).map(([k, n]) => `<button data-lang="${k}" class="${getLang() === k ? 'on' : ''}">${n}</button>`).join('')}</div><div class="tx">${t('Язык меняется и в портале на этом устройстве, если портал открыт с того же адреса.')}</div>`)}
    ${sec('account', `<a class="btn ghost" href="${esc(backUrl())}">${svg('portal')}${t('Вернуться в KU Portal')}</a>
      <button class="btn danger" id="setOut">${svg('out')}${t('Выйти из KU Connect')}</button>
      <div class="tx">KU Connect v1.0 · Kozybayev University</div>`)}
    </div></div>`;
}
function viewSettings() {
  const main = document.getElementById('main');
  const y = main.querySelector('.page') ? main.querySelector('.page').scrollTop : 0;
  main.innerHTML = settingsHTML();
  const page = main.querySelector('.page'); page.scrollTop = y;
  const rerender = () => viewSettings();
  main.querySelectorAll('[data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); main.querySelector('#set-' + a.dataset.go).scrollIntoView({ behavior: getPrefs().still ? 'auto' : 'smooth', block: 'start' }); }));
  const mine = () => { const p = getPrefs(); if (p.followPortal && portalLook) setPref('followPortal', false); }; // своё оформление — выключает «Как в KU Portal»
  main.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mine(); setPref('mode', b.dataset.mode); rerender(); }));
  main.querySelectorAll('[data-pal]').forEach((b) => (b.onclick = () => { mine(); setPref('palette', b.dataset.pal); rerender(); }));
  main.querySelectorAll('[data-fs]').forEach((b) => (b.onclick = () => { mine(); setPref('fs', b.dataset.fs); rerender(); }));
  main.querySelectorAll('[data-wall]').forEach((b) => (b.onclick = () => { setPref('wallpaper', b.dataset.wall); rerender(); }));
  main.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); startApp(); location.hash = '#/settings'; }));
  main.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = async () => {
    const key = b.dataset.sw, on = !b.classList.contains('on');
    if (b.dataset.srv) { if (await saveSrv({ [key]: on })) rerender(); return; }
    if (key === 'push' && on) {
      if (!('Notification' in window)) return toast(t('Браузер не поддерживает уведомления'), true);
      if ((await Notification.requestPermission()) !== 'granted') return toast(t('Разрешение не выдано'), true);
    }
    setPref(key, on); rerender();
  }));
  main.querySelector('.status-pick').onclick = async (e) => { const b = e.target.closest('[data-st]'); if (b && await saveSrv({ status: b.dataset.st })) { paintMe(); rerender(); } };
  main.querySelector('#setProfSave').onclick = async () => {
    const patch = { statusText: main.querySelector('#setStText').value };
    const off = main.querySelector('#setOffice'); if (off) patch.officeHours = off.value;
    if (await saveSrv(patch)) toast(t('Сохранено'));
  };
  main.querySelector('#setTest').onclick = () => { const p = getPrefs(); toast(t('Так будут выглядеть уведомления KU Connect')); if (p.sound) chime(); if (p.push && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('KU Connect', { body: t('Так будут выглядеть уведомления KU Connect') }); } catch { } } };
  main.querySelector('#setOut').onclick = async () => { try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { } signOut(); };
}
