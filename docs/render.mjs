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

  // Exact lookup first; then walk word-prefixes from longest to shortest until we find a
  // venue key. The remainder becomes the pitch label. Handles all of:
  //   "Keirle Park Field 2"                  → base "Keirle Park",            pitch "Field 2"
  //   "Eric Tweedale Field 5"                → base "Eric Tweedale Field",    pitch "Field 5"
  //   "Tantallon Oval 2"                     → base "Tantallon Oval",         pitch "Field 2"
  //   "North Narrabeen Reserve No 2 (Front)" → base "North Narrabeen Reserve", pitch "No 2 (Front)"
  let base = rawVenue.trim();
  let pitch = null;
  let v = venues[base];
  if (!v) {
    const words = base.split(' ');
    for (let i = words.length - 1; i >= 1; i--) {
      const prefix = words.slice(0, i).join(' ');
      if (venues[prefix]) {
        base  = prefix;
        v     = venues[prefix];
        const suffix = words.slice(i).join(' ').trim();
        // Bare digits get the friendly "Field N" label; everything else passes through verbatim
        // (so "Field 5", "No 2 (Front)" etc. render as the council names them).
        pitch = /^\d+$/.test(suffix) ? `Field ${suffix}` : suffix;
        break;
      }
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

// Renders the venue details block. Order: notes/parking/coffee on top, then the map image,
// with only the layout caption (asOf + caption text) sitting below the image. Returns ''
// if the venue has no details. assetPrefix is prepended to map.src so stg pages (which sit
// one level deeper) can pass '../' to resolve assets/venues/... correctly.
export function renderVenueDetails(baseName, venues, { assetPrefix = '' } = {}) {
  const v = venues?.[baseName];
  const d = v?.details;
  if (!d) return '';

  const parts = [];

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

  return parts.join('');
}

// Renders the per-event details panel (long-form body, optional bullet/numbered lists,
// and a primary CTA button). Returns '' if the event has no details. Body splits on
// blank lines into <p>; everything is esc()-d.
export function renderEventDetails(event) {
  const d = event?.details;
  if (!d) return '';

  const parts = [];

  if (d.body) {
    const paras = String(d.body).split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    parts.push(paras.map(p => `<p class="event-body">${esc(p).replace(/\n/g, '<br>')}</p>`).join(''));
  }

  if (Array.isArray(d.highlights) && d.highlights.length) {
    parts.push(
      `<ul class="event-highlights">${d.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`
    );
  }

  if (Array.isArray(d.steps) && d.steps.length) {
    parts.push(
      `<ol class="event-steps">${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
    );
  }

  if (d.cta?.label && d.cta?.url) {
    parts.push(
      `<a class="event-cta-btn" href="${esc(d.cta.url)}" target="_blank" rel="noopener">${esc(d.cta.label)} ↗</a>`
    );
  }

  return parts.join('');
}
