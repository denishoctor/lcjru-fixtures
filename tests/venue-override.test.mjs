import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVenueOverrides } from '../scripts/fetch-fixtures.mjs';
import { VENUE_OVERRIDES, TEAM_SLUGS } from '../scripts/config.mjs';
import { renderHomeMatchRow } from '../docs/render.mjs';

// A rule mirroring the real U6/U7 → Hassall Park move, but pinned to fixed dates
// so these tests don't depend on wall-clock time.
const RULE = {
  venueIncludes: 'Tantallon Oval',
  teamIds: [TEAM_SLUGS['u6-gold'], TEAM_SLUGS['u6-blue'], TEAM_SLUGS['u7-gold'], TEAM_SLUGS['u7-blue']],
  dateFrom: '2026-05-30',
  dateTo:   '2026-06-01',
  setVenue: 'Hassall Park',
  note:     'Moved from Tantallon Oval',
  expires:  '2026-06-01T12:00:00Z',
};
const BEFORE_EXPIRY = new Date('2026-05-30T08:00:00Z');

function makeMatch(over = {}) {
  return {
    id: 'm1', competition: 'SJRU Minis U6 Tri Time Sunday', round: 'Round 5',
    dateTime: '2026-05-30T22:00:00+00:00', venue: 'Tantallon Oval TT3 (U6/U7)',
    home: { id: TEAM_SLUGS['u6-gold'], name: 'Lane Cove Gold 6' },
    away: { id: 'opp', name: 'Chatswood 6' },
    ...over,
  };
}

test('rewrites venue + tags venueChange for a matching U6/U7 fixture', () => {
  const [m] = applyVenueOverrides([makeMatch()], [RULE], BEFORE_EXPIRY);
  assert.equal(m.venue, 'Hassall Park');
  assert.deepEqual(m.venueChange, { from: 'Tantallon Oval TT3 (U6/U7)', note: 'Moved from Tantallon Oval' });
});

test('matches on the away team id too', () => {
  const m = makeMatch({ home: { id: 'opp', name: 'St Ives 7' }, away: { id: TEAM_SLUGS['u7-blue'], name: 'Lane Cove Blue 7' } });
  assert.equal(applyVenueOverrides([m], [RULE], BEFORE_EXPIRY)[0].venue, 'Hassall Park');
});

test('leaves a non-U6/U7 team at Tantallon untouched', () => {
  const m = makeMatch({ home: { id: TEAM_SLUGS['u10'], name: 'Lane Cove 10' }, competition: 'SJRU XVs Under 10' });
  const [out] = applyVenueOverrides([m], [RULE], BEFORE_EXPIRY);
  assert.equal(out.venue, 'Tantallon Oval TT3 (U6/U7)');
  assert.equal(out.venueChange, undefined);
});

test('leaves a U6/U7 fixture outside the date window untouched', () => {
  const m = makeMatch({ dateTime: '2026-06-13T22:00:00Z' }); // Round 6 — already at Hassall
  assert.equal(applyVenueOverrides([m], [RULE], BEFORE_EXPIRY)[0].venue, 'Tantallon Oval TT3 (U6/U7)');
});

test('leaves a fixture not at Tantallon untouched (feed already caught up)', () => {
  const m = makeMatch({ venue: 'Hassall Park TT3 (U6/U7)' });
  const [out] = applyVenueOverrides([m], [RULE], BEFORE_EXPIRY);
  assert.equal(out.venue, 'Hassall Park TT3 (U6/U7)');
  assert.equal(out.venueChange, undefined);
});

test('does nothing once the rule has expired', () => {
  const after = new Date('2026-06-02T00:00:00Z');
  const [out] = applyVenueOverrides([makeMatch()], [RULE], after);
  assert.equal(out.venue, 'Tantallon Oval TT3 (U6/U7)');
  assert.equal(out.venueChange, undefined);
});

test('is idempotent — re-applying does not re-tag or re-trigger', () => {
  const once = applyVenueOverrides([makeMatch()], [RULE], BEFORE_EXPIRY);
  const twice = applyVenueOverrides(structuredClone(once), [RULE], BEFORE_EXPIRY);
  assert.equal(twice[0].venue, 'Hassall Park');
  // Already at the target venue → skipped, so `from` is never overwritten with 'Hassall Park'.
  assert.equal(twice[0].venueChange.from, 'Tantallon Oval TT3 (U6/U7)');
});

test('real VENUE_OVERRIDES config moves the live U6/U7 Tantallon fixture', () => {
  const [out] = applyVenueOverrides([makeMatch()], VENUE_OVERRIDES, BEFORE_EXPIRY);
  assert.equal(out.venue, 'Hassall Park');
  assert.equal(out.venueChange.note, 'Moved from Tantallon Oval');
});

// ── render: the move must be visible to parents ───────────────────────────────

const HOME_CTX = { venues: {}, slugById: { lc: 'u6-gold' } };
const movedRow = {
  id: 'm1', dateTime: '2026-05-30T22:00:00Z', venue: 'Hassall Park',
  venueChange: { from: 'Tantallon Oval TT3 (U6/U7)', note: 'Moved from Tantallon Oval' },
  home: { name: 'Lane Cove Gold 6', id: 'lc', crest: '', score: null },
  away: { name: 'Chatswood 6', id: 'o', crest: '', score: null },
};

test('renderHomeMatchRow shows a Moved badge + new venue when venueChange is set', () => {
  const html = renderHomeMatchRow(movedRow, HOME_CTX);
  assert.ok(html.includes('venue-moved'), 'moved badge class');
  assert.ok(html.includes('>Moved<'), 'moved badge label');
  assert.ok(html.includes('Hassall Park'), 'shows the new venue');
});

test('renderHomeMatchRow has no Moved badge for an ordinary fixture', () => {
  const { venueChange, ...plain } = movedRow;
  assert.ok(!renderHomeMatchRow(plain, HOME_CTX).includes('venue-moved'));
});
