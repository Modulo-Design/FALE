// Sleeper league IDs for each season.
// Find your league ID in the Sleeper app URL: sleeper.com/leagues/LEAGUE_ID
export const LEAGUE_IDS: Record<string, string> = {
  "2020": "",
  "2021": "",
  "2022": "",
  "2023": "",
  "2024": "",
  "2025": "",
  "2026": "",
};

export const CURRENT_SEASON = "2026";

export const SEASONS = Object.keys(LEAGUE_IDS)
  .filter((y) => LEAGUE_IDS[y])
  .sort((a, b) => Number(b) - Number(a));
