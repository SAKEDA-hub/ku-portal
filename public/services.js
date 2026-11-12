'use strict';
/* KU Portal — демо-сервисы студента: «Запись на зачёт», «Посещаемость», «Общежитие», «Голосование», «Библиотека».
 *
 * Это макеты, которые ведут себя как рабочие: данные генерируются для пользователя (стабильно по его id)
 * и хранятся в браузере (localStorage ku_svc:<userId>:<сервис>) — запись, отметка, заявки, голоса, бронирование
 * сохраняются между заходами. Сервер для них не нужен. На каждом экране есть пометка «Демо-режим».
 * Подключается перед app.js; использует его хелперы (svg, esc, t, api, miniHead, navHTML, stopPoll, toast, modal, S, app)
 * только во время вызова. Маршруты: #/credit, #/attendance, #/dorm, #/voting, #/library (см. route() в app.js).
 */

/* ---------- общее ---------- */
function svcKey(name) { return 'ku_svc:' + (S.user ? S.user.id : 'guest') + ':' + name; }
function svcGet(name, def) { try { const v = JSON.parse(localStorage.getItem(svcKey(name)) || 'null'); return v == null ? def : v; } catch { return def; } }
function svcSet(name, val) { try { localStorage.setItem(svcKey(name), JSON.stringify(val)); } catch { } }
/* детерминированный генератор: одинаковые демо-данные для пользователя при каждом заходе */
function svcRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const svcIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function svcDay(offset) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; }
/* ближайший рабочий день не раньше offset дней от сегодня */
function svcWorkday(offset) { const d = svcDay(offset); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d; }
function svcCode() { return Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + String(Math.floor(1000 + Math.random() * 9000)); }
const DEMO_NOTE = () => `<div class="svc-demo">${svg('info')}<span>${t('Демо-режим: данные примерные и хранятся только в этом браузере.')}</span></div>`;
function svcShell(title, body) {
  stopPoll();
  app.innerHTML = `${miniHead(title)}<div id="pagebody" class="svc">${DEMO_NOTE()}${body}</div>${navHTML()}`;
  return document.getElementById('pagebody');
}
function svcTabs(id, tabs, cur) {
  return `<div class="tabs svc-tabs" id="${id}">${tabs.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-tab="${k}">${t(l)}</button>`).join('')}</div>`;
}
function svcBar(pct, cls) { return `<div class="svc-bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`; }
/* предметы студента: из расписания группы, иначе — встроенный список */
const SVC_SUBJECTS = ['Английский язык', 'Высшая математика', 'Политология', 'Экология', 'Экономика', 'Введение в информационные технологии'];
async function svcSubjects() {
  try {
    const d = await api('/schedule');
    const names = [...new Set(d.items.map((x) => x.subject))];
    if (names.length >= 2) return names;
  } catch { }
  return SVC_SUBJECTS.slice(0, 5);
}

/* ============================ Запись на зачёт ============================ */
/* Зачёты по предметам студента, у каждого — несколько окон (дата, время, аудитория, свободные места).
   Запись одна на предмет: можно записаться, перенести на другое окно или отменить. */
async function viewCredit() {
  const pb = svcShell('Запись на зачёт', `<div class="load">${t('Загрузка…')}</div>`);
  const subjects = await svcSubjects();
  if (!S.user || !document.body.contains(pb)) return;
  const rnd = svcRng(S.user.id + ':credit');
  const rooms = ['214', '301', '118', '205', '410'];
  const exams = subjects.map((name, i) => {
    const base = 5 + i * 3 + Math.floor(rnd() * 3);
    const slots = [0, 1, 2].map((k) => {
      const d = svcWorkday(base + k * 2);
      const hh = [9, 11, 14, 16][Math.floor(rnd() * 4)];
      const cap = 20 + Math.floor(rnd() * 6) * 2;
      return { id: `${i}-${k}`, iso: svcIso(d), time: `${String(hh).padStart(2, '0')}:00`, room: rooms[(i + k) % rooms.length], cap, taken: Math.floor(cap * (0.35 + rnd() * 0.6)) };
    });
    return { id: 'c' + i, subject: name, kind: rnd() < 0.6 ? 'Зачёт' : 'Дифф. зачёт', slots };
  });
  paintCredit(pb, exams, 'list');
}
function paintCredit(pb, exams, tab) {
  const book = svcGet('credit', {}); // { examId: { slotId, code, at } }
  const mine = exams.filter((e) => book[e.id]);
  const slotOf = (e) => e.slots.find((s) => s.id === book[e.id].slotId);
  const free = (e, s) => s.cap - s.taken - (book[e.id] && book[e.id].slotId === s.id ? 1 : 0);
  pb.innerHTML = `${DEMO_NOTE()}
    <div class="card svc-sum">
      <div><b>${mine.length} / ${exams.length}</b><span class="tx">${t('записей на зачёты')}</span></div>
      <span class="badge ${mine.length === exams.length ? 'ok' : 'warn'}">${mine.length === exams.length ? t('Всё готово') : t('Есть незаписанные')}</span>
    </div>
    ${svcTabs('crTabs', [['list', 'Все зачёты'], ['mine', 'Мои записи']], tab)}
    ${tab === 'mine'
    ? (mine.length ? mine.map((e) => { const s = slotOf(e); return `
      <div class="card svc-item">
        <div class="svc-row"><b>${esc(tv(e.subject))}</b><span class="badge ok">${t('Вы записаны')}</span></div>
        <div class="tx">${t(e.kind)} · ${esc(fmtDay(s.iso, true))}, ${s.time} · ${t('ауд.')} ${esc(s.room)}</div>
        <div class="svc-code">${t('Код записи')}: <b>${esc(book[e.id].code)}</b></div>
        <div class="row2 svc-btns"><button class="btn ghost" data-move="${e.id}">${t('Перенести')}</button><button class="btn danger-ghost" data-cancel="${e.id}">${t('Отменить')}</button></div>
      </div>`; }).join('') : `<div class="card next-empty">${t('Вы пока не записаны ни на один зачёт.')}</div>`)
    : exams.map((e) => `
      <div class="card svc-item" id="cr-${e.id}">
        <div class="svc-row"><b>${esc(tv(e.subject))}</b>${book[e.id] ? `<span class="badge ok">${t('Вы записаны')}</span>` : `<span class="badge">${t(e.kind)}</span>`}</div>
        <div class="svc-slots">${e.slots.map((s) => { const f = free(e, s), on = book[e.id] && book[e.id].slotId === s.id; return `
          <button class="svc-slot ${on ? 'on' : ''}" data-book="${e.id}" data-slot="${s.id}" ${f <= 0 && !on ? 'disabled' : ''}>
            <b>${esc(fmtDay(s.iso))}</b><span>${s.time} · ${t('ауд.')} ${esc(s.room)}</span>
            <small class="${f <= 3 ? 'low' : ''}">${on ? t('Ваше место') : f <= 0 ? t('Мест нет') : t('Свободно: {n}', { n: f })}</small>
          </button>`; }).join('')}</div>
      </div>`).join('')}
    <div class="tx svc-foot">${t('Записаться можно не позднее чем за сутки. При неявке без уважительной причины запись аннулируется.')}</div>`;
  pb.querySelector('#crTabs').onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) paintCredit(pb, exams, b.dataset.tab); };
  pb.querySelectorAll('[data-book]').forEach((b) => (b.onclick = () => {
    const e = exams.find((x) => x.id === b.dataset.book), s = e.slots.find((x) => x.id === b.dataset.slot);
    if (book[e.id] && book[e.id].slotId === s.id) return;
    const moving = !!book[e.id];
    modal(t(moving ? 'Перенести запись' : 'Запись на зачёт'), `
      <div class="svc-confirm"><b>${esc(tv(e.subject))}</b><span>${t(e.kind)}</span><span>${esc(fmtDay(s.iso, true))}, ${s.time}</span><span>${t('Аудитория: {v}', { v: s.room })}</span></div>
      <div class="tx">${t('Возьмите с собой удостоверение личности или студенческий билет.')}</div>
      <button class="btn pri" id="crOk">${t(moving ? 'Перенести' : 'Записаться')}</button>`, (box, close) => {
      box.querySelector('#crOk').onclick = () => {
        book[e.id] = { slotId: s.id, code: moving ? book[e.id].code : svcCode(), at: Date.now() };
        svcSet('credit', book); close();
        toast(t(moving ? 'Запись перенесена' : 'Вы записаны на зачёт'));
        paintCredit(pb, exams, 'mine');
      };
    });
  }));
  pb.querySelectorAll('[data-move]').forEach((b) => (b.onclick = () => {
    paintCredit(pb, exams, 'list');
    const el = document.getElementById('cr-' + b.dataset.move); if (el) el.scrollIntoView({ block: 'center' });
    toast(t('Выберите другое время'));
  }));
  pb.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => {
    modal(t('Отменить запись?'), `<div class="tx">${t('Место освободится для других студентов.')}</div><button class="btn danger-ghost" id="crDel">${t('Отменить запись')}</button>`, (box, close) => {
      box.querySelector('#crDel').onclick = () => { delete book[b.dataset.cancel]; svcSet('credit', book); close(); toast(t('Запись отменена')); paintCredit(pb, exams, 'mine'); };
    });
  }));
}

/* ============================ Посещаемость ============================ */
/* Журнал за последние недели по предметам (сгенерирован), общий процент, отметка на занятии по коду преподавателя. */
async function viewAttendance() {
  const pb = svcShell('Посещаемость', `<div class="load">${t('Загрузка…')}</div>`);
  const subjects = await svcSubjects();
  if (!S.user || !document.body.contains(pb)) return;
  const rnd = svcRng(S.user.id + ':att');
  const log = [];
  let day = 1;
  for (let n = 0; n < 24; n++) {
    const d = svcDay(-day); day += 1 + Math.floor(rnd() * 2);
    if (d.getDay() === 0 || d.getDay() === 6) { n--; continue; }
    const r = rnd();
    log.push({ iso: svcIso(d), subject: subjects[Math.floor(rnd() * subjects.length)], st: r < 0.82 ? 'p' : r < 0.91 ? 'l' : r < 0.96 ? 'e' : 'a' });
  }
  paintAttendance(pb, subjects, log);
}
function paintAttendance(pb, subjects, baseLog) {
  const marks = svcGet('att', []); // отметки студента: [{ iso, subject, st:'p', at }]
  const log = marks.concat(baseLog);
  const counted = (x) => x.st === 'p' || x.st === 'l';
  const pct = (rows) => rows.length ? Math.round(rows.filter(counted).length / rows.length * 100) : 100;
  const total = pct(log);
  const ST = { p: ['Был', 'ok'], l: ['Опоздал', 'warn'], e: ['Уваж. причина', ''], a: ['Пропуск', 'bad'] };
  const today = svcIso(new Date());
  const markedToday = marks.some((m) => m.iso === today);
  pb.innerHTML = `${DEMO_NOTE()}
    <div class="card svc-sum">
      <div><b class="svc-big">${total}%</b><span class="tx">${t('посещаемость за семестр')}</span></div>
      <span class="badge ${total >= 85 ? 'ok' : total >= 70 ? 'warn' : 'bad'}">${total >= 85 ? t('Отлично') : total >= 70 ? t('Норма') : t('Ниже допуска')}</span>
    </div>
    <div class="card">
      <div class="svc-row"><b>${t('Отметиться на занятии')}</b>${markedToday ? `<span class="badge ok">${t('Сегодня отмечено')}</span>` : ''}</div>
      <div class="tx" style="margin:4px 0 10px">${t('Введите 4-значный код, который преподаватель показывает на занятии.')}</div>
      <div class="svc-inline"><input class="inp" id="atCode" inputmode="numeric" maxlength="4" placeholder="0000"><button class="btn pri" id="atGo">${t('Отметиться')}</button></div>
    </div>
    <div class="section-label">${t('По предметам')}</div>
    <div class="card">${subjects.map((s) => { const rows = log.filter((x) => x.subject === s), p = pct(rows); return `
      <div class="svc-subj"><div class="svc-row"><span>${esc(tv(s))}</span><b>${p}%</b></div>${svcBar(p, p >= 85 ? 'ok' : p >= 70 ? 'warn' : 'bad')}
      <small class="tx">${t('Занятий: {n}, пропусков: {m}', { n: rows.length, m: rows.filter((x) => x.st === 'a').length })}</small></div>`; }).join('')}</div>
    <div class="section-label">${t('Последние занятия')}</div>
    <div class="card">${log.slice(0, 12).map((x) => `
      <div class="svc-log"><div><b>${esc(tv(x.subject))}</b><small class="tx">${esc(fmtDay(x.iso, true))}</small></div><span class="badge ${ST[x.st][1]}">${t(ST[x.st][0])}</span></div>`).join('')}</div>
    <div class="tx svc-foot">${t('Для допуска к сессии нужно посетить не менее 70% занятий по каждому предмету.')}</div>`;
  const go = () => {
    const c = pb.querySelector('#atCode').value.trim();
    if (!/^\d{4}$/.test(c)) return toast(t('Код — 4 цифры'), true);
    if (markedToday) return toast(t('Вы уже отметились сегодня'));
    marks.unshift({ iso: today, subject: subjects[new Date().getDay() % subjects.length], st: 'p', at: Date.now() });
    svcSet('att', marks); toast(t('Отметка принята')); paintAttendance(pb, subjects, baseLog);
  };
  pb.querySelector('#atGo').onclick = go;
  pb.querySelector('#atCode').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

/* ============================ Общежитие ============================ */
/* Заявка на заселение (статусы: на рассмотрении → одобрена, с номером комнаты), заявки на ремонт, правила проживания. */
const DORMS = [['1', 'Общежитие №1'], ['2', 'Общежитие №2'], ['3', 'Общежитие №3']];
const ROOM_TYPES = [['2', 'Двухместная'], ['3', 'Трёхместная'], ['4', 'Четырёхместная']];
const REPAIR_KINDS = ['Сантехника', 'Электрика', 'Мебель', 'Окна и двери', 'Интернет', 'Другое'];
function viewDorm(tab) {
  const pb = svcShell('Общежитие', '');
  paintDorm(pb, tab || 'home');
}
function dormState() {
  const st = dormNorm(svcGet('dorm', { app: null, repairs: [] }));
  // заявка «рассматривается» ~20 секунд, затем одобряется — чтобы было видно смену статуса
  if (st.app && st.app.status === 'review' && Date.now() - st.app.at > 20000) {
    const rnd = svcRng(S.user.id + ':dorm');
    st.app.status = 'ok'; st.app.room = String(100 * (2 + Math.floor(rnd() * 3)) + 1 + Math.floor(rnd() * 30)); st.app.decided = Date.now();
    svcSet('dorm', st);
  }
  (st.repairs || []).forEach((r) => {
    const age = Date.now() - r.at;
    const s = age > 60000 ? 'done' : age > 15000 ? 'work' : 'new';
    if (r.status !== s) { r.status = s; svcSet('dorm', st); }
  });
  return st;
}
function dormNorm(st) { if (!st || typeof st !== 'object') return { app: null, repairs: [] }; st.repairs = Array.isArray(st.repairs) ? st.repairs : []; return st; }
function paintDorm(pb, tab) {
  const st = dormState();
  const a = st.app;
  const dormName = (id) => t((DORMS.find((d) => d[0] === id) || DORMS[0])[1]);
  const RS = { new: ['Принята', ''], work: ['В работе', 'warn'], done: ['Выполнена', 'ok'] };
  let body = '';
  if (tab === 'home') {
    body = !a ? `
      <div class="card">
        <b>${t('Заявка на заселение')}</b>
        <div class="tx" style="margin:4px 0 12px">${t('Заполните заявку — комендант рассмотрит её и назначит комнату.')}</div>
        <label class="lbl">${t('Общежитие')}</label>
        <div class="chips svc-wrap" id="dmDorm">${DORMS.map(([k, n], i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-v="${k}">${t(n)}</button>`).join('')}</div>
        <label class="lbl">${t('Тип комнаты')}</label>
        <div class="chips svc-wrap" id="dmType">${ROOM_TYPES.map(([k, n], i) => `<button class="chip ${i === 1 ? 'on' : ''}" data-v="${k}">${t(n)}</button>`).join('')}</div>
        <label class="lbl">${t('Пожелания (необязательно)')}</label>
        <input class="inp" id="dmNote" placeholder="${t('Например: с одногруппником, не выше 3 этажа')}">
        <button class="btn pri" id="dmSend">${t('Отправить заявку')}</button>
      </div>` : `
      <div class="card svc-item">
        <div class="svc-row"><b>${t('Заявка на заселение')}</b>${a.status === 'ok' ? `<span class="badge ok">${t('Одобрена')}</span>` : `<span class="badge warn">${t('На рассмотрении')}</span>`}</div>
        <div class="svc-steps">
          <div class="on">${svg('check')}<span>${t('Заявка отправлена')}<small>${esc(fmtWhen(a.at))}</small></span></div>
          <div class="${a.status === 'ok' ? 'on' : 'cur'}">${a.status === 'ok' ? svg('check') : svg('clock')}<span>${t('Рассмотрение комендантом')}</span></div>
          <div class="${a.status === 'ok' ? 'on' : ''}">${a.status === 'ok' ? svg('check') : svg('door')}<span>${t('Комната назначена')}${a.status === 'ok' ? `<small>${esc(fmtWhen(a.decided))}</small>` : ''}</span></div>
        </div>
        ${a.status === 'ok' ? `
        <div class="svc-room"><div><small class="tx">${t('Общежитие')}</small><b>${esc(dormName(a.dorm))}</b></div><div><small class="tx">${t('Комната')}</small><b>${esc(a.room)}</b></div><div><small class="tx">${t('Мест')}</small><b>${esc(a.type)}</b></div></div>
        <div class="tx">${t('Заселение: с 9:00 до 18:00 у коменданта. Возьмите удостоверение личности, справку о здоровье и 2 фото 3×4.')}</div>`
        : `<div class="tx">${t('Обычно заявку рассматривают в течение 1–3 рабочих дней. Статус обновится здесь.')}</div><button class="btn ghost" id="dmRefresh" style="margin-top:10px">${t('Обновить статус')}</button>`}
        <button class="btn danger-ghost" id="dmCancel" style="margin-top:8px">${t('Отозвать заявку')}</button>
      </div>`;
  } else if (tab === 'repair') {
    body = `
      <div class="card">
        <b>${t('Новая заявка на ремонт')}</b>
        <label class="lbl">${t('Что случилось')}</label>
        <div class="chips svc-wrap" id="rpKind">${REPAIR_KINDS.map((k, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-v="${k}">${t(k)}</button>`).join('')}</div>
        <input class="inp" id="rpText" placeholder="${t('Опишите проблему')}">
        <button class="btn pri" id="rpSend">${t('Отправить')}</button>
      </div>
      <div class="section-label">${t('Мои заявки')}</div>
      ${st.repairs.length ? `<div class="card">${st.repairs.map((r) => `
        <div class="svc-log"><div><b>${t(r.kind)}</b><small class="tx">${esc(r.text)} · ${esc(fmtWhen(r.at))}</small></div><span class="badge ${RS[r.status][1]}">${t(RS[r.status][0])}</span></div>`).join('')}</div>`
      : `<div class="card next-empty">${t('Заявок пока нет.')}</div>`}`;
  } else {
    body = `<div class="card svc-rules">
      <b>${t('Основные правила проживания')}</b>
      <ul>
        <li>${t('Вход в общежитие — по студенческому билету.')}</li>
        <li>${t('Тихий час — с 23:00 до 7:00.')}</li>
        <li>${t('Гости — с 10:00 до 21:00, с записью у вахтёра.')}</li>
        <li>${t('Запрещено курение и использование открытого огня.')}</li>
        <li>${t('Оплата проживания — до 10 числа каждого месяца.')}</li>
      </ul>
      <div class="tx">${t('Контакты коменданта и точный адрес уточняйте в деканате или на сайте университета.')}</div>
    </div>`;
  }
  pb.innerHTML = `${DEMO_NOTE()}${svcTabs('dmTabs', [['home', 'Заселение'], ['repair', 'Ремонт'], ['rules', 'Правила']], tab)}${body}`;
  pb.querySelector('#dmTabs').onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) paintDorm(pb, b.dataset.tab); };
  pb.querySelectorAll('.chips').forEach((g) => (g.onclick = (ev) => { const b = ev.target.closest('.chip'); if (!b) return; g.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); }));
  const pick = (id) => { const c = pb.querySelector(`#${id} .chip.on`); return c ? c.dataset.v : ''; };
  const on = (id, fn) => { const el = pb.querySelector('#' + id); if (el) el.onclick = fn; };
  on('dmSend', () => {
    st.app = { dorm: pick('dmDorm'), type: pick('dmType'), note: pb.querySelector('#dmNote').value.trim(), status: 'review', at: Date.now() };
    svcSet('dorm', st); toast(t('Заявка отправлена')); paintDorm(pb, 'home');
  });
  on('dmRefresh', () => { paintDorm(pb, 'home'); toast(dormState().app.status === 'ok' ? t('Заявка одобрена') : t('Заявка ещё рассматривается')); });
  on('dmCancel', () => modal(t('Отозвать заявку?'), `<div class="tx">${t('Заявку можно будет подать заново.')}</div><button class="btn danger-ghost" id="dmDel">${t('Отозвать')}</button>`, (box, close) => {
    box.querySelector('#dmDel').onclick = () => { st.app = null; svcSet('dorm', st); close(); toast(t('Заявка отозвана')); paintDorm(pb, 'home'); };
  }));
  on('rpSend', () => {
    const text = pb.querySelector('#rpText').value.trim();
    if (text.length < 3) return toast(t('Опишите проблему'), true);
    st.repairs.unshift({ id: svcCode(), kind: pick('rpKind'), text, at: Date.now(), status: 'new' });
    svcSet('dorm', st); toast(t('Заявка на ремонт принята')); paintDorm(pb, 'repair');
  });
}

/* ============================ Голосование ============================ */
/* Опросы студенческого самоуправления: один голос на опрос, результаты видны после голосования и в завершённых. */
const POLLS = [
  { id: 'p1', q: 'Во сколько удобнее начинать первую пару?', opts: ['8:00', '8:30', '9:00'], days: 4 },
  { id: 'p2', q: 'Тема весеннего студенческого фестиваля', opts: ['Наука и технологии', 'Культуры народов Казахстана', 'Спорт и здоровье', 'Кино и музыка'], days: 9 },
  { id: 'p3', q: 'Формат консультаций перед сессией', opts: ['Очно в аудитории', 'Онлайн', 'Смешанный'], days: 2 },
  { id: 'p4', q: 'Что добавить в студенческую столовую?', opts: ['Больше вегетарианских блюд', 'Завтраки с 7:30', 'Кофейный уголок'], days: -3 },
];
function viewVoting(tab) {
  const pb = svcShell('Голосование', '');
  paintVoting(pb, tab || 'active');
}
function paintVoting(pb, tab) {
  const votes = svcGet('votes', {});
  const rnd = svcRng('ku-polls-v1'); // общая «база» голосов — одинаковая у всех
  const polls = POLLS.map((p) => {
    const base = p.opts.map(() => 20 + Math.floor(rnd() * 140));
    const counts = base.map((c, i) => c + (votes[p.id] === i ? 1 : 0));
    const end = svcDay(p.days);
    return Object.assign({}, p, { counts, total: counts.reduce((a, b) => a + b, 0), closed: p.days < 0, end: svcIso(end) });
  });
  const list = polls.filter((p) => (tab === 'active') !== p.closed);
  pb.innerHTML = `${DEMO_NOTE()}${svcTabs('vtTabs', [['active', 'Активные'], ['closed', 'Завершённые']], tab)}
    ${list.map((p) => {
      const voted = votes[p.id] != null, show = voted || p.closed, max = Math.max(...p.counts);
      return `<div class="card svc-item">
        <div class="svc-row"><b>${esc(t(p.q))}</b>${voted ? `<span class="badge ok">${t('Вы проголосовали')}</span>` : p.closed ? `<span class="badge">${t('Завершено')}</span>` : ''}</div>
        <div class="tx">${p.closed ? t('Завершено {d}', { d: fmtDay(p.end) }) : t('До {d} · голосов: {n}', { d: fmtDay(p.end), n: p.total })}</div>
        <div class="svc-opts">${p.opts.map((o, i) => {
          const pc = Math.round(p.counts[i] / p.total * 100);
          return show
            ? `<div class="svc-res ${votes[p.id] === i ? 'me' : ''} ${p.counts[i] === max ? 'top' : ''}"><div class="svc-row"><span>${esc(/[а-яё]/i.test(o) ? t(o) : o)}${votes[p.id] === i ? ' ✓' : ''}</span><b>${pc}%</b></div>${svcBar(pc)}</div>`
            : `<button class="svc-opt" data-poll="${p.id}" data-opt="${i}"><i></i>${esc(/[а-яё]/i.test(o) ? t(o) : o)}</button>`;
        }).join('')}</div>
        ${!show ? `<button class="btn pri" data-vote="${p.id}" disabled>${t('Проголосовать')}</button>` : ''}
      </div>`; }).join('') || `<div class="card next-empty">${t('Опросов нет.')}</div>`}
    <div class="tx svc-foot">${t('Голосование анонимное. Один голос на опрос, изменить его нельзя.')}</div>`;
  pb.querySelector('#vtTabs').onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) paintVoting(pb, b.dataset.tab); };
  pb.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => {
    const card = b.closest('.svc-item');
    card.querySelectorAll('.svc-opt').forEach((x) => x.classList.toggle('on', x === b));
    const v = card.querySelector('[data-vote]'); v.disabled = false; v.dataset.choice = b.dataset.opt;
  }));
  pb.querySelectorAll('[data-vote]').forEach((b) => (b.onclick = () => {
    if (b.dataset.choice == null) return;
    votes[b.dataset.vote] = Number(b.dataset.choice); svcSet('votes', votes);
    toast(t('Ваш голос учтён')); paintVoting(pb, tab);
  }));
}

/* ============================ Библиотека ============================ */
/* Каталог с поиском и фильтром, бронирование (забрать за 3 дня), «Мои книги» с продлением на 14 дней. */
const BOOKS = [
  { id: 'b1', title: 'English Grammar in Use', author: 'Raymond Murphy', year: 2019, cat: 'Английский язык', n: 12 },
  { id: 'b2', title: 'Дифференциальное и интегральное исчисления', author: 'Н. С. Пискунов', year: 2010, cat: 'Математика', n: 8 },
  { id: 'b3', title: 'Алгоритмы: построение и анализ', author: 'Т. Кормен, Ч. Лейзерсон, Р. Ривест, К. Штайн', year: 2013, cat: 'Информационные технологии', n: 4 },
  { id: 'b4', title: 'Компьютерные сети', author: 'Э. Таненбаум, Д. Уэзеролл', year: 2016, cat: 'Информационные технологии', n: 5 },
  { id: 'b5', title: 'Принципы экономики', author: 'Н. Грегори Мэнкью', year: 2012, cat: 'Экономика', n: 6 },
  { id: 'b6', title: 'Экология', author: 'Ю. Одум', year: 1986, cat: 'Экология', n: 3 },
  { id: 'b7', title: 'Политология', author: 'Э. Хейвуд', year: 2005, cat: 'Политология', n: 5 },
  { id: 'b8', title: 'Essential Grammar in Use', author: 'Raymond Murphy', year: 2015, cat: 'Английский язык', n: 10 },
  { id: 'b9', title: 'Сборник задач по высшей математике', author: 'К. Н. Лунгу и др.', year: 2013, cat: 'Математика', n: 7 },
  { id: 'b10', title: 'Чистый код', author: 'Р. Мартин', year: 2019, cat: 'Информационные технологии', n: 3 },
];
const BOOK_CATS = ['Все', 'Английский язык', 'Математика', 'Информационные технологии', 'Экономика', 'Экология', 'Политология'];
const LIB = { q: '', cat: 'Все' };
function viewLibrary(tab) {
  const pb = svcShell('Библиотека', '');
  paintLibrary(pb, tab || 'catalog');
}
function libState() {
  let st = svcGet('lib', null);
  if (!st || !Array.isArray(st.loans)) {
    // стартовые выдачи — чтобы раздел «Мои книги» не был пустым
    st = { loans: [{ id: 'b1', due: svcIso(svcDay(9)), renewed: 0 }, { id: 'b2', due: svcIso(svcDay(2)), renewed: 0 }], holds: [] };
    svcSet('lib', st);
  }
  return st;
}
function paintLibrary(pb, tab) {
  const st = libState();
  const held = (id) => st.holds.find((h) => h.id === id);
  const loaned = (id) => st.loans.find((l) => l.id === id);
  const avail = (b) => { const r = svcRng('lib:' + b.id)(); return Math.max(0, Math.floor(b.n * (0.2 + r * 0.6)) - (held(b.id) ? 1 : 0)); };
  const q = LIB.q.toLowerCase();
  const found = BOOKS.filter((b) => (LIB.cat === 'Все' || b.cat === LIB.cat) && (!q || (b.title + ' ' + b.author).toLowerCase().includes(q)));
  const daysLeft = (iso) => Math.round((new Date(iso + 'T00:00:00') - svcDay(0)) / 86400000);
  let body;
  if (tab === 'catalog') {
    body = `
      <input class="inp" id="lbQ" placeholder="${t('Название или автор')}" value="${esc(LIB.q)}">
      <div class="chips svc-scroll" id="lbCat">${BOOK_CATS.map((c) => `<button class="chip ${LIB.cat === c ? 'on' : ''}" data-v="${esc(c)}">${t(c)}</button>`).join('')}</div>
      <div id="lbList">${found.map((b) => { const a = avail(b); return `
        <div class="card svc-book">
          <div class="svc-cover">${svg('book')}</div>
          <div class="svc-bk">
            <b>${esc(b.title)}</b><span class="tx">${esc(b.author)} · ${b.year}</span>
            <span class="tx">${t(b.cat)} · ${a > 0 ? t('В наличии: {n} из {m}', { n: a, m: b.n }) : t('Нет в наличии')}</span>
            ${loaned(b.id) ? `<span class="badge ok">${t('У вас на руках')}</span>`
              : held(b.id) ? `<span class="badge warn">${t('Забронировано')}</span>`
              : `<button class="btn ghost sm" data-hold="${b.id}" ${a > 0 ? '' : 'disabled'}>${t('Забронировать')}</button>`}
          </div>
        </div>`; }).join('') || `<div class="card next-empty">${t('Ничего не найдено.')}</div>`}</div>`;
  } else {
    body = `
      <div class="section-label">${t('На руках')}</div>
      ${st.loans.length ? st.loans.map((l) => { const b = BOOKS.find((x) => x.id === l.id), d = daysLeft(l.due); return `
        <div class="card svc-book">
          <div class="svc-cover">${svg('book')}</div>
          <div class="svc-bk"><b>${esc(b.title)}</b><span class="tx">${esc(b.author)}</span>
            <span class="badge ${d < 0 ? 'bad' : d <= 3 ? 'warn' : 'ok'}">${d < 0 ? t('Просрочено') : t('Вернуть до {d}', { d: fmtDay(l.due) })}</span>
            <button class="btn ghost sm" data-renew="${l.id}" ${l.renewed >= 2 ? 'disabled' : ''}>${l.renewed >= 2 ? t('Продление недоступно') : t('Продлить на 14 дней')}</button>
          </div>
        </div>`; }).join('') : `<div class="card next-empty">${t('Книг на руках нет.')}</div>`}
      <div class="section-label">${t('Бронирования')}</div>
      ${st.holds.length ? st.holds.map((h) => { const b = BOOKS.find((x) => x.id === h.id); return `
        <div class="card svc-book">
          <div class="svc-cover">${svg('book')}</div>
          <div class="svc-bk"><b>${esc(b.title)}</b><span class="tx">${t('Забрать до {d} · абонемент, код {c}', { d: fmtDay(h.until), c: h.code })}</span>
            <div class="row2"><button class="btn ghost sm" data-pick="${h.id}">${t('Я забрал(а) книгу')}</button><button class="btn danger-ghost sm" data-unhold="${h.id}">${t('Отменить')}</button></div>
          </div>
        </div>`; }).join('') : `<div class="card next-empty">${t('Бронирований нет.')}</div>`}`;
  }
  pb.innerHTML = `${DEMO_NOTE()}${svcTabs('lbTabs', [['catalog', 'Каталог'], ['mine', 'Мои книги']], tab)}${body}
    <div class="tx svc-foot">${t('Книги выдаются на 14 дней, продлить можно 2 раза. Бронь хранится 3 дня.')}</div>`;
  pb.querySelector('#lbTabs').onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) paintLibrary(pb, b.dataset.tab); };
  const qi = pb.querySelector('#lbQ');
  if (qi) qi.oninput = () => { LIB.q = qi.value; const pos = qi.selectionStart; paintLibrary(pb, 'catalog'); const n = pb.querySelector('#lbQ'); n.focus(); n.setSelectionRange(pos, pos); };
  const cat = pb.querySelector('#lbCat');
  if (cat) cat.onclick = (ev) => { const b = ev.target.closest('.chip'); if (b) { LIB.cat = b.dataset.v; paintLibrary(pb, 'catalog'); } };
  const save = (msg, nextTab) => { svcSet('lib', st); toast(msg); paintLibrary(pb, nextTab || tab); };
  pb.querySelectorAll('[data-hold]').forEach((b) => (b.onclick = () => { st.holds.push({ id: b.dataset.hold, until: svcIso(svcWorkday(3)), code: svcCode() }); save(t('Книга забронирована — заберите её в течение 3 дней')); }));
  pb.querySelectorAll('[data-unhold]').forEach((b) => (b.onclick = () => { st.holds = st.holds.filter((h) => h.id !== b.dataset.unhold); save(t('Бронь отменена')); }));
  pb.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { st.holds = st.holds.filter((h) => h.id !== b.dataset.pick); st.loans.push({ id: b.dataset.pick, due: svcIso(svcDay(14)), renewed: 0 }); save(t('Книга выдана на 14 дней')); }));
  pb.querySelectorAll('[data-renew]').forEach((b) => (b.onclick = () => {
    const l = st.loans.find((x) => x.id === b.dataset.renew); if (!l || l.renewed >= 2) return;
    const d = new Date(l.due + 'T00:00:00'); d.setDate(d.getDate() + 14); l.due = svcIso(d); l.renewed++;
    save(t('Срок продлён до {d}', { d: fmtDay(l.due) }));
  }));
}
