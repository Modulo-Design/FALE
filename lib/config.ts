// League configuration.
//
// Governor identity lives in lib/governors.ts, not here.

// Victory Points awarded for a head-to-head tie. Sleeper has never recorded one
// in this league (the spreadsheet has no ties column and every season's wins and
// losses both sum to 91), but the old code silently handed the tied pair a
// win and a loss, so the case is now explicit.
export const TIE_VP = 1;

// Top-half scoring is worth 1 VP in a normal week and 3 VP in the finale week,
// which carries no head-to-head VP at all.
export const SCORING_VP = 1;
export const FINALE_SCORING_VP = 3;
export const MATCHUP_WIN_VP = 2;

export interface VPOverride {
  season: string;
  week: number;
  /** Must match a canonical name in lib/governors.ts exactly. */
  governorName: string;
  /**
   * Force the recorded result. This recomputes both `won` and `vpMatchup`,
   * so a commissioner-awarded win is worth its full 2 VP without the author
   * having to hand-compute a delta.
   */
  setResult?: "win" | "loss";
  /** Extra award or penalty applied on top of the (possibly forced) result. */
  vpDelta?: number;
  reason: string;
}

// Multiple entries may target the same governor and week; they accumulate.
export const VP_OVERRIDES: VPOverride[] = [
  {
    season: "2022",
    week: 4,
    governorName: "Matt",
    setResult: "win",
    reason: "Sleeper recorded a loss for Matt; result should be a win over Johnathan",
  },
  {
    season: "2022",
    week: 4,
    governorName: "Johnathan",
    setResult: "loss",
    reason: "Sleeper recorded a win for Johnathan; result should be a loss to Matt",
  },
  // 2025 week 6: Chris submitted an illegal lineup against DanK.
  //
  // Derived from the league spreadsheet, which has Chris at 2-11 / 2 VP and
  // DanK at 4-9 / 11 VP. Flipping the head-to-head gives both records exactly.
  // DanK's VP then works out as 8 (four wins) + 3 scoring = 11 with no extra
  // delta -- the +2 that used to be configured here was double-counting the
  // awarded win. Chris lands on 4 (two wins) + 0 scoring - 2 = 2, and that -2
  // is the only negative cell of `VP - 2*wins` in the entire six-season grid.
  {
    season: "2025",
    week: 6,
    governorName: "DanK",
    setResult: "win",
    reason: "Illegal lineup submitted by opponent; commissioner auto-win awarded",
  },
  {
    season: "2025",
    week: 6,
    governorName: "Chris",
    setResult: "loss",
    vpDelta: -2,
    reason: "Illegal lineup submitted; commissioner auto-loss plus a 2 VP penalty",
  },
];

// Regular-season week count per season (defaults to 14 if not listed).
// 2020's week 14 was already a playoff week, so its regular season was 13 weeks.
// Seasons of 14 weeks play 13 head-to-head weeks plus a scoring-only finale,
// which is why every season's win totals sum to 91 rather than 98.
export const REGULAR_SEASON_LENGTH: Record<string, number> = {
  "2020": 13,
};

/**
 * Playoff field size per season. The field grew from 6 teams to 7 in 2023, so
 * nothing may hardcode a size.
 *
 * Qualification and seeding live in lib/seeding.ts: all but the last spot go to
 * the VP standings (points breaking ties), and the final spot is a wildcard for
 * the highest-scoring team left over.
 */
export interface PlayoffFormat {
  teams: number;
  byes: number;
}

export const PLAYOFF_FORMAT: Record<string, PlayoffFormat> = {
  "2020": { teams: 6, byes: 2 },
  "2021": { teams: 6, byes: 2 },
  "2022": { teams: 6, byes: 2 },
  "2023": { teams: 7, byes: 1 },
  "2024": { teams: 7, byes: 1 },
  "2025": { teams: 7, byes: 1 },
  "2026": { teams: 7, byes: 1 },
};

// Sleeper league IDs for each season.
// Find your league ID in the Sleeper app URL: sleeper.com/leagues/LEAGUE_ID
export const LEAGUE_IDS: Record<string, string> = {
  "2020": "515432335393722368",
  "2021": "650046094528589824",
  "2022": "785171302272106496",
  "2023": "917327003509039104",
  "2024": "1048401061104537600",
  "2025": "1180303459117264896",
  "2026": "1314355753032634368",
};

export const CURRENT_SEASON = "2026";

/** Seasons whose results are final, oldest first. */
export const ARCHIVED_SEASONS = Object.keys(LEAGUE_IDS)
  .filter((year) => LEAGUE_IDS[year] && year !== CURRENT_SEASON)
  .sort();

export const SEASONS = Object.keys(LEAGUE_IDS)
  .filter((y) => LEAGUE_IDS[y])
  .sort((a, b) => Number(b) - Number(a));

export function regularSeasonWeeks(season: string): number {
  return REGULAR_SEASON_LENGTH[season] ?? 14;
}

/**
 * The finale week: the last regular-season week from 2021 on, which awards no
 * head-to-head VP and triples top-half scoring VP. 2020 has no finale.
 */
export function isFinaleWeek(week: number, season: string): boolean {
  return Number(season) >= 2021 && week === regularSeasonWeeks(season);
}
