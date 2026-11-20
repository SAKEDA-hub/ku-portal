/* Модель экзамена: типы разделов, типы заданий, значения по умолчанию, нормализация.
 * UMD: в браузере -> window.ExamModel, в Node -> module.exports */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ExamModel = factory(); root.ExamModel.__src = factory.toString(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SECTION_TYPES = ['test', 'reading', 'listening', 'writing', 'speaking'];

  var SECTION_LABELS = {
    test: 'Тестовая часть',
    reading: 'Чтение',
    listening: 'Аудирование',
    writing: 'Письменная часть',
    speaking: 'Говорение'
  };
  var SECTION_LABELS_EN = {
    test: 'Use of English', reading: 'Reading', listening: 'Listening',
    writing: 'Writing', speaking: 'Speaking'
  };

  // Ограничение числа «оцениваемых» заданий (info-блоки не считаются)
  var SECTION_LIMITS = { writing: 2, speaking: 2 };

  var TASK_TYPES = {
    mc:     { label: 'Выбор одного ответа', auto: true },
    multi:  { label: 'Выбор нескольких ответов', auto: true },
    tf:     { label: 'Верно / Неверно (Да / Нет)', auto: true },
    match:  { label: 'Сопоставление', auto: true },
    gap:    { label: 'Заполнение пропусков', auto: true },
    short:  { label: 'Краткий ответ', auto: true },
    essay:  { label: 'Развёрнутый ответ', auto: false },
    info:   { label: 'Текст / инструкция / транскрипт', auto: false, unnumbered: true }
  };

  var SECTION_TASK_TYPES = {
    test:      ['mc', 'multi', 'tf', 'match', 'gap', 'short', 'info'],
    reading:   ['mc', 'multi', 'tf', 'match', 'gap', 'short', 'info'],
    listening: ['mc', 'multi', 'tf', 'match', 'gap', 'short', 'info'],
    writing:   ['essay', 'info'],
    speaking:  ['essay', 'info']
  };

  var TF_VARIANTS = {
    tf:   ['True', 'False'],
    tfng: ['True', 'False', 'Not Given'],
    yn:   ['Yes', 'No'],
    ynng: ['Yes', 'No', 'Not Given'],
    ru:   ['Верно', 'Неверно'],
    rung: ['Верно', 'Неверно', 'В тексте не сказано']
  };

  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  var _idc = 0;
  function uid(prefix) {
    _idc++;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + _idc.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function newTask(type) {
    var t = { id: uid('t'), type: type, question: '', points: 1, media: [] };
    switch (type) {
      case 'mc': t.options = ['', '', '']; t.answer = null; break;
      case 'multi': t.options = ['', '', '', '']; t.answers = []; break;
      case 'tf': t.variant = 'tfng'; t.answer = null; break;
      case 'match': t.left = ['', '']; t.right = ['', '', '']; t.answer = [null, null]; t.points = 2; break;
      case 'gap': t.question = 'She {{goes}} to school every day.'; break;
      case 'short': t.answer = ''; break;
      case 'essay': t.minWords = 0; t.maxWords = 0; t.timeMinutes = 0; t.notes = ''; t.points = 10; break;
      case 'info': t.kind = 'text'; t.title = ''; t.text = ''; t.points = 0; break;
    }
    return t;
  }

  function newSection(type) {
    return { type: type, title: '', instructions: '', media: [], tasks: [] };
  }

  function newExam() {
    var sections = {};
    SECTION_TYPES.forEach(function (s) { sections[s] = newSection(s); });
    var enabled = {};
    SECTION_TYPES.forEach(function (s) { enabled[s] = true; });
    return {
      format: 'exam-builder/1',
      id: uid('exam'),
      title: 'Новый экзамен',
      subtitle: '',
      instructions: '',
      settings: {
        order: SECTION_TYPES.slice(),
        enabled: enabled,
        customOrder: false,
        timeLimit: 0,
        skillPoints: { test: 0, reading: 0, listening: 0, writing: 0, speaking: 0 },
        skillTime: { test: 0, reading: 0, listening: 0, writing: 0, speaking: 0 },
        showResults: true,
        showStudentFields: true
      },
      sections: sections
    };
  }

  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x) { return x == null ? '' : String(x); }
  function num(x, d) { var n = Number(x); return isFinite(n) ? n : (d || 0); }

  /* Приводит произвольный объект к корректной структуре (для загрузки JSON / импорта) */
  function normalize(exam) {
    var base = newExam();
    if (!exam || typeof exam !== 'object') return base;
    base.id = exam.id || base.id;
    base.title = str(exam.title) || base.title;
    base.subtitle = str(exam.subtitle);
    base.instructions = str(exam.instructions);
    var st = exam.settings || {};
    var order = arr(st.order).filter(function (s) { return SECTION_TYPES.indexOf(s) >= 0; });
    SECTION_TYPES.forEach(function (s) { if (order.indexOf(s) < 0) order.push(s); });
    base.settings.order = order;
    base.settings.customOrder = !!st.customOrder;
    if (st.enabled) SECTION_TYPES.forEach(function (s) { if (s in st.enabled) base.settings.enabled[s] = !!st.enabled[s]; });
    base.settings.timeLimit = num(st.timeLimit, 0);
    SECTION_TYPES.forEach(function (s) {
      base.settings.skillPoints[s] = Math.max(0, num(st.skillPoints && st.skillPoints[s], 0));
      base.settings.skillTime[s] = Math.max(0, num(st.skillTime && st.skillTime[s], 0));
    });
    base.settings.showResults = st.showResults !== false;
    base.settings.showStudentFields = st.showStudentFields !== false;
    var secs = exam.sections || {};
    SECTION_TYPES.forEach(function (s) {
      var src = secs[s]; if (!src) return;
      var d = base.sections[s];
      d.title = str(src.title); d.instructions = str(src.instructions);
      if (src.plays) d.plays = Math.max(0, Math.round(num(src.plays, 0)));
      d.media = arr(src.media).map(normMedia).filter(Boolean);
      d.tasks = arr(src.tasks).map(normTask).filter(function (t) {
        return t && SECTION_TASK_TYPES[s].indexOf(t.type) >= 0;
      });
    });
    return base;
  }

  function normMedia(m) {
    if (!m || !m.src) return null;
    return { id: m.id || uid('m'), kind: m.kind === 'audio' || m.kind === 'video' ? m.kind : 'image', name: str(m.name) || 'file', src: String(m.src) };
  }

  function normTask(t) {
    if (!t || !TASK_TYPES[t.type]) return null;
    var n = newTask(t.type);
    n.id = t.id || n.id;
    n.question = str(t.question != null ? t.question : n.question);
    n.points = num(t.points, n.points);
    n.media = arr(t.media).map(normMedia).filter(Boolean);
    if (t._keyed === true) n._keyed = true; // публичная метка наличия серверного ключа, сами ответы не раскрываются
    // время на задание (мин) и сколько раз можно проиграть аудио/видео задания (0 — без ограничения)
    if (t.timeMinutes) n.timeMinutes = Math.max(0, num(t.timeMinutes, 0));
    if (t.plays) n.plays = Math.max(0, Math.round(num(t.plays, 0)));
    switch (t.type) {
      case 'mc':
        n.options = arr(t.options).map(str);
        n.answer = (typeof t.answer === 'number' && t.answer >= 0 && t.answer < n.options.length) ? t.answer : null;
        break;
      case 'multi':
        n.options = arr(t.options).map(str);
        n.answers = arr(t.answers).filter(function (i) { return typeof i === 'number' && i >= 0 && i < n.options.length; });
        break;
      case 'tf':
        n.variant = TF_VARIANTS[t.variant] ? t.variant : 'tfng';
        n.answer = (typeof t.answer === 'number' && t.answer >= 0 && t.answer < TF_VARIANTS[n.variant].length) ? t.answer : null;
        break;
      case 'match':
        n.left = arr(t.left).map(str); n.right = arr(t.right).map(str);
        n.answer = n.left.map(function (_, i) {
          var a = arr(t.answer)[i];
          return (typeof a === 'number' && a >= 0 && a < n.right.length) ? a : null;
        });
        break;
      case 'short': n.answer = str(t.answer); break;
      case 'essay':
        n.minWords = num(t.minWords); n.maxWords = num(t.maxWords);
        n.timeMinutes = num(t.timeMinutes); n.notes = str(t.notes);
        break;
      case 'info':
        n.kind = ['text', 'instruction', 'transcript'].indexOf(t.kind) >= 0 ? t.kind : 'text';
        n.title = str(t.title); n.text = str(t.text); n.points = 0;
        break;
    }
    return n;
  }

  /* --- Пропуски: синтаксис {{ответ|вариант}} --- */
  var GAP_RE = /\{\{([^{}]*)\}\}/g;
  function parseGaps(text) {
    var parts = [], last = 0, m; GAP_RE.lastIndex = 0;
    text = str(text);
    while ((m = GAP_RE.exec(text))) {
      if (m.index > last) parts.push({ text: text.slice(last, m.index) });
      parts.push({ gap: true, answers: m[1].split('|').map(function (s) { return s.trim(); }).filter(Boolean) });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
  }
  function gapCount(text) { return parseGaps(text).filter(function (p) { return p.gap; }).length; }

  function normAnswer(s) {
    return str(s).toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').replace(/^[\s.,;:!?"«»]+|[\s.,;:!?"«»]+$/g, '');
  }

  /* Максимальный автоматический балл задания */
  function maxAuto(task) {
    switch (task.type) {
      case 'mc': case 'multi': case 'tf': case 'short': return task.points || 1;
      case 'match': return task.left.length;
      case 'gap': return gapCount(task.question);
      default: return 0;
    }
  }

  /* Проверка ответа ученика. Возвращает {score, max, detail} или null (ручная проверка) */
  function grade(task, resp) {
    var max = maxAuto(task);
    switch (task.type) {
      case 'mc':
        if (task.answer == null) return { score: 0, max: 0, ungraded: true };
        return { score: resp === task.answer ? max : 0, max: max };
      case 'multi':
        if (!task.answers.length) return { score: 0, max: 0, ungraded: true };
        /* частичный балл: каждый верно отмеченный вариант даёт долю max / (число верных вариантов),
           каждый лишний (неверно отмеченный) вариант снимает одну такую долю; не меньше 0, округление до десятых */
        var sel = arr(resp).filter(function (v, i, A) { return A.indexOf(v) === i; });
        var hit = sel.filter(function (v) { return task.answers.indexOf(v) >= 0; }).length, miss = sel.length - hit;
        var share = Math.max(0, hit - miss) / task.answers.length;
        return { score: Math.round(max * share * 10 + 1e-9) / 10, max: max };
      case 'tf':
        if (task.answer == null) return { score: 0, max: 0, ungraded: true };
        return { score: resp === task.answer ? max : 0, max: max };
      case 'short':
        if (!task.answer) return { score: 0, max: 0, ungraded: true };
        var ok = task.answer.split('|').some(function (x) { return normAnswer(x) === normAnswer(resp); });
        return { score: ok ? max : 0, max: max };
      case 'match':
        var s = 0, m = 0, det = [];
        task.left.forEach(function (_, i) {
          if (task.answer[i] == null) { det.push(null); return; }
          m++;
          var okk = arr(resp)[i] === task.answer[i]; if (okk) s++; det.push(okk);
        });
        return { score: s, max: m, detail: det, ungraded: m === 0 };
      case 'gap':
        var gaps = parseGaps(task.question).filter(function (p) { return p.gap; });
        var sc = 0, mx = 0, d2 = [];
        gaps.forEach(function (g, i) {
          if (!g.answers.length) { d2.push(null); return; }
          mx++;
          var ok2 = g.answers.some(function (x) { return normAnswer(x) === normAnswer(arr(resp)[i]); });
          if (ok2) sc++; d2.push(ok2);
        });
        return { score: sc, max: mx, detail: d2, ungraded: mx === 0 };
      default:
        return null;
    }
  }

  function countWords(s) {
    var m = str(s).trim().match(/[^\s]+/g);
    return m ? m.length : 0;
  }

  function sectionTitle(exam, type) {
    var s = exam.sections[type];
    return (s && s.title) || SECTION_LABELS[type];
  }

  /* Разделы, которые реально пойдут в тест/документ: по порядку, включённые, непустые */
  function activeSections(exam, opts) {
    opts = opts || {};
    var order = exam.settings.customOrder ? exam.settings.order : SECTION_TYPES;
    return order.filter(function (t) {
      var s = exam.sections[t];
      if (!s) return false;
      if (!opts.includeDisabled && !exam.settings.enabled[t]) return false;
      return s.tasks.length > 0 || s.media.length > 0 || !!s.instructions;
    });
  }

  function gradedCount(section) {
    return section.tasks.filter(function (t) { return t.type !== 'info'; }).length;
  }

  /* Нумерация заданий внутри раздела (info-блоки без номера) */
  function numberTasks(section) {
    var n = 0;
    return section.tasks.map(function (t) { return TASK_TYPES[t.type].unnumbered ? null : ++n; });
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  return {
    SECTION_TYPES: SECTION_TYPES, SECTION_LABELS: SECTION_LABELS, SECTION_LABELS_EN: SECTION_LABELS_EN,
    SECTION_LIMITS: SECTION_LIMITS, TASK_TYPES: TASK_TYPES, SECTION_TASK_TYPES: SECTION_TASK_TYPES,
    TF_VARIANTS: TF_VARIANTS, LETTERS: LETTERS,
    uid: uid, newTask: newTask, newSection: newSection, newExam: newExam, normalize: normalize, normTask: normTask,
    parseGaps: parseGaps, gapCount: gapCount, normAnswer: normAnswer, grade: grade, maxAuto: maxAuto,
    countWords: countWords, sectionTitle: sectionTitle, activeSections: activeSections,
    gradedCount: gradedCount, numberTasks: numberTasks, clone: clone
  };
});
