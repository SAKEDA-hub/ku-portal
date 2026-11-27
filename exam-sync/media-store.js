'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { HttpError } = require('../server/http');

const PREFIX = 'ku-media:v1:';
const REF_RE = /^ku-media:v1:([a-f0-9]{64}):([A-Za-z0-9_-]+)$/;
const DATA_RE = /^data:((?:image|audio|video)\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+=[a-z0-9.+-]+)*);base64,([A-Za-z0-9+/]+={0,2})$/i;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const hashOf = (mime, bytes) => crypto.createHash('sha256').update(mime).update('\0').update(bytes).digest('hex');

function createMediaStore(directory, backupDirectory, keep = 14) {
  const mediaDir = path.resolve(directory);
  const backupRoot = path.join(backupDirectory, 'exam-media');
  fs.mkdirSync(mediaDir, { recursive: true, mode: 0o700 });

  function decodeRef(value) {
    const match = REF_RE.exec(value);
    if (!match) return null;
    let mime;
    try { mime = Buffer.from(match[2], 'base64url').toString('utf8'); } catch { return null; }
    if (!/^(?:image|audio|video)\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+=[a-z0-9.+-]+)*$/.test(mime) ||
        Buffer.from(mime, 'utf8').toString('base64url') !== match[2]) return null;
    return { hash: match[1], mime };
  }

  function saveDataUrl(value) {
    const match = DATA_RE.exec(value);
    if (!match) {
      if (/^data:(?:image|audio|video)\//i.test(value)) throw new HttpError(400, 'Медиафайл экзамена имеет неверный формат');
      return value;
    }
    const mime = match[1].toLowerCase();
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_MEDIA_BYTES) throw new HttpError(413, 'Медиафайл экзамена больше 25 МБ');
    if (!bytes.length || bytes.toString('base64') !== match[2]) throw new HttpError(400, 'Медиафайл экзамена пустой или повреждён');
    const hash = hashOf(mime, bytes), file = path.join(mediaDir, hash);
    if (!fs.existsSync(file)) {
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      const fd = fs.openSync(temp, 'wx', 0o600);
      try {
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        try { fs.renameSync(temp, file); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      } finally { fs.rmSync(temp, { force: true }); }
    }
    return `${PREFIX}${hash}:${Buffer.from(mime, 'utf8').toString('base64url')}`;
  }

  function externalize(value) {
    let changed = false;
    const visit = node => {
      if (typeof node === 'string') {
        const out = saveDataUrl(node);
        if (out !== node) changed = true;
        return out;
      }
      if (Array.isArray(node)) {
        let copy = null;
        const out = node.map((item, index) => {
          const value = visit(item);
          if (value !== item && !copy) copy = node.slice(0, index);
          if (copy) copy.push(value);
          return value;
        });
        return copy ? out : node;
      }
      if (!node || typeof node !== 'object') return node;
      let copy = null;
      for (const [key, child] of Object.entries(node)) {
        const value = visit(child);
        if (value !== child && !copy) copy = { ...node };
        if (copy) copy[key] = value;
      }
      return copy || node;
    };
    return { data: visit(value), changed };
  }

  function hydrate(value) {
    const cache = new Map();
    const visit = node => {
      if (typeof node === 'string') {
        const ref = decodeRef(node);
        if (!ref) return node;
        if (!cache.has(ref.hash)) {
          const bytes = fs.readFileSync(path.join(mediaDir, ref.hash));
          if (hashOf(ref.mime, bytes) !== ref.hash) throw new Error(`Медиафайл экзамена повреждён: ${ref.hash}`);
          cache.set(ref.hash, bytes.toString('base64'));
        }
        return `data:${ref.mime};base64,${cache.get(ref.hash)}`;
      }
      if (Array.isArray(node)) return node.map(visit);
      if (!node || typeof node !== 'object') return node;
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, visit(child)]));
    };
    return visit(value);
  }

  function referencedFiles(value) {
    const found = new Set();
    const visit = node => {
      if (typeof node === 'string') { const ref = decodeRef(node); if (ref) found.add(ref.hash); }
      else if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === 'object') Object.values(node).forEach(visit);
    };
    visit(value);
    return found;
  }

  // Daily hard-link snapshots keep deleted/replaced media recoverable without copying its bytes.
  function snapshot(day) {
    fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    const target = path.join(backupRoot, day);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
      for (const name of fs.readdirSync(mediaDir)) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue;
        const source = path.join(mediaDir, name), dest = path.join(target, name);
        try { fs.linkSync(source, dest); }
        catch (error) {
          if (error.code !== 'EXDEV') throw error;
          fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
          fs.chmodSync(dest, 0o600);
        }
      }
    }
    const days = fs.readdirSync(backupRoot).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort();
    for (const old of days.slice(0, Math.max(0, days.length - keep))) fs.rmSync(path.join(backupRoot, old), { recursive: true, force: true });
  }

  function prune(value) {
    const live = referencedFiles(value);
    for (const name of fs.readdirSync(mediaDir)) {
      if (/^[a-f0-9]{64}$/.test(name) && !live.has(name)) fs.rmSync(path.join(mediaDir, name), { force: true });
    }
  }

  return { externalize, hydrate, snapshot, prune, referencedFiles, mediaDir, backupRoot, MAX_MEDIA_BYTES };
}

module.exports = { createMediaStore, MAX_MEDIA_BYTES };
