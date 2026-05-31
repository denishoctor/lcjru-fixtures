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

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import {
  SEASON, ENTITY_ID, ENTITY_TYPE, SITE_URL, FINAL_ROUND,
  TEAM_SLUGS, VENUES, LCJRU_TEAM_IDS, MINIS_SLUGS, MINIS_SIBLINGS,
  VENUE_OVERRIDES,
} from './config.mjs';
import { EVENTS } from './events.mjs';
import { parseVenue, isGameEvent } from '../docs/render.mjs';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH  = join(ROOT, 'docs', 'fixtures.json');
const DIFF_PATH = join(ROOT, 'changes.txt');
const CFG_PATH  = join(ROOT, 'docs', 'config.js');
const SEQ_PATH  = join(ROOT, '.ics-sequence.json');

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

async function withRetry(fn, attempts = 3) {
  let delay = 2000;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      if (i === attempts - 1) throw err;
      console.warn(`  retry ${i + 1}/${attempts - 1} after ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

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
    const page = await withRetry(() => fetchPage(type, skip));
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return all;
}

// ── normalise ─────────────────────────────────────────────────────────────────

export function normalise(item) {
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

// ── venue overrides ───────────────────────────────────────────────────────────

// Applies the VENUE_OVERRIDES rules (config.mjs) for last-minute ground changes
// the SJRU feed may not yet reflect. For each match a rule matches, rewrites the
// `venue` to the corrected ground and tags it with `venueChange = { from, note }`
// so the UI can flag the move. Mutates and returns the same array.
//
// `setBase` swaps only the ground name and keeps the pitch suffix
// ("Tantallon Oval TT3 (U6/U7)" → "Hassall Park TT3 (U6/U7)") so the TT field
// — which parents rely on to find their game — survives; `setVenue` replaces
// the whole string for the rare case where the suffix shouldn't carry over.
//
// Idempotent and self-deactivating: a `setBase` rewrite removes the
// `venueIncludes` substring, so re-running (or a feed that has caught up) no
// longer matches; the `newVenue === m.venue` guard covers `setVenue`. Either
// way there's no spurious change notification and no double-tagging. A rule is
// skipped once its `expires` has passed.
export function applyVenueOverrides(matches, overrides = VENUE_OVERRIDES, now = new Date()) {
  for (const rule of overrides) {
    if (rule.expires && now >= new Date(rule.expires)) continue;
    for (const m of matches) {
      if (rule.venueIncludes && !(m.venue || '').includes(rule.venueIncludes)) continue;
      if (rule.compIncludes && !rule.compIncludes.some(s => (m.competition || '').includes(s))) continue;
      if (rule.teamIds && !rule.teamIds.includes(m.home.id) && !rule.teamIds.includes(m.away.id)) continue;
      if (rule.dateFrom && !(m.dateTime >= rule.dateFrom)) continue;
      if (rule.dateTo && !(m.dateTime < rule.dateTo)) continue;
      const newVenue = rule.setBase
        ? (m.venue || '').replace(rule.venueIncludes, rule.setBase)
        : rule.setVenue;
      if (newVenue === m.venue) continue; // already corrected — don't re-tag
      m.venueChange = { from: m.venue, note: rule.note };
      m.venue = newVenue;
    }
  }
  return matches;
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
  const { display, pitch, pitchNote, base } = parseVenue(rawVenue, VENUES);
  const note = pitchNote ? ` (${pitchNote})` : '';
  if (!pitch) return display + note;
  // Sandwich the pitch (TT6, M2, Field 1, …) between the venue name and suburb so
  // calendar events still show "which field" — geocoders fall back to the base name.
  // The bracketed note (e.g. "(Front)") rides along after the pitch.
  const suburb = base ? VENUES[base]?.suburb : null;
  return suburb && base ? `${base} ${pitch}${note}, ${suburb}` : `${display} ${pitch}${note}`;
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

// ── ICS SEQUENCE tracking ───────────────────────────────────────────────────
// Calendar clients (Google in particular) decide whether to overwrite a cached
// event by comparing iCal SEQUENCE — a per-UID revision counter that must only
// ever increase, and only when the event's content actually changes. A fixed
// SEQUENCE:0 means a re-poll can keep showing a stale venue/time. We persist a
// {uid: {seq, hash}} map (.ics-sequence.json) across runs: when an event's
// content hash changes, its SEQUENCE bumps; otherwise it holds. DTSTAMP /
// LAST-MODIFIED are deliberately excluded from the hash so per-run timestamp
// churn never inflates SEQUENCE.

function icsContentHash(parts) {
  return createHash('sha1').update(parts.join(' ')).digest('hex').slice(0, 16);
}

// Returns the SEQUENCE for `uid` given its current content `hash`, updating the
// shared `state` map in place. New UID → 0; unchanged content → prior seq;
// changed content → prior seq + 1.
export function icsSequence(state, uid, hash) {
  const prev = state[uid];
  if (!prev) { state[uid] = { seq: 0, hash }; return 0; }
  if (prev.hash === hash) return prev.seq;
  prev.seq += 1;
  prev.hash = hash;
  return prev.seq;
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

// ── events → VEVENT ──────────────────────────────────────────────────────────
// Two output paths:
//   • Game-variant events (round, friendly, gala) go into the per-team ICS feed
//     for each team listed under `teams`. They behave like Xplorer fixtures and
//     subscribers see them automatically.
//   • All other events (Mother's Day, Waratahs, Bathurst Tour, presentation
//     day, holiday notes, etc.) get a per-event ICS file at docs/events/<id>.ics
//     so users can opt in to the ones they care about — avoids the 16×
//     duplication that would happen if a parent subscribed to multiple teams.

function gameEventsForTeam(slug, teamId, fixtureMatches) {
  return EVENTS.filter(e => {
    if (!isGameEvent(e)) return false;
    if (e.status === 'cancelled' || e.status === 'completed') return false;
    if (!e.teams?.includes('*') && !e.teams?.includes(slug)) return false;
    if (e.xplorerRound) {
      const covered = fixtureMatches.some(m =>
        (m.home.id === teamId || m.away.id === teamId) && m.round === e.xplorerRound
      );
      if (covered) return false;
    }
    return true;
  });
}

// Special events live in their own per-event .ics files. Notes (no rugby /
// holidays) stay website-only — they're announcements, not calendar entries.
function specialEventsForExport() {
  return EVENTS.filter(e =>
    e.type === 'event' && !isGameEvent(e) &&
    e.status !== 'cancelled' && e.status !== 'completed'
  );
}

// Default duration in minutes for an event without an explicit end time.
function eventDurationMinutes(event) {
  if (event.variant === 'round')    return 60;
  if (event.variant === 'friendly') return 60;
  if (event.variant === 'gala')     return 240;
  return 120;
}

function eventIcon(event) {
  if (event.type === 'note')        return '📌';
  if (event.variant === 'round')    return '🏉';
  if (event.variant === 'friendly') return '🏉';
  if (event.variant === 'gala')     return '🏆';
  return '🎉';
}

function fmtEventDate(date) {
  // "2026-05-10" → "Sun, 10 May" (interpret as a calendar date, no TZ math)
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

function fmtEventTime(time24) {
  // "14:00" → "2:00pm"
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

function eventStartLocal(date, time) {
  return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
}

function eventEndLocal(date, time, durationMin) {
  // Add minutes to the wall-clock time; both DTSTART and DTEND carry
  // TZID=Australia/Sydney so we don't need a UTC conversion here.
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi]    = time.split(':').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi + durationMin));
  const p = n => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00`;
}

function eventDateOnly(date) {
  return date.replace(/-/g, '');
}

function eventNextDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const p = n => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}${p(next.getUTCMonth() + 1)}${p(next.getUTCDate())}`;
}

function buildEventDescription(event, slug) {
  const parts = [`${eventIcon(event)} ${event.title}`];

  const loc = displayLocation(event.venue);
  if (loc) parts.push(`📍 ${loc}`);

  parts.push(`📅 ${fmtEventDate(event.date)}${event.time ? ' · ' + fmtEventTimeRange(event) + ' AEST' : ''}`);

  if (event.description) {
    parts.push('');
    parts.push(event.description);
  }

  const d = event.details;
  if (d?.body) {
    parts.push('');
    parts.push(d.body);
  }
  if (Array.isArray(d?.highlights) && d.highlights.length) {
    parts.push('');
    for (const h of d.highlights) parts.push(`• ${h}`);
  }
  if (Array.isArray(d?.steps) && d.steps.length) {
    parts.push('');
    d.steps.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
  }
  if (d?.cta?.label && d?.cta?.url) {
    parts.push('');
    parts.push(`${d.cta.label}: ${d.cta.url}`);
  }

  parts.push('');
  parts.push('ℹ️ Venues and times may change. This calendar updates automatically');
  parts.push('(Apple Calendar: ~every hour · Google Calendar: up to 24 hrs after a change)');
  parts.push('');
  parts.push(`🔗 ${SITE_URL}/#${slug}`);

  return parts.join('\n');
}

function fmtEventTimeRange(event) {
  return event.endTime
    ? `${fmtEventTime(event.time)} – ${fmtEventTime(event.endTime)}`
    : fmtEventTime(event.time);
}

export function generateICS(slug, teamId, allMatches, updatedISO, seqState = {}) {
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

    let dtStartLine, dtEndLine;
    if (hasTime) {
      const localDt = icsLocalDate(match.dateTime);
      const endDt   = icsLocalDate(new Date(new Date(match.dateTime).getTime() + durMin * 60000).toISOString());
      dtStartLine = `DTSTART;TZID=Australia/Sydney:${localDt}`;
      dtEndLine   = `DTEND;TZID=Australia/Sydney:${endDt}`;
    } else {
      const nextDay = icsDateOnly(new Date(new Date(match.dateTime).getTime() + 86400000).toISOString());
      dtStartLine = `DTSTART;VALUE=DATE:${dateKey}`;
      dtEndLine   = `DTEND;VALUE=DATE:${nextDay}`;
    }

    const uid = `lcjru-${match.id}-${slug}@lcjru.github.io`;
    const seq = icsSequence(seqState, uid, icsContentHash([dtStartLine, dtEndLine, summary, location, description]));

    lines.push('BEGIN:VEVENT');
    lines.push(icsLine('UID',           uid));
    lines.push(`SEQUENCE:${seq}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`LAST-MODIFIED:${lastMod}`);
    lines.push(dtStartLine);
    lines.push(dtEndLine);
    lines.push(icsLine('SUMMARY',     summary));
    lines.push(icsLine('LOCATION',    location));
    lines.push(icsLine('DESCRIPTION', description));
    lines.push(icsLine('URL',         `${SITE_URL}/#${slug}`));
    lines.push('END:VEVENT');
  }

  for (const event of gameEventsForTeam(slug, teamId, matches)) {
    const loc         = displayLocation(event.venue);
    const summary     = icsEscape(event.title);
    const location    = icsEscape(loc ? `${loc}, Sydney NSW` : '');
    const description = icsEscape(buildEventDescription(event, slug));
    const url         = event.details?.cta?.url || `${SITE_URL}/#${slug}`;
    const status      = event.status === 'tentative' ? 'TENTATIVE'
                      : event.status === 'confirmed' ? 'CONFIRMED'
                      : null;

    lines.push('BEGIN:VEVENT');
    const evUid = `lcjru-event-${event.id}-${slug}@lcjru.github.io`;
    lines.push(icsLine('UID', evUid));

    let startLine, endLine;
    if (event.time) {
      const startDt = eventStartLocal(event.date, event.time);
      const endDt   = event.endTime
        ? eventStartLocal(event.date, event.endTime)
        : eventEndLocal(event.date, event.time, eventDurationMinutes(event));
      startLine = `DTSTART;TZID=Australia/Sydney:${startDt}`;
      endLine   = `DTEND;TZID=Australia/Sydney:${endDt}`;
    } else {
      startLine = `DTSTART;VALUE=DATE:${eventDateOnly(event.date)}`;
      endLine   = `DTEND;VALUE=DATE:${eventNextDate(event.date)}`;
    }

    const evSeq = icsSequence(seqState, evUid, icsContentHash([startLine, endLine, summary, location, description, status || '']));

    lines.push(`SEQUENCE:${evSeq}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`LAST-MODIFIED:${lastMod}`);
    lines.push(startLine);
    lines.push(endLine);
    lines.push(icsLine('SUMMARY',     summary));
    lines.push(icsLine('LOCATION',    location));
    lines.push(icsLine('DESCRIPTION', description));
    lines.push(icsLine('URL',         url));
    if (status) lines.push(`STATUS:${status}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// Per-event single-VEVENT calendar download. UID is stable and slug-free so
// users can re-import without duplicate entries piling up.
export function generateEventICS(event, updatedISO, seqState = {}) {
  const dtstamp = icsNow();
  const lastMod = updatedISO.replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const loc         = displayLocation(event.venue);
  const summary     = icsEscape(event.title);
  const location    = icsEscape(loc ? `${loc}, Sydney NSW` : '');
  const description = icsEscape(buildEventDescriptionForExport(event));
  const url         = event.details?.cta?.url || `${SITE_URL}/`;
  const status      = event.status === 'tentative' ? 'TENTATIVE'
                    : event.status === 'confirmed' ? 'CONFIRMED'
                    : null;

  const uid = `lcjru-event-${event.id}@lcjru.github.io`;
  const seq = icsSequence(seqState, uid, icsContentHash([
    String(event.date), String(event.time ?? ''), String(event.endTime ?? ''),
    summary, location, description, status ?? '',
  ]));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//LCJRU//Events ${SEASON}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icsLine('X-WR-CALNAME', `LCJRU — ${event.title}`),
    'X-WR-TIMEZONE:Australia/Sydney',
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
    'BEGIN:VEVENT',
    icsLine('UID', uid),
    `SEQUENCE:${seq}`,
    `DTSTAMP:${dtstamp}`,
    `LAST-MODIFIED:${lastMod}`,
  ];

  if (event.time) {
    const startDt = eventStartLocal(event.date, event.time);
    const endDt   = event.endTime
      ? eventStartLocal(event.date, event.endTime)
      : eventEndLocal(event.date, event.time, eventDurationMinutes(event));
    lines.push(`DTSTART;TZID=Australia/Sydney:${startDt}`);
    lines.push(`DTEND;TZID=Australia/Sydney:${endDt}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${eventDateOnly(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${eventNextDate(event.date)}`);
  }

  lines.push(icsLine('SUMMARY',     summary));
  lines.push(icsLine('LOCATION',    location));
  lines.push(icsLine('DESCRIPTION', description));
  lines.push(icsLine('URL',         url));
  if (status) lines.push(`STATUS:${status}`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// Stand-alone description (no team-specific deep link, since this file is
// shared across all subscribers).
function buildEventDescriptionForExport(event) {
  const parts = [`${eventIcon(event)} ${event.title}`];

  const loc = displayLocation(event.venue);
  if (loc) parts.push(`📍 ${loc}`);

  parts.push(`📅 ${fmtEventDate(event.date)}${event.time ? ' · ' + fmtEventTimeRange(event) + ' AEST' : ''}`);

  if (event.description) {
    parts.push('');
    parts.push(event.description);
  }

  const d = event.details;
  if (d?.body) {
    parts.push('');
    parts.push(d.body);
  }
  if (Array.isArray(d?.highlights) && d.highlights.length) {
    parts.push('');
    for (const h of d.highlights) parts.push(`• ${h}`);
  }
  if (Array.isArray(d?.steps) && d.steps.length) {
    parts.push('');
    d.steps.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
  }
  if (d?.cta?.label && d?.cta?.url) {
    parts.push('');
    parts.push(`${d.cta.label}: ${d.cta.url}`);
  }

  parts.push('');
  parts.push(`🔗 ${SITE_URL}/`);

  return parts.join('\n');
}

// ── config.js generation ──────────────────────────────────────────────────────

// Cache-bust venue images on change. Each venue map image keeps a stable
// filename (e.g. assets/venues/hassall-park.jpeg) even when its bytes are
// replaced, so the browser HTTP cache and the service worker — both keyed by
// URL — would otherwise keep serving the old picture. Appending a short hash of
// the file's contents (?v=…) gives a changed image a fresh URL while leaving an
// unchanged image's URL — and its cache hit — intact. Returns a deep copy so
// the shared VENUES object (also imported by tests) is never mutated. Non-local
// (http/protocol-relative), already-versioned, or missing files are left as-is.
export function versionVenueImages(venues) {
  const out = JSON.parse(JSON.stringify(venues));
  for (const v of Object.values(out)) {
    const src = v?.details?.map?.src;
    if (!src || /^(https?:)?\/\//.test(src) || src.includes('?')) continue;
    const file = join(ROOT, 'docs', src);
    if (!existsSync(file)) continue;
    const hash = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
    v.details.map.src = `${src}?v=${hash}`;
  }
  return out;
}

// Builds the generated docs/config.js text from the central config.mjs values,
// with venue images cache-busted by content hash.
export function buildConfigJs() {
  return [
    '// Generated by scripts/fetch-fixtures.mjs — do not edit directly.',
    '// Edit scripts/config.mjs and re-run the fetch script.',
    'window.LCJRU_CONFIG = {',
    `  SEASON: ${JSON.stringify(SEASON)},`,
    `  SITE_URL: ${JSON.stringify(SITE_URL)},`,
    `  FINAL_ROUND: ${FINAL_ROUND},`,
    `  TEAM_SLUGS: ${JSON.stringify(TEAM_SLUGS, null, 2).replace(/\n/g, '\n  ')},`,
    `  MINIS_SLUGS: ${JSON.stringify([...MINIS_SLUGS])},`,
    `  VENUES: ${JSON.stringify(versionVenueImages(VENUES), null, 2).replace(/\n/g, '\n  ')},`,
    '};',
    '',
  ].join('\n');
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

  // Last-minute ground changes the feed may not reflect yet (config.mjs).
  applyVenueOverrides(combined);

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

  // Load the persisted SEQUENCE state so calendar revisions survive across runs.
  // Without this, every run starts from {} and SEQUENCE never advances past 0,
  // so clients (Google) may keep a stale cached event after a venue/time change.
  const seqState = existsSync(SEQ_PATH) ? JSON.parse(readFileSync(SEQ_PATH, 'utf8')) : {};

  // Generate per-team ICS calendar feeds
  for (const [slug, teamId] of Object.entries(TEAM_SLUGS)) {
    const ics = generateICS(slug, teamId, combined, output.updated, seqState);
    writeFileSync(join(ROOT, 'docs', `${slug}.ics`), ics);
  }
  console.log(`✓ Written ${Object.keys(TEAM_SLUGS).length} ICS feeds → docs/*.ics`);

  // Per-event single-file ICS downloads for special events (Mother's Day,
  // Waratahs, presentation day, etc.). Users add only the ones they care
  // about — avoids duplication when subscribing to multiple team feeds.
  const eventsDir = join(ROOT, 'docs', 'events');
  mkdirSync(eventsDir, { recursive: true });
  const specials = specialEventsForExport();
  for (const event of specials) {
    writeFileSync(join(eventsDir, `${event.id}.ics`), generateEventICS(event, output.updated, seqState));
  }
  console.log(`✓ Written ${specials.length} per-event ICS files → docs/events/*.ics`);

  // Persist SEQUENCE state with sorted keys so the file only changes when a
  // revision actually bumps (no churn from key ordering across runs).
  const sortedSeq = Object.fromEntries(Object.keys(seqState).sort().map(k => [k, seqState[k]]));
  writeFileSync(SEQ_PATH, JSON.stringify(sortedSeq, null, 2) + '\n');

  // Emit docs/config.js so HTML files share the same source of truth
  writeFileSync(CFG_PATH, buildConfigJs());
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
