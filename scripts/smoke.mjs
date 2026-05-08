/**
 * Local smoke test: starts an HTTP server over docs/ and verifies that
 * config.js, fixtures.json, index.html, and a sample .ics file all load
 * with expected content. Exits 0 on pass, 1 on fail.
 *
 * Run: node scripts/smoke.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.ics':  'text/calendar',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(DOCS, urlPath);
  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
console.log(`smoke: serving docs/ on ${base}`);

let failures = 0;

async function check(label, url, assertions) {
  try {
    const res = await fetch(url);
    const body = await res.text();
    let ok = true;
    for (const [desc, fn] of assertions) {
      if (!fn(res, body)) {
        console.error(`  FAIL [${label}] ${desc}`);
        failures++;
        ok = false;
      }
    }
    if (ok) console.log(`  pass [${label}]`);
  } catch (err) {
    console.error(`  FAIL [${label}] ${err.message}`);
    failures++;
  }
}

await check('config.js', `${base}/config.js`, [
  ['HTTP 200',           r      => r.status === 200],
  ['contains LCJRU_CONFIG', (_, b) => b.includes('LCJRU_CONFIG')],
]);

await check('fixtures.json', `${base}/fixtures.json`, [
  ['HTTP 200',                  r      => r.status === 200],
  ['has matches array',         (_, b) => { try { return Array.isArray(JSON.parse(b).matches); } catch { return false; } }],
  ['has updated field',         (_, b) => { try { return typeof JSON.parse(b).updated === 'string'; } catch { return false; } }],
  ['has 10+ matches',           (_, b) => { try { return JSON.parse(b).matches.length >= 10; } catch { return false; } }],
  ['contains Lane Cove team',   (_, b) => { try { return JSON.parse(b).matches.some(m => m.home?.name?.toLowerCase().includes('lane cove') || m.away?.name?.toLowerCase().includes('lane cove')); } catch { return false; } }],
]);

await check('index.html', `${base}/index.html`, [
  ['HTTP 200',           r      => r.status === 200],
  ['has #calendar div',  (_, b) => b.includes('id="calendar"')],
  ['loads config.js',    (_, b) => b.includes('config.js')],
  ['imports render.mjs', (_, b) => b.includes('render.mjs')],
]);

await check('render.mjs', `${base}/render.mjs`, [
  ['HTTP 200',           r      => r.status === 200],
  ['exports esc',        (_, b) => b.includes('export function esc')],
]);

await check('lineups.json', `${base}/lineups.json`, [
  ['HTTP 200',           r      => r.status === 200],
  ['is valid JSON',      (_, b) => { try { const d = JSON.parse(b); return typeof d === 'object' && d !== null; } catch { return false; } }],
]);

await check('u7-gold.ics', `${base}/u7-gold.ics`, [
  ['HTTP 200',           r      => r.status === 200],
  ['is iCalendar',       (_, b) => b.startsWith('BEGIN:VCALENDAR')],
]);

await check('stg/index.html', `${base}/stg/index.html`, [
  ['HTTP 200',           r      => r.status === 200],
  ['has #calendar div',  (_, b) => b.includes('id="calendar"')],
  ['fetches ../config',  (_, b) => b.includes('../config.js')],
  ['fetches ../fixtures',(_, b) => b.includes('../fixtures.json')],
]);

await check('stg/render.mjs', `${base}/stg/render.mjs`, [
  ['HTTP 200',           r      => r.status === 200],
  ['exports esc',        (_, b) => b.includes('export function esc')],
]);

server.close();

if (failures > 0) {
  console.error(`\nsmoke: ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nsmoke: all checks passed.');
}
