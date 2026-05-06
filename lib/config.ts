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
