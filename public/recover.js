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
    <input class="inp" id="fgEmail" type="email" autocomplete="email" placeholder="Email" value="${esc(email || '')}">
    <button class="btn pri" id="fgBtn">${t('Отправить ссылку')}</button>`);
  const send = async () => {
    const btn = document.getElementById('fgBtn'), value = document.getElementById('fgEmail').value.trim();
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
    <input class="inp" id="rsPass" type="password" autocomplete="new-password" placeholder="${t('Новый пароль (мин. 8 символов)')}">
    <input class="inp" id="rsPass2" type="password" autocomplete="new-password" placeholder="${t('Повторите пароль')}">
    <button class="btn pri" id="rsBtn">${t('Сохранить пароль')}</button>`);
  const save = async () => {
    const btn = document.getElementById('rsBtn'), password = document.getElementById('rsPass').value;
    if (password !== document.getElementById('rsPass2').value) return authErr(t('Пароли не совпадают'));
    authErr(''); btn.disabled = true;
    try {
      const d = await api('/auth/reset', { method: 'POST', body: { token, password } });
      history.replaceState(null, '', '#/');
      authTab = 'login'; viewAuth();
      const field = document.getElementById('liEmail'); if (field) field.value = d.email || '';
      toast(t('Пароль изменён. Войдите с новым паролем'));
    } catch (e) { authErr(e.message); btn.disabled = false; }
  };
  document.getElementById('rsBtn').onclick = save;
  document.getElementById('rsPass2').onkeydown = (e) => { if (e.key === 'Enter') save(); };
}
