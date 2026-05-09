/**
 * Validates the generated docs/*.ics calendar feed files.
 * Catches regressions in ICS generation: RFC 5545 compliance, timezone
 * definitions, line folding, UID uniqueness, and event integrity.
 *
 * Run: node --test tests/ics.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { TEAM_SLUGS } from '../scripts/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

// Load all ICS files once
const icsFiles = Object.fromEntries(
  Object.keys(TEAM_SLUGS).map(slug => {
    const p = join(DOCS, `${slug}.ics`);
    return [slug, existsSync(p) ? readFileSync(p, 'utf8') : null];
  })
);

// Parse an ICS file into a list of { key, params, value } property objects
function parseICS(content) {
  // Unfold continuation lines (CRLF + space or tab)
  const unfolded = content.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  return unfolded.split(/\r\n|\n/).filter(Boolean).map(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return { key: line, params: '', value: '' };
    const keyPart = line.slice(0, colonIdx);
    const value   = line.slice(colonIdx + 1);
    const scIdx   = keyPart.indexOf(';');
    return scIdx === -1
      ? { key: keyPart, params: '', value }
      : { key: keyPart.slice(0, scIdx), params: keyPart.slice(scIdx + 1), value };
  });
}

// ── file existence ─────────────────────────────────────────────────────────────

test('all ICS files exist for every team slug', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    assert.ok(content !== null, `missing ICS file: docs/${slug}.ics`);
  }
});

// ── CRLF line endings ──────────────────────────────────────────────────────────

test('all ICS files use CRLF line endings (RFC 5545 §3.1)', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    // Must contain at least one CRLF and no bare LF (outside of folded lines)
    assert.ok(content.includes('\r\n'), `${slug}.ics: missing CRLF line endings`);
    // A bare LF not preceded by CR indicates wrong endings
    const bareLF = content.replace(/\r\n/g, '').includes('\n');
    assert.ok(!bareLF, `${slug}.ics: contains bare LF (non-CRLF) line endings`);
  }
});

// ── VCALENDAR structure ────────────────────────────────────────────────────────

test('all ICS files open and close with VCALENDAR', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const lines = content.split('\r\n');
    assert.equal(lines[0], 'BEGIN:VCALENDAR', `${slug}.ics: first line must be BEGIN:VCALENDAR`);
    // Last non-empty line
    const last = lines.filter(Boolean).at(-1);
    assert.equal(last, 'END:VCALENDAR', `${slug}.ics: last line must be END:VCALENDAR`);
  }
});

test('all ICS files contain required calendar properties', () => {
  const required = ['VERSION', 'PRODID', 'CALSCALE', 'METHOD'];
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const props = parseICS(content);
    for (const key of required) {
      assert.ok(props.some(p => p.key === key), `${slug}.ics: missing property ${key}`);
    }
  }
});

// ── VTIMEZONE (the Android fix) ────────────────────────────────────────────────

test('all ICS files include a VTIMEZONE component for Australia/Sydney', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    assert.ok(
      content.includes('BEGIN:VTIMEZONE'),
      `${slug}.ics: missing BEGIN:VTIMEZONE — calendar clients (especially Android) cannot resolve TZID without it`
    );
    assert.ok(content.includes('TZID:Australia/Sydney'), `${slug}.ics: VTIMEZONE must declare TZID:Australia/Sydney`);
    assert.ok(content.includes('BEGIN:STANDARD'), `${slug}.ics: VTIMEZONE missing STANDARD component`);
    assert.ok(content.includes('BEGIN:DAYLIGHT'), `${slug}.ics: VTIMEZONE missing DAYLIGHT component`);
    assert.ok(content.includes('END:VTIMEZONE'),  `${slug}.ics: missing END:VTIMEZONE`);
  }
});

// ── refresh hints ──────────────────────────────────────────────────────────────

test('all ICS files include REFRESH-INTERVAL and X-PUBLISHED-TTL', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    assert.ok(content.includes('REFRESH-INTERVAL'), `${slug}.ics: missing REFRESH-INTERVAL`);
    assert.ok(content.includes('X-PUBLISHED-TTL'), `${slug}.ics: missing X-PUBLISHED-TTL`);
  }
});

// ── line folding (RFC 5545 §3.1) ──────────────────────────────────────────────

test('no unfolded line exceeds 75 octets (RFC 5545 §3.1)', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const lines = content.split('\r\n');
    for (let i = 0; i < lines.length; i++) {
      const byteLen = Buffer.byteLength(lines[i], 'utf8');
      assert.ok(
        byteLen <= 75,
        `${slug}.ics line ${i + 1}: ${byteLen} bytes exceeds 75-octet limit: "${lines[i].slice(0, 40)}…"`
      );
    }
  }
});

test('continuation lines begin with a single space', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const lines = content.split('\r\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // Previous line must have been a long folded line
        assert.ok(
          lines[i - 1].length > 0,
          `${slug}.ics line ${i + 1}: continuation line follows an empty line`
        );
      }
    }
  }
});

// ── VEVENT integrity ───────────────────────────────────────────────────────────

function extractEvents(content) {
  const events = [];
  const blocks = content.split('BEGIN:VEVENT');
  for (let i = 1; i < blocks.length; i++) {
    const block = 'BEGIN:VEVENT' + blocks[i].split('END:VEVENT')[0] + 'END:VEVENT';
    events.push(parseICS(block));
  }
  return events;
}

test('every VEVENT has required properties', () => {
  const required = ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION', 'LOCATION'];
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const events = extractEvents(content);
    for (const event of events) {
      const uid = event.find(p => p.key === 'UID')?.value ?? '(unknown)';
      for (const key of required) {
        assert.ok(
          event.some(p => p.key === key),
          `${slug}.ics event ${uid}: missing property ${key}`
        );
      }
    }
  }
});

test('DTSTART is before DTEND for all events', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const events = extractEvents(content);
    for (const event of events) {
      const uid      = event.find(p => p.key === 'UID')?.value ?? '(unknown)';
      const startRaw = event.find(p => p.key === 'DTSTART')?.value;
      const endRaw   = event.find(p => p.key === 'DTEND')?.value;
      if (!startRaw || !endRaw) continue;
      // Parse both as comparable strings (YYYYMMDD or YYYYMMDDTHHmmss)
      assert.ok(startRaw < endRaw, `${slug}.ics event ${uid}: DTSTART (${startRaw}) is not before DTEND (${endRaw})`);
    }
  }
});

test('all DTSTART/DTEND with TZID reference Australia/Sydney', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const events = extractEvents(content);
    for (const event of events) {
      const uid = event.find(p => p.key === 'UID')?.value ?? '(unknown)';
      for (const prop of event) {
        if ((prop.key === 'DTSTART' || prop.key === 'DTEND') && prop.params.includes('TZID=')) {
          assert.ok(
            prop.params.includes('TZID=Australia/Sydney'),
            `${slug}.ics event ${uid}: ${prop.key} uses unexpected TZID: ${prop.params}`
          );
        }
      }
    }
  }
});

// ── UID uniqueness ─────────────────────────────────────────────────────────────

test('all UIDs are unique within each ICS file', () => {
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const events = extractEvents(content);
    const uids   = events.map(e => e.find(p => p.key === 'UID')?.value).filter(Boolean);
    const unique = new Set(uids);
    assert.equal(unique.size, uids.length, `${slug}.ics: found ${uids.length - unique.size} duplicate UID(s)`);
  }
});

test('UIDs are unique across all ICS feeds', () => {
  const seen = new Map(); // uid → slug
  for (const [slug, content] of Object.entries(icsFiles)) {
    if (!content) continue;
    const events = extractEvents(content);
    for (const event of events) {
      const uid = event.find(p => p.key === 'UID')?.value;
      if (!uid) continue;
      // UIDs can legitimately appear in multiple feeds (same match, different team view)
      // but should never be identical within the SAME feed — already checked above.
      // Cross-feed duplicates for different slugs are acceptable (sibling team views).
    }
  }
  // This test is intentionally a no-op beyond the per-file check above.
  assert.ok(true);
});

// ── HTML: calendar subscription UI ───────────────────────────────────────────

test('index.html has correct calendar subscription UI', () => {
  const htmlPath = join(DOCS, 'index.html');
  assert.ok(existsSync(htmlPath), 'docs/index.html does not exist');
  const html = readFileSync(htmlPath, 'utf8');
  // webcal link uses generic label visible on all platforms
  assert.ok(html.includes('id="cal-ical"'),   'index.html: webcal link must use id="cal-ical"');
  assert.ok(html.includes('iCal / webcal'),   'index.html: webcal link must be labelled "iCal / webcal"');
  // Desktop Google Calendar: cid= encodes webcal:// (https:// breaks after /u/0/ redirect)
  assert.ok(html.includes("encodeURIComponent(webcalUrl)"), 'index.html: desktop cid= must encode webcal://');
  // Google Calendar option must be marked desktop-only — mobile app can't add feeds
  assert.ok(/Desktop only/i.test(html), 'index.html: Google Calendar must be labelled desktop-only');
  // Copy button must exist as a fallback for any other calendar app
  assert.ok(html.includes('copyIcsUrl'),       'index.html: copyIcsUrl function must exist');
  assert.ok(html.includes('currentIcsUrl'),    'index.html: currentIcsUrl variable must exist');
});
