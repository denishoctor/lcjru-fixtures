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

// ── venue display (mirrored in docs/index.html) ───────────────────────────────

const VENUE_SUBURBS = {
  'Bantry Bay Oval':                 'Bantry Bay',
  'Beauchamp Park':                  'West Pennant Hills',
  'Eric Tweedale Field':             'Granville',
  'Hassall Park':                    'Rydalmere',
  'James Morgan Reserve':            'Kellyville',
  'Keirle Park':                     'Balmain',
  'Lofberg Oval':                    'North Ryde',
  'Mark Taylor Oval':                'Waitara',
  'Mark Taylor Oval (Waitara Oval)': 'Waitara',
  'Melwood Oval':                    'Putney',
  'Nagle Park':                      'Balmain',
  'North Narrabeen Reserve':         'Narrabeen',
  'Peakhurst Oval':                  'Peakhurst',
  'Porter Reserve':                  'Meadowbank',
  'Rawson Oval':                     'Penshurst',
  'Ryde Park':                       'Ryde',
  'Tantallon Oval':                  'Lane Cove North',
  'Taplin Park':                     'Pemulwuy',
  'Tryon Oval':                      'Ryde',
  'Tunks Park':                      'Cammeray',
  'Wakehurst Rugby Park':            'Brookvale',
  'Woollahra Oval':                  'Woollahra',
};

function displayLocation(rawVenue) {
  if (!rawVenue) return rawVenue;
  const clean = rawVenue.replace(/ (?:TT|M)\d+\s*\([^)]+\)$/, '').trim();
  const suburb = VENUE_SUBURBS[clean];
  return suburb ? `${clean}, ${suburb}` : clean;
}

// ── ICS calendar generation ────────────────────────────────────────────────────

const TEAM_SLUGS = {
  'u6-gold':  'wjBCCDfvXpx8QivYu',
  'u6-blue':  'nXtZPbg5Pb9xgh6Rd',
  'u7-gold':  '84q7BEamwEAGPZgc2',
  'u7-blue':  '52MoHPFgMFTPppk9H',
  'u8-gold':  'azWv34qmnBYrN7atm',
  'u8-blue':  '5SyzYzsjmbeaPZsXT',
  'u9-gold':  'PyQredZ4NJS2JafcM',
  'u9-blue':  'BAczTuGAgyjokt4pJ',
  'u10':      'ga3nagC9irHRNJXWn',
  'u11':      '4nA7pxpFZt6gbj347',
  'u12':      'BPR2bFQZAuLK4CzLD',
  'u13-gold': 'AX6MBpn8Xva2AmC8N',
  'u13-blue': 'SafHgsHsRWsZmAHbq',
  'u14-gold': '42ZRPX8ej8P9co4Ws',
  'u14':      'mtDoyNMX26Bm94nuk',
  'u15':      'LmZzP4t9h9bdYr9Pt',
};

const MINIS_SLUGS    = new Set(['u6-gold','u6-blue','u7-gold','u7-blue','u8-gold','u8-blue','u9-gold','u9-blue']);
const MINIS_SIBLINGS = {
  'u6-gold': 'u6-blue', 'u6-blue': 'u6-gold',
  'u7-gold': 'u7-blue', 'u7-blue': 'u7-gold',
  'u8-gold': 'u8-blue', 'u8-blue': 'u8-gold',
  'u9-gold': 'u9-blue', 'u9-blue': 'u9-gold',
};

function slugToLabel(slug) {
  return slug.split('-').map((p, i) => i === 0 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// iCal date helpers
function icsLocalDate(isoString) {
  // Returns YYYYMMDDTHHmmss in Australia/Sydney timezone
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(isoString)).map(x => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

function icsDateOnly(isoString) {
  // Returns YYYYMMDD in Australia/Sydney timezone
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(isoString)).map(x => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

function icsNow() {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

function icsEscape(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsFold(line) {
  // RFC 5545: fold at 75 octets, continuation lines begin with a space
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let pos = 0;
  while (pos < bytes.length) {
    const chunk = pos === 0 ? 75 : 74; // first line 75, continuation 74 (space takes 1)
    out.push(bytes.slice(pos, pos + chunk).toString('utf8'));
    pos += chunk;
  }
  return out.join('\r\n ');
}

function icsLine(key, value) {
  return icsFold(`${key}:${value}`);
}

function buildDescription(match, slug, lcTeam, opponent, loc, sibMatch) {
  const roundNum  = (match.round || '').replace('Round ', '');
  const date      = fmtDateSydney(match.dateTime);
  const time      = fmtTimeSydney(match.dateTime);
  const hasTime   = time !== '12:00am';

  const parts = [
    `🏉 ${lcTeam.name} vs ${opponent.name}`,
    `📍 ${loc}`,
    `📅 Round ${roundNum} · ${date}${hasTime ? ' · ' + time + ' AEST' : ''}`,
    `🏆 ${match.competition}`,
    '',
    'ℹ️ Venues and times may change. This calendar updates automatically',
    '(Apple Calendar: ~every hour · Google Calendar: up to 24 hrs after a change)',
    '',
    `🔗 https://denishoctor.github.io/lcjru-fixtures/#${slug}`,
  ];

  if (sibMatch) {
    const sibLcTeam  = isLaneCove(sibMatch.home) ? sibMatch.home : sibMatch.away;
    const sibOpp     = isLaneCove(sibMatch.home) ? sibMatch.away : sibMatch.home;
    const sibLoc     = displayLocation(sibMatch.venue);
    const sibTime    = fmtTimeSydney(sibMatch.dateTime);
    const sibHasTime = sibTime !== '12:00am';
    parts.push('');
    parts.push('---');
    parts.push(`Also playing today — ${sibLcTeam.name}:`);
    parts.push(`📍 ${sibLoc}${sibHasTime ? '  ⏰ ' + sibTime : ''}  vs ${sibOpp.name}`);
    parts.push('(Their separate game — come cheer them on!)');
  }

  return parts.join('\n');
}

function generateICS(slug, teamId, allMatches, updatedISO) {
  const label      = slugToLabel(slug);
  const isMinis    = MINIS_SLUGS.has(slug);
  const durMin     = isMinis ? 60 : 90;
  const sibSlug    = MINIS_SIBLINGS[slug] || null;
  const sibId      = sibSlug ? TEAM_SLUGS[sibSlug] : null;

  const matches = allMatches.filter(m => m.home.id === teamId || m.away.id === teamId);

  // Build date→matches index for sibling lookups
  const sibByDate = new Map();
  if (sibId) {
    for (const m of allMatches) {
      if (m.home.id === sibId || m.away.id === sibId) {
        const key = icsDateOnly(m.dateTime);
        if (!sibByDate.has(key)) sibByDate.set(key, []);
        sibByDate.get(key).push(m);
      }
    }
  }

  const dtstamp = icsNow();
  const lastMod = updatedISO.replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LCJRU//Fixtures 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icsLine('X-WR-CALNAME', `LCJRU ${label} 2026`),
    icsLine('X-WR-CALDESC', `Lane Cove Junior Rugby — ${label} fixtures and results 2026`),
    'X-WR-TIMEZONE:Australia/Sydney',
  ];

  for (const match of matches) {
    const lcTeam   = isLaneCove(match.home) ? match.home : match.away;
    const opponent = isLaneCove(match.home) ? match.away : match.home;
    const loc      = displayLocation(match.venue);
    const roundNum = (match.round || '').replace('Round ', '');
    const timeStr  = fmtTimeSydney(match.dateTime);
    const hasTime  = timeStr !== '12:00am';
    const dateKey  = icsDateOnly(match.dateTime);
    const sibMatch = (sibByDate.get(dateKey) || [])[0] || null;

    const summary     = icsEscape(`${label} vs ${opponent.name} | RND ${roundNum}`);
    const description = icsEscape(buildDescription(match, slug, lcTeam, opponent, loc, sibMatch));
    const location    = icsEscape(`${loc}, Sydney NSW`);

    lines.push('BEGIN:VEVENT');
    lines.push(icsLine('UID',           `lcjru-${match.id}-${slug}@lcjru.github.io`));
    lines.push('SEQUENCE:0');
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`LAST-MODIFIED:${lastMod}`);

    if (hasTime) {
      const localDt = icsLocalDate(match.dateTime);
      const endDt   = icsLocalDate(new Date(new Date(match.dateTime).getTime() + durMin * 60000).toISOString());
      lines.push(`DTSTART;TZID=Australia/Sydney:${localDt}`);
      lines.push(`DTEND;TZID=Australia/Sydney:${endDt}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateKey}`);
      lines.push(`DTEND;VALUE=DATE:${dateKey}`);
    }

    lines.push(icsLine('SUMMARY',     summary));
    lines.push(icsLine('LOCATION',    location));
    lines.push(icsLine('DESCRIPTION', description));
    lines.push(icsLine('URL',         `https://denishoctor.github.io/lcjru-fixtures/#${slug}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
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

  // Generate per-team ICS calendar feeds
  for (const [slug, teamId] of Object.entries(TEAM_SLUGS)) {
    const ics = generateICS(slug, teamId, combined, output.updated);
    writeFileSync(join(ROOT, 'docs', `${slug}.ics`), ics);
  }
  console.log(`✓ Written ${Object.keys(TEAM_SLUGS).length} ICS feeds → docs/*.ics`);

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
