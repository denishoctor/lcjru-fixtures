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
  if (!rawVenue) return { display: '', pitch: null, mapsUrl: '#', base: null, hasDetails: false };

  // Minis: "Tryon Oval TT1 (U6/U7)" → base="Tryon Oval", pitch="TT1"
  const miniMatch = rawVenue.match(/^(.+?) ((TT|M)\d+)\s*\([^)]+\)$/);
  if (miniMatch) {
    const base = miniMatch[1].trim();
    const pitch = miniMatch[2];
    const v = venues[base];
    const display = v?.suburb ? `${base}, ${v.suburb}` : base;
    return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display), base: v ? base : null, hasDetails: !!v?.details };
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
  return { display, pitch, mapsUrl: v?.mapsUrl || _genericMapsUrl(display), base: v ? base : null, hasDetails: !!v?.details };
}

// kebab-case slug for venue anchors and panel ids. Strips parens, apostrophes, slashes.
export function venueSlug(baseName) {
  return String(baseName ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Renders the venue details block (map, parking, coffee, notes). Returns '' if the venue has
// no details block. assetPrefix is prepended to map.src so stg pages (which sit one level deeper)
// can pass '../' to resolve assets/venues/... correctly.
export function renderVenueDetails(baseName, venues, { assetPrefix = '' } = {}) {
  const v = venues?.[baseName];
  const d = v?.details;
  if (!d) return '';

  const parts = [];
  if (d.map) {
    const src = `${assetPrefix}${d.map.src}`;
    const asOf = d.map.asOf
      ? new Date(d.map.asOf + '-01').toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })
      : '';
    parts.push(
      `<a class="venue-map-link" href="${esc(src)}" target="_blank" rel="noopener">` +
        `<img class="venue-map" src="${esc(src)}" alt="${esc(d.map.caption ?? `${baseName} pitch layout`)}" loading="lazy">` +
      `</a>`
    );
    if (d.map.caption || asOf) {
      parts.push(`<div class="venue-map-caption">${esc(d.map.caption ?? '')}${d.map.caption && asOf ? ' · ' : ''}${asOf ? `Layout as of ${esc(asOf)}` : ''}</div>`);
    }
  }

  const rows = [];
  if (d.parking) rows.push(['Parking', esc(d.parking).replace(/\n/g, '<br>')]);
  if (d.coffee) {
    const bits = [];
    if (d.coffee.onsite) bits.push(`<strong>Onsite:</strong> ${esc(d.coffee.onsite)}`);
    if (d.coffee.nearby) bits.push(`<strong>Nearby:</strong> ${esc(d.coffee.nearby)}`);
    if (bits.length) rows.push(['Coffee', bits.join('<br>')]);
  }
  if (d.notes) rows.push(['Notes', esc(d.notes).replace(/\n/g, '<br>')]);

  if (rows.length) {
    const dl = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('');
    parts.push(`<dl class="venue-meta">${dl}</dl>`);
  }

  return parts.join('');
}
