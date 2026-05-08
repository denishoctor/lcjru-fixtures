import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise } from '../scripts/fetch-fixtures.mjs';

function makeItem(overrides = {}) {
  return {
    id:         'abc123',
    status:     'Fixture',
    compName:   'Under 12 Boys',
    compId:     'comp1',
    round:      'Round 1',
    roundLabel: 'Rd 1',
    dateTime:   '2026-05-10T09:00:00+10:00',
    venue:      'Tantallon Oval',
    isLive:     false,
    isBye:      false,
    matchLabel: null,
    homeTeam: { teamId: 't1', name: 'Lane Cove Gold 12', score: '', crest: 'crest1.png' },
    awayTeam: { teamId: 't2', name: 'Ryde Eastwood',     score: '', crest: 'crest2.png' },
    ...overrides,
  };
}

test('type=fixture when status is not Result', () => {
  assert.equal(normalise(makeItem({ status: 'Fixture' })).type, 'fixture');
  assert.equal(normalise(makeItem({ status: 'Upcoming' })).type, 'fixture');
});

test('type=result when status is Result', () => {
  assert.equal(normalise(makeItem({ status: 'Result' })).type, 'result');
});

test('empty score string normalised to null', () => {
  const m = normalise(makeItem());
  assert.equal(m.home.score, null);
  assert.equal(m.away.score, null);
});

test('zero score preserved as 0 (not coerced to null)', () => {
  const m = normalise(makeItem({
    homeTeam: { teamId: 't1', name: 'Lane Cove Gold 12', score: 0, crest: 'c.png' },
    awayTeam: { teamId: 't2', name: 'Ryde Eastwood',     score: 10, crest: 'c.png' },
  }));
  assert.equal(m.home.score, 0);
  assert.equal(m.away.score, 10);
});

test('non-zero scores preserved', () => {
  const m = normalise(makeItem({
    homeTeam: { teamId: 't1', name: 'A', score: 21, crest: 'c.png' },
    awayTeam: { teamId: 't2', name: 'B', score: 14, crest: 'c.png' },
  }));
  assert.equal(m.home.score, 21);
  assert.equal(m.away.score, 14);
});

test('roundLabel falls back to round when empty', () => {
  const m = normalise(makeItem({ roundLabel: '' }));
  assert.equal(m.roundLabel, 'Round 1');
});

test('matchLabel is null when falsy', () => {
  assert.equal(normalise(makeItem({ matchLabel: '' })).matchLabel, null);
  assert.equal(normalise(makeItem({ matchLabel: null })).matchLabel, null);
});

test('matchLabel preserved when truthy', () => {
  assert.equal(normalise(makeItem({ matchLabel: 'Grand Final' })).matchLabel, 'Grand Final');
});

test('core fields pass through unchanged', () => {
  const m = normalise(makeItem());
  assert.equal(m.id,          'abc123');
  assert.equal(m.competition, 'Under 12 Boys');
  assert.equal(m.compId,      'comp1');
  assert.equal(m.round,       'Round 1');
  assert.equal(m.dateTime,    '2026-05-10T09:00:00+10:00');
  assert.equal(m.venue,       'Tantallon Oval');
  assert.equal(m.isBye,       false);
  assert.equal(m.isLive,      false);
});

test('team fields mapped correctly', () => {
  const m = normalise(makeItem());
  assert.equal(m.home.id,    't1');
  assert.equal(m.home.name,  'Lane Cove Gold 12');
  assert.equal(m.home.crest, 'crest1.png');
  assert.equal(m.away.id,    't2');
  assert.equal(m.away.name,  'Ryde Eastwood');
  assert.equal(m.away.crest, 'crest2.png');
});
