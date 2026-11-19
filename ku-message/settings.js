'use strict';
/* KU Message — настройки (#/settings, #/settings/<раздел>), как в Telegram: в колонке списка — карточка профиля
 * и меню разделов с цветными значками, справа — открытый раздел (на телефоне — отдельным экраном).
 *   на сервере (общие с порталом, /api/settings): «в сети», отметки о прочтении, часы консультаций преподавателя;
 *   в браузере (kum_prefs:<id>): оформление («как в KU Portal» или своя тема и цвет), отправка по Enter,
 *   предпросмотр сообщений, звук, уведомления браузера; шаблоны быстрых ответов (kum_quick:<id>).
 */
/* [id, значок, название, оттенок значка] */
const SET_SECTIONS = [
  ['profile', 'user', 'Профиль', 210],
  ['look', 'palette', 'Оформление', 280],
  ['chats', 'chat', 'Чаты', 150],
  ['notif', 'bell', 'Уведомления', 0],
  ['privacy', 'shield', 'Конфиденциальность', 120],
  ['quick', 'quote', 'Быстрые ответы', 35],
  ['lang', 'globe', 'Язык', 190],
  ['account', 'logout', 'Аккаунт', 345],
];
const SET_GROUPS = [['profile', 'look', 'chats'], ['notif', 'privacy', 'quick'], ['lang', 'account']];
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
const roleName = () => t(teacher() ? 'Преподаватель' : staff() ? 'Сотрудник' : 'Студент');
const setSections = () => SET_SECTIONS.filter(([id]) => id !== 'quick' || teacher());
const curSection = () => { const m = /^#\/settings\/(\w+)$/.exec(location.hash); return m ? m[1] : ''; };

/* ---------- колонка списка: профиль и меню ---------- */
function settingsMenuHTML() {
  const u = M.user, p = getPrefs(), cur = curSection() || (matchMedia('(max-width: 860px)').matches ? '' : 'profile');
  const ids = setSections().map((x) => x[0]);
  const lookNow = p.followPortal && portalLook ? 'Как в KU Portal' : (MODES.find((m) => m[0] === p.mode) || MODES[0])[1];
  const right = (id) => (id === 'lang' ? `<small>${esc(LANGS[getLang()])}</small>` : id === 'look' ? `<small>${t(lookNow)}</small>` : '');
  return `<a class="me-card" href="#/settings/profile" style="--h:${hue(u.id)}">
      <span class="ava xl" style="--h:${hue(u.id)}">${initials(u.fio)}</span>
      <span class="me-t"><b>${esc(u.fio)}</b><small>${roleName()}${u.group ? ' · ' + esc(u.group) : ''}</small><small>${esc(u.email)}</small></span>
    </a>
    ${SET_GROUPS.map((g) => `<div class="set-grp">${g.filter((id) => ids.includes(id)).map((id) => {
    const [, ic, l, h] = SET_SECTIONS.find((x) => x[0] === id);
    return `<a class="set-item ${cur === id ? 'on' : ''}" href="#/settings/${id}"><span class="si-ic" style="--h:${h}">${svg(ic)}</span>
        <span class="si-t"><b>${t(l)}</b></span>${right(id)}<span class="si-chev">${svg('chev')}</span></a>`;
  }).join('')}</div>`).join('')}
    <p class="set-foot">KU Message · Kozybayev University</p>`;
}

/* ---------- открытый раздел ---------- */
function sectionBody(id) {
  const u = M.user, p = getPrefs(), s = M.srv.settings;
  const follow = p.followPortal && !!portalLook;
  const program = u.program === 'arizona' ? 'arizona' : 'ku';
  const card = (body, title) => `${title ? `<div class="set-lbl">${t(title)}</div>` : ''}<div class="set-card">${body}</div>`; // заголовок секции — над карточкой, как в Telegram
  if (id === 'profile') return `
    <div class="prof-hero" style="--h:${hue(u.id)}"><span class="ava xxl" style="--h:${hue(u.id)}">${initials(u.fio)}</span>
      <b>${esc(u.fio)}</b><span>${roleName()}${u.group ? ' · ' + esc(u.group) : ''}</span></div>
    ${card(`<div class="kv"><span>Email</span><b>${esc(u.email)}</b></div><div class="kv"><span>${t('Роль')}</span><b>${roleName()}</b></div>${u.group ? `<div class="kv"><span>${t('Группа')}</span><b>${esc(u.group)}</b></div>` : ''}`)}
    ${teacher() ? card(`<div class="set-inline"><input class="inp" id="sOffice" maxlength="80" placeholder="${t('Например: Пн, Ср 14:00–15:00, ауд. 214')}" value="${esc(s.officeHours || '')}"><button class="btn pri" id="sOfficeSave">${t('Сохранить')}</button></div><p class="hint">${t('Студенты видят их в чате с вами и на странице предмета.')}</p>`, 'Часы консультаций') : ''}
    <p class="hint center">${t('Имя и группа меняются в KU Portal.')}</p>`;
  if (id === 'look') return `
    <div class="preview wall" aria-hidden="true">
      <div class="pv-msg"><span class="ava sm" style="--h:200">АК</span><div class="bub"><span class="txt">${t('Добрый день! Лекция 3 уже на странице предмета.')}</span><span class="meta">10:24</span></div></div>
      <div class="pv-msg me"><div class="bub"><span class="txt">${t('Спасибо, посмотрю сегодня!')}</span><span class="meta">10:25 <i class="rc read">${svg('checks')}</i></span></div></div>
    </div>
    ${portalLook ? card(swHTML('followPortal', 'Как в KU Portal', 'Тема и цвет — как в портале', follow)) : ''}
    <div class="${follow ? 'off' : ''}">
      ${card(`<div class="modes">${MODES.map(([m, l, ic]) => `<button class="mode ${p.mode === m ? 'on' : ''}" data-mode="${m}"><span class="mp mp-${m}"><i></i><i></i><i></i></span><span>${svg(ic)}${t(l)}</span></button>`).join('')}</div>`, 'Тема')}
      ${card(`<div class="swatches"><button class="swatch ${p.palette === 'auto' ? 'on' : ''}" data-pal="auto" style="--sw:${PALETTES[program]}"><i>${svg('check')}</i><span>${t('Авто')}</span></button>${Object.entries(PALETTES).map(([k, c]) => `<button class="swatch ${p.palette === k ? 'on' : ''}" data-pal="${k}" style="--sw:${c}"><i>${svg('check')}</i><span>${t(PALETTE_NAMES[k])}</span></button>`).join('')}</div>`, 'Цвет')}
    </div>`;
  if (id === 'chats') return card(`${swHTML('enterSend', 'Отправка по Enter', 'Выключите, чтобы отправлять по Ctrl+Enter', p.enterSend)}
      ${swHTML('previews', 'Предпросмотр сообщений', 'Показывать текст последнего сообщения в списке чатов', p.previews)}`);
  if (id === 'notif') return `${card(`${swHTML('push', 'Уведомления браузера', permText(), p.push && 'Notification' in window && Notification.permission === 'granted')}
      ${swHTML('sound', 'Звук', 'Короткий сигнал при новом уведомлении', p.sound)}`)}
    <button class="btn wide" id="sTest">${svg('bell')}${t('Проверить уведомление')}</button>`;
  if (id === 'privacy') return card(`${swHTML('showOnline', 'Показывать, что я в сети', teacher() ? 'Видно студентам в чатах' : 'Видно преподавателям', s.showOnline, true)}
      ${swHTML('readReceipts', 'Отметки о прочтении', 'Собеседник видит ✓✓, когда вы прочитали. Если выключить — вы тоже не увидите его отметки', s.readReceipts, true)}`) + `<p class="hint center">${t('Эти настройки общие для всего KU Portal.')}</p>`;
  if (id === 'quick') return card(`<p class="hint">${t('Шаблоны для чата со студентами — кнопка с кавычками рядом с полем сообщения.')}</p>
      <div class="qr-edit">${getQuick().map((q, i) => `<div class="qr-row"><input class="inp" data-qr="${i}" value="${esc(q)}" maxlength="300"><button class="ib" data-qrdel="${i}" title="${t('Удалить')}">${svg('trash')}</button></div>`).join('')}</div>
      <div class="set-inline"><button class="btn" id="qrAdd">${svg('plus')}${t('Добавить шаблон')}</button><button class="btn pri" id="qrSave">${t('Сохранить')}</button></div>`);
  if (id === 'lang') return card(`<div class="lang-list">${Object.entries(LANGS).map(([k, n]) => `<button data-lang="${k}" class="${getLang() === k ? 'on' : ''}"><span>${n}</span>${getLang() === k ? svg('check') : ''}</button>`).join('')}</div>`);
  return `${card(`<a class="set-link" href="${esc(backUrl())}"><span class="si-ic" style="--h:190">${svg('home')}</span><b>${t('Вернуться в KU Portal')}</b><span class="si-chev">${svg('chev')}</span></a>
      <button class="set-link danger" id="sOut"><span class="si-ic" style="--h:0">${svg('logout')}</span><b>${t('Выйти из KU Message')}</b></button>`)}
    <p class="hint center">KU Message · Kozybayev University</p>`;
}
function viewSettings(sec) {
  const ids = setSections().map((x) => x[0]);
  const id = ids.includes(sec) ? sec : 'profile';
  const x = SET_SECTIONS.find((y) => y[0] === id);
  const main = document.getElementById('main');
  const old = main.querySelector('.set-page');
  const y = old && old.dataset.sec === id ? old.scrollTop : 0;
  main.innerHTML = `<div class="pane"><header class="pane-h"><a class="ib only-m" href="#/settings">${svg('back')}</a>
    <div class="pane-t"><b>${t(x[2])}</b><small>${t(id === 'privacy' ? 'Для всего KU Portal' : id === 'profile' ? 'Аккаунт KU Portal' : 'На этом устройстве')}</small></div></header>
    <div class="pane-b set-page" data-sec="${id}"><div class="set-col">${sectionBody(id)}</div></div></div>`;
  main.querySelector('.set-page').scrollTop = y;
  bindSettings(main, id);
}
function bindSettings(main, id) {
  const rerender = () => { viewSettings(id); paintList(); };
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
  const test = main.querySelector('#sTest');
  if (test) test.onclick = () => {
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
  const out = main.querySelector('#sOut');
  if (out) out.onclick = async () => { try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { } signOut(); };
}
