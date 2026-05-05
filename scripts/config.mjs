// Central configuration for lcjru-fixtures.
// Update SEASON, ENTITY_ID, TEAM_SLUGS, and VENUES each year or when
// teams/venues change. This is the single source of truth — imported by the
// fetch script and test files; the HTML files load the generated docs/config.js.

export const SEASON      = '2026';
export const ENTITY_ID   = 30901;
export const ENTITY_TYPE = 'club';
export const SITE_URL    = 'https://denishoctor.github.io/lcjru-fixtures';
export const FINAL_ROUND = 13;

export const TEAM_SLUGS = {
  'u6-gold':  'wjBCCDfvXpx8QivYu',
  'u6-blue':  'nXtZPbg5Pb9xgh6Rd',
  'u7-gold':  '84q7BEamwEAGPZgc2',
  'u7-blue':  '52MoHPFgMFTPppk9H',
  'u8-gold':  'azWv34qmnBYrN7atm',
  'u8-blue':  '5SyzYzsjmbeaPZsXT',
  'u9-gold':  'PyQredZ4NJS2JafcM',
  'u9-blue':  'BAczTuGAgyjokt4pJ',
  'u10':      'ga3nagC9irHRNJXWn',
  'u11':      '4nA7pxpFZt6gbj347',
  'u12':      'BPR2bFQZAuLK4CzLD',
  'u13-gold': 'AX6MBpn8Xva2AmC8N',
  'u13-blue': 'SafHgsHsRWsZmAHbq',
  'u14-gold': '42ZRPX8ej8P9co4Ws',
  'u14':      'mtDoyNMX26Bm94nuk',
  'u15':      'LmZzP4t9h9bdYr9Pt',
};

// Venue lookup — keyed by the base venue name as it arrives from the API
// (after stripping pitch/field suffixes). Add or correct entries here;
// run the fetch script to regenerate docs/config.js.
export const VENUES = {
  'AR Hurst Reserve':                { suburb: 'Sylvania',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=AR+Hurst+Reserve%2C+The+Esplanade%2C+Sylvania+NSW+2224%2C+Australia' },
  'Bantry Bay Oval':                 { suburb: 'Seaforth',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Bantry+Bay+Oval+Reserve+St%2C+Seaforth+NSW+2092%2C+Australia' },
  'Beauchamp Park':                  { suburb: 'Chatswood',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Beauchamp+Park+Nicholson+St%2C+Chatswood+NSW+2067%2C+Australia' },
  'Eric Tweedale Field':             { suburb: 'Merrylands',      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Eric+Tweedale+Stadium%2C+Merrylands+NSW+2160%2C+Australia' },
  'Hassall Park':                    { suburb: 'St Ives',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Hassall+Park+Hassell+St%2C+St.+Ives+NSW+2075%2C+Australia' },
  'James Morgan Reserve':            { suburb: 'Cromer',          mapsUrl: 'https://www.google.com/maps/search/?api=1&query=James+Morgan+Reserve+Fisher+Rd+N+%26+Carawa+Rd%2C+Cromer+NSW+2099%2C+Australia' },
  'Keirle Park':                     { suburb: 'Manly',           mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Keirle+Park%2C+Carlton+St%2C+Manly+NSW+2095%2C+Australia' },
  'Lofberg Oval':                    { suburb: 'West Pymble',     mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Lofberg+Oval+Lofberg+Rd%2C+West+Pymble+NSW+2073%2C+Australia' },
  'Mark Taylor Oval':                { suburb: 'Waitara',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mark+Taylor+Oval+Waitara+Ave%2C+Waitara+NSW+2077%2C+Australia' },
  'Mark Taylor Oval (Waitara Oval)': { suburb: 'Waitara',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mark+Taylor+Oval+Waitara+Ave%2C+Waitara+NSW+2077%2C+Australia' },
  'Melwood Oval':                    { suburb: 'Forestville',     mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Melwood+Oval+Melwood+Ave%2C+Forestville+NSW+2087%2C+Australia' },
  'Nagle Park':                      { suburb: 'Maroubra',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Nagle+Park%2C+Maroubra+NSW+2035%2C+Australia' },
  'North Narrabeen Reserve':         { suburb: 'Narrabeen',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=North+Narrabeen+Reserve%2C+Pittwater+Rd%2C+Warriewood+NSW+2102%2C+Australia' },
  'Peakhurst Oval':                  { suburb: 'Peakhurst',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Peakhurst+Park%2C+Peakhurst+NSW+2210%2C+Australia' },
  'Porter Reserve':                  { suburb: 'Newport',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Porter+Reserve%2C+Burke+St%2C+Newport+NSW+2106%2C+Australia' },
  'Rawson Oval':                     { suburb: 'Mosman',          mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Rawson+Oval%2C+Cross+St%2C+Mosman+NSW+2088%2C+Australia' },
  'Ryde Park':                       { suburb: 'Ryde',            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ryde+Park%2C+Argyle+Ave%2C+Ryde+NSW+2112%2C+Australia' },
  'Tantallon Oval':                  { suburb: 'Lane Cove North', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tantallon+Oval+Lane+Cove+North+NSW+2066%2C+Australia' },
  'Taplin Park':                     { suburb: 'Drummoyne',       mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Taplin+Park%2C+Bayswater+St%2C+Drummoyne+NSW+2047%2C+Australia' },
  'Tryon Oval':                      { suburb: 'East Lindfield',  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tryon+Oval+62a+Tryon+Rd%2C+East+Lindfield+NSW+2070%2C+Australia' },
  'Tunks Park':                      { suburb: 'Cammeray',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tunks+Park+Brothers+Ave%2C+Cammeray+NSW+2062%2C+Australia' },
  'Wakehurst Rugby Park':            { suburb: 'Belrose',         mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Wakehurst+Rugby+Park+Forest+Way+%26+Waldon+Rd%2C+Belrose+NSW+2085%2C+Australia' },
  'Woollahra Oval':                  { suburb: 'Rose Bay',        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Woollahra+Oval%2C+50+O%27Sullivan+Rd%2C+Rose+Bay+NSW+2029%2C+Australia' },
};

export const LCJRU_TEAM_IDS = Object.values(TEAM_SLUGS);

export const MINIS_SLUGS = new Set([
  'u6-gold', 'u6-blue', 'u7-gold', 'u7-blue',
  'u8-gold', 'u8-blue', 'u9-gold', 'u9-blue',
]);

export const MINIS_SIBLINGS = {
  'u6-gold': 'u6-blue', 'u6-blue': 'u6-gold',
  'u7-gold': 'u7-blue', 'u7-blue': 'u7-gold',
  'u8-gold': 'u8-blue', 'u8-blue': 'u8-gold',
  'u9-gold': 'u9-blue', 'u9-blue': 'u9-gold',
};
