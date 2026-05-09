import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAM_SLUGS } from './config.mjs';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');

const required = [
  'fixtures.json',
  'lineups.json',
  'events.json',
  'config.js',
  'render.mjs',
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-512-maskable.png',
  'assets/apple-touch-icon-180.png',
  ...Object.keys(TEAM_SLUGS).map(slug => `${slug}.ics`),
];

let missing = 0;
for (const file of required) {
  if (!fs.existsSync(path.join(DOCS, file))) {
    console.error(`MISSING: docs/${file}`);
    missing++;
  }
}

if (missing > 0) {
  console.error(`\n${missing} required file(s) missing from docs/. Run: node scripts/fetch-fixtures.mjs`);
  process.exit(1);
} else {
  console.log('check: all required files present.');
}
