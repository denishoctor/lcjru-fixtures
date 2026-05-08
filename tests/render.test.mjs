import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, isLaneCove, shortTeamName, fmtDow, fmtDate, fmtTime, rowId, scoreClass, parseVenue } from '../docs/render.mjs';

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
  assert.deepEqual(parseVenue('',   VENUES), { display: '', pitch: null, mapsUrl: '#' });
  assert.deepEqual(parseVenue(null, VENUES), { display: '', pitch: null, mapsUrl: '#' });
});

test('parseVenue: field number suffix stripped and returned as pitch', () => {
  const r = parseVenue('Tantallon Oval 2', VENUES);
  assert.equal(r.display, 'Tantallon Oval, Lane Cove North');
  assert.equal(r.pitch,   'Field 2');
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
