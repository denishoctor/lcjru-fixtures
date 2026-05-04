/**
 * Fetches all LCJRU fixture and result data from the Rugby Xplorer GraphQL API
 * and writes a clean JSON file to public/fixtures.json.
 *
 * Endpoint: https://rugby-au-cms.graphcdn.app/
 * Entity:   Lane Cove JRU, entityId 30901
 *
 * Run:  node scripts/fetch-fixtures.mjs
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const GRAPHQL_URL = 'https://rugby-au-cms.graphcdn.app/';
const ENTITY_ID = 30901;
const ENTITY_TYPE = 'club';
const SEASON = '2026';
const PAGE_SIZE = 100;

// All active LCJRU team IDs for 2026.
// To refresh for a new season: inspect the competitions list at
// https://xplorer.rugby/_next/data/<buildId>/lcjru-/fixtures-results.json?club=lcjru-
// and extract teams[] from entries where season === <year>.
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
      variables: {
        season: SEASON,
        comps: [],
        teams: LCJRU_TEAM_IDS,
        type,
        skip,
        limit: PAGE_SIZE,
        entityId: ENTITY_ID,
        entityType: ENTITY_TYPE,
      },
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

function normalise(item, type) {
  return {
    id: item.id,
    type,                          // "fixture" | "result"
    competition: item.compName,
    compId: item.compId,
    round: item.round,
    roundLabel: item.roundLabel || item.round,
    dateTime: item.dateTime,       // ISO 8601, e.g. "2026-05-03T00:50:00+00:00"
    venue: item.venue,
    status: item.status,           // "Fixture" | "Result"
    isLive: item.isLive,
    isBye: item.isBye,
    matchLabel: item.matchLabel || null,
    home: {
      id: item.homeTeam.teamId,
      name: item.homeTeam.name,
      score: item.homeTeam.score || null,
      crest: item.homeTeam.crest,
    },
    away: {
      id: item.awayTeam.teamId,
      name: item.awayTeam.name,
      score: item.awayTeam.score || null,
      crest: item.awayTeam.crest,
    },
  };
}

async function main() {
  console.log(`Fetching LCJRU ${SEASON} fixtures and results…`);

  const [fixtures, results] = await Promise.all([
    fetchAll('fixtures'),
    fetchAll('results'),
  ]);

  console.log(`  fixtures: ${fixtures.length}`);
  console.log(`  results:  ${results.length}`);

  // Deduplicate by id (a match may appear in both lists at transition time)
  const seen = new Set();
  const combined = [];
  for (const item of [...results, ...fixtures]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      combined.push(normalise(item, item.status === 'Result' ? 'result' : 'fixture'));
    }
  }

  // Sort chronologically
  combined.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  // Group by competition for the index
  const byComp = {};
  for (const match of combined) {
    if (!byComp[match.compId]) {
      byComp[match.compId] = { name: match.competition, matches: [] };
    }
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

  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fixtures.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`✓ Written ${combined.length} matches → public/fixtures.json`);

  // Summary table
  const comps = [...new Set(combined.map(m => m.competition))].sort();
  console.log('\nCompetition summary:');
  for (const comp of comps) {
    const ms = combined.filter(m => m.competition === comp);
    const done = ms.filter(m => m.type === 'result').length;
    console.log(`  ${comp.padEnd(40)} ${done}/${ms.length} played`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
