'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Only pass internal IDs here. Passwords, addresses, marks and request bodies stay out of the journal.
function createAudit(dataDir) {
  const directory = path.join(dataDir, 'audit');
  let lastDay;
  return function record(event, actor, target) {
    const at = new Date().toISOString(), day = at.slice(0, 10);
    try {
      if (day !== lastDay) {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const oldest = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
        for (const f of fs.readdirSync(directory)) {
          if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < oldest) fs.rmSync(path.join(directory, f), { force: true });
        }
        lastDay = day;
      }
      fs.appendFileSync(path.join(directory, day + '.jsonl'), JSON.stringify({ at, event, actor, target }) + '\n', { mode: 0o600 });
    } catch (error) { console.error('[audit]', event, error.code || 'write failed'); }
  };
}

module.exports = { createAudit };
