import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, isLaneCove, shortTeamName, fmtDow, fmtDate, fmtTime, rowId, scoreClass, parseVenue, venueSlug, renderVenueDetails, renderEventDetails } from '../docs/render.mjs';

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
  assert.deepEqual(parseVenue('',   VENUES), { display: '', pitch: null, mapsUrl: '#', base: null, hasDetails: false });
  assert.deepEqual(parseVenue(null, VENUES), { display: '', pitch: null, mapsUrl: '#', base: null, hasDetails: false });
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

test('parseVenue: keeps free-form suffix verbatim ("No 2 (Front)" etc.)', () => {
  const venues = {
    'North Narrabeen Reserve': { suburb: 'Narrabeen', mapsUrl: 'https://maps.example.com/nnr' },
  };
  const r = parseVenue('North Narrabeen Reserve No 2 (Front)', venues);
  assert.equal(r.base,  'North Narrabeen Reserve');
  assert.equal(r.pitch, 'No 2 (Front)');
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

test('renderVenueDetails: assetPrefix prepended to map src', () => {
  const html = renderVenueDetails('Keirle Park', VENUES_WITH_DETAILS, { assetPrefix: '../' });
  assert.ok(html.includes('../assets/venues/keirle-park.jpg'));
});

test('renderVenueDetails: includes parking, coffee onsite + nearby, notes', () => {
  const html = renderVenueDetails('Tryon Oval', VENUES_WITH_DETAILS);
  assert.ok(html.includes('Tight on game day.'));
  assert.ok(html.includes('<strong>Onsite:</strong> Kiosk'));
  assert.ok(html.includes('<strong>Nearby:</strong> Café up the road.'));
  assert.ok(html.includes('Watch for low sun.<br>Double-check pitch number.'),
    'notes preserves newlines as <br>');
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
