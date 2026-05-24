// Maps Sleeper username (lowercase) → Governor display name.
export const GOVERNOR_NAMES: Record<string, string> = {
  yank4225: "Mike",
  goldre15: "Gunnar",
  fierst: "Mark",
  starzofthenorth: "Mark",
  koldre: "Knute",
  jdub21: "Jeremy",
  soloeli: "Eli",
  dhkrause: "DanK",
  johnathan: "Johnathan",
  loondog: "Matt",
  pb4kk: "Peter",
  prostrollod89: "DanP",
  gorter33: "Brent",
  bbakk: "Ben",
  mittens7: "Ben",
  saltyminnesotan: "Chris",
};

// Commissioner-ruled VP adjustments. Add one entry per affected team per ruling.
// governorName must match a value in GOVERNOR_NAMES exactly.
export interface VPOverride {
  season: string;
  week: number;
  governorName: string;
  vpDelta: number;
  reason: string;
}

export const VP_OVERRIDES: VPOverride[] = [
  {
    season: "2025",
    week: 6,
    governorName: "DanK",
    vpDelta: 2,
    reason: "Illegal lineup submitted by opponent; commissioner auto-win awarded",
  },
  {
    season: "2025",
    week: 6,
    governorName: "Chris",
    vpDelta: -2,
    reason: "Illegal lineup submitted; commissioner auto-loss awarded",
  },
];

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

export const SEASONS = Object.keys(LEAGUE_IDS)
  .filter((y) => LEAGUE_IDS[y])
  .sort((a, b) => Number(b) - Number(a));
