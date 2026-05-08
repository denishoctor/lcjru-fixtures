# LCJRU Fixtures

Live fixtures, results, and match-day team sheets for **Lane Cove Junior Rugby Union**, fetched from Rugby Xplorer and served as a static GitHub Pages site.

**Live page:** https://denishoctor.github.io/lcjru-fixtures/

---

## How it works

1. `scripts/fetch-fixtures.mjs` calls the Rugby Xplorer GraphQL API for all LCJRU teams, diffs against the previous run to detect changes, and writes `docs/fixtures.json`, per-team `.ics` feeds, and `changes.txt`.
2. `scripts/fetch-lineups.mjs` scrapes the Rugby Xplorer match-centre HTML for each match, extracts the `__NEXT_DATA__` JSON payload, and writes `docs/lineups.json` with player, reserve, coach, and referee data.
3. GitHub Actions runs both scripts on a cron schedule and commits the updated files.
4. `docs/index.html` fetches `fixtures.json` and `lineups.json` at runtime and renders them — no build step.

---

## Data sources

| Data | Source | Method |
|---|---|---|
| Fixtures, results, team IDs | `https://rugby-au-cms.graphcdn.app/` | GraphQL — `EntityFixturesAndResults` |
| Player lineups, coaches, referees | `https://xplorer.rugby/lcjru-/match-centre/{id}` | HTML scrape — `__NEXT_DATA__` JSON |

Club entity ID: `30901` (Lane Cove JRU) · Season: 2026

---

## Refresh schedule

The workflow runs every 30 minutes, 24/7:

```
0  * * * *   # every hour on the hour
30 * * * *   # every hour on the half-hour
```

If venue, time, new, or removed fixtures are detected, a push notification is sent via [ntfy.sh](https://ntfy.sh) using the `NTFY_TOPIC` repository secret. A failure notification is also sent if the workflow errors.

---

## UI features

- **Minis** (U6–U9) and **Juniors** (U10–U15) token filter rows
- Shareable URL hash deep-links: `#u11`, `#u13-blue`, etc.
- Per-match anchor links (`#match-<id>`)
- **Upcoming fixtures** — next match highlighted; past unfinalised fixtures shown with muted styling
- **Completed games** — scored Junior results show Win / Loss / Draw pill; Minis show no score (not recorded)
- **HOME** badge appears only at Tantallon Oval
- Venue names cleaned of pitch allocation noise ("Tryon Oval TT1 (U6/U7)" → "Tryon Oval, Ryde") via a lookup table in `docs/config.js`
- **iCal / webcal** feed and **Google Calendar** link per team
- **Match team sheets** — click the chevron on any fixture row to expand a two-column lineup panel:
  - Starters (jersey number · name · captain badge), Reserves, Coaches aligned side-by-side
  - Club crests in column headers
  - Referee and Referee Coach in the panel footer
  - Rows pad to equal length so sections always align across both columns
  - Rows with no published lineup show "Not published"
  - Panel updates every 30 minutes via CI; historic matches (>15 days) are locked and not re-fetched

---

## Running locally

```bash
# Fetch fresh fixture data
node scripts/fetch-fixtures.mjs

# Lineup commands
node scripts/test-lineup-parse.mjs            # unit tests — no network required (15 tests)
node scripts/fetch-lineups.mjs --match <id>   # smoke test: fetch one match, print result, no file writes
node scripts/fetch-lineups.mjs                # full run — writes docs/lineups.json
node scripts/fetch-lineups.mjs --force-all    # bypass 15-day lock; re-fetches all matches

# Diagnose a match's raw __NEXT_DATA__ structure
node scripts/probe-lineup.mjs <matchId>

# Validate generated files
npm run check   # asserts all required files are present in docs/
npm run smoke   # starts a local HTTP server and fetches fixtures.json, config.js, index.html, a .ics

# Tests
node --test tests/api.test.mjs            # live API integration tests
node --test tests/fixtures-json.test.mjs  # local JSON structure tests
```

---

## Repository structure

```
scripts/
  config.mjs              Single source of truth — season, team IDs, venue lookup table
  fetch-fixtures.mjs      GraphQL fetch, diff, JSON + ICS writer
  fetch-lineups.mjs       HTML scraper for match team sheets; writes lineups.json
  probe-lineup.mjs        Diagnostic — dumps __NEXT_DATA__ pageProps for a match (run locally)
  test-lineup-parse.mjs   Offline unit tests for lineup parsing logic (no network)
  check.mjs               Asserts all required generated files exist
  smoke.mjs               Local HTTP server smoke test
docs/
  config.js               Generated — browser-loadable version of scripts/config.mjs
  fixtures.json           Generated — committed by CI
  lineups.json            Generated — committed by CI; matchId → { home, away, coaches, officials }
  index.html              Production UI (single-file, no build step)
  staging-index.html      Staging area for new features before promotion to index.html
  *.ics                   Per-team iCalendar feeds — committed by CI
tests/
  api.test.mjs            Live API integration tests
  fixtures-json.test.mjs  Local JSON structure tests
.github/workflows/
  refresh-fixtures.yml    Cron job — fetch fixtures + lineups, notify, commit
  resync-lineups.yml      Manual workflow_dispatch — force-refetch all historic lineups
```

---

## Lineup caching

`lineups.json` is the persistent cache. On each cron run:

- **Match played > 15 days ago AND entry exists** → skip (locked; team sheets don't change after the game)
- **All other matches** → fetch

Run the **Resync All Lineups** workflow manually (`Actions → Resync All Lineups → Run workflow`) to force-refetch everything — useful after adding new data fields or fixing parsing bugs.

---

## Development

**Staging convention:** `staging-index.html` is a full copy of `index.html` used as a development sandbox. Features are built and reviewed there before being promoted.

- Staging URL: `https://denishoctor.github.io/lcjru-fixtures/staging-index.html`
- Production URL: `https://denishoctor.github.io/lcjru-fixtures/`

**Promoting staging to production:**
```bash
cp docs/staging-index.html docs/index.html
git add docs/index.html && git commit -m "feat: promote staging to production"
```

**Adding a new season (annual):** Update `SEASON`, and if team IDs change also update `TEAM_SLUGS` and `LCJRU_TEAM_IDS` — all in `scripts/config.mjs`. Run the fetch script once to regenerate `docs/config.js` and the `.ics` feeds.
