/**
 * Compiles scripts/events.mjs → docs/events.json.
 * Run: node scripts/build-events.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EVENTS } from './events.mjs';
import { EVENT_STATUS } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(ROOT, 'docs', 'events.json');

const VALID_STATUS = new Set(Object.keys(EVENT_STATUS));
const VALID_TYPES  = new Set(['event', 'note']);

let errors = 0;
for (const e of EVENTS) {
  if (!e.id)                            { console.error(`  ✗ entry missing id`); errors++; }
  if (!VALID_TYPES.has(e.type))         { console.error(`  ✗ ${e.id}: unknown type '${e.type}'`); errors++; }
  if (e.type === 'event' && !e.title)   { console.error(`  ✗ ${e.id}: event missing title`); errors++; }
  if (e.type === 'note'  && !e.text)    { console.error(`  ✗ ${e.id}: note missing text`); errors++; }
  if (e.status && !VALID_STATUS.has(e.status)) { console.error(`  ✗ ${e.id}: unknown status '${e.status}'`); errors++; }
}
if (errors) { console.error(`\n${errors} validation error(s). Fix before committing.`); process.exit(1); }

const sorted = [...EVENTS].sort((a, b) => {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.localeCompare(b.date);
});

writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(`✓ Written ${sorted.length} event(s) → docs/events.json`);
