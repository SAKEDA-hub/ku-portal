'use strict';
/* KU Portal — экран преподавателя «Выставить оценки».
 * Обычный скрипт: подключается в index.html перед app.js и пользуется его хелперами (svg, esc, t, api, toast, S, app…)
 * только во время вызова.
 *
 * Преподаватель видит только группы, которые закрепил за ним администратор (админ-панель → «Группы»,
 * GET /api/teacher/groups), и только студентов этих групп. Поле «Направление» (например, ИСУ) сужает
 * список групп; группа выбирается кнопкой, студент — из списка с поиском по ФИО.
 * «Добавить занятие» убрано (ревью п.8), API /api/teacher/schedule оставлен для будущего расписания в админке.
 */
const TG = { groups: [], group: '', dir: '', q: '', students: [] };

async function viewTGrades() {
  stopPoll();
  app.innerHTML = `${miniHead('Выставить оценки')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  const pb = document.getElementById('pagebody');
  let subs, groups;
  try { [subs, groups] = await Promise.all([api('/teacher/subjects'), api('/teacher/groups')]); }
  catch (e) { pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  if (!pb.isConnected) return;
  if (!subs.items.length) { pb.innerHTML = `<div class="card next-empty">${t('У вас пока нет предметов.')}</div>`; return; }
  if (!groups.items.length) { pb.innerHTML = `<div class="card next-empty">${t('За вами пока не закреплены группы. Их назначает администратор портала.')}</div>`; return; }
  Object.assign(TG, { groups: groups.items, group: '', dir: '', q: '', students: [] });
  pb.innerHTML = `
    <div class="card">
      <label class="lbl" for="gSubj">${t('Предмет')}</label>
      <select class="inp" id="gSubj">${subs.items.map((s) => `<option value="${esc(s.id)}">${esc(tv(s.name))}</option>`).join('')}</select>
      <label class="lbl" for="gDir">${t('Направление')}</label>
      <input class="inp" id="gDir" placeholder="${t('Например: ИСУ')}" autocomplete="off">
      <label class="lbl">${t('Группа')}</label>
      <div class="tg-groups" id="gGroups" role="radiogroup" aria-label="${t('Группа')}"></div>
    </div>
    <div id="gStuds"></div>`;
  document.getElementById('gDir').oninput = (e) => { TG.dir = e.target.value.trim().toLowerCase(); paintTGroups(); };
  paintTGroups();
}

/* Кнопки групп: только закреплённые за преподавателем, с фильтром по направлению (префикс группы) */
function paintTGroups() {
  const box = document.getElementById('gGroups'); if (!box) return;
  const shown = TG.groups.filter((g) => !TG.dir || g.group.toLowerCase().includes(TG.dir));
  if (TG.group && !shown.some((g) => g.group === TG.group)) { TG.group = ''; paintTStudents(); }
  box.innerHTML = shown.length
    ? shown.map((g) => `<button type="button" class="chip ${g.group === TG.group ? 'on' : ''}" role="radio" aria-checked="${g.group === TG.group}" data-g="${esc(g.group)}">${esc(g.group)}<small>${esc(String(g.students))}</small></button>`).join('')
    : `<div class="tx">${t('Нет доступных групп по этому направлению.')}</div>`;
  box.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => pickTGroup(b.dataset.g)));
  if (!TG.group && shown.length === 1) pickTGroup(shown[0].group);
  else if (!TG.group) paintTStudents();
}

async function pickTGroup(group) {
  TG.group = group; TG.q = '';
  document.querySelectorAll('#gGroups [data-g]').forEach((b) => { const on = b.dataset.g === group; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  const box = document.getElementById('gStuds'); if (!box) return;
  box.innerHTML = `<div class="load">${t('Загрузка…')}</div>`;
  try { TG.students = (await api('/teacher/students?group=' + encodeURIComponent(group))).items; }
  catch (e) { box.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
  if (TG.group === group) paintTStudents();
}

function paintTStudents() {
  const box = document.getElementById('gStuds'); if (!box) return;
  if (!TG.group) { box.innerHTML = `<div class="card next-empty">${t('Выберите группу, чтобы увидеть студентов.')}</div>`; return; }
  box.innerHTML = `
    <div class="ptitle" style="padding:2px 0 10px">${esc(t('Студенты группы {g} ({n})', { g: TG.group, n: TG.students.length }))}</div>
    ${TG.students.length > 6 ? `<input class="inp" id="gQ" placeholder="${t('Поиск студента по ФИО')}" autocomplete="off" value="${esc(TG.q)}">` : ''}
    <div id="gList"></div>`;
  const q = document.getElementById('gQ');
  if (q) q.oninput = (e) => { TG.q = e.target.value.trim().toLowerCase(); paintTList(); };
  paintTList();
}

function paintTList() {
  const box = document.getElementById('gList'); if (!box) return;
  const rows = TG.students.filter((s) => !TG.q || s.fio.toLowerCase().includes(TG.q));
  box.innerHTML = rows.length ? rows.map((s) => `
      <div class="card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div><div style="font-size:calc(15.5px * var(--fs))">${esc(s.fio)}${s.online ? `<span class="online-dot" title="${t('В сети')}"></span>` : ''}</div><div class="tx">${esc(s.group)}</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="inp small" style="margin:0;width:84px" inputmode="numeric" placeholder="0-100" aria-label="${esc(t('Балл: {n}', { n: s.fio }))}" data-sc="${esc(s.id)}">
          <button class="badge" style="border:0;cursor:pointer;padding:9px 13px" data-put="${esc(s.id)}">${t('Выставить')}</button>
        </div>
      </div>`).join('')
    : `<div class="card next-empty">${t(TG.students.length ? 'Никого не найдено.' : 'В этой группе пока нет студентов.')}</div>`;
  box.querySelectorAll('[data-put]').forEach((b) => (b.onclick = () => putTGrade(b, box)));
  box.querySelectorAll('[data-sc]').forEach((inp) => (inp.onkeydown = (e) => { if (e.key === 'Enter') box.querySelector(`[data-put="${inp.dataset.sc}"]`).click(); }));
}

async function putTGrade(b, box) {
  const sid = b.dataset.put;
  const raw = box.querySelector(`[data-sc="${sid}"]`).value.trim();
  const score = Number(raw.replace(',', '.'));
  if (!raw || !(score >= 0 && score <= 100)) { toast(t('Балл — число от 0 до 100'), true); return; }
  b.disabled = true;
  try {
    await api('/teacher/grades', { method: 'POST', body: { studentId: sid, subjectId: v('gSubj'), score } });
    toast(t('Оценка выставлена')); b.textContent = '✓';
  } catch (e) { toast(e.message, true); b.disabled = false; }
}
