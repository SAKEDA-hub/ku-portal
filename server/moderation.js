'use strict';

const CLEANUP_VERSION = 1;
const PROFANITY = /(?<![\p{L}\p{N}_])(?:(?:на|по|за|про|пере|вы|у|от|при|раз|об|въ|в)?[хx][уy][йиеяюёi][\p{L}]*|(?:рас|раз|на|по|за|при|про|от)?[пp][иi][зz]д[\p{L}]*|(?:за|на|про|пере|вы|у|от|при|раз|об|въ)?е[бb6][\p{L}]*|бляд[\p{L}]*|бля|сук[аеиуой][\p{L}]*|сучк[аеиуой][\p{L}]*|мудак[\p{L}]*|гандон[\p{L}]*|fuck[\p{L}]*|shit[\p{L}]*|bitch[\p{L}]*|cunt[\p{L}]*|asshole[\p{L}]*)((?![\p{L}\p{N}_]))/giu;

function cleanText(text) {
  return String(text).replace(PROFANITY, '[удалено]');
}

/* One-time cleanup of existing direct and club chat text; reports counts only, never content. */
function cleanExistingChat(db) {
  db.chat = db.chat || {};
  if ((db.chat.profanityCleanedVersion || 0) >= CLEANUP_VERSION) return { firstRun: false, scanned: 0, changed: 0 };
  let scanned = 0, changed = 0;
  const inspect = (rows) => {
    for (const row of rows || []) {
      if (!row || typeof row.text !== 'string') continue;
      scanned++;
      const clean = cleanText(row.text);
      if (clean !== row.text) { row.text = clean; changed++; }
    }
  };
  inspect(db.chat.msgs);
  for (const club of db.clubs || []) {
    inspect(club.chat);
    inspect(club.posts);
  }
  db.chat.profanityCleanedVersion = CLEANUP_VERSION;
  return { firstRun: true, scanned, changed };
}

module.exports = { cleanText, cleanExistingChat, CLEANUP_VERSION };
