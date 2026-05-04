/**
 * Tests for the generated docs/fixtures.json output file.
 * These catch regressions in the fetch script's normalisation logic.
 * Run: node --test tests/fixtures-json.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fixtures.json');

let data;
test('fixtures.json exists and is valid JSON', () => {
  const raw = readFileSync(fixturePath, 'utf8');
  data = JSON.parse(raw);
  assert.ok(data, 'parsed successfully');
});

test('top-level structure is complete', () => {
  for (const key of ['updated', 'season', 'entityId', 'totalMatches', 'competitions', 'matches']) {
    assert.ok(key in data, `missing top-level key "${key}"`);
  }
  assert.equal(data.season, '2026');
  assert.equal(data.entityId, 30901);
  assert.equal(data.totalMatches, data.matches.length, 'totalMatches should match actual array length');
  assert.ok(Array.isArray(data.matches) && data.matches.length > 0, 'matches should be non-empty');
  assert.ok(Array.isArray(data.competitions) && data.competitions.length > 0, 'competitions should be non-empty');
});

test('updated timestamp is a valid recent ISO date', () => {
  const d = new Date(data.updated);
  assert.ok(!isNaN(d.getTime()), 'updated should be a valid date');
  const ageMs = Date.now() - d.getTime();
  const twoDaysMs = 48 * 60 * 60 * 1000;
  assert.ok(ageMs < twoDaysMs, `fixtures.json is more than 48h old (${data.updated}) — has the cron run?`);
});

test('every match has required normalised fields', () => {
  const REQUIRED_MATCH = ['id', 'type', 'competition', 'compId', 'round', 'dateTime', 'venue', 'status'];
  const REQUIRED_TEAM = ['id', 'name', 'crest'];
  for (const match of data.matches) {
    for (const field of REQUIRED_MATCH) {
      assert.ok(match[field] !== undefined && match[field] !== null,
        `match ${match.id}: missing field "${field}"`);
    }
    for (const side of ['home', 'away']) {
      for (const field of REQUIRED_TEAM) {
        assert.ok(match[side]?.[field] !== undefined,
          `match ${match.id} ${side}: missing field "${field}"`);
      }
    }
    assert.ok(['fixture', 'result'].includes(match.type),
      `match ${match.id}: type should be "fixture" or "result", got "${match.type}"`);
  }
});

test('every match involves at least one Lane Cove team', () => {
  const isLaneCove = team =>
    team.name.toLowerCase().includes('lane cove') ||
    team.crest?.includes('/30901.');
  for (const match of data.matches) {
    assert.ok(
      isLaneCove(match.home) || isLaneCove(match.away),
      `match ${match.id} (${match.home.name} vs ${match.away.name}) has no Lane Cove team`
    );
  }
});

test('matches are sorted chronologically', () => {
  for (let i = 1; i < data.matches.length; i++) {
    const prev = new Date(data.matches[i - 1].dateTime).getTime();
    const curr = new Date(data.matches[i].dateTime).getTime();
    assert.ok(curr >= prev,
      `sort order broken between index ${i - 1} and ${i}: ${data.matches[i-1].dateTime} > ${data.matches[i].dateTime}`);
  }
});

test('results have non-null scores, fixtures have null scores', () => {
  const results = data.matches.filter(m => m.type === 'result' && m.home.score !== null);
  assert.ok(results.length > 0, 'expected at least some results with scores');
  // Fixtures should not have scores (score field is null when not played)
  const fixturesWithScore = data.matches.filter(
    m => m.type === 'fixture' && m.home.score !== null && m.home.score !== ''
  );
  assert.equal(fixturesWithScore.length, 0, 'no fixture should have a score');
});

test('no duplicate match IDs', () => {
  const ids = data.matches.map(m => m.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, `found ${ids.length - unique.size} duplicate match IDs`);
});
