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

Two cron workflows feed `docs/fixtures.json`:

```
# refresh-fixtures.yml — full refresh (fixtures + lineups + events) 24/7
0  * * * *
30 * * * *

# refresh-live.yml — fixtures only, weekend match windows in AEST/AEDT
*/5 21-23 * * 5,6   # Fri/Sat 21–23 UTC ≈ Sat/Sun 07–10 AEST
*/5 0-7 * * 6       # Sat 00–07 UTC ≈ Sat 10–18 AEST
*/5 0-4 * * 0       # Sun 00–04 UTC ≈ Sun 10–14 AEST
```

The live workflow exists so U10+ scores tick during games. GitHub Actions cron has a hard floor of 5 minutes, so that's the freshness floor on the CI side. The live job skips the lineup + events build (those don't change during a game) and rebases on push collisions with the main job.

If venue, time, new, or removed fixtures are detected (on the main job only — the live job stays quiet during games), a push notification is sent via [ntfy.sh](https://ntfy.sh) using the `NTFY_TOPIC` repository secret. A failure notification is also sent if the main workflow errors.

---

## Live score auto-refresh

While the tab is visible AND a match is in a live window, `docs/index.html` re-fetches `fixtures.json?live=<minute-bucket>` every 60 s and patches the affected rows in place. Expanded lineup / venue panels keep their state — only the score / live pill is replaced. The Service Worker bypasses cache for the cache-busted URL so stale data never wins.

A match qualifies as "live" if `isLive: true`, or as a backstop the kickoff is within −5 / +150 min (catches the gap before Xplorer flips the flag at kick-off and after full-time before status moves to `Result`). Outside any live window the ticker is a no-op.

End-to-end latency during a live game: ≤5 min (CI cron) + ~1 min (Pages CDN) + ≤60 s (client poll) ≈ 6–7 min worst case.

---

## Calendar feed caching

Subscribed `.ics` feeds refresh on the calendar app's schedule, not when we publish:

- **Apple Calendar** honours `X-PUBLISHED-TTL: PT6H` in each feed — refreshes roughly hourly.
- **Google Calendar** ignores publisher hints and polls every 12–24 hours.

A content change can take up to a day to appear on a subscriber's device. Re-subscribing to the same URL within that window can serve a stale fetch from Google's CDN even after GitHub Pages has the new file.

**Workaround for stale subscribers:** append any query string to the webcal URL and re-subscribe — GitHub Pages ignores the query string but Google treats it as a new URL and fetches from origin:

```
webcal://denishoctor.github.io/lcjru-fixtures/u7-gold.ics?refresh=1
```

Useful when communicating a known release to existing subscribers. Don't bake a permanent `?v=N` into the published links — it only helps users who manually re-subscribe (existing subscribers keep polling the URL they already hold), and it fragments shared links across the club.

---

## UI features

- **Home page** — at-a-glance summary when no team is selected:
  - **This weekend** — every LCJRU match for the upcoming Sat–Sun, plus any club events that fall in the window (e.g. Mother's Day)
  - **Last weekend's results** — scored matches only; walks back up to 6 weeks so a school-holiday or bye weekend doesn't render an empty section
  - **Coming up** — special non-round events (galas, tours, presentation day) for the next ~12 weeks
  - Compact single-line rows; tap any row to deep-link into that team's full schedule with the match/event expanded
- **Minis** (U6–U9) and **Juniors** (U10–U15) token filter rows
- Shareable URL hash deep-links: `#u11`, `#u13-blue`, etc.
- Per-match anchor links (`#match-<id>`)
- **Upcoming fixtures** — next match highlighted; past unfinalised fixtures shown with muted styling
- **Live scores (U10+)** — in-progress matches show a red pulsing "Live" badge with the running score; the home view swaps kick-off time for the running score. Updates tick every 60 s while the tab is visible (see [Live score auto-refresh](#live-score-auto-refresh))
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
# Full UI rendering in browser
npm run serve
# Opens http://localhost:3000/
# Uses the committed docs/ files — run fetch scripts first if you want fresh data.

# Fetch fresh fixture data
node scripts/fetch-fixtures.mjs

# Lineup commands
node scripts/fetch-lineups.mjs --match <id>   # smoke test: fetch one match, print result, no file writes
node scripts/fetch-lineups.mjs                # full run — writes docs/lineups.json
node scripts/fetch-lineups.mjs --force-all    # bypass 15-day lock; re-fetches all matches

# Diagnose a match's raw __NEXT_DATA__ structure
node scripts/probe-lineup.mjs <matchId>

# Validate generated files
npm run check   # asserts all required files are present in docs/
npm run smoke   # starts a local HTTP server and verifies all endpoints

# Tests (all offline, no network required)
npm test                      # all 77 unit tests
npm run test:normalise        # normalise() — score handling, type mapping
npm run test:lineup           # parseLineupData() — players, coaches, officials
npm run test:render           # render.mjs helpers — esc, scoreClass, parseVenue, etc.
npm run test:ics              # ICS file structure and RFC 5545 compliance
npm run test:json             # fixtures.json structure and field completeness
npm run test:api              # live API integration tests (requires network)
```

---

## Analytics

**GoatCounter** — privacy-friendly, cookieless, no consent banner. Page views are recorded automatically by `count.js`. User actions are reported as custom events via `window.goatcounter.count({ path, event: true })`:

- `team-<slug>` — team filter token tapped (e.g. `team-u10`)
- `lineup-<matchId>` / `venue-<matchId>` — fixture row expanded into the lineup or venue panel
- `cal-ical` / `cal-google` / `cal-copy-ics` — calendar-subscribe popover actions
- `share-link` — copy team link button

The endpoint (`https://lcjru.goatcounter.com/count`) lives inline in `docs/index.html` — change the subdomain there if the GoatCounter site is rotated. The service worker explicitly bypasses `gc.zgo.at` and `*.goatcounter.com` so events aren't served from cache.

---

## Repository structure

```
scripts/
  config.mjs              Single source of truth — season, team IDs, venue lookup table
  fetch-fixtures.mjs      GraphQL fetch, diff, JSON + ICS writer
  fetch-lineups.mjs       HTML scraper for match team sheets; writes lineups.json
  probe-lineup.mjs        Diagnostic — dumps __NEXT_DATA__ pageProps for a match (run locally)
  check.mjs               Asserts all required generated files exist
  smoke.mjs               Local HTTP server smoke test
docs/
  config.js               Generated — browser-loadable version of scripts/config.mjs
  fixtures.json           Generated — committed by CI
  lineups.json            Generated — committed by CI; matchId → { home, away, coaches, officials }
  render.mjs              Pure render helpers (ES module) — imported by index.html
  index.html              UI — <script type="module"> importing render.mjs
  *.ics                   Per-team iCalendar feeds — committed by CI
tests/
  api.test.mjs            Live API integration tests (requires network)
  fixtures-json.test.mjs  JSON structure and field completeness
  ics.test.mjs            ICS file structure and RFC 5545 compliance
  lineup.test.mjs         parseLineupData() unit tests (no network)
  normalise.test.mjs      normalise() unit tests (no network)
  render.test.mjs         render.mjs helper unit tests (no network)
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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full system overview, data flow diagrams, SDLC friction map, and key files reference.

**Developing a feature:** edit `docs/index.html` and/or `docs/render.mjs` on a branch, run `npm run serve` for local UAT, push and merge — GitHub Pages updates production from `main`.

**Adding a new season (annual):** Update `SEASON`, and if team IDs change also update `TEAM_SLUGS` and `LCJRU_TEAM_IDS` — all in `scripts/config.mjs`. Run the fetch script once to regenerate `docs/config.js` and the `.ics` feeds.
