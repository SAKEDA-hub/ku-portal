/* Минимальный XML-парсер для OOXML (без DTD). Работает одинаково в браузере и Node.
 * Узел: {name, attrs, children:[]}, текстовый узел: {text} */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MiniXML = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function decode(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (_, e) {
      switch (e) {
        case 'amp': return '&'; case 'lt': return '<'; case 'gt': return '>';
        case 'quot': return '"'; case 'apos': return "'";
      }
      var code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (err) { return ''; }
    });
  }

  var ATTR_RE = /([^\s=\/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

  function parse(xml) {
    var rootNode = { name: '#document', attrs: {}, children: [] };
    var stack = [rootNode];
    var i = 0, len = xml.length;
    while (i < len) {
      var lt = xml.indexOf('<', i);
      if (lt < 0) lt = len;
      if (lt > i) {
        var txt = xml.slice(i, lt);
        if (stack.length > 1) stack[stack.length - 1].children.push({ text: decode(txt) });
      }
      if (lt >= len) break;
      if (xml.startsWith('<!--', lt)) { var ce = xml.indexOf('-->', lt); i = ce < 0 ? len : ce + 3; continue; }
      if (xml.startsWith('<![CDATA[', lt)) {
        var cd = xml.indexOf(']]>', lt);
        stack[stack.length - 1].children.push({ text: xml.slice(lt + 9, cd < 0 ? len : cd) });
        i = cd < 0 ? len : cd + 3; continue;
      }
      if (xml[lt + 1] === '?' || xml[lt + 1] === '!') { var pe = xml.indexOf('>', lt); i = pe < 0 ? len : pe + 1; continue; }
      var gt = findTagEnd(xml, lt);
      var inner = xml.slice(lt + 1, gt);
      i = gt + 1;
      if (inner[0] === '/') {
        var cname = inner.slice(1).trim();
        // закрываем до соответствующего тега (терпимо к ошибкам)
        for (var k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === cname) { stack.length = k; break; }
        }
        continue;
      }
      var selfClose = inner[inner.length - 1] === '/';
      if (selfClose) inner = inner.slice(0, -1);
      var sp = inner.search(/\s/);
      var name = sp < 0 ? inner : inner.slice(0, sp);
      var attrs = {};
      if (sp >= 0) {
        var rest = inner.slice(sp), m; ATTR_RE.lastIndex = 0;
        while ((m = ATTR_RE.exec(rest))) attrs[m[1]] = decode(m[3] != null ? m[3] : m[4]);
      }
      var node = { name: name, attrs: attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
    }
    return rootNode;
  }

  function findTagEnd(xml, start) {
    var q = null;
    for (var j = start + 1; j < xml.length; j++) {
      var c = xml[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') return j;
    }
    return xml.length - 1;
  }

  function kids(node, name) {
    if (!node || !node.children) return [];
    return node.children.filter(function (c) { return c.name && (!name || c.name === name); });
  }
  function kid(node, name) {
    if (!node || !node.children) return null;
    for (var i = 0; i < node.children.length; i++) if (node.children[i].name === name) return node.children[i];
    return null;
  }
  function find(node, name, out) {
    out = out || [];
    if (!node || !node.children) return out;
    node.children.forEach(function (c) {
      if (c.name === name) out.push(c);
      if (c.children) find(c, name, out);
    });
    return out;
  }
  function textOf(node) {
    if (!node) return '';
    if (node.text != null) return node.text;
    return (node.children || []).map(textOf).join('');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      // удаляем символы, запрещённые в XML 1.0
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  }

  return { parse: parse, kids: kids, kid: kid, find: find, textOf: textOf, esc: esc, decode: decode };
});
