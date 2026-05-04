# LCJRU Fixtures

Live fixtures and results for **Lane Cove Junior Rugby Union**, fetched from Rugby Xplorer's GraphQL API and served as a static GitHub Pages site.

**Live page:** https://denishoctor.github.io/lcjru-fixtures/

---

## How it works

1. `scripts/fetch-fixtures.mjs` calls the Rugby Xplorer GraphQL API for all 16 LCJRU teams, diffs against the previous run to detect venue/time changes, and writes `docs/fixtures.json` and `changes.txt`.
2. GitHub Actions runs the script on a cron schedule and commits the updated JSON.
3. `docs/index.html` fetches `fixtures.json` at runtime and renders it — no build step.

---

## Data source

| Field | Value |
|---|---|
| Endpoint | `https://rugby-au-cms.graphcdn.app/` (GraphQL, public) |
| Operation | `EntityFixturesAndResults` |
| Club | Lane Cove JRU — `entityId: 30901` |
| Season | 2026 |

---

## Refresh schedule

The workflow runs hourly during active hours (all times AEST). Because AEST is UTC+10 and the window spans midnight UTC, each block requires two cron entries.

| Cron (UTC) | AEST window | Days |
|---|---|---|
| `0 22-23 * * 0,1,2,3,4` | 8–9am | Mon–Fri |
| `0 0-8 * * 1,2,3,4,5` | 10am–6pm | Mon–Fri |
| `0 19-23 * * 5,6` | 5–9am | Sat–Sun |
| `0 0-8 * * 6,0` | 10am–6pm | Sat–Sun |

**Why two entries per block:** AEST is UTC+10, so 8am AEST on Monday = 10pm UTC on Sunday. A single cron expression can't span a day boundary, so each active window is split at midnight UTC.

If venue, time, new, or removed fixtures are detected, a push notification is sent via [ntfy.sh](https://ntfy.sh) using the `NTFY_TOPIC` repository secret.

---

## UI features

- **Minis** (U6–U9) and **Juniors** (U10–U15) token filter rows
- Sharable URL hash deep-links: `#u7-gold`, `#u13-blue`, etc.
- Per-match anchor links (`#match-<id>`)
- **Upcoming fixtures** — first upcoming match highlighted
- **Completed games** — past Minis rounds show a grey DONE badge (no scores recorded); scored Junior results show a green RES badge with Win / Loss / Draw pill
- **HOME** badge appears only at Tantallon Oval (Lane Cove's home ground)
- JV teams display as "JV · St Ives" and "JV · Lindfield"
- Venue names cleaned of pitch allocation noise ("Tryon Oval TT1 (U6/U7)" → "Tryon Oval, Ryde") via a suburb lookup table in `docs/index.html`

---

## Running locally

```bash
# Fetch fresh data
node scripts/fetch-fixtures.mjs

# Run tests
node --test tests/api.test.mjs           # live API integration tests
node --test tests/fixtures-json.test.mjs # local JSON structure tests

# View the page
open docs/index.html
```

---

## Repository structure

```
scripts/
  fetch-fixtures.mjs          GraphQL fetch, diff, and JSON writer
docs/
  fixtures.json               Generated — committed by CI
  index.html                  Single-file UI (no build step)
tests/
  api.test.mjs                Live API integration tests
  fixtures-json.test.mjs      Local JSON tests
.github/workflows/
  refresh-fixtures.yml        Cron job — fetch, notify, commit
```
