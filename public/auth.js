'use strict';
/* KU Portal — вход, регистрация, двухфакторный код и восстановление пароля по почте (сервер — server/recovery.js).
 * Обычный скрипт: подключается в index.html перед app.js и пользуется его хелперами (svg, esc, t, api, toast, modal, S, app…)
 * только во время вызова. */
/* ============================ Аутентификация ============================ */
let authTab = 'login', authRole = 'student', authProgram = 'ku';
/* Справочник групп для регистрации студента (GET /api/groups, server/groups.js): ИСУ и БТ, наборы 2023–2026, по 3 группы */
let groupCatalog = null, groupCatalogRequest = null, groupCatalogError = false;
function loadGroupCatalog() {
  if (groupCatalog !== null) return Promise.resolve(groupCatalog);
  if (groupCatalogRequest) return groupCatalogRequest;
  groupCatalogRequest = api('/groups').then((d) => { groupCatalog = d.groups || []; groupCatalogError = false; return groupCatalog; }, (error) => {
    groupCatalogError = true;
    throw error;
  }).finally(() => { groupCatalogRequest = null; });
  return groupCatalogRequest;
}
function groupSelectHTML() {
  const by = {};
  for (const g of groupCatalog || []) { const m = /^(\D+)(\d{4})-/.exec(g); if (m) (by[`${m[1]} · ${t('набор {y}', { y: m[2] })}`] = by[`${m[1]} · ${t('набор {y}', { y: m[2] })}`] || []).push(g); }
  return `<select class="inp" id="rGroup" aria-label="${t('Группа')}" required><option value="">${t(groupCatalog !== null ? 'Выберите группу' : 'Загрузка…')}</option>
    ${Object.entries(by).map(([label, list]) => `<optgroup label="${esc(label)}">${list.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}</optgroup>`).join('')}</select>`;
}
function groupBlockHTML() {
  if (groupCatalogError) return `<div class="lbl" role="alert">${t('Не удалось загрузить список групп. Проверьте соединение и попробуйте ещё раз.')}</div><button type="button" class="btn ghost" id="retryGroups">${t('Повторить загрузку')}</button>`;
  return `${groupSelectHTML()}<label class="lbl">${t('Оценки и расписание появятся, когда преподаватель добавит их для вашей группы')}</label>`;
}
function refreshGroupBlock() {
  const wrap = document.getElementById('grpWrap');
  if (!wrap || authRole !== 'student') return;
  wrap.innerHTML = groupBlockHTML();
  const retry = document.getElementById('retryGroups');
  if (retry) retry.onclick = () => { groupCatalogError = false; refreshGroupBlock(); loadGroupCatalog().then(refreshGroupBlock, refreshGroupBlock); };
}
function viewAuth(msg) {
  stopPoll();
  app.innerHTML = `
  <div class="auth">
    <div class="logo">
      <div class="mark brand-mark"><img src="bird-idle.png" alt="" /></div>
      <div>
        <h1>KU Portal</h1>
        <div class="sub">Kozybayev University</div>
      </div>
    </div>
    <div class="seg2 txt auth-lang" role="radiogroup" aria-label="${t('Язык')}">${Object.entries(LANGS).map(([k, n]) => `<button role="radio" lang="${k}" aria-checked="${getLang() === k}" class="${getLang() === k ? 'on' : ''}" data-lang="${k}">${n}</button>`).join('')}</div>
    <div class="tabs">
      <button id="tabLogin" class="${authTab === 'login' ? 'on' : ''}">${t('Вход')}</button>
      <button id="tabReg" class="${authTab === 'reg' ? 'on' : ''}">${t('Регистрация')}</button>
    </div>
    <div id="authform"></div>
    <div class="err" id="autherr">${msg ? esc(msg) : ''}</div>
    <div id="demoBox"></div>
  </div>`;
  renderAuthForm();
  renderDemoBox();
  app.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); viewAuth(); }));
  document.getElementById('tabLogin').onclick = () => { authTab = 'login'; viewAuth(); };
  document.getElementById('tabReg').onclick = () => { authTab = 'reg'; viewAuth(); };
}
function renderAuthForm() {
  const box = document.getElementById('authform');
  if (authTab === 'login') {
    box.innerHTML = `
      <input class="inp" id="liIdentifier" type="text" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="${t('Email или логин (например ISU6576)')}">
      <input class="inp" id="liPass" type="password" required autocomplete="current-password" placeholder="${t('Пароль')}">
      <button class="btn pri" id="liBtn">${t('Войти')}</button>
      <div style="text-align:center;margin-top:10px"><a href="#/forgot" id="liForgot" class="muted">${t('Забыли пароль?')}</a></div>`;
    document.getElementById('liBtn').onclick = doLogin;
    document.getElementById('liForgot').onclick = (e) => {
      e.preventDefault();
      const value = document.getElementById('liIdentifier').value.trim();
      viewForgot(value.includes('@') ? value : '');
    };
    document.getElementById('liPass').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
  } else {
    box.innerHTML = `
      <input class="inp" id="rLast" required maxlength="100" autocomplete="family-name" placeholder="${t('Фамилия')}">
      <input class="inp" id="rFirst" required maxlength="100" autocomplete="given-name" placeholder="${t('Имя')}">
      <input class="inp" id="rMid" maxlength="100" autocomplete="additional-name" placeholder="${t('Отчество (необязательно)')}">
      <input class="inp" id="rEmail" type="email" required maxlength="254" autocomplete="email" placeholder="Email">
      <input class="inp" id="rPass" type="password" required minlength="8" maxlength="256" autocomplete="new-password" placeholder="${t('Пароль (мин. 8 символов)')}">
      <label class="lbl">${t('Роль')}</label>
      <div class="chips">
        <button class="chip ${authRole === 'student' ? 'on' : ''}" id="chStud">${t('Студент')}</button>
        <button class="chip ${authRole === 'teacher' ? 'on' : ''}" id="chTeach">${t('Преподаватель')}</button>
        <button class="chip ${authRole === 'staff' ? 'on' : ''}" id="chStaff">${t('Сотрудник')}</button>
      </div>
      ${authRole === 'staff' ? `<label class="lbl">${t('Для менеджеров и руководителей клубов. Обязанности назначит администратор портала')}</label>` : ''}
      <label class="lbl">${t('Программа')}</label>
      <div class="chips">
        <button class="chip ${authProgram === 'ku' ? 'on' : ''}" id="chKU">Kozybayev University</button>
        <button class="chip ${authProgram === 'arizona' ? 'on' : ''}" id="chAZ">University of Arizona</button>
      </div>
      <div id="grpWrap">${authRole === 'student' ? groupBlockHTML() : ''}</div>
      <button class="btn pri" id="rBtn">${t('Создать аккаунт')}</button>`;
    document.getElementById('chStud').onclick = () => { authRole = 'student'; renderAuthForm(); };
    document.getElementById('chTeach').onclick = () => { authRole = 'teacher'; renderAuthForm(); };
    document.getElementById('chStaff').onclick = () => { authRole = 'staff'; renderAuthForm(); };
    // Выбор программы — без перерисовки формы, чтобы не стереть введённые поля
    const pickProgram = (pr) => {
      authProgram = pr;
      document.getElementById('chKU').classList.toggle('on', pr === 'ku');
      document.getElementById('chAZ').classList.toggle('on', pr === 'arizona');
    };
    document.getElementById('chKU').onclick = () => pickProgram('ku');
    document.getElementById('chAZ').onclick = () => pickProgram('arizona');
    document.getElementById('rBtn').onclick = doRegister;
    // список групп приходит с сервера один раз — подставить, не трогая уже введённые поля
    if (authRole === 'student' && groupCatalog === null && !groupCatalogError) loadGroupCatalog().then(refreshGroupBlock, refreshGroupBlock);
  }
}
/* Блок быстрого входа в тестовые аккаунты (если сервер запущен с демо-данными) */
let demoInfo = null;
async function renderDemoBox() {
  try { if (!demoInfo) demoInfo = await api('/demo'); } catch { return; }
  const box = document.getElementById('demoBox');
  if (!box || !demoInfo.enabled) return;
  const TRACK = { it: 'IT', bio: 'Биотехнологии', lang: 'Языки' };
  const btn = (a) => `<button class="demo-acc" data-demo="${esc(a.email)}">
      <span class="demo-ava ${a.role}">${esc(a.fio.split(' ').map((w) => w[0]).reverse().join(''))}</span>
      <span class="demo-t"><b>${esc(a.fio)}</b><small>${esc([a.group || t('Преподаватель'), a.track ? t(TRACK[a.track]) : ''].filter(Boolean).join(' · '))}</small></span></button>`;
  box.innerHTML = `
    <div class="demo-box">
      <b>${t('Бета-аккаунты')}</b>
      <div class="tx">${esc(t('Пароль у всех: {p}. Группы ИСУ — направление IT, группы БТ — биотехнологии.', { p: demoInfo.password }))}</div>
      <div class="demo-lbl">${t('Студенты')}</div>
      <div class="demo-grid">${demoInfo.accounts.filter((a) => a.role === 'student').map(btn).join('')}</div>
      <div class="demo-lbl">${t('Преподаватели')}</div>
      <div class="demo-grid">${demoInfo.accounts.filter((a) => a.role === 'teacher').map(btn).join('')}</div>
    </div>`;
  box.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = async () => {
    authErr('');
    try { await loginWith(b.dataset.demo, demoInfo.password); } catch (e) { authErr(e.message); }
  }));
}
function authErr(m) { const e = document.getElementById('autherr'); if (e) e.textContent = m; }
/* Идентификатор устройства (для оповещения о входе с нового устройства) — случайный, хранится в браузере */
function deviceId() {
  try {
    let d = localStorage.getItem('ku_device');
    if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('ku_device', d); }
    return d;
  } catch { return ''; }
}
/* Вход: пароль → (если включена двухфакторная аутентификация) код из приложения-аутентификатора */
async function loginWith(identifier, password, code) {
  const d = await api('/auth/login', { method: 'POST', body: { identifier, password, code, deviceId: deviceId() } });
  if (d.need2fa) return showCodeStep(identifier, password);
  S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; goHome();
}
function showCodeStep(identifier, password) {
  const box = document.getElementById('authform');
  if (!box) return;
  authErr('');
  box.innerHTML = `
    <div class="tx code-hint">${t('Введите 6-значный код из приложения-аутентификатора')}</div>
    <input class="inp" id="liCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">
    <button class="btn pri" id="liCodeBtn">${t('Подтвердить')}</button>
    <button class="btn ghost" id="liCodeBack" style="margin-top:8px">${t('Назад')}</button>`;
  const go = async () => { authErr(''); try { await loginWith(identifier, password, v('liCode')); } catch (e) { authErr(e.message); } };
  document.getElementById('liCodeBtn').onclick = go;
  document.getElementById('liCode').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  document.getElementById('liCodeBack').onclick = () => viewAuth();
  document.getElementById('liCode').focus();
}
function goHome() { if (location.hash === '#/' || !location.hash) route(); else location.hash = '#/'; }
async function doLogin() {
  authErr('');
  for (const id of ['liIdentifier', 'liPass']) { const field = document.getElementById(id); if (field && !field.reportValidity()) return; }
  try { await loginWith(v('liIdentifier'), v('liPass')); } catch (e) { authErr(e.message); }
}
async function doRegister() {
  authErr('');
  const required = ['rLast', 'rFirst', 'rEmail', 'rPass'];
  if (authRole === 'student') required.push('rGroup');
  for (const id of required) { const field = document.getElementById(id); if (field && !field.reportValidity()) return; }
  try {
    const d = await api('/auth/register', {
      method: 'POST',
      body: {
        lastName: v('rLast'), firstName: v('rFirst'), middleName: v('rMid'),
        email: v('rEmail'), password: v('rPass'), role: authRole, program: authProgram, group: authRole === 'student' ? v('rGroup') : '',
        deviceId: deviceId(),
      },
    });
    if (d.pending) {
      authTab = 'login';
      viewAuth(t('Если аккаунт с этим адресом уже есть, войдите или восстановите пароль. Если аккаунта нет, заявка отправлена на подтверждение.'));
      return;
    }
    S.token = d.token; localStorage.setItem('ku_token', d.token); S.user = d.user; goHome();
  } catch (e) { authErr(e.message); }
}
function v(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

/* Восстановление пароля по почте (сервер — server/recovery.js):
   «Забыли пароль?» на экране входа → viewForgot(): email → письмо со ссылкой #/reset/<код> → viewReset(код): новый пароль.
   Если почта не дошла — пароль сбрасывает администратор портала (админ-панель → «Сбросить пароль»). */
function authShell(title, body) {
  stopPoll();
  app.innerHTML = `
  <div class="auth">
    <div class="logo">
      <div class="mark brand-mark"><img src="bird-idle.png" alt="" /></div>
      <div><h1>${t(title)}</h1><div class="sub">KU Portal</div></div>
    </div>
    ${body}
    <div class="err" id="autherr"></div>
    <div style="text-align:center;margin-top:14px"><a href="#/" id="backToLogin" class="muted">← ${t('Вернуться ко входу')}</a></div>
  </div>`;
  document.getElementById('backToLogin').onclick = (e) => { e.preventDefault(); history.replaceState(null, '', '#/'); viewAuth(); };
}
function viewForgot(email) {
  authShell('Восстановление пароля', `
    <p class="tx" style="margin-bottom:12px">${t('Укажите email, с которым вы зарегистрированы. Мы отправим ссылку для нового пароля — она действует 1 час.')}</p>
    <input class="inp" id="fgEmail" type="email" required maxlength="254" autocomplete="email" placeholder="Email" value="${esc(email || '')}">
    <button class="btn pri" id="fgBtn">${t('Отправить ссылку')}</button>`);
  const send = async () => {
    const btn = document.getElementById('fgBtn'), value = document.getElementById('fgEmail').value.trim();
    if (!document.getElementById('fgEmail').reportValidity()) return;
    authErr(''); btn.disabled = true;
    try {
      await api('/auth/forgot', { method: 'POST', body: { email: value } });
      authShell('Проверьте почту', `<p class="tx">${esc(t('Если {e} зарегистрирован в портале, на него придёт письмо со ссылкой. Проверьте и папку «Спам». Письма нет за 10 минут — обратитесь к администратору портала, он выдаст временный пароль.', { e: value }))}</p>`);
    } catch (e) { authErr(e.message); btn.disabled = false; }
  };
  document.getElementById('fgBtn').onclick = send;
  document.getElementById('fgEmail').onkeydown = (e) => { if (e.key === 'Enter') send(); };
}
function viewReset(token) {
  authShell('Новый пароль', `
    <input class="inp" id="rsPass" type="password" required minlength="8" maxlength="256" autocomplete="new-password" placeholder="${t('Новый пароль (мин. 8 символов)')}">
    <input class="inp" id="rsPass2" type="password" required minlength="8" maxlength="256" autocomplete="new-password" placeholder="${t('Повторите пароль')}">
    <button class="btn pri" id="rsBtn">${t('Сохранить пароль')}</button>`);
  const save = async () => {
    const btn = document.getElementById('rsBtn'), password = document.getElementById('rsPass').value;
    if (!document.getElementById('rsPass').reportValidity() || !document.getElementById('rsPass2').reportValidity()) return;
    if (password !== document.getElementById('rsPass2').value) return authErr(t('Пароли не совпадают'));
    authErr(''); btn.disabled = true;
    try {
      const d = await api('/auth/reset', { method: 'POST', body: { token, password } });
      history.replaceState(null, '', '#/');
      authTab = 'login'; viewAuth();
      const field = document.getElementById('liIdentifier'); if (field) field.value = d.email || '';
      toast(t('Пароль изменён. Войдите с новым паролем'));
    } catch (e) { authErr(e.message); btn.disabled = false; }
  };
  document.getElementById('rsBtn').onclick = save;
  document.getElementById('rsPass2').onkeydown = (e) => { if (e.key === 'Enter') save(); };
}
