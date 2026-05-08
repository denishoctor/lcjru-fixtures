/**
 * Fetches player lineup (team sheet) data for all LCJRU matches.
 *
 * Strategy: Rugby Xplorer uses Next.js. The Player-Lineup tab may be
 * client-side rendered, in which case __NEXT_DATA__ won't contain players.
 * We therefore try TWO approaches:
 *
 *   1. GraphQL — same API as fetch-fixtures.mjs, requesting squad/players
 *      fields on homeTeam/awayTeam (may or may not exist in the schema).
 *
 *   2. HTML scrape — fetch the match-centre page with ?tab=Player-Lineup
 *      and parse __NEXT_DATA__.  Dumps the full pageProps structure on the
 *      first match so we can identify the correct field paths.
 *
 * Caching: matches played > 15 days ago are considered locked and skipped
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

const LOCK_MS    = 15 * 24 * 60 * 60 * 1000;
const forceAll   = process.argv.includes('--force-all');
const GRAPHQL_URL = 'https://rugby-au-cms.graphcdn.app/';

// ── approach 1: GraphQL ───────────────────────────────────────────────────────

const LINEUP_QUERY = `
query GetMatchLineup($matchId: String!) {
  getMatch(matchId: $matchId) {
    id
    homeTeam {
      id name teamId
      players { id name number position }
      squad   { id name number position }
    }
    awayTeam {
      id name teamId
      players { id name number position }
      squad   { id name number position }
    }
  }
}`;

async function fetchViaGraphQL(matchId) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin':  'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
    body: JSON.stringify({
      operationName: 'GetMatchLineup',
      variables: { matchId },
      query: LINEUP_QUERY,
    }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) {
    const msg = json.errors.map(e => e.message).join('; ');
    throw new Error(`GraphQL error: ${msg}`);
  }
  const match = json.data?.getMatch;
  if (!match) throw new Error('GraphQL: no getMatch in response');

  const extract = team =>
    (team?.players ?? team?.squad ?? []).map(p => ({
      number:   p.number ?? '',
      name:     p.name   ?? '',
      position: p.position ?? '',
    }));

  return { home: extract(match.homeTeam), away: extract(match.awayTeam) };
}

// ── approach 2: HTML scrape ───────────────────────────────────────────────────

let dumpedPageProps = false;

async function fetchViaHTML(matchId) {
  const url = `https://xplorer.rugby/lcjru-/match-centre/${matchId}?tab=Player-Lineup`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-AU,en;q=0.9',
      'origin':  'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
  });
  if (!res.ok) throw new Error(`HTML HTTP ${res.status}`);
  const html = await res.text();

  // Dump first 300 chars to confirm we got the actual page (not a redirect/error)
  if (!dumpedPageProps) {
    console.log(`  [HTML preview] ${html.slice(0, 300).replace(/\s+/g, ' ')}`);
    dumpedPageProps = true;
  }

  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!m) throw new Error('No __NEXT_DATA__ in HTML response');

  const nextData = JSON.parse(m[1]);
  const pageProps = nextData?.props?.pageProps ?? {};

  // Always log all top-level pageProps keys so we can identify the correct path
  console.log(`  [${matchId}] pageProps keys: ${Object.keys(pageProps).sort().join(', ') || '(empty)'}`);

  // Dump the full structure of the first match's pageProps for inspection
  if (!dumpedPageProps) {
    console.log(`  [${matchId}] full pageProps (truncated):\n${JSON.stringify(pageProps, null, 2).slice(0, 2000)}`);
  }

  // Try every plausible path — update once the correct one is confirmed from logs
  const home = pageProps?.lineups?.home
    ?? pageProps?.lineups?.homeTeam
    ?? pageProps?.matchLineup?.home
    ?? pageProps?.matchLineup?.homeTeam
    ?? pageProps?.match?.homeTeam?.players
    ?? pageProps?.match?.homeTeam?.squad
    ?? pageProps?.homeLineup
    ?? pageProps?.homeSquad
    ?? pageProps?.players?.home
    ?? [];
  const away = pageProps?.lineups?.away
    ?? pageProps?.lineups?.awayTeam
    ?? pageProps?.matchLineup?.away
    ?? pageProps?.matchLineup?.awayTeam
    ?? pageProps?.match?.awayTeam?.players
    ?? pageProps?.match?.awayTeam?.squad
    ?? pageProps?.awayLineup
    ?? pageProps?.awaySquad
    ?? pageProps?.players?.away
    ?? [];

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
    let home = [], away = [], method = '?';

    // Try GraphQL first (faster, more reliable if the query exists in schema)
    try {
      ({ home, away } = await fetchViaGraphQL(match.id));
      method = 'graphql';
    } catch (gqlErr) {
      console.log(`  [${match.id}] GraphQL failed (${gqlErr.message}), trying HTML…`);
      try {
        ({ home, away } = await fetchViaHTML(match.id));
        method = 'html';
      } catch (htmlErr) {
        console.warn(`  ✗ ${match.id}: HTML also failed (${htmlErr.message})`);
        if (!lineups[match.id]) {
          lineups[match.id] = { gameDateTime: match.dateTime, fetchedAt: null, home: [], away: [] };
        }
        errors++;
        continue;
      }
    }

    lineups[match.id] = {
      gameDateTime: match.dateTime,
      fetchedAt:    new Date().toISOString(),
      method,
      home,
      away,
    };
    console.log(`  ✓ ${match.id} [${method}]: home=${home.length} away=${away.length}`);
    fetched++;
  }

  writeFileSync(OUT_PATH, JSON.stringify(lineups, null, 2));
  console.log(`\n✓ Written ${Object.keys(lineups).length} entries → docs/lineups.json (fetched ${fetched}, errors ${errors})`);
}

main().catch(err => { console.error(err); process.exit(1); });
