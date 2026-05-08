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
import {
  SEASON, ENTITY_ID, ENTITY_TYPE, SITE_URL, FINAL_ROUND,
  TEAM_SLUGS, VENUES, LCJRU_TEAM_IDS, MINIS_SLUGS, MINIS_SIBLINGS,
} from './config.mjs';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH  = join(ROOT, 'docs', 'fixtures.json');
const DIFF_PATH = join(ROOT, 'changes.txt');
const CFG_PATH  = join(ROOT, 'docs', 'config.js');

const GRAPHQL_URL = 'https://rugby-au-cms.graphcdn.app/';
const PAGE_SIZE   = 100;

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
    home: { id: item.homeTeam.teamId, name: item.homeTeam.name, score: item.homeTeam.score !== '' ? item.homeTeam.score : null, crest: item.homeTeam.crest },
    away: { id: item.awayTeam.teamId, name: item.awayTeam.name, score: item.awayTeam.score !== '' ? item.awayTeam.score : null, crest: item.awayTeam.crest },
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
  lines.push(`Full draw: ${SITE_URL}/`);
  return lines.join('\n').trim();
}

// ── venue display ─────────────────────────────────────────────────────────────

function displayLocation(rawVenue) {
  if (!rawVenue) return rawVenue;
  const clean = rawVenue.replace(/ (?:TT|M)\d+\s*\([^)]+\)$/, '').trim();
  const suburb = VENUES[clean]?.suburb;
  return suburb ? `${clean}, ${suburb}` : clean;
}

// ── ICS calendar generation ────────────────────────────────────────────────────

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
  // RFC 5545: fold at 75 octets, continuation lines begin with a space.
  // Walk backwards from each boundary to avoid splitting multi-byte UTF-8 sequences.
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let pos = 0;
  while (pos < bytes.length) {
    const limit = pos === 0 ? 75 : 74; // first line 75, continuation 74 (leading space takes 1)
    let end = Math.min(pos + limit, bytes.length);
    // Step back to a safe UTF-8 character boundary (continuation bytes are 0x80–0xBF)
    while (end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
    out.push(bytes.slice(pos, end).toString('utf8'));
    pos = end;
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
    `🔗 ${SITE_URL}/#${slug}`,
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
    `PRODID:-//LCJRU//Fixtures ${SEASON}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icsLine('X-WR-CALNAME', `LCJRU ${label} ${SEASON}`),
    icsLine('X-WR-CALDESC', `Lane Cove Junior Rugby — ${label} fixtures and results ${SEASON}`),
    'X-WR-TIMEZONE:Australia/Sydney',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE',
    'TZID:Australia/Sydney',
    'BEGIN:STANDARD',
    'TZNAME:AEST',
    'TZOFFSETFROM:+1100',
    'TZOFFSETTO:+1000',
    'DTSTART:19700405T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZNAME:AEDT',
    'TZOFFSETFROM:+1000',
    'TZOFFSETTO:+1100',
    'DTSTART:19701004T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
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
      const nextDay = icsDateOnly(new Date(new Date(match.dateTime).getTime() + 86400000).toISOString());
      lines.push(`DTSTART;VALUE=DATE:${dateKey}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay}`);
    }

    lines.push(icsLine('SUMMARY',     summary));
    lines.push(icsLine('LOCATION',    location));
    lines.push(icsLine('DESCRIPTION', description));
    lines.push(icsLine('URL',         `${SITE_URL}/#${slug}`));
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

  // Emit docs/config.js so HTML files share the same source of truth
  const configJs = [
    '// Generated by scripts/fetch-fixtures.mjs — do not edit directly.',
    '// Edit scripts/config.mjs and re-run the fetch script.',
    'window.LCJRU_CONFIG = {',
    `  SEASON: ${JSON.stringify(SEASON)},`,
    `  SITE_URL: ${JSON.stringify(SITE_URL)},`,
    `  FINAL_ROUND: ${FINAL_ROUND},`,
    `  TEAM_SLUGS: ${JSON.stringify(TEAM_SLUGS, null, 2).replace(/\n/g, '\n  ')},`,
    `  VENUES: ${JSON.stringify(VENUES, null, 2).replace(/\n/g, '\n  ')},`,
    '};',
    '',
  ].join('\n');
  writeFileSync(CFG_PATH, configJs);
  console.log('✓ Written docs/config.js');

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
