/**
 * Promote docs/stg/ to production (docs/).
 *
 * Copies stg/index.html → index.html, rewriting ../ data paths back to ./
 * Copies stg/render.mjs → render.mjs if it differs from the current production copy.
 *
 * Run: node scripts/promote.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun  = process.argv.includes('--dry-run');

const stgHtml   = readFileSync(join(ROOT, 'docs/stg/index.html'),  'utf8');
const stgRender = readFileSync(join(ROOT, 'docs/stg/render.mjs'),  'utf8');
const prodHtml  = readFileSync(join(ROOT, 'docs/index.html'),      'utf8');
const prodRender = readFileSync(join(ROOT, 'docs/render.mjs'),     'utf8');

// Rewrite ../  data paths back to ./ for production
const promotedHtml = stgHtml
  .replace('<script src="../config.js">', '<script src="./config.js">')
  .replace("const FIXTURES_URL = '../fixtures.json';", "const FIXTURES_URL = './fixtures.json';")
  .replace("fetch('../lineups.json')", "fetch('lineups.json')")
  .replace("fetch('../events.json')", "fetch('./events.json')");

const htmlChanged   = promotedHtml !== prodHtml;
const renderChanged = stgRender    !== prodRender;

if (!htmlChanged && !renderChanged) {
  console.log('promote: stg/ matches production — nothing to do.');
  process.exit(0);
}

if (dryRun) {
  console.log(`promote (dry-run): index.html ${htmlChanged ? 'CHANGED' : 'unchanged'}`);
  console.log(`promote (dry-run): render.mjs  ${renderChanged ? 'CHANGED' : 'unchanged'}`);
  process.exit(0);
}

if (htmlChanged) {
  writeFileSync(join(ROOT, 'docs/index.html'), promotedHtml);
  console.log('promote: docs/stg/index.html → docs/index.html');
}
if (renderChanged) {
  copyFileSync(join(ROOT, 'docs/stg/render.mjs'), join(ROOT, 'docs/render.mjs'));
  console.log('promote: docs/stg/render.mjs  → docs/render.mjs');
}
console.log('promote: done. Review the diff, then commit.');
