/* Экспорт экзамена в .docx (WordprocessingML собирается вручную, упаковка — JSZip).
 * buildDocx(exam, {withAnswers, JSZip, type}) -> Promise<Blob|Uint8Array> */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'), require('./xml.js'));
  else root.DocxExport = factory(root.ExamModel, root.MiniXML);
})(typeof self !== 'undefined' ? self : this, function (M, X) {
  'use strict';
  var esc = X.esc;
  var PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134, TEXT_W = PAGE_W - 2 * MARGIN; // A4, поля 2 см
  var GREEN = '1E7B34';

  /* ---------- примитивы ---------- */
  function rPr(o) {
    o = o || {};
    var s = '';
    if (o.b) s += '<w:b/><w:bCs/>';
    if (o.i) s += '<w:i/><w:iCs/>';
    if (o.color) s += '<w:color w:val="' + o.color + '"/>';
    if (o.size) s += '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>';
    if (o.u) s += '<w:u w:val="single"/>';
    if (o.hl) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.hl + '"/>';
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  }
  function run(text, o) {
    text = String(text == null ? '' : text);
    var pr = rPr(o), out = '';
    var lines = text.split('\n');
    lines.forEach(function (line, li) {
      if (li > 0) out += '<w:r>' + pr + '<w:br/></w:r>';
      var tabs = line.split('\t');
      tabs.forEach(function (seg, ti) {
        if (ti > 0) out += '<w:r>' + pr + '<w:tab/></w:r>';
        if (seg) out += '<w:r>' + pr + '<w:t xml:space="preserve">' + esc(seg) + '</w:t></w:r>';
      });
    });
    return out;
  }
  function para(content, o) {
    o = o || {};
    var p = '';
    if (o.style) p += '<w:pStyle w:val="' + o.style + '"/>';
    if (o.keepNext) p += '<w:keepNext/>';
    if (o.pageBreakBefore) p += '<w:pageBreakBefore/>';
    if (o.border) p += '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="A6A6A6"/></w:pBdr>';
    if (o.after != null || o.before != null || o.line) {
      p += '<w:spacing' + (o.before != null ? ' w:before="' + o.before + '"' : '') +
        (o.after != null ? ' w:after="' + o.after + '"' : '') + (o.line ? ' w:line="' + o.line + '" w:lineRule="auto"' : '') + '/>';
    }
    if (o.indent) p += '<w:ind w:left="' + o.indent + '"' + (o.hanging ? ' w:hanging="' + o.hanging + '"' : '') + '/>';
    if (o.align) p += '<w:jc w:val="' + o.align + '"/>';
    return '<w:p>' + (p ? '<w:pPr>' + p + '</w:pPr>' : '') + content + '</w:p>';
  }
  function multiPara(text, ropt, popt) {
    return String(text || '').split(/\n{1,}/).filter(function (s) { return s.trim(); })
      .map(function (s) { return para(run(s, ropt), popt); }).join('');
  }
  function cell(content, w, o) {
    o = o || {};
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' +
      (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '') +
      '</w:tcPr>' + (content || '<w:p/>') + '</w:tc>';
  }
  function table(rows, widths, o) {
    o = o || {};
    var total = widths.reduce(function (a, b) { return a + b; }, 0);
    var x = '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/>' +
      (o.indent ? '<w:tblInd w:w="' + o.indent + '" w:type="dxa"/>' : '') +
      '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) {
        return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/>';
      }).join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
    rows.forEach(function (r, ri) {
      x += '<w:tr>' + r.map(function (c, ci) {
        return cell(c, widths[ci], { fill: (o.header && ri === 0) ? 'E8EEF6' : null });
      }).join('') + '</w:tr>';
    });
    return x + '</w:tbl>' + para('', { after: 60 });
  }

  /* ---------- медиа ---------- */
  function dataUrlToBytes(src) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(src || '');
    if (!m) return null;
    var mime = m[1] || 'application/octet-stream', data = m[3];
    var bytes;
    if (m[2]) {
      if (typeof atob === 'function') {
        var bin = atob(data); bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else bytes = new Uint8Array(Buffer.from(data, 'base64'));
    } else {
      var s = decodeURIComponent(data); bytes = new Uint8Array(s.length);
      for (var j = 0; j < s.length; j++) bytes[j] = s.charCodeAt(j) & 255;
    }
    return { mime: mime, bytes: bytes };
  }
  function imageSize(b) {
    if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0, ext: 'png' };
    if (b[0] === 0x47 && b[1] === 0x49) return { w: b[6] | b[7] << 8, h: b[8] | b[9] << 8, ext: 'gif' };
    if (b[0] === 0xFF && b[1] === 0xD8) {
      var i = 2;
      while (i < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        var mk = b[i + 1];
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
          return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8], ext: 'jpeg' };
        }
        i += 2 + (b[i + 2] << 8 | b[i + 3]);
      }
      return { w: 600, h: 400, ext: 'jpeg' };
    }
    return null;
  }

  function Ctx(withAnswers) {
    this.withAnswers = withAnswers;
    this.media = []; // {name, bytes, rid}
    this.rid = 10;
    this.docPr = 1;
  }
  Ctx.prototype.image = function (m) {
    var d = dataUrlToBytes(m.src); if (!d) return '';
    var sz = imageSize(d.bytes);
    if (!sz) return para(run('[Изображение: ' + m.name + ']', { i: true, color: '7F7F7F' }));
    var rid = 'rId' + (this.rid++);
    var fname = 'image' + (this.media.length + 1) + '.' + sz.ext;
    this.media.push({ name: fname, bytes: d.bytes, rid: rid });
    var maxW = 5400000, maxH = 4000000; // ~15 x 11 см
    var cx = sz.w * 9525, cy = sz.h * 9525;
    var k = Math.min(1, maxW / cx, maxH / cy); cx = Math.round(cx * k); cy = Math.round(cy * k);
    var id = this.docPr++;
    var draw = '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + id + '" name="' + esc(m.name) + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + esc(fname) + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    return para(draw, { after: 120 });
  };
  Ctx.prototype.mediaList = function (list) {
    var self = this;
    return (list || []).map(function (m) {
      if (m.kind === 'image') return self.image(m);
      return para(run((m.kind === 'video' ? '🎬 Видеозапись: ' : '🎧 Аудиозапись: ') + m.name, { i: true, color: '2F5597' }), { after: 80 });
    }).join('');
  };

  /* ---------- задания ---------- */
  function optLine(letter, text, correct, ctx) {
    var mark = ctx.withAnswers && correct;
    return para(run(letter + ') ', { b: true }) + run(text, mark ? { b: true, color: GREEN } : null) +
      (mark ? run(' ✓', { b: true, color: GREEN }) : ''), { indent: 567, after: 20 });
  }

  function gapRuns(text, ctx) {
    return M.parseGaps(text).map(function (p) {
      if (!p.gap) return run(p.text);
      if (ctx.withAnswers && p.answers.length) return run(p.answers.join(' / '), { b: true, u: true, color: GREEN });
      return run('__________');
    }).join('');
  }

  function taskXml(task, num, sectionType, ctx) {
    var x = '';
    var head = num != null ? run(num + '. ', { b: true }) : '';
    var A = ctx.withAnswers;
    switch (task.type) {
      case 'info':
        if (task.kind === 'transcript') {
          if (!A) return ctx.mediaList(task.media);
          x += para(run(task.title || 'Транскрипт аудиозаписи', { b: true, color: '7F7F7F' }), { keepNext: true, before: 120 });
          x += multiPara(task.text, { color: '595959' }, { after: 80 });
          return x + ctx.mediaList(task.media);
        }
        if (task.title) x += para(run(task.title, { b: true }), { keepNext: true, before: 160, align: task.kind === 'text' ? 'center' : null });
        if (task.kind === 'instruction') x += multiPara(task.text, { b: true, i: true }, { before: 160, after: 80, keepNext: true });
        else x += multiPara(task.text, null, { after: 100, align: 'both' });
        return x + ctx.mediaList(task.media);

      case 'mc':
      case 'multi':
        x += para(head + run(task.question) + (task.type === 'multi' ? run(' (несколько ответов)', { i: true }) : ''), { keepNext: true, before: 120, after: 40 });
        x += ctx.mediaList(task.media);
        task.options.forEach(function (o, i) {
          var correct = task.type === 'mc' ? task.answer === i : task.answers.indexOf(i) >= 0;
          x += optLine(M.LETTERS[i], o, correct, ctx);
        });
        return x;

      case 'tf':
        var labels = M.TF_VARIANTS[task.variant];
        x += para(head + run(task.question), { keepNext: true, before: 120, after: 20 });
        x += ctx.mediaList(task.media);
        x += para(labels.map(function (l, i) {
          var mark = A && task.answer === i;
          return (i ? run('   /   ') : '') + run(l + (mark ? ' ✓' : ''), mark ? { b: true, u: true, color: GREEN } : { color: '404040' });
        }).join(''), { indent: 567, after: 40 });
        return x;

      case 'match':
        x += para(head + run(task.question || 'Установите соответствие.'), { keepNext: true, before: 120, after: 60 });
        x += ctx.mediaList(task.media);
        var rows = [], n = Math.max(task.left.length, task.right.length);
        for (var i = 0; i < n; i++) {
          rows.push([
            i < task.left.length ? para(run((i + 1) + '. ', { b: true }) + run(task.left[i]), { after: 0 }) : '',
            i < task.right.length ? para(run(M.LETTERS[i] + '. ', { b: true }) + run(task.right[i]), { after: 0 }) : ''
          ]);
        }
        x += table(rows, [Math.round(TEXT_W / 2), TEXT_W - Math.round(TEXT_W / 2)]);
        if (A) {
          var pairs = task.left.map(function (_, i) {
            return (i + 1) + ' – ' + (task.answer[i] != null ? M.LETTERS[task.answer[i]] : '?');
          });
          x += para(run('Ответ: ', { b: true }) + run(pairs.join('; '), { b: true, color: GREEN }), { after: 80 });
        } else if (task.left.length) {
          var cw = Math.min(900, Math.floor(TEXT_W / task.left.length));
          x += table([
            task.left.map(function (_, i) { return para(run(String(i + 1), { b: true }), { align: 'center', after: 0 }); }),
            task.left.map(function () { return para('', { after: 0 }); })
          ], task.left.map(function () { return cw; }));
        }
        return x;

      case 'gap':
        x += para(head + gapRuns(task.question, ctx), { before: 120, after: 60, line: 300 });
        return x + ctx.mediaList(task.media);

      case 'short':
        x += para(head + run(task.question), { keepNext: true, before: 120, after: 20 });
        x += ctx.mediaList(task.media);
        x += para(run('Ответ: ', { b: true }) + (A && task.answer ? run(task.answer.split('|').join(' / '), { b: true, color: GREEN }) : run('______________________')), { indent: 567, after: 60 });
        return x;

      case 'essay':
        x += para(head + run(String(task.question || '').split('\n')[0]), { keepNext: true, before: 160, after: 40 });
        String(task.question || '').split('\n').slice(1).filter(function (s) { return s.trim(); }).forEach(function (s) {
          x += para(run(s), { after: 40, indent: 284 });
        });
        x += ctx.mediaList(task.media);
        var meta = [];
        if (task.minWords && task.maxWords) meta.push('Объём: ' + task.minWords + '–' + task.maxWords + ' слов.');
        else if (task.minWords) meta.push('Объём: не менее ' + task.minWords + ' слов.');
        else if (task.maxWords) meta.push('Объём: не более ' + task.maxWords + ' слов.');
        if (task.timeMinutes) meta.push('Время: ' + task.timeMinutes + ' мин.');
        if (meta.length) x += para(run(meta.join(' '), { i: true }), { after: 80, indent: 284 });
        if (A && task.notes) x += para(run('Комментарий для проверяющего: ', { b: true, color: GREEN }) + run(task.notes, { color: GREEN }), { after: 80 });
        if (!A && sectionType === 'writing') {
          var lines = Math.max(8, Math.min(22, Math.round((task.maxWords || 120) / 10)));
          for (var l = 0; l < lines; l++) x += para('', { border: true, after: 0, line: 360 });
        }
        return x;
    }
    return '';
  }

  function keyText(task) {
    switch (task.type) {
      case 'mc': return task.answer != null ? M.LETTERS[task.answer] : '';
      case 'multi': return task.answers.slice().sort().map(function (i) { return M.LETTERS[i]; }).join(', ');
      case 'tf': return task.answer != null ? M.TF_VARIANTS[task.variant][task.answer] : '';
      case 'match': return task.left.map(function (_, i) { return (i + 1) + '–' + (task.answer[i] != null ? M.LETTERS[task.answer[i]] : '?'); }).join(', ');
      case 'gap': return M.parseGaps(task.question).filter(function (p) { return p.gap; }).map(function (p) { return p.answers.join('/') || '?'; }).join('; ');
      case 'short': return task.answer.split('|').join(' / ');
      default: return '';
    }
  }

  /* ---------- документ ---------- */
  function bodyXml(exam, ctx) {
    var x = '';
    x += para(run(exam.title || 'Экзамен'), { style: 'Title' });
    if (exam.subtitle) x += para(run(exam.subtitle, { color: '595959' }), { align: 'center', after: 120 });
    if (ctx.withAnswers) x += para(run('ВАРИАНТ С ОТВЕТАМИ (для учителя)', { b: true, color: 'C00000' }), { align: 'center', after: 160 });
    else if (exam.settings.showStudentFields) {
      x += para(run('ФИО: ________________________________   Класс: ________   Дата: ____________'), { after: 200, before: 80 });
    }
    if (exam.instructions) x += multiPara(exam.instructions, { i: true }, { after: 80 });

    var secs = M.activeSections(exam);
    secs.forEach(function (type, si) {
      var s = exam.sections[type];
      var label = M.SECTION_LABELS[type];
      var heading = 'Раздел ' + (si + 1) + '. ' + label + (s.title && s.title !== label ? ' — ' + s.title : '');
      x += para(run(heading), { style: 'Heading1' });
      if (s.instructions) x += multiPara(s.instructions, { i: true }, { after: 100 });
      x += ctx.mediaList(s.media);
      var nums = M.numberTasks(s);
      s.tasks.forEach(function (t, ti) { x += taskXml(t, nums[ti], type, ctx); });
    });

    if (ctx.withAnswers) {
      var any = false, kx = para(run('Ключи к заданиям'), { style: 'Heading1', pageBreakBefore: true });
      secs.forEach(function (type) {
        var s = exam.sections[type], nums = M.numberTasks(s), rows = [];
        s.tasks.forEach(function (t, i) {
          var k = keyText(t);
          if (nums[i] != null && k) rows.push([para(run(String(nums[i])), { after: 0, align: 'center' }), para(run(k), { after: 0 })]);
        });
        if (!rows.length) return;
        any = true;
        kx += para(run(M.sectionTitle(exam, type)), { style: 'Heading2' });
        rows.unshift([para(run('№', { b: true }), { after: 0, align: 'center' }), para(run('Ответ', { b: true }), { after: 0 })]);
        kx += table(rows, [900, TEXT_W - 900], { header: true });
      });
      if (any) x += kx;
    }
    return x;
  }

  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  function stylesXml() {
    function hs(id, name, size, color, before, after, outline) {
      return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
        '<w:pPr><w:keepNext/><w:spacing w:before="' + before + '" w:after="' + after + '"/>' + (outline != null ? '<w:outlineLvl w:val="' + outline + '"/>' : '') + (id === 'Title' ? '<w:jc w:val="center"/>' : '') + '</w:pPr>' +
        '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:b/><w:bCs/><w:color w:val="' + color + '"/><w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr></w:style>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '>' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      hs('Title', 'Title', 36, '1F3864', 0, 160, null) +
      hs('Heading1', 'heading 1', 28, '1F3864', 360, 140, 0) +
      hs('Heading2', 'heading 2', 24, '2F5597', 240, 100, 1) +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="18"/></w:rPr></w:style>' +
      '</w:styles>';
  }

  function buildDocx(exam, opts) {
    opts = opts || {};
    var JSZip = opts.JSZip || (typeof self !== 'undefined' && self.JSZip) || require('jszip');
    exam = M.normalize(exam);
    var ctx = new Ctx(!!opts.withAnswers);
    var body = bodyXml(exam, ctx);
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body +
      '<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="' + PAGE_W + '" w:h="' + PAGE_H + '"/>' +
      '<w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + MARGIN + '" w:left="' + MARGIN + '" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';

    var footer = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>' +
      run(exam.title + (ctx.withAnswers ? ' — с ответами' : '') + ' · стр. ') +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';

    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      ctx.media.map(function (m) {
        return '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>';
      }).join('') + '</Relationships>';

    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';

    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(exam.title) + '</dc:title><dc:creator>Exam Builder</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
    var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Exam Builder</Application></Properties>';
    var settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';

    var zip = new JSZip();
    zip.file('[Content_Types].xml', types);
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    zip.file('docProps/core.xml', core);
    zip.file('docProps/app.xml', app);
    zip.file('word/document.xml', doc);
    zip.file('word/styles.xml', stylesXml());
    zip.file('word/settings.xml', settings);
    zip.file('word/footer1.xml', footer);
    zip.file('word/_rels/document.xml.rels', rels);
    ctx.media.forEach(function (m) { zip.file('word/media/' + m.name, m.bytes); });
    return zip.generateAsync({
      type: opts.type || (typeof Blob !== 'undefined' && typeof window !== 'undefined' ? 'blob' : 'uint8array'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE', createFolders: false
    });
  }

  return { buildDocx: buildDocx, dataUrlToBytes: dataUrlToBytes, imageSize: imageSize };
});
