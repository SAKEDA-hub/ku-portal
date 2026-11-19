'use strict';
/* KU Portal — личный кабинет: профиль и все настройки, диалоги безопасности и аккаунта.
 * Обычный скрипт: подключается в index.html перед app.js и пользуется его хелперами (svg, esc, t, api, toast, modal, S, app…)
 * только во время вызова. */
/* ============================ Личный кабинет = профиль + все настройки ============================ */
/* Один экран: слева (на ноутбуке) карточка профиля и оглавление разделов, справа — разделы настроек.
   На телефоне оглавление — прокручиваемая строка чипов над разделами.
   Все разделы работают:
   - «Оформление», «Язык» — в браузере (ku_prefs:<id>, ku_lang), тема передаётся и в онлайн-экзамен;
   - «Уведомления» — в браузере: тост, звук, уведомления браузера, фильтры по типам (см. NOTIF);
   - «Безопасность», «Конфиденциальность», «Аккаунт» — на сервере (/api/settings, /api/auth/password, /api/2fa/*,
     /api/sessions*, /api/export, /api/account/delete). */
const CAB_SECTIONS = [
  ['appearance', 'palette', 'Оформление'],
  ['language', 'globe', 'Язык и регион'],
  ['notifications', 'bell', 'Уведомления'],
  ['security', 'shield', 'Безопасность'],
  ['privacy', 'eye', 'Конфиденциальность'],
  ['account', 'user', 'Аккаунт'],
];
const SRV_KEYS = ['showInRating', 'showOnline', 'loginAlerts']; // хранятся на сервере
let SRV = null; // { settings, twoFactor, passChangedAt, demo }
function prefVal(key) {
  if (SRV_KEYS.includes(key)) return !!(SRV && SRV.settings[key]);
  if (key === 'notifPush') return !!getPrefs().notifPush && 'Notification' in window && Notification.permission === 'granted';
  return !!getPrefs()[key];
}
function swRow(key, icon, title, sub, o) {
  o = o || {};
  const on = o.locked !== undefined ? o.locked : prefVal(key);
  return `<div class="set-row"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${t(title)}</b>${sub ? `<span class="tx">${o.raw ? sub : tv(sub)}</span>` : ''}</div>
    <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(t(title))}" data-sw="${key}" ${o.locked !== undefined ? 'disabled' : ''}><i></i></button></div>`;
}
function linkRow(icon, title, sub, act, cls) {
  return `<button class="set-row link ${cls || ''}" data-act="${act}"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${t(title)}</b>${sub ? `<span class="tx">${sub}</span>` : ''}</div><span class="chev">${svg('chev')}</span></button>`;
}
function segRow(key, icon, title, opts, cur) {
  if (cur === undefined) cur = getPrefs()[key];
  return `<div class="set-row wrap"><span class="sr-ic">${svg(icon)}</span><div class="sr-t"><b>${t(title)}</b></div>
    <div class="seg2 txt" role="radiogroup" aria-label="${esc(t(title))}">${opts.map(([v, l]) => `<button role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-seg="${key}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}
function modePreview(m, cur) {
  return `<button class="mode-card ${cur === m ? 'on' : ''}" data-mode="${m}" role="radio" aria-checked="${cur === m}">
    <span class="mp mp-${m}"><i></i><i></i><i></i></span>
    <span class="mc-l">${svg(m === 'light' ? 'sun' : m === 'dark' ? 'moon' : 'device')}${t(MODES[m])}</span></button>`;
}
function secHead(id, title) {
  const ic = CAB_SECTIONS.find((s) => s[0] === id)[1];
  return `<h2>${svg(ic)}${t(title)}</h2>`;
}
function permText() {
  if (!('Notification' in window)) return t('Браузер не поддерживает уведомления');
  if (Notification.permission === 'granted') return t('Разрешено в браузере · когда вкладка свёрнута');
  if (Notification.permission === 'denied') return t('Запрещено в настройках браузера');
  return t('Когда вкладка свёрнута · нужно разрешение браузера');
}
async function viewProfile(section) {
  stopPoll();
  try { SRV = await api('/settings'); } catch { if (!S.user) return; }
  paintProfile(section);
}
function paintProfile(section) {
  const u = S.user, p = getPrefs(), pr = programOf(u);
  const autoName = t(PALETTES[pr.palette].name);
  const srv = SRV || { settings: {}, twoFactor: false, passChangedAt: null, demo: false };
  app.innerHTML = `
    ${miniHead('Личный кабинет')}
    <div id="pagebody" class="cab">
      <aside class="cab-side">
        <div class="card profcard">
          <div class="avatar">${esc(u.firstName.charAt(0).toUpperCase())}</div>
          <div class="pf-main">
            <div class="pf-fio">${esc(u.fio)}</div>
            <div class="pf-sub">${esc(roleLabel(u))}${u.group ? ' · ' + esc(u.group) : ''}</div>
            <div class="pf-sub pf-mail">${esc(u.email)}</div>
            <span class="pill pf-uni">${svg(pr.icon)}${esc(pr.name)}</span>
          </div>
        </div>
        <nav class="cab-nav" aria-label="${t('Разделы настроек')}">
          ${CAB_SECTIONS.map(([id, ic, title]) => `<a href="#/profile/${id}" data-sec="${id}">${svg(ic)}<span>${t(title)}</span></a>`).join('')}
        </nav>
      </aside>
      <div class="cab-main">
        <section class="card set-sec" id="set-appearance">
          ${secHead('appearance', 'Оформление')}
          <div class="set-lbl">${t('Тема')}</div>
          <div class="mode-cards" role="radiogroup" aria-label="${t('Тема')}">${['light', 'dark', 'system'].map((m) => modePreview(m, p.mode)).join('')}</div>
          <div class="set-lbl">${t('Цвет сайта')}</div>
          <div class="swatches" role="radiogroup" aria-label="${t('Цвет сайта')}">
            <button class="swatch auto ${p.palette === 'auto' ? 'on' : ''}" data-pal="auto" role="radio" aria-checked="${p.palette === 'auto'}" title="${t('Авто')} · ${esc(autoName)}" style="--sw:${PALETTES[pr.palette].color}"><i></i><span>${t('Авто')}</span></button>
            ${Object.entries(PALETTES).map(([id, x]) => `<button class="swatch ${p.palette === id ? 'on' : ''}" data-pal="${id}" role="radio" aria-checked="${p.palette === id}" title="${esc(t(x.name))}" style="--sw:${x.color}"><i></i><span>${esc(t(x.name))}</span></button>`).join('')}
          </div>
          <div class="tx set-note">${esc(t('«Авто» — цвет вашей программы ({p}). Тема, цвет, размер текста и «меньше анимации» применяются и в онлайн-экзамене.', { p: pr.name }))}</div>
          ${segRow('fontSize', 'type', 'Размер текста', [['sm', t('Мелкий')], ['md', t('Обычный')], ['lg', t('Крупный')], ['xl', t('Очень крупный')]])}
          ${swRow('compact', 'device', 'Компактный режим', 'Плотнее карточки и списки')}
          ${swRow('reduceMotion', 'play', 'Меньше анимации', 'Отключить плавные переходы')}
        </section>

        <section class="card set-sec" id="set-language">
          ${secHead('language', 'Язык и регион')}
          ${segRow('lang', 'globe', 'Язык интерфейса', Object.entries(LANGS), getLang())}
          <div class="set-row"><span class="sr-ic">${svg('clock')}</span><div class="sr-t"><b>${t('Часовой пояс')}</b><span class="tx">${t('Астана, Костанай (UTC+5)')}</span></div></div>
          <div class="set-row"><span class="sr-ic">${svg('calendar')}</span><div class="sr-t"><b>${t('Начало недели')}</b><span class="tx">${esc(weekdayName(0))}</span></div></div>
        </section>

        <section class="card set-sec" id="set-notifications">
          ${secHead('notifications', 'Уведомления')}
          ${swRow('notifPush', 'bell', 'Уведомления браузера', esc(permText()), { raw: true })}
          ${u.role === 'student' ? swRow('notifGrades', 'star', 'Новые оценки', 'Когда преподаватель выставит балл') : ''}
          ${u.role === 'student' ? swRow('notifSchedule', 'calendar', 'Изменения в расписании', 'Новые занятия вашей группы') : ''}
          ${swRow('notifExam', 'clipboard', 'Экзамены', 'Когда в онлайн-экзамене открывается комната')}
          ${swRow('notifSound', 'speaker', 'Звук', 'Звуковой сигнал уведомлений')}
          ${linkRow('bell', 'Проверить уведомление', esc(t('Показать тестовое уведомление')), 'testNotif')}
          ${swRow('notifEmail', 'send', 'Email-рассылка', esc(t('Недоступно: на сервере не настроена отправка почты')), { locked: false, raw: true })}
        </section>

        <section class="card set-sec" id="set-security">
          ${secHead('security', 'Безопасность')}
          ${linkRow('lock', 'Сменить пароль', esc(srv.passChangedAt ? t('Последнее изменение: {d}', { d: fmtWhen(srv.passChangedAt) }) : t('Последнее изменение: при регистрации')), 'password')}
          ${linkRow('shield', 'Двухфакторная аутентификация', esc(srv.twoFactor ? t('Включена · код из приложения при входе') : t('Выключена · код из приложения при входе')), 'twofa')}
          ${swRow('loginAlerts', 'bell', 'Оповещать о новом входе', 'Уведомление в портале при входе с нового устройства')}
          ${linkRow('device', 'Активные сеансы', esc(t('Устройства, где выполнен вход')), 'sessions')}
        </section>

        <section class="card set-sec" id="set-privacy">
          ${secHead('privacy', 'Конфиденциальность')}
          ${u.role === 'student' ? swRow('showInRating', 'chart', 'Показывать меня в рейтинге группы', 'Если выключить — одногруппники увидят строку без имени') : ''}
          ${swRow('showOnline', 'users', 'Статус «в сети»', u.role === 'student' ? 'Видно преподавателям и группе' : 'Видно студентам в сообщениях')}
          ${linkRow('download', 'Скачать мои данные', esc(t('Оценки, расписание, профиль')) + ' · JSON', 'export')}
        </section>

        <section class="card set-sec" id="set-account">
          ${secHead('account', 'Аккаунт')}
          ${linkRow('info', 'О приложении', 'KU Portal v1.4', 'about')}
          ${linkRow('trash', 'Удалить аккаунт', esc(srv.demo ? t('Тестовый аккаунт удалить нельзя') : t('Безвозвратно, с подтверждением паролем')), 'delete', 'danger')}
          <button class="btn danger-ghost cab-out" id="outBtn">${t('Выйти из аккаунта')}</button>
        </section>
      </div>
    </div>
    ${navHTML('profile')}`;

  const pb = document.getElementById('pagebody');
  const rerender = () => { const y = window.scrollY; paintProfile(); window.scrollTo(0, y); };
  pb.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { setPref('mode', b.dataset.mode); rerender(); }));
  pb.querySelectorAll('[data-pal]').forEach((b) => (b.onclick = () => { setPref('palette', b.dataset.pal); rerender(); }));
  pb.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => {
    if (b.dataset.seg === 'lang') setLang(b.dataset.v); // язык — настройка устройства (i18n.js)
    else setPref(b.dataset.seg, b.dataset.v);
    rerender();
  }));
  pb.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = async () => {
    if (b.disabled) return;
    const key = b.dataset.sw, on = !b.classList.contains('on');
    const paint = (v) => { b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); };
    if (key === 'notifPush' && on && !(await askNotifPermission())) { rerender(); return; }
    paint(on);
    if (SRV_KEYS.includes(key)) {
      try { SRV.settings = (await api('/settings', { method: 'POST', body: { [key]: on } })).settings; }
      catch (e) { paint(!on); toast(e.message, true); }
    } else {
      setPref(key, on);
      if (key === 'notifPush') rerender();
      if (key === 'notifExam' && on) { NOTIF.examOpen = null; pollExams(); }
    }
  }));
  pb.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'about') toast('KU Portal v1.4 · ' + pr.name);
    else if (a === 'testNotif') testNotif();
    else if (a === 'password') changePasswordDlg(rerender);
    else if (a === 'twofa') twoFactorDlg(rerender);
    else if (a === 'sessions') sessionsDlg();
    else if (a === 'export') exportData();
    else if (a === 'delete') deleteAccountDlg();
  }));
  // оглавление: плавный переход к разделу без перерисовки страницы
  pb.querySelectorAll('[data-sec]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const el = document.getElementById('set-' + a.dataset.sec);
    if (el) el.scrollIntoView({ block: 'start', behavior: getPrefs().reduceMotion ? 'auto' : 'smooth' });
    history.replaceState(null, '', '#/profile/' + a.dataset.sec);
    markSec(a.dataset.sec);
  }));
  const markSec = (id) => pb.querySelectorAll('[data-sec]').forEach((a) => a.classList.toggle('on', a.dataset.sec === id));
  markSec(section || 'appearance');
  document.getElementById('outBtn').onclick = logout;
  if (section) { const el = document.getElementById('set-' + section); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
}

/* ---------- Диалоги раздела «Безопасность» / «Конфиденциальность» / «Аккаунт» ---------- */
const formErr = (box, m) => { const e = box.querySelector('.err'); if (e) e.textContent = m || ''; };
function changePasswordDlg(done) {
  modal(t('Сменить пароль'), `
    <input class="inp" id="pwCur" type="password" autocomplete="current-password" placeholder="${t('Текущий пароль')}">
    <input class="inp" id="pwNew" type="password" autocomplete="new-password" placeholder="${t('Новый пароль (мин. 8 символов)')}">
    <input class="inp" id="pwNew2" type="password" autocomplete="new-password" placeholder="${t('Повторите новый пароль')}">
    <div class="tx">${t('После смены пароля вход на других устройствах будет завершён.')}</div>
    <div class="err"></div>
    <button class="btn pri" id="pwSave">${t('Сохранить')}</button>`, (box, close) => {
    box.querySelector('#pwSave').onclick = async () => {
      const cur = box.querySelector('#pwCur').value, nx = box.querySelector('#pwNew').value;
      if (nx !== box.querySelector('#pwNew2').value) return formErr(box, t('Пароли не совпадают'));
      try {
        const d = await api('/auth/password', { method: 'POST', body: { current: cur, next: nx } });
        if (SRV) SRV.passChangedAt = d.passChangedAt;
        if (S.user) S.user.mustChangePassword = false;
        close(); toast(t('Пароль изменён')); done && done();
      } catch (e) { formErr(box, e.message); }
    };
  });
}
function twoFactorDlg(done) {
  if (SRV && SRV.twoFactor) {
    return modal(t('Двухфакторная аутентификация'), `
      <div class="tx">${t('Чтобы выключить, введите пароль от аккаунта.')}</div>
      <input class="inp" id="tfPass" type="password" autocomplete="current-password" placeholder="${t('Пароль')}">
      <div class="err"></div>
      <button class="btn danger-ghost" id="tfOff">${t('Выключить')}</button>`, (box, close) => {
      box.querySelector('#tfOff').onclick = async () => {
        try { await api('/2fa/disable', { method: 'POST', body: { password: box.querySelector('#tfPass').value } }); SRV.twoFactor = false; close(); toast(t('Двухфакторная аутентификация выключена')); done && done(); }
        catch (e) { formErr(box, e.message); }
      };
    });
  }
  modal(t('Двухфакторная аутентификация'), `<div class="load">${t('Загрузка…')}</div>`, async (box, close) => {
    try {
      const d = await api('/2fa/setup', { method: 'POST', body: {} });
      box.innerHTML = `
        <ol class="tf-steps">
          <li>${t('Установите приложение-аутентификатор: Google Authenticator, Microsoft Authenticator, Aegis и т.п.')}</li>
          <li>${t('Добавьте аккаунт по ключу (ввести вручную) или откройте ссылку на телефоне:')}
            <div class="tf-key" id="tfKey">${esc(d.secret.replace(/(.{4})/g, '$1 ').trim())}</div>
            <div class="row2"><button class="btn ghost" id="tfCopy">${t('Скопировать ключ')}</button><a class="btn ghost" href="${esc(d.uri)}">${t('Открыть в приложении')}</a></div></li>
          <li>${t('Введите 6-значный код из приложения:')}</li>
        </ol>
        <input class="inp" id="tfCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">
        <div class="err"></div>
        <button class="btn pri" id="tfOn">${t('Включить')}</button>`;
      box.querySelector('#tfCopy').onclick = () => { try { navigator.clipboard.writeText(d.secret); toast(t('Ключ скопирован')); } catch { } };
      const on = async () => {
        try { await api('/2fa/enable', { method: 'POST', body: { code: box.querySelector('#tfCode').value } }); SRV.twoFactor = true; close(); toast(t('Двухфакторная аутентификация включена')); done && done(); }
        catch (e) { formErr(box, e.message); }
      };
      box.querySelector('#tfOn').onclick = on;
      box.querySelector('#tfCode').onkeydown = (e) => { if (e.key === 'Enter') on(); };
    } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  });
}
function sessionsDlg() {
  modal(t('Активные сеансы'), `<div class="load">${t('Загрузка…')}</div>`, async function paint(box) {
    try {
      const d = await api('/sessions');
      const others = d.items.filter((x) => !x.current).length + (d.legacy || 0);
      box.innerHTML = `<div class="sess">${d.items.map((x) => `
        <div class="sess-it">
          <span class="sr-ic">${svg('device')}</span>
          <div class="sr-t"><b>${esc(x.device || t('Неизвестное устройство'))}${x.current ? ` <span class="pill">${t('Это устройство')}</span>` : ''}</b>
            <span class="tx">${esc([x.ip, t('активность: {d}', { d: fmtWhen(x.lastSeen) })].filter(Boolean).join(' · '))}</span></div>
          ${x.current ? '' : `<button class="btn ghost sm" data-rv="${esc(x.sid)}">${t('Завершить')}</button>`}
        </div>`).join('')}</div>
        ${d.legacy ? `<div class="tx">${t('Ещё сеансов без сведений об устройстве: {n}', { n: d.legacy })}</div>` : ''}
        ${others ? `<button class="btn danger-ghost" id="rvAll" style="margin-top:10px">${t('Завершить все другие сеансы')}</button>` : `<div class="tx" style="margin-top:8px">${t('Других активных сеансов нет.')}</div>`}`;
      box.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = async () => { try { await api('/sessions/revoke', { method: 'POST', body: { sid: b.dataset.rv } }); toast(t('Сеанс завершён')); paint(box); } catch (e) { toast(e.message, true); } }));
      const all = box.querySelector('#rvAll');
      if (all) all.onclick = async () => { try { const r = await api('/sessions/revoke', { method: 'POST', body: { all: true } }); toast(t('Завершено сеансов: {n}', { n: r.revoked })); paint(box); } catch (e) { toast(e.message, true); } };
    } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  });
}
async function exportData() {
  try {
    const r = await fetch(API_BASE + '/api/export', { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok) throw new Error(t('Не удалось скачать данные'));
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ku-portal-${S.user.id}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('Файл с данными скачан'));
  } catch (e) { toast(e.message, true); }
}
function deleteAccountDlg() {
  if (SRV && SRV.demo) return toast(t('Тестовый аккаунт удалить нельзя'), true);
  modal(t('Удалить аккаунт'), `
    <div class="tx">${t('Аккаунт, оценки и настройки будут удалены безвозвратно. Для подтверждения введите пароль.')}</div>
    <input class="inp" id="delPass" type="password" autocomplete="current-password" placeholder="${t('Пароль')}">
    <div class="err"></div>
    <button class="btn danger-ghost" id="delGo">${t('Удалить навсегда')}</button>`, (box, close) => {
    box.querySelector('#delGo').onclick = async () => {
      try {
        await api('/account/delete', { method: 'POST', body: { password: box.querySelector('#delPass').value } });
        close();
        try { localStorage.removeItem(prefsKey()); localStorage.removeItem('ku_theme'); } catch { }
        localStorage.removeItem('ku_token'); S.token = null; S.user = null; SRV = null; stopNotif();
        toast(t('Аккаунт удалён')); goHome();
      } catch (e) { formErr(box, e.message); }
    };
  });
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { }
  localStorage.removeItem('ku_token'); S.token = null; S.user = null; stopNotif(); goHome();
}
