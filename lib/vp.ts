import { SleeperMatchup } from "./sleeper";

export interface WeeklyResult {
  rosterId: number;
  points: number;
  won: boolean;
  vpMatchup: number; // 2 for win, 0 for loss
  vpScoring: number; // 1 for top half, 0 for bottom half
  vp: number;
}

export interface TeamStanding {
  rosterId: number;
  totalVP: number;
  totalPoints: number;
  wins: number;
  losses: number;
  weeklyResults: WeeklyResult[];
}

// Week 14 finale rule (2021+): no H2H VPs, but 3 VPs for top-half scoring.
function isFinaleWeek(week: number, season: string): boolean {
  return week === 14 && Number(season) >= 2021;
}

export function calculateWeekVPs(
  matchups: SleeperMatchup[],
  totalTeams: number,
  week: number,
  season: string
): WeeklyResult[] {
  const halfCount = Math.ceil(totalTeams / 2);
  const finale = isFinaleWeek(week, season);

  const matchupGroups = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    if (!matchupGroups.has(m.matchup_id)) matchupGroups.set(m.matchup_id, []);
    matchupGroups.get(m.matchup_id)!.push(m);
  }

  const sorted = [...matchups].sort((a, b) => b.points - a.points);
  const topHalf = new Set(sorted.slice(0, halfCount).map((m) => m.roster_id));

  const results: WeeklyResult[] = [];
  for (const [, pair] of matchupGroups) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    const aWon = a.points > b.points;
    for (const team of [a, b]) {
      const won = team === a ? aWon : !aWon;
      const inTopHalf = topHalf.has(team.roster_id);
      const vpMatchup = finale ? 0 : won ? 2 : 0;
      const vpScoring = finale ? (inTopHalf ? 3 : 0) : inTopHalf ? 1 : 0;
      results.push({
        rosterId: team.roster_id,
        points: team.points,
        won,
        vpMatchup,
        vpScoring,
        vp: vpMatchup + vpScoring,
      });
    }
  }
  return results;
}

export function aggregateStandings(weeklyData: WeeklyResult[][]): Map<number, TeamStanding> {
  const standings = new Map<number, TeamStanding>();

  for (const week of weeklyData) {
    for (const result of week) {
      if (!standings.has(result.rosterId)) {
        standings.set(result.rosterId, {
          rosterId: result.rosterId,
          totalVP: 0,
          totalPoints: 0,
          wins: 0,
          losses: 0,
          weeklyResults: [],
        });
      }
      const s = standings.get(result.rosterId)!;
      s.totalVP += result.vp;
      s.totalPoints += result.points;
      if (result.won) s.wins++;
      else s.losses++;
      s.weeklyResults.push(result);
    }
  }

  return standings;
}
