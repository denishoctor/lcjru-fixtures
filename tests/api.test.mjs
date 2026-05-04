/**
 * Integration tests for the Rugby Xplorer GraphQL API.
 * These run against the live endpoint — they catch breaking API changes early.
 * Run: node --test tests/api.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEASON, ENTITY_ID } from '../scripts/config.mjs';

const GQL = 'https://rugby-au-cms.graphcdn.app/';

const QUERY = `query EntityFixturesAndResults(
  $entityId: Int, $entityType: String, $season: String,
  $comps: [CompInput], $teams: [String], $type: String,
  $skip: Int, $limit: Int
) {
  getEntityFixturesAndResults(
    season: $season comps: $comps teams: $teams
    entityId: $entityId entityType: $entityType
    type: $type limit: $limit skip: $skip
  ) {
    id compId compName dateTime round roundLabel
    status venue isLive isBye
    homeTeam { id name teamId score crest }
    awayTeam { id name teamId score crest }
  }
}`;

// A subset of known 2026 team IDs
const KNOWN_TEAM_IDS = [
  '84q7BEamwEAGPZgc2', // Lane Cove Gold 7
  '52MoHPFgMFTPppk9H', // Lane Cove Blue 7
  'AX6MBpn8Xva2AmC8N', // Lane Cove Gold 13
];

async function gql(variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'https://xplorer.rugby',
      'referer': 'https://xplorer.rugby/',
    },
    body: JSON.stringify({ operationName: 'EntityFixturesAndResults', variables, query: QUERY }),
  });
  assert.equal(res.ok, true, `HTTP ${res.status}`);
  const json = await res.json();
  assert.ok(!json.errors, `GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data.getEntityFixturesAndResults;
}

test('endpoint is reachable and returns an array', async () => {
  const items = await gql({
    season: SEASON, comps: [], teams: [], type: 'fixtures',
    skip: 0, limit: 1, entityId: ENTITY_ID, entityType: 'club',
  });
  assert.ok(Array.isArray(items), 'expected array');
  assert.ok(items.length >= 1, 'expected at least one fixture');
});

test('each fixture has the required fields', async () => {
  const items = await gql({
    season: SEASON, comps: [], teams: KNOWN_TEAM_IDS, type: 'fixtures',
    skip: 0, limit: 5, entityId: ENTITY_ID, entityType: 'club',
  });
  const REQUIRED = ['id', 'compId', 'compName', 'dateTime', 'round', 'status', 'venue'];
  for (const item of items) {
    for (const field of REQUIRED) {
      assert.ok(item[field] !== undefined && item[field] !== null, `missing field "${field}" in ${item.id}`);
    }
    assert.ok(item.homeTeam?.name, 'homeTeam.name missing');
    assert.ok(item.awayTeam?.name, 'awayTeam.name missing');
    assert.ok(item.homeTeam?.crest?.startsWith('https://'), 'homeTeam.crest should be a URL');
  }
});

test('dateTime is a valid parseable ISO 8601 string', async () => {
  const items = await gql({
    season: SEASON, comps: [], teams: KNOWN_TEAM_IDS, type: 'fixtures',
    skip: 0, limit: 10, entityId: ENTITY_ID, entityType: 'club',
  });
  for (const item of items) {
    const d = new Date(item.dateTime);
    assert.ok(!isNaN(d.getTime()), `invalid dateTime "${item.dateTime}" in ${item.id}`);
    assert.equal(d.getFullYear(), Number(SEASON), `unexpected year in ${item.dateTime}`);
  }
});

test('team filter returns only matches involving those teams', async () => {
  const targetId = '84q7BEamwEAGPZgc2'; // Lane Cove Gold 7
  const items = await gql({
    season: SEASON, comps: [], teams: [targetId], type: 'fixtures',
    skip: 0, limit: 50, entityId: ENTITY_ID, entityType: 'club',
  });
  assert.ok(items.length > 0, 'expected fixtures for team');
  for (const item of items) {
    const involvedIds = [item.homeTeam.teamId, item.awayTeam.teamId];
    assert.ok(involvedIds.includes(targetId),
      `match ${item.id} does not involve team ${targetId}: ${JSON.stringify(involvedIds)}`);
  }
});

test('type=results returns scored matches', async () => {
  const items = await gql({
    season: SEASON, comps: [], teams: KNOWN_TEAM_IDS, type: 'results',
    skip: 0, limit: 20, entityId: ENTITY_ID, entityType: 'club',
  });
  // At least some results should exist by now in the season
  assert.ok(items.length > 0, 'expected at least one result');
  const withScores = items.filter(i => i.homeTeam.score !== '' || i.awayTeam.score !== '');
  assert.ok(withScores.length > 0, 'expected at least one result with scores');
});

test('pagination retrieves more records than a single page allows', async () => {
  // The API sorts by date and matches on the same date can appear in either
  // page with small offsets, so we test total unique coverage rather than
  // strict non-overlap. We know from real data there are 100+ fixtures.
  const LIMIT = 50;
  const vars = {
    season: SEASON, comps: [], teams: [], type: 'fixtures',
    entityId: ENTITY_ID, entityType: 'club', limit: LIMIT,
  };
  const page0 = await gql({ ...vars, skip: 0 });
  const page1 = await gql({ ...vars, skip: LIMIT });
  assert.ok(page0.length === LIMIT, `page0 should be full (got ${page0.length})`);
  assert.ok(page1.length > 0, 'page1 should have items — there are more than 50 total fixtures');
  // Combined unique IDs should exceed a single page
  const allIds = new Set([...page0, ...page1].map(i => i.id));
  assert.ok(allIds.size > LIMIT, `expected more than ${LIMIT} unique fixtures across two pages, got ${allIds.size}`);
});
