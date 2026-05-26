# Player of the Match (POTM) — setup & test plan

POTM lets a signed-in admin pick the Lane Cove Player of the Match for a completed game. The
choice is stored in Supabase, gated by a Clerk login, and shown on the public fixtures site.

- **Read** (everyone): the public site fetches POTM rows with the Supabase *anon* key and shows
  them. If Supabase isn't configured the site behaves exactly as before.
- **Write** (admins): `docs/admin.html` signs the user in with Clerk and writes to Supabase.
  Open-write by design — *anyone who signs in* can set POTM; an append-only audit log records
  who changed what. Tightening to an allowlist later is a one-line RLS change (see below).

Architecture note: this is the first part of the otherwise-static site that talks to a
backend. There is **no build step** — `admin.html` loads Clerk from its CDN at runtime and
talks to Supabase over plain REST (`docs/potm.js`). The only secrets that reach the browser
are *publishable* keys, which are designed to be public.

---

## 1. What you provision

### A. Supabase project (free tier)
1. Create a project at <https://supabase.com>.
2. **Project Settings → API**: copy the **Project URL** and the **anon/public** key.
   > Never copy the **service_role** key into this repo — it bypasses all security.
3. **SQL Editor**: paste and run the block in [§3 SQL](#3-sql-run-once) below.

### B. Clerk application (free tier)
1. Create an application at <https://clerk.com>.
2. Enable the sign-in methods you want (Google, Facebook/Meta, Microsoft, LinkedIn, email…).
   Each enabled provider is another way in — that's expected for open-write.
3. **API Keys**: copy the **Publishable key** (`pk_test_…` / `pk_live_…`).
4. *(Optional, recommended)* Add an `email` claim to the session token so the audit log shows
   emails not just user IDs: **Configure → Sessions → Customize session token**, add
   `{ "email": "{{user.primary_email_address}}" }`.

### C. Wire Clerk → Supabase (native integration — no JWT template)
1. In the **Clerk Dashboard**, enable the **Supabase integration** (Integrations → Supabase).
   This makes Clerk add the required `"role": "authenticated"` claim to session tokens. Copy the
   **Clerk domain** it shows you.
2. In the **Supabase Dashboard → Authentication → Sign In / Providers → Third-Party Auth**, add
   **Clerk** and paste that Clerk domain.

### D. Fill in the keys
Edit `docs/auth-config.js` (committed, public keys only):
```js
window.LCJRU_AUTH = {
  supabaseUrl: 'https://YOURPROJECT.supabase.co',
  supabaseAnonKey: 'eyJ...the anon key...',
  clerkPublishableKey: 'pk_test_...',
};
```

### E. Squads (optional, incremental)
For games with **no published team sheet**, the picker offers your club squad. Add rosters to
`SQUADS` in `scripts/config.mjs` (names only), keyed by team slug, then re-run
`node scripts/fetch-fixtures.mjs` (or edit `docs/config.js` directly to match). Free-text entry
always works, so squads are never required.

---

## 2. How it behaves once configured

- **Admin** opens `/admin.html`, signs in, sees completed Lane Cove games, picks a player
  (published lineup → squad → free text) and an emoji, and saves.
- **Public site** shows the POTM:
  1. as a chip on the home "Last weekend's results" rows,
  2. **bold + (POTM) + emoji** on the player inside the team-sheet panel (when a lineup exists),
  3. as a block at the top of the expandable panel, above venue info (when no lineup exists).

---

## 3. SQL (run once)

```sql
-- Tables ---------------------------------------------------------------------
create table if not exists public.potm (
  match_id      text primary key,
  player_name   text not null,
  player_number text,
  emoji         text not null default '🏅',
  created_by    text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.potm_audit (
  id          bigint generated always as identity primary key,
  match_id    text not null,
  action      text not null,          -- INSERT | UPDATE | DELETE
  old_player  text,
  new_player  text,
  actor_id    text,                   -- Clerk user id (jwt 'sub')
  actor_email text,                   -- present if you added the email claim
  created_at  timestamptz not null default now()
);

-- Audit trigger (SECURITY DEFINER so the log is always written, regardless of caller) -------
create or replace function public.potm_audit_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
begin
  if (tg_op = 'DELETE') then
    insert into public.potm_audit(match_id, action, old_player, new_player, actor_id, actor_email)
    values (old.match_id, tg_op, old.player_name, null, claims->>'sub', claims->>'email');
    return old;
  else
    insert into public.potm_audit(match_id, action, old_player, new_player, actor_id, actor_email)
    values (new.match_id, tg_op,
            case when tg_op = 'UPDATE' then old.player_name end,
            new.player_name, claims->>'sub', claims->>'email');
    return new;
  end if;
end; $$;

drop trigger if exists potm_audit_trg on public.potm;
create trigger potm_audit_trg
  after insert or update or delete on public.potm
  for each row execute function public.potm_audit_fn();

-- Row-Level Security ---------------------------------------------------------
alter table public.potm       enable row level security;
alter table public.potm_audit enable row level security;

-- POTM: anyone can read; any signed-in user can write (open-write).
create policy "potm public read" on public.potm
  for select to anon, authenticated using (true);
create policy "potm authd write" on public.potm
  for all to authenticated using (true) with check (true);

-- Audit: signed-in users can read; nobody can write directly (only the trigger does).
create policy "potm_audit read" on public.potm_audit
  for select to authenticated using (true);
```

### Later: tighten to an allowlist (optional)
If open-write gets abused, replace the write policy with an allowlist check — no app changes:
```sql
create table if not exists public.potm_admins (clerk_user_id text primary key);
-- insert into public.potm_admins values ('user_abc123');  -- the actor_id from the audit log

drop policy "potm authd write" on public.potm;
create policy "potm admin write" on public.potm
  for all to authenticated
  using   (exists (select 1 from public.potm_admins a where a.clerk_user_id = auth.jwt()->>'sub'))
  with check (exists (select 1 from public.potm_admins a where a.clerk_user_id = auth.jwt()->>'sub'));
```

---

## 4. Test plan

Three goals: **(1)** doesn't break the existing app, **(2)** works as expected, **(3)** is
battle-tested against edge cases. Run the automated suite first; it needs no network and no keys.

### 4.0 Automated (offline — gate before any deploy)
| Check | Command | Expect |
|---|---|---|
| Unit tests (incl. all POTM helpers) | `npm test` | all pass (96+ render tests) |
| Required files present | `npm run check` | OK |
| Files serve over HTTP | `npm run smoke` | OK |
| Module syntax | `node --check docs/potm.js && node --check docs/render.mjs` | no output |

### 4.1 Goal 1 — does NOT break the existing app
Test these **with `auth-config.js` keys still empty** (the default committed state):
- [ ] `npm run serve` → home page renders: This weekend / Last weekend's results / Coming up — unchanged.
- [ ] Pick a team → fixtures, results, lineups, venue panels all work as before.
- [ ] Expand a game with a lineup → team sheet renders; no POTM artifacts anywhere.
- [ ] Expand a game with only venue details → venue panel works; no empty POTM block.
- [ ] Network tab: **no request to Supabase or Clerk** is made on the public site (read is skipped when unconfigured).
- [ ] `/admin.html` → shows the "not configured" notice, no console errors.
- [ ] Service worker still serves the app offline (no new cross-origin dependency on first paint).

### 4.2 Goal 2 — works as expected (requires keys + SQL applied)
**Admin (`/admin.html`):**
- [ ] Signed out → Clerk sign-in mounts; signing in with each enabled provider works.
- [ ] Completed Lane Cove games list, most recent first; the filter box narrows by team/opponent.
- [ ] Game **with** a published lineup → player dropdown is populated from the team sheet (with numbers).
- [ ] Game **without** a lineup but with a squad in config → dropdown shows the squad.
- [ ] Game with neither → only "Other (type a name)…" is available.
- [ ] Pick a player + emoji → Save → row updates to show the POTM; a row appears in *Recent activity*.
- [ ] Re-open the same game → the saved player + emoji are pre-selected.
- [ ] Change the player → Save → audit shows `UPDATE  old → new`.
- [ ] Clear → row shows "No POTM"; audit shows `DELETE`.

**Public site (`/index.html`) after setting a POTM:**
- [ ] If the game is in *Last weekend's results* → the chip (emoji + name) shows on that row.
- [ ] Game with a lineup → that player is **bold** with `(POTM)` + emoji in the team-sheet panel.
- [ ] Game with no lineup → expanding the row shows the POTM block at the top, above venue info,
      and the row is expandable even though it has no team sheet.
- [ ] Hard-refresh / open in a private window (logged out) → POTM is visible to the public.

### 4.3 Goal 3 — edge cases / battle-testing
**Security (most important):**
- [ ] **Logged-out write is rejected.** With only the anon key, attempt a write:
  ```bash
  curl -i -X POST "$SUPABASE_URL/rest/v1/potm" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d '{"match_id":"hacktest","player_name":"Nope"}'
  ```
  Expect **401/403** (RLS denies anon writes). Reads of `potm` should still return `200`.
- [ ] **Direct audit write is rejected** (anon and authenticated) — only the trigger writes it.
- [ ] **Audit captures the real actor**, not the client-supplied `created_by` (set a POTM, confirm
      `actor_id` in the audit row matches the Clerk user, even if `created_by` were spoofed).
- [ ] `service_role` key is **not** present anywhere in `docs/`.

**Data / display edge cases:**
- [ ] **Free-text name with HTML** (`<b>x</b>`, `O'Brien`, `A & B`) → stored verbatim, rendered
      **escaped** on both admin and public pages (no markup injection).
- [ ] **Name mismatch** — POTM free-text name not matching any lineup player → no bolding in the
      panel, but the chip/block still shows. (Bolding matches on trimmed, case-insensitive name.)
- [ ] **Name with surrounding spaces / different case** vs the lineup → still bolds the right player.
- [ ] **Minis game** (no score) → POTM can be set and displays (Minis are completed games too).
- [ ] **Lane Cove is the away team** → the picker lists the *away* roster; bolding hits the away side.
- [ ] **Lane Cove derby** (both sides LC) → still resolves to one LC side without error.
- [ ] **POTM for a game that later gets a lineup** (set via free text, lineup published next CI run)
      → if the name matches, bolding starts working automatically; if not, block still shows.
- [ ] **Match id no longer in fixtures** (old/rolled-off game) → stale POTM row is simply ignored by
      the UI (no crash); admin list only shows current completed games.

**Resilience / failure modes:**
- [ ] **Supabase down/slow** → public site still paints (≤4s timeout in `loadPotm`, then `{}`); no POTM, no hang.
- [ ] **Bad/typo'd Supabase URL or key** → public site renders without POTM; admin shows a clear error on save.
- [ ] **Clerk fails to load** (blocked CDN) → admin shows "Could not load Clerk"; public site unaffected.
- [ ] **Expired session** → saving prompts re-auth / surfaces a save error rather than silently failing.
- [ ] **Double-save / rapid clicks** → buttons disable while in flight; upsert (merge-duplicates) means
      no duplicate rows (match_id is the primary key).
- [ ] **Service worker** does not cache Clerk/Supabase responses (verify auth + POTM reads always hit network).

### 4.4 Sign-off
Ship when: 4.0 is green, 4.1 shows zero behaviour change with empty keys, and 4.2 + the 4.3
**security** rows pass against a real Supabase/Clerk pair.
