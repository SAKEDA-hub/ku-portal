'use strict';
/*
 * Вложения KU Message (личные чаты, страницы предметов, каналы и чаты клубов): какие файлы принимаются.
 * Используется в server/messages.js (загрузка /api/files, выдача) и server/clubs.js (файлы в клубах).
 *
 * Принимаются только документы и фото (ревью п.12): без архивов и исполняемых файлов. Расширение должно
 * совпадать с содержимым (сигнатура в начале файла), поэтому программа, переименованная в .png или .docx,
 * не пройдёт. Текстовые форматы (txt, csv) не должны содержать нулевых байтов.
 */
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const DOC_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'odt', 'odp', 'ods', 'csv'];
const FILE_EXT = [...DOC_EXT, ...IMAGE_EXT];
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const starts = (buf, bytes, at = 0) => buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx, xlsx, pptx, odt, ods, odp — контейнер zip
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // doc, xls, ppt — старый формат Office
const SIGNATURES = {
  png: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (b) => starts(b, [0xff, 0xd8, 0xff]),
  gif: (b) => starts(b, ascii('GIF87a')) || starts(b, ascii('GIF89a')),
  webp: (b) => starts(b, ascii('RIFF')) && starts(b, ascii('WEBP'), 8),
  pdf: (b) => starts(b, ascii('%PDF-')),
  rtf: (b) => starts(b, ascii('{\\rtf')),
  zip: (b) => starts(b, ZIP),
  ole: (b) => starts(b, OLE),
  // UTF-8 без нулевых байтов или UTF-16 с меткой порядка байтов (так сохраняют «Блокнот» и Excel)
  text: (b) => starts(b, [0xff, 0xfe]) || starts(b, [0xfe, 0xff]) || !b.subarray(0, 64 * 1024).includes(0),
};
const KIND = {
  png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', webp: 'webp', pdf: 'pdf', rtf: 'rtf', txt: 'text', csv: 'text',
  docx: 'zip', xlsx: 'zip', pptx: 'zip', odt: 'zip', ods: 'zip', odp: 'zip', doc: 'ole', xls: 'ole', ppt: 'ole',
};
// исполняемые файлы Windows, Linux, macOS и скрипты с «#!» — отклоняются при любом расширении
const EXECUTABLE = [[0x4d, 0x5a], [0x7f, 0x45, 0x4c, 0x46], [0xcf, 0xfa, 0xed, 0xfe], [0xfe, 0xed, 0xfa, 0xcf], [0xca, 0xfe, 0xba, 0xbe], ascii('#!')];

const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();
const isImage = (name) => IMAGE_EXT.includes(extOf(name));

/* Проверка загружаемого файла: null — можно принять, иначе текст ошибки */
function fileProblem(name, buf) {
  const ext = extOf(name);
  if (!name || !FILE_EXT.includes(ext)) return 'Можно отправлять только фото (PNG, JPG, GIF, WEBP) и документы (PDF, Word, Excel, PowerPoint, TXT, CSV)';
  // текст (txt, csv) отдаётся только скачиванием и не запускается — «#!» или «MZ» в начале заметки допустимы
  if (KIND[ext] !== 'text' && EXECUTABLE.some((sig) => starts(buf, sig))) return 'Исполняемые файлы отправлять нельзя';
  // старый .doc бывает на деле RTF — Word открывает оба
  const ok = SIGNATURES[KIND[ext]](buf) || (ext === 'doc' && SIGNATURES.rtf(buf));
  if (!ok) return 'Содержимое файла не совпадает с его расширением';
  return null;
}

/* Ссылка на свой загруженный файл для публикации: null — без файла, undefined — файл не найден или чужой */
function fileRef(db, u, fileId) {
  if (!fileId) return null;
  const f = (db.files || []).find((x) => x.id === fileId && x.owner === u.id);
  return f ? { id: f.id, name: f.name, size: f.size } : undefined;
}

module.exports = { FILE_EXT, IMAGE_EXT, IMAGE_MIME, extOf, isImage, fileProblem, fileRef };
