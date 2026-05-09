/**
 * Promote docs/stg/ to production (docs/).
 *
 * Copies stg/index.html  → index.html, rewriting ../ data paths back to ./
 * Copies stg/venues.html → venues.html, applying the same rewrites
 * Copies stg/render.mjs  → render.mjs if it differs from the current production copy.
 *
 * Run: node scripts/promote.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun  = process.argv.includes('--dry-run');

// Stg pages live one dir deeper than prod, so they reference data and asset paths
// via ../. Promote rewrites those back to ./ (and '' for the venue asset prefix).
function promoteHtml(stgSrc) {
  return stgSrc
    .replace('<script src="../config.js">', '<script src="./config.js">')
    .replace("const FIXTURES_URL = '../fixtures.json';", "const FIXTURES_URL = './fixtures.json';")
    .replace("fetch('../lineups.json')", "fetch('lineups.json')")
    .replace("fetch('../events.json')", "fetch('./events.json')")
    .replace("const VENUE_ASSET_PREFIX = '../';", "const VENUE_ASSET_PREFIX = '';");
}

const stgRender  = readFileSync(join(ROOT, 'docs/stg/render.mjs'), 'utf8');
const prodRender = readFileSync(join(ROOT, 'docs/render.mjs'),    'utf8');
const renderChanged = stgRender !== prodRender;

const pages = [
  { stg: 'docs/stg/index.html',  prod: 'docs/index.html'  },
  { stg: 'docs/stg/venues.html', prod: 'docs/venues.html' },
];

const work = pages.map(p => {
  const stgSrc   = readFileSync(join(ROOT, p.stg), 'utf8');
  const promoted = promoteHtml(stgSrc);
  const prodSrc  = existsSync(join(ROOT, p.prod)) ? readFileSync(join(ROOT, p.prod), 'utf8') : '';
  return { ...p, promoted, changed: promoted !== prodSrc };
});

const anyHtmlChanged = work.some(w => w.changed);

if (!anyHtmlChanged && !renderChanged) {
  console.log('promote: stg/ matches production — nothing to do.');
  process.exit(0);
}

if (dryRun) {
  for (const w of work) {
    console.log(`promote (dry-run): ${w.prod.replace('docs/', '')} ${w.changed ? 'CHANGED' : 'unchanged'}`);
  }
  console.log(`promote (dry-run): render.mjs  ${renderChanged ? 'CHANGED' : 'unchanged'}`);
  process.exit(0);
}

for (const w of work) {
  if (w.changed) {
    writeFileSync(join(ROOT, w.prod), w.promoted);
    console.log(`promote: ${w.stg} → ${w.prod}`);
  }
}
if (renderChanged) {
  copyFileSync(join(ROOT, 'docs/stg/render.mjs'), join(ROOT, 'docs/render.mjs'));
  console.log('promote: docs/stg/render.mjs  → docs/render.mjs');
}
console.log('promote: done. Review the diff, then commit.');
