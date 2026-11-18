'use strict';
/* KU Connect — инструменты по направлению пользователя (user.track с сервера):
 *   it   — группы ИСУ и преподаватели IT: блок кода с подсветкой, ссылка на репозиторий, помодоро-таймер, полезные ссылки;
 *   bio  — группы БТ и преподаватели биотехнологий: протокол опыта, калькулятор разведения C1V1 = C2V2,
 *          расчёт навески, чек-лист техники безопасности;
 *   lang — преподаватели языков: шаблон словаря к уроку.
 * Преподавателям всех направлений — «Быстрые ответы» (шаблоны, хранятся в браузере) и объявление с пометкой «Важно».
 * Инструменты композера вставляют готовый текст в поле сообщения; разметку показывает md() из core.js.
 */
const TRACK_NAME = { it: 'IT · информационные системы', bio: 'Биотехнологии', lang: 'Языки' };
const CODE_LANGS = [['python', 'Python'], ['js', 'JavaScript'], ['sql', 'SQL'], ['bash', 'Bash'], ['', 'Другое']];
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/* ---------- Быстрые ответы преподавателя ---------- */
const QR_DEFAULT = [
  'Добрый день! Посмотрю и отвечу сегодня до конца дня.',
  'Материалы к занятию уже в канале предмета — вкладка «Материалы».',
  'Срок сдачи можно перенести на 2 дня, если пришлёте черновик до пятницы.',
  'Приходите на консультацию — часы указаны в моём профиле.',
];
const qrKey = () => 'kuc_qr:' + (C.user ? C.user.id : '');
function getQR() { try { const v = JSON.parse(localStorage.getItem(qrKey()) || 'null'); return Array.isArray(v) ? v : QR_DEFAULT.map((x) => t(x)); } catch { return QR_DEFAULT.map((x) => t(x)); } }
function setQR(list) { try { localStorage.setItem(qrKey(), JSON.stringify(list.slice(0, 20))); } catch { } }
function quickRepliesDlg(insert) {
  modal(t('Быстрые ответы'), `<div class="qr-list">${getQR().map((q, i) => `<button class="qr" data-i="${i}">${esc(q)}</button>`).join('')}</div>
    <div class="tx">${t('Шаблоны можно менять в разделе «Инструменты».')}</div>`, (box, close) => {
    box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { insert(getQR()[+b.dataset.i]); close(); }));
  });
}
function quickRepliesManagerHTML() {
  return `<div class="tool-card"><div class="tool-h">${svg('quote')}<div><b>${t('Быстрые ответы')}</b><span>${t('Шаблоны для личных сообщений студентам — кнопка «Шаблоны» в чате')}</span></div></div>
    <div class="qr-edit">${getQR().map((q, i) => `<div class="qr-row"><input class="inp" data-qr="${i}" value="${esc(q)}" maxlength="300"><button class="icon-btn" data-qrdel="${i}" title="${t('Удалить')}">${svg('trash')}</button></div>`).join('')}</div>
    <div class="row"><button class="btn ghost" id="qrAdd">${svg('plus')}${t('Добавить шаблон')}</button><button class="btn pri" id="qrSave">${t('Сохранить')}</button></div></div>`;
}
function bindQRManager(root, repaint) {
  const read = () => [...root.querySelectorAll('[data-qr]')].map((i) => i.value.trim()).filter(Boolean);
  root.querySelector('#qrAdd').onclick = () => { setQR(read().concat(t('Новый шаблон'))); repaint(); };
  root.querySelector('#qrSave').onclick = () => { setQR(read()); toast(t('Шаблоны сохранены')); };
  root.querySelectorAll('[data-qrdel]').forEach((b) => (b.onclick = () => { const l = read(); l.splice(+b.dataset.qrdel, 1); setQR(l); repaint(); }));
}

/* ---------- Инструменты в поле ввода ---------- */
function codeDlg(insert) {
  modal(t('Блок кода'), `
    <div class="seg" id="cdLang">${CODE_LANGS.map(([v, l], i) => `<button class="${i === 0 ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
    <textarea class="inp mono" id="cdCode" rows="9" spellcheck="false" placeholder="def hello(name):&#10;    return f&quot;Привет, {name}!&quot;"></textarea>
    <div class="tx">${t('В чате код покажется с подсветкой и кнопкой «Копировать».')}</div>
    <button class="btn pri" id="cdOk">${t('Вставить в сообщение')}</button>`, (box, close) => {
    const seg = box.querySelector('#cdLang');
    seg.onclick = (e) => { const b = e.target.closest('button'); if (b) seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    box.querySelector('#cdCode').onkeydown = (e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); } };
    box.querySelector('#cdOk').onclick = () => {
      const code = box.querySelector('#cdCode').value.replace(/\s+$/, '');
      if (!code) return toast(t('Вставьте код'), true);
      insert('```' + seg.querySelector('.on').dataset.v + '\n' + code + '\n```'); close();
    };
  }, true);
}
function repoDlg(insert) {
  modal(t('Ссылка на репозиторий'), `
    <input class="inp" id="rpUrl" placeholder="https://github.com/…">
    <input class="inp" id="rpNote" maxlength="120" placeholder="${t('Что сделано, например: лабораторная 3, ветка main')}">
    <button class="btn pri" id="rpOk">${t('Вставить в сообщение')}</button>`, (box, close) => {
    box.querySelector('#rpOk').onclick = () => {
      const url = box.querySelector('#rpUrl').value.trim();
      if (!/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//i.test(url)) return toast(t('Нужна ссылка на GitHub, GitLab или Bitbucket'), true);
      const note = box.querySelector('#rpNote').value.trim();
      insert(`🔗 **${t('Репозиторий')}:** ${url}${note ? '\n' + note : ''}`); close();
    };
  });
}
function protocolDlg(insert) {
  const f = [['ptAim', 'Цель опыта'], ['ptReag', 'Реактивы и оборудование'], ['ptSteps', 'Ход работы'], ['ptRes', 'Результат и вывод']];
  modal(t('Протокол опыта'), `${f.map(([id, l]) => `<label class="lbl">${t(l)}</label><textarea class="inp" id="${id}" rows="2" maxlength="600"></textarea>`).join('')}
    <button class="btn pri" id="ptOk">${t('Вставить в сообщение')}</button>`, (box, close) => {
    box.querySelector('#ptOk').onclick = () => {
      const rows = f.map(([id, l]) => [t(l), box.querySelector('#' + id).value.trim()]).filter((r) => r[1]);
      if (!rows.length) return toast(t('Заполните хотя бы одно поле'), true);
      insert(`🧪 **${t('Протокол опыта')}**\n` + rows.map(([l, v]) => `**${l}:** ${v}`).join('\n')); close();
    };
  }, true);
}
/* C1·V1 = C2·V2: оставьте пустым одно поле — оно посчитается */
function dilutionHTML(prefix) {
  const fld = (id, l, u) => `<label class="calc-f"><span>${l}</span><input class="inp" id="${prefix}${id}" inputmode="decimal" placeholder="—"><small>${u}</small></label>`;
  return `<div class="calc">${fld('C1', 'C₁', t('мМ'))}${fld('V1', 'V₁', t('мкл'))}${fld('C2', 'C₂', t('мМ'))}${fld('V2', 'V₂', t('мкл'))}</div>
    <div class="calc-out" id="${prefix}Out">${t('Заполните три поля из четырёх')}</div>`;
}
function solveDilution(root, prefix) {
  const v = Object.fromEntries(['C1', 'V1', 'C2', 'V2'].map((k) => [k, num(root.querySelector('#' + prefix + k).value)]));
  const missing = Object.keys(v).filter((k) => isNaN(v[k]));
  const out = root.querySelector('#' + prefix + 'Out');
  if (missing.length !== 1) { out.textContent = t('Заполните три поля из четырёх'); return null; }
  const k = missing[0];
  const r = k === 'C1' ? v.C2 * v.V2 / v.V1 : k === 'V1' ? v.C2 * v.V2 / v.C1 : k === 'C2' ? v.C1 * v.V1 / v.V2 : v.C1 * v.V1 / v.C2;
  if (!isFinite(r) || r <= 0) { out.textContent = t('Проверьте значения'); return null; }
  v[k] = round(r);
  const line = `C₁ ${v.C1} ${t('мМ')} · V₁ ${v.V1} ${t('мкл')} → C₂ ${v.C2} ${t('мМ')} · V₂ ${v.V2} ${t('мкл')}`;
  const solvent = round(v.V2 - v.V1);
  out.innerHTML = `<b>${k.replace('1', '₁').replace('2', '₂')} = ${v[k]}</b><span>${esc(line)}${solvent > 0 ? ' · ' + esc(t('растворителя: {v} мкл', { v: solvent })) : ''}</span>`;
  return `🧮 **${t('Разведение')}:** ${line}${solvent > 0 ? ` (${t('растворителя: {v} мкл', { v: solvent })})` : ''}`;
}
function dilutionDlg(insert) {
  modal(t('Калькулятор разведения'), `<div class="tx">C₁·V₁ = C₂·V₂ — ${t('оставьте пустым то, что нужно найти.')}</div>${dilutionHTML('dl')}
    <button class="btn pri" id="dlOk">${t('Вставить результат в сообщение')}</button>`, (box, close) => {
    let res = null;
    box.querySelectorAll('input').forEach((i) => (i.oninput = () => { res = solveDilution(box, 'dl'); }));
    box.querySelector('#dlOk').onclick = () => { if (!res) return toast(t('Заполните три поля из четырёх'), true); insert(res); close(); };
  });
}
function vocabDlg(insert) {
  modal(t('Словарь к уроку'), `<textarea class="inp" id="vbText" rows="7" placeholder="achieve — достигать&#10;evidence — доказательство"></textarea>
    <button class="btn pri" id="vbOk">${t('Вставить в сообщение')}</button>`, (box, close) => {
    box.querySelector('#vbOk').onclick = () => {
      const rows = box.querySelector('#vbText').value.split('\n').map((x) => x.trim()).filter(Boolean);
      if (!rows.length) return toast(t('Добавьте хотя бы одно слово'), true);
      insert(`📘 **${t('Словарь к уроку')}**\n` + rows.map((r) => '• ' + r).join('\n')); close();
    };
  });
}
/* Кнопки инструментов в поле ввода личного чата — по направлению и роли */
function composerTools() {
  const u = C.user, list = [];
  if (u.track === 'it') list.push(['code', 'Код', codeDlg], ['link', 'Репозиторий', repoDlg]);
  if (u.track === 'bio') list.push(['flask', 'Протокол', protocolDlg], ['calc', 'Разведение', dilutionDlg]);
  if (u.track === 'lang' && u.role === 'teacher') list.push(['book', 'Словарь', vocabDlg]);
  if (u.role === 'teacher') list.push(['quote', 'Шаблоны', quickRepliesDlg]);
  return list;
}

/* ---------- Страница «Инструменты» ---------- */
const IT_LINKS = [
  ['Документация Python', 'https://docs.python.org/3/'], ['MDN Web Docs', 'https://developer.mozilla.org/ru/'],
  ['Шпаргалка по Git', 'https://education.github.com/git-cheat-sheet-education.pdf'], ['SQL: учебник W3Schools', 'https://www.w3schools.com/sql/'],
];
const LAB_SAFETY = ['Халат, перчатки и очки надеты', 'Рабочее место чистое, реактивы подписаны', 'Знаю, где огнетушитель и аварийный душ', 'Отходы — в маркированные контейнеры', 'Руки вымыты после работы'];
let pomo = { left: 25 * 60, mode: 'work', timer: null };
function pomodoroHTML() {
  const mm = String(Math.floor(pomo.left / 60)).padStart(2, '0'), ss = String(pomo.left % 60).padStart(2, '0');
  return `<div class="pomo ${pomo.mode}"><b id="pmTime">${mm}:${ss}</b><span>${t(pomo.mode === 'work' ? 'Фокус' : 'Перерыв')}</span></div>
    <div class="row"><button class="btn pri" id="pmGo">${pomo.timer ? t('Пауза') : t('Старт')}</button><button class="btn ghost" id="pmReset">${t('Сбросить')}</button></div>`;
}
function bindPomodoro(root) {
  const paint = () => { const box = root.querySelector('#pomoBox'); if (box) { box.innerHTML = pomodoroHTML(); bindPomodoro(root); } };
  root.querySelector('#pmGo').onclick = () => {
    if (pomo.timer) { clearInterval(pomo.timer); pomo.timer = null; return paint(); }
    pomo.timer = setInterval(() => {
      pomo.left--;
      if (pomo.left <= 0) { pomo.mode = pomo.mode === 'work' ? 'rest' : 'work'; pomo.left = (pomo.mode === 'work' ? 25 : 5) * 60; chime(); toast(t(pomo.mode === 'work' ? 'Перерыв окончен — за работу!' : 'Время перерыва — 5 минут')); }
      if (!document.getElementById('pomoBox')) { clearInterval(pomo.timer); pomo.timer = null; return; }
      paint();
    }, 1000);
    paint();
  };
  root.querySelector('#pmReset').onclick = () => { clearInterval(pomo.timer); pomo = { left: 25 * 60, mode: 'work', timer: null }; paint(); };
}
function itToolsHTML() {
  return `
    <div class="tool-card"><div class="tool-h">${svg('timer')}<div><b>${t('Помодоро-таймер')}</b><span>${t('25 минут фокуса, 5 минут отдыха')}</span></div></div><div id="pomoBox">${pomodoroHTML()}</div></div>
    <div class="tool-card"><div class="tool-h">${svg('code')}<div><b>${t('Песочница кода')}</b><span>${t('Вставьте код — увидите подсветку и сможете отправить его в чат')}</span></div></div>
      <div class="seg" id="sbLang">${CODE_LANGS.slice(0, 4).map(([v, l], i) => `<button class="${i === 0 ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <textarea class="inp mono" id="sbCode" rows="6" spellcheck="false" placeholder="SELECT name FROM students WHERE grp = 'ИСУ-26-2-а';"></textarea>
      <div id="sbOut" class="sb-out"></div></div>
    <div class="tool-card"><div class="tool-h">${svg('link')}<div><b>${t('Полезные ссылки')}</b><span>${t('Документация и шпаргалки')}</span></div></div>
      <div class="links">${IT_LINKS.map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener">${svg('link')}${t(l)}</a>`).join('')}</div></div>`;
}
function bioToolsHTML() {
  const done = (() => { try { return JSON.parse(localStorage.getItem('kuc_lab:' + C.user.id) || '[]'); } catch { return []; } })();
  return `
    <div class="tool-card"><div class="tool-h">${svg('calc')}<div><b>${t('Калькулятор разведения')}</b><span>C₁·V₁ = C₂·V₂ — ${t('оставьте пустым то, что нужно найти.')}</span></div></div>${dilutionHTML('td')}</div>
    <div class="tool-card"><div class="tool-h">${svg('flask')}<div><b>${t('Расчёт навески')}</b><span>m = C · V · M</span></div></div>
      <div class="calc">${[['mC', 'C', t('моль/л')], ['mV', 'V', t('мл')], ['mM', 'M', t('г/моль')]].map(([id, l, u]) => `<label class="calc-f"><span>${l}</span><input class="inp" id="${id}" inputmode="decimal" placeholder="—"><small>${u}</small></label>`).join('')}</div>
      <div class="calc-out" id="mOut">${t('Например: NaCl 0,15 моль/л, 250 мл, 58,44 г/моль')}</div></div>
    <div class="tool-card"><div class="tool-h">${svg('shield')}<div><b>${t('Техника безопасности перед лабораторной')}</b><span>${t('Отметки сохраняются в этом браузере')}</span></div></div>
      <div class="check">${LAB_SAFETY.map((l, i) => `<label><input type="checkbox" data-lab="${i}" ${done.includes(i) ? 'checked' : ''}><span>${t(l)}</span></label>`).join('')}</div></div>`;
}
function bindTools(root, repaint) {
  if (root.querySelector('#pomoBox')) bindPomodoro(root);
  const sb = root.querySelector('#sbCode');
  if (sb) {
    const seg = root.querySelector('#sbLang');
    const paint = () => { const lang = seg.querySelector('.on').dataset.v; root.querySelector('#sbOut').innerHTML = sb.value ? md('```' + lang + '\n' + sb.value + '\n```') : ''; bindCopy(root); };
    seg.onclick = (e) => { const b = e.target.closest('button'); if (b) { seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); paint(); } };
    sb.oninput = paint;
  }
  if (root.querySelector('#tdC1')) root.querySelectorAll('[id^="td"]').forEach((i) => (i.oninput = () => solveDilution(root, 'td')));
  if (root.querySelector('#mC')) {
    const calc = () => {
      const c = num(root.querySelector('#mC').value), v = num(root.querySelector('#mV').value), m = num(root.querySelector('#mM').value);
      const out = root.querySelector('#mOut');
      if ([c, v, m].some(isNaN)) { out.textContent = t('Например: NaCl 0,15 моль/л, 250 мл, 58,44 г/моль'); return; }
      out.innerHTML = `<b>m = ${round(c * v / 1000 * m, 4)} ${t('г')}</b><span>${esc(t('Растворить в мерной колбе и довести до {v} мл', { v }))}</span>`;
    };
    ['#mC', '#mV', '#mM'].forEach((s) => (root.querySelector(s).oninput = calc));
  }
  root.querySelectorAll('[data-lab]').forEach((cb) => (cb.onchange = () => {
    const done = [...root.querySelectorAll('[data-lab]:checked')].map((x) => +x.dataset.lab);
    try { localStorage.setItem('kuc_lab:' + C.user.id, JSON.stringify(done)); } catch { }
    if (done.length === LAB_SAFETY.length) toast(t('Всё готово — удачной лабораторной!'));
  }));
  if (root.querySelector('#qrSave')) bindQRManager(root, repaint);
}
function toolsPageHTML() {
  const u = C.user;
  const head = `<div class="page-hero"><span class="hero-ic">${svg(u.track === 'bio' ? 'flask' : u.track === 'it' ? 'code' : 'tool')}</span>
    <div><b>${t('Инструменты')}</b><span>${u.track ? esc(t(TRACK_NAME[u.track])) : t('Общие инструменты')}${u.role === 'teacher' ? ' · ' + t('преподаватель') : ''}</span></div></div>`;
  const body = u.track === 'it' ? itToolsHTML() : u.track === 'bio' ? bioToolsHTML() : '';
  const teacher = u.role === 'teacher' ? quickRepliesManagerHTML() : '';
  const empty = !body && !teacher ? `<div class="empty">${svg('tool')}<b>${t('Инструменты появятся по направлению группы')}</b><span>${t('Для групп ИСУ — инструменты разработчика, для групп БТ — лабораторные.')}</span></div>` : '';
  return head + `<div class="tools-grid">${teacher}${body}</div>` + empty;
}
