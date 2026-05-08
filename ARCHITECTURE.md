# LCJRU Fixtures — Architecture & Data Flow

A reference document for understanding how this system works, how data moves through it,
and how to develop against it effectively. Three zoom levels: system, component, field.

---

## 1. User-Centric View

### Who uses this and what they get

| Persona | Interaction | Value |
|---|---|---|
| **Parent** | Opens site on phone, filters to their child's team | Sees venue, time, and round for Saturday's game |
| **Coach / Manager** | Checks fixture details, shares team link | One URL per team (`#u7-gold`), sharable and bookmarkable |
| **Calendar subscriber** | Subscribes to team `.ics` feed once | Fixtures appear automatically in phone calendar, update without re-subscribing |
| **Admin (future-you)** | Updates config annually, monitors CI | One file to edit (`scripts/config.mjs`), one script to run |

### Value chain

```mermaid
flowchart LR
    API["Rugby Xplorer API\n(public GraphQL)"]
    CI["GitHub Actions\n(hourly cron)"]
    DATA["docs/\nfixtures.json · *.ics · config.js"]
    SITE["GitHub Pages\nhttps://denishoctor.github.io/lcjru-fixtures"]

    API -->|fetch| CI
    CI -->|commit| DATA
    DATA -->|served as static files| SITE

    SITE -->|filter to team| P["Parent\nsees fixture"]
    SITE -->|#team-slug URL| C["Coach\nshares link"]
    DATA -->|*.ics subscription| CAL["Phone Calendar\nauto-updates"]
```

---

## 2. System Overview

### Trigger conditions

| Trigger | When |
|---|---|
| Cron (weekdays) | Hourly 8am–6pm AEST Monday–Friday |
| Cron (weekends) | Hourly 5am–6pm AEST Saturday–Sunday |
| `workflow_dispatch` | Manual — any time via GitHub Actions UI |

### System-level flow

```mermaid
flowchart TD
    CRON["Cron schedule\n(4 cron entries — AEST spans midnight UTC)"]
    MANUAL["workflow_dispatch\n(manual trigger)"]
    CI["GitHub Actions runner\nubuntu-latest · Node 20"]
    SCRIPT["scripts/fetch-fixtures.mjs"]
    API["Rugby Xplorer GraphQL\nhttps://rugby-au-cms.graphcdn.app/"]
    FILES["docs/\nfixtures.json · config.js · *.ics\n(16 ICS files)"]
    COMMIT["git commit + push main"]
    PAGES["GitHub Pages\nStatic file host"]
    BROWSER["User browser\nindex.html"]
    NTFY_CHANGE["ntfy.sh\nFixture update notification"]
    NTFY_FAIL["ntfy.sh\nFailure alert"]

    CRON --> CI
    MANUAL --> CI
    CI -->|checkout repo| SCRIPT
    SCRIPT <-->|"GraphQL POST ×2\n(fixtures + results,\npaginated 100/page)"| API
    SCRIPT -->|writes| FILES
    FILES -->|git add docs/| COMMIT
    COMMIT -->|GitHub Pages auto-deploys| PAGES
    BROWSER <-->|"fetch fixtures.json\nfetch config.js"| PAGES
    SCRIPT -.->|"changes.txt non-empty"| NTFY_CHANGE
    CI -.->|"on: failure()"| NTFY_FAIL
```

### What changes on each CI run

Every run writes (and conditionally commits) three output types:

| Output | File(s) | Committed if |
|---|---|---|
| Match data | `docs/fixtures.json` | Always (even if unchanged content, timestamp differs) |
| Browser config | `docs/config.js` | Always (regenerated each run) |
| Calendar feeds | `docs/*.ics` (16 files) | Always |
| Change log | `changes.txt` | Not committed — used only to trigger ntfy.sh |

`git diff --cached --quiet` suppresses the commit when all outputs are byte-for-byte identical.

---

## 3. Data Flow End-to-End

### Component-level sequence

```mermaid
sequenceDiagram
    participant CI as GitHub Actions
    participant Script as fetch-fixtures.mjs
    participant API as Rugby Xplorer GraphQL
    participant FS as docs/ (filesystem)
    participant Pages as GitHub Pages
    participant Browser as index.html

    CI->>Script: node scripts/fetch-fixtures.mjs
    Script->>Script: read docs/fixtures.json (previous run, for diff)

    par Fetch fixtures and results concurrently
        Script->>API: POST EntityFixturesAndResults (type=fixtures, paginated)
        API-->>Script: raw fixture items[]
    and
        Script->>API: POST EntityFixturesAndResults (type=results, paginated)
        API-->>Script: raw result items[]
    end

    Script->>Script: normalise() each item
    Script->>Script: dedup (results take priority over fixtures at transition)
    Script->>Script: sort chronologically by dateTime
    Script->>Script: detectChanges() — diff upcoming fixtures against previous run
    Script->>FS: write fixtures.json
    Script->>FS: write changes.txt (empty = no changes)

    loop For each of 16 team slugs
        Script->>Script: generateICS(slug, teamId, allMatches)
        Script->>FS: write docs/{slug}.ics
    end

    Script->>FS: write docs/config.js (browser-loadable window.LCJRU_CONFIG)

    CI->>FS: git add docs/fixtures.json docs/config.js docs/*.ics
    CI->>Pages: git commit + push → GitHub Pages auto-deploys

    Note over Browser,Pages: At page load time (runtime, not build time)
    Browser->>Pages: GET index.html
    Browser->>Pages: GET config.js → window.LCJRU_CONFIG
    Browser->>Pages: GET fixtures.json
    Pages-->>Browser: all files (static, no server logic)
    Browser->>Browser: filterMatches(data, selectedSlug)
    Browser->>Browser: renderMatch() → innerHTML × N
```

### Key functions and their roles

| Function | File | Role |
|---|---|---|
| `fetchPage(type, skip)` | fetch-fixtures.mjs | Single paginated GraphQL request |
| `fetchAll(type)` | fetch-fixtures.mjs | Paginates until API returns < 100 items |
| `normalise(item)` | fetch-fixtures.mjs | Raw API item → clean match object |
| `detectChanges(old, new)` | fetch-fixtures.mjs | Diffs upcoming fixtures for venue/time/added/removed |
| `generateICS(slug, ...)` | fetch-fixtures.mjs | Builds RFC 5545 VCALENDAR for one team |
| `buildDescription(match, ...)` | fetch-fixtures.mjs | ICS event body — includes sibling match for Minis |
| `icsFold(line)` | fetch-fixtures.mjs | RFC 5545 75-octet line folding (UTF-8 safe) |
| `displayLocation(rawVenue)` | fetch-fixtures.mjs | Strips pitch suffix, appends suburb — returns plain text (used for ICS and notifications) |
| `parseVenue(rawVenue)` | index.html | Returns `{ display, pitch, mapsUrl }` — `display` is `name, suburb`, `pitch` is the stripped tag (e.g. `TT1`), `mapsUrl` is from `VENUES` or a generic fallback |
| `shortTeamName(name)` | index.html | Removes "Lane Cove" prefix for display |
| `esc(str)` | index.html | HTML-escapes API strings before innerHTML |
| `renderMatch(match)` | index.html | Produces HTML card for one match |
| `filterMatches(data, slug)` | index.html | Filters full dataset to selected team |

**Minis sibling feature:** For U6–U9 ICS feeds, `generateICS()` looks up the sibling team
(e.g. U7 Gold's sibling is U7 Blue) and appends their same-day fixture to the ICS event
description — so parents see both teams' games in one calendar event.

---

## 4. Data Transformations

### Raw API → Normalised JSON → Rendered HTML

| Raw API field | Normalised (`fixtures.json`) | Rendered (browser) |
|---|---|---|
| `item.id` | `match.id` | `id="match-{id}"` — in-page anchor |
| `item.compName` | `match.competition` | Competition section header |
| `item.compId` | `match.compId` | Competition grouping key |
| `item.round` | `match.round` | `RND` badge label |
| `item.roundLabel \|\| item.round` | `match.roundLabel` | Display fallback |
| `item.dateTime` (ISO 8601 UTC) | `match.dateTime` (unchanged) | `Intl.DateTimeFormat('Australia/Sydney')` → `Sat 3 May · 10:00am` |
| `item.venue` (may include pitch suffix) | `match.venue` (unchanged) | `parseVenue()` strips pitch code → `{ display: "Name, Suburb", pitch: "TT1", mapsUrl }` → clickable pin link + pitch tag |
| `item.status` (`'Result'` or other) | `match.type` (`'result'` / `'fixture'`) | Badge colour: green (result+score), grey (result no score), blue (fixture) |
| `item.homeTeam.score` (`''` when unplayed) | `match.home.score` (`null` when `''`) | Score pill — hidden when `null` |
| `item.homeTeam.teamId` | `match.home.id` | Matched to `TEAM_SLUGS` → slug → URL hash `#u7-gold` |
| `item.homeTeam.name` | `match.home.name` | `shortTeamName()` removes "Lane Cove" prefix |
| `item.homeTeam.crest` (CDN URL) | `match.home.crest` | `<img src>` team badge |
| `item.isBye` | `match.isBye` | Bye badge |
| `item.isLive` | `match.isLive` | Live match indicator |
| `item.matchLabel \|\| null` | `match.matchLabel` | Finals label (e.g. "Grand Final") |

### Key transformation details

**Score normalisation**
```
API:  homeTeam.score = ''    (fixture, not yet played)
JSON: home.score = null      ('' → null via !== '' check, preserves score 0)
HTML: score pill hidden

API:  homeTeam.score = '0'   (played, zero score)
JSON: home.score = '0'       (not null — zero score preserved)
HTML: score pill shows '0'
```

**Venue cleaning**

Two separate paths depending on context:

*ICS / notification text* — `displayLocation()` in `fetch-fixtures.mjs`:
```
API:  "Tryon Oval TT1 (U6/U7)"
ICS:  displayLocation() → "Tryon Oval, East Lindfield"
      strips: / (?:TT|M)\d+\s*\([^)]+\)$/
      appends: VENUES["Tryon Oval"].suburb = "East Lindfield"
```

*Browser rendering* — `parseVenue()` in `index.html`:
```
API:   "Tryon Oval TT1 (U6/U7)"
HTML:  parseVenue() → {
         display:  "Tryon Oval, East Lindfield",
         pitch:    "TT1",
         mapsUrl:  "https://www.google.com/maps/search/..."
       }
       → <a class="venue-link" href="{mapsUrl}">📍 Tryon Oval, East Lindfield</a>  [TT1]
```

`VENUES` in `scripts/config.mjs` is the source for both suburb names and Maps URLs.
`docs/config.js` (generated) carries `VENUES` to the browser.

**Date/time formatting (DST-safe)**
```
JSON: "2026-05-02T00:00:00.000Z"   (UTC)
HTML: Intl.DateTimeFormat with timeZone:'Australia/Sydney'
      → "Sat 2 May · 10:00am"    (AEST, UTC+10)
      → "Sat 3 Oct · 10:00am"    (AEDT, UTC+11 — automatically correct)
```

**ICS-specific transforms**
```
dateTime → icsLocalDate()  → "20260502T100000"   (timed events, TZID=Australia/Sydney)
dateTime → icsDateOnly()   → "20260502"           (all-day events, DTEND = next day)
venue    → displayLocation() → icsEscape()        → RFC 5545 LOCATION
desc     → buildDescription() → icsEscape() → icsFold() → 75-octet folded lines
```

---

## 5. SDLC — Current State

### Development loop

```mermaid
flowchart LR
    EDIT["Edit file\n(HTML / JS / config / script)"]
    CHECK["npm run check\n~0.1s — files exist"]
    SMOKE["npm run smoke\n~1s — HTTP serving"]
    PUSH["git push"]
    CI["GitHub Actions\n~90s — fetch + commit"]
    PAGES["GitHub Pages\nlive site"]
    VERIFY["Visual verify\nin browser"]

    EDIT --> CHECK
    CHECK -->|pass| SMOKE
    SMOKE -->|pass| PUSH
    PUSH --> CI
    CI --> PAGES
    PAGES --> VERIFY
    VERIFY -.->|iterate| EDIT

    CHECK -->|MISSING file| EDIT
    SMOKE -->|FAIL check| EDIT
```

**Pre-push hook** (requires one-time setup: `git config core.hooksPath .githooks`)
runs `npm run check && npm run smoke` automatically before every push.

### Friction map

| Change type | Edit → signal | Locally runnable | Agent-friendly |
|---|---|---|---|
| Config (`scripts/config.mjs`) | `npm run check` — ~0.1s | Yes | Yes |
| Fetch script — normalise/ICS logic | Requires live API to run | **No** | **No** |
| HTML structure / CSS | `npm run smoke` — ~1s (static file check) | Yes | Partial |
| JS render logic (inside `<script>`) | Push → CI → Pages — ~90s | **No** | **No** |
| `tests/fixtures-json.test.mjs` | ~0.1s | Yes | Yes |
| `tests/api.test.mjs` | ~3s + network | No (needs network) | No |
| Full round-trip verification | ~2 min | No | No |

### What is tested locally (zero network)

| Test | Command | What it covers |
|---|---|---|
| Required files present | `npm run check` | `fixtures.json`, `config.js`, `index.html`, all 16 `.ics` |
| Files served over HTTP | `npm run smoke` | HTTP 200, `LCJRU_CONFIG` present, JSON has `matches[]`, ICS has `BEGIN:VCALENDAR` |
| JSON structure & fields | `npm run test:json` | Field completeness, sort order, score types, Lane Cove presence, no duplicates |
| ICS existence & format | `npm run test:json` | All 16 files present, valid iCalendar wrapper |

### What is NOT tested

| Gap | Impact |
|---|---|
| JS render logic (`renderMatch`, `shortTeamName`, `esc`, `displayLocation`) | An agent can break rendering and pass all local checks |
| `normalise()` with real data shapes | Score edge cases, field renames only caught after a CI run |
| `buildDescription()`, `icsFold()` with real matches | ICS content bugs only caught by subscribing a calendar client |
| Visual output in any browser | Pixel-level issues undetectable by automation |

**Critical for agentic use:** `smoke.mjs` fetches the raw HTML *source file* — before any
JavaScript executes. The render functions live in inline `<script>` tags and run only in a
browser. Any change to rendering logic is invisible to all automated checks until the page
is opened in a browser after pushing.

---

## 6. SDLC — Recommendations

### Priority 1 — Offline data pipeline testing

**Problem:** `fetch-fixtures.mjs` requires a live network call to test any change to
`normalise()`, `buildDescription()`, or `icsFold()`.

**Fix:** Commit one saved API response as `tests/fixtures/api-snapshot.json` (captured
once via `curl` or the fetch script's raw output). Add `tests/normalise.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

// import normalise and helpers from fetch-fixtures.mjs
// (requires exporting them — small refactor)
import { normalise, generateICS } from '../scripts/fetch-fixtures.mjs';

const snapshot = JSON.parse(readFileSync('tests/fixtures/api-snapshot.json'));

test('normalise preserves zero scores', () => { ... });
test('normalise maps Result → result type', () => { ... });
test('ICS has valid VEVENT structure', () => { ... });
test('icsFold does not split emoji', () => { ... });
```

Zero new dependencies. Runs in ~50ms. Catches the entire data pipeline offline.

*Prerequisite:* export `normalise`, `icsFold`, `buildDescription`, `generateICS` from
`fetch-fixtures.mjs` (currently unexported top-level functions).

### Priority 2 — Testable render functions

**Problem:** `renderMatch()`, `shortTeamName()`, `esc()`, `displayLocation()` are inline
in `<script>` tags — not importable by Node tests. Breaking them is undetectable locally.

**Fix:** Extract to `docs/render.mjs` (ES module). Both HTML files load it:
```html
<script type="module" src="./render.mjs"></script>
```

New `tests/render.test.mjs` imports and tests each function with known inputs:
```js
import { renderMatch, shortTeamName, esc, displayLocation } from '../docs/render.mjs';

test('esc encodes angle brackets', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
});
test('shortTeamName strips Lane Cove prefix', () => {
  assert.equal(shortTeamName('Lane Cove Gold 7'), 'Gold 7');
});
test('displayLocation strips pitch allocation', () => {
  assert.equal(displayLocation('Tryon Oval TT1 (U6/U7)'), 'Tryon Oval, Ryde');
});
```

Zero new dependencies. Makes render logic refactorable with confidence.

### Priority 3 — Richer smoke assertions

Enhance `scripts/smoke.mjs` to check content quality in `fixtures.json`, not just shape:

- At least one fixture with a future `dateTime`
- At least one Lane Cove team slug in the `home.id` or `away.id` fields
- All expected team slugs appear in at least one match

Still zero dependencies, runs in ~1s, gives agents earlier signal on data corruption.

### Not recommended

| Approach | Why not |
|---|---|
| jsdom | Adds a dependency inconsistent with zero-dep philosophy |
| Playwright / Puppeteer | Heavy — ~200MB install, requires browser binary, slow startup |
| Visual regression testing | Overkill for a single-page static site with stable layout |

---

## 7. Key Files Reference

| File | Purpose | Reads | Writes | Tested by |
|---|---|---|---|---|
| `scripts/config.mjs` | Season/teams/venues — single source of truth. Exports `SEASON`, `TEAM_SLUGS`, `VENUES` (with `suburb` + `mapsUrl`), `MINIS_SLUGS`, `MINIS_SIBLINGS`, `FINAL_ROUND` | — | — | Imported by tests |
| `scripts/fetch-fixtures.mjs` | Fetch, normalise, diff, write all outputs | `config.mjs`, prev `fixtures.json` | `fixtures.json`, `config.js`, `*.ics`, `changes.txt` | `api.test.mjs` (live), manual |
| `scripts/check.mjs` | Pre-flight: all required files present | `docs/*` (existence only) | — | Run by pre-push hook |
| `scripts/smoke.mjs` | Local HTTP server smoke test | `docs/*` (via HTTP) | — | Run by pre-push hook |
| `.github/workflows/refresh-fixtures.yml` | Cron CI: fetch → notify → commit → push | — | Triggers script; commits `docs/` | CI logs |
| `docs/config.js` | Browser-loadable config (generated, do not edit) | Generated from `config.mjs` | — | `smoke.mjs` |
| `docs/fixtures.json` | All match data (generated, committed) | Written by fetch script | — | `fixtures-json.test.mjs`, `smoke.mjs` |
| `docs/index.html` | Production UI — vanilla JS, no build step | `config.js`, `fixtures.json` at runtime | — | `smoke.mjs` (static only) |
| `docs/staging-index.html` | Staging UI — experimental features, not linked from main page | `config.js`, `fixtures.json` at runtime | — | Manual only |
| `docs/*.ics` | Per-team calendar feeds (16 files, generated) | Written by fetch script | — | `fixtures-json.test.mjs` |
| `tests/api.test.mjs` | Live API contract tests (requires network) | Rugby Xplorer API | — | Run manually / periodically |
| `tests/fixtures-json.test.mjs` | Committed JSON structure tests | `docs/fixtures.json` | — | `npm test` |

---

## 8. Annual Update Checklist

Run this at the start of each new season (typically January–February).

1. **Update `SEASON`** in `scripts/config.mjs` (e.g. `'2026'` → `'2027'`)

2. **Check for new team IDs** — log in to [xplorer.rugby](https://xplorer.rugby), find each
   LCJRU team, and copy the team ID from the URL. IDs change when teams are re-registered.

3. **Update `TEAM_SLUGS`** in `scripts/config.mjs` with any new or changed IDs

4. **Review `MINIS_SLUGS` and `MINIS_SIBLINGS`** — add/remove age groups if the club's
   mini structure changes (e.g. adding U10 to Minis)

5. **Update `FINAL_ROUND`** if the competition length changes from 13 rounds

6. **Update `VENUES`** in `scripts/config.mjs` if new grounds are added — each entry needs
   a `suburb` string and a verified `mapsUrl` (Google Maps search URL for the ground)

7. **Run the fetch script** to regenerate all outputs:
   ```bash
   node scripts/fetch-fixtures.mjs
   ```

8. **Verify outputs locally:**
   ```bash
   npm run check    # all files present
   npm run smoke    # all files serve correctly
   node --test tests/fixtures-json.test.mjs   # JSON structure valid
   ```

9. **Commit and push:**
   ```bash
   git add scripts/config.mjs docs/
   git commit -m "chore: season YYYY setup — updated team IDs"
   git push
   ```

10. **Verify on GitHub:**
    - Actions tab: confirm the workflow runs green
    - Live site: confirm the new season's fixtures appear
    - Check one ICS file in a calendar client to confirm events load
