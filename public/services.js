'use strict';
/* KU Portal — демо-сервис студента «Голосование» и общие хелперы экранов сервисов (svcTabs, svcBar — их использует и campus.js).
 *
 * Голосование — макет, который ведёт себя как рабочий: голоса хранятся в браузере (localStorage ku_svc:<userId>:votes)
 * и сохраняются между заходами. Сервер для него не нужен. На экране есть пометка «Демо-режим».
 * Подключается перед app.js; использует его хелперы (svg, esc, t, api, miniHead, navHTML, stopPoll, toast, modal, S, app)
 * только во время вызова. Маршрут: #/voting (см. route() в app.js).
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
