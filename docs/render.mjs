// Pure render helpers — no DOM or config dependencies.
// Imported by index.html (<script type="module">) and tests/render.test.mjs.

const LC_CREST_PATTERN = '/30901.';

function _genericMapsUrl(display) {
  return `https://maps.google.com/?q=${encodeURIComponent(display + ', Sydney NSW')}`;
}

export function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function isLaneCove(team) {
  return team.name.toLowerCase().includes('lane cove') || team.crest?.includes(LC_CREST_PATTERN);
}

export function shortTeamName(name) {
  if (name.includes('Lane Cove/')) {
    return 'JV · ' + name.replace('Lane Cove/', '').replace(/\s*\d+$/, '').trim();
  }
  return name.replace('Lane Cove ', '').replace(' 2026', '').trim() || name;
}

export function fmtDow(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Sydney' });
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' })
    .replace(' am', 'am').replace(' pm', 'pm');
}

export function rowId(match) {
  return 'match-' + match.id;
}

export function scoreClass(match) {
  const lcHome = isLaneCove(match.home);
  const lcScore  = lcHome ? match.home.score : match.away.score;
  const oppScore = lcHome ? match.away.score : match.home.score;
  if (lcScore === null || oppScore === null) return '';
  const lc  = Number(lcScore);
  const opp = Number(oppScore);
  if (isNaN(lc) || isNaN(opp)) return '';
  return lc > opp ? 'win' : lc < opp ? 'loss' : 'draw';
}

// venues: the VENUES object from config — passed explicitly so this function is testable
// without a browser or config.js loaded.
export function parseVenue(rawVenue, venues) {
  if (!rawVenue) return { display: '', pitch: null, mapsUrl: '#' };

  // Minis: "Tryon Oval TT1 (U6/U7)" → base="Tryon Oval", pitch="TT1"
  const miniMatch = rawVenue.match(/^(.+?) ((TT|M)\d+)\s*\([^)]+\)$/);
  if (miniMatch) {
    const base = miniMatch[1].trim();
    const pitch = miniMatch[2];
    const v = venues[base];
    const display = v?.suburb ? `${base}, ${v.suburb}` : base;
    return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display) };
  }

  // Exact lookup first; then try stripping trailing field number (e.g. "Field 2")
  let base = rawVenue.trim();
  let pitch = null;
  let v = venues[base];
  if (!v) {
    const fieldMatch = base.match(/^(.+?) (\d+)$/);
    if (fieldMatch && venues[fieldMatch[1]]) {
      base  = fieldMatch[1];
      pitch = `Field ${fieldMatch[2]}`;
      v     = venues[base];
    }
  }

  const display = v?.suburb ? `${base}, ${v.suburb}` : base;
  return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display) };
}
