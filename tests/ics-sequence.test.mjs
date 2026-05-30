import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsSequence, generateICS } from '../scripts/fetch-fixtures.mjs';

// ── icsSequence unit behaviour ────────────────────────────────────────────────

test('a brand-new UID starts at SEQUENCE 0 and records its hash', () => {
  const state = {};
  assert.equal(icsSequence(state, 'a@x', 'h1'), 0);
  assert.deepEqual(state['a@x'], { seq: 0, hash: 'h1' });
});

test('unchanged content keeps the same SEQUENCE', () => {
  const state = {};
  icsSequence(state, 'a@x', 'h1');
  assert.equal(icsSequence(state, 'a@x', 'h1'), 0);
  assert.equal(icsSequence(state, 'a@x', 'h1'), 0);
});

test('changed content bumps SEQUENCE by one and stores the new hash', () => {
  const state = {};
  icsSequence(state, 'a@x', 'h1');
  assert.equal(icsSequence(state, 'a@x', 'h2'), 1);
  assert.deepEqual(state['a@x'], { seq: 1, hash: 'h2' });
});

test('SEQUENCE is monotonic across repeated changes', () => {
  const state = {};
  icsSequence(state, 'a@x', 'h1');           // 0
  assert.equal(icsSequence(state, 'a@x', 'h2'), 1);
  assert.equal(icsSequence(state, 'a@x', 'h3'), 2);
  assert.equal(icsSequence(state, 'a@x', 'h3'), 2); // settle — no further bump
  assert.equal(icsSequence(state, 'a@x', 'h4'), 3);
});

test('different UIDs track independently', () => {
  const state = {};
  icsSequence(state, 'a@x', 'h1');
  icsSequence(state, 'b@x', 'h1');
  assert.equal(icsSequence(state, 'a@x', 'hZ'), 1); // a bumps
  assert.equal(icsSequence(state, 'b@x', 'h1'), 0); // b unchanged
});

// ── integration through generateICS ───────────────────────────────────────────

const TEAM = 'wjBCCDfvXpx8QivYu'; // u6-gold
function fixture(over = {}) {
  return {
    id: 'x1', type: 'fixture', competition: 'SJRU Minis U6 Tri Time Sunday',
    round: 'Round 5', dateTime: '2026-05-31T08:40:00+10:00',
    venue: 'Tantallon Oval TT3 (U6/U7)', isBye: false,
    home: { id: TEAM, name: 'Lane Cove Gold 6', crest: '' },
    away: { id: 'o', name: 'Chatswood 6', crest: '' },
    ...over,
  };
}
const seqOf = (ics) => ics.match(/SEQUENCE:(\d+)/)[1];

test('first generation emits SEQUENCE 0', () => {
  const state = {};
  const ics = generateICS('u6-gold', TEAM, [fixture()], '2026-05-30T00:00:00Z', state);
  assert.equal(seqOf(ics), '0');
});

test('a fresh run with only a new DTSTAMP/LAST-MODIFIED does NOT bump SEQUENCE', () => {
  const state = {};
  generateICS('u6-gold', TEAM, [fixture()], '2026-05-30T00:00:00Z', state);
  // identical fixture, different updatedISO (→ different LAST-MODIFIED/DTSTAMP)
  const ics = generateICS('u6-gold', TEAM, [fixture()], '2026-05-30T06:00:00Z', state);
  assert.equal(seqOf(ics), '0');
});

test('a venue change bumps SEQUENCE so clients overwrite the cached event', () => {
  const state = {};
  generateICS('u6-gold', TEAM, [fixture()], '2026-05-30T00:00:00Z', state);
  const ics = generateICS('u6-gold', TEAM, [fixture({ venue: 'Hassall Park TT3 (U6/U7)' })], '2026-05-30T06:00:00Z', state);
  assert.equal(seqOf(ics), '1');
});

test('a time change bumps SEQUENCE', () => {
  const state = {};
  generateICS('u6-gold', TEAM, [fixture()], '2026-05-30T00:00:00Z', state);
  const ics = generateICS('u6-gold', TEAM, [fixture({ dateTime: '2026-05-31T09:00:00+10:00' })], '2026-05-30T06:00:00Z', state);
  assert.equal(seqOf(ics), '1');
});

test('omitting seqState defaults to a fresh map (SEQUENCE 0, no throw)', () => {
  const ics = generateICS('u6-gold', TEAM, [fixture()], '2026-05-30T00:00:00Z');
  assert.equal(seqOf(ics), '0');
});
