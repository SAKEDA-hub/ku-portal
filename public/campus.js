'use strict';
/* KU Portal — «Клубы» и «Общежитие» (сервер: portal-features.js, /api/clubs*, /api/dorm*).
 *
 * #/clubs        — студент: профиль активности (уровень по часам, статистика, мои клубы с вкладом, поиск клуба с заявкой,
 *                  активность по месяцам, достижения, предстоящие записи, история). Канал и чат клуба — только в KU Message:
 *                  клуб появляется там, когда глава примет заявку; здесь — кнопка «Чат клуба».
 *                  Преподаватель (глава клуба): заявки на вступление, отметка неявки на прошедших мероприятиях, список клубов.
 * #/clubs/<id>   — та же страница с открытой карточкой клуба.
 * #/dorm         — «Новости» (актуальная информация общежития) и «Обращения» (ремонт, жалобы, запросы со статусами).
 *                  Преподаватель выступает администрацией: публикует новости, меняет статус и отвечает на обращения.
 * Подключается перед app.js; хелперы app.js используются только во время вызова.
 */
const CLUB_ICONS = { ball: 'ball', hoop: 'hoop', heart: 'heart', msg: 'chat', crown: 'crown' };
const clubIcon = (k) => svg(CLUB_ICONS[k] || 'users');
const CLUBS = { data: null };

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
  const pb = campusShell('Клубы', '#/');
  let open = id; // #/clubs/<id> — открыть карточку клуба поверх страницы
  const repaint = async () => {
    try { CLUBS.data = await api('/clubs'); } catch (e) { pb.innerHTML = `<div class="load">${esc(e.message)}</div>`; return; }
    if (!pb.isConnected) return;
    // студент, который ведёт клуб (права клубов из админ-панели), — обычный студент: сверху заявки и посещения его клубов,
    // ниже весь экран студента (свои клубы, вступление в другие, активность) — ревью п.14–16
    if (CLUBS.data.canCreate && CLUBS.data.activity) {
      pb.innerHTML = '<div id="clLead"></div><div id="clStudent"></div>';
      paintLead(document.getElementById('clLead'), repaint);
      paintClubs(document.getElementById('clStudent'), repaint);
    } else if (CLUBS.data.canCreate) paintLead(pb, repaint);
    else paintClubs(pb, repaint);
    const c = open && CLUBS.data.items.find((x) => x.id === open);
    open = '';
    if (c) clubDlg(c, repaint);
  };
  await repaint();
}
function meetText(m) { return m ? `${weekdayName(m.day)}, ${m.time}${m.endTime ? '–' + m.endTime : ''} · ${tv(m.place)}` : ''; }
/* Цвет клуба — тот же, что у его значка в KU Message */
const clubHue = (id) => { let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const clubAva = (c, cls) => `<span class="cl-av ${cls || ''}" style="--h:${clubHue(c.id)}">${clubIcon(c.icon)}</span>`;
function eventDate(iso) { return `<div class="ev-date"><b>${esc(iso.slice(8))}</b><span>${esc(fmtDay(iso).replace(/^\d+\s*/, '').slice(0, 3))}</span></div>`; }
const chatBtn = (c, cls) => `<button class="btn pri ${cls || ''}" data-km="/c/${esc(c.id)}">${svg('kumsg')}${t('Чат клуба')}</button>`;
/* Студент: «Подать заявку» → «Заявка отправлена» (можно отозвать) → после решения главы — чат клуба в KU Message */
function joinBtn(c, cls) {
  const [mode, kind, label] = c.joined ? ['leave', 'danger-ghost', 'Выйти из клуба'] : c.pending ? ['cancel', 'ghost', 'Отозвать заявку'] : ['apply', 'pri', 'Подать заявку'];
  return `<button class="btn ${kind} ${cls || ''}" data-join="${esc(c.id)}" data-mode="${mode}">${mode === 'apply' ? svg('plus') : ''}${t(label)}</button>`;
}
function bindClubActions(root, repaint, done) {
  root.querySelectorAll('[data-join]').forEach((b) => (b.onclick = (ev) => {
    ev.stopPropagation();
    const mode = b.dataset.mode;
    const join = () => { if (done) done(); campusAct('/clubs/join', { id: b.dataset.join, on: mode === 'apply' }, t(mode === 'apply' ? 'Заявка отправлена — глава клуба её рассмотрит' : mode === 'cancel' ? 'Заявка отозвана' : 'Вы вышли из клуба'), repaint); };
    if (mode !== 'leave') return join();
    modal(t('Выйти из клуба?'), `<div class="tx">${t('Чат клуба в KU Message пропадёт, записи на будущие встречи снимутся. История участия останется в профиле активности.')}</div><button class="btn danger-ghost" id="clLeave">${t('Выйти')}</button>`, (box, close) => { box.querySelector('#clLeave').onclick = () => { close(); join(); }; });
  }));
  root.querySelectorAll('[data-req]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); campusAct('/clubs/request', { id: b.dataset.req, uid: b.dataset.uid, accept: !!b.dataset.v }, t(b.dataset.v ? 'Студент принят — у него появился чат клуба в KU Message' : 'Заявка отклонена'), repaint); }));
  root.querySelectorAll('[data-km]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); openMessage(false, b.dataset.km); }));
  root.querySelectorAll('[data-att]').forEach((b) => (b.onclick = () => campusAct('/clubs/event/attendance', { id: b.dataset.att, uid: b.dataset.uid, present: !!b.dataset.v }, '', repaint)));
  root.querySelectorAll('[data-club]').forEach((el) => (el.onclick = () => { const c = CLUBS.data.items.find((x) => x.id === el.dataset.club); if (c) clubDlg(c, repaint); }));
}
/* Карточка клуба: описание, встречи и одно действие — по состоянию участия */
function clubDlg(c, repaint) {
  const teacher = c.manage; // руководитель этого клуба
  const facts = [[svg('users'), t('участников: {n}', { n: c.members })], c.meet ? [svg('clock'), meetText(c.meet)] : null, c.since ? [svg('star'), t('Вы в клубе с {d}', { d: fmtDay(isoOf(c.since)) })] : null].filter(Boolean);
  const note = teacher ? 'Публикации и мероприятия — в канале клуба в KU Message.' : c.joined ? 'Канал и чат клуба — в KU Message.' : c.pending ? 'Глава клуба скоро рассмотрит вашу заявку. Когда её примут, в KU Message появится чат клуба.' : 'Когда глава клуба примет заявку, в KU Message появятся канал и чат клуба.';
  modal(tv(c.name), `<div class="cl-dlg" style="--h:${clubHue(c.id)}">${clubAva(c, 'xl')}
      <p class="tx">${esc(tv(c.desc))}</p>
      <div class="cl-facts">${facts.map(([ic, v]) => `<span>${ic}${esc(v)}</span>`).join('')}</div>
      <div class="cl-note ${c.pending ? 'wait' : ''}">${svg(c.pending ? 'clock' : 'kumsg')}<span>${t(note)}</span></div>
      ${teacher || c.joined ? chatBtn(c, 'wide') : ''}${teacher || !CLUBS.data.canJoin ? '' : joinBtn(c, 'wide')}</div>`, (box, close) => bindClubActions(box, repaint, close));
}

/* ---------- студент: профиль активности и клубы ---------- */
/* Уровень по засчитанным часам — для профиля активности */
const ACT_LEVELS = [[0, 'Новичок'], [5, 'Участник'], [15, 'Активист'], [30, 'Лидер'], [60, 'Легенда кампуса']];
function actLevel(h) {
  let i = 0; while (i + 1 < ACT_LEVELS.length && h >= ACT_LEVELS[i + 1][0]) i++;
  const next = ACT_LEVELS[i + 1];
  return { name: ACT_LEVELS[i][1], idx: i, next, pct: next ? Math.min(1, (h - ACT_LEVELS[i][0]) / (next[0] - ACT_LEVELS[i][0])) : 1 };
}
/* Часы по месяцам за полгода (из истории участия) */
function actMonths(history) {
  const now = new Date(), out = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: getLang() === 'kk' ? cap(KK_MONTHS[d.getMonth()].slice(0, 3)) : d.toLocaleDateString(LOCALES[getLang()] || 'ru-RU', { month: 'short' }).replace('.', ''), hours: history.filter((h) => h.present && h.date.startsWith(key)).reduce((n, h) => n + h.hours, 0) });
  }
  return out;
}
function actBadges(a) {
  const tt = a.totals, present = a.history.filter((h) => h.present).length;
  return [
    ['star', 'Первый шаг', 'Посетить первое мероприятие', tt.events >= 1],
    ['heart', 'Волонтёр', '5 часов волонтёрства', tt.volunteerHours >= 5],
    ['clock', '10 часов', '10 засчитанных часов', tt.hours >= 10],
    ['users', 'Командный игрок', 'Состоять в 3 клубах', tt.clubs >= 3],
    ['check', 'Без пропусков', '3+ мероприятия и ни одной неявки', present >= 3 && present === a.history.length],
    ['crown', 'Марафонец', 'Посетить 10 мероприятий', tt.events >= 10],
  ];
}
function heroHTML(a) {
  const lv = actLevel(a.totals.hours), R = 42, C = 2 * Math.PI * R;
  const tile = (ic, v, l) => `<div class="ah-tile"><span>${svg(ic)}</span><b>${esc(String(v))}</b><small>${t(l)}</small></div>`;
  return `<div class="act-hero2">
      <div class="ah-top">
        <div class="act-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" class="trk"/>${lv.pct ? `<circle cx="50" cy="50" r="${R}" class="val" style="stroke-dasharray:${(C * lv.pct).toFixed(1)} ${C.toFixed(1)}"/>` : ''}</svg>
          <span><b>${esc(fmtHours(a.totals.hours))}</b><small>${t('в зачёт')}</small></span></div>
        <div class="act-me">
          <span class="act-kicker">${t('Профиль активности')}</span>
          <b>${esc(S.user.fio)}</b>
          <span class="act-lv lv${lv.idx}">${svg('star')}${t(lv.name)}</span>
          <span class="ah-next">${lv.next ? esc(t('До уровня «{l}» — {h}', { l: t(lv.next[1]), h: fmtHours(lv.next[0] - a.totals.hours) })) : t('Максимальный уровень — так держать!')}</span>
        </div>
      </div>
      <div class="ah-tiles">
        ${tile('calendar', a.totals.events, 'мероприятий')}
        ${tile('heart', fmtHours(a.totals.volunteerHours), 'волонтёрства')}
        ${tile('users', a.totals.clubs, 'клубов')}
      </div>
    </div>`;
}
function myClubHTML(c, stat, maxH) {
  return `<div class="card cl-my" data-club="${esc(c.id)}">${clubAva(c)}
    <div class="club-t"><div class="act-cl-h"><b>${esc(tv(c.name))}</b><span>${esc(fmtHours(stat.hours))}</span></div>
      <div class="act-meter" style="--h:${clubHue(c.id)}"><i style="width:${Math.max(4, Math.round((stat.hours / maxH) * 100))}%"></i></div>
      <span class="tx">${esc([stat.since ? t('с {d}', { d: fmtDay(isoOf(stat.since)) }) : '', t('посещений: {n}', { n: stat.events })].filter(Boolean).join(' · '))}</span></div>
    ${chatBtn(c, 'sm')}</div>`;
}
function findClubHTML(c) {
  return `<div class="cl-card ${c.pending ? 'pending' : ''}" data-club="${esc(c.id)}" style="--h:${clubHue(c.id)}">
    <div class="cl-cover">${clubAva(c, 'lg')}${c.pending ? `<span class="cl-wait">${svg('clock')}${t('ждёт ответа')}</span>` : ''}</div>
    <div class="cl-body"><b>${esc(tv(c.name))}</b><span class="tx cl-desc">${esc(tv(c.desc))}</span>
      <span class="tx club-meta">${svg('users')}${esc(t('участников: {n}', { n: c.members }))}${c.meet ? ` · ${esc(weekdayName(c.meet.day))}, ${esc(c.meet.time)}` : ''}</span></div>
    ${joinBtn(c, 'sm wide')}</div>`;
}
function paintClubs(pb, repaint) {
  const d = CLUBS.data, a = d.activity;
  // клубы, которые студент ведёт, показаны выше (paintLead) — в «Найти клуб» их нет
  const mine = d.items.filter((c) => c.joined), rest = d.items.filter((c) => !c.joined && !c.manage).sort((x, y) => y.pending - x.pending);
  const stat = (c) => a.clubs.find((x) => x.id === c.id) || { hours: 0, events: 0, since: c.since };
  const maxH = Math.max(1, ...mine.map((c) => stat(c).hours));
  const months = actMonths(a.history), maxM = Math.max(1, ...months.map((m) => m.hours));
  const badges = actBadges(a), got = badges.filter((b) => b[3]).length;
  pb.innerHTML = `${heroHTML(a)}
    <div class="section-label">${t('Мои клубы')}</div>
    ${mine.length ? mine.map((c) => myClubHTML(c, stat(c), maxH)).join('')
      : `<div class="card cl-empty">${svg('kumsg')}<div><b>${t('Вы пока не состоите в клубах')}</b><span class="tx">${t('Подайте заявку ниже — когда глава клуба её примет, в KU Message появится чат клуба.')}</span></div></div>`}
    ${rest.length ? `<div class="section-label">${t('Найти клуб')}</div><div class="cl-grid">${rest.map(findClubHTML).join('')}</div>` : ''}
    <div class="section-label">${t('Активность за полгода')}</div>
    <div class="card act-chart">${months.map((m) => `<div class="act-bar ${m.hours ? '' : 'zero'}" title="${esc(fmtHours(m.hours))}"><span class="act-bv">${m.hours ? esc(fmtHours(m.hours)) : ''}</span><i style="height:${Math.max(4, Math.round((m.hours / maxM) * 100))}%"></i><small>${esc(m.label)}</small></div>`).join('')}</div>
    <div class="section-label">${esc(t('Достижения · {n} из {m}', { n: got, m: badges.length }))}</div>
    <div class="act-badges">${badges.map(([ic, ti, ds, ok]) => `<div class="act-badge ${ok ? 'ok' : ''}"><span>${svg(ok ? ic : 'lock')}</span><b>${t(ti)}</b><small>${t(ds)}</small></div>`).join('')}</div>
    ${a.upcoming.length ? `<div class="section-label">${t('Предстоящие записи')}</div><div class="card act-up">${a.upcoming.map((e) => `<div class="act-up-i">${eventDate(e.date)}
      <div><b>${esc(tv(e.title))}</b><small class="tx">${esc(tv(e.club))} · ${esc(e.time)}${e.place ? ' · ' + esc(tv(e.place)) : ''}</small></div></div>`).join('')}</div>` : ''}
    <div class="section-label">${t('История участия')}</div>
    ${a.history.length ? `<div class="card act-tl">${a.history.map((h) => `
      <div class="act-tl-i ${h.present ? '' : 'miss'}"><span class="act-dot">${clubIcon(h.icon)}</span>
        <div><b>${esc(tv(h.title))}</b><small class="tx">${esc(tv(h.club))} · ${esc(fmtDay(h.date, true))}</small></div>
        <span class="badge ${h.present ? 'ok' : 'bad'}">${h.present ? '+' + esc(fmtHours(h.hours)) : t('не пришёл')}</span></div>`).join('')}</div>`
      : `<div class="card next-empty">${t('Здесь появятся мероприятия, в которых вы участвовали.')}</div>`}`;
  bindClubActions(pb, repaint);
}

/* ---------- преподаватель (глава клуба): заявки, присутствие, свои клубы ---------- */
function requestsHTML(d) {
  const rows = d.items.flatMap((c) => (c.requests || []).map((r) => Object.assign({ club: c }, r)));
  if (!rows.length) return `<div class="card next-empty">${t('Новых заявок нет.')}</div>`;
  return `<div class="card cl-reqs">${rows.map((r) => `
    <div class="cl-req">${clubAva(r.club, 'sm')}
      <div class="club-t"><b>${esc(r.fio)}</b><span class="tx">${esc([r.group, tv(r.club.name), t('заявка от {d}', { d: fmtDay(isoOf(r.at)) })].filter(Boolean).join(' · '))}</span></div>
      <span class="cl-req-b"><button class="btn pri sm" data-req="${esc(r.club.id)}" data-uid="${esc(r.id)}" data-v="1">${t('Принять')}</button>
      <button class="btn ghost sm" data-req="${esc(r.club.id)}" data-uid="${esc(r.id)}" data-v="">${t('Отклонить')}</button></span></div>`).join('')}</div>`;
}
function attendanceHTML(e) {
  return `<div class="card ev">${eventDate(e.date)}
    <div class="ev-t"><span class="ev-club">${clubIcon(e.icon)}${esc(tv(e.club))}</span><b>${esc(tv(e.title))}</b>
      <span class="tx">${esc(fmtDay(e.date, true))}, ${esc(e.time)}${e.hours ? ' · ' + esc(t('засчитывается: {h}', { h: fmtHours(e.hours) })) : ''}</span>
      <div class="ev-att">${e.people.map((p) => `<button class="chip ${p.present ? 'on' : ''}" data-att="${esc(e.id)}" data-uid="${esc(p.id)}" data-v="${p.present ? '' : '1'}">${p.present ? svg('check') : svg('x')}${esc(p.fio)}</button>`).join('')}</div></div></div>`;
}
function paintLead(pb, repaint) {
  const d = CLUBS.data;
  pb.innerHTML = `
    <div class="section-label">${t('Заявки на вступление')}</div>${requestsHTML(d)}
    ${d.recent && d.recent.length ? `<div class="section-label">${t('Отметьте, кто не пришёл')}</div><div class="tx cl-hint">${t('Отметка попадёт в профиль активности студента.')}</div>${d.recent.map(attendanceHTML).join('')}` : ''}
    <div class="section-label">${t(d.activity ? 'Клубы, которые вы ведёте' : 'Клубы')}</div>
    <div class="tx cl-hint">${t('Публикации и мероприятия — в канале клуба в KU Message.')}</div>
    ${d.items.filter((c) => c.manage).map((c) => `<div class="card cl-my" data-club="${esc(c.id)}">${clubAva(c)}
      <div class="club-t"><b>${esc(tv(c.name))}</b><span class="tx">${esc(t('участников: {n}', { n: c.members }))}${c.meet ? ' · ' + esc(meetText(c.meet)) : ''}</span>
        ${c.requests && c.requests.length ? `<span class="badge bad">${esc(t('заявок: {n}', { n: c.requests.length }))}</span>` : ''}</div>
      ${chatBtn(c, 'sm')}</div>`).join('')}`;
  bindClubActions(pb, repaint);
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
