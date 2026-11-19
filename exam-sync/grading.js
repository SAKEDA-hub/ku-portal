'use strict';

const { HttpError } = require('../server/http');

const round = value => Math.round(value * 100) / 100;
const sorted = values => [...values].sort();
const option = (list, index) => Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : undefined;
const normalized = (value, sensitive) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[’‘\x60´]/g, "'");
  return sensitive ? text : text.toLowerCase();
};

// The student receives the choices independently from their correct ordering or pairing.
function studentQuestion(q) {
  const out = { id: q.id, type: q.type, text: q.text, points: q.points };
  if (q.type === 'single' || q.type === 'multi') out.options = q.options;
  if (q.type === 'order') out.items = sorted(q.items);
  if (q.type === 'match') {
    const rights = sorted(q.pairs.map(p => p.right));
    out.pairs = q.pairs.map((p, i) => ({ label: p.label, img: p.img, right: rights[i] }));
  }
  return out;
}

function scoreQuestion(q, answer) {
  let fraction = 0, empty = true, user = '—', corr;
  switch (q.type) {
    case 'single':
      corr = q.options[q.correct];
      if (option(q.options, answer) !== undefined) {
        empty = false; user = q.options[answer]; fraction = Number(answer === q.correct);
      }
      break;
    case 'tf':
      corr = q.correct ? 'Верно' : 'Неверно';
      if (typeof answer === 'boolean') {
        empty = false; user = answer ? 'Верно' : 'Неверно'; fraction = Number(answer === q.correct);
      }
      break;
    case 'input': {
      const value = typeof answer === 'string' ? answer.trim().slice(0, 4096) : '';
      corr = q.answers.join(' / ');
      if (value) {
        empty = false; user = value;
        fraction = Number(q.answers.some(a => normalized(a, q.caseSensitive) === normalized(value, q.caseSensitive)));
      }
      break;
    }
    case 'multi': {
      const selected = Array.isArray(answer) ? [...new Set(answer)] : [];
      const correct = new Set(q.correct);
      corr = q.correct.map(i => q.options[i]).join(', ');
      if (selected.length && selected.every(i => option(q.options, i) !== undefined)) {
        empty = false; user = selected.map(i => q.options[i]).join(', ');
        const hits = selected.filter(i => correct.has(i)).length;
        fraction = q.partial ? Math.max(0, (2 * hits - selected.length) / correct.size)
          : Number(hits === correct.size && hits === selected.length);
      }
      break;
    }
    case 'match': {
      const rights = sorted(q.pairs.map(p => p.right));
      const selected = Array.isArray(answer) ? answer : [];
      const pairs = [], expected = [], used = new Set();
      let hits = 0;
      q.pairs.forEach((p, i) => {
        const label = p.label || ('картинка ' + (i + 1));
        const j = selected[i], word = option(rights, j);
        expected.push(label + ' → ' + p.right);
        pairs.push(label + ' → ' + (word ?? '?'));
        if (word !== undefined && !used.has(j)) { empty = false; used.add(j); if (word === p.right) hits++; }
      });
      corr = expected.join('; '); if (!empty) user = pairs.join('; ');
      fraction = q.partial ? hits / q.pairs.length : Number(hits === q.pairs.length);
      break;
    }
    case 'order': {
      const pool = sorted(q.items);
      const indices = Array.isArray(answer) ? answer : [];
      corr = q.items.join(' ');
      if (indices.length && indices.length <= pool.length && new Set(indices).size === indices.length &&
          indices.every(i => option(pool, i) !== undefined)) {
        empty = false;
        const words = indices.map(i => pool[i]); user = words.join(' ');
        const hits = words.filter((w, i) => w === q.items[i]).length;
        fraction = q.partial ? hits / pool.length : Number(hits === pool.length);
      }
      break;
    }
    default: throw new HttpError(400, 'Неизвестный тип задания');
  }
  const max = Math.max(0, Number(q.points) || 0);
  return { text: q.text, type: q.type, max, earned: round(max * (Number.isFinite(fraction) ? fraction : 0)),
    status: empty ? 'empty' : fraction === 1 ? 'correct' : fraction > 0 ? 'partial' : 'wrong', user, corr };
}

module.exports = { studentQuestion, scoreQuestion, round };
