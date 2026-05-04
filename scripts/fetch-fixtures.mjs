/**
 * Fetches all LCJRU fixture and result data from the Rugby Xplorer GraphQL API,
 * diffs against the previous run to detect venue/time changes on upcoming games,
 * and writes docs/fixtures.json + changes.txt (empty when nothing changed).
 *
 * Endpoint: https://rugby-au-cms.graphcdn.app/
 * Entity:   Lane Cove JRU, entityId 30901
 *
 * Run:  node scripts/fetch-fixtures.mjs
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH  = join(ROOT, 'docs', 'fixtures.json');
const DIFF_PATH = join(ROOT, 'changes.txt');

const GRAPHQL_URL = 'https://rugby-au-cms.graphcdn.app/';
const ENTITY_ID   = 30901;
const ENTITY_TYPE = 'club';
const SEASON      = '2026';
const PAGE_SIZE   = 100;

const LCJRU_TEAM_IDS = [
  'ga3nagC9irHRNJXWn', // Lane Cove 10
  '4nA7pxpFZt6gbj347', // Lane Cove 11
  'LmZzP4t9h9bdYr9Pt', // Lane Cove 15
  'SafHgsHsRWsZmAHbq', // Lane Cove Blue 13
  'nXtZPbg5Pb9xgh6Rd', // Lane Cove Blue 6
  '52MoHPFgMFTPppk9H', // Lane Cove Blue 7
  '5SyzYzsjmbeaPZsXT', // Lane Cove Blue 8
  'BAczTuGAgyjokt4pJ', // Lane Cove Blue 9
  'AX6MBpn8Xva2AmC8N', // Lane Cove Gold 13
  '42ZRPX8ej8P9co4Ws', // Lane Cove Gold 14
  'wjBCCDfvXpx8QivYu', // Lane Cove Gold 6
  '84q7BEamwEAGPZgc2', // Lane Cove Gold 7
  'azWv34qmnBYrN7atm', // Lane Cove Gold 8
  'PyQredZ4NJS2JafcM', // Lane Cove Gold 9
  'mtDoyNMX26Bm94nuk', // Lane Cove/Lindfield 14
  'BPR2bFQZAuLK4CzLD', // Lane Cove/St Ives 12
];

const QUERY = `
query EntityFixturesAndResults(
  $entityId: Int, $entityType: String, $season: String,
  $comps: [CompInput], $teams: [String], $type: String,
  $skip: Int, $limit: Int
) {
  getEntityFixturesAndResults(
    season: $season comps: $comps teams: $teams
    entityId: $entityId entityType: $entityType
    type: $type limit: $limit skip: $skip
  ) {
    id compId compName dateTime group
    isLive isBye round roundType roundLabel
    season status venue sourceType matchLabel
    homeTeam { id name teamId score crest }
    awayTeam { id name teamId score crest }
  }
}`;

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchPage(type, skip) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
    body: JSON.stringify({
      operationName: 'EntityFixturesAndResults',
      variables: { season: SEASON, comps: [], teams: LCJRU_TEAM_IDS, type, skip, limit: PAGE_SIZE, entityId: ENTITY_ID, entityType: ENTITY_TYPE },
      query: QUERY,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${type} skip=${skip}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data.getEntityFixturesAndResults;
}

async function fetchAll(type) {
  const all = [];
  let skip = 0;
  while (true) {
    const page = await fetchPage(type, skip);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return all;
}

// ── normalise ─────────────────────────────────────────────────────────────────

function normalise(item) {
  const type = item.status === 'Result' ? 'result' : 'fixture';
  return {
    id: item.id,
    type,
    competition: item.compName,
    compId: item.compId,
    round: item.round,
    roundLabel: item.roundLabel || item.round,
    dateTime: item.dateTime,
    venue: item.venue,
    status: item.status,
    isLive: item.isLive,
    isBye: item.isBye,
    matchLabel: item.matchLabel || null,
    home: { id: item.homeTeam.teamId, name: item.homeTeam.name, score: item.homeTeam.score || null, crest: item.homeTeam.crest },
    away: { id: item.awayTeam.teamId, name: item.awayTeam.name, score: item.awayTeam.score || null, crest: item.awayTeam.crest },
  };
}

// ── diff ──────────────────────────────────────────────────────────────────────

function isLaneCove(team) {
  return team.name.toLowerCase().includes('lane cove') || team.crest?.includes('/30901.');
}

function lcTeamName(match) {
  const t = isLaneCove(match.home) ? match.home : match.away;
  // Keep age group and colour: "Lane Cove Gold 7" → "Gold 7", "Lane Cove/Lindfield 14" → "LC/Lindfield 14"
  return t.name
    .replace('Lane Cove/', 'LC/')
    .replace('Lane Cove ', '')
    .trim() || t.name;
}

function fmtDateSydney(isoString) {
  return new Date(isoString).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney',
  });
}

function fmtTimeSydney(isoString) {
  return new Date(isoString)
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })
    .replace(' am', 'am').replace(' pm', 'pm');
}

function detectChanges(oldData, newData) {
  // Only compare upcoming fixtures (type=fixture in new data)
  if (!oldData?.matches?.length) return []; // first run — nothing to diff

  const oldMap = new Map(
    oldData.matches.filter(m => m.type === 'fixture').map(m => [m.id, m])
  );
  const newUpcoming = newData.matches.filter(m => m.type === 'fixture');

  const changes = [];

  for (const newM of newUpcoming) {
    const oldM = oldMap.get(newM.id);
    if (!oldM) {
      changes.push({ kind: 'added', match: newM });
      continue;
    }
    if (oldM.venue !== newM.venue) {
      changes.push({ kind: 'venue', match: newM, from: oldM.venue, to: newM.venue });
    }
    if (oldM.dateTime !== newM.dateTime) {
      changes.push({ kind: 'time', match: newM, from: oldM.dateTime, to: newM.dateTime });
    }
  }

  // Fixtures that disappeared (cancelled / removed from draw)
  const newIds = new Set(newUpcoming.map(m => m.id));
  for (const [id, oldM] of oldMap) {
    if (!newIds.has(id)) {
      changes.push({ kind: 'removed', match: oldM });
    }
  }

  return changes;
}

function formatChanges(changes) {
  const lines = ['LCJRU Fixture Update', ''];
  for (const c of changes) {
    const { match } = c;
    const team = lcTeamName(match);
    const when = `${match.round} · ${fmtDateSydney(match.dateTime)}`;
    switch (c.kind) {
      case 'venue':
        lines.push(`📍 Venue change – ${team} · ${when}`);
        lines.push(`   Was: ${c.from}`);
        lines.push(`   Now: ${c.to}`);
        break;
      case 'time':
        lines.push(`🕐 Time change – ${team} · ${when}`);
        lines.push(`   Was: ${fmtTimeSydney(c.from)}`);
        lines.push(`   Now: ${fmtTimeSydney(c.to)}`);
        break;
      case 'added':
        lines.push(`➕ New fixture – ${team} · ${when}`);
        lines.push(`   ${match.venue}`);
        break;
      case 'removed':
        lines.push(`❌ Fixture removed – ${team} · ${when}`);
        break;
    }
    lines.push('');
  }
  lines.push('Full draw: https://denishoctor.github.io/lcjru-fixtures/');
  return lines.join('\n').trim();
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load existing data for diffing before we overwrite it
  const oldData = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, 'utf8'))
    : null;

  console.log(`Fetching LCJRU ${SEASON} fixtures and results…`);

  const [fixtures, results] = await Promise.all([
    fetchAll('fixtures'),
    fetchAll('results'),
  ]);

  console.log(`  fixtures: ${fixtures.length}`);
  console.log(`  results:  ${results.length}`);

  // Deduplicate (results take priority over fixtures at transition time)
  const seen = new Set();
  const combined = [];
  for (const item of [...results, ...fixtures]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      combined.push(normalise(item));
    }
  }
  combined.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  const byComp = {};
  for (const match of combined) {
    if (!byComp[match.compId]) byComp[match.compId] = { name: match.competition, matches: [] };
    byComp[match.compId].matches.push(match);
  }

  const output = {
    updated: new Date().toISOString(),
    season: SEASON,
    entityId: ENTITY_ID,
    totalMatches: combined.length,
    competitions: Object.values(byComp),
    matches: combined,
  };

  // Diff before writing
  const changes = detectChanges(oldData, output);

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`✓ Written ${combined.length} matches → docs/fixtures.json`);

  // Write changes.txt (always — empty string means "no changes" to the workflow)
  if (changes.length > 0) {
    const msg = formatChanges(changes);
    writeFileSync(DIFF_PATH, msg);
    console.log(`\n⚠️  ${changes.length} change(s) detected:\n`);
    console.log(msg);
  } else {
    writeFileSync(DIFF_PATH, '');
    console.log('✓ No changes to upcoming fixtures');
  }

  // Competition summary
  const comps = [...new Set(combined.map(m => m.competition))].sort();
  console.log('\nCompetition summary:');
  for (const comp of comps) {
    const ms = combined.filter(m => m.competition === comp);
    const done = ms.filter(m => m.type === 'result').length;
    console.log(`  ${comp.padEnd(40)} ${done}/${ms.length} played`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
