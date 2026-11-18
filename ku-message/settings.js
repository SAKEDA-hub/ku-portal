'use strict';
/* KU Message — страница настроек (#/settings): разделы слева (на телефоне — строка-переключатель сверху), карточки справа.
 *   на сервере (общие с порталом, /api/settings): «в сети», отметки о прочтении, часы консультаций преподавателя;
 *   в браузере (kum_prefs:<id>): оформление («как в KU Portal» или своя тема и цвет), отправка по Enter,
 *   предпросмотр сообщений, звук, уведомления браузера; шаблоны быстрых ответов (kum_quick:<id>).
 */
const SET_SECTIONS = [['profile', 'user', 'Профиль'], ['look', 'palette', 'Оформление'], ['chats', 'chat', 'Чаты'], ['notif', 'bell', 'Уведомления'], ['privacy', 'lock', 'Конфиденциальность'], ['quick', 'quote', 'Быстрые ответы'], ['lang', 'globe', 'Язык'], ['account', 'home', 'Аккаунт']];
const MODES = [['light', 'Светлая', 'sun'], ['dark', 'Тёмная', 'moon'], ['system', 'Как в системе', 'device']];
const PALETTE_NAMES = { ku: 'Kozybayev', arizona: 'Arizona', emerald: 'Изумрудный', violet: 'Фиолетовый', coral: 'Коралловый', graphite: 'Графит', pink: 'Розовый' };

async function saveSrv(patch) {
  try { M.srv.settings = (await api('/settings', { method: 'POST', body: patch })).settings; return true; }
  catch (e) { toast(e.message, true); return false; }
}
function swHTML(key, title, sub, on, srv) {
  return `<div class="set-row"><div class="sr-t"><b>${t(title)}</b>${sub ? `<span>${t(sub)}</span>` : ''}</div>
    <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(t(title))}" data-sw="${key}" data-srv="${srv ? 1 : ''}"><i></i></button></div>`;
}
function permText() {
  if (!('Notification' in window)) return 'Браузер не поддерживает уведомления';
  if (Notification.permission === 'granted') return 'Разрешено — когда вкладка свёрнута';
  if (Notification.permission === 'denied') return 'Запрещено в настройках браузера';
  return 'Когда вкладка свёрнута · нужно разрешение браузера';
}
function settingsHTML() {
  const u = M.user, p = getPrefs(), s = M.srv.settings;
  const follow = p.followPortal && !!portalLook;
  const sections = SET_SECTIONS.filter(([id]) => id !== 'quick' || teacher());
  const sec = (id, body) => { const x = SET_SECTIONS.find((y) => y[0] === id); return `<section class="set-sec" id="set-${id}"><h3>${svg(x[1])}${t(x[2])}</h3>${body}</section>`; };
  const program = u.program === 'arizona' ? 'arizona' : 'ku';
  return `<div class="pane"><header class="pane-h"><a class="ib only-m" href="#/">${svg('back')}</a><div class="pane-t"><b>${t('Настройки')}</b><small>${t('Оформление и уведомления — на этом устройстве, конфиденциальность — для всего KU Portal')}</small></div></header>
  <div class="pane-b set-page">
    <nav class="set-nav">${sections.map(([id, ic, l]) => `<a href="#set-${id}" data-go="${id}">${svg(ic)}<span>${t(l)}</span></a>`).join('')}</nav>
    <div class="set-main">
    ${sec('profile', `<div class="prof"><span class="ava xl">${initials(u.fio)}</span><div><b>${esc(u.fio)}</b><span>${t(teacher() ? 'Преподаватель' : 'Студент')}${u.group ? ' · ' + esc(u.group) : ''}</span><span>${esc(u.email)}</span></div></div>
      ${teacher() ? `<label class="lbl">${t('Часы консультаций')}</label><div class="set-inline"><input class="inp" id="sOffice" maxlength="80" placeholder="${t('Например: Пн, Ср 14:00–15:00, ауд. 214')}" value="${esc(s.officeHours || '')}"><button class="btn pri" id="sOfficeSave">${t('Сохранить')}</button></div><p class="hint">${t('Студенты видят их в чате с вами и на странице предмета.')}</p>` : ''}`)}
    ${sec('look', `${portalLook ? swHTML('followPortal', 'Как в KU Portal', 'Тема и цвет — как в портале', follow) : ''}
      <div class="${follow ? 'off' : ''}">
        <div class="set-lbl">${t('Тема')}</div>
        <div class="modes">${MODES.map(([m, l, ic]) => `<button class="mode ${p.mode === m ? 'on' : ''}" data-mode="${m}"><span class="mp mp-${m}"><i></i><i></i><i></i></span><span>${svg(ic)}${t(l)}</span></button>`).join('')}</div>
        <div class="set-lbl">${t('Цвет')}</div>
        <div class="swatches"><button class="swatch ${p.palette === 'auto' ? 'on' : ''}" data-pal="auto" style="--sw:${PALETTES[program]}"><i></i><span>${t('Авто')}</span></button>${Object.entries(PALETTES).map(([k, c]) => `<button class="swatch ${p.palette === k ? 'on' : ''}" data-pal="${k}" style="--sw:${c}"><i></i><span>${t(PALETTE_NAMES[k])}</span></button>`).join('')}</div>
      </div>`)}
    ${sec('chats', `${swHTML('enterSend', 'Отправка по Enter', 'Выключите, чтобы отправлять по Ctrl+Enter', p.enterSend)}
      ${swHTML('previews', 'Предпросмотр сообщений', 'Показывать текст последнего сообщения в списке чатов', p.previews)}`)}
    ${sec('notif', `${swHTML('push', 'Уведомления браузера', permText(), p.push && 'Notification' in window && Notification.permission === 'granted')}
      ${swHTML('sound', 'Звук', 'Короткий сигнал при новом уведомлении', p.sound)}
      <button class="btn" id="sTest">${svg('bell')}${t('Проверить уведомление')}</button>`)}
    ${sec('privacy', `${swHTML('showOnline', 'Показывать, что я в сети', teacher() ? 'Видно студентам в чатах' : 'Видно преподавателям', s.showOnline, true)}
      ${swHTML('readReceipts', 'Отметки о прочтении', 'Собеседник видит ✓✓, когда вы прочитали. Если выключить — вы тоже не увидите его отметки', s.readReceipts, true)}`)}
    ${teacher() ? sec('quick', `<p class="hint">${t('Шаблоны для чата со студентами — кнопка с кавычками рядом с полем сообщения.')}</p>
      <div class="qr-edit">${getQuick().map((q, i) => `<div class="qr-row"><input class="inp" data-qr="${i}" value="${esc(q)}" maxlength="300"><button class="ib" data-qrdel="${i}" title="${t('Удалить')}">${svg('trash')}</button></div>`).join('')}</div>
      <div class="set-inline"><button class="btn" id="qrAdd">${svg('plus')}${t('Добавить шаблон')}</button><button class="btn pri" id="qrSave">${t('Сохранить')}</button></div>`) : ''}
    ${sec('lang', `<div class="seg">${Object.entries(LANGS).map(([k, n]) => `<button data-lang="${k}" class="${getLang() === k ? 'on' : ''}">${n}</button>`).join('')}</div>`)}
    ${sec('account', `<div class="set-inline"><a class="btn" href="${esc(backUrl())}">${svg('home')}${t('Вернуться в KU Portal')}</a><button class="btn danger" id="sOut">${t('Выйти из KU Message')}</button></div>
      <p class="hint">KU Message · Kozybayev University</p>`)}
    </div></div></div>`;
}
function viewSettings() {
  const main = document.getElementById('main');
  const body = main.querySelector('.set-page');
  const y = body ? body.scrollTop : 0;
  main.innerHTML = settingsHTML();
  const page = main.querySelector('.set-page'); page.scrollTop = y;
  const rerender = () => viewSettings();
  main.querySelectorAll('[data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); main.querySelector('#set-' + a.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  const own = () => { if (getPrefs().followPortal && portalLook) setPref('followPortal', false); }; // своя тема — выключает «Как в KU Portal»
  main.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { own(); setPref('mode', b.dataset.mode); rerender(); }));
  main.querySelectorAll('[data-pal]').forEach((b) => (b.onclick = () => { own(); setPref('palette', b.dataset.pal); rerender(); }));
  main.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); startApp(); }));
  main.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = async () => {
    const key = b.dataset.sw, on = !b.classList.contains('on');
    if (b.dataset.srv) { if (await saveSrv({ [key]: on })) rerender(); return; }
    if (key === 'push' && on) {
      if (!('Notification' in window)) return toast(t('Браузер не поддерживает уведомления'), true);
      if ((await Notification.requestPermission()) !== 'granted') return toast(t('Разрешение не выдано'), true);
    }
    setPref(key, on); rerender();
  }));
  main.querySelector('#sTest').onclick = () => {
    const pr = getPrefs(), text = t('Так будут выглядеть уведомления KU Message');
    toast(text); if (pr.sound) chime();
    if (pr.push && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('KU Message', { body: text }); } catch { } }
  };
  const office = main.querySelector('#sOfficeSave');
  if (office) office.onclick = async () => { if (await saveSrv({ officeHours: main.querySelector('#sOffice').value })) toast(t('Сохранено')); };
  if (main.querySelector('#qrSave')) {
    const read = () => [...main.querySelectorAll('[data-qr]')].map((i) => i.value.trim()).filter(Boolean);
    const store = (list) => { try { localStorage.setItem(quickKey(), JSON.stringify(list.slice(0, 20))); } catch { } };
    main.querySelector('#qrAdd').onclick = () => { store(read().concat(t('Новый шаблон'))); rerender(); };
    main.querySelector('#qrSave').onclick = () => { store(read()); toast(t('Шаблоны сохранены')); };
    main.querySelectorAll('[data-qrdel]').forEach((b) => (b.onclick = () => { const l = read(); l.splice(+b.dataset.qrdel, 1); store(l); rerender(); }));
  }
  main.querySelector('#sOut').onclick = async () => { try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { } signOut(); };
}
