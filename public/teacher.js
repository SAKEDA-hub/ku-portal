'use strict';
/* KU Portal — экраны преподавателя: добавление занятий и выставление оценок.
 * Обычный скрипт: подключается в index.html перед app.js и пользуется его хелперами (svg, esc, t, api, toast, modal, S, app…)
 * только во время вызова. */
/* --- преподаватель: расписание --- */
async function viewTSchedule() {
  stopPoll();
  app.innerHTML = `${miniHead('Добавить занятие')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    const pb = document.getElementById('pagebody');
    if (!subs.items.length) {
      pb.innerHTML = `<div class="card next-empty">${t('У вас пока нет предметов.')}</div>`;
      return;
    }
    pb.innerHTML = `
      <div class="card">
        <label class="lbl">${t('Предмет')}</label>
        <select class="inp" id="scSubj">${subs.items.map((s) => `<option value="${s.id}">${esc(tv(s.name))}</option>`).join('')}</select>
        <label class="lbl">${t('Тип занятия')}</label>
        <select class="inp" id="scType">${['Лек.', 'Практ.', 'Лаб.'].map((x) => `<option value="${x}">${t(x)}</option>`).join('')}</select>
        <label class="lbl">${t('Группа')}</label>
        <input class="inp" id="scGroup" placeholder="${t('Например: ИСУ-26-2-а')}">
        <label class="lbl">${t('День недели')}</label>
        <select class="inp" id="scDay">${[0, 1, 2, 3, 4, 5].map((i) => `<option value="${i}">${esc(weekdayName(i))}</option>`).join('')}</select>
        <div class="row2">
          <div><label class="lbl">${t('Начало')}</label><input class="inp" id="scStart" type="time"></div>
          <div><label class="lbl">${t('Конец')}</label><input class="inp" id="scEnd" type="time"></div>
        </div>
        <label class="lbl">${t('Аудитория')}</label>
        <input class="inp" id="scRoom" placeholder="119 (1/1)">
        <button class="btn pri" id="scBtn">${t('Добавить занятие')}</button>
      </div>
      <div class="ptitle" style="padding:2px 0 10px">${t('Мои занятия')}</div>
      <div id="scList"></div>`;
    document.getElementById('scBtn').onclick = async () => {
      try {
        await api('/teacher/schedule', {
          method: 'POST',
          body: { subjectId: v('scSubj'), type: v('scType'), group: v('scGroup'), day: Number(v('scDay')), startTime: v('scStart'), endTime: v('scEnd'), room: v('scRoom') },
        });
        toast(t('Занятие добавлено')); paintScList();
      } catch (e) { toast(e.message, true); }
    };
    paintScList();
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
async function paintScList() {
  const box = document.getElementById('scList');
  if (!box) return;
  const d = await api('/schedule').catch((e) => ({ items: [] }));
  box.innerHTML = d.items.length ? d.items.map((r) => `
    <div class="card" style="padding:14px"><div class="stud-fio" style="font-size:calc(16px * var(--fs))">${esc(tv(r.subject))} (${esc(tv(r.type))})</div>
    <div class="stud-group">${esc(weekdayName(r.day))} · ${esc(r.start)}-${esc(r.end)} · ${esc(t('ауд. {r}', { r: r.room || '—' }))} · ${esc(r.group)}</div></div>`).join('')
    : `<div class="card next-empty">${t('Занятий пока нет.')}</div>`;
}

/* --- преподаватель: оценки --- */
async function viewTGrades() {
  stopPoll();
  app.innerHTML = `${miniHead('Выставить оценки')}<div id="pagebody"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  try {
    const subs = await api('/teacher/subjects');
    if (!subs.items.length) return (document.getElementById('pagebody').innerHTML = `<div class="card next-empty">${t('У вас пока нет предметов.')}</div>`);
    document.getElementById('pagebody').innerHTML = `
      <div class="card">
        <label class="lbl">${t('Предмет')}</label>
        <select class="inp" id="gSubj">${subs.items.map((s) => `<option value="${s.id}">${esc(tv(s.name))}</option>`).join('')}</select>
        <label class="lbl">${t('Группа студентов')}</label>
        <div class="row2">
          <input class="inp" id="gGroup" placeholder="ИСУ-26-2-а" style="margin:0">
          <button class="btn ghost" id="gFind" style="max-width:120px">${t('Найти')}</button>
        </div>
      </div>
      <div id="gStuds"></div>`;
    document.getElementById('gFind').onclick = findStudents;
    findStudents();
  } catch (e) { document.getElementById('pagebody').innerHTML = `<div class="load">${esc(e.message)}</div>`; }
}
async function findStudents() {
  const g = v('gGroup');
  const d = await api('/teacher/students' + (g ? '?group=' + encodeURIComponent(g) : ''));
  const box = document.getElementById('gStuds');
  box.innerHTML = `<div class="ptitle" style="padding:2px 0 10px">${t('Студенты ({n})', { n: d.items.length })}</div>` + (d.items.length
    ? d.items.map((s) => `
      <div class="card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div><div style="font-size:calc(15.5px * var(--fs))">${esc(s.fio)}${s.online ? `<span class="online-dot" title="${t('В сети')}"></span>` : ''}</div><div class="tx">${esc(s.group)}</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="inp small" style="margin:0;width:84px" placeholder="0-100" data-sc="${s.id}">
          <button class="badge" style="border:0;cursor:pointer;padding:9px 13px" data-put="${s.id}">${t('Выставить')}</button>
        </div>
      </div>`).join('')
    : `<div class="card next-empty">${t('Студентов такой группы нет.')}</div>`);
  box.querySelectorAll('[data-put]').forEach((b) => (b.onclick = async () => {
    const sid = b.dataset.put;
    const val = box.querySelector('[data-sc="' + sid + '"]').value;
    try {
      await api('/teacher/grades', { method: 'POST', body: { studentId: sid, subjectId: v('gSubj'), score: Number(val) } });
      toast(t('Оценка выставлена')); b.textContent = '✓'; b.disabled = true;
    } catch (e) { toast(e.message, true); }
  }));
}
