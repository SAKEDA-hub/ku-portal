'use strict';
/* KU Portal — «Клубы» и «Общежитие» (сервер: portal-features.js, /api/clubs*, /api/dorm*).
 *
 * #/clubs        — вкладки «Клубы» (вступить / выйти), «Объявления» (только клубов, где вы участник) и «Моя активность»
 *                  (досье: где был, часы волонтёрства и всего, клубы с датой вступления, предстоящие записи);
 * #/clubs/<id>   — страница клуба: описание, встречи; объявления и запись — только участникам.
 *                  Преподаватель (организатор) публикует объявления, видит всех записавшихся и отмечает, кто не пришёл.
 * #/dorm         — «Новости» (актуальная информация общежития) и «Обращения» (ремонт, жалобы, запросы со статусами).
 *                  Преподаватель выступает администрацией: публикует новости, меняет статус и отвечает на обращения.
 * Подключается перед app.js; хелперы app.js используются только во время вызова.
 */
const CLUB_ICONS = { ball: 'ball', hoop: 'hoop', heart: 'heart', msg: 'chat', crown: 'crown' };
const clubIcon = (k) => svg(CLUB_ICONS[k] || 'users');
const CLUBS = { tab: 'clubs', data: null };

function campusShell(title, back) {
  stopPoll();
  app.innerHTML = `${miniHead(title).replace('href="#/"', `href="${back || '#/'}"`)}<div id="pagebody" class="svc campus"><div class="load">${t('Загрузка…')}</div></div>${navHTML()}`;
  return document.getElementById('pagebody');
}
async function campusAct(path, body, okText, repaint) {
  try { await api(path, { method: 'POST', body }); if (okText) toast(okText); await repaint(); }
  catch (e) { toast(e.message, true); }
}
const isoOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const todayIso = () => isoOf(Date.now());
const fmtHours = (h) => t('{n} ч', { n: String(Math.round((h || 0) * 10) / 10).replace('.', getLang() === 'en' ? '.' : ',') });

/* ================================ Клубы ================================ */
async function viewClubs(id) {
  const pb = campusShell(id ? 'Клуб' : 'Клубы', id ? '#/clubs' : '#/');
  const repaint = async () => {
    try { CLUBS.data = await api('/clubs'); } catch (e) { pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
    if (!pb.isConnected) return;
    if (id) paintClub(pb, id, repaint); else paintClubs(pb, repaint);
  };
  await repaint();
}
function meetText(m) { return m ? `${weekdayName(m.day)}, ${m.time}${m.endTime ? '–' + m.endTime : ''} · ${tv(m.place)}` : ''; }
function eventDate(iso) { return `<div class="ev-date"><b>${esc(iso.slice(8))}</b><span>${esc(fmtDay(iso).replace(/^\d+\s*/, '').slice(0, 3))}</span></div>`; }
function attendanceHTML(e) {
  return `<div class="ev-att">${e.people.map((p) => `<button class="chip ${p.present ? 'on' : ''}" data-att="${esc(e.id)}" data-uid="${esc(p.id)}" data-v="${p.present ? '' : '1'}">${p.present ? svg('check') : svg('x')}${esc(p.fio)}</button>`).join('')}</div>`;
}
function eventHTML(e, showClub, past) {
  const full = e.limit && e.count >= e.limit && !e.going;
  const seats = e.limit ? t('мест: {n} из {m}', { n: e.count, m: e.limit }) : t('записались: {n}', { n: e.count });
  const teacher = S.user.role === 'teacher';
  return `<div class="card ev ${e.going ? 'going' : ''}">
    ${eventDate(e.date)}
    <div class="ev-t">
      ${showClub ? `<span class="ev-club">${clubIcon(e.icon)}${esc(tv(e.club))}</span>` : ''}
      <b>${esc(tv(e.title))}</b>
      ${e.text ? `<div class="ev-text">${esc(tv(e.text))}</div>` : ''}
      <span class="tx">${esc(fmtDay(e.date, true))}, ${esc(e.time)}${e.endTime ? '–' + esc(e.endTime) : ''}${e.place ? ' · ' + esc(tv(e.place)) : ''}</span>
      <span class="tx">${esc(seats)}${e.hours ? ' · ' + esc(t('засчитывается: {h}', { h: fmtHours(e.hours) })) : ''}${e.weekly ? ' · ' + t('регулярная встреча') : ''}</span>
      ${teacher && e.people.length ? (past
        ? `<div class="tx ev-hint">${t('Отметьте, кто не пришёл — это попадёт в профиль активности студента:')}</div>${attendanceHTML(e)}`
        : `<details class="ev-people"><summary>${t('Кто записался')}</summary>${e.people.map((p) => esc(p.fio)).join(', ')}</details>`) : ''}
      <div class="ev-btns">
        ${teacher ? '' : `<button class="btn ${e.going ? 'ghost' : 'pri'} sm" data-go="${esc(e.id)}" data-v="${e.going ? '' : '1'}" ${full ? 'disabled' : ''}>${e.going ? t('Отменить запись') : full ? t('Мест нет') : t('Записаться')}</button>`}
        ${e.mine && !past ? `<button class="btn danger-ghost sm" data-evdel="${esc(e.id)}">${t('Удалить')}</button>` : ''}
      </div>
    </div></div>`;
}
function clubCard(c) {
  const teacher = S.user.role === 'teacher';
  return `<div class="card club" data-club="${esc(c.id)}">
    <span class="club-ic">${clubIcon(c.icon)}</span>
    <div class="club-t"><b>${esc(tv(c.name))}</b><span class="tx">${esc(tv(c.desc))}</span>
      <span class="tx club-meta">${svg('users')}${t('участников: {n}', { n: c.members })}${c.meet ? ` · ${svg('clock')}${esc(meetText(c.meet))}` : ''}</span></div>
    ${teacher ? `<span class="chev">${svg('chev')}</span>` : `<button class="btn ${c.joined ? 'ghost' : 'pri'} sm" data-join="${esc(c.id)}" data-v="${c.joined ? '' : '1'}">${c.joined ? t('Вы в клубе') : t('Вступить')}</button>`}
  </div>`;
}
function bindClubActions(pb, repaint) {
  pb.querySelectorAll('[data-join]').forEach((b) => (b.onclick = (ev) => {
    ev.stopPropagation();
    const join = () => campusAct('/clubs/join', { id: b.dataset.join, on: !!b.dataset.v }, b.dataset.v ? t('Вы вступили в клуб — теперь вам видны его объявления') : t('Вы вышли из клуба'), repaint);
    if (b.dataset.v) return join();
    modal(t('Выйти из клуба?'), `<div class="tx">${t('Объявления клуба перестанут быть видны, записи на будущие встречи снимутся. История участия останется в профиле активности.')}</div><button class="btn danger-ghost" id="clLeave">${t('Выйти')}</button>`, (box, close) => { box.querySelector('#clLeave').onclick = () => { close(); join(); }; });
  }));
  pb.querySelectorAll('[data-club]').forEach((c) => (c.onclick = () => { location.hash = '#/clubs/' + c.dataset.club; }));
  pb.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => campusAct('/clubs/event/register', { id: b.dataset.go, on: !!b.dataset.v }, b.dataset.v ? t('Вы записаны на мероприятие') : t('Запись отменена'), repaint)));
  pb.querySelectorAll('[data-evdel]').forEach((b) => (b.onclick = () => campusAct('/clubs/event/delete', { id: b.dataset.evdel }, t('Мероприятие удалено'), repaint)));
  pb.querySelectorAll('[data-att]').forEach((b) => (b.onclick = () => campusAct('/clubs/event/attendance', { id: b.dataset.att, uid: b.dataset.uid, present: !!b.dataset.v }, '', repaint)));
  const nb = pb.querySelector('#evNew'); if (nb) nb.onclick = () => newEventDlg(nb.dataset.club || '', repaint);
}
function announcementsHTML(d) {
  const teacher = d.canCreate;
  if (!teacher && !d.items.some((c) => c.joined)) return `<div class="card next-empty">${t('Объявления видны участникам клуба. Вступите в клуб на вкладке «Клубы».')}</div>`;
  const upcoming = d.events.map((e) => eventHTML(e, true, false)).join('') || `<div class="card next-empty">${t('Ближайших мероприятий нет.')}</div>`;
  const recent = teacher && d.recent && d.recent.length ? `<div class="section-label">${t('Прошедшие — отметить присутствие')}</div>${d.recent.map((e) => eventHTML(e, true, true)).join('')}` : '';
  return upcoming + recent;
}
function activityHTML(a) {
  const stat = (v, l, cls) => `<div class="act-stat ${cls || ''}"><b>${esc(String(v))}</b><span>${t(l)}</span></div>`;
  const since = (ts) => ts ? t('с {d}', { d: fmtDay(isoOf(ts)) }) : '';
  return `
    <div class="card act-sum">
      ${stat(a.totals.events, 'мероприятий посещено')}
      ${stat(fmtHours(a.totals.volunteerHours), 'волонтёрства', 'vol')}
      ${stat(fmtHours(a.totals.hours), 'всего часов')}
      ${stat(a.totals.clubs, 'клубов')}
    </div>
    <div class="section-label">${t('Мои клубы')}</div>
    ${a.clubs.map((c) => `<div class="card act-club" data-club="${esc(c.id)}"><span class="club-ic">${clubIcon(c.icon)}</span>
      <div class="club-t"><b>${esc(tv(c.name))}</b><span class="tx">${esc(since(c.since))} · ${esc(t('посещений: {n}', { n: c.events }))} · ${esc(fmtHours(c.hours))}</span></div><span class="chev">${svg('chev')}</span></div>`).join('')
      || `<div class="card next-empty">${t('Вы пока не вступили ни в один клуб.')}</div>`}
    <div class="section-label">${t('Предстоящие записи')}</div>
    ${a.upcoming.map((e) => eventHTML(e, true, false)).join('') || `<div class="card next-empty">${t('Записей на мероприятия нет.')}</div>`}
    <div class="section-label">${t('История участия')}</div>
    ${a.history.length ? `<div class="card act-hist">${a.history.map((h) => `
      <div class="svc-log ${h.present ? '' : 'miss'}"><div><b>${esc(tv(h.title))}</b><small class="tx">${clubIcon(h.icon)} ${esc(tv(h.club))} · ${esc(fmtDay(h.date, true))}</small></div>
        <span class="badge ${h.present ? 'ok' : 'bad'}">${h.present ? esc(fmtHours(h.hours)) : t('не пришёл')}</span></div>`).join('')}</div>`
      : `<div class="card next-empty">${t('Здесь появятся мероприятия, в которых вы участвовали.')}</div>`}`;
}
function paintClubs(pb, repaint) {
  const d = CLUBS.data;
  const tabs = d.canCreate ? [['clubs', 'Клубы'], ['events', 'Объявления']] : [['clubs', 'Клубы'], ['events', 'Объявления'], ['activity', 'Моя активность']];
  if (!tabs.some((x) => x[0] === CLUBS.tab)) CLUBS.tab = 'clubs';
  const tab = CLUBS.tab;
  let body;
  if (tab === 'events') body = announcementsHTML(d);
  else if (tab === 'activity') body = activityHTML(d.activity);
  else body = d.items.map(clubCard).join('');
  pb.innerHTML = `${svcTabs('clTabs', tabs, tab)}
    ${d.canCreate && tab !== 'activity' ? `<button class="btn pri campus-new" id="evNew">${svg('plus')}${t('Создать объявление')}</button>` : ''}${body}`;
  pb.querySelector('#clTabs').onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { CLUBS.tab = b.dataset.tab; paintClubs(pb, repaint); } };
  bindClubActions(pb, repaint);
}
function paintClub(pb, id, repaint) {
  const d = CLUBS.data, c = d.items.find((x) => x.id === id);
  if (!c) { pb.innerHTML = `<div class="card next-empty">${t('Клуб не найден.')}</div>`; return; }
  const h = document.querySelector('.ptitle'); if (h) h.textContent = tv(c.name);
  const teacher = d.canCreate, canSee = teacher || c.joined;
  const events = d.events.filter((e) => e.clubId === id);
  const mine = d.activity && d.activity.clubs.find((x) => x.id === id);
  pb.innerHTML = `
    <div class="card club-hero">
      <span class="club-ic big">${clubIcon(c.icon)}</span>
      <div class="club-t"><b>${esc(tv(c.name))}</b><span class="tx">${esc(tv(c.desc))}</span>
        <span class="tx club-meta">${svg('users')}${t('участников: {n}', { n: c.members })}</span>
        ${c.meet ? `<span class="tx club-meta">${svg('clock')}${esc(t('Встречи: {v}', { v: meetText(c.meet) }))}</span>` : ''}
        ${mine ? `<span class="tx club-meta">${svg('star')}${esc(t('Вы в клубе с {d} · посещений: {n} · {h}', { d: fmtDay(isoOf(mine.since || Date.now())), n: mine.events, h: fmtHours(mine.hours) }))}</span>` : ''}</div>
      ${teacher ? '' : `<button class="btn ${c.joined ? 'ghost' : 'pri'}" data-join="${esc(c.id)}" data-v="${c.joined ? '' : '1'}">${c.joined ? t('Выйти из клуба') : t('Вступить в клуб')}</button>`}
    </div>
    <div class="section-label">${t('Объявления клуба')}</div>
    ${teacher ? `<button class="btn pri campus-new" id="evNew" data-club="${esc(id)}">${svg('plus')}${t('Создать объявление')}</button>` : ''}
    ${canSee ? (events.map((e) => eventHTML(e, false, false)).join('') || `<div class="card next-empty">${t('Ближайших мероприятий нет.')}</div>`)
      : `<div class="card club-lock">${svg('lock')}<div><b>${t('Объявления — только для участников')}</b><span class="tx">${t('Вступите в клуб, чтобы видеть его объявления и записываться на мероприятия.')}</span></div></div>`}
    ${teacher && d.recent ? d.recent.filter((e) => e.clubId === id).map((e) => eventHTML(e, false, true)).join('') : ''}`;
  bindClubActions(pb, repaint);
}
function newEventDlg(clubId, repaint) {
  const d = CLUBS.data;
  const iso = isoOf(Date.now() + 864e5 * 3);
  modal(t('Новое объявление'), `
    <label class="lbl">${t('Клуб')}</label>
    <select class="inp" id="neClub">${d.items.map((c) => `<option value="${esc(c.id)}" ${c.id === clubId ? 'selected' : ''}>${esc(tv(c.name))}</option>`).join('')}</select>
    <input class="inp" id="neTitle" maxlength="120" placeholder="${t('Название, например: Товарищеский матч')}">
    <textarea class="inp" id="neText" rows="3" maxlength="1000" placeholder="${t('Подробности: что взять, во сколько сбор (необязательно)')}"></textarea>
    <label class="lbl">${t('Дата и время')}</label>
    <input class="inp" id="neDate" type="date" min="${todayIso()}" value="${iso}">
    <div class="row2"><div><label class="lbl">${t('Начало')}</label><input class="inp" id="neTime" type="time" value="16:00"></div><div><label class="lbl">${t('Окончание')}</label><input class="inp" id="neEnd" type="time" value="18:00"></div></div>
    <input class="inp" id="nePlace" maxlength="120" placeholder="${t('Место')}">
    <div class="row2"><input class="inp" id="neLimit" type="number" min="0" max="1000" placeholder="${t('Мест (0 — без ограничения)')}"><input class="inp" id="neHours" type="number" min="0" max="24" step="0.5" placeholder="${t('Часов в зачёт (по умолч. — длительность)')}"></div>
    <div class="err"></div>
    <button class="btn pri" id="neGo">${t('Опубликовать')}</button>`, (box, close) => {
    box.querySelector('#neGo').onclick = async () => {
      const g = (s) => box.querySelector(s).value;
      try {
        await api('/clubs/event', { method: 'POST', body: { clubId: g('#neClub'), title: g('#neTitle'), text: g('#neText'), date: g('#neDate'), time: g('#neTime'), endTime: g('#neEnd'), place: g('#nePlace'), limit: Number(g('#neLimit') || 0), hours: Number(g('#neHours') || 0) } });
        close(); toast(t('Объявление опубликовано — его увидят участники клуба')); await repaint();
      } catch (e) { box.querySelector('.err').textContent = e.message; }
    };
  });
}

/* ============================== Общежитие ============================== */
const DORM_KIND = { repair: 'Ремонт', complaint: 'Жалоба', request: 'Запрос' };
const DORM_CATS = {
  repair: ['Сантехника', 'Электрика', 'Мебель', 'Окна и двери', 'Интернет', 'Отопление', 'Другое'],
  complaint: ['Шум', 'Чистота', 'Соседи', 'Персонал', 'Другое'],
  request: ['Переселение', 'Справка о проживании', 'Гости', 'Другое'],
};
const DORM_ST = { new: ['Принята', ''], work: ['В работе', 'warn'], done: ['Выполнена', 'ok'], rejected: ['Отклонена', 'bad'] };
const DORM_TAG = { important: ['Важно', 'bad'], info: ['Инфо', ''], event: ['Событие', 'ok'] };
const DORM = { tab: 'news', kind: 'repair' };
async function viewDorm() {
  const pb = campusShell('Общежитие');
  const repaint = async () => {
    let d;
    try { d = await api('/dorm'); } catch (e) { pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
    if (pb.isConnected) paintDorm(pb, d, repaint);
  };
  await repaint();
}
function newsHTML(n, staff) {
  const tg = DORM_TAG[n.tag] || DORM_TAG.info;
  return `<div class="card dn ${n.tag === 'important' ? 'imp' : ''}">
    <div class="svc-row"><span class="badge ${tg[1]}">${t(tg[0])}</span><small class="tx">${esc(fmtWhen(n.at))}</small></div>
    <b>${esc(tv(n.title))}</b>${n.text ? `<div class="dn-t">${esc(tv(n.text))}</div>` : ''}
    <div class="svc-row"><small class="tx">${esc(tv(n.author || ''))}</small>${staff ? `<button class="btn danger-ghost sm" data-ndel="${esc(n.id)}">${t('Удалить')}</button>` : ''}</div>
  </div>`;
}
function requestHTML(r, staff) {
  const st = DORM_ST[r.status] || DORM_ST.new;
  return `<div class="card dr">
    <div class="svc-row"><b>${t(DORM_KIND[r.kind] || r.kind)}${r.category ? ' · ' + esc(tv(r.category)) : ''}</b><span class="badge ${st[1]}">${t(st[0])}</span></div>
    <div class="tx">${r.room ? esc(t('Комната {r}', { r: r.room })) + ' · ' : ''}${esc(fmtWhen(r.at))}${staff ? ' · ' + (r.anon ? t('анонимно') : esc(r.author || '')) : r.anon ? ' · ' + t('анонимно') : ''}</div>
    <div class="dr-t">${esc(r.text)}</div>
    ${r.reply ? `<div class="dr-reply">${svg('msg')}<span><b>${t('Ответ администрации:')}</b> ${esc(r.reply)}</span></div>` : ''}
    ${staff ? `<div class="dr-staff">
      <input class="inp" data-reply="${esc(r.id)}" maxlength="500" placeholder="${t('Ответ студенту (необязательно)')}">
      <div class="chips svc-wrap">${Object.entries(DORM_ST).map(([k, v]) => `<button class="chip ${r.status === k ? 'on' : ''}" data-st="${k}" data-id="${esc(r.id)}">${t(v[0])}</button>`).join('')}</div>
    </div>` : ''}
  </div>`;
}
function dormFormHTML() {
  const k = DORM.kind;
  return `<div class="card">
    <b>${t('Новое обращение')}</b>
    <div class="chips svc-wrap" id="drKind">${Object.entries(DORM_KIND).map(([v, l]) => `<button class="chip ${k === v ? 'on' : ''}" data-v="${v}">${t(l)}</button>`).join('')}</div>
    <label class="lbl">${t('Категория')}</label>
    <div class="chips svc-wrap" id="drCat">${DORM_CATS[k].map((c, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-v="${esc(c)}">${t(c)}</button>`).join('')}</div>
    <input class="inp" id="drRoom" maxlength="20" placeholder="${t('Номер комнаты')}">
    <textarea class="inp" id="drText" rows="3" maxlength="1000" placeholder="${t(k === 'repair' ? 'Что сломалось и где' : k === 'complaint' ? 'Опишите ситуацию' : 'Что вам нужно')}"></textarea>
    ${k === 'complaint' ? `<label class="dr-anon"><input type="checkbox" id="drAnon"> ${t('Отправить анонимно')}</label>` : ''}
    <button class="btn pri" id="drSend">${t('Отправить')}</button>
  </div>`;
}
function paintDorm(pb, d, repaint) {
  const tab = DORM.tab, staff = d.staff;
  const open = d.requests.filter((r) => r.status === 'new' || r.status === 'work').length;
  let body;
  if (tab === 'news') {
    body = `${staff ? `<div class="card"><b>${t('Опубликовать новость')}</b>
      <div class="chips svc-wrap" id="dnTag">${Object.entries(DORM_TAG).map(([k, v], i) => `<button class="chip ${i === 1 ? 'on' : ''}" data-v="${k}">${t(v[0])}</button>`).join('')}</div>
      <input class="inp" id="dnTitle" maxlength="120" placeholder="${t('Заголовок')}"><textarea class="inp" id="dnText" rows="3" maxlength="1000" placeholder="${t('Текст новости')}"></textarea>
      <button class="btn pri" id="dnAdd">${t('Опубликовать')}</button></div>` : ''}
      ${d.news.map((n) => newsHTML(n, staff)).join('') || `<div class="card next-empty">${t('Новостей пока нет.')}</div>`}`;
  } else {
    body = `${staff ? '' : dormFormHTML()}
      <div class="section-label">${staff ? t('Обращения студентов') : t('Мои обращения')}</div>
      ${d.requests.map((r) => requestHTML(r, staff)).join('') || `<div class="card next-empty">${t('Обращений пока нет.')}</div>`}`;
  }
  pb.innerHTML = `${svcTabs('drTabs', [['news', 'Новости'], ['req', staff ? 'Обращения' : 'Жалобы и ремонт']], tab)}${body}`;
  if (open) { const b = pb.querySelector('#drTabs [data-tab="req"]'); if (b) b.insertAdjacentHTML('beforeend', ` <span class="ml-n">${open}</span>`); }
  pb.querySelector('#drTabs').onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { DORM.tab = b.dataset.tab; paintDorm(pb, d, repaint); } };
  pb.querySelectorAll('.chips').forEach((g) => (g.onclick = (ev) => {
    const b = ev.target.closest('.chip'); if (!b || b.dataset.st) return;
    if (g.id === 'drKind') { DORM.kind = b.dataset.v; paintDorm(pb, d, repaint); return; }
    g.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
  }));
  bindDorm(pb, repaint);
}
function bindDorm(pb, repaint) {
  const pick = (id) => { const c = pb.querySelector(`#${id} .chip.on`); return c ? c.dataset.v : ''; };
  const val = (id) => { const el = pb.querySelector('#' + id); return el ? el.value : ''; };
  const on = (id, fn) => { const el = pb.querySelector('#' + id); if (el) el.onclick = fn; };
  on('drSend', () => campusAct('/dorm/request', { kind: DORM.kind, category: pick('drCat'), room: val('drRoom'), text: val('drText'), anon: !!(pb.querySelector('#drAnon') || {}).checked }, t('Обращение отправлено'), repaint));
  on('dnAdd', () => campusAct('/dorm/news', { tag: pick('dnTag'), title: val('dnTitle'), text: val('dnText') }, t('Новость опубликована'), repaint));
  pb.querySelectorAll('[data-ndel]').forEach((b) => (b.onclick = () => campusAct('/dorm/news/delete', { id: b.dataset.ndel }, t('Новость удалена'), repaint)));
  pb.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => {
    const reply = (pb.querySelector(`[data-reply="${b.dataset.id}"]`) || {}).value || '';
    campusAct('/dorm/status', { id: b.dataset.id, status: b.dataset.st, reply }, t('Статус обновлён — студент получит уведомление'), repaint);
  }));
}
