// Add your Sleeper league IDs here, keyed by season year.
// Find your league ID in the Sleeper app URL or league settings.
// Example: for https://sleeper.app/leagues/123456789/team -> league ID is 123456789
export const LEAGUE_IDS: Record<string, string> = {
  "2020": process.env.NEXT_PUBLIC_LEAGUE_ID_2020 ?? "",
  "2021": process.env.NEXT_PUBLIC_LEAGUE_ID_2021 ?? "",
  "2022": process.env.NEXT_PUBLIC_LEAGUE_ID_2022 ?? "",
  "2023": process.env.NEXT_PUBLIC_LEAGUE_ID_2023 ?? "",
  "2024": process.env.NEXT_PUBLIC_LEAGUE_ID_2024 ?? "",
};

export const CURRENT_SEASON = "2024";

export const SEASONS = Object.keys(LEAGUE_IDS)
  .filter((y) => LEAGUE_IDS[y])
  .sort((a, b) => Number(b) - Number(a));
