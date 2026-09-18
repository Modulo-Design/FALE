// Projecting the week in progress.
//
// The standings table can fold a half-played week back in, but a half-played
// week is a half-played week: at 1:05pm on a Sunday it says every governor has
// scored ten points. This module answers the other question -- what the week
// looks like once it finishes -- by replacing each roster's live score with a
// projected one and handing the result straight back through the normal VP
// pipeline, so a projected table is computed by exactly the same rules as a
// real one.
//
// Everything here is best-effort. The projection and schedule feeds live on
// Sleeper's newer undocumented host, so any failure means no projected view is
// offered, never a wrong one.

import {
  getWeekProjections,
  getWeekSchedule,
  type SleeperMatchup,
  type SleeperProjection,
  type SleeperScheduleGame,
} from "./sleeper";

/** Sleeper's slot filler for an empty starting spot. */
const EMPTY_SLOT = new Set(["0", "", "null"]);

export type GameStatus = "pre_game" | "in_game" | "complete";

/** Which stats column of the projection feed this league's scoring reads. */
export type ScoringKey = "pts_ppr" | "pts_half_ppr" | "pts_std";

/**
 * The scoring column that matches the league's reception value.
 *
 * Sleeper publishes each projection in all three formats, so this only has to
 * pick the column rather than re-score anything.
 */
export function scoringKey(scoringSettings?: Record<string, number> | null): ScoringKey {
  const rec = scoringSettings?.rec ?? 0;
  if (rec >= 1) return "pts_ppr";
  if (rec > 0) return "pts_half_ppr";
  return "pts_std";
}

export interface ProjectionSource {
  /** Projected points for the week, by player id. */
  points: Map<string, number>;
  /** The player's NFL team, which is what ties him to a kickoff. */
  team: Map<string, string>;
}

export function indexProjections(
  projections: SleeperProjection[],
  key: ScoringKey
): ProjectionSource {
  const points = new Map<string, number>();
  const team = new Map<string, string>();
  for (const projection of projections) {
    if (!projection?.player_id) continue;
    const value = projection.stats?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      points.set(projection.player_id, value);
    }
    if (projection.team) team.set(projection.player_id, projection.team.toUpperCase());
  }
  return { points, team };
}

/**
 * Game status by NFL team.
 *
 * Only "finished or not" matters here, so the many strings Sleeper can put in
 * `status` collapse to three.
 */
export function indexSchedule(games: SleeperScheduleGame[]): Map<string, GameStatus> {
  const byTeam = new Map<string, GameStatus>();
  for (const game of games) {
    const status = normalizeStatus(game?.status);
    for (const team of [game?.home, game?.away]) {
      if (team) byTeam.set(team.toUpperCase(), status);
    }
  }
  return byTeam;
}

function normalizeStatus(status?: string | null): GameStatus {
  const value = (status ?? "").toLowerCase();
  if (value.includes("complete") || value.includes("final") || value.includes("post")) {
    return "complete";
  }
  if (value.includes("in_game") || value.includes("in progress") || value.includes("live")) {
    return "in_game";
  }
  return "pre_game";
}

export interface ProjectedWeek {
  /** The same matchups, with `points` replaced by the projected total. */
  matchups: SleeperMatchup[];
  /** Starters counted at their real, finished score. */
  finalStarters: number;
  /** Starters counted at their projection because their game is not over. */
  projectedStarters: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * One week's matchups, re-scored on projections.
 *
 * Per starter:
 *   - his game is over, so his score is his score;
 *   - his game has not kicked off, so he counts at his projection;
 *   - his game is in progress, so he counts at whichever is higher, which
 *     keeps a player who has already beaten his projection from being marked
 *     back down to it.
 *
 * A player with no projection always counts at his real score: the alternative
 * is dropping him from his roster's total entirely.
 */
export function projectWeekMatchups(
  matchups: SleeperMatchup[],
  projections: ProjectionSource,
  gameStatus: Map<string, GameStatus>
): ProjectedWeek {
  let finalStarters = 0;
  let projectedStarters = 0;

  const projected = matchups.map((matchup) => {
    // Nothing to project from: a matchup with no starter breakdown keeps the
    // score Sleeper gave it.
    if (!matchup.starters?.length) return matchup;

    let total = 0;
    matchup.starters.forEach((playerId, index) => {
      if (!playerId || EMPTY_SLOT.has(playerId)) return;
      const actual = matchup.starters_points?.[index] ?? 0;
      const projection = projections.points.get(playerId);
      const team = projections.team.get(playerId);
      const status = team ? gameStatus.get(team) : undefined;

      // No projection, or a game already in the books: the real score stands.
      if (projection == null || status === "complete") {
        total += actual;
        finalStarters++;
        return;
      }

      // Unknown status is treated as in progress -- the conservative reading,
      // since it never throws away points already on the board.
      total += status === "pre_game" ? projection : Math.max(actual, projection);
      projectedStarters++;
    });

    return { ...matchup, points: round2(total) };
  });

  return { matchups: projected, finalStarters, projectedStarters };
}

export interface ProjectPendingWeeksInput {
  season: string;
  /** The weeks still being played, and the live matchups behind them. */
  weeks: { week: number; matchups: SleeperMatchup[] }[];
  scoringSettings?: Record<string, number> | null;
}

export interface ProjectedWeeks {
  byWeek: Map<number, SleeperMatchup[]>;
  finalStarters: number;
  projectedStarters: number;
}

/**
 * Fetch projections for the weeks in progress and re-score them.
 *
 * Returns null when there is nothing to project with, which is what makes the
 * projected view an offer rather than a promise.
 */
export async function projectPendingWeeks(
  input: ProjectPendingWeeksInput
): Promise<ProjectedWeeks | null> {
  const { season, weeks } = input;
  if (weeks.length === 0) return null;

  const key = scoringKey(input.scoringSettings);
  const fetched = await Promise.all(
    weeks.map(async ({ week }) => {
      const [projections, schedule] = await Promise.all([
        getWeekProjections(season, week).catch((): SleeperProjection[] => []),
        getWeekSchedule(season, week).catch((): SleeperScheduleGame[] => []),
      ]);
      return { week, projections, schedule };
    })
  );

  const byWeek = new Map<number, SleeperMatchup[]>();
  let finalStarters = 0;
  let projectedStarters = 0;

  for (const { week, projections, schedule } of fetched) {
    if (projections.length === 0) continue;
    const matchups = weeks.find((w) => w.week === week)?.matchups ?? [];
    const result = projectWeekMatchups(
      matchups,
      indexProjections(projections, key),
      indexSchedule(schedule)
    );
    byWeek.set(week, result.matchups);
    finalStarters += result.finalStarters;
    projectedStarters += result.projectedStarters;
  }

  if (byWeek.size === 0) return null;
  return { byWeek, finalStarters, projectedStarters };
}
