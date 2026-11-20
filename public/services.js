'use strict';
/* KU Portal — сервис «Голосование» (опросы на сервере, server/polls.js) и общие хелперы экранов сервисов
 * (svcTabs, svcBar — их использует и campus.js).
 * Подключается перед app.js; использует его хелперы (svg, esc, t, api, miniHead, navHTML, stopPoll, toast, modal, S, app)
 * только во время вызова. Маршрут: #/voting (см. route() в app.js).
 */

/* ---------- общее ---------- */
const svcIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function svcTabs(id, tabs, cur) {
  return `<div class="tabs svc-tabs" id="${id}">${tabs.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-tab="${k}">${t(l)}</button>`).join('')}</div>`;
}
function svcBar(pct, cls) { return `<div class="svc-bar ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`; }

/* ============================ Голосование ============================ */
/* Опросы на сервере (server/polls.js): создаёт администратор портала, голосуют все, кому опрос адресован.
   Анонимно, один голос на опрос; результаты видны после своего голоса и в завершённых. */
let pollsState = null;
async function viewVoting(tab) {
  stopPoll();
  app.innerHTML = `${miniHead('Голосование')}<div id="pagebody" class="svc"><div class="card next-empty">${t('Загрузка…')}</div></div>${navHTML()}`;
  const pb = document.getElementById('pagebody');
  try { pollsState = await api('/polls'); } catch (e) { pb.innerHTML = `<div class="card next-empty">${esc(e.message)}</div>`; return; }
  paintVoting(pb, tab || 'active');
}
const pollOpt = (o) => esc(/[а-яё]/i.test(o) ? tv(o) : o);
const pollEnd = (ms) => fmtDay(svcIso(new Date(ms)));
function pollCard(p, manage) {
  const show = !!p.counts, max = show ? Math.max(...p.counts) : 0, total = p.total || 0;
  const badge = p.voted ? `<span class="badge ok">${t('Вы проголосовали')}</span>` : p.closed ? `<span class="badge">${t('Завершено')}</span>` : '';
  const who = p.groups.length ? p.groups.join(', ') : p.audience === 'students' ? t('Студенты') : t('Все пользователи');
  return `<div class="card svc-item" data-id="${esc(p.id)}">
    <div class="svc-row"><b>${esc(p.q)}</b>${badge}</div>
    <div class="tx">${p.closed ? t('Завершено {d}', { d: pollEnd(p.endsAt) }) : t('До {d} · голосов: {n}', { d: pollEnd(p.endsAt), n: total })}${manage ? ' · ' + esc(who) : ''}</div>
    <div class="svc-opts">${p.opts.map((o, i) => {
      const pc = total ? Math.round(p.counts && p.counts[i] / total * 100) : 0;
      return show
        ? `<div class="svc-res ${p.counts[i] === max && total ? 'top' : ''}"><div class="svc-row"><span>${pollOpt(o)}</span><b>${pc}% · ${p.counts[i]}</b></div>${svcBar(pc)}</div>`
        : `<button class="svc-opt" data-opt="${i}"><i></i>${pollOpt(o)}</button>`;
    }).join('')}</div>
    ${!p.voted && !p.closed ? `<button class="btn pri" data-vote disabled>${t('Проголосовать')}</button>` : ''}
    ${manage ? `<div class="svc-row" style="gap:8px;justify-content:flex-end;margin-top:8px">${p.closed ? '' : `<button class="btn ghost" data-close>${t('Завершить')}</button>`}<button class="btn ghost" data-del>${t('Удалить')}</button></div>` : ''}
  </div>`;
}
function paintVoting(pb, tab) {
  const { items, manage } = pollsState;
  const list = items.filter((p) => (tab === 'active') !== p.closed);
  pb.innerHTML = `${svcTabs('vtTabs', [['active', 'Активные'], ['closed', 'Завершённые']], tab)}
    ${manage ? `<button class="btn pri" id="pollNew" style="margin-bottom:12px">${t('Новый опрос')}</button>` : ''}
    ${list.map((p) => pollCard(p, manage)).join('') || `<div class="card next-empty">${t('Опросов нет.')}</div>`}
    <div class="tx svc-foot">${t('Голосование анонимное. Один голос на опрос, изменить его нельзя.')}</div>`;
  pb.querySelector('#vtTabs').onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) paintVoting(pb, b.dataset.tab); };
  const reload = () => viewVoting(tab);
  if (manage) pb.querySelector('#pollNew').onclick = () => newPollDlg(reload);
  pb.querySelectorAll('.svc-item').forEach((card) => {
    const id = card.dataset.id, vote = card.querySelector('[data-vote]');
    card.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => {
      card.querySelectorAll('.svc-opt').forEach((x) => x.classList.toggle('on', x === b));
      vote.disabled = false; vote.dataset.choice = b.dataset.opt;
    }));
    if (vote) vote.onclick = async () => {
      if (vote.dataset.choice == null) return;
      vote.disabled = true;
      try { await api('/polls/vote', { method: 'POST', body: { id, opt: Number(vote.dataset.choice) } }); toast(t('Ваш голос учтён')); reload(); }
      catch (e) { toast(e.message, true); vote.disabled = false; }
    };
    const act = (sel, path, msg) => { const b = card.querySelector(sel); if (b) b.onclick = async () => {
      try { await api(path, { method: 'POST', body: { id } }); toast(t(msg)); reload(); } catch (e) { toast(e.message, true); }
    }; };
    act('[data-close]', '/polls/close', 'Опрос завершён');
    act('[data-del]', '/polls/delete', 'Опрос удалён');
  });
}
function newPollDlg(done) {
  modal(t('Новый опрос'), `
    <input class="inp" id="pq" maxlength="200" placeholder="${t('Вопрос')}">
    <textarea class="inp" id="po" rows="4" placeholder="${t('Варианты ответа — каждый с новой строки (2–8)')}"></textarea>
    <label class="lbl">${t('Сколько дней идёт голосование')}</label>
    <input class="inp" id="pd" type="number" min="1" max="60" value="7">
    <label class="lbl">${t('Кто голосует')}</label>
    <select class="inp" id="pa"><option value="all">${t('Все пользователи')}</option><option value="students">${t('Студенты')}</option></select>
    <input class="inp" id="pg" placeholder="${t('Только группы (через запятую, необязательно)')}">
    <div class="err"></div>
    <button class="btn pri" id="pSave">${t('Опубликовать')}</button>`, (box, close) => {
    box.querySelector('#pSave').onclick = async () => {
      const body = {
        q: box.querySelector('#pq').value, opts: box.querySelector('#po').value.split('\n').map((s) => s.trim()).filter(Boolean),
        days: Number(box.querySelector('#pd').value), audience: box.querySelector('#pa').value,
        groups: box.querySelector('#pg').value.split(',').map((s) => s.trim()).filter(Boolean),
      };
      try { await api('/polls/create', { method: 'POST', body }); close(); toast(t('Опрос опубликован')); done(); }
      catch (e) { const er = box.querySelector('.err'); if (er) er.textContent = e.message; }
    };
  });
}

/* ============================ Помощь (преподаватель) ============================ */
/* Обращения к администрации портала (server/help.js, ревью п.10): вопрос, расписание (обжалование, ошибка),
   технический сбой, другое. Ответ и статус приходят сюда и в уведомления; отвечает администратор в админ-панели. */
const HELP_CATS = { question: 'Вопрос', schedule: 'Расписание', tech: 'Технический сбой', other: 'Другое' };
const HELP_ST = { new: ['Принято', ''], work: ['В работе', 'warn'], done: ['Решено', 'ok'], rejected: ['Отклонено', 'bad'] };
async function viewHelp() {
  stopPoll();
  app.innerHTML = `${miniHead('Помощь')}<div id="pagebody" class="svc"><div class="card next-empty">${t('Загрузка…')}</div></div>${navHTML()}`;
  const pb = document.getElementById('pagebody');
  let d;
  try { d = await api('/help'); } catch (e) { pb.innerHTML = `<div class="card next-empty">${esc(e.message)}</div>`; return; }
  if (!pb.isConnected) return;
  pb.innerHTML = `
    <div class="card">
      <div class="stud-fio">${t('Новое обращение')}</div>
      <div class="tx" style="margin:4px 0 10px">${t('Задайте вопрос администрации портала, сообщите об ошибке в расписании или обжалуйте его. Ответ придёт сюда и в уведомления.')}</div>
      <label class="lbl" for="hCat">${t('Тема')}</label>
      <select class="inp" id="hCat">${Object.entries(HELP_CATS).map(([k, l]) => `<option value="${k}">${t(l)}</option>`).join('')}</select>
      <label class="lbl" for="hText">${t('Сообщение')}</label>
      <textarea class="inp" id="hText" rows="4" maxlength="2000" placeholder="${t('Опишите вопрос: группа, предмет, день недели — всё, что поможет разобраться')}"></textarea>
      <button class="btn pri" id="hSend">${t('Отправить')}</button>
    </div>
    <div class="section-label">${t('Мои обращения')}</div>
    ${d.items.length ? d.items.map((r) => {
      const [st, cls] = HELP_ST[r.status] || HELP_ST.new;
      return `<div class="card svc-item">
        <div class="svc-row"><b>${t(HELP_CATS[r.category] || 'Другое')}</b><span class="badge ${cls}">${t(st)}</span></div>
        <div class="tx">${esc(fmtDay(svcIso(new Date(r.at)), true))}</div>
        <p style="margin:8px 0 0;white-space:pre-wrap">${esc(r.text)}</p>
        ${r.reply ? `<div class="help-reply"><b>${t('Ответ администрации')}</b><span>${esc(r.reply)}</span></div>` : ''}
      </div>`;
    }).join('') : `<div class="card next-empty">${t('Обращений пока нет.')}</div>`}`;
  document.getElementById('hSend').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      await api('/help', { method: 'POST', body: { category: document.getElementById('hCat').value, text: document.getElementById('hText').value } });
      toast(t('Обращение отправлено — администратор ответит здесь'));
      viewHelp();
    } catch (err) { toast(err.message, true); b.disabled = false; }
  };
}
