/**
 * Tests for the generated docs/fixtures.json output file.
 * These catch regressions in the fetch script's normalisation logic.
 * Run: node --test tests/fixtures-json.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { SEASON, ENTITY_ID, TEAM_SLUGS } from '../scripts/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(ROOT, 'docs', 'fixtures.json');

// Parse once at the top level so all tests share the same data object.
const raw = readFileSync(fixturePath, 'utf8');
const data = JSON.parse(raw);

const isLaneCove = team =>
  team.name.toLowerCase().includes('lane cove') ||
  team.crest?.includes('/30901.');

test('fixtures.json exists and is valid JSON', () => {
  assert.ok(existsSync(fixturePath), 'fixtures.json does not exist');
  assert.ok(data, 'parsed successfully');
});

test('top-level structure is complete', () => {
  for (const key of ['updated', 'season', 'entityId', 'totalMatches', 'competitions', 'matches']) {
    assert.ok(key in data, `missing top-level key "${key}"`);
  }
  assert.equal(data.season, SEASON);
  assert.equal(data.entityId, ENTITY_ID);
  assert.equal(data.totalMatches, data.matches.length, 'totalMatches should match actual array length');
  assert.ok(Array.isArray(data.matches) && data.matches.length > 0, 'matches should be non-empty');
  assert.ok(Array.isArray(data.competitions) && data.competitions.length > 0, 'competitions should be non-empty');
});

test('updated timestamp is a valid recent ISO date', () => {
  const d = new Date(data.updated);
  assert.ok(!isNaN(d.getTime()), 'updated should be a valid date');
  const ageMs = Date.now() - d.getTime();
  const sixHoursMs = 6 * 60 * 60 * 1000;
  assert.ok(ageMs < sixHoursMs, `fixtures.json is more than 6h old (${data.updated}) — has the cron run?`);
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
  // Verify 0 scores are preserved (not coerced to null)
  const zeroScoreResults = data.matches.filter(
    m => m.type === 'result' && (m.home.score === 0 || m.away.score === 0)
  );
  for (const m of zeroScoreResults) {
    assert.ok(m.home.score !== null || m.away.score !== null,
      `match ${m.id}: zero score was incorrectly coerced to null`);
  }
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

test('all team IDs in matches are known slugs or opponents', () => {
  const knownIds = new Set(Object.values(TEAM_SLUGS));
  for (const match of data.matches) {
    const lcSide = isLaneCove(match.home) ? match.home : match.away;
    assert.ok(knownIds.has(lcSide.id),
      `match ${match.id}: Lane Cove team id "${lcSide.id}" not in TEAM_SLUGS`);
  }
});

test('per-team ICS files exist for all slugs', () => {
  for (const slug of Object.keys(TEAM_SLUGS)) {
    const icsPath = join(ROOT, 'docs', `${slug}.ics`);
    assert.ok(existsSync(icsPath), `missing ICS file: docs/${slug}.ics`);
    const content = readFileSync(icsPath, 'utf8');
    assert.ok(content.startsWith('BEGIN:VCALENDAR'), `docs/${slug}.ics is not a valid iCalendar file`);
    assert.ok(content.includes('END:VCALENDAR'), `docs/${slug}.ics is missing END:VCALENDAR`);
  }
});
