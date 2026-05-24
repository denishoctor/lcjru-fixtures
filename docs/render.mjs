// Pure render helpers — no DOM or config dependencies.
// Imported by index.html (<script type="module">) and tests/render.test.mjs.

const LC_CREST_PATTERN = '/30901.';

function _genericMapsUrl(display) {
  return `https://maps.google.com/?q=${encodeURIComponent(display + ', Sydney NSW')}`;
}

export function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function isLaneCove(team) {
  return team.name.toLowerCase().includes('lane cove') || team.crest?.includes(LC_CREST_PATTERN);
}

// True for event entries that mirror real games (rounds, friendlies, galas) — these travel
// through the per-team ICS feed. Special events (Mother's Day, Waratahs etc.) return false
// and ship as standalone per-event ICS downloads instead.
export function isGameEvent(event) {
  return event?.variant === 'round'
      || event?.variant === 'friendly'
      || event?.variant === 'gala';
}

export function shortTeamName(name) {
  if (name.includes('Lane Cove/')) {
    return 'JV · ' + name.replace('Lane Cove/', '').replace(/\s*\d+$/, '').trim();
  }
  return name.replace('Lane Cove ', '').replace(' 2026', '').trim() || name;
}

// 'gold' / 'blue' for squad-coloured teams; 'neutral' for everything else
// (older grades with single teams, joint ventures, opposition).
export function teamColour(name) {
  const lower = String(name ?? '').toLowerCase();
  if (/\bgold\b/.test(lower)) return 'gold';
  if (/\bblue\b/.test(lower)) return 'blue';
  return 'neutral';
}

export function fmtDow(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Sydney' });
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })
    .replace(' am', 'am').replace(' pm', 'pm');
}

export function rowId(match) {
  return 'match-' + match.id;
}

export function scoreClass(match) {
  const lcHome = isLaneCove(match.home);
  const lcScore  = lcHome ? match.home.score : match.away.score;
  const oppScore = lcHome ? match.away.score : match.home.score;
  if (lcScore === null || oppScore === null) return '';
  const lc  = Number(lcScore);
  const opp = Number(oppScore);
  if (isNaN(lc) || isNaN(opp)) return '';
  return lc > opp ? 'win' : lc < opp ? 'loss' : 'draw';
}

// venues: the VENUES object from config — passed explicitly so this function is testable
// without a browser or config.js loaded.
export function parseVenue(rawVenue, venues) {
  if (!rawVenue) return { display: '', pitch: null, mapsUrl: '#', base: null, hasDetails: false };

  // Minis: "Tryon Oval TT1 (U6/U7)" → base="Tryon Oval", pitch="TT1"
  const miniMatch = rawVenue.match(/^(.+?) ((TT|M)\d+)\s*\([^)]+\)$/);
  if (miniMatch) {
    const base = miniMatch[1].trim();
    const pitch = miniMatch[2];
    const v = venues[base];
    const display = v?.suburb ? `${base}, ${v.suburb}` : base;
    return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display), base: v ? base : null, hasDetails: !!v?.details };
  }

  // Exact lookup first; then walk word-prefixes from longest to shortest until we find a
  // venue key. The remainder becomes the pitch label. Handles all of:
  //   "Keirle Park Field 2"                  → base "Keirle Park",            pitch "Field 2"
  //   "Eric Tweedale Field 5"                → base "Eric Tweedale Field",    pitch "Field 5"
  //   "Tantallon Oval 2"                     → base "Tantallon Oval",         pitch "Field 2"
  //   "North Narrabeen Reserve No 2 (Front)" → base "North Narrabeen Reserve", pitch "No 2 (Front)"
  let base = rawVenue.trim();
  let pitch = null;
  let v = venues[base];
  if (!v) {
    const words = base.split(' ');
    for (let i = words.length - 1; i >= 1; i--) {
      const prefix = words.slice(0, i).join(' ');
      if (venues[prefix]) {
        base  = prefix;
        v     = venues[prefix];
        const suffix = words.slice(i).join(' ').trim();
        // Bare digits get the friendly "Field N" label; everything else passes through verbatim
        // (so "Field 5", "No 2 (Front)" etc. render as the council names them).
        pitch = /^\d+$/.test(suffix) ? `Field ${suffix}` : suffix;
        break;
      }
    }
  }

  const display = v?.suburb ? `${base}, ${v.suburb}` : base;
  return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display), base: v ? base : null, hasDetails: !!v?.details };
}

// kebab-case slug for venue anchors and panel ids. Strips parens, apostrophes, slashes.
export function venueSlug(baseName) {
  return String(baseName ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Renders the venue details block. Order: notes/parking/coffee on top (each row's title
// inline with its text), then the map image with only the layout caption beneath. Returns
// '' if the venue has no details.
export function renderVenueDetails(baseName, venues) {
  const v = venues?.[baseName];
  const d = v?.details;
  if (!d) return '';

  const parts = [];

  const rows = [];
  if (d.parking) rows.push(['Parking', esc(d.parking).replace(/\n/g, '<br>')]);
  if (d.coffee) {
    const bits = [];
    if (d.coffee.onsite) bits.push(esc(d.coffee.onsite));
    if (d.coffee.nearby) bits.push(`Nearby: ${esc(d.coffee.nearby)}`);
    if (bits.length) rows.push(['Coffee', bits.join(' · ')]);
  }
  if (d.notes) rows.push(['Notes', esc(d.notes).replace(/\n/g, '<br>')]);

  if (rows.length) {
    const inline = rows.map(([k, v]) =>
      `<p class="venue-meta-row"><span class="venue-meta-label">${esc(k)}</span> ${v}</p>`
    ).join('');
    parts.push(`<div class="venue-meta">${inline}</div>`);
  }

  if (d.map) {
    const src = d.map.src;
    const asOf = d.map.asOf
      ? new Date(d.map.asOf + '-01').toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })
      : '';
    parts.push(
      `<a class="venue-map-link" href="${esc(src)}" target="_blank" rel="noopener">` +
        `<img class="venue-map" src="${esc(src)}" alt="${esc(d.map.caption ?? `${baseName} pitch layout`)}" loading="lazy">` +
      `</a>`
    );
    if (d.map.caption || asOf) {
      parts.push(`<div class="venue-map-caption">${esc(d.map.caption ?? '')}${d.map.caption && asOf ? ' · ' : ''}${asOf ? `Layout as of ${esc(asOf)}` : ''}</div>`);
    }
  }

  return parts.join('');
}

// Renders the per-event details panel (long-form body, optional bullet/numbered lists,
// and a primary CTA button). Returns '' if the event has no details. Body splits on
// blank lines into <p>; everything is esc()-d.
export function renderEventDetails(event) {
  const d = event?.details;
  if (!d) return '';

  const parts = [];

  if (d.body) {
    const paras = String(d.body).split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    parts.push(paras.map(p => `<p class="event-body">${esc(p).replace(/\n/g, '<br>')}</p>`).join(''));
  }

  if (Array.isArray(d.highlights) && d.highlights.length) {
    parts.push(
      `<ul class="event-highlights">${d.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`
    );
  }

  if (Array.isArray(d.steps) && d.steps.length) {
    parts.push(
      `<ol class="event-steps">${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
    );
  }

  if (d.cta?.label && d.cta?.url) {
    parts.push(
      `<a class="event-cta-btn" href="${esc(d.cta.url)}" target="_blank" rel="noopener">${esc(d.cta.label)} ↗</a>`
    );
  }

  return parts.join('');
}

// ── home-page weekend logic ─────────────────────────────────────────────────────
// Pure helpers powering the no-team home view. Kept here (not inline in index.html) so
// they're covered by tests/render.test.mjs.

// After this hour (Sydney time) on a Sunday, the just-played weekend is treated as finished:
// its games roll out of "This weekend" and down into "Last weekend's results".
export const RESULTS_CUTOVER_HOUR = 17;

// [Sat 00:00, Mon 00:00) for the weekend `offset` weeks from `now`, in the viewer's local
// time. offset 0 = current weekend (Sunday still counts as the current weekend); -1 = previous.
export function weekendRange(now, offset = 0) {
  const d = new Date(now);
  const dow = d.getDay(); // 0=Sun, 6=Sat
  const daysToSat = dow === 0 ? -1 : (dow === 6 ? 0 : 6 - dow);
  const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToSat + offset * 7);
  sat.setHours(0, 0, 0, 0);
  const monAfter = new Date(sat);
  monAfter.setDate(sat.getDate() + 2);
  return [sat, monAfter];
}

// True once the current weekend's games are done — Sunday in Sydney past `cutoverHour`.
// Mon–Sat it's always false (by Monday weekendRange has rolled forward on its own). Evaluated
// in Sydney time so the cutover fires at the same wall-clock moment for every viewer.
export function weekendConcluded(now, cutoverHour = RESULTS_CUTOVER_HOUR) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const hour    = Number(parts.find(p => p.type === 'hour')?.value);
  return weekday === 'Sun' && hour >= cutoverHour;
}

// "Sat 23 – Sun 24 May" for a weekend whose Saturday is `sat`. Formatted in Sydney time.
export function fmtWeekendLabel(sat) {
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
  const f = (d, opts) => d.toLocaleDateString('en-AU', { ...opts, timeZone: 'Australia/Sydney' });
  if (sat.getMonth() === sun.getMonth()) {
    return `${f(sat, { weekday: 'short' })} ${sat.getDate()} – ${f(sun, { weekday: 'short' })} ${f(sun, { day: 'numeric', month: 'short' })}`;
  }
  return `${f(sat, { weekday: 'short', day: 'numeric', month: 'short' })} – ${f(sun, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

// Age group of a match's Lane Cove side: 'minis' (U6–U9, per minisSlugs) or 'juniors'.
// slugById maps a team id → slug; minisSlugs is a Set of the Minis slugs.
export function matchGroup(match, minisSlugs, slugById) {
  const lc = isLaneCove(match.home) ? match.home : match.away;
  return minisSlugs.has(slugById[lc.id]) ? 'minis' : 'juniors';
}

// Numeric age grade of a match's Lane Cove side (e.g. 6, 11, 13), parsed from its slug
// ('u6-gold' → 6, 'u13-blue' → 13, 'u15' → 15). Unmapped teams sort last (Infinity).
// Used to order the results list youngest → oldest.
export function teamAge(match, slugById) {
  const lc = isLaneCove(match.home) ? match.home : match.away;
  const m = /^u(\d+)/.exec(slugById?.[lc.id] ?? '');
  return m ? Number(m[1]) : Infinity;
}

// Walks back week by week from `startOffset` until a weekend has at least one scored match
// passing `inGroup`. Skips bye/holiday weekends. `startOffset` is -1 (previous weekend) during
// a live weekend, or 0 (the weekend just gone) once weekendConcluded() flips after the Sunday
// cutover. With a Minis-only `inGroup` this finds nothing (Minis aren't scored). Returns
// { sat, end, matches } for the closest qualifying weekend, or null.
export function findLastResultsWeekend(now, allMatches, { startOffset = -1, inGroup = () => true, maxWeeks = 6 } = {}) {
  for (let i = startOffset; i > startOffset - maxWeeks; i--) {
    const [s, e] = weekendRange(now, i);
    const matches = allMatches.filter(m => {
      const dt = new Date(m.dateTime);
      return dt >= s && dt < e && m.home.score !== null && m.away.score !== null && inGroup(m);
    }).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    if (matches.length > 0) return { sat: s, end: e, matches };
  }
  return null;
}

// Compact single-line home-page row for one match. ctx = { venues, slugById }. mode 'result'
// shows score + W/L/D from the Lane Cove perspective; 'fixture' shows day + kickoff time.
// Each row deep-links to the LC team's full schedule with the match expanded.
export function renderHomeMatchRow(match, { venues, slugById, isNextUp = false, mode = 'fixture' } = {}) {
  const lcTeam   = isLaneCove(match.home) ? match.home : match.away;
  const opponent = isLaneCove(match.home) ? match.away : match.home;
  const isHome   = (match.venue || '').toLowerCase().includes('tantallon');
  const isDerby  = isLaneCove(match.home) && isLaneCove(match.away);
  const slug     = slugById?.[lcTeam.id];
  const href     = slug ? `#${slug}/${rowId(match)}` : '#';
  const { display: loc } = parseVenue(match.venue ?? '', venues ?? {});

  // Left column: result+score for completed games, day+time for upcoming
  let leftCol;
  if (mode === 'result') {
    const sc = scoreClass(match);
    const letter = { win: 'W', loss: 'L', draw: 'D' }[sc] || '·';
    leftCol = `<span class="home-row-result ${sc}"><span class="home-row-result-letter">${letter}</span>${esc(match.home.score)}–${esc(match.away.score)}</span>`;
  } else {
    const dow = fmtDow(match.dateTime);
    const time = fmtTime(match.dateTime);
    const showTime = time !== '12:00am';
    leftCol = `<span class="home-row-when">${esc(dow)}${showTime ? ' ' + esc(time) : ''}</span>`;
  }

  const badges = [];
  if (isHome)  badges.push('<span class="home-pill">Home</span>');
  if (isDerby) badges.push('<span class="derby-pill">Derby</span>');

  const classes = ['home-row'];
  if (isNextUp) classes.push('next-up');

  return `<a class="${classes.join(' ')}" href="${esc(href)}">
    ${leftCol}
    <span class="team-pill team-pill--${teamColour(lcTeam.name)}">${esc(shortTeamName(lcTeam.name))}</span>
    <span class="home-row-text">v ${esc(opponent.name)}${loc ? ' <span class="home-row-venue">· ' + esc(loc) + '</span>' : ''}</span>
    <span class="home-row-extra">${badges.join('')}</span>
  </a>`;
}
