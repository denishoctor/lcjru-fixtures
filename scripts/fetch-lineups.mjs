/**
 * Fetches player lineup (team sheet) data for all LCJRU matches from the Rugby Xplorer
 * match-centre pages. Extracts __NEXT_DATA__ JSON embedded in the HTML, which contains
 * the full server-rendered page props including lineup data.
 *
 * Caching: lineups for matches played > 15 days ago are considered locked and skipped
 * unless --force-all is passed (used by the manual resync workflow).
 *
 * Run:  node scripts/fetch-lineups.mjs
 *       node scripts/fetch-lineups.mjs --force-all
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT          = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_PATH = join(ROOT, 'docs', 'fixtures.json');
const OUT_PATH      = join(ROOT, 'docs', 'lineups.json');

const LOCK_MS  = 15 * 24 * 60 * 60 * 1000; // 15 days — historic lineups won't change
const forceAll = process.argv.includes('--force-all');

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchLineup(matchId) {
  const url = `https://xplorer.rugby/lcjru-/match-centre/${matchId}?tab=Player-Lineup`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; lcjru-fixtures/1.0)',
      'accept':     'text/html,application/xhtml+xml',
      'origin':     'https://xplorer.rugby',
      'referer':    'https://xplorer.rugby/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!m) throw new Error('No __NEXT_DATA__ found in response HTML');

  const pageProps = JSON.parse(m[1])?.props?.pageProps ?? {};

  // Log available keys on first run so the accessor paths below can be verified/updated
  const knownKeys = Object.keys(pageProps);
  if (knownKeys.length) {
    console.log(`  [${matchId}] pageProps keys: ${knownKeys.join(', ')}`);
  }

  // ADAPT THESE PATHS after the first run confirms the actual __NEXT_DATA__ schema.
  // Common candidates: lineups.home/away, homeLineup/awayLineup, matchLineup.home/away
  const home = pageProps?.lineups?.home
    ?? pageProps?.matchLineup?.home
    ?? pageProps?.homeLineup
    ?? [];
  const away = pageProps?.lineups?.away
    ?? pageProps?.matchLineup?.away
    ?? pageProps?.awayLineup
    ?? [];

  return { home, away };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const existing = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : {};
  const now      = Date.now();

  // Determine which matches need fetching
  const toFetch = fixtures.matches.filter(m => {
    if (m.isBye) return false;
    const gameMs   = new Date(m.dateTime).getTime();
    const isLocked = existing[m.id] && (now - gameMs) > LOCK_MS;
    return forceAll || !isLocked;
  });

  const locked = fixtures.matches.length - fixtures.matches.filter(m => m.isBye).length - toFetch.length;
  console.log(`Fetching lineups: ${toFetch.length} matches (${locked} locked historic, forceAll=${forceAll})…`);

  const lineups = { ...existing };
  let fetched = 0, errors = 0;

  for (const match of toFetch) {
    try {
      const { home, away } = await fetchLineup(match.id);
      lineups[match.id] = {
        gameDateTime: match.dateTime,
        fetchedAt:    new Date().toISOString(),
        home,
        away,
      };
      console.log(`  ✓ ${match.id}: home=${home.length} away=${away.length}`);
      fetched++;
    } catch (err) {
      console.warn(`  ✗ ${match.id}: ${err.message}`);
      // Preserve any previously fetched data on transient errors
      if (!lineups[match.id]) {
        lineups[match.id] = { gameDateTime: match.dateTime, fetchedAt: null, home: [], away: [] };
      }
      errors++;
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(lineups, null, 2));
  console.log(`✓ Written ${Object.keys(lineups).length} entries → docs/lineups.json (fetched ${fetched}, errors ${errors})`);
}

main().catch(err => { console.error(err); process.exit(1); });
