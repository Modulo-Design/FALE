import { LEAGUE_IDS, GOVERNOR_NAMES } from "./config";
import { getRosters, getUsers, getMatchups } from "./sleeper";

export interface GovernorStats {
  governorName: string;
  seasonsPlayed: number;
  weekCount: number;
  totalPoints: number;
  avgPoints: number;
  highScore: number;
  lowScore: number;
}

export async function fetchHistoricalStats(): Promise<GovernorStats[]> {
  const seasons = Object.keys(LEAGUE_IDS).sort();

  const seasonResults = await Promise.all(
    seasons.map(async (season) => {
      const leagueId = LEAGUE_IDS[season];
      try {
        const [rosters, users] = await Promise.all([
          getRosters(leagueId),
          getUsers(leagueId),
        ]);

        const userMap = new Map(users.map((u) => [u.user_id, u]));
        const rosterGovernor = new Map(
          rosters.map((r) => {
            const user = r.owner_id ? userMap.get(r.owner_id) : undefined;
            const sleeperName = (user?.username ?? user?.display_name ?? "").toLowerCase();
            const name = GOVERNOR_NAMES[sleeperName] ?? user?.display_name ?? `Team ${r.roster_id}`;
            return [r.roster_id, name];
          })
        );

        const weekMatchups = await Promise.all(
          Array.from({ length: 14 }, (_, i) =>
            getMatchups(leagueId, i + 1).catch(() => [])
          )
        );

        const scores: { governorName: string; points: number }[] = [];
        for (const week of weekMatchups) {
          if (week.length === 0 || !week.some((m) => m.points > 0)) continue;
          for (const matchup of week) {
            if (matchup.points === 0) continue;
            const name = rosterGovernor.get(matchup.roster_id);
            if (name) scores.push({ governorName: name, points: matchup.points });
          }
        }

        return { season, scores };
      } catch {
        return { season, scores: [] };
      }
    })
  );

  const statsMap = new Map<string, { points: number[]; seasons: Set<string> }>();

  for (const { season, scores } of seasonResults) {
    const governorsThisSeason = new Set<string>();
    for (const { governorName, points } of scores) {
      if (!statsMap.has(governorName)) {
        statsMap.set(governorName, { points: [], seasons: new Set() });
      }
      statsMap.get(governorName)!.points.push(points);
      governorsThisSeason.add(governorName);
    }
    for (const g of governorsThisSeason) {
      statsMap.get(g)!.seasons.add(season);
    }
  }

  return Array.from(statsMap.entries())
    .map(([governorName, { points, seasons }]) => {
      const total = points.reduce((s, p) => s + p, 0);
      return {
        governorName,
        seasonsPlayed: seasons.size,
        weekCount: points.length,
        totalPoints: Math.round(total * 100) / 100,
        avgPoints: Math.round((total / points.length) * 100) / 100,
        highScore: Math.round(Math.max(...points) * 100) / 100,
        lowScore: Math.round(Math.min(...points) * 100) / 100,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
}
