import { LEAGUE_IDS } from "./config";
import { governorNames } from "./governors";
import { fetchSeasonStandings } from "./season";
import type { GovernorStats, SeasonStandings, WeeklyResult } from "./types";

export type { GovernorStats } from "./types";

interface Accumulator {
  points: number[];
  pointsAgainst: number;
  seasons: Set<string>;
  allPlayWins: number;
  allPlayLosses: number;
}

function emptyAccumulator(): Accumulator {
  return {
    points: [],
    pointsAgainst: 0,
    seasons: new Set(),
    allPlayWins: 0,
    allPlayLosses: 0,
  };
}

/**
 * "Hypothetical record vs. everyone each week": for each week, how a team's
 * score compares against every other team that week.
 *
 * This is the highest-signal figure in the whole dataset for verification --
 * matching it exactly means every individual weekly score is right.
 */
function accumulateAllPlay(
  standings: SeasonStandings,
  statsFor: (governorName: string) => Accumulator
): void {
  const byWeek = new Map<number, { governorName: string; points: number }[]>();
  for (const team of standings.teams) {
    for (const result of team.weeklyResults) {
      if (!byWeek.has(result.week)) byWeek.set(result.week, []);
      byWeek.get(result.week)!.push({
        governorName: team.governorName,
        points: result.points,
      });
    }
  }

  for (const entries of byWeek.values()) {
    for (const entry of entries) {
      const acc = statsFor(entry.governorName);
      for (const other of entries) {
        if (other === entry) continue;
        if (entry.points > other.points) acc.allPlayWins++;
        else if (entry.points < other.points) acc.allPlayLosses++;
      }
    }
  }
}

export function aggregateGovernorStats(seasons: SeasonStandings[]): GovernorStats[] {
  const statsMap = new Map<string, Accumulator>();
  const statsFor = (governorName: string): Accumulator => {
    let acc = statsMap.get(governorName);
    if (!acc) {
      acc = emptyAccumulator();
      statsMap.set(governorName, acc);
    }
    return acc;
  };

  for (const standings of seasons) {
    for (const team of standings.teams) {
      if (team.weeklyResults.length === 0) continue;
      const acc = statsFor(team.governorName);
      acc.seasons.add(standings.season);
      acc.pointsAgainst += team.totalPointsAgainst;
      // Every played week counts, including zero and negative scores. The old
      // implementation skipped `points === 0`, which made the career low
      // impossible to reproduce -- the league's real lows include 0.0 and -0.1.
      for (const result of team.weeklyResults as WeeklyResult[]) {
        acc.points.push(result.points);
      }
    }
    accumulateAllPlay(standings, statsFor);
  }

  // Every known governor appears, even one who has not played yet.
  for (const name of governorNames()) {
    if (!statsMap.has(name)) statsMap.set(name, emptyAccumulator());
  }

  const round2 = (v: number) => Math.round(v * 100) / 100;

  return Array.from(statsMap.entries())
    .map(([governorName, acc]) => {
      const total = acc.points.reduce((sum, p) => sum + p, 0);
      const hasData = acc.points.length > 0;
      return {
        governorName,
        seasonsPlayed: acc.seasons.size,
        weekCount: acc.points.length,
        totalPoints: round2(total),
        avgPoints: hasData ? round2(total / acc.points.length) : 0,
        highScore: hasData ? round2(Math.max(...acc.points)) : 0,
        lowScore: hasData ? round2(Math.min(...acc.points)) : 0,
        totalPointsAgainst: round2(acc.pointsAgainst),
        allPlayWins: acc.allPlayWins,
        allPlayLosses: acc.allPlayLosses,
      };
    })
    .sort((a, b) => {
      // Governors with no data sort to the bottom
      if (a.weekCount === 0 && b.weekCount > 0) return 1;
      if (b.weekCount === 0 && a.weekCount > 0) return -1;
      return b.totalPoints - a.totalPoints;
    });
}

export async function fetchHistoricalStats(): Promise<GovernorStats[]> {
  const seasons = Object.keys(LEAGUE_IDS).sort();
  const results = await Promise.all(
    seasons.map((season) =>
      fetchSeasonStandings(season, { includePlayoffs: false }).catch(() => null)
    )
  );
  return aggregateGovernorStats(results.filter((r): r is SeasonStandings => r !== null));
}
