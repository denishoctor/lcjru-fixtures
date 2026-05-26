// Player of the Match (POTM) data access — thin Supabase REST client, no dependencies.
//
// Reads are public (anon key). Writes require a Supabase-compatible access token minted from
// the signed-in Clerk session; the admin page supplies it. Row-Level Security on the server is
// the real gate — these helpers just carry whatever credentials they're given.
//
// Config comes from window.LCJRU_AUTH (docs/auth-config.js). When Supabase isn't configured,
// loadPotm() resolves to {} so the public site renders normally with no POTM.

const TABLE = 'potm';

function cfg() {
  return (typeof window !== 'undefined' && window.LCJRU_AUTH) || {};
}

export function isPotmConfigured() {
  const { supabaseUrl, supabaseAnonKey } = cfg();
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function restUrl(path) {
  const { supabaseUrl } = cfg();
  return `${String(supabaseUrl).replace(/\/$/, '')}/rest/v1/${path}`;
}

// Fetch all POTM rows → map keyed by match_id. Resolves to {} on any failure or when
// Supabase isn't configured, so a read error never blanks the fixtures listing.
export async function loadPotm() {
  if (!isPotmConfigured()) return {};
  const { supabaseAnonKey } = cfg();
  try {
    const res = await fetch(restUrl(`${TABLE}?select=*`), {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    });
    if (!res.ok) return {};
    const rows = await res.json();
    const byMatch = {};
    for (const row of rows) byMatch[row.match_id] = row;
    return byMatch;
  } catch {
    return {};
  }
}

// Upsert a POTM for a match. `token` is the Supabase-compatible access token for the
// signed-in admin (from Clerk). The server records who via RLS/audit; we pass the actor's
// identifier through as created_by for convenience. Throws on a non-2xx response.
export async function savePotm({ matchId, playerName, playerNumber = null, emoji = '🏅', createdBy = null }, token) {
  const { supabaseAnonKey } = cfg();
  const res = await fetch(restUrl(TABLE), {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      match_id: matchId,
      player_name: playerName,
      player_number: playerNumber,
      emoji,
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Save failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json())[0] ?? null;
}

// Remove a match's POTM. `token` as above. Throws on a non-2xx response.
export async function deletePotm(matchId, token) {
  const { supabaseAnonKey } = cfg();
  const res = await fetch(restUrl(`${TABLE}?match_id=eq.${encodeURIComponent(matchId)}`), {
    method: 'DELETE',
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status} ${await res.text()}`);
}
