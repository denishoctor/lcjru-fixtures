// Manual calendar events and notes for Lane Cove JRU 2026.
// Editing guide:
//   type 'event' — a scheduled event with date, time, venue
//   type 'note'  — a text-only row (bye weekend, draw release, etc.)
//   teams        — array of slugs (u6-gold, u7-blue, …) or ['*'] for all grades
//   status       — 'confirmed' | 'tentative' | 'cancelled' | 'completed'
//
// After editing, run: node scripts/build-events.mjs
// to regenerate docs/events.json.

export const EVENTS = [
  // Placeholder entries — replace with real 2026 calendar data
  {
    id: 'r6-bye-minis-2026',
    type: 'note',
    date: '2026-05-17',
    teams: ['u6-gold', 'u6-blue', 'u7-gold', 'u7-blue', 'u8-gold', 'u8-blue', 'u9-gold', 'u9-blue'],
    text: 'Round 6 — No Minis fixtures this weekend.',
  },
  {
    id: 'lcjru-gala-2026',
    type: 'event',
    title: 'Lane Cove Gala Day',
    date: '2026-06-07',
    time: '08:30',
    venue: 'Tantallon Oval',
    teams: ['u6-gold', 'u6-blue', 'u7-gold', 'u7-blue', 'u8-gold', 'u8-blue', 'u9-gold', 'u9-blue'],
    status: 'tentative',
    note: 'All Minis grades. Details TBC — check back closer to the date.',
  },
];
