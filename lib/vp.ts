import {
  FINALE_SCORING_VP,
  MATCHUP_WIN_VP,
  SCORING_VP,
  TIE_VP,
  isFinaleWeek,
} from "./config";
import type { SleeperMatchup } from "./sleeper";
import type { TeamStanding, WeeklyResult } from "./types";

export type { WeeklyResult, TeamStanding } from "./types";

/**
 * Victory Points for a single week.
 *
 * Two VP for a head-to-head win, one for finishing in the top half of the
 * league's scores. The finale week inverts this: no head-to-head VP at all,
 * and top-half scoring is worth three.
 */
export function calculateWeekVPs(
  matchups: SleeperMatchup[],
  totalTeams: number,
  week: number,
  season: string
): WeeklyResult[] {
  const halfCount = Math.ceil(totalTeams / 2);
  const finale = isFinaleWeek(week, season);

  // Ranking by points alone leaves ties to the input order, which makes the
  // top-half cut non-deterministic across runs. Break on roster id.
  const sorted = [...matchups].sort(
    (a, b) => b.points - a.points || a.roster_id - b.roster_id
  );
  const topHalf = new Set(sorted.slice(0, halfCount).map((m) => m.roster_id));

  // A null matchup_id means the roster was not scheduled against anyone.
  const matchupGroups = new Map<number, SleeperMatchup[]>();
  const unpaired: SleeperMatchup[] = [];
  for (const m of matchups) {
    if (m.matchup_id == null) {
      unpaired.push(m);
      continue;
    }
    if (!matchupGroups.has(m.matchup_id)) matchupGroups.set(m.matchup_id, []);
    matchupGroups.get(m.matchup_id)!.push(m);
  }

  const scoringVP = (rosterId: number): number => {
    if (!topHalf.has(rosterId)) return 0;
    return finale ? FINALE_SCORING_VP : SCORING_VP;
  };

  const results: WeeklyResult[] = [];

  for (const [, group] of matchupGroups) {
    if (group.length === 1) {
      unpaired.push(group[0]);
      continue;
    }
    if (group.length !== 2) continue;

    const [a, b] = group;
    const tied = a.points === b.points;

    for (const team of group) {
      const opponent = team === a ? b : a;
      const won = !tied && team.points > opponent.points;
      const vpMatchup = finale ? 0 : tied ? TIE_VP : won ? MATCHUP_WIN_VP : 0;
      const vpScoring = scoringVP(team.roster_id);
      results.push({
        rosterId: team.roster_id,
        week,
        points: team.points,
        opponentRosterId: opponent.roster_id,
        opponentPoints: opponent.points,
        won,
        tied,
        bye: false,
        isFinale: finale,
        vpMatchup,
        vpScoring,
        vpAdjustment: 0,
        vp: vpMatchup + vpScoring,
      });
    }
  }

  // A bye team still scores points and can still earn scoring VP. Dropping it
  // (as the previous implementation did) erased the team from that week
  // entirely -- no row in the weekly grid, no contribution to season points.
  for (const team of unpaired) {
    const vpScoring = scoringVP(team.roster_id);
    results.push({
      rosterId: team.roster_id,
      week,
      points: team.points,
      opponentRosterId: null,
      opponentPoints: null,
      won: false,
      tied: false,
      bye: true,
      isFinale: finale,
      vpMatchup: 0,
      vpScoring,
      vpAdjustment: 0,
      vp: vpScoring,
    });
  }

  return results.sort((a, b) => a.rosterId - b.rosterId);
}

export interface VPAdjustment {
  rosterId: number;
  setResult?: "win" | "loss";
  vpDelta?: number;
}

/**
 * Apply commissioner rulings to one week's results.
 *
 * `setResult` recomputes the matchup VP rather than leaving the caller to
 * hand-encode a delta that also has to account for the flip. Multiple
 * adjustments for the same roster accumulate.
 */
export function applyVPOverrides(
  results: WeeklyResult[],
  adjustments: VPAdjustment[]
): WeeklyResult[] {
  if (adjustments.length === 0) return results;

  return results.map((result) => {
    const applicable = adjustments.filter((a) => a.rosterId === result.rosterId);
    if (applicable.length === 0) return result;

    let won = result.won;
    let tied = result.tied;
    let vpMatchup = result.vpMatchup;
    let vpAdjustment = 0;

    for (const adjustment of applicable) {
      if (adjustment.setResult) {
        won = adjustment.setResult === "win";
        tied = false;
        vpMatchup = result.isFinale ? 0 : won ? MATCHUP_WIN_VP : 0;
      }
      vpAdjustment += adjustment.vpDelta ?? 0;
    }

    return {
      ...result,
      won,
      tied,
      vpMatchup,
      vpAdjustment,
      vp: vpMatchup + result.vpScoring + vpAdjustment,
    };
  });
}

export type AggregatedStanding = Pick<
  TeamStanding,
  | "rosterId"
  | "totalVP"
  | "totalPoints"
  | "totalPointsAgainst"
  | "wins"
  | "losses"
  | "ties"
  | "weeklyResults"
>;

export function aggregateStandings(
  weeklyData: WeeklyResult[][]
): Map<number, AggregatedStanding> {
  const standings = new Map<number, AggregatedStanding>();

  for (const week of weeklyData) {
    for (const result of week) {
      let standing = standings.get(result.rosterId);
      if (!standing) {
        standing = {
          rosterId: result.rosterId,
          totalVP: 0,
          totalPoints: 0,
          totalPointsAgainst: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          weeklyResults: [],
        };
        standings.set(result.rosterId, standing);
      }

      standing.totalVP += result.vp;
      standing.totalPoints += result.points;
      standing.totalPointsAgainst += result.opponentPoints ?? 0;

      // Finale and bye weeks are scoring-only: they award VP but no result.
      // This is what keeps a 14-week season at 13 games played.
      if (!result.isFinale && !result.bye) {
        if (result.tied) standing.ties++;
        else if (result.won) standing.wins++;
        else standing.losses++;
      }

      standing.weeklyResults.push(result);
    }
  }

  for (const standing of standings.values()) {
    standing.weeklyResults.sort((a, b) => a.week - b.week);
  }

  return standings;
}
