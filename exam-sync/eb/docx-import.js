/* Импорт .docx -> экзамен. Эвристики: заголовки разделов по ключевым словам и стилям,
 * перезапуск нумерации, варианты ответов (A/B/C, а/б/в, автонумерация Word, в строку),
 * True/False/Not Given, сопоставления (таблицы, списки 1..n + A..m), пропуски (____),
 * объём слов/время (письмо/говорение), строки «Ответ:», ключи в конце документа,
 * выделение правильных ответов (жирный/подчёркнутый/цвет/маркер ✓ * +), картинки.
 * parseDocx(arrayBuffer|Uint8Array, {JSZip}) -> Promise<{exam, report, segments}> */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'), require('./xml.js'));
  else root.DocxImport = factory(root.ExamModel, root.MiniXML);
})(typeof self !== 'undefined' ? self : this, function (M, X) {
  'use strict';
  var kid = X.kid, kids = X.kids;

  /* ============ 1. Чтение OOXML ============ */
  var EM_B = 1, EM_U = 2, EM_HL = 4, EM_COL = 8, EM_I = 16;

  function onOff(el) {
    if (!el) return null;
    var v = el.attrs['w:val'];
    return !(v === '0' || v === 'false' || v === 'off');
  }
  function isColored(hex) {
    if (!hex || hex === 'auto' || !/^[0-9a-fA-F]{6}$/.test(hex)) return false;
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) > 45;
  }

  function indOf(pPr) {
    var ind = pPr && kid(pPr, 'w:ind');
    if (!ind) return null;
    var v = ind.attrs['w:left'] != null ? ind.attrs['w:left'] : ind.attrs['w:start'];
    return v != null ? parseInt(v, 10) || 0 : null;
  }
  function readStyles(xml) {
    var styles = {};
    if (!xml) return styles;
    var doc = X.parse(xml);
    X.find(doc, 'w:style').forEach(function (s) {
      var id = s.attrs['w:styleId']; if (!id) return;
      var name = (kid(s, 'w:name') || { attrs: {} }).attrs['w:val'] || id;
      var pPr = kid(s, 'w:pPr'), rPr = kid(s, 'w:rPr');
      var numPr = pPr && kid(pPr, 'w:numPr');
      var ol = pPr && kid(pPr, 'w:outlineLvl');
      styles[id] = {
        name: name,
        basedOn: (kid(s, 'w:basedOn') || { attrs: {} }).attrs['w:val'],
        outline: ol ? +ol.attrs['w:val'] : null,
        numId: numPr && kid(numPr, 'w:numId') ? numPr && kid(numPr, 'w:numId').attrs['w:val'] : null,
        ilvl: numPr && kid(numPr, 'w:ilvl') ? +kid(numPr, 'w:ilvl').attrs['w:val'] : 0,
        b: rPr ? onOff(kid(rPr, 'w:b')) : null,
        i: rPr ? onOff(kid(rPr, 'w:i')) : null,
        jc: pPr && kid(pPr, 'w:jc') ? kid(pPr, 'w:jc').attrs['w:val'] : null,
        ind: indOf(pPr)
      };
    });
    // наследование basedOn
    function resolve(id, depth) {
      var s = styles[id]; if (!s || depth > 10) return s;
      if (s._res) return s;
      var p = s.basedOn && resolve(s.basedOn, depth + 1);
      if (p) {
        ['outline', 'numId', 'b', 'i', 'jc', 'ind'].forEach(function (k) { if (s[k] == null) s[k] = p[k]; });
      }
      s._res = true; return s;
    }
    Object.keys(styles).forEach(function (k) { resolve(k, 0); });
    return styles;
  }

  function readNumbering(xml) {
    var abs = {}, nums = {};
    if (!xml) return { abs: abs, nums: nums };
    var doc = X.parse(xml);
    X.find(doc, 'w:abstractNum').forEach(function (a) {
      var levels = [];
      kids(a, 'w:lvl').forEach(function (l) {
        var il = +l.attrs['w:ilvl'];
        levels[il] = {
          fmt: (kid(l, 'w:numFmt') || { attrs: {} }).attrs['w:val'] || 'decimal',
          text: (kid(l, 'w:lvlText') || { attrs: {} }).attrs['w:val'] || '',
          start: +((kid(l, 'w:start') || { attrs: {} }).attrs['w:val'] || 1),
          ind: indOf(kid(l, 'w:pPr'))
        };
      });
      abs[a.attrs['w:abstractNumId']] = levels;
    });
    X.find(doc, 'w:num').forEach(function (n) {
      var o = {};
      kids(n, 'w:lvlOverride').forEach(function (lo) {
        var so = kid(lo, 'w:startOverride');
        if (so) o[+lo.attrs['w:ilvl']] = +so.attrs['w:val'];
      });
      var an = kid(n, 'w:abstractNumId');
      nums[n.attrs['w:numId']] = { abs: an ? an.attrs['w:val'] : null, over: o };
    });
    return { abs: abs, nums: nums };
  }

  var RU_UP = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ', RU_LO = RU_UP.toLowerCase();
  var TFWORD_RE = /^(true|false|not given|yes|no|верно|неверно|да|нет|правда|ложь|对|错|正确|错误|benar|salah)\.?$/i;
  function roman(n) {
    var r = '', map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    map.forEach(function (p) { while (n >= p[0]) { r += p[1]; n -= p[0]; } });
    return r;
  }
  function fmtNum(v, fmt) {
    switch (fmt) {
      case 'upperLetter': return M.LETTERS[(v - 1) % 26];
      case 'lowerLetter': return M.LETTERS[(v - 1) % 26].toLowerCase();
      case 'upperRoman': return roman(v);
      case 'lowerRoman': return roman(v).toLowerCase();
      case 'russianUpper': return RU_UP[(v - 1) % RU_UP.length];
      case 'russianLower': return RU_LO[(v - 1) % RU_LO.length];
      case 'bullet': return '•';
      case 'none': return '';
      case 'decimalZero': return (v < 10 ? '0' : '') + v;
      default: return String(v);
    }
  }

  function Numberer(numbering) {
    this.n = numbering; this.counters = {}; this.seen = {};
  }
  Numberer.prototype.next = function (numId, ilvl) {
    var num = this.n.nums[numId]; if (!num || numId === '0') return null;
    var levels = this.n.abs[num.abs]; if (!levels) return null;
    var lvl = levels[ilvl]; if (!lvl) return null;
    var c = this.counters[num.abs] || (this.counters[num.abs] = []);
    if (!this.seen[numId]) {
      this.seen[numId] = true;
      Object.keys(num.over).forEach(function (k) { c[k] = num.over[k] - 1; for (var j = +k + 1; j < 9; j++) c[j] = null; });
    }
    c[ilvl] = (c[ilvl] == null ? lvl.start - 1 : c[ilvl]) + 1;
    for (var k = ilvl + 1; k < 9; k++) c[k] = null;
    var text = lvl.text.replace(/%(\d)/g, function (_, d) {
      var li = +d - 1, L = levels[li] || lvl;
      return fmtNum(c[li] == null ? L.start : c[li], L.fmt);
    });
    return { label: text, fmt: lvl.fmt, value: c[ilvl], level: ilvl, ind: lvl.ind, numId: numId };
  };

  function Reader(ctx) { this.ctx = ctx; }

  Reader.prototype.para = function (p) {
    var ctx = this.ctx;
    var pPr = kid(p, 'w:pPr');
    var styleId = pPr && kid(pPr, 'w:pStyle') ? kid(pPr, 'w:pStyle').attrs['w:val'] : null;
    var st = (styleId && ctx.styles[styleId]) || {};
    var styleName = st.name || styleId || '';
    var numPr = pPr && kid(pPr, 'w:numPr');
    var numId = numPr && kid(numPr, 'w:numId') ? kid(numPr, 'w:numId').attrs['w:val'] : st.numId;
    var ilvl = numPr && kid(numPr, 'w:ilvl') ? +kid(numPr, 'w:ilvl').attrs['w:val'] : (st.ilvl || 0);
    var jc = pPr && kid(pPr, 'w:jc') ? kid(pPr, 'w:jc').attrs['w:val'] : st.jc;
    var olEl = pPr && kid(pPr, 'w:outlineLvl');
    var outline = olEl ? +olEl.attrs['w:val'] : st.outline;
    var hm = /^(heading|заголовок)\s*(\d)/i.exec(styleName);
    var heading = hm ? +hm[2] : (outline != null && outline < 9 ? outline + 1 : null);
    var isTitle = /^(title|название|заголовок$)/i.test(styleName);
    var hasBorder = !!(pPr && kid(pPr, 'w:pBdr'));

    var text = '', chars = [], images = [];
    var self = this;
    function addText(t, em) {
      text += t;
      for (var i = 0; i < t.length; i++) chars.push(em);
    }
    function walkRun(r) {
      var rPr = kid(r, 'w:rPr');
      var b = rPr ? onOff(kid(rPr, 'w:b')) : null; if (b == null) b = !!st.b;
      var it = rPr ? onOff(kid(rPr, 'w:i')) : null; if (it == null) it = !!st.i;
      var uEl = rPr && kid(rPr, 'w:u'); var u = uEl && uEl.attrs['w:val'] !== 'none';
      var hlEl = rPr && kid(rPr, 'w:highlight'); var hl = hlEl && hlEl.attrs['w:val'] !== 'none';
      var shd = rPr && kid(rPr, 'w:shd'); if (shd && shd.attrs['w:fill'] && !/^(auto|FFFFFF)$/i.test(shd.attrs['w:fill'])) hl = true;
      var colEl = rPr && kid(rPr, 'w:color'); var col = colEl && isColored(colEl.attrs['w:val']);
      var strike = rPr && onOff(kid(rPr, 'w:strike'));
      var em = (b ? EM_B : 0) | (u ? EM_U : 0) | (hl ? EM_HL : 0) | (col ? EM_COL : 0) | (it ? EM_I : 0);
      (r.children || []).forEach(function (c) {
        switch (c.name) {
          case 'w:t': addText(strike ? '' : X.textOf(c), em); break;
          case 'w:tab': case 'w:ptab': addText('\t', em); break;
          case 'w:br': case 'w:cr': addText('\n', em); break;
          case 'w:noBreakHyphen': addText('-', em); break;
          case 'w:sym':
            var code = parseInt(c.attrs['w:char'] || '0', 16);
            // Wingdings-галочки (F0FC, F0FE) -> ✓
            addText((code === 0xF0FC || code === 0xF0FE || code === 0xF050) ? '✓' : '', em); break;
          case 'w:drawing': case 'w:pict': case 'w:object': case 'mc:AlternateContent':
            X.find(c, 'a:blip').forEach(function (bl) { if (bl.attrs['r:embed']) images.push(bl.attrs['r:embed']); });
            X.find(c, 'v:imagedata').forEach(function (vi) { if (vi.attrs['r:id'] && c.name !== 'mc:AlternateContent') images.push(vi.attrs['r:id']); });
            break;
        }
      });
    }
    function walk(node) {
      (node.children || []).forEach(function (c) {
        if (c.name === 'w:r') walkRun(c);
        else if (c.name === 'w:hyperlink' || c.name === 'w:ins' || c.name === 'w:smartTag' || c.name === 'w:fldSimple' || c.name === 'w:customXml') walk(c);
        else if (c.name === 'w:sdt') { var sc = kid(c, 'w:sdtContent'); if (sc) walk(sc); }
      });
    }
    walk(p);
    images = images.filter(function (v, i, a) { return a.indexOf(v) === i; });

    var num = null;
    if (numId) num = ctx.numberer.next(numId, ilvl);
    var indent = indOf(pPr);
    if (indent == null) indent = st.ind != null ? st.ind : (num && num.ind != null ? num.ind : 0);

    // обрезка пробелов с синхронизацией chars
    var lead = text.match(/^\s*/)[0].length, trail = text.match(/\s*$/)[0].length;
    if (lead || trail) { text = text.slice(lead, text.length - trail); chars = chars.slice(lead, chars.length - trail); }

    function mk(t, ch, first) {
      var lead2 = t.match(/^\s*/)[0].length, trail2 = t.match(/\s*$/)[0].length;
      t = t.slice(lead2, t.length - trail2); ch = ch.slice(lead2, ch.length - trail2);
      var ns = 0, nb = 0, ni = 0;
      for (var i = 0; i < t.length; i++) {
        if (/\s/.test(t[i])) continue;
        ns++; if (ch[i] & EM_B) nb++; if (ch[i] & EM_I) ni++;
      }
      return {
        kind: 'p', text: t, chars: ch, images: first ? images : [], num: first ? num : null, styleName: styleName, indent: indent,
        heading: first ? heading : null, isTitle: first && isTitle, align: jc, border: hasBorder,
        allBold: ns > 0 && nb === ns, allItalic: ns > 0 && ni === ns
      };
    }
    if (text.indexOf('\n') < 0) return mk(text, chars, true);
    // мягкие переносы (Shift+Enter) = отдельные логические строки
    var out = [], pos = 0;
    text.split('\n').forEach(function (line, li) {
      var b = mk(line, chars.slice(pos, pos + line.length), li === 0);
      pos += line.length + 1;
      if (b.text || b.images.length || li === 0) out.push(b);
    });
    return out;
  };

  Reader.prototype.table = function (tbl) {
    var self = this, rows = [];
    kids(tbl, 'w:tr').forEach(function (tr) {
      var row = [];
      kids(tr, 'w:tc').forEach(function (tc) {
        var paras = [];
        self.walkBody(tc, paras);
        row.push(paras.filter(function (b) { return b.kind === 'p'; }));
      });
      rows.push(row);
    });
    var images = [];
    rows.forEach(function (r) { r.forEach(function (c) { c.forEach(function (p) { images = images.concat(p.images); }); }); });
    return { kind: 'table', rows: rows, images: images };
  };

  Reader.prototype.walkBody = function (node, out) {
    var self = this;
    (node.children || []).forEach(function (c) {
      if (c.name === 'w:p') { var pb = self.para(c); if (Array.isArray(pb)) pb.forEach(function (x) { out.push(x); }); else out.push(pb); }
      else if (c.name === 'w:tbl') out.push(self.table(c));
      else if (c.name === 'w:sdt') { var sc = kid(c, 'w:sdtContent'); if (sc) self.walkBody(sc, out); }
      else if (c.name === 'w:customXml') self.walkBody(c, out);
    });
    return out;
  };

  function cellText(cell) { return cell.map(function (p) { return (p.num && p.num.fmt !== 'bullet' ? p.num.label + ' ' : '') + p.text; }).join('\n').trim(); }

  /* ============ 2. Распознавание строк ============ */
  var KW = [
    ['test', /(тестов[а-яё]*\s+част|тестировани|use of english|grammar|vocabulary|грамматик|лексик|language\s+(in\s+)?use|language focus|^тест(?![а-яё])|^test\b)/i],
    ['reading', /(чтени[ея]|reading)/i],
    ['listening', /(аудировани|слушани|listening)/i],
    ['writing', /(письменн[а-яё]*\s+(част|работ|задани)|^письмо(?![а-яё])|writing)/i],
    ['speaking', /(говорени|устн[а-яё]*\s+(част|речь|ответ)|speaking|^устная)/i]
  ];
  function keywordType(t) {
    var best = null, pos = 1e9;
    KW.forEach(function (k) {
      var m = k[1].exec(t);
      if (m && m.index < pos) { pos = m.index; best = k[0]; }
    });
    return best ? { type: best, pos: pos } : null;
  }
  function isCaps(t) {
    var letters = t.replace(/[^A-Za-zА-Яа-яЁё]/g, '');
    return letters.length >= 4 && letters === letters.toUpperCase();
  }

  var SEC_PREFIX = /^\s*(раздел|section|part|часть|paper|модуль|блок|module)\s*([IVX]+|\d+|[A-DА-Г])?\s*[.:)\-–—]?\s*/i;
  function sectionHeader(b) {
    if (b.kind !== 'p' || b.sub || b.skip || b.forceQ || b.forceOpt) return null;
    var t = b.text.replace(/\s+/g, ' ').trim();
    if (!t || t.length > 110) return null;
    var hasPrefix = SEC_PREFIX.test(t) && /^(раздел|section|part|часть|paper|модуль|блок|module)\b/i.test(t);
    var core = t.replace(SEC_PREFIX, '').replace(/^([IVX]+|\d{1,2})\s*[.)]\s*/, '').replace(/^[«"“]/, '');
    var headerish = b.heading != null || b.allBold || isCaps(t) || b.align === 'center' || (hasPrefix && t.length <= 60);
    if (/[.!?]$/.test(t) && t.length > 40 && b.heading == null) return null;
    var k;
    if (headerish) {
      k = keywordType(core);
      if (!k) return null;
      var before = core.slice(0, k.pos).trim().split(/\s+/).filter(Boolean).length;
      if (before > 3 && core.length > 45) return null;
    } else {
      // строка вида «1. Listening (True/False)» или «Reading»
      if (t.length > 60) return null;
      k = keywordType(core);
      if (!k || k.pos > 0 || !/^[A-ZА-ЯЁ]/.test(core)) return null;
      if (/[.?]$/.test(t) && t.length > 25) return null;
    }
    var title = '';
    var dash = core.split(/\s+[—–-]\s+/);
    if (dash.length > 1 && keywordType(dash[0])) title = dash.slice(1).join(' — ').trim();
    else if (!/^(тестовая часть|чтение|аудирование|слушание|письменная часть|письмо|говорение|reading|listening|writing|speaking|use of english)$/i.test(core)) title = core;
    return { type: k.type, title: title };
  }

  var KEY_RE = /^\s*(ключи?(\s+к\s+\S+)?|ключи\s+ответов|ответы(\s+к\s+\S+)?|answer\s*keys?|answers|keys)\s*[:.]?\s*$/i;
  function isKeyHeader(b) {
    return b.kind === 'p' && KEY_RE.test(b.text) && (b.heading != null || b.allBold || isCaps(b.text) || b.text.length < 30);
  }

  // Номер вопроса
  function qnum(b) {
    if (b.kind !== 'p' || b.sub || b.skip || b.forceOpt || b.forceLeft || b.forceRight) return null;
    if (b.forceQ) return { n: null, text: b.text, offset: 0, style: '.' };
    if (TFWORD_RE.test(b.text.replace(/^\s*\d\s*[.)]\s*/, '').trim())) return null;
    if (b.num && b.num.level === 0 && /^(decimal|decimalZero)$/.test(b.num.fmt)) {
      return { n: b.num.value, text: b.text, offset: 0, style: /\)/.test(b.num.label) ? ')' : '.' };
    }
    var m = /^\s*(?:№\s*)?(\d{1,3})\s*([.)、．])(?!\d)\s*(?=\S)/.exec(b.text);
    if (m) return { n: +m[1], text: b.text.slice(m[0].length), offset: m[0].length, style: m[2] === ')' ? ')' : '.' };
    m = /^\s*[（(]\s*(\d{1,3})\s*[)）]\s*(?=\S)/.exec(b.text);
    if (m) return { n: +m[1], text: b.text.slice(m[0].length), offset: m[0].length, style: '.' };
    m = /^\s*(?:question|вопрос)\s+(\d{1,3})\s*[.:)]?\s*/i.exec(b.text);
    if (m) return { n: +m[1], text: b.text.slice(m[0].length), offset: m[0].length, style: '.' };
    return null;
  }

  // «Задание 1», «Task 2», «Exercise 3», «I. ...»
  var GROUP_RE = /^\s*(задание|task|exercise|упражнение|activity|part|часть)\s*(\d+|[IVX]+)(?![\dа-яёa-z])\s*[.:)\-–—]?\s*/i;
  var ROMAN_RE = /^\s*([IVX]{1,5})\s*[.)]\s+(?=\S)/;
  function groupHead(b) {
    if (b.kind !== 'p' || b.forceOpt || b.forceQ || b.skip || b.sub || b.forceLeft || b.forceRight) return null;
    var m = GROUP_RE.exec(b.text);
    if (m) return { label: m[0].trim(), text: b.text.slice(m[0].length).trim() };
    m = ROMAN_RE.exec(b.text);
    if (m) return { label: m[1], text: b.text.slice(m[0].length).trim() };
    if (b.num && b.num.level === 0 && /Roman/.test(b.num.fmt)) return { label: b.num.label, text: b.text };
    return null;
  }

  function letterIndex(ch) {
    if (!ch) return -1;
    var c = ch.toUpperCase();
    var i = M.LETTERS.indexOf(c);
    if (i >= 0 && i < 8) return i;
    i = 'АБВГДЕЖЗ'.indexOf(c);
    return i;
  }

  function emphOf(b, start, end) {
    var n = 0, c = { b: 0, u: 0, hl: 0, col: 0 };
    for (var i = start; i < end && i < b.text.length; i++) {
      if (/\s/.test(b.text[i])) continue;
      n++; var e = b.chars[i] || 0;
      if (e & EM_B) c.b++; if (e & EM_U) c.u++; if (e & EM_HL) c.hl++; if (e & EM_COL) c.col++;
    }
    if (!n) return { emph: false, bold: false, strong: false };
    var maj = function (v) { return v / n > 0.6; };
    return { bold: maj(c.b), strong: maj(c.u) || maj(c.hl) || maj(c.col), emph: maj(c.b) || maj(c.u) || maj(c.hl) || maj(c.col) };
  }

  var MARK_RE = /\s*(✓|✔|☑|✅|\(\s*(correct|верно|правильно|прав\.?)\s*\)|\[\s*(correct|right|верно|правильно)\s*\]|\+)\s*$/i;
  var MARK_PRE = /^\s*(\*|✓|✔|\+)\s*/;
  function cleanOption(text) {
    var marked = false, t = text;
    if (MARK_RE.test(t)) { marked = true; t = t.replace(MARK_RE, ''); }
    if (MARK_PRE.test(t)) { marked = true; t = t.replace(MARK_PRE, ''); }
    if (/\s\*$/.test(t)) { marked = true; t = t.replace(/\s*\*$/, ''); }
    return { text: t.trim(), marked: marked };
  }

  var OPT_ONE = /^\s*([*+✓✔]\s*)?([A-Ha-h]|[А-Еа-е])\s*[.)、．）]\s*(?=\S)/;
  var OPT_INLINE = /(^|[\s\t])([A-Ha-h]|[А-Еа-е])\s*[.)、．）]\s*(?=\S)/g;

  // Варианты в строке: «A) ... B) ... C) ...» — буквы идут подряд с A/а
  function inlineOptions(b, from) {
    var t = b.text, ms = [], m;
    OPT_INLINE.lastIndex = from || 0;
    while ((m = OPT_INLINE.exec(t))) {
      var idx = letterIndex(m[2]);
      var expected = ms.length;
      if (idx === expected) ms.push({ idx: idx, at: m.index + m[1].length, textAt: m.index + m[0].length });
      else if (idx === 0 && ms.length === 0) ms.push({ idx: 0, at: m.index + m[1].length, textAt: m.index + m[0].length });
    }
    if (ms.length < 2) return null;
    return ms.map(function (o, i) {
      var end = i + 1 < ms.length ? ms[i + 1].at : t.length;
      var raw = t.slice(o.textAt, end).replace(/[;,]\s*$/, '');
      var c = cleanOption(raw);
      var e = emphOf(b, o.textAt, end), le = emphOf(b, o.at, o.at + 1);
      return { idx: o.idx, text: c.text, marked: c.marked, emph: e.emph, bold: e.bold, strong: e.strong, letterEmph: le.emph, start: o.at };
    });
  }

  // Одна строка-вариант или несколько вариантов в строке
  function optionsOf(b) {
    if (b.kind !== 'p' || b.skip) return null;
    if (b.forceOpt) {
      var cf = cleanOption(b.text), ef = emphOf(b, 0, b.text.length);
      return [{ idx: null, text: cf.text, marked: cf.marked || b.forceOpt === 'right', emph: false, bold: false, strong: false, wholeLine: true }];
    }
    var tfm = /^\s*(\d)\s*[.)]\s*(.+)$/.exec(b.text);
    var tfLabelText = tfm ? tfm[2] : (b.num && /decimal/.test(b.num.fmt) ? b.text : null);
    if (tfLabelText && TFWORD_RE.test(cleanOption(tfLabelText).text)) {
      var ct = cleanOption(tfLabelText), et = emphOf(b, b.text.length - tfLabelText.length, b.text.length), lt = emphOf(b, 0, 1);
      return [{ idx: tfm ? +tfm[1] - 1 : (b.num.value - 1), text: ct.text, marked: ct.marked, emph: et.emph, bold: et.bold, strong: et.strong, letterEmph: tfm ? lt.emph : false, wholeLine: true }];
    }
    if (b.sub) {
      var cs = cleanOption(b.text), es = emphOf(b, 0, b.text.length);
      var li = /Letter|russian/.test(b.num.fmt) ? b.num.value - 1 : null;
      var m0 = li == null ? OPT_ONE.exec(b.text) : null;
      if (m0) { li = letterIndex(m0[2]); cs = cleanOption(b.text.slice(m0[0].length)); if (m0[1]) cs.marked = true; }
      return [{ idx: li, text: cs.text, marked: cs.marked, emph: es.emph, bold: es.bold, strong: es.strong, wholeLine: true }];
    }
    if (b.num && /Letter|russian/.test(b.num.fmt)) {
      var inl0 = inlineOptions(b, 0);
      if (inl0 && inl0.length >= 2 && inl0[0].idx === 1) { /* продолжение после автонумерации — редкость */ }
      var c = cleanOption(b.text), e = emphOf(b, 0, b.text.length);
      return [{ idx: b.num.value - 1, text: c.text, marked: c.marked, emph: e.emph, bold: e.bold, strong: e.strong, wholeLine: true }];
    }
    var inl = inlineOptions(b, 0);
    if (inl && inl[0].start <= 2) return inl;
    var m = OPT_ONE.exec(b.text);
    if (m) {
      var idx = letterIndex(m[2]);
      if (idx < 0) return null;
      var c2 = cleanOption(b.text.slice(m[0].length)), e2 = emphOf(b, m[0].length, b.text.length);
      if (m[1]) c2.marked = true;
      var lp = b.text.indexOf(m[2], (m[1] || '').length), le2 = emphOf(b, lp, lp + 1);
      return [{ idx: idx, text: c2.text, marked: c2.marked, emph: e2.emph, bold: e2.bold, strong: e2.strong, letterEmph: le2.emph, wholeLine: true }];
    }
    return null;
  }

  // «a concentrate b spell c learn» (буквы без скобок) — только сразу после вопроса
  function bareLetterOptions(b) {
    var t = b.text;
    if (t.length > 120 || /[.?!]$/.test(t)) return null;
    var m = /^\s*a\s+(.+?)\s+b\s+(.+?)\s+c\s+(.+?)(?:\s+d\s+(.+?))?\s*$/.exec(t);
    if (!m) return null;
    return [m[1], m[2], m[3], m[4]].filter(Boolean).map(function (x, i) { var c = cleanOption(x); return { idx: i, text: c.text, marked: c.marked, emph: false }; });
  }

  // «She ___ to school. (go / goes / went)»
  function slashOptions(text) {
    var m = /\(([^()]{1,80}\/[^()]{1,80})\)\s*$/.exec(text);
    if (!m) return null;
    var parts = m[1].split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length < 2 || parts.length > 5 || parts.some(function (p) { return p.split(/\s+/).length > 4; })) return null;
    return { stem: text.slice(0, m.index).trim(), options: parts };
  }

  var TF_SETS = [
    { re: /\btrue\b[\s\/|,–-]*\bfalse\b[\s\/|,–-]*\bnot\s+given\b/i, v: 'tfng' },
    { re: /\byes\b[\s\/|,–-]*\bno\b[\s\/|,–-]*\bnot\s+given\b/i, v: 'ynng' },
    { re: /(^|[^а-яё])верно[\s\/|,–-]*неверно[\s\/|,–-]*(в тексте )?не сказано/i, v: 'rung' },
    { re: /\btrue\b[\s\/|,–-]*\bfalse\b/i, v: 'tf' },
    { re: /(^|[\s(])T\s*[\/|]?\s*F\s*[\/|]?\s*NG(?=$|[\s).])/, v: 'tfng' },
    { re: /(^|[\s(])T\s*[\/|]\s*F(?=$|[\s).])/, v: 'tf' },
    { re: /\byes\b[\s\/|,–-]+\bno\b/i, v: 'yn' },
    { re: /(^|[^а-яё])верно[\s\/|,–-]*неверно(?![а-яё])/i, v: 'ru' },
    { re: /(^|[^а-яё])да\s*[\/|]\s*нет(?![а-яё])/i, v: 'ru' }
  ];
  function tfVariantIn(text) {
    text = String(text).replace(/\s*[✓✔]/g, '');
    for (var i = 0; i < TF_SETS.length; i++) if (TF_SETS[i].re.test(text)) return TF_SETS[i].v;
    return null;
  }
  function tfFromAnswer(ans, variant) {
    var a = String(ans || '').trim().toLowerCase().replace(/[✓✔.]/g, '').trim();
    if (/^(t|true|верно|да|yes|y|в|1|\+|对|正确|√|benar|правда)$/.test(a)) return 0;
    if (/^(f|false|неверно|нет|no|n|н|2|-|–|错|错误|×|salah|ложь)$/.test(a)) return 1;
    if (/^(ng|not given|не сказано|в тексте не сказано|нс|ns|3|\?)$/.test(a)) return 2;
    return null;
  }
  // Строка с метками True/False/NG, где одна выделена
  function tfLabelLine(b) {
    if (b.kind !== 'p' || b.text.length > 70) return null;
    var v = tfVariantIn(b.text); if (!v) return null;
    var stripped = b.text.replace(/true|false|not\s+given|yes|no|верно|неверно|в тексте не сказано|не сказано|(?<![а-яё])да(?![а-яё])|(?<![а-яё])нет(?![а-яё])|\bT\b|\bF\b|\bNG\b|[\s\/|,✓✔–\-]/gi, '');
    if (stripped.length > 3) return null;
    var labels = M.TF_VARIANTS[v], answer = null;
    var lower = b.text.toLowerCase();
    var marks = labels.map(function (l, i) {
      var p = lower.indexOf(l.toLowerCase());
      if (v === 'tf' || v === 'tfng') { var short = ['t', 'f', 'ng'][i]; if (p < 0) { var mm = new RegExp('\\b' + short + '\\b', 'i').exec(b.text); p = mm ? mm.index : -1; } }
      if (p < 0) return false;
      var end = p + l.length;
      var after = b.text.slice(end, end + 3);
      var e = emphOf(b, p, end);
      return { i: i, check: /✓|✔/.test(after), emph: e.strong || e.bold };
    }).filter(Boolean);
    var checked = marks.filter(function (x) { return x.check; });
    var emphd = marks.filter(function (x) { return x.emph; });
    if (checked.length === 1) answer = checked[0].i;
    else if (emphd.length === 1 && marks.length > 1) answer = emphd[0].i;
    return { variant: v, answer: answer };
  }

  var ANS_RE = /^\s*(ответ|answer|ans|key|ключ|правильный ответ|correct answer|答案|正确答案|参考答案|jawaban|kunci)\s*[:\-–—：]\s*(.*)$/i;
  var KEYLINE_RE = /^\s*(答案汇总|answer key|answers|ключи?|ответы|kunci jawaban)\s*[:：]\s*(.+)$/i;
  var META_RE = /^\s*(解析|知识点|explanation|correct feedback|incorrect feedback|feedback|пояснение|обоснование)\s*[:：]/i;
  var WC = [
    [/(\d{2,4})\s*[-–—]\s*(\d{2,4})\s*(слов|words)/i, function (m) { return [+m[1], +m[2]]; }],
    [/(не менее|at least|minimum|min\.?|от)\s*(\d{2,4})\s*(слов|words)/i, function (m) { return [+m[2], 0]; }],
    [/(не более|no more than|up to|maximum|max\.?|до)\s*(\d{2,4})\s*(слов|words)/i, function (m) { return [0, +m[2]]; }],
    [/(about|around|около|примерно|приблизительно)\s*(\d{2,4})\s*(слов|words)/i, function (m) { return [0, +m[2]]; }],
    [/(\d{2,4})\s*(слов|words)/i, function (m) { return [0, +m[1]]; }]
  ];
  function wordLimits(text) {
    for (var i = 0; i < WC.length; i++) { var m = WC[i][0].exec(text); if (m) return WC[i][1](m); }
    return null;
  }
  function timeLimit(text) {
    var m = /(\d{1,2}(?:[.,]5)?)\s*(?:[-–]\s*(\d{1,2})\s*)?(мин|minute|min\b)/i.exec(text);
    return m ? parseFloat((m[2] || m[1]).replace(',', '.')) : 0;
  }
  var GAP_RE = /_{3,}|\.{5,}|…{2,}|\(\s*\d{1,2}\s*\)\s*_{2,}/g;
  var AUDIO_RE = /\.(mp3|wav|ogg|m4a|aac)\b|аудиозапис|аудиофайл|audio\s*(file|track|recording)|track\s*\d+|трек\s*\d+|🎧/i;
  var TRANSCRIPT_RE = /^\s*(транскрипт|скрипт|текст(ы)? для аудирования|tapescript|transcript|audioscript|audio script)(?![а-яёa-z])/i;
  var SKIP_RE = /^\s*(фио|ф\.\s?и\.\s?о\.?|name|имя|фамилия|class|класс|дата|date)\s*[:_]/i;
  var MATCH_RE = /(match|соотнес|сопостав|соответстви|подберите (заголов|к каждому))/i;
  var GAPCUE_RE = /(fill in|the gaps|gap|пропуск|вставьте|заполните|complete the (sentences|text))/i;
  var MULTI_RE = /(несколько ответов|several answers|all that apply|choose two|выберите (два|три|все))/i;

  /* Разметка популярных форматов банков вопросов: <question>/<variant>, AST (S:/+:/-:/L1:/R1:), SQ/EQ, [TAG] */
  function strip(b, n) { b.text = b.text.slice(n).replace(/^\s+/, ''); b.chars = b.chars.slice(b.chars.length - b.text.length); }
  var INLINE_ANS = /\s(答案|ANS|Answer|Ответ|Jawaban)\s*[:：]\s*([A-Ha-h](?:\s*[,、]\s*[A-Ha-h])*|对|错|true|false|верно|неверно)(?=\s|$)/;
  function splitInlineAnswers(blocks) {
    var out = [];
    blocks.forEach(function (b) {
      if (b.kind !== 'p') { out.push(b); return; }
      var cur = b, m, guard = 0;
      while (cur.text && (m = INLINE_ANS.exec(cur.text)) && guard++ < 20) {
        var a = m.index + 1, e = m.index + m[0].length;
        var mkp = function (from, to, first) {
          var t = cur.text.slice(from, to), lead = t.match(/^\s*/)[0].length;
          return Object.assign({}, cur, { text: t.trim(), chars: cur.chars.slice(from + lead, from + lead + t.trim().length), images: first ? cur.images : [], num: first ? cur.num : null, heading: first ? cur.heading : null });
        };
        out.push(mkp(0, m.index, true)); out.push(mkp(a, e, false));
        cur = mkp(e, cur.text.length, false);
      }
      if (cur.text || cur === b) out.push(cur);
    });
    return out;
  }
  function annotate(blocks) {
    blocks.forEach(function (b) {
      if (b.kind !== 'p') return;
      var t = b.text, m;
      if ((m = /^\s*<question\d*>\s*/i.exec(t))) { strip(b, m[0].length); b.forceQ = true; }
      else if ((m = /^\s*<variantright>\s*/i.exec(t))) { strip(b, m[0].length); b.forceOpt = 'right'; }
      else if ((m = /^\s*<variant>\s*/i.exec(t))) { strip(b, m[0].length); b.forceOpt = true; }
      else if ((m = /^\s*S\s*:\s*/.exec(t))) { strip(b, m[0].length); b.forceQ = true; }
      else if ((m = /^\s*\+\s*:\s*/.exec(t))) { strip(b, m[0].length); b.forceOpt = 'right'; }
      else if ((m = /^\s*-\s*:\s*/.exec(t))) { strip(b, m[0].length); b.forceOpt = true; }
      else if ((m = /^\s*L(\d{1,2})\s*:\s*/.exec(t))) { strip(b, m[0].length); b.forceLeft = true; }
      else if ((m = /^\s*R(\d{1,2})\s*:\s*/.exec(t))) { strip(b, m[0].length); b.forceRight = true; }
      else if (/^\s*(\{[a-z_]+\})?\s*(V\d|I)\s*:/.test(t) || /^\s*(SQ|EQ)\s*$/.test(t) || /^\s*\[[A-Z][A-Z_]*(\s[^\]]*)?\]\s*$/.test(t) || META_RE.test(t)) b.skip = true;
    });
  }

  /* Подпункты списков (уровень > 0 или больший отступ, чем у вопроса) — это варианты, а не вопросы */
  function markSubItems(blocks) {
    var lastQ = null;
    blocks.forEach(function (b) {
      if (b.kind !== 'p') { lastQ = null; return; }
      if (!b.text.trim()) return;
      if (b.num) {
        if (lastQ && (b.num.level > lastQ.lvl || b.indent > lastQ.indent + 150 || (b.num.fmt === 'bullet' && lastQ.decimal))) { b.sub = true; return; }
        if (b.num.level > 0 && b.num.fmt !== 'bullet' && !/Letter|russian/.test(b.num.fmt)) { b.sub = true; return; }
      }
      var q = qnum(b);
      if (q) lastQ = { indent: b.indent || 0, lvl: b.num ? b.num.level : 0, decimal: true };
      else if (!b.num && !optionsOf(b)) lastQ = lastQ && b.text.length < 220 ? lastQ : null;
    });
  }

  var SKILL_CUE = /^(прочитайте|прочтите|read the|прослушайте|послушайте|вы услышите|listen\b|напишите|write\b|расскажите|speak\b|talk\b)/i;

  /* ============ 3. Сегментация на разделы ============ */
  function segmentByRestart(blocks) {
    var segs = [], cur = [], last = 0, seenQ = false;
    blocks.forEach(function (b, i) {
      var q = qnum(b);
      if (!q && !b.sub && b.kind === 'p' && b.text.length >= 20 && b.text.length < 300 && SKILL_CUE.test(b.text) &&
          cur.some(function (x) { return qnum(x) || x.kind === 'table' || (x.kind === 'p' && x.text.length > 200); })) {
        segs.push(cur); cur = []; last = 0; seenQ = false;
      }
      if (q && !optionsOf(b)) {
        if (q.n === 1 && last >= 2 && seenQ) {
          // начало нового сегмента — подтягиваем предшествующие ненумерованные абзацы (инструкция/текст)
          var carry = [];
          while (cur.length && !qnum(cur[cur.length - 1]) && !optionsOf(cur[cur.length - 1]) && !tfLabelLine(cur[cur.length - 1]) && !ANS_RE.test(cur[cur.length - 1].text || '')) carry.unshift(cur.pop());
          segs.push(cur); cur = carry;
        }
        last = q.n; seenQ = true;
      }
      cur.push(b);
    });
    if (cur.length) segs.push(cur);
    return segs;
  }

  function allText(blocks) {
    return blocks.map(function (b) {
      return b.kind === 'p' ? b.text : b.rows.map(function (r) { return r.map(cellText).join(' | '); }).join('\n');
    }).join('\n');
  }
  function count(re, t) { var m = t.match(new RegExp(re.source, 'gi')); return m ? m.length : 0; }

  function classify(blocks, prevType) {
    var t = allText(blocks), s = {};
    var opts = blocks.filter(function (b) { return optionsOf(b); }).length;
    var lastQ = -1; blocks.forEach(function (b, i) { if (qnum(b) || optionsOf(b)) lastQ = i; });
    var longP = blocks.filter(function (b, i) { return i < lastQ && b.kind === 'p' && b.text.length > 350 && !qnum(b); }).length;
    var wl = count(/\d{2,4}\s*[-–—]?\s*\d{0,4}\s*(слов|words)/, t);
    s.listening = 3 * count(/listen|прослушай|прослушайте|услышите|аудиозапис|аудирован|recording|audio|tapescript|запись дважды|слушани/, t);
    s.reading = 3 * count(/\bread\b|прочитай|прочтите|прочитайте|passage|чтени|reading/, t) + 2 * longP;
    s.writing = 5 * wl + 2 * count(/\bwrite\b|напишите|letter|e-?mail|essay|эссе|сочинени|письмо|writing/, t);
    s.speaking = 3 * count(/speak|talk about|расскаж|монолог|диалог|выскаж|describe the (photo|picture)|опишите (фото|картин)|говорени|устн|speaking/, t) + 2 * count(/\d+\s*(минут|minutes)/, t);
    s.test = 3 * opts + 2 * count(GAP_RE, t) + count(/choose|выберите|correct form|grammar|vocabulary|грамматик|лексик|подходящ/, t);
    if (wl && s.speaking > s.writing) s.writing -= 2;
    var order = M.SECTION_TYPES, pi = prevType ? order.indexOf(prevType) : -1;
    var best = 'test', bv = -1;
    order.forEach(function (k, i) {
      var v = s[k] + (i > pi ? 0.5 : 0) + (k === prevType ? 0.3 : 0);
      if (v > bv) { bv = v; best = k; }
    });
    if (Math.max(s.listening, s.reading, s.writing, s.speaking, s.test) === 0) best = prevType || 'test';
    return { type: best, scores: s };
  }

  /* ============ 4. Разбор заданий раздела ============ */
  function toGapQuestion(b, q) {
    // подчёркнутые+жирные/цветные фрагменты (ответы) и ____ -> {{...}}
    var start = q ? q.offset : 0;
    var t = b.text, out = '', i = start, gaps = 0;
    while (i < t.length) {
      var e = b.chars[i] || 0;
      var isAns = (e & EM_U) && ((e & EM_B) || (e & EM_COL)) && t[i] !== '_';
      if (isAns) {
        var j = i; while (j < t.length && ((b.chars[j] || 0) & EM_U) && t[j] !== '_' && (((b.chars[j] || 0) & EM_B) || ((b.chars[j] || 0) & EM_COL))) j++;
        var ans = t.slice(i, j).trim();
        var lead = t.slice(i, j).match(/^\s*/)[0], trail = t.slice(i, j).match(/\s*$/)[0];
        out += lead + '{{' + ans.split(/\s*\/\s*/).join('|') + '}}' + trail; gaps++; i = j; continue;
      }
      out += t[i]; i++;
    }
    out = out.replace(GAP_RE, function () { gaps++; return '{{}}'; });
    return { text: out.trim(), gaps: gaps };
  }

  function SectionParser(type, report) {
    this.type = type; this.report = report;
    this.essay = type === 'writing' || type === 'speaking';
    this.instructions = []; this.media = []; this.tasks = []; this.audioHints = [];
    this.group = null; this.cur = null; this.started = false; this.transcript = null;
    this.newGroup(null);
  }
  SectionParser.prototype.newGroup = function (instr) {
    this.flush();
    this.group = { instr: instr || '', mode: null, tfVariant: null, items: [], loose: [] };
    if (instr) {
      if (MATCH_RE.test(instr)) this.group.mode = 'match';
      else if (tfVariantIn(instr)) { this.group.mode = 'tf'; this.group.tfVariant = tfVariantIn(instr); }
      else if (GAPCUE_RE.test(instr)) this.group.mode = 'gap';
      if (MULTI_RE.test(instr)) this.group.multi = true;
    }
  };
  SectionParser.prototype.closeCur = function () {
    if (this.cur) { this.group.items.push(this.cur); this.cur = null; }
    if (this.transcript) { this.group.items.push(this.transcript); this.transcript = null; }
  };
  SectionParser.prototype.info = function (kind, text, title, media) {
    this.closeCur();
    var t = M.newTask('info'); t.kind = kind; t.text = text; t.title = title || ''; t.media = media || [];
    this.group.items.push({ info: t });
  };
  SectionParser.prototype.flush = function () {
    if (!this.group) return;
    this.closeCur();
    var g = this.group, self = this;
    var tasks = this.essay ? this.buildEssays(g) : this.buildGroup(g);
    if (g.instr) {
      var it = M.newTask('info'); it.kind = 'instruction'; it.text = g.instr;
      tasks.unshift(it);
    }
    tasks.forEach(function (t) { self.tasks.push(t); });
    this.group = null;
  };

  SectionParser.prototype.buildEssays = function (g) {
    var out = [];
    g.items.forEach(function (it) {
      if (it.info) { out.push(it.info); return; }
      var lines = it.lines.filter(function (l) { return l.trim(); });
      var t = M.newTask('essay'), notes = [];
      var keep = [];
      lines.forEach(function (l) {
        var mm = /^\s*(комментарий для проверяющего|критерии|criteria|sample answer|образец|teacher'?s? notes?)\s*:\s*(.*)$/i.exec(l);
        if (mm) { notes.push(mm[2]); return; }
        if (/^\s*(объём|объем|word count|length)\s*:/i.test(l) || /^\s*время\s*:\s*[\d.,]+\s*мин\.?\s*$/i.test(l)) {
          var wl0 = wordLimits(l); if (wl0) { t.minWords = wl0[0]; t.maxWords = wl0[1]; }
          var tm0 = timeLimit(l); if (tm0) t.timeMinutes = tm0;
          return;
        }
        keep.push(l);
      });
      var full = keep.join('\n');
      if (!t.minWords && !t.maxWords) { var wl = wordLimits(full); if (wl) { t.minWords = wl[0]; t.maxWords = wl[1]; } }
      if (!t.timeMinutes) t.timeMinutes = timeLimit(full);
      t.question = full.replace(/^\s+|\s+$/g, '');
      t.notes = notes.join(' ');
      t.media = it.media;
      t._num = it.n;
      if (t.question || t.media.length) out.push(t);
    });
    return out;
  };

  SectionParser.prototype.buildGroup = function (g) {
    var out = [], self = this;
    var qs = g.items.filter(function (it) { return it.q; });

    // --- сопоставление ---
    var lastQ = qs[qs.length - 1];
    var matchByLists = qs.length >= 3 && lastQ.options.length >= qs.length - 1 &&
      qs.slice(0, -1).every(function (q) { return !q.options.length && !q.gap && !q.tf && q.text.length < 160; });
    var looseLetters = g.loose.length >= 2;
    if ((g.mode === 'match' && (qs.length || looseLetters)) || (matchByLists && !g.mode)) {
      var right = looseLetters ? g.loose : (lastQ && lastQ.options.length ? lastQ.options : []);
      var left = qs.slice();
      if (right.length >= 2 && (left.length || /(\d)\s*[-–—]\s*(\d)/.test(g.instr))) {
        var m = M.newTask('match');
        m.question = g.instr ? '' : '';
        if (!left.length) {
          var r = /(\d)\s*[-–—]\s*(\d)/.exec(g.instr);
          var who = /speaker|говорящ|высказыван/i.test(g.instr) ? (/[а-я]/i.test(g.instr) ? 'Говорящий ' : 'Speaker ') : '';
          for (var k = +r[1]; k <= +r[2]; k++) left.push({ n: k, text: (who || '') + k, answerText: '' });
        }
        // если последний вопрос содержал и текст, и варианты — его текст тоже элемент слева
        m.left = left.map(function (q) { return q.text; });
        m.right = right.map(function (o) { return o.text; });
        m.answer = m.left.map(function () { return null; });
        m._leftNums = left.map(function (q) { return q.n; });
        m._num = left.length ? left[0].n : null;
        m.points = m.left.length;
        left.forEach(function (q, i) { if (q.answerText) applyMatchAnswer(m, i, q.answerText); });
        m.media = [].concat.apply([], qs.map(function (q) { return q.media; }));
        g.items.filter(function (it) { return it.info; }).forEach(function (it) { out.push(it.info); });
        out.push(m);
        return out;
      }
    }

    g.items.forEach(function (it) {
      if (it.info) { out.push(it.info); return; }
      if (it.matchTable) { out.push(it.matchTable); return; }
      if (it.tfTask) { out.push(it.tfTask); return; }
      var t = self.buildQuestion(it, g);
      if (t) out.push(t);
    });
    // свободные буквенные варианты без вопроса — просто текст
    if (g.loose.length && !qs.length) {
      var info = M.newTask('info'); info.kind = 'text';
      info.text = g.loose.map(function (o) { return M.LETTERS[o.idx] + ') ' + o.text; }).join('\n');
      out.push(info);
    }
    return out;
  };

  function applyMatchAnswer(m, i, ans) {
    var li = letterIndex(String(ans).trim().replace(/[.)]/g, '')[0]);
    if (li >= 0 && li < m.right.length) m.answer[i] = li;
  }

  function pickMarked(options) {
    var explicit = options.filter(function (o) { return o.marked; });
    if (explicit.length) return explicit.map(function (o) { return o.idx; });
    var strong = options.filter(function (o) { return o.strong; });
    if (strong.length && strong.length < options.length) return strong.map(function (o) { return o.idx; });
    var bold = options.filter(function (o) { return o.bold; });
    if (bold.length && bold.length < options.length) return bold.map(function (o) { return o.idx; });
    var lett = options.filter(function (o) { return o.letterEmph; });
    if (lett.length && lett.length < options.length) return lett.map(function (o) { return o.idx; });
    return [];
  }

  SectionParser.prototype.buildQuestion = function (q, g) {
    var t;
    var text = q.text.replace(/\s+$/, '');
    var multiCue = MULTI_RE.test(text) || g.multi;
    // сопоставление из разметки L1:/R1: (Ln ↔ Rn)
    if (q.left && q.right && q.left.length && q.right.length) {
      t = M.newTask('match'); t.question = text; t.left = q.left.slice(); t.right = q.right.slice();
      t.answer = t.left.map(function (_, i) { return i < t.right.length ? i : null; }); t.points = t.left.length;
      t.media = q.media; t._num = q.n; return t;
    }
    // варианты вида True/False -> задание верно/неверно
    if (q.options.length >= 2 && q.options.length <= 3 && q.options.every(function (o) { return TFWORD_RE.test(o.text); })) {
      t = M.newTask('tf');
      var lab = q.options.map(function (o) { return o.text.toLowerCase(); }).join('/');
      t.variant = /верно|неверно/.test(lab) ? (q.options.length === 3 ? 'rung' : 'ru') : /yes|no/.test(lab) && !/true/.test(lab) ? (q.options.length === 3 ? 'ynng' : 'yn') : (q.options.length === 3 ? 'tfng' : 'tf');
      t.question = text;
      var mk2 = pickMarked(q.options.map(function (o, i) { return Object.assign({}, o, { idx: i }); }));
      t.answer = mk2.length === 1 ? tfFromAnswer(q.options[mk2[0]].text) : null;
      if (t.answer == null && q.answerText) { var li0 = letterIndex(q.answerText.trim()[0]); t.answer = /^[A-Ca-c]$/.test(q.answerText.trim()) ? li0 : tfFromAnswer(q.answerText); }
      t.media = q.media; t._num = q.n; return t;
    }
    // только правильные варианты без неправильных (AST «+:») -> краткий ответ
    if (q.options.length >= 1 && q.options.every(function (o) { return o.marked; }) && q.options.some(function (o) { return o.idx == null || true; }) && q.forcedOpts) {
      t = M.newTask('short'); t.question = text; t.answer = q.options.map(function (o) { return o.text.replace(/[;.]$/, ''); }).join('|');
      t.media = q.media; t._num = q.n; return t;
    }
    if (q.options.length >= 2) {
      // упорядочить и убрать дубли
      var opts = []; q.options.forEach(function (o) { if (!opts.some(function (x) { return x.idx === o.idx; })) opts.push(o); });
      opts.sort(function (a, b) { return a.idx - b.idx; });
      var marked = pickMarked(opts).map(function (idx) { return opts.findIndex(function (o) { return o.idx === idx; }); });
      t = M.newTask(multiCue || marked.length > 1 ? 'multi' : 'mc');
      t.question = text.replace(/\s*\((несколько ответов|several answers)\)\s*/i, ' ').trim();
      t.options = opts.map(function (o) { return o.text; });
      if (t.type === 'multi') t.answers = marked; else t.answer = marked.length ? marked[0] : null;
      if (q.answerText) applyChoiceAnswer(t, q.answerText);
    } else if (q.tf || g.mode === 'tf') {
      t = M.newTask('tf');
      t.variant = (q.tf && q.tf.variant) || g.tfVariant || 'tfng';
      var inl = tfVariantIn(text);
      t.question = inl ? text.replace(/\s*[-–—(]?\s*(true\s*\/\s*false(\s*\/\s*not given)?|T\s*\/?\s*F(\s*\/?\s*NG)?|yes\s*\/\s*no(\s*\/\s*not given)?|верно\s*\/\s*неверно)\s*\)?\s*$/i, '').trim() : text;
      t.answer = q.tf && q.tf.answer != null ? q.tf.answer : null;
      if (t.answer == null && q.answerText) t.answer = tfFromAnswer(q.answerText, t.variant);
      if (t.answer != null && t.answer >= M.TF_VARIANTS[t.variant].length) t.variant = t.variant === 'tf' ? 'tfng' : t.variant === 'yn' ? 'ynng' : 'rung';
    } else {
      var so = slashOptions(text);
      if (so) {
        t = M.newTask('mc'); t.question = so.stem; t.options = so.options; t.answer = null;
        if (q.answerText) applyChoiceAnswer(t, q.answerText);
      } else if (/\{\{[^{}]+\}\}/.test(text)) {
        // текст уже с разметкой {{ответ}} (в т.ч. {{a:ответ}})
        t = M.newTask('gap'); t.question = text.replace(/\{\{\s*[a-z0-9]{1,2}\s*:\s*/gi, '{{');
      } else if (q.gap && q.gap.gaps > 0) {
        t = M.newTask('gap'); t.question = q.gap.text;
        if (q.answerText) fillGapAnswers(t, q.answerText);
      } else if (q.answerText && tfFromAnswer(q.answerText) != null && !/^[A-Ha-h1-9]$/.test(q.answerText.trim())) {
        t = M.newTask('tf'); t.variant = /[а-я]/i.test(q.answerText) ? 'ru' : 'tf'; t.question = text;
        t.answer = tfFromAnswer(q.answerText);
      } else {
        t = M.newTask('short'); t.question = text;
        t.answer = q.answerText && !/^_+$/.test(q.answerText) ? q.answerText.replace(/\s*\/\s*/g, '|') : '';
      }
    }
    t.media = q.media; t._num = q.n;
    return t;
  };

  function applyChoiceAnswer(t, ans) {
    var a = String(ans).trim();
    var toks = a.split(/[\s,;и&、，]+/).map(function (x) { return x.replace(/[.)]/g, ''); });
    if (toks.length === 1 && /^[A-Ha-h]{2,8}$/.test(toks[0])) toks = toks[0].split('');
    var letters = toks.filter(function (x) { return x.length === 1 && letterIndex(x) >= 0; });
    var idxs = letters.map(letterIndex).filter(function (i) { return i < t.options.length; });
    if (!idxs.length) {
      var byText = t.options.findIndex(function (o) { return M.normAnswer(o) === M.normAnswer(a); });
      if (byText >= 0) idxs = [byText];
    }
    if (!idxs.length) return;
    if (t.type === 'multi') t.answers = idxs;
    else if (idxs.length > 1) { t.type = 'multi'; t.answers = idxs; delete t.answer; }
    else t.answer = idxs[0];
  }
  function fillGapAnswers(t, ans) {
    var parts = String(ans).split(/\s*[;]\s*|\s*,\s+/).filter(Boolean);
    if (M.gapCount(t.question) === 1) parts = [String(ans).trim()];
    var i = 0;
    t.question = t.question.replace(/\{\{([^{}]*)\}\}/g, function (all, inner) {
      var p = parts[i++];
      if (inner || !p) return all;
      return '{{' + p.split(/\s*\/\s*/).join('|') + '}}';
    });
  }

  SectionParser.prototype.addMedia = function (rids, ctx) {
    var list = rids.map(function (r) { return ctx.images[r]; }).filter(Boolean).map(function (m) { return { id: M.uid('m'), kind: 'image', name: m.name, src: m.src }; });
    if (!list.length) return;
    if (this.cur) this.cur.media = this.cur.media.concat(list);
    else if (this.transcript) this.media = this.media.concat(list);
    else if (!this.started) this.media = this.media.concat(list);
    else {
      var it = M.newTask('info'); it.kind = 'text'; it.media = list;
      this.closeCur(); this.group.items.push({ info: it });
    }
  };

  SectionParser.prototype.feed = function (b, ctx, next) {
    var self = this;
    if (b.kind === 'table') return this.feedTable(b, ctx);
    var text = b.text;
    /* An image anchored in a question paragraph belongs to the new question.
       Attaching it before closeCur() used to put it on the previous task. */
    var startsQuestion = !!qnum(b) || !!(!qnum(b) && next && next.kind === 'p' &&
      text.length < 500 && !groupHead(b) && (optionsOf(next) || next.forceOpt));
    if (!text.trim() && b.images.length && next && next.kind === 'p' && qnum(next)) {
      this.pendingImageRids = (this.pendingImageRids || []).concat(b.images);
      return;
    }
    if (b.images.length && !startsQuestion) this.addMedia(b.images, ctx);
    if (!text.trim() || b.skip) return;
    // сводный ключ внутри раздела: «答案汇总：4.A 5.B», «Answers: 1 B 2 C»
    var km = KEYLINE_RE.exec(text);
    if (km && parsePairs(km[2]).length) { this.inlineKey = (this.inlineKey || []).concat(parsePairs(km[2])); return; }
    // элементы сопоставления L1:/R1:
    if ((b.forceLeft || b.forceRight) && this.cur && this.cur.q) {
      (b.forceLeft ? (this.cur.left = this.cur.left || []) : (this.cur.right = this.cur.right || [])).push(text);
      return;
    }
    if (SKIP_RE.test(text)) return;
    if (/^ВАРИАНТ С ОТВЕТАМИ/i.test(text)) return;
    if (AUDIO_RE.test(text) && text.length < 160 && !qnum(b)) {
      var nm = /🎧\s*аудиозапись:\s*(.+)$/i.exec(text);
      this.audioHints.push(nm ? nm[1].trim() : text);
      if (nm || (text.length < 80 && /^(аудиозапись|аудиофайл|audio|track|трек|запись)\b|\.(mp3|wav|ogg|m4a|aac)\s*$/i.test(text) && !/^(прослушайте|listen)/i.test(text))) return;
    }
    if (TRANSCRIPT_RE.test(text) && text.length < 80) {
      this.closeCur();
      var tr = M.newTask('info'); tr.kind = 'transcript'; tr.title = text.replace(/[:.]\s*$/, ''); tr.text = '';
      this.transcript = { info: tr, lines: [] };
      this.started = true;
      return;
    }

    var am = ANS_RE.exec(text);
    if (am && (this.cur || this.lastItem())) {
      var target = this.cur || this.lastItem();
      var val = am[2].trim();
      if (/^_*$/.test(val)) { target.shortHint = true; return; }
      if (target.q) { target.answerText = val; target.closed = true; }
      return;
    }

    // ---------- письмо / говорение ----------
    if (this.essay) {
      var q = qnum(b), gh = groupHead(b);
      var isNew = (gh && (/^(задание|task|part|часть|exercise|activity)/i.test(gh.label) || /^[IVX]+$/.test(gh.label))) ||
        (q && (q.style === '.' || !this.cur) && (!b.num || b.num.level === 0) && !(this.cur && q.n !== this.essayCount() + 1 && q.n !== 1));
      if (isNew) {
        this.closeCur(); this.started = true;
        var first = gh ? (gh.text || '') : q.text;
        this.cur = { q: true, n: q ? q.n : this.essayCount() + 1, lines: [first], media: [] };
        if (this.pendingImageRids || b.images.length) {
          this.addMedia((this.pendingImageRids || []).concat(b.images), ctx);
          this.pendingImageRids = null;
        }
        return;
      }
      if (this.cur) {
        var o = optionsOf(b);
        this.cur.lines.push((b.num && b.num.fmt !== 'bullet' ? b.num.label + ' ' : b.num ? '• ' : '') + text);
        return;
      }
      // до первого задания
      if (b.allItalic || text.length < 300) this.instructions.push(text);
      else this.info('text', text);
      return;
    }

    // ---------- тест / чтение / аудирование ----------
    if (this.transcript) {
      if (!qnum(b) && !groupHead(b) && !optionsOf(b)) { this.transcript.lines.push(text); return; }
      this.transcript.info.text = this.transcript.lines.join('\n');
      this.group.items.push({ info: this.transcript.info }); this.transcript = null;
    }

    var gh2 = groupHead(b);
    if (gh2 && !qnum(b)) {
      this.started = true;
      this.newGroup(text);
      return;
    }

    var tfl = tfLabelLine(b);
    if (tfl && this.cur && this.cur.q && !this.cur.options.length) { this.cur.tf = tfl; return; }
    if (tfl && !this.cur && !qnum(b)) { // строка «True / False / Not Given» как инструкция группы
      if (this.group.items.length === 0) { this.group.mode = 'tf'; this.group.tfVariant = tfl.variant; return; }
    }

    var opts = optionsOf(b);
    if (opts && !(qnum(b) && !b.num)) {
      if (this.cur && this.cur.q) {
        if (b.forceOpt) this.cur.forcedOpts = true;
        var base = this.cur.options.length;
        opts.forEach(function (o, k) { if (o.idx == null) o.idx = base + k; });
        this.cur.options = this.cur.options.concat(opts); return;
      }
      opts.forEach(function (o, k) { if (o.idx == null) o.idx = k; });
      this.group.loose = this.group.loose.concat(opts);
      this.started = true;
      return;
    }
    if (this.cur && this.cur.q && !this.cur.options.length && this.cur.justStarted) {
      var bare = bareLetterOptions(b);
      if (bare) { this.cur.options = bare; return; }
    }

    var qq = qnum(b);
    // вопрос без номера: за ним сразу идут варианты ответа
    if (!qq && next && next.kind === 'p' && text.length < 500 && !groupHead(b) && !tfLabelLine(b) &&
        (optionsOf(next) || next.forceOpt) && !(this.cur && this.cur.q && !this.cur.options.length && this.cur.justStarted)) {
      qq = { n: null, text: text, offset: 0, style: '.' };
    }
    if (qq) {
      this.closeCur(); this.started = true;
      var qtext = qq.text;
      var cur = { q: true, n: qq.n, text: qtext, options: [], media: [], answerText: '', justStarted: true };
      // варианты в той же строке после вопроса
      var inl = inlineOptions(b, qq.offset + 1);
      if (inl && inl[0].start > qq.offset + 2) {
        cur.text = b.text.slice(qq.offset, inl[0].start).trim();
        cur.options = inl;
      }
      // True/False в конце строки
      var inTf = tfVariantIn(cur.text);
      if (inTf && !cur.options.length && /(true|false|not given|T\s*\/?\s*F|yes\s*\/\s*no|верно)\s*\)?\s*$/i.test(cur.text)) {
        cur.tf = { variant: inTf, answer: null };
      }
      if (!cur.options.length) {
        var gq = toGapQuestion(b, qq);
        if (gq.gaps > 0) cur.gap = gq;
      }
      this.cur = cur;
      if (this.pendingImageRids || b.images.length) {
        this.addMedia((this.pendingImageRids || []).concat(b.images), ctx);
        this.pendingImageRids = null;
      }
      return;
    }

    // ненумерованный абзац
    if (this.cur && this.cur.q && (this.cur.closed || b.heading != null)) this.closeCur();
    if (b.heading != null && !this.essay) { this.started = true; this.newGroup(text); return; }
    if (this.cur && this.cur.q) {
      this.cur.justStarted = false;
      if (!this.cur.options.length && text.length < 220 && !b.allItalic) {
        this.cur.text += '\n' + text;
        var g2 = toGapQuestion(b, null);
        if (this.cur.gap) { this.cur.gap = { text: this.cur.gap.text + '\n' + g2.text, gaps: this.cur.gap.gaps + g2.gaps }; }
        else if (g2.gaps) { this.cur.gap = { text: ((this.cur.gap && this.cur.gap.text) || this.cur.text.split('\n')[0]) + '\n' + g2.text, gaps: ((this.cur.gap && this.cur.gap.gaps) || 0) + g2.gaps }; }
        return;
      }
      this.closeCur();
    }
    var instrLike = (b.allItalic || (b.allBold && text.length < 200)) && text.length < 400;
    if (!this.started && b.allBold && !b.allItalic && text.length < 80 && !/[:.]$/.test(text) && !MATCH_RE.test(text) && !GAPCUE_RE.test(text)) {
      this.started = true; this.info('text', '', text); return;
    }
    if (!this.started && (instrLike || text.length < 250) && !(this.type === 'reading' && text.length > 160)) {
      this.instructions.push(text);
      if (MATCH_RE.test(text)) this.group.mode = 'match';
      else if (tfVariantIn(text)) { this.group.mode = 'tf'; this.group.tfVariant = tfVariantIn(text); }
      if (MULTI_RE.test(text)) this.group.multi = true;
      return;
    }
    if (instrLike && b.allBold && b.allItalic) { this.started = true; this.newGroup(text); return; }
    if (instrLike && (MATCH_RE.test(text) || tfVariantIn(text) || GAPCUE_RE.test(text) || /^(read|listen|прочитайте|прослушайте|выберите|choose|answer)/i.test(text))) {
      this.started = true; this.newGroup(text); return;
    }
    // заголовок текста (короткая жирная строка) + текст
    this.started = true;
    var lastIt = this.group.items[this.group.items.length - 1];
    if (b.allBold && text.length < 80) { this.info('text', '', text); return; }
    if (lastIt && lastIt.info && lastIt.info.kind === 'text' && !lastIt.info.media.length) {
      lastIt.info.text += (lastIt.info.text ? '\n' : '') + text; return;
    }
    this.info('text', text);
  };

  SectionParser.prototype.lastItem = function () {
    var it = this.group.items[this.group.items.length - 1];
    if (it && it.q) return it;
    // последняя таблица сопоставления
    if (it && it.matchTable) return { q: true, matchRef: it.matchTable, set answerText(v) { var m = it.matchTable; parsePairs(v).forEach(function (p) { var i = p.n - 1; if (i >= 0 && i < m.left.length) applyMatchAnswer(m, i, p.a); }); } };
    return null;
  };
  SectionParser.prototype.essayCount = function () {
    return this.group.items.filter(function (i) { return i.q; }).length + (this.cur ? 1 : 0) +
      this.tasks.filter(function (t) { return t.type === 'essay'; }).length;
  };

  SectionParser.prototype.feedTable = function (b, ctx) {
    var rows = b.rows.map(function (r) { return r.map(cellText); });
    if (b.images.length) this.addMedia(b.images, ctx);
    if (!rows.length) return;
    var nonEmpty = rows.filter(function (r) { return r.some(function (c) { return c; }); });
    // сетка для ответов: 1 | 2 | 3 ... и пустая строка
    if (rows.length <= 3 && rows[0].length >= 2 && rows[0].every(function (c) { return /^\d{1,2}$/.test(c) || /^(№|номер|вопрос|question|ответ|answer|буква|letter)$/i.test(c); }) &&
      rows.slice(1).every(function (r) { return r.every(function (c) { return !c || /^(ответ|answer|буква|letter)$/i.test(c); }); })) return;

    // таблица баллов («/ 10», «Total», «Итого»)
    var cellsAll = [].concat.apply([], rows);
    if (cellsAll.filter(function (c) { return /^\/?\s*_*\s*\/\s*\d+$|^_+\s*\/\s*\d+$/.test(c.trim()); }).length >= 2 || /\b(total marks?|total)\b|итого|всего баллов/i.test(cellsAll.join(' ')) && cellsAll.join(' ').length < 300) return;
    // True/False таблица
    var head = rows[0].join(' ');
    var tfv = tfVariantIn(head) || (/(^|\|)\s*(T|F|NG)\s*($|\|)/.test(rows[0].join('|')) ? 'tfng' : null);
    if (tfv && rows.length > 1 && !this.essay) {
      this.closeCur(); this.started = true;
      var labels = M.TF_VARIANTS[tfv];
      var colMap = rows[0].map(function (c) { return tfFromAnswer(c, tfv); });
      var self = this;
      rows.slice(1).forEach(function (r) {
        var stmtIdx = 0, best = -1;
        r.forEach(function (c, i) { if (colMap[i] == null && c.length > best) { best = c.length; stmtIdx = i; } });
        var stmt = r[stmtIdx]; if (!stmt) return;
        var t = M.newTask('tf'); t.variant = tfv;
        var mnum = /^(\d{1,3})\s*[.)]?\s*/.exec(stmt);
        if (mnum && r.length) { t._num = +mnum[1]; stmt = stmt.slice(mnum[0].length); }
        else { var nc = r.find(function (c) { return /^\d{1,3}[.)]?$/.test(c); }); if (nc) t._num = parseInt(nc, 10); }
        t.question = stmt;
        r.forEach(function (c, i) { if (colMap[i] != null && /^(x|х|✓|✔|\+|v|●)$/i.test(c.trim())) t.answer = colMap[i]; });
        if (t.answer != null && t.answer >= labels.length) t.variant = 'tfng';
        self.group.items.push({ tfTask: t });
      });
      return;
    }

    // таблица сопоставления: колонки с номерами и буквами
    if (rows[0].length >= 2 && !this.essay) {
      var left = [], right = [];
      var numRe = /^(\d{1,2})\s*[.)]?\s+(\S[\s\S]*)$/, letRe = /^([A-Ha-h]|[А-Еа-е])\s*[.)]?\s+(\S[\s\S]*)$/;
      rows.forEach(function (r) {
        r.forEach(function (c) {
          var m1 = numRe.exec(c), m2 = letRe.exec(c);
          if (m1) left.push({ n: +m1[1], text: m1[2].trim() });
          else if (m2) right.push({ idx: letterIndex(m2[1]), text: m2[2].trim() });
        });
      });
      if (left.length >= 2 && right.length >= 2) {
        var m = M.newTask('match');
        var instr = '';
        if (this.cur && this.cur.q && !this.cur.options.length) { instr = this.cur.text; m._num = this.cur.n; this.cur.consumed = true; m.media = this.cur.media; this.cur = null; }
        this.closeCur(); this.started = true;
        m.question = instr;
        left.sort(function (a, b) { return a.n - b.n; }); right.sort(function (a, b) { return a.idx - b.idx; });
        m.left = left.map(function (x) { return x.text; }); m.right = right.map(function (x) { return x.text; });
        m.answer = m.left.map(function () { return null; }); m.points = m.left.length;
        if (m._num == null) { m._leftNums = left.map(function (x) { return x.n; }); m._num = left[0].n; }
        this.group.items.push({ matchTable: m });
        return;
      }
      // правая колонка — только буквы (список A–F в таблице) при режиме сопоставления
      if (right.length >= 2 && this.group.mode === 'match') { this.group.loose = this.group.loose.concat(right); return; }
    }
    var hasQ = b.rows.some(function (r) { return r.some(function (c) { return c.some(function (p) { return qnum(p) || optionsOf(p) || ANS_RE.test(p.text); }); }); });
    if (hasQ && !this.essay) {
      var selfT = this;
      b.rows.forEach(function (r) {
        var labels = r.map(function (c) { return cellText(c); });
        if (r.length === 2 && /^(ответ|answer|ans|key|ключ|答案|正确答案|jawaban|kunci)$/i.test(labels[0]) && labels[1]) {
          var vp = { kind: 'p', text: labels[0] + '：' + labels[1], chars: [], images: [], num: null, indent: 0 };
          selfT.feed(vp, ctx); return;
        }
        var flat = [].concat.apply([], r);
        flat.forEach(function (p, k) { selfT.feed(p, ctx, flat[k + 1]); });
      });
      return;
    }
    if (rows.length === 1 && rows[0].length === 1 && this.cur && this.cur.q) {
      // рамка с текстом внутри задания (word bank)
      this.cur.text += '\n' + rows[0][0]; return;
    }
    // прочая таблица -> текст
    var txt = nonEmpty.map(function (r) { return r.filter(Boolean).join(' | '); }).join('\n');
    if (!txt.trim()) return;
    if (this.essay && this.cur) { this.cur.lines.push(txt); return; }
    if (this.cur && this.cur.q && !this.cur.options.length) { this.cur.text += '\n' + txt; return; }
    this.started = true;
    this.info('text', txt);
  };

  SectionParser.prototype.finish = function () {
    if (this.transcript) { this.transcript.info.text = this.transcript.lines.join('\n'); this.group.items.push({ info: this.transcript.info }); this.transcript = null; }
    this.flush();
    // пустые info с заголовком -> склеить с последующим текстом
    var out = [];
    this.tasks.forEach(function (t) {
      var prev = out[out.length - 1];
      if (prev && prev.type === 'info' && prev.kind === 'text' && !prev.text && prev.title && t.type === 'info' && t.kind === 'text' && !t.title) {
        prev.text = t.text; prev.media = prev.media.concat(t.media); return;
      }
      out.push(t);
    });
    this.tasks = out.filter(function (t) { return !(t.type === 'info' && !t.text && !t.title && !t.media.length); });
    if (this.essay && !this.tasks.some(function (t) { return t.type === 'essay'; }) && this.instructions.length) {
      // одно задание без номера: инструкция и есть задание
      var e = M.newTask('essay'); e.question = this.instructions.join('\n');
      var wl = wordLimits(e.question); if (wl) { e.minWords = wl[0]; e.maxWords = wl[1]; }
      e.timeMinutes = timeLimit(e.question);
      e.media = this.media; this.media = []; this.instructions = [];
      this.tasks.push(e);
    }
    var lim = M.SECTION_LIMITS[this.type];
    if (lim) {
      var es = this.tasks.filter(function (t) { return t.type === 'essay'; });
      if (es.length > lim) {
        var keep = es.slice(0, lim), extra = es.slice(lim), last = keep[keep.length - 1];
        extra.forEach(function (e) { last.question += '\n' + e.question; last.media = last.media.concat(e.media); });
        this.tasks = this.tasks.filter(function (t) { return t.type !== 'essay' || keep.indexOf(t) >= 0; });
        this.report.warnings.push(M.SECTION_LABELS[this.type] + ': найдено ' + es.length + ' заданий, допускается ' + lim + ' — лишние объединены со вторым.');
      }
    }
  };

  /* ============ 5. Ключи ============ */
  function parsePairs(line) {
    var out = [], re = /(?:^|[\s,;|])(\d{1,3})\s*(?:[.)\-–—:=]\s*|\s+)(?=\S)/g, ms = [], m;
    while ((m = re.exec(line))) ms.push({ n: +m[1], start: m.index, end: m.index + m[0].length });
    ms.forEach(function (x, i) {
      var a = line.slice(x.end, i + 1 < ms.length ? ms[i + 1].start : line.length).replace(/^[\s,;|]+|[\s,;|]+$/g, '');
      if (a) out.push({ n: x.n, a: a });
    });
    return out;
  }

  function romanVal(r) { var v = { I: 1, V: 5, X: 10 }, n = 0; r = r.toUpperCase(); for (var i = 0; i < r.length; i++) { var c = v[r[i]], nx = v[r[i + 1]] || 0; n += c < nx ? -c : c; } return n; }
  function parseKey(blocks) {
    var groups = [], cur = { type: null, items: [] }, last = 0;
    function push() { if (cur.items.length) groups.push(cur); }
    blocks.forEach(function (b) {
      if (b.kind === 'p') {
        if (!b.text.trim()) return;
        var sh = sectionHeader(b) || (b.text.length < 60 ? (function () { var k = keywordType(b.text); return k && k.pos < 15 && !/\d\s*[.)\-–]\s*\S/.test(b.text) ? { type: k.type } : null; })() : null);
        if (sh) { push(); cur = { type: sh.type, items: [] }; last = 0; return; }
        var line = (b.num ? b.num.label + ' ' : '') + b.text;
        var pm = /^\s*(part|раздел|section|часть|задание|task)\s*(\d+|[IVX]+)\s*[:.\-–—)]\s*/i.exec(line);
        if (pm) {
          push(); var pn = /^\d+$/.test(pm[2]) ? +pm[2] : romanVal(pm[2]);
          var kt = keywordType(line.slice(pm[0].length, pm[0].length + 30));
          cur = { type: kt && kt.pos === 0 ? kt.type : null, part: pn, items: [] }; last = 0;
          line = line.slice(pm[0].length);
        }
        var pairs = parsePairs(line);
        pairs.forEach(function (p) {
          if (p.n === 1 && last >= 2 && cur.items.length) { push(); cur = { type: null, items: [] }; }
          cur.items.push(p); last = p.n;
        });
      } else {
        var rows = b.rows.map(function (r) { return r.map(cellText); });
        var horizontal = rows.length >= 2 && rows[0].filter(function (c) { return /^\d{1,3}$/.test(c); }).length >= 2;
        var add = function (n, a) {
          if (!a || /^(ответ|answer)$/i.test(a)) return;
          if (n === 1 && last >= 2 && cur.items.length) { push(); cur = { type: null, items: [] }; }
          cur.items.push({ n: n, a: a }); last = n;
        };
        if (horizontal) {
          for (var r = 0; r + 1 < rows.length; r += 2) rows[r].forEach(function (c, i) { if (/^\d{1,3}$/.test(c)) add(+c, rows[r + 1][i]); });
        } else rows.forEach(function (r) {
          if (r.length >= 2 && /^\d{1,3}[.)]?$/.test(r[0].trim())) add(parseInt(r[0], 10), r.slice(1).join(' ').trim());
          else if (r.length === 1) parsePairs(r[0]).forEach(function (p) { add(p.n, p.a); });
        });
      }
    });
    push();
    return groups;
  }

  function applyAnswerToTask(t, a, sub) {
    switch (t.type) {
      case 'mc': case 'multi':
        if ((t.type === 'mc' && t.answer == null) || (t.type === 'multi' && !t.answers.length)) applyChoiceAnswer(t, a);
        break;
      case 'tf': if (t.answer == null) { t.answer = /^[A-Ca-c]$/.test(String(a).trim()) ? letterIndex(String(a).trim()) : tfFromAnswer(a, t.variant); if (t.answer === 2 && M.TF_VARIANTS[t.variant].length < 3) t.variant = t.variant === 'tf' ? 'tfng' : t.variant === 'yn' ? 'ynng' : 'rung'; } break;
      case 'short': if (!t.answer) t.answer = a.replace(/\s*\/\s*/g, '|'); break;
      case 'gap': fillGapAnswers(t, a); break;
      case 'match':
        if (sub != null) { if (t.answer[sub] == null) applyMatchAnswer(t, sub, a); }
        else {
          var pairs = parsePairs(a);
          if (pairs.length) pairs.forEach(function (p) { var i = p.n - 1; if (i >= 0 && i < t.left.length && t.answer[i] == null) applyMatchAnswer(t, i, p.a); });
          else {
            var letters = a.replace(/[^A-Ha-hА-Еа-е]/g, '');
            if (letters.length === t.left.length) letters.split('').forEach(function (ch, i) { if (t.answer[i] == null) applyMatchAnswer(t, i, ch); });
          }
        }
        break;
    }
  }

  function applyKey(sections, keyGroups, report, docOrder) {
    if (!keyGroups.length) return;
    var gradable = M.SECTION_TYPES.filter(function (s) {
      return sections[s] && sections[s].tasks.some(function (t) { return M.TASK_TYPES[t.type].auto; });
    });
    var seq = 0;
    keyGroups.forEach(function (g) {
      var type = g.type;
      if (!type && g.part && docOrder && docOrder[g.part - 1]) type = docOrder[g.part - 1];
      if (!type || gradable.indexOf(type) < 0) { type = gradable[seq]; }
      seq = Math.max(seq, gradable.indexOf(type) + 1);
      if (!type) return;
      var tasks = sections[type].tasks;
      // карта номер -> задание
      var map = {}, k = 0;
      tasks.forEach(function (t) {
        if (t.type === 'info' || t.type === 'essay') return;
        k++;
        var n = t._num != null ? t._num : k;
        if (t.type === 'match' && t._leftNums) t._leftNums.forEach(function (ln, i) { map[ln] = { t: t, sub: i }; });
        else if (t.type === 'gap' && M.gapCount(t.question) > 1 && !map[n]) map[n] = { t: t };
        else map[n] = { t: t };
      });
      g.items.forEach(function (it) {
        var e = map[it.n];
        if (e) { applyAnswerToTask(e.t, it.a, e.sub); report.keyApplied++; }
      });
    });
  }

  /* ============ 6. Главная функция ============ */
  function bytesToB64(u8) {
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return Buffer.from(u8).toString('base64');
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  var MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };

  function parseDocx(input, opts) {
    opts = opts || {};
    var JSZip = opts.JSZip || (typeof self !== 'undefined' && self.JSZip) || require('jszip');
    var zip;
    return JSZip.loadAsync(input).then(function (z) {
      zip = z;
      var f = function (p) { var e = zip.file(p); return e ? e.async('string') : Promise.resolve(null); };
      if (!zip.file('word/document.xml')) throw new Error('Это не .docx: нет word/document.xml (старый .doc нужно пересохранить как .docx)');
      return Promise.all([f('word/document.xml'), f('word/_rels/document.xml.rels'), f('word/styles.xml'), f('word/numbering.xml')]);
    }).then(function (xs) {
      var rels = {};
      if (xs[1]) X.find(X.parse(xs[1]), 'Relationship').forEach(function (r) { rels[r.attrs.Id] = r.attrs; });
      var images = {}, jobs = [];
      Object.keys(rels).forEach(function (id) {
        var r = rels[id];
        if (!/\/image$/.test(r.Type) || r.TargetMode === 'External') return;
        var path = r.Target.replace(/^\//, '');
        if (!/^word\//.test(path)) path = 'word/' + path;
        /* Relationship targets are relative to word/document.xml. */
        path = path.split('/').reduce(function (parts, part) {
          if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part);
          return parts;
        }, []).join('/');
        var file = zip.file(path); if (!file) return;
        var ext = (path.split('.').pop() || '').toLowerCase();
        if (!MIME[ext]) return; // emf/wmf браузер не покажет
        jobs.push(file.async('uint8array').then(function (u8) {
          images[id] = { name: path.split('/').pop(), src: 'data:' + MIME[ext] + ';base64,' + bytesToB64(u8) };
        }));
      });
      return Promise.all(jobs).then(function () {
        return analyze(xs[0], xs[2], xs[3], images);
      });
    });
  }

  function analyze(docXml, stylesXml, numXml, images) {
    var ctx = { styles: readStyles(stylesXml), numberer: new Numberer(readNumbering(numXml)), images: images };
    var doc = X.parse(docXml);
    var body = X.find(doc, 'w:body')[0];
    var blocks = new Reader(ctx).walkBody(body, []);
    var report = { warnings: [], keyApplied: 0, sections: [], audioHints: [], blocks: blocks.length };
    blocks = splitInlineAnswers(blocks);
    annotate(blocks);
    markSubItems(blocks);

    // ключи в конце
    var keyAt = -1;
    for (var i = Math.floor(blocks.length * 0.3); i < blocks.length; i++) if (isKeyHeader(blocks[i])) { keyAt = i; break; }
    var main = keyAt >= 0 ? blocks.slice(0, keyAt) : blocks;
    var keyBlocks = keyAt >= 0 ? blocks.slice(keyAt + 1) : [];

    // заголовок экзамена
    var title = '', subtitle = '', start = 0;
    for (var j = 0; j < main.length && j < 6; j++) {
      var b = main[j];
      if (b.kind !== 'p' || !b.text.trim()) continue;
      if (sectionHeader(b) && !b.isTitle && b.text.length < 40) {
        var kinds = KW.filter(function (k) { return k[1].test(b.text); }).length;
        var nx = main.slice(j + 1).find(function (x) { return x.kind === 'p' && x.text.trim(); });
        if (!(kinds >= 2 || (nx && sectionHeader(nx)) || /(exam|test|assessment|контрольн|работа|экзамен|тестирование по)/i.test(b.text) && kinds < 1)) break;
      }
      if ((qnum(b) && !b.isTitle) || b.forceQ || b.forceOpt || optionsOf(b)) break;
      var nb2 = main.slice(j + 1).find(function (x) { return x.kind !== 'p' || x.text.trim(); });
      if (nb2 && (optionsOf(nb2) || nb2.forceOpt) && !b.isTitle && b.heading == null) break;
      if (!title) { title = b.text.replace(/\s+/g, ' ').trim(); start = j + 1; continue; }
      if (!subtitle && b.text.length < 120 && !b.allBold && (b.align === 'center' || b.isTitle) && !SKIP_RE.test(b.text) && !/^ВАРИАНТ С ОТВЕТАМИ/i.test(b.text)) { subtitle = b.text.trim(); start = j + 1; }
      break;
    }
    main = main.slice(start);

    // сегменты по заголовкам
    var segs = [], cur = { type: null, title: '', blocks: [], byHeader: false };
    main.forEach(function (b) {
      var h = sectionHeader(b);
      if (h) {
        if (cur.blocks.length || cur.byHeader) segs.push(cur);
        cur = { type: h.type, title: h.title, blocks: [], byHeader: true, headerText: b.text };
        return;
      }
      cur.blocks.push(b);
    });
    segs.push(cur);

    // вступление до первого заголовка: общие инструкции, если в нём нет заданий
    var intro = [];
    if (segs[0] && !segs[0].type) {
      var hasTasks = segs[0].blocks.some(function (b) { return qnum(b) || optionsOf(b) || b.kind === 'table'; });
      if (!hasTasks) { intro = segs.shift().blocks; }
    }

    // безымянные сегменты -> по перезапуску нумерации + классификация
    var expanded = [];
    segs.forEach(function (s) {
      if (s.type) { expanded.push(s); return; }
      segmentByRestart(s.blocks).forEach(function (bl) { expanded.push({ type: null, title: '', blocks: bl, byHeader: false }); });
    });
    var prev = null;
    expanded.forEach(function (s) {
      if (!s.type) {
        var c = classify(s.blocks, prev);
        s.type = c.type; s.guessed = true; s.scores = c.scores;
      }
      prev = s.type;
    });

    var segments = expanded.filter(function (s) { return s.blocks.some(function (b) { return b.kind === 'table' || b.text.trim() || b.images.length; }); });
    var built = buildFromSegments(segments, ctx, keyBlocks, report);
    var exam = built.exam;
    exam.title = title || 'Импортированный экзамен';
    exam.subtitle = subtitle;
    exam.instructions = intro.filter(function (b) { return b.kind === 'p' && b.text.trim() && !SKIP_RE.test(b.text) && !/^ВАРИАНТ С ОТВЕТАМИ/i.test(b.text); }).map(function (b) { return b.text; }).join('\n');
    return { exam: exam, report: report, segments: segments, ctx: ctx, keyBlocks: keyBlocks, intro: intro };
  }

  /* Сборка экзамена из сегментов (повторно вызывается, если пользователь поменял тип сегмента) */
  function buildFromSegments(segments, ctx, keyBlocks, report) {
    report.warnings = []; report.keyApplied = 0; report.sections = []; report.audioHints = [];
    var exam = M.newExam();
    var parsers = {};
    segments.forEach(function (s) {
      var p = parsers[s.type];
      if (!p) { p = parsers[s.type] = new SectionParser(s.type, report); p.title = s.title; }
      else { p.newGroup(null); if (s.title && !p.title) p.title = s.title; }
      ctx.numberer = ctx.numberer; // нумерация уже посчитана при чтении
      s.blocks.forEach(function (b, k) {
        var nx = null;
        for (var j = k + 1; j < s.blocks.length; j++) { var c = s.blocks[j]; if (c.kind !== 'p' || c.text.trim() || c.images.length) { nx = c; break; } }
        p.feed(b, ctx, nx);
      });
    });
    Object.keys(parsers).forEach(function (type) {
      var p = parsers[type]; p.finish();
      var sec = exam.sections[type];
      sec.title = p.title || '';
      sec.instructions = p.instructions.join('\n');
      sec.media = p.media;
      sec.tasks = p.tasks;
      if (p.audioHints.length) report.audioHints.push({ type: type, hints: p.audioHints });
    });
    var docOrder = [];
    segments.forEach(function (s) { if (docOrder.indexOf(s.type) < 0) docOrder.push(s.type); });
    applyKey(exam.sections, keyBlocks.length ? parseKey(keyBlocks) : [], report, docOrder);
    Object.keys(parsers).forEach(function (type) {
      if (parsers[type].inlineKey) applyKey(exam.sections, [{ type: type, items: parsers[type].inlineKey }], report, docOrder);
    });

    // отчёт
    var order = [];
    segments.forEach(function (s) { if (order.indexOf(s.type) < 0) order.push(s.type); });
    var allTypes = order.concat(M.SECTION_TYPES.filter(function (t) { return order.indexOf(t) < 0; }));
    exam.settings.order = allTypes;
    exam.settings.customOrder = order.join() !== M.SECTION_TYPES.filter(function (t) { return order.indexOf(t) >= 0; }).join();
    M.SECTION_TYPES.forEach(function (type) {
      var sec = exam.sections[type];
      var graded = sec.tasks.filter(function (t) { return t.type !== 'info'; });
      if (!sec.tasks.length && !sec.instructions) return;
      var byType = {};
      graded.forEach(function (t) { byType[t.type] = (byType[t.type] || 0) + 1; });
      var withAns = graded.filter(function (t) { return M.TASK_TYPES[t.type].auto && hasAnswer(t); }).length;
      var auto = graded.filter(function (t) { return M.TASK_TYPES[t.type].auto; }).length;
      report.sections.push({ type: type, tasks: graded.length, byType: byType, withAnswers: withAns, auto: auto });
      if (type === 'listening' && !sec.media.some(function (m) { return m.kind === 'audio'; })) {
        report.warnings.push('Аудирование: аудиофайл в .docx не хранится — прикрепите запись в редакторе.');
      }
      if (auto && withAns < auto) report.warnings.push(M.SECTION_LABELS[type] + ': ответы найдены для ' + withAns + ' из ' + auto + ' заданий — проверьте в редакторе.');
    });
    // чистим служебные поля
    M.SECTION_TYPES.forEach(function (type) {
      exam.sections[type].tasks.forEach(function (t) { delete t._num; delete t._leftNums; });
    });
    return { exam: exam };
  }

  function hasAnswer(t) {
    switch (t.type) {
      case 'mc': case 'tf': return t.answer != null;
      case 'multi': return t.answers.length > 0;
      case 'short': return !!t.answer;
      case 'match': return t.answer.some(function (a) { return a != null; });
      case 'gap': return M.parseGaps(t.question).some(function (p) { return p.gap && p.answers.length; });
    }
    return true;
  }

  function rebuild(result, typeOverrides) {
    var segs = result.segments.map(function (s, i) {
      var c = Object.assign({}, s);
      if (typeOverrides && typeOverrides[i]) c.type = typeOverrides[i];
      return c;
    });
    var report = { warnings: [], keyApplied: 0, sections: [], audioHints: [] };
    var built = buildFromSegments(segs, result.ctx, result.keyBlocks, report);
    built.exam.title = result.exam.title; built.exam.subtitle = result.exam.subtitle; built.exam.instructions = result.exam.instructions;
    return { exam: built.exam, report: report, segments: segs, ctx: result.ctx, keyBlocks: result.keyBlocks };
  }

  function segmentPreview(s) {
    var t = s.blocks.filter(function (b) { return b.kind === 'p' && b.text.trim(); }).slice(0, 2).map(function (b) { return b.text; }).join(' / ');
    return (s.headerText ? '«' + s.headerText + '» ' : '') + t.slice(0, 140);
  }

  return { parseDocx: parseDocx, analyze: analyze, rebuild: rebuild, segmentPreview: segmentPreview, _internal: { qnum: qnum, optionsOf: optionsOf, sectionHeader: sectionHeader, parsePairs: parsePairs, classify: classify } };
});
