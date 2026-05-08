// 2026 LCJRU Minis season — manual calendar entries.
// Round entries use xplorerRound to suppress when Xplorer already has that match.

const U6_U7     = ['u6-gold', 'u6-blue', 'u7-gold', 'u7-blue'];
const U8_U9     = ['u8-gold', 'u8-blue', 'u9-gold', 'u9-blue'];
const ALL_MINIS = [...U6_U7, ...U8_U9];

export const EVENTS = [

  // ── Round 1: Sun 3 May ───────────────────────────────────────────────────────
  {
    id: 'rnd-1-u67', type: 'event', variant: 'round',
    title: 'Round 1', date: '2026-05-03', time: '09:00',
    venue: 'Tryon Oval', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 1',
  },
  {
    id: 'rnd-1-u89', type: 'event', variant: 'round',
    title: 'Round 1', date: '2026-05-03', time: '09:00',
    venue: 'Tryon Oval', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 1',
  },

  // ── Round 2: Sun 10 May (Mother's Day) ───────────────────────────────────────
  {
    id: 'rnd-2-u67', type: 'event', variant: 'round',
    title: 'Round 2', date: '2026-05-10', time: '09:00',
    venue: 'Tunks Park', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 2',
  },
  {
    id: 'rnd-2-u89', type: 'event', variant: 'round',
    title: 'Round 2', date: '2026-05-10', time: '09:00',
    venue: 'Tunks Park', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 2',
  },

  // Mother's Day social — Sun 10 May
  {
    id: 'mothers-day-2026', type: 'event',
    title: "Mother's Day at Tantallon",
    date: '2026-05-10', time: '14:00',
    venue: 'Tantallon Oval',
    teams: ALL_MINIS,
    status: 'confirmed',
    note: "Join us for early arvo drinks at Tantallon.",
    cta: { label: 'Join us — $60 Moet', url: 'https://www.instagram.com/p/DX_cYiPTPrP/' },
  },

  // ── Round 3: Sun 17 May ───────────────────────────────────────────────────────
  {
    id: 'rnd-3-u67', type: 'event', variant: 'round',
    title: 'Round 3', date: '2026-05-17', time: '09:00',
    venue: 'Wakehurst Rugby Park', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 3',
  },
  {
    id: 'rnd-3-u89', type: 'event', variant: 'round',
    title: 'Round 3', date: '2026-05-17', time: '09:00',
    venue: 'Melwood Oval', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 3',
  },

  // Waratahs v Brumbies — Fri 22 May
  {
    id: 'waratahs-2026', type: 'event',
    title: 'Waratahs v Brumbies',
    date: '2026-05-22', time: '19:30',
    teams: ALL_MINIS,
    status: 'confirmed',
    note: 'Club-wide invite. U10s pre-game match at 6:30pm.',
    cta: { label: 'Buy Tickets', url: 'https://www.ticketmaster.com.au/nsw-waratahs-v-act-brumbies-sydney-22-05-2026/event/2500642F887373FF' },
  },

  // ── Round 4: Sun 24 May ───────────────────────────────────────────────────────
  {
    id: 'rnd-4-u67', type: 'event', variant: 'round',
    title: 'Round 4', date: '2026-05-24', time: '09:00',
    venue: 'Beauchamp Park', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 4',
  },
  {
    id: 'rnd-4-u89', type: 'event', variant: 'round',
    title: 'Round 4', date: '2026-05-24', time: '09:00',
    venue: 'Bantry Bay Oval', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 4',
  },

  // ── Round 5: Sun 31 May ───────────────────────────────────────────────────────
  {
    id: 'rnd-5-u67', type: 'event', variant: 'round',
    title: 'Round 5', date: '2026-05-31', time: '09:00',
    venue: 'Tantallon Oval', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 5',
  },
  {
    id: 'rnd-5-u89', type: 'event', variant: 'round',
    title: 'Round 5', date: '2026-05-31', time: '09:00',
    venue: 'Lofberg Oval', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 5',
  },

  // ── King's Birthday — Sun 7 Jun: no rugby ────────────────────────────────────
  {
    id: 'kings-bday-2026', type: 'note',
    date: '2026-06-07',
    teams: ALL_MINIS,
    text: "No Minis rugby this weekend — King's Birthday long weekend.",
  },

  // ── Round 6: Sun 14 Jun ───────────────────────────────────────────────────────
  {
    id: 'rnd-6-u67', type: 'event', variant: 'round',
    title: 'Round 6', date: '2026-06-14', time: '09:00',
    venue: 'Hassall Park', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 6',
  },
  {
    id: 'rnd-6-u89', type: 'event', variant: 'round',
    title: 'Round 6', date: '2026-06-14', time: '09:00',
    venue: 'James Morgan Reserve', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 6',
  },

  // ── Inter-District Gala (Round 7): Sat 20 Jun ─────────────────────────────────
  {
    id: 'gala-rnd-7-2026', type: 'event',
    title: 'Inter-District Gala Day — Round 7',
    date: '2026-06-20', time: '08:30',
    venue: 'Eric Tweedale Field',
    teams: ALL_MINIS,
    status: 'tentative',
    note: 'All Minis grades. Details TBC.',
    xplorerRound: 'Round 7',
  },

  // ── King of the Hills K1: Sun 28 Jun ──────────────────────────────────────────
  {
    id: 'koth-k1-u89', type: 'event',
    title: 'King of the Hills — K1 Gala',
    date: '2026-06-28', time: '09:00',
    venue: 'Yattenden Oval, Baulkham Hills',
    teams: U8_U9,
    status: 'tentative',
    note: 'U8/U9 King of the Hills gala. Venue TBC.',
  },
  {
    id: 'koth-k1-u67', type: 'note',
    date: '2026-06-28',
    teams: U6_U7,
    text: 'U6/U7 friendly fixtures 28 Jun — details TBC.',
  },

  // ── King of the Hills K2: Sun 5 Jul ───────────────────────────────────────────
  {
    id: 'koth-k2-u67', type: 'event',
    title: 'King of the Hills — K2 Gala',
    date: '2026-07-05', time: '09:00',
    venue: 'Yattenden Oval, Baulkham Hills',
    teams: U6_U7,
    status: 'tentative',
    note: 'U6/U7 King of the Hills gala. Venue TBC.',
  },

  // ── School holidays: Sun 12 + 19 Jul ─────────────────────────────────────────
  {
    id: 'school-hols-jul-12', type: 'note',
    date: '2026-07-12',
    teams: ALL_MINIS,
    text: 'School holidays — no rugby. Back Sun 26 Jul.',
  },
  {
    id: 'school-hols-jul-19', type: 'note',
    date: '2026-07-19',
    teams: ALL_MINIS,
    text: 'School holidays — no rugby. Back Sun 26 Jul.',
  },

  // ── Round 8: Sun 26 Jul ───────────────────────────────────────────────────────
  {
    id: 'rnd-8-u67', type: 'event', variant: 'round',
    title: 'Round 8', date: '2026-07-26', time: '09:00',
    venue: 'Tunks Park', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 8',
  },
  {
    id: 'rnd-8-u89', type: 'event', variant: 'round',
    title: 'Round 8', date: '2026-07-26', time: '09:00',
    venue: 'Beauchamp Park', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 8',
  },

  // ── Round 9: Sun 2 Aug ────────────────────────────────────────────────────────
  {
    id: 'rnd-9-u67', type: 'event', variant: 'round',
    title: 'Round 9', date: '2026-08-02', time: '09:00',
    venue: 'Mark Taylor Oval', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 9',
  },
  {
    id: 'rnd-9-u89', type: 'event', variant: 'round',
    title: 'Round 9', date: '2026-08-02', time: '09:00',
    venue: 'Wakehurst Rugby Park', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 9',
  },

  // ── Round 10: Sun 9 Aug ───────────────────────────────────────────────────────
  {
    id: 'rnd-10-u67', type: 'event', variant: 'round',
    title: 'Round 10', date: '2026-08-09', time: '09:00',
    venue: 'Melwood Oval', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 10',
  },
  {
    id: 'rnd-10-u89', type: 'event', variant: 'round',
    title: 'Round 10', date: '2026-08-09', time: '09:00',
    venue: 'Tantallon Oval', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 10',
  },

  // ── Round 11: Sun 16 Aug ──────────────────────────────────────────────────────
  {
    id: 'rnd-11-u67', type: 'event', variant: 'round',
    title: 'Round 11', date: '2026-08-16', time: '09:00',
    venue: 'Wakehurst Rugby Park', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 11',
  },
  {
    id: 'rnd-11-u89', type: 'event', variant: 'round',
    title: 'Round 11', date: '2026-08-16', time: '09:00',
    venue: 'Mark Taylor Oval', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 11',
  },

  // ── Round 12: Sun 23 Aug ──────────────────────────────────────────────────────
  {
    id: 'rnd-12-u67', type: 'event', variant: 'round',
    title: 'Round 12', date: '2026-08-23', time: '09:00',
    venue: 'Lofberg Oval', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 12',
  },
  {
    id: 'rnd-12-u89', type: 'event', variant: 'round',
    title: 'Round 12', date: '2026-08-23', time: '09:00',
    venue: 'Beauchamp Park', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 12',
  },

  // ── Round 13 (Final): Sun 30 Aug ──────────────────────────────────────────────
  {
    id: 'rnd-13-u67', type: 'event', variant: 'round',
    title: 'Round 13 — Final Round', date: '2026-08-30', time: '09:00',
    venue: 'Hassall Park', teams: U6_U7,
    status: 'tentative', xplorerRound: 'Round 13',
  },
  {
    id: 'rnd-13-u89', type: 'event', variant: 'round',
    title: 'Round 13 — Final Round', date: '2026-08-30', time: '09:00',
    venue: 'Hassall Park', teams: U8_U9,
    status: 'tentative', xplorerRound: 'Round 13',
  },

  // ── Bathurst Tour: Sat/Sun 5–6 Sep ───────────────────────────────────────────
  {
    id: 'bathurst-tour-2026', type: 'event',
    title: 'Bathurst Tour',
    date: '2026-09-05',
    teams: ALL_MINIS,
    status: 'tentative',
    note: 'Sat 5 – Sun 6 Sep. Unconfirmed — details TBC.',
  },

  // ── Tiger Cup: Sat 12 Sep ─────────────────────────────────────────────────────
  {
    id: 'tiger-cup-2026', type: 'event',
    title: 'Tiger Cup',
    date: '2026-09-12',
    venue: 'Wahroonga',
    teams: ALL_MINIS,
    status: 'tentative',
    note: 'Invite-based. TBC.',
  },

  // ── Chatswood Challenge Cup: Sun 13 Sep ──────────────────────────────────────
  {
    id: 'challenge-cup-2026', type: 'event',
    title: 'Chatswood Challenge Cup',
    date: '2026-09-13',
    teams: ALL_MINIS,
    status: 'tentative',
    note: 'TBC.',
  },

  // ── Presentation Day: Sun 13/20 Sep ──────────────────────────────────────────
  {
    id: 'presentation-day-2026', type: 'event',
    title: 'Presentation Day',
    date: '2026-09-20',
    venue: 'Tantallon Oval',
    teams: ALL_MINIS,
    status: 'tentative',
    note: 'Date TBC — 13 or 20 Sep.',
  },
];
