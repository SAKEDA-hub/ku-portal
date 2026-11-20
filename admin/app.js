'use strict';
/* Админ-панель KU Portal (/admin/): вход по сеансу портала (localStorage ku_token), API /api/admin/* (server/admin.js) */
const app = document.getElementById('app');
const dlg = document.getElementById('dlg');
const dlgForm = document.getElementById('dlg-form');
const token = (() => { try { return localStorage.getItem('ku_token') || ''; } catch { return ''; } })();
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { student: 'Студент', teacher: 'Преподаватель', staff: 'Сотрудник' };
const TABS = [['pending', 'Ожидают подтверждения'], ['all', 'Все'], ['student', 'Студенты'], ['teacher', 'Преподаватели'], ['staff', 'Сотрудники']];
let data = null, query = '', help = [];
const HELP_CATS = { question: 'Вопрос', schedule: 'Расписание', tech: 'Технический сбой', other: 'Другое' };
const HELP_ST = { new: 'новое', work: 'в работе', done: 'решено', rejected: 'отклонено' };
let tab = TABS.some(([id]) => '#' + id === location.hash) ? location.hash.slice(1) : 'pending'; // вкладка в адресе: /admin/#all

class ConfirmNeeded extends Error {}
async function api(path, body) {
  const options = { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
  if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch('/api/admin/' + path, options);
  if (path === 'backup' && response.ok) return response.blob();
  const value = await response.json().catch(() => ({}));
  if (response.status === 403 && value.needConfirm) throw new ConfirmNeeded(value.error);
  if (!response.ok) { const error = new Error(value.error || 'Ошибка сервера'); error.status = response.status; throw error; }
  return value;
}
function toast(text, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' err' : ''); el.textContent = text; el.setAttribute('role', 'status');
  document.body.appendChild(el); setTimeout(() => el.remove(), 3500);
}
const fmtDate = ms => (ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/* Диалог: html — содержимое формы, onSubmit(form) → false, чтобы не закрывать; Error — текст ошибки в форме */
function openDialog(html, onSubmit) {
  dlgForm.innerHTML = html + '<p class="error" id="dlg-err"></p>';
  dlgForm.onsubmit = async event => {
    event.preventDefault();
    const buttons = dlgForm.querySelectorAll('button'); buttons.forEach(b => { b.disabled = true; });
    try { if (await onSubmit(dlgForm) !== false) dlg.close(); }
    catch (error) { const err = dlgForm.querySelector('#dlg-err'); if (err && dlg.open) err.textContent = error.message; else toast(error.message, true); }
    finally { dlgForm.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  };
  // «Отмена» — type="button": Enter в поле нажимает основную кнопку, а не отмену (раньше Enter отменял действие)
  dlgForm.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => dlg.close()));
  if (!dlg.open) dlg.showModal();
  const first = dlgForm.querySelector('input:not([type=checkbox]),select'); if (first) first.focus();
}
const cancelBtn = '<button type="button" class="secondary" data-cancel>Отмена</button>';

/* Пароль администратора раз в час — для любых изменений и копии базы (украденного сеанса недостаточно) */
function askConfirm() {
  return new Promise(resolve => {
    let done = false;
    openDialog(`<h2>Подтвердите, что это вы</h2><p class="muted">Введите свой пароль от портала. Повторно спрашивать не будем в течение часа.</p>
      <input type="password" name="password" autocomplete="current-password" required placeholder="Ваш пароль">
      <div class="row">${cancelBtn}<button>Подтвердить</button></div>`, async form => {
      await api('confirm', { password: form.password.value });
      done = true; resolve(true);
    });
    dlg.addEventListener('close', () => { if (!done) resolve(false); }, { once: true });
  });
}
async function sensitive(path, body) {
  try { return await api(path, body); } catch (error) {
    if (!(error instanceof ConfirmNeeded)) throw error;
    if (!(await askConfirm())) return null;
    return api(path, body);
  }
}

async function load() {
  try {
    [data, { items: help }] = await Promise.all([api('users'), api('help').catch(error => { toast('Обращения не загрузились: ' + error.message, true); return { items: [] }; })]);
    render();
  } catch (error) {
    if (error.status === 401 || !token) { app.innerHTML = `<section class="card"><h1>Нужен вход</h1><div class="notice">Войдите в KU Portal, затем откройте админ-панель снова.</div><p><a href="/">Перейти к входу →</a></p></section>`; return; }
    app.innerHTML = `<section class="card"><h1>Нет доступа</h1><div class="notice">${esc(error.message)}</div><p><a href="/">← Вернуться в KU Portal</a></p></section>`;
  }
}

function matches(u) {
  if (tab === 'pending' && u.access) return false;
  if (['student', 'teacher', 'staff'].includes(tab) && u.role !== tab) return false;
  if (!query) return true;
  return [u.fio, u.email, u.group, u.id, ...(u.groups || [])].join(' ').toLowerCase().includes(query);
}
function permsText(p) {
  return [p.admin ? 'админ-панель' : '', p.clubs.includes('*') ? 'все клубы' : p.clubs.length ? 'клубы: ' + p.clubs.map(id => (data.clubs.find(c => c.id === id) || { name: id }).name).join(', ') : '', p.dorm ? 'общежитие' : '', p.results ? 'учебная база' : ''].filter(Boolean).join(' · ');
}
function userRow(u) {
  const me = u.id === data.me;
  const pills = [
    `<span class="pill">${ROLE[u.role] || esc(u.role)}</span>`,
    u.access ? '<span class="pill ok">доступ открыт</span>' : '<span class="pill wait">ждёт подтверждения</span>',
    u.role === 'student' && u.group ? `<span class="pill">${esc(u.group)}</span>` : '',
    u.role === 'teacher' ? `<span class="pill">${u.groups.length ? 'группы: ' + esc(u.groups.join(', ')) : 'группы не назначены'}</span>` : '',
    permsText(u.perms) ? `<span class="pill">${esc(permsText(u.perms))}</span>` : '',
    u.twoFactor ? '<span class="pill">2FA</span>' : '',
    u.mustChangePassword ? '<span class="pill wait">временный пароль</span>' : '',
    u.online ? '<span class="pill ok">в сети</span>' : '',
    me ? '<span class="pill">это вы</span>' : '',
  ].join('');
  const act = (name, label, cls = 'secondary') => `<button class="${cls}" data-act="${name}" data-id="${esc(u.id)}">${label}</button>`;
  // другого администратора панель не меняет — только команды на сервере (защита от захвата одним аккаунтом)
  const otherAdmin = !me && u.perms.admin;
  const actions = otherAdmin ? '<span class="muted" style="font-size:13px">Администратор — изменения только командой на сервере</span>' : [
    u.access ? (me ? '' : act('revoke', 'Закрыть доступ')) : act('approve', 'Подтвердить', ''),
    u.role === 'teacher' ? act('groups', 'Группы') : '',
    act('perms', 'Права'),
    me ? '' : act('reset', 'Сбросить пароль'),
    me ? '' : act('delete', 'Удалить', 'danger'),
  ].join('');
  return `<div class="user"><div><div class="name">${esc(u.fio)}</div>
    <div class="sub">${esc(u.email)} · ${esc(u.id)} · регистрация ${fmtDate(u.createdAt)} · был(а) ${fmtDate(u.lastSeen)}</div>
    <div class="pills">${pills}</div></div><div class="actions">${actions}</div></div>`;
}
function paintList() {
  const shown = data.items.filter(matches);
  document.getElementById('list').innerHTML = shown.length ? shown.map(userRow).join('')
    : `<p class="muted">${tab === 'pending' && !query ? 'Новых заявок нет.' : 'Никого не найдено.'}</p>`;
}
function render() {
  const items = data.items, pending = items.filter(u => !u.access).length;
  const count = role => items.filter(u => u.role === role).length;
  app.innerHTML = `
    <section class="card"><h1>Администрирование портала</h1>
      <div class="stats">
        <div class="stat"><b>${items.length}</b><span class="muted">пользователей</span></div>
        <div class="stat"><b>${pending}</b><span class="muted">ждут подтверждения</span></div>
        <div class="stat"><b>${count('student')}</b><span class="muted">студентов</span></div>
        <div class="stat"><b>${count('teacher')}</b><span class="muted">преподавателей</span></div>
      </div>
      <div class="toolbar" style="margin-top:14px"><button class="secondary" id="backup">Скачать копию базы</button><button class="secondary" id="reload">Обновить</button></div>
    </section>
    <section class="card">
      <div class="toolbar"><input type="search" id="q" placeholder="Поиск: ФИО, email, группа, ID" value="${esc(query)}"></div>
      <div class="tabs">${TABS.map(([id, label]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${label}${id === 'pending' && pending ? ` (${pending})` : ''}</button>`).join('')}</div>
      <div id="list"></div>
    </section>
    <section class="card" id="help"></section>`;
  paintList();
  paintHelp();
  document.getElementById('q').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); paintList(); });
  app.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); render(); }));
  document.getElementById('reload').addEventListener('click', load);
  document.getElementById('backup').addEventListener('click', downloadBackup);
}
/* Обращения преподавателей (server/help.js): новые и в работе — сверху, ответ — диалогом со статусом */
function paintHelp() {
  const box = document.getElementById('help'); if (!box) return;
  const open = help.filter(r => r.status === 'new' || r.status === 'work').length;
  box.innerHTML = `<h2>Обращения преподавателей${open ? ` <span class="pill wait">${open} открыто</span>` : ''}</h2>
    ${help.length ? help.map(r => `<div class="user"><div>
        <div class="name">${esc(HELP_CATS[r.category] || r.category)} · ${esc(r.fio)}</div>
        <div class="sub">${esc(r.email)} · ${fmtDate(r.at)}</div>
        <p class="help-text">${esc(r.text)}</p>
        ${r.reply ? `<p class="help-text muted">Ответ: ${esc(r.reply)}</p>` : ''}
        <div class="pills"><span class="pill ${r.status === 'new' ? 'wait' : r.status === 'done' ? 'ok' : ''}">${HELP_ST[r.status] || r.status}</span></div>
      </div><div class="actions"><button class="secondary" data-help="${esc(r.id)}">Ответить</button></div></div>`).join('')
      : '<p class="muted">Обращений пока нет.</p>'}`;
}
function replyHelp(r) {
  openDialog(`<h2>Ответ на обращение</h2><p>${esc(r.fio)} · ${esc(HELP_CATS[r.category] || '')}</p>
    <p class="help-text">${esc(r.text)}</p>
    <label>Статус<select name="status">${Object.entries(HELP_ST).map(([k, l]) => `<option value="${k}" ${k === (r.status === 'new' ? 'work' : r.status) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Ответ (преподаватель увидит его в портале)<textarea name="reply" rows="4" maxlength="2000">${esc(r.reply)}</textarea></label>
    <div class="row">${cancelBtn}<button>Отправить</button></div>`, async form => {
    if (await sensitive('help/reply', { id: r.id, status: form.status.value, reply: form.reply.value })) { toast('Ответ отправлен'); load(); }
  });
}
app.addEventListener('click', event => {
  const hb = event.target.closest('[data-help]');
  if (hb) { const r = help.find(x => x.id === hb.dataset.help); if (r) replyHelp(r); return; }
  const button = event.target.closest('[data-act]');
  if (!button || !data) return;
  const user = data.items.find(u => u.id === button.dataset.id);
  if (user) ACTIONS[button.dataset.act](user);
});

async function downloadBackup() {
  let blob;
  try { blob = await sensitive('backup', {}); } catch (error) { toast(error.message, true); return; }
  if (!blob) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `ku-portal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('Копия скачана. Храните файл в надёжном месте: в нём хеши паролей и переписка.');
}

const groupsField = value => `<label>Группы, которые ведёт преподаватель (через запятую)<input type="text" name="groups" list="groups-list" value="${esc(value)}" placeholder="ИСУ-26-2-а, БТ-26-1-а"></label>
  <datalist id="groups-list">${data.groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;

const ACTIONS = {
  approve(u) {
    if (u.role !== 'teacher') {
      sensitive('approve', { id: u.id }).then(r => { if (r) { toast('Доступ открыт: ' + u.fio); load(); } }, error => toast(error.message, true));
      return;
    }
    openDialog(`<h2>Подтвердить преподавателя</h2><p>${esc(u.fio)} · ${esc(u.email)}</p>${groupsField((u.groups || []).join(', '))}
      <div class="row">${cancelBtn}<button>Подтвердить</button></div>`, async form => {
      if (!(await sensitive('groups', { id: u.id, groups: form.groups.value }))) return;
      await api('approve', { id: u.id });
      toast('Доступ открыт: ' + u.fio); load();
    });
  },
  revoke(u) {
    openDialog(`<h2>Закрыть доступ?</h2><p>${esc(u.fio)} сразу выйдет из портала и KU Message. Данные сохранятся, доступ можно открыть снова.</p>
      <div class="row">${cancelBtn}<button class="danger">Закрыть доступ</button></div>`, async () => {
      if (await sensitive('revoke', { id: u.id })) { toast('Доступ закрыт: ' + u.fio); load(); }
    });
  },
  groups(u) {
    openDialog(`<h2>Группы преподавателя</h2><p>${esc(u.fio)}</p>${groupsField(u.groups.join(', '))}
      <div class="row">${cancelBtn}<button>Сохранить</button></div>`, async form => {
      if (await sensitive('groups', { id: u.id, groups: form.groups.value })) { toast('Группы сохранены'); load(); }
    });
  },
  perms(u) {
    const p = u.perms, all = p.clubs.includes('*'), me = u.id === data.me;
    const clubs = data.clubs.map(c => `<label class="check"><input type="checkbox" name="club" value="${esc(c.id)}" ${!all && p.clubs.includes(c.id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('');
    openDialog(`<h2>Служебные права</h2><p>${esc(u.fio)} · ${ROLE[u.role] || ''}</p>
      ${u.role === 'student' ? '<p class="muted">Студенту можно дать клубы — он будет вести их и останется обычным студентом.</p>' : ''}
      <label class="check"><input type="checkbox" name="admin" ${p.admin ? 'checked' : ''} ${me ? 'disabled' : ''}>Админ-панель: пользователи, доступ, пароли</label>
      <label class="check"><input type="checkbox" name="results" ${p.results ? 'checked' : ''}>Учебная база результатов (преподавателям по умолчанию закрыта)</label>
      <label class="check"><input type="checkbox" name="dorm" ${p.dorm ? 'checked' : ''}>Общежитие</label>
      <label class="check"><input type="checkbox" name="allClubs" ${all ? 'checked' : ''}>Все клубы (менеджер)</label>
      <div style="padding-left:24px">${clubs}</div>
      <div class="row">${cancelBtn}<button>Сохранить</button></div>`, async form => {
      const chosen = [...form.querySelectorAll('input[name=club]:checked')].map(x => x.value);
      const perms = { admin: me ? true : form.admin.checked, results: form.results.checked, dorm: form.dorm.checked, clubs: form.allClubs.checked ? ['*'] : chosen };
      if (await sensitive('perms', { id: u.id, perms })) { toast('Права сохранены'); load(); }
    });
  },
  reset(u) {
    openDialog(`<h2>Сбросить пароль</h2><p>${esc(u.fio)} · ${esc(u.email)}</p>
      <p class="muted">Будет создан временный пароль на 3 суток. Все входы пользователя завершатся, при следующем входе портал попросит задать свой пароль.</p>
      ${u.twoFactor ? '<label class="check"><input type="checkbox" name="reset2fa">Отключить двухфакторную защиту (если потерян телефон)</label>' : ''}
      <div class="row">${cancelBtn}<button>Сбросить</button></div>`, async form => {
      const reset2fa = !!(form.reset2fa && form.reset2fa.checked);
      const result = await sensitive('reset-password', { id: u.id, reset2fa });
      if (!result) return;
      showPassword(u, result.password); load();
      return false;
    });
  },
  delete(u) {
    const note = u.role === 'student' ? 'Оценки студента тоже удаляются.' : u.role === 'teacher' ? 'Выставленные им оценки остаются у студентов, расписание удаляется.' : '';
    openDialog(`<h2>Удалить пользователя?</h2><p><b>${esc(u.fio)}</b> · ${esc(u.email)}</p>
      <p class="muted">Удаляются аккаунт, сеансы, личная переписка, членство в клубах и обращения. ${note} Записи в учебной базе результатов и онлайн-экзамене не затрагиваются. Отменить нельзя — если сомневаетесь, лучше закройте доступ.</p>
      <label>Для подтверждения введите email пользователя<input type="text" name="email" autocomplete="off" required></label>
      <div class="row">${cancelBtn}<button class="danger">Удалить навсегда</button></div>`, async form => {
      const confirmEmail = form.email.value.trim();
      if (confirmEmail.toLowerCase() !== u.email) throw new Error('Email не совпадает');
      const result = await sensitive('delete', { id: u.id, confirmEmail });
      if (result) { toast('Пользователь удалён'); load(); }
    });
  },
};
function showPassword(u, password) {
  openDialog(`<h2>Временный пароль</h2><p>${esc(u.fio)} · ${esc(u.email)}</p>
    <div class="secret">${esc(password)}</div>
    <p class="muted">Показывается только сейчас. Передайте его лично, не в общий чат. После входа пользователь задаст свой пароль.</p>
    <div class="row"><button class="secondary" type="button" id="copy">Скопировать</button><button>Готово</button></div>`, async () => true);
  document.getElementById('copy').addEventListener('click', () => {
    navigator.clipboard.writeText(password).then(() => toast('Скопировано'), () => toast('Скопируйте вручную', true));
  });
}

load();
