import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, isLaneCove, shortTeamName, teamColour, fmtDow, fmtDate, fmtTime, rowId, scoreClass, parseVenue, venueSlug, renderVenueDetails, renderEventDetails, RESULTS_CUTOVER_HOUR, weekendRange, weekendConcluded, fmtWeekendLabel, matchGroup, teamAge, findLastResultsWeekend, renderHomeMatchRow } from '../docs/render.mjs';

// ── esc ───────────────────────────────────────────────────────────────────────

test('esc: encodes & < > " \'', () => {
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('<script>'), '&lt;script&gt;');
  assert.equal(esc('"hello"'), '&quot;hello&quot;');
  assert.equal(esc("it's"), 'it&#39;s');
});

test('esc: returns empty string for null/undefined', () => {
  assert.equal(esc(null),      '');
  assert.equal(esc(undefined), '');
});

test('esc: numbers coerced to string', () => {
  assert.equal(esc(42),  '42');
  assert.equal(esc(0),   '0');
});

test('esc: safe strings pass through unchanged', () => {
  assert.equal(esc('hello world'), 'hello world');
});

// ── isLaneCove ────────────────────────────────────────────────────────────────

test('isLaneCove: true for name containing "lane cove"', () => {
  assert.ok(isLaneCove({ name: 'Lane Cove Gold 12', crest: '' }));
  assert.ok(isLaneCove({ name: 'lane cove blue 7', crest: '' }));
});

test('isLaneCove: true for crest URL containing /30901.', () => {
  assert.ok(isLaneCove({ name: 'Some Team', crest: 'https://example.com/teams/30901.png' }));
});

test('isLaneCove: false for other teams', () => {
  assert.ok(!isLaneCove({ name: 'Ryde Eastwood', crest: 'https://example.com/teams/99999.png' }));
});

// ── shortTeamName ─────────────────────────────────────────────────────────────

test('shortTeamName: strips "Lane Cove " prefix', () => {
  assert.equal(shortTeamName('Lane Cove Gold 12'), 'Gold 12');
  assert.equal(shortTeamName('Lane Cove Blue U7'), 'Blue U7');
});

test('shortTeamName: strips " 2026" year suffix', () => {
  assert.equal(shortTeamName('Lane Cove Gold 12 2026'), 'Gold 12');
});

test('shortTeamName: joint venture format → JV prefix', () => {
  assert.equal(shortTeamName('Lane Cove/Lindfield 14'), 'JV · Lindfield');
  assert.equal(shortTeamName('Lane Cove/Ryde 10'), 'JV · Ryde');
});

test('shortTeamName: non-LC team returned unchanged', () => {
  assert.equal(shortTeamName('Ryde Eastwood'), 'Ryde Eastwood');
});

// ── teamColour ────────────────────────────────────────────────────────────────

test('teamColour: gold for "Gold" teams', () => {
  assert.equal(teamColour('Lane Cove Gold 9'), 'gold');
  assert.equal(teamColour('lane cove gold 7'), 'gold');
});

test('teamColour: blue for "Blue" teams', () => {
  assert.equal(teamColour('Lane Cove Blue 8'), 'blue');
  assert.equal(teamColour('Lane Cove Blue U7'), 'blue');
});

test('teamColour: neutral for un-coloured grades', () => {
  assert.equal(teamColour('Lane Cove 10'), 'neutral');
  assert.equal(teamColour('Lane Cove 11'), 'neutral');
  assert.equal(teamColour('Lane Cove 12'), 'neutral');
});

test('teamColour: neutral for joint ventures (no colour assigned)', () => {
  assert.equal(teamColour('Lane Cove/Lindfield 14'), 'neutral');
  assert.equal(teamColour('Lane Cove/St Ives 12'), 'neutral');
});

test('teamColour: handles null/undefined', () => {
  assert.equal(teamColour(null), 'neutral');
  assert.equal(teamColour(undefined), 'neutral');
});

// ── fmtDow / fmtDate / fmtTime ───────────────────────────────────────────────

const SAT_9AM = '2026-05-09T09:00:00+10:00'; // Saturday, 9 May 2026, 09:00 AEST

test('fmtDow returns short weekday in en-AU', () => {
  assert.equal(fmtDow(SAT_9AM), 'Sat');
});

test('fmtDate returns day + month in en-AU', () => {
  assert.equal(fmtDate(SAT_9AM), '9 May');
});

test('fmtTime returns h:mm am/pm without space', () => {
  assert.equal(fmtTime(SAT_9AM), '9:00am');
});

test('fmtTime removes space before am/pm', () => {
  const t1pm = '2026-05-09T13:00:00+10:00';
  assert.equal(fmtTime(t1pm), '1:00pm');
});

// ── rowId ─────────────────────────────────────────────────────────────────────

test('rowId returns match- prefix + id', () => {
  assert.equal(rowId({ id: 'abc123' }), 'match-abc123');
});

// ── scoreClass ────────────────────────────────────────────────────────────────

const lc   = { name: 'Lane Cove Gold 12', crest: '', score: 0 };
const opp  = { name: 'Ryde Eastwood',     crest: '', score: 0 };

test('scoreClass: win when LC score > opponent', () => {
  assert.equal(scoreClass({ home: { ...lc, score: 21 }, away: { ...opp, score: 14 } }), 'win');
});

test('scoreClass: loss when LC score < opponent', () => {
  assert.equal(scoreClass({ home: { ...lc, score: 7 }, away: { ...opp, score: 28 } }), 'loss');
});

test('scoreClass: draw when scores equal', () => {
  assert.equal(scoreClass({ home: { ...lc, score: 14 }, away: { ...opp, score: 14 } }), 'draw');
});

test('scoreClass: empty string when score is null', () => {
  assert.equal(scoreClass({ home: { ...lc, score: null }, away: { ...opp, score: null } }), '');
});

test('scoreClass: LC is away team', () => {
  assert.equal(scoreClass({ home: { ...opp, score: 10 }, away: { ...lc, score: 24 } }), 'win');
});

// ── parseVenue ────────────────────────────────────────────────────────────────

const VENUES = {
  'Tantallon Oval': { suburb: 'Lane Cove North', mapsUrl: 'https://maps.example.com/tantallon' },
  'Tryon Oval':     { suburb: 'East Lindfield',  mapsUrl: 'https://maps.example.com/tryon' },
};

test('parseVenue: known venue returns suburb and mapsUrl', () => {
  const r = parseVenue('Tantallon Oval', VENUES);
  assert.equal(r.display,  'Tantallon Oval, Lane Cove North');
  assert.equal(r.pitch,    null);
  assert.equal(r.mapsUrl,  'https://maps.example.com/tantallon');
});

test('parseVenue: unknown venue falls back to generic maps URL', () => {
  const r = parseVenue('Mystery Park', VENUES);
  assert.equal(r.display, 'Mystery Park');
  assert.ok(r.mapsUrl.startsWith('https://maps.google.com/?q='));
  assert.ok(r.mapsUrl.includes('Mystery'));
});

test('parseVenue: empty/falsy returns sentinel', () => {
  assert.deepEqual(parseVenue('',   VENUES), { display: '', pitch: null, pitchNote: null, mapsUrl: '#', base: null, hasDetails: false });
  assert.deepEqual(parseVenue(null, VENUES), { display: '', pitch: null, pitchNote: null, mapsUrl: '#', base: null, hasDetails: false });
});

test('parseVenue: field number suffix stripped and returned as pitch', () => {
  const r = parseVenue('Tantallon Oval 2', VENUES);
  assert.equal(r.display, 'Tantallon Oval, Lane Cove North');
  assert.equal(r.pitch,   'Field 2');
});

test('parseVenue: "Field N" suffix stripped (xplorer also serves this shape)', () => {
  const r = parseVenue('Tantallon Oval Field 2', VENUES);
  assert.equal(r.display, 'Tantallon Oval, Lane Cove North');
  assert.equal(r.pitch,   'Field 2');
  assert.equal(r.base,    'Tantallon Oval');
});

test('parseVenue: prefers the longest matching venue prefix', () => {
  // "Eric Tweedale Field" (the venue) ends in "Field" — must NOT shorten to "Eric Tweedale"
  const venues = {
    'Eric Tweedale Field': { suburb: 'Merrylands', mapsUrl: 'https://maps.example.com/etf' },
  };
  const r = parseVenue('Eric Tweedale Field 5', venues);
  assert.equal(r.base,    'Eric Tweedale Field');
  assert.equal(r.pitch,   'Field 5');
  assert.equal(r.display, 'Eric Tweedale Field, Merrylands');
});

test('parseVenue: keeps council field label verbatim, splits bracket note out as pitchNote', () => {
  const venues = {
    'North Narrabeen Reserve': { suburb: 'Narrabeen', mapsUrl: 'https://maps.example.com/nnr' },
  };
  const r = parseVenue('North Narrabeen Reserve No 2 (Front)', venues);
  assert.equal(r.base,      'North Narrabeen Reserve');
  assert.equal(r.pitch,     'No 2');
  assert.equal(r.pitchNote, 'Front');
});

test('parseVenue: drops superfluous "Playing" and lifts bracket note to pitchNote', () => {
  const venues = {
    'Forestville War Memorial': { suburb: 'Forestville', mapsUrl: 'https://maps.example.com/fwm' },
  };
  const r = parseVenue('Forestville War Memorial Playing Field No 6 (Rugby field upper level)', venues);
  assert.equal(r.base,      'Forestville War Memorial');
  assert.equal(r.display,   'Forestville War Memorial, Forestville');
  assert.equal(r.pitch,     'Field No 6');
  assert.equal(r.pitchNote, 'Rugby field upper level');
});

test('parseVenue: alternate-name bracket becomes pitchNote, base resolves without it', () => {
  const venues = {
    'Mark Taylor Oval': { suburb: 'Waitara', mapsUrl: 'https://maps.example.com/mto' },
  };
  const r = parseVenue('Mark Taylor Oval (Waitara Oval)', venues);
  assert.equal(r.base,      'Mark Taylor Oval');
  assert.equal(r.display,   'Mark Taylor Oval, Waitara');
  assert.equal(r.pitch,     null);
  assert.equal(r.pitchNote, 'Waitara Oval');
});

test('parseVenue: minis pitch format "Tryon Oval TT1 (U6/U7)"', () => {
  const r = parseVenue('Tryon Oval TT1 (U6/U7)', VENUES);
  assert.equal(r.display, 'Tryon Oval, East Lindfield');
  assert.equal(r.pitch,   'TT1');
  assert.equal(r.mapsUrl, 'https://maps.example.com/tryon');
});

test('parseVenue: minis pitch format "Tryon Oval M2 (U8/U9)"', () => {
  const r = parseVenue('Tryon Oval M2 (U8/U9)', VENUES);
  assert.equal(r.display, 'Tryon Oval, East Lindfield');
  assert.equal(r.pitch,   'M2');
});

// ── parseVenue: hasDetails + base ────────────────────────────────────────────

const VENUES_WITH_DETAILS = {
  'Tantallon Oval': { suburb: 'Lane Cove North', mapsUrl: 'https://maps.example.com/tantallon' },
  'Keirle Park':    { suburb: 'Manly',           mapsUrl: 'https://maps.example.com/keirle',
    details: { map: { src: 'assets/venues/keirle-park.jpg', caption: 'Pitch layout', asOf: '2026-03' } },
  },
  'Tryon Oval':     { suburb: 'East Lindfield',  mapsUrl: 'https://maps.example.com/tryon',
    details: {
      map:     { src: 'assets/venues/tryon-oval.jpg', asOf: '2026-03' },
      parking: 'Tight on game day.',
      coffee:  { onsite: 'Kiosk', nearby: 'Café up the road.' },
      notes:   'Watch for low sun.\nDouble-check pitch number.',
    },
  },
};

test('parseVenue: hasDetails true when venue has details block', () => {
  const r = parseVenue('Keirle Park', VENUES_WITH_DETAILS);
  assert.equal(r.hasDetails, true);
  assert.equal(r.base, 'Keirle Park');
});

test('parseVenue: hasDetails false when venue lacks details block', () => {
  const r = parseVenue('Tantallon Oval', VENUES_WITH_DETAILS);
  assert.equal(r.hasDetails, false);
  assert.equal(r.base, 'Tantallon Oval');
});

test('parseVenue: unknown venue → base null, hasDetails false', () => {
  const r = parseVenue('Mystery Park', VENUES_WITH_DETAILS);
  assert.equal(r.base, null);
  assert.equal(r.hasDetails, false);
});

test('parseVenue: minis format propagates hasDetails', () => {
  const r = parseVenue('Tryon Oval M2 (U8/U9)', VENUES_WITH_DETAILS);
  assert.equal(r.base, 'Tryon Oval');
  assert.equal(r.hasDetails, true);
});

// ── venueSlug ─────────────────────────────────────────────────────────────────

test('venueSlug: plain name', () => {
  assert.equal(venueSlug('Tantallon Oval'), 'tantallon-oval');
});

test('venueSlug: handles parens', () => {
  assert.equal(venueSlug('Mark Taylor Oval (Waitara Oval)'), 'mark-taylor-oval-waitara-oval');
});

test('venueSlug: strips apostrophes (curly + straight)', () => {
  assert.equal(venueSlug("O'Connor Reserve"), 'oconnor-reserve');
  assert.equal(venueSlug('O’Sullivan Park'),  'osullivan-park');
});

test('venueSlug: collapses multiple separators', () => {
  assert.equal(venueSlug('AR  Hurst   Reserve'), 'ar-hurst-reserve');
});

test('venueSlug: empty / null → empty string', () => {
  assert.equal(venueSlug(''),    '');
  assert.equal(venueSlug(null),  '');
});

// ── renderVenueDetails ────────────────────────────────────────────────────────

test('renderVenueDetails: empty string when venue has no details', () => {
  assert.equal(renderVenueDetails('Tantallon Oval', VENUES_WITH_DETAILS), '');
});

test('renderVenueDetails: empty string for unknown venue', () => {
  assert.equal(renderVenueDetails('Nowhere', VENUES_WITH_DETAILS), '');
});

test('renderVenueDetails: includes map src and asOf caption', () => {
  const html = renderVenueDetails('Keirle Park', VENUES_WITH_DETAILS);
  assert.ok(html.includes('assets/venues/keirle-park.jpg'), 'map src');
  assert.ok(html.includes('Pitch layout'),                   'caption');
  assert.ok(html.includes('Layout as of Mar 2026'),          'asOf caption rendered');
  assert.ok(html.includes('venue-map-link'),                 'wraps img in link to fullsize');
});

test('renderVenueDetails: includes parking, coffee onsite + nearby, notes', () => {
  const html = renderVenueDetails('Tryon Oval', VENUES_WITH_DETAILS);
  assert.ok(html.includes('Tight on game day.'));
  // Coffee row joins onsite + nearby on one line with " · " separator
  assert.ok(html.includes('Kiosk · Nearby: Café up the road.'));
  assert.ok(html.includes('Watch for low sun.<br>Double-check pitch number.'),
    'notes preserves newlines as <br>');
  // Inline meta layout: each row is a <p class="venue-meta-row"> with a <span class="venue-meta-label">
  assert.ok(html.includes('venue-meta-row'));
  assert.ok(html.includes('venue-meta-label'));
});

test('renderVenueDetails: escapes html in user-supplied text', () => {
  const venues = { 'Hostile Park': { suburb: '', mapsUrl: '#',
    details: { parking: '<script>alert(1)</script>' },
  } };
  const html = renderVenueDetails('Hostile Park', venues);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ── renderEventDetails ────────────────────────────────────────────────────────

test('renderEventDetails: empty string when no details block', () => {
  assert.equal(renderEventDetails({ id: 'x', title: 'Y' }), '');
  assert.equal(renderEventDetails(null), '');
  assert.equal(renderEventDetails(undefined), '');
});

test('renderEventDetails: body splits on blank lines into paragraphs', () => {
  const html = renderEventDetails({ details: { body: 'Para one.\n\nPara two.' } });
  assert.ok(html.includes('<p class="event-body">Para one.</p>'));
  assert.ok(html.includes('<p class="event-body">Para two.</p>'));
});

test('renderEventDetails: single newlines inside a paragraph become <br>', () => {
  const html = renderEventDetails({ details: { body: 'Line a\nLine b' } });
  assert.ok(html.includes('Line a<br>Line b'));
});

test('renderEventDetails: highlights render as <ul>', () => {
  const html = renderEventDetails({ details: { highlights: ['Bar setup', 'Coffee cart'] } });
  assert.ok(html.includes('<ul class="event-highlights">'));
  assert.ok(html.includes('<li>Bar setup</li>'));
  assert.ok(html.includes('<li>Coffee cart</li>'));
});

test('renderEventDetails: steps render as <ol>', () => {
  const html = renderEventDetails({ details: { steps: ['Step 1', 'Step 2'] } });
  assert.ok(html.includes('<ol class="event-steps">'));
  assert.ok(html.includes('<li>Step 1</li>'));
});

test('renderEventDetails: cta renders as a button-styled link', () => {
  const html = renderEventDetails({ details: { cta: { label: 'Buy tickets', url: 'https://example.com/x' } } });
  assert.ok(html.includes('class="event-cta-btn"'));
  assert.ok(html.includes('href="https://example.com/x"'));
  assert.ok(html.includes('Buy tickets ↗'));
  assert.ok(html.includes('target="_blank"'));
});

test('renderEventDetails: cta omitted when label or url missing', () => {
  assert.equal(renderEventDetails({ details: { cta: { label: 'X' } } }), '');
  assert.equal(renderEventDetails({ details: { cta: { url: '#' } } }), '');
});

test('renderEventDetails: escapes html in body, highlights, steps, cta', () => {
  const html = renderEventDetails({ details: {
    body: '<b>nope</b>',
    highlights: ['<i>foo</i>'],
    steps: ['<script>x</script>'],
    cta: { label: '<x>L', url: 'javascript:alert(1)' },
  }});
  assert.ok(!html.includes('<b>nope</b>'));
  assert.ok(html.includes('&lt;b&gt;nope&lt;/b&gt;'));
  assert.ok(html.includes('&lt;i&gt;foo&lt;/i&gt;'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(html.includes('&lt;x&gt;L'));
  // url is esc()'d but not validated; that's a separate concern from XSS in attribute context
  assert.ok(html.includes('href="javascript:alert(1)"'));
});

test('renderEventDetails: order is body → highlights → steps → cta', () => {
  const html = renderEventDetails({ details: {
    body: 'B', highlights: ['H'], steps: ['S'], cta: { label: 'C', url: '#' },
  }});
  const iBody = html.indexOf('event-body');
  const iHi   = html.indexOf('event-highlights');
  const iSt   = html.indexOf('event-steps');
  const iCta  = html.indexOf('event-cta-btn');
  assert.ok(iBody < iHi && iHi < iSt && iSt < iCta);
});

// ── weekendRange ────────────────────────────────────────────────────────────────
// Asserts structural contracts that hold in any runner timezone (avoids brittle absolute
// dates): the window is always a Saturday→Monday 2-day span and offsets step by 7 days.

test('weekendRange: returns a Sat 00:00 → Mon 00:00 window', () => {
  const [sat, mon] = weekendRange(new Date('2026-05-20T03:00:00Z'), 0); // a Wednesday
  assert.equal(sat.getDay(), 6); // Saturday (local)
  assert.equal(mon.getDay(), 1); // Monday (local)
  assert.equal(sat.getHours(), 0);
  assert.equal(sat.getMinutes(), 0);
  const spanHours = (mon - sat) / 3600000;
  assert.ok(spanHours >= 47 && spanHours <= 49, `span ${spanHours}h ~= 48`); // DST-tolerant
});

test('weekendRange: Sunday counts as the current weekend (offset 0)', () => {
  const sun = new Date('2026-05-24T02:00:00Z'); // Sun midday AEST
  const [sat, mon] = weekendRange(sun, 0);
  assert.equal(sat.getDay(), 6);
  assert.ok(sat <= sun && sun < mon, 'Sunday falls inside its own weekend window');
});

test('weekendRange: offset steps the window by whole weeks', () => {
  const now = new Date('2026-05-20T03:00:00Z');
  const days = (a, b) => Math.round((a - b) / 86400000);
  assert.equal(days(weekendRange(now, 1)[0],  weekendRange(now, 0)[0]),  7);
  assert.equal(days(weekendRange(now, 0)[0],  weekendRange(now, -1)[0]), 7);
});

// ── weekendConcluded ──────────────────────────────────────────────────────────
// Fully deterministic — decided in Australia/Sydney regardless of the runner's timezone.

test('weekendConcluded: false before 5pm Sunday AEST', () => {
  assert.equal(weekendConcluded(new Date('2026-05-24T06:59:00Z')), false); // Sun 4:59pm AEST
});

test('weekendConcluded: true at/after 5pm Sunday AEST', () => {
  assert.equal(weekendConcluded(new Date('2026-05-24T07:00:00Z')), true);  // Sun 5:00pm AEST
  assert.equal(weekendConcluded(new Date('2026-05-24T10:00:00Z')), true);  // Sun 8:00pm AEST
});

test('weekendConcluded: false on Saturday and Monday', () => {
  assert.equal(weekendConcluded(new Date('2026-05-23T10:00:00Z')), false); // Sat 8pm AEST
  assert.equal(weekendConcluded(new Date('2026-05-24T23:00:00Z')), false); // Mon 9am AEST
});

test('weekendConcluded: honours a custom cutover hour', () => {
  const sunNoon = new Date('2026-05-24T02:00:00Z'); // Sun 12pm AEST
  assert.equal(weekendConcluded(sunNoon, 17), false);
  assert.equal(weekendConcluded(sunNoon, 12), true);
});

test('RESULTS_CUTOVER_HOUR default is 5pm', () => {
  assert.equal(RESULTS_CUTOVER_HOUR, 17);
});

// ── fmtWeekendLabel ─────────────────────────────────────────────────────────────
// Formatted in Australia/Sydney; pass unambiguous instants so it's runner-tz independent.

// Derive `sat` from weekendRange (local midnight Saturday) so getDate() and the Sydney-
// formatted parts agree on any UTC/AEST runner — mirroring how renderHomePage calls it.
test('fmtWeekendLabel: same-month range collapses the month', () => {
  const [sat] = weekendRange(new Date('2026-05-20T03:00:00Z'), 0); // → Sat 23 May
  assert.equal(fmtWeekendLabel(sat), 'Sat 23 – Sun 24 May');
});

test('fmtWeekendLabel: cross-month range shows both months', () => {
  const [sat] = weekendRange(new Date('2026-10-28T03:00:00Z'), 0); // → Sat 31 Oct / Sun 1 Nov
  assert.equal(fmtWeekendLabel(sat), 'Sat, 31 Oct – Sun, 1 Nov');
});

// ── matchGroup ──────────────────────────────────────────────────────────────────

const MINIS = new Set(['u7-gold', 'u9-blue']);
const SLUGS = { home1: 'u7-gold', away1: 'u11', jv: 'u12' };

test('matchGroup: Minis slug on the Lane Cove side → minis', () => {
  const m = { home: { name: 'Lane Cove Gold 7', id: 'home1', crest: '' }, away: { name: 'Ryde 7', id: 'x' } };
  assert.equal(matchGroup(m, MINIS, SLUGS), 'minis');
});

test('matchGroup: Juniors slug → juniors (LC may be the away side)', () => {
  const m = { home: { name: 'Wahroonga 11', id: 'x' }, away: { name: 'Lane Cove 11', id: 'away1', crest: '' } };
  assert.equal(matchGroup(m, MINIS, SLUGS), 'juniors');
});

test('matchGroup: JV/composite Lane Cove team classified by its slug', () => {
  const m = { home: { name: 'Allambie/Forest 12', id: 'x' }, away: { name: 'Lane Cove/St Ives 12', id: 'jv', crest: '' } };
  assert.equal(matchGroup(m, MINIS, SLUGS), 'juniors');
});

// ── teamAge ─────────────────────────────────────────────────────────────────────

test('teamAge: parses the grade number from the LC slug', () => {
  const slugs = { a: 'u6-gold', b: 'u11', c: 'u13-blue', d: 'u15' };
  const mk = (id) => ({ home: { name: 'Lane Cove X', id, crest: '' }, away: { name: 'Opp', id: 'z' } });
  assert.equal(teamAge(mk('a'), slugs), 6);
  assert.equal(teamAge(mk('b'), slugs), 11);
  assert.equal(teamAge(mk('c'), slugs), 13);
  assert.equal(teamAge(mk('d'), slugs), 15);
});

test('teamAge: reads the LC side even when it is the away team', () => {
  const slugs = { lc: 'u10' };
  const m = { home: { name: 'Newport 10', id: 'x' }, away: { name: 'Lane Cove 10', id: 'lc', crest: '' } };
  assert.equal(teamAge(m, slugs), 10);
});

test('teamAge: unmapped team sorts last (Infinity)', () => {
  const m = { home: { name: 'Lane Cove ?', id: 'nope', crest: '' }, away: { name: 'Opp', id: 'z' } };
  assert.equal(teamAge(m, {}), Infinity);
});

test('teamAge: sorts a results list youngest → oldest, time breaking grade ties', () => {
  const slugs = { t10: 'u10', t12: 'u12', t14a: 'u14', t14b: 'u14-gold', t15: 'u15' };
  const mk = (id, dateTime) => ({ dateTime, home: { name: 'Lane Cove', id, crest: '' }, away: { name: 'Opp', id: 'z' } });
  const matches = [
    mk('t12', '2026-05-16T23:00:00Z'),
    mk('t15', '2026-05-17T01:20:00Z'),
    mk('t14b', '2026-05-17T02:10:00Z'),
    mk('t10', '2026-05-16T23:30:00Z'),
    mk('t14a', '2026-05-17T01:50:00Z'),
  ];
  const ordered = [...matches].sort((a, b) =>
    teamAge(a, slugs) - teamAge(b, slugs) || new Date(a.dateTime) - new Date(b.dateTime));
  assert.deepEqual(ordered.map(m => slugs[m.home.id]), ['u10', 'u12', 'u14', 'u14-gold', 'u15']);
});

// ── findLastResultsWeekend ──────────────────────────────────────────────────────
// Build match times relative to weekendRange's own output so membership is exact regardless
// of the runner timezone (a stray ±hours at the local-midnight edge can't flip the result).

function matchOn(sat, { hScore = '20', aScore = '10', name = 'Lane Cove 11', id = 'lc' } = {}) {
  const dateTime = new Date(sat.getTime() + 10 * 3600000).toISOString(); // ~10h into Saturday
  return { dateTime, home: { name, id, crest: '', score: hScore }, away: { name: 'Opp', id: 'o', score: aScore } };
}

test('findLastResultsWeekend: finds the previous weekend during a live weekend', () => {
  const now = new Date('2026-05-24T02:00:00Z'); // Sunday
  const [satPrev] = weekendRange(now, -1);
  const res = findLastResultsWeekend(now, [matchOn(satPrev)], { startOffset: -1 });
  assert.ok(res);
  assert.equal(res.matches.length, 1);
  assert.equal(res.sat.getTime(), satPrev.getTime());
});

test('findLastResultsWeekend: startOffset 0 picks up the weekend just gone', () => {
  const now = new Date('2026-05-24T10:00:00Z'); // post-cutover Sunday night
  const [satThis] = weekendRange(now, 0);
  const res = findLastResultsWeekend(now, [matchOn(satThis)], { startOffset: 0 });
  assert.ok(res);
  assert.equal(res.sat.getTime(), satThis.getTime());
});

test('findLastResultsWeekend: skips unscored games and respects inGroup', () => {
  const now = new Date('2026-05-24T02:00:00Z');
  const [satPrev] = weekendRange(now, -1);
  const scored   = matchOn(satPrev, { id: 'jr' });               // a Juniors result
  const unscored = matchOn(satPrev, { hScore: null, aScore: null, id: 'mini' });
  const slugs = { jr: 'u11', mini: 'u8-gold' };
  const minis = new Set(['u8-gold']);
  // Minis filter finds nothing scored (Minis aren't scored) → null
  const minisRes = findLastResultsWeekend(now, [scored, unscored], {
    startOffset: -1, inGroup: (m) => matchGroup(m, minis, slugs) === 'minis',
  });
  assert.equal(minisRes, null);
  // Juniors filter finds the one scored result
  const jrRes = findLastResultsWeekend(now, [scored, unscored], {
    startOffset: -1, inGroup: (m) => matchGroup(m, minis, slugs) === 'juniors',
  });
  assert.equal(jrRes.matches.length, 1);
});

test('findLastResultsWeekend: returns null when nothing scored within maxWeeks', () => {
  const now = new Date('2026-05-24T02:00:00Z');
  assert.equal(findLastResultsWeekend(now, [], { startOffset: -1 }), null);
});

// ── renderHomeMatchRow ──────────────────────────────────────────────────────────

const HOME_CTX = { venues: {}, slugById: { lc: 'u11' } };
const fixtureMatch = {
  id: 'm1', dateTime: '2026-05-23T22:00:00Z', venue: 'Ryde Park',
  home: { name: 'Lane Cove 11', id: 'lc', crest: '', score: null },
  away: { name: 'Wahroonga 11', id: 'o', crest: '', score: null },
};
const resultMatch = {
  ...fixtureMatch,
  home: { ...fixtureMatch.home, score: '12' },
  away: { ...fixtureMatch.away, score: '31' },
};

test('renderHomeMatchRow: result mode shows score + loss letter from LC view', () => {
  const html = renderHomeMatchRow(resultMatch, { ...HOME_CTX, mode: 'result' });
  assert.ok(html.includes('12–31'));
  assert.ok(html.includes('home-row-result loss'));
  assert.ok(html.includes('>L<'));
  assert.ok(!html.includes('home-row-when')); // no time column in result mode
});

test('renderHomeMatchRow: fixture mode shows the kickoff time, no score', () => {
  const html = renderHomeMatchRow(fixtureMatch, { ...HOME_CTX, mode: 'fixture' });
  assert.ok(html.includes('home-row-when'));
  assert.ok(!html.includes('home-row-result'));
});

test('renderHomeMatchRow: deep-links to the LC team slug + row id', () => {
  const html = renderHomeMatchRow(fixtureMatch, HOME_CTX);
  assert.ok(html.includes('href="#u11/match-m1"'));
});

test('renderHomeMatchRow: next-up adds the highlight class', () => {
  const html = renderHomeMatchRow(fixtureMatch, { ...HOME_CTX, isNextUp: true });
  assert.ok(html.includes('home-row next-up'));
});

test('renderHomeMatchRow: shows the short LC team name and opponent', () => {
  const html = renderHomeMatchRow(fixtureMatch, HOME_CTX);
  assert.ok(html.includes('>11<') || html.includes('team-pill'));
  assert.ok(html.includes('v Wahroonga 11'));
});
