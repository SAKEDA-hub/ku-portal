/* Плеер экзамена: прохождение, автопроверка, результаты.
 * Фабрика самодостаточна (нужна только ExamModel) — её исходник встраивается в экспортируемую HTML-страницу. */
(function (root, factory) {
  root.ExamPlayer = factory(root.ExamModel);
  root.ExamPlayer.__src = factory.toString();
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  var CSS = [
    '.xp{--xp-acc:#006FBF;--xp-acc2:#F2F8FC;--xp-ok:#2B7E46;--xp-bad:#CD2026;--xp-line:#CDD5DC;--xp-mut:#494C4E;font:17px/1.5 "Lato","Carlito","Lucida Sans Unicode",Calibri,sans-serif;color:#202122;max-width:860px;margin:0 auto}',
    '.xp *{box-sizing:border-box}',
    '.xp h1{font-size:1.6em;margin:.2em 0 .1em}.xp h2{font-size:1.25em;margin:0 0 .4em}',
    '.xp .xp-sub{color:var(--xp-mut);margin-bottom:1em}',
    '.xp .xp-card{background:#fff;border:1px solid #E3E9F1;border-radius:10px;padding:18px 20px;margin:12px 0}',
    '.xp .xp-instr{background:#F9FBFF;border:1px solid var(--xp-line);border-left:4px solid #378DBE;border-radius:6px;padding:10px 14px;margin:8px 0 14px;white-space:pre-wrap}',
    '.xp .xp-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--xp-acc);background:var(--xp-acc);color:#fff;border-radius:6px;min-height:44px;padding:0 22px;font:inherit;font-size:15px;font-weight:700;cursor:pointer}',
    '.xp .xp-btn.ghost{background:#fff;color:var(--xp-acc)}.xp .xp-btn:disabled{opacity:.45;cursor:default}',
    '.xp .xp-tabs{display:flex;flex-wrap:wrap;gap:6px;position:sticky;top:0;background:#F6F7F8;padding:8px 0;z-index:2;border-bottom:1px solid var(--xp-line)}',
    '.xp .xp-tab{border:1px solid var(--xp-line);background:#fff;border-radius:20px;padding:5px 12px;cursor:pointer;font:inherit;font-size:.92em}',
    '.xp .xp-tab.on{background:var(--xp-acc);color:#fff;border-color:var(--xp-acc)}',
    '.xp .xp-tab small{opacity:.75;margin-left:4px}',
    '.xp .xp-timer{margin-left:auto;font-variant-numeric:tabular-nums;padding:5px 10px;border-radius:20px;background:#fff;border:1px solid var(--xp-line)}',
    '.xp .xp-timer.low{color:#fff;background:var(--xp-bad);border-color:var(--xp-bad)}',
    '.xp .xp-task{border-top:1px solid var(--xp-line);padding:14px 0}.xp .xp-task:first-child{border-top:0}',
    '.xp .xp-q{white-space:pre-wrap;margin-bottom:8px}.xp .xp-num{font-weight:700;color:var(--xp-acc);margin-right:6px}',
    '.xp label.xp-opt{display:flex;gap:10px;align-items:flex-start;padding:7px 10px;border:1px solid var(--xp-line);border-radius:8px;margin:5px 0;cursor:pointer}',
    '.xp label.xp-opt:hover{border-color:var(--xp-acc)}.xp label.xp-opt input{margin-top:4px}',
    '.xp .xp-letter{font-weight:700;min-width:1.4em}',
    '.xp .xp-seg{display:inline-flex;border:1px solid var(--xp-line);border-radius:8px;overflow:hidden}',
    '.xp .xp-seg button{border:0;border-right:1px solid var(--xp-line);background:#fff;padding:7px 14px;font:inherit;cursor:pointer}',
    '.xp .xp-seg button:last-child{border-right:0}.xp .xp-seg button.on{background:var(--xp-acc);color:#fff}',
    '.xp input.xp-in,.xp textarea.xp-in,.xp select.xp-in{font:inherit;border:1px solid #b9c2cf;border-radius:6px;padding:6px 8px;background:#fff}',
    '.xp input.xp-gap{width:9em;margin:0 3px;padding:2px 6px}',
    '.xp textarea.xp-in{width:100%;min-height:180px;resize:vertical}',
    '.xp .xp-match{display:grid;grid-template-columns:1fr 1fr;gap:16px}.xp .xp-match ol{margin:0;padding-left:1.4em}',
    '.xp .xp-match .xp-mrow{display:flex;gap:8px;align-items:center;margin:5px 0}',
    '.xp .xp-media img{max-width:100%;border-radius:6px;margin:6px 0;display:block}.xp .xp-media audio{width:100%;margin:6px 0}.xp .xp-media video{width:100%;max-height:420px;border-radius:6px;margin:6px 0;background:#000}',
    '.xp .xp-passage{white-space:pre-wrap;background:#fbfbf8;border-left:3px solid #c9b77a;padding:10px 14px;margin:8px 0;border-radius:4px}',
    '.xp .xp-passage h3{margin:0 0 6px;font-size:1.05em;text-align:center}',
    '.xp .xp-iinstr{font-weight:600;font-style:italic;margin:6px 0}',
    '.xp .xp-wc{font-size:.9em;color:var(--xp-mut);margin-top:4px}.xp .xp-wc.bad{color:var(--xp-bad)}.xp .xp-wc.good{color:var(--xp-ok)}',
    '.xp .xp-nav{display:flex;justify-content:space-between;gap:8px;margin:16px 0}',
    '.xp .xp-ok{color:var(--xp-ok);font-weight:600}.xp .xp-bad{color:var(--xp-bad);font-weight:600}',
    '.xp .xp-res .xp-task{opacity:1}.xp .xp-mark{display:inline-block;margin-left:8px;font-size:.88em;padding:1px 8px;border-radius:10px}',
    '.xp .xp-mark.ok{background:#e3f4e7;color:var(--xp-ok)}.xp .xp-mark.bad{background:#fbe6e3;color:var(--xp-bad)}.xp .xp-mark.man{background:#eef0f4;color:var(--xp-mut)}',
    '.xp .xp-correct{color:var(--xp-ok);font-size:.93em;margin-top:4px}',
    '.xp .xp-score{font-size:2.2em;font-weight:700;color:var(--xp-acc)}',
    '.xp table.xp-tbl{border-collapse:collapse;width:100%}.xp table.xp-tbl td,.xp table.xp-tbl th{border-bottom:1px solid var(--xp-line);padding:6px 8px;text-align:left}',
    '.xp .xp-rec{margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.xp .xp-transcript{white-space:pre-wrap;color:var(--xp-mut);font-size:.93em;border:1px dashed var(--xp-line);padding:8px 12px;border-radius:6px}',
    '.xp .xp-modal{position:fixed;inset:0;background:rgba(20,30,45,.45);display:flex;align-items:center;justify-content:center;z-index:50}',
    '.xp .xp-modal>div{background:#fff;border-radius:12px;padding:20px 22px;max-width:420px;box-shadow:0 10px 40px rgba(0,0,0,.25)}',
    '@media print{.xp .xp-tabs,.xp .xp-nav,.xp .xp-btn{display:none!important}}',
    '@media (max-width:640px){.xp .xp-match{grid-template-columns:1fr}.xp .xp-card{padding:14px}}'
  ].join('\n');

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }

  function injectCss() {
    if (document.getElementById('xp-style')) return;
    var st = document.createElement('style'); st.id = 'xp-style'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function store(key, val) {
    try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { return null; }
  }

  function mediaEl(list) {
    if (!list || !list.length) return null;
    return h('div', { class: 'xp-media' }, list.map(function (m) {
      return m.kind === 'audio' ? h('audio', { controls: true, preload: 'metadata', src: m.src }) : m.kind === 'video' ? h('video', { controls: true, preload: 'metadata', src: m.src }) : h('img', { src: m.src, alt: m.name || '' });
    }));
  }

  function mount(container, exam, opts) {
    opts = opts || {};
    injectCss();
    exam = M.normalize(exam);
    var secs = M.activeSections(exam);
    var key = opts.storageKey === false ? null : 'exam-progress-' + exam.id;
    var saved = key ? store(key) : null;
    var st = saved && saved.answers ? saved : { answers: {}, student: '', started: 0, section: 0, finished: false };
    var recordings = {}; // id -> {url}
    var timerId = null;
    var root = h('div', { class: 'xp' });
    container.innerHTML = '';
    container.appendChild(root);

    function persist() { if (key) store(key, st); }

    function render() {
      root.innerHTML = '';
      if (!secs.length) { root.appendChild(h('div', { class: 'xp-card' }, h('h2', { text: 'В тесте нет включённых разделов' }), h('p', { text: 'Добавьте задания или включите разделы в настройках.' }))); return; }
      if (st.finished) return renderResults();
      if (!st.started) return renderStart();
      renderSection();
    }

    function renderStart() {
      var nameIn = exam.settings.showStudentFields ? h('input', { class: 'xp-in', placeholder: 'Фамилия и имя', value: st.student, style: 'width:100%;max-width:360px', oninput: function (e) { st.student = e.target.value; } }) : null;
      root.appendChild(h('div', { class: 'xp-card' },
        h('h1', { text: exam.title }),
        exam.subtitle ? h('div', { class: 'xp-sub', text: exam.subtitle }) : null,
        exam.instructions ? h('div', { class: 'xp-instr', text: exam.instructions }) : null,
        h('p', null, 'Разделы: ', secs.map(function (t) { return M.sectionTitle(exam, t); }).join(' → ')),
        exam.settings.timeLimit ? h('p', null, 'Время на выполнение: ', h('b', { text: exam.settings.timeLimit + ' мин.' })) : null,
        nameIn ? h('p', null, nameIn) : null,
        h('button', { class: 'xp-btn', onclick: function () { st.started = Date.now(); st.section = 0; persist(); render(); } }, 'Начать')
      ));
    }

    function answeredCount(type) {
      var s = exam.sections[type], a = 0, n = 0;
      s.tasks.forEach(function (t) {
        if (t.type === 'info') return;
        n++;
        var r = st.answers[t.id];
        if (r != null && r !== '' && !(Array.isArray(r) && !r.some(function (x) { return x != null && x !== ''; }))) a++;
      });
      return a + '/' + n;
    }

    function tickTimer(el) {
      if (!exam.settings.timeLimit) return;
      clearInterval(timerId);
      var end = st.started + exam.settings.timeLimit * 60000;
      function upd() {
        var left = Math.max(0, end - Date.now());
        var m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
        el.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
        el.classList.toggle('low', left < 60000);
        if (left <= 0) { clearInterval(timerId); finish(); }
      }
      upd(); timerId = setInterval(upd, 1000);
    }

    function renderSection() {
      var idx = Math.min(st.section, secs.length - 1), type = secs[idx], s = exam.sections[type];
      var timer = exam.settings.timeLimit ? h('span', { class: 'xp-timer' }) : null;
      root.appendChild(h('div', { class: 'xp-tabs' },
        secs.map(function (t, i) {
          return h('button', { class: 'xp-tab' + (i === idx ? ' on' : ''), onclick: function () { st.section = i; persist(); render(); window.scrollTo(0, 0); } },
            M.sectionTitle(exam, t), h('small', { text: answeredCount(t) }));
        }), timer));
      if (timer) tickTimer(timer);
      var card = h('div', { class: 'xp-card' }, h('h2', { text: M.sectionTitle(exam, type) }));
      if (s.instructions) card.appendChild(h('div', { class: 'xp-instr', text: s.instructions }));
      add(card, mediaEl(s.media));
      var nums = M.numberTasks(s);
      s.tasks.forEach(function (t, i) { var el = taskEl(t, nums[i], type); if (el) card.appendChild(el); });
      root.appendChild(card);
      root.appendChild(h('div', { class: 'xp-nav' },
        h('button', { class: 'xp-btn ghost', disabled: idx === 0, onclick: function () { st.section = idx - 1; persist(); render(); window.scrollTo(0, 0); } }, '← Назад'),
        idx < secs.length - 1
          ? h('button', { class: 'xp-btn', onclick: function () { st.section = idx + 1; persist(); render(); window.scrollTo(0, 0); } }, 'Далее →')
          : h('button', { class: 'xp-btn', onclick: confirmFinish }, 'Завершить тест')
      ));
    }

    function confirmFinish() {
      var modal = h('div', { class: 'xp-modal' }, h('div', null,
        h('h2', { text: 'Завершить тест?' }),
        h('p', { text: 'После завершения изменить ответы будет нельзя.' }),
        h('div', { class: 'xp-nav' },
          h('button', { class: 'xp-btn ghost', onclick: function () { modal.remove(); } }, 'Вернуться'),
          h('button', { class: 'xp-btn', onclick: function () { modal.remove(); finish(); } }, 'Завершить'))));
      root.appendChild(modal);
    }

    function setA(id, v) { st.answers[id] = v; persist(); }

    function taskEl(t, num, type, ro) {
      var a = st.answers[t.id];
      var wrap = h('div', { class: 'xp-task' });
      var numEl = num != null ? h('span', { class: 'xp-num', text: num + '.' }) : null;
      switch (t.type) {
        case 'info':
          if (t.kind === 'transcript') {
            if (!ro) return mediaEl(t.media) ? h('div', { class: 'xp-task' }, mediaEl(t.media)) : null;
            wrap.appendChild(h('details', null, h('summary', { text: t.title || 'Транскрипт' }), h('div', { class: 'xp-transcript', text: t.text })));
            return wrap;
          }
          if (t.kind === 'instruction') wrap.appendChild(h('div', { class: 'xp-iinstr', text: t.text }));
          else if (t.text || t.title) wrap.appendChild(h('div', { class: 'xp-passage' }, t.title ? h('h3', { text: t.title }) : null, t.text));
          add(wrap, mediaEl(t.media));
          return wrap;
        case 'mc': case 'multi':
          wrap.appendChild(h('div', { class: 'xp-q' }, numEl, t.question, t.type === 'multi' ? h('i', { text: ' (выберите все верные варианты)' }) : null));
          add(wrap, mediaEl(t.media));
          t.options.forEach(function (o, i) {
            var on = t.type === 'mc' ? a === i : (a || []).indexOf(i) >= 0;
            var inp = h('input', {
              type: t.type === 'mc' ? 'radio' : 'checkbox', name: 'q_' + t.id, checked: on, disabled: ro,
              onchange: function (e) {
                if (t.type === 'mc') setA(t.id, i);
                else { var cur = (st.answers[t.id] || []).filter(function (x) { return x !== i; }); if (e.target.checked) cur.push(i); setA(t.id, cur.sort()); }
              }
            });
            wrap.appendChild(h('label', { class: 'xp-opt' }, inp, h('span', { class: 'xp-letter', text: M.LETTERS[i] + ')' }), h('span', { text: o })));
          });
          return wrap;
        case 'tf':
          wrap.appendChild(h('div', { class: 'xp-q' }, numEl, t.question));
          add(wrap, mediaEl(t.media));
          var seg = h('div', { class: 'xp-seg' });
          M.TF_VARIANTS[t.variant].forEach(function (l, i) {
            seg.appendChild(h('button', { class: a === i ? 'on' : '', disabled: ro, onclick: function () { setA(t.id, i); Array.prototype.forEach.call(seg.children, function (b, j) { b.className = j === i ? 'on' : ''; }); } }, l));
          });
          wrap.appendChild(seg);
          return wrap;
        case 'match':
          wrap.appendChild(h('div', { class: 'xp-q' }, numEl, t.question || 'Установите соответствие.'));
          add(wrap, mediaEl(t.media));
          var cur = a || [];
          wrap.appendChild(h('div', { class: 'xp-match' },
            h('div', null, t.left.map(function (l, i) {
              var sel = h('select', { class: 'xp-in', disabled: ro, onchange: function (e) { var c = (st.answers[t.id] || t.left.map(function () { return null; })).slice(); c[i] = e.target.value === '' ? null : +e.target.value; setA(t.id, c); } },
                h('option', { value: '', text: '—' }), t.right.map(function (_, j) { var o = h('option', { value: j, text: M.LETTERS[j] }); if (cur[i] === j) o.selected = true; return o; }));
              return h('div', { class: 'xp-mrow' }, h('b', { text: (i + 1) + '.' }), h('span', { style: 'flex:1', text: l }), sel);
            })),
            h('div', null, t.right.map(function (r, j) { return h('div', { class: 'xp-mrow' }, h('b', { text: M.LETTERS[j] + '.' }), h('span', { text: r })); }))
          ));
          return wrap;
        case 'gap':
          var gi = 0, q = h('div', { class: 'xp-q' }, numEl);
          M.parseGaps(t.question).forEach(function (p) {
            if (!p.gap) { q.appendChild(document.createTextNode(p.text)); return; }
            var k = gi++;
            q.appendChild(h('input', { class: 'xp-in xp-gap', value: (a || [])[k] || '', disabled: ro, 'aria-label': 'Пропуск ' + (k + 1),
              oninput: function (e) { var c = (st.answers[t.id] || []).slice(); c[k] = e.target.value; setA(t.id, c); } }));
          });
          wrap.appendChild(q); add(wrap, mediaEl(t.media));
          return wrap;
        case 'short':
          wrap.appendChild(h('div', { class: 'xp-q' }, numEl, t.question));
          add(wrap, mediaEl(t.media));
          wrap.appendChild(h('input', { class: 'xp-in', style: 'width:100%;max-width:420px', placeholder: 'Ваш ответ', value: a || '', disabled: ro, oninput: function (e) { setA(t.id, e.target.value); } }));
          return wrap;
        case 'essay':
          wrap.appendChild(h('div', { class: 'xp-q' }, numEl, t.question));
          add(wrap, mediaEl(t.media));
          var meta = [];
          if (t.minWords && t.maxWords) meta.push(t.minWords + '–' + t.maxWords + ' слов');
          else if (t.minWords) meta.push('не менее ' + t.minWords + ' слов');
          else if (t.maxWords) meta.push('до ' + t.maxWords + ' слов');
          if (t.timeMinutes) meta.push('время: ' + t.timeMinutes + ' мин.');
          if (meta.length) wrap.appendChild(h('div', { class: 'xp-wc', text: meta.join(' · ') }));
          var wc = h('div', { class: 'xp-wc' });
          function updWc(v) {
            var n = M.countWords(v);
            wc.textContent = 'Слов: ' + n;
            var bad = (t.minWords && n < t.minWords) || (t.maxWords && n > t.maxWords * 1.1);
            wc.className = 'xp-wc ' + (n ? (bad ? 'bad' : 'good') : '');
          }
          var ta = h('textarea', { class: 'xp-in', disabled: ro, placeholder: type === 'speaking' ? 'Тезисы / текст ответа (по желанию)' : 'Напишите ответ здесь', oninput: function (e) { setA(t.id, e.target.value); updWc(e.target.value); } });
          ta.value = a || '';
          wrap.appendChild(ta); wrap.appendChild(wc); updWc(a || '');
          if (type === 'speaking') wrap.appendChild(recorder(t, ro));
          return wrap;
      }
      return null;
    }

    function recorder(t, ro) {
      var box = h('div', { class: 'xp-rec' });
      var rec = recordings[t.id];
      if (rec) box.appendChild(h('audio', { controls: true, src: rec.url }));
      if (rec) box.appendChild(h('a', { href: rec.url, download: 'answer-' + (t.id) + '.webm', text: 'Скачать запись' }));
      if (ro) return box;
      if (!(navigator.mediaDevices && window.MediaRecorder)) { box.appendChild(h('span', { class: 'xp-wc', text: 'Запись голоса недоступна в этом браузере.' })); return box; }
      var btn = h('button', { class: 'xp-btn ghost' }, rec ? '🎙 Перезаписать' : '🎙 Записать ответ');
      var mr = null, chunks = [];
      btn.onclick = function () {
        if (mr && mr.state === 'recording') { mr.stop(); return; }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          chunks = []; mr = new MediaRecorder(stream);
          mr.ondataavailable = function (e) { chunks.push(e.data); };
          mr.onstop = function () {
            stream.getTracks().forEach(function (tr) { tr.stop(); });
            recordings[t.id] = { url: URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })) };
            box.replaceWith(recorder(t, ro));
          };
          mr.start(); btn.textContent = '⏹ Остановить запись';
        }).catch(function () { btn.textContent = 'Нет доступа к микрофону'; });
      };
      box.appendChild(btn);
      return box;
    }

    function finish() {
      clearInterval(timerId);
      st.finished = Date.now(); persist();
      var result = computeResult();
      if (opts.onFinish) try { opts.onFinish(result); } catch (e) { }
      render(); window.scrollTo(0, 0);
    }

    function computeResult() {
      var total = 0, max = 0, bySec = [];
      secs.forEach(function (type) {
        var s = exam.sections[type], ss = 0, sm = 0, manual = 0;
        s.tasks.forEach(function (t) {
          var g = M.grade(t, st.answers[t.id]);
          if (g === null) { if (t.type === 'essay') manual++; return; }
          ss += g.score; sm += g.max;
        });
        total += ss; max += sm;
        bySec.push({ type: type, title: M.sectionTitle(exam, type), score: ss, max: sm, manual: manual });
      });
      return { examId: exam.id, title: exam.title, student: st.student, startedAt: st.started ? new Date(st.started).toISOString() : null, finishedAt: st.finished ? new Date(st.finished).toISOString() : null, score: total, max: max, sections: bySec, answers: st.answers };
    }

    function correctText(t) {
      switch (t.type) {
        case 'mc': return t.answer != null ? M.LETTERS[t.answer] + ') ' + t.options[t.answer] : '';
        case 'multi': return t.answers.map(function (i) { return M.LETTERS[i] + ') ' + t.options[i]; }).join('; ');
        case 'tf': return t.answer != null ? M.TF_VARIANTS[t.variant][t.answer] : '';
        case 'match': return t.left.map(function (_, i) { return (i + 1) + '–' + (t.answer[i] != null ? M.LETTERS[t.answer[i]] : '?'); }).join(', ');
        case 'gap': return M.parseGaps(t.question).filter(function (p) { return p.gap; }).map(function (p) { return p.answers.join(' / ') || '?'; }).join('; ');
        case 'short': return t.answer.split('|').join(' / ');
      }
      return '';
    }

    function renderResults() {
      var r = computeResult();
      var pct = r.max ? Math.round(r.score / r.max * 100) : 0;
      var head = h('div', { class: 'xp-card' },
        h('h1', { text: 'Результаты' }),
        h('div', { class: 'xp-sub', text: exam.title + (st.student ? ' · ' + st.student : '') }),
        r.max ? h('div', null, h('span', { class: 'xp-score', text: r.score + ' / ' + r.max }), h('span', { style: 'margin-left:10px;color:#5f6b7a', text: pct + '% (автопроверка)' })) : h('p', { text: 'Автоматически проверяемых заданий нет.' }),
        h('table', { class: 'xp-tbl', style: 'margin-top:12px' },
          h('tr', null, h('th', { text: 'Раздел' }), h('th', { text: 'Баллы' }), h('th', { text: 'Ручная проверка' })),
          r.sections.map(function (s) { return h('tr', null, h('td', { text: s.title }), h('td', { text: s.max ? s.score + ' / ' + s.max : '—' }), h('td', { text: s.manual ? s.manual + ' зад.' : '—' })); })),
        h('div', { class: 'xp-nav' },
          h('button', { class: 'xp-btn ghost', onclick: function () { window.print(); } }, 'Печать'),
          h('button', { class: 'xp-btn', onclick: function () { st = { answers: {}, student: st.student, started: 0, section: 0, finished: false }; persist(); render(); } }, 'Пройти заново'))
      );
      root.appendChild(head);
      if (!exam.settings.showResults) return;
      secs.forEach(function (type) {
        var s = exam.sections[type], nums = M.numberTasks(s);
        var card = h('div', { class: 'xp-card xp-res' }, h('h2', { text: M.sectionTitle(exam, type) }));
        s.tasks.forEach(function (t, i) {
          var el = taskEl(t, nums[i], type, true); if (!el) return;
          var g = M.grade(t, st.answers[t.id]);
          if (t.type !== 'info') {
            var q = el.querySelector('.xp-q');
            var mk;
            if (g === null) mk = h('span', { class: 'xp-mark man', text: 'проверяет учитель' + (t.type === 'essay' && st.answers[t.id] ? ' · слов: ' + M.countWords(st.answers[t.id]) : '') });
            else if (g.ungraded) mk = h('span', { class: 'xp-mark man', text: 'нет ключа' });
            else mk = h('span', { class: 'xp-mark ' + (g.score === g.max ? 'ok' : 'bad'), text: g.score + ' / ' + g.max });
            if (q) q.appendChild(mk);
            var ct = correctText(t);
            if (ct && g && !g.ungraded && g.score < g.max) el.appendChild(h('div', { class: 'xp-correct', text: 'Правильный ответ: ' + ct }));
          }
          card.appendChild(el);
        });
        root.appendChild(card);
      });
    }

    render();
    return {
      reset: function () { clearInterval(timerId); st = { answers: {}, student: '', started: 0, section: 0, finished: false }; persist(); render(); },
      destroy: function () { clearInterval(timerId); container.innerHTML = ''; },
      result: computeResult
    };
  }

  return { mount: mount, CSS: CSS };
});
