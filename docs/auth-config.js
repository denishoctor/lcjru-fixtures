// Public front-end config for the Player of the Match (POTM) feature.
//
// This file is HAND-AUTHORED and committed (unlike config.js, which the fetch script
// regenerates). All three values below are *publishable* keys — they are designed to be
// shipped to the browser. The Supabase SERVICE-ROLE key must NEVER appear here.
//
// Security model: the Supabase anon key permits public reads of the `potm` table and lets
// signed-in users (any enabled Clerk provider) write. Row-Level Security on the table is the
// real gate — see docs/POTM-SETUP.md for the SQL and the Clerk↔Supabase wiring.
//
// Leave a value empty to disable that half of the feature gracefully:
//   - empty supabaseUrl/supabaseAnonKey → the site simply shows no POTM (read is skipped).
//   - empty clerkPublishableKey         → the admin page shows a "not configured" notice.
window.LCJRU_AUTH = {
  supabaseUrl: '',         // e.g. 'https://xxxxxxxx.supabase.co'
  supabaseAnonKey: '',     // Supabase "anon"/publishable key
  clerkPublishableKey: '', // Clerk publishable key (pk_test_… / pk_live_…)
};
