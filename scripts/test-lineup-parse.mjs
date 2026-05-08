/**
 * Unit test for the lineup parsing logic in fetch-lineups.mjs.
 * Uses the actual __NEXT_DATA__ structure confirmed by probe-lineup.mjs.
 * No network calls — safe to run anywhere.
 *
 * Run: node scripts/test-lineup-parse.mjs
 */

import assert from 'node:assert/strict';

// ── The parsing logic (copy of what's in fetch-lineups.mjs) ──────────────────

function extractLineup(pageProps) {
  const lineUp = pageProps?.matchData?.allMatchStatsSummary?.lineUp;
  if (!lineUp) return { home: [], away: [] };

  const allPlayers = [
    ...(lineUp.players     ?? []),
    ...(lineUp.substitutes ?? []),
  ];

  const normalise = p => ({
    number:   p.shirtNumber ?? '',
    name:     p.name ?? '',
    position: p.position ?? '',
    captain:  p.captainType === 'captain',
    isSub:    parseInt(p.position) >= 16,
  });

  const sort = arr => arr.slice().sort((a, b) => parseInt(a.position) - parseInt(b.position));

  const home = sort(allPlayers.filter(p => p.isHome === true )).map(normalise);
  const away = sort(allPlayers.filter(p => p.isHome === false)).map(normalise);

  return { home, away };
}

// ── Fixture data from probe-lineup.mjs on match 434236a5964c39608 ─────────────
// Real structure from pageProps.matchData.allMatchStatsSummary.lineUp

const PROBE_PAGE_PROPS = {
  matchData: {
    allMatchStatsSummary: {
      lineUp: {
        players: [
          { name: 'William Brown',      position: '14', shirtNumber: '14', isHome: true,  captainType: '',       frontRow: false },
          { name: 'Hudson Brown',       position: '10', shirtNumber: '9',  isHome: true,  captainType: '',       frontRow: false },
          { name: 'Hunter Circosta',    position: '15', shirtNumber: '15', isHome: true,  captainType: '',       frontRow: false },
          { name: 'Benjamin Doumit',    position: '13', shirtNumber: '13', isHome: true,  captainType: '',       frontRow: false },
          { name: 'Joseph Duffy',       position: '12', shirtNumber: '12', isHome: true,  captainType: '',       frontRow: false },
          { name: 'Samuel Hsu',         position: '3',  shirtNumber: '19', isHome: true,  captainType: '',       frontRow: true  },
          { name: 'Xavier Johnson',     position: '9',  shirtNumber: '10', isHome: true,  captainType: '',       frontRow: false },
          { name: 'Liam Last',          position: '11', shirtNumber: '11', isHome: true,  captainType: '',       frontRow: false },
          { name: "Alexander O'Brien", position: '4',  shirtNumber: '4',  isHome: true,  captainType: '',       frontRow: false },
          { name: 'Jackson Libby',      position: '1',  shirtNumber: '1',  isHome: true,  captainType: '',       frontRow: true  },
          { name: 'Alexander Angelucci',position: '8',  shirtNumber: '7',  isHome: true,  captainType: '',       frontRow: false },
          { name: 'Name Withheld',      position: '2',  shirtNumber: '2',  isHome: true,  captainType: '',       frontRow: true  },
          { name: 'Ted Forsey',         position: '7',  shirtNumber: '8',  isHome: true,  captainType: '',       frontRow: true  },
          { name: 'Jack Millane',       position: '6',  shirtNumber: '6',  isHome: true,  captainType: '',       frontRow: true  },
          { name: 'Finn Gibson',        position: '5',  shirtNumber: '5',  isHome: true,  captainType: '',       frontRow: false },
        ],
        substitutes: [
          { name: 'Henry Pfafflin', position: '18', shirtNumber: '20', isHome: true, captainType: '', frontRow: false },
          { name: 'Billy Hamilton', position: '17', shirtNumber: '16', isHome: true, captainType: '', frontRow: false },
          { name: 'Bill Giblin',    position: '19', shirtNumber: '21', isHome: true, captainType: '', frontRow: false },
          { name: 'Patrick Burke',  position: '16', shirtNumber: '25', isHome: true, captainType: '', frontRow: false },
        ],
        coaches: [
          { name: 'James Bacon', position: '0', shirtNumber: '', isHome: true, captainType: null },
        ],
      },
    },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('Running lineup parse tests…\n');
let passed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const { home, away } = extractLineup(PROBE_PAGE_PROPS);

test('home team has 15 starters', () => assert.equal(home.filter(p => !p.isSub).length, 15));
test('home team has 4 subs', ()      => assert.equal(home.filter(p =>  p.isSub).length,  4));
test('away team is empty (not published)', () => assert.equal(away.length, 0));

test('home starters are sorted by position (1 first, 15 last)', () => {
  const starters = home.filter(p => !p.isSub);
  assert.equal(starters[0].name, 'Jackson Libby');    // position 1, index 0
  assert.equal(starters[0].number, '1');
  assert.equal(starters[13].name, 'William Brown');   // position 14, index 13
  assert.equal(starters[14].name, 'Hunter Circosta'); // position 15, index 14
});

test('shirtNumber used as display number (not position)', () => {
  // Hudson Brown: position=10 (flyhalf), shirtNumber=9
  const hudson = home.find(p => p.name === 'Hudson Brown');
  assert.ok(hudson, 'Hudson Brown should be in home team');
  assert.equal(hudson.number, '9');
  assert.equal(hudson.position, '10');
  assert.equal(hudson.isSub, false);
});

test('subs are marked isSub=true (position >= 16)', () => {
  const burke = home.find(p => p.name === 'Patrick Burke');
  assert.ok(burke, 'Patrick Burke should be in home team');
  assert.equal(burke.isSub, true);
  assert.equal(burke.number, '25');
});

test('subs are sorted by position after starters', () => {
  const subs = home.filter(p => p.isSub);
  assert.equal(subs[0].name, 'Patrick Burke');   // position 16
  assert.equal(subs[1].name, 'Billy Hamilton');  // position 17
  assert.equal(subs[2].name, 'Henry Pfafflin');  // position 18
  assert.equal(subs[3].name, 'Bill Giblin');     // position 19
});

test('coach is excluded (position 0 is filtered by isHome split, coaches array ignored)', () => {
  // Coaches are in a separate array that we don't include in allPlayers
  const coach = home.find(p => p.name === 'James Bacon');
  assert.equal(coach, undefined);
});

test('captain flag false when captainType is empty string', () => {
  assert.ok(home.every(p => p.captain === false));
});

test('null lineUp returns empty arrays', () => {
  const result = extractLineup({ matchData: { allMatchStatsSummary: { lineUp: null } } });
  assert.deepEqual(result, { home: [], away: [] });
});

test('missing matchData returns empty arrays', () => {
  const result = extractLineup({});
  assert.deepEqual(result, { home: [], away: [] });
});

console.log(`\n${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
