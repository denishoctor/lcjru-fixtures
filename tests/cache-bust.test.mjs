import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionVenueImages } from '../scripts/fetch-fixtures.mjs';
import { VENUES } from '../scripts/config.mjs';

// A venue whose map image actually exists in docs/assets/venues.
const realVenue = {
  'Hassall Park': {
    suburb: 'St Ives', mapsUrl: 'https://maps.example.com/hassall',
    details: { map: { src: 'assets/venues/hassall-park.jpeg', caption: 'Two fields' } },
  },
};

test('appends a ?v=<hash> to a local venue image that exists on disk', () => {
  const out = versionVenueImages(realVenue);
  const src = out['Hassall Park'].details.map.src;
  assert.match(src, /^assets\/venues\/hassall-park\.jpeg\?v=[0-9a-f]{8}$/);
});

test('is deterministic — same bytes produce the same version', () => {
  const a = versionVenueImages(realVenue)['Hassall Park'].details.map.src;
  const b = versionVenueImages(realVenue)['Hassall Park'].details.map.src;
  assert.equal(a, b);
});

test('does not mutate the input object', () => {
  const input = JSON.parse(JSON.stringify(realVenue));
  versionVenueImages(input);
  assert.equal(input['Hassall Park'].details.map.src, 'assets/venues/hassall-park.jpeg');
});

test('leaves external (http / protocol-relative) srcs untouched', () => {
  const v = {
    A: { details: { map: { src: 'https://cdn.example.com/x.jpg' } } },
    B: { details: { map: { src: '//cdn.example.com/y.jpg' } } },
  };
  const out = versionVenueImages(v);
  assert.equal(out.A.details.map.src, 'https://cdn.example.com/x.jpg');
  assert.equal(out.B.details.map.src, '//cdn.example.com/y.jpg');
});

test('leaves an already-versioned src untouched', () => {
  const v = { A: { details: { map: { src: 'assets/venues/hassall-park.jpeg?v=deadbeef' } } } };
  assert.equal(versionVenueImages(v).A.details.map.src, 'assets/venues/hassall-park.jpeg?v=deadbeef');
});

test('leaves a src whose file is missing untouched', () => {
  const v = { A: { details: { map: { src: 'assets/venues/does-not-exist.jpg' } } } };
  assert.equal(versionVenueImages(v).A.details.map.src, 'assets/venues/does-not-exist.jpg');
});

test('skips venues without map details', () => {
  const v = { A: { suburb: 'Nowhere', mapsUrl: '#' } };
  assert.deepEqual(versionVenueImages(v), { A: { suburb: 'Nowhere', mapsUrl: '#' } });
});

test('every real VENUES map image resolves to a versioned URL', () => {
  const out = versionVenueImages(VENUES);
  for (const v of Object.values(out)) {
    const src = v?.details?.map?.src;
    if (!src) continue;
    assert.match(src, /\?v=[0-9a-f]{8}$/, `expected versioned src, got ${src}`);
  }
});
