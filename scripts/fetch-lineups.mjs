/**
 * Fetches player lineup (team sheet) data for all LCJRU matches from the
 * Rugby Xplorer match-centre page HTML, extracting the __NEXT_DATA__ payload.
 *
 * Confirmed data path (from probe-lineup.mjs):
 *   pageProps.matchData.allMatchStatsSummary.lineUp
 *     .players[]    — starters (isHome distinguishes home vs away)
 *     .substitutes[] — bench players
 *   Each player: { name, shirtNumber, position, isHome, captainType }
 *   shirtNumber = jersey number printed on shirt (display)
 *   position    = rugby position number 1–15 (sort order)
 *
 * Caching: matches played > 15 days ago are locked (skip re-fetch) unless
 * --force-all is passed.
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

const LOCK_MS  = 15 * 24 * 60 * 60 * 1000;
const forceAll = process.argv.includes('--force-all');

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchLineup(matchId) {
  const url = `https://xplorer.rugby/lcjru-/match-centre/${matchId}?tab=Player-Lineup`;
  const res = await fetch(url, {
    headers: {
      'user-agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-AU,en;q=0.9',
      'origin':          'https://xplorer.rugby',
      'referer':         'https://xplorer.rugby/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!m) throw new Error('No __NEXT_DATA__ in response');

  const pageProps = JSON.parse(m[1])?.props?.pageProps ?? {};
  const lineUp = pageProps?.matchData?.allMatchStatsSummary?.lineUp;

  if (!lineUp) {
    // lineUp is null when no team sheet has been submitted yet
    return { home: [], away: [] };
  }

  const allPlayers = [
    ...(lineUp.players     ?? []),
    ...(lineUp.substitutes ?? []),
  ];

  const normalise = p => ({
    number:   p.shirtNumber ?? '',
    name:     p.name ?? '',
    position: p.position ?? '',
    captain:  p.captainType === 'captain',
    isSub:    parseInt(p.position) >= 16,
  });

  // Sort starters 1–15 then bench 16+ by position number
  const sort = arr => arr.slice().sort((a, b) => parseInt(a.position) - parseInt(b.position));

  const home = sort(allPlayers.filter(p => p.isHome  === true )).map(normalise);
  const away = sort(allPlayers.filter(p => p.isHome  === false)).map(normalise);

  return { home, away };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const existing = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : {};
  const now      = Date.now();

  const toFetch = fixtures.matches.filter(m => {
    if (m.isBye) return false;
    const gameMs   = new Date(m.dateTime).getTime();
    const isLocked = existing[m.id] && (now - gameMs) > LOCK_MS;
    return forceAll || !isLocked;
  });

  const locked = fixtures.matches.filter(m => !m.isBye).length - toFetch.length;
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
      if (!lineups[match.id]) {
        lineups[match.id] = { gameDateTime: match.dateTime, fetchedAt: null, home: [], away: [] };
      }
      errors++;
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(lineups, null, 2));
  console.log(`\n✓ Written ${Object.keys(lineups).length} entries → docs/lineups.json (fetched ${fetched}, errors ${errors})`);
}

main().catch(err => { console.error(err); process.exit(1); });
