// Central configuration for lcjru-fixtures.
// Update SEASON, ENTITY_ID, TEAM_SLUGS, and VENUE_SUBURBS each year or when
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

export const VENUE_SUBURBS = {
  'Bantry Bay Oval':                 'Bantry Bay',
  'Beauchamp Park':                  'West Pennant Hills',
  'Eric Tweedale Field':             'Granville',
  'Hassall Park':                    'Rydalmere',
  'James Morgan Reserve':            'Kellyville',
  'Keirle Park':                     'Balmain',
  'Lofberg Oval':                    'North Ryde',
  'Mark Taylor Oval':                'Waitara',
  'Mark Taylor Oval (Waitara Oval)': 'Waitara',
  'Melwood Oval':                    'Putney',
  'Nagle Park':                      'Balmain',
  'North Narrabeen Reserve':         'Narrabeen',
  'Peakhurst Oval':                  'Peakhurst',
  'Porter Reserve':                  'Meadowbank',
  'Rawson Oval':                     'Penshurst',
  'Ryde Park':                       'Ryde',
  'Tantallon Oval':                  'Lane Cove North',
  'Taplin Park':                     'Pemulwuy',
  'Tryon Oval':                      'Ryde',
  'Tunks Park':                      'Cammeray',
  'Wakehurst Rugby Park':            'Brookvale',
  'Woollahra Oval':                  'Woollahra',
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
