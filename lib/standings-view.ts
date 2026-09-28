import type {
  ProjectedLiveStandings,
  SeasonStandings,
  TeamStanding,
  WeeklyResult,
} from "./types";

/**
 * Folding a set of weekly results into season totals.
 *
 * Every figure in the standings is additive per week, and `calculateWeekVPs`
 * decides each week's top-half cut on that week alone, so dropping a week and
 * re-summing gives exactly the same answer as recomputing the season without
 * it. That is what lets the standings table hide a half-played week on the
 * client without the server shipping a second copy of the table.
 *
 * The rules live here rather than inside `aggregateStandings` so the server and
 * the browser cannot end up with two readings of what a finale or a bye week
 * contributes.
 */
export interface WeeklyTotals {
  totalVP: number;
  totalPoints: number;
  totalPointsAgainst: number;
  wins: number;
  losses: number;
  ties: number;
}

export function foldWeeklyResults(results: WeeklyResult[]): WeeklyTotals {
  const totals: WeeklyTotals = {
    totalVP: 0,
    totalPoints: 0,
    totalPointsAgainst: 0,
    wins: 0,
    losses: 0,
    ties: 0,
  };

  for (const result of results) {
    totals.totalVP += result.vp;
    totals.totalPoints += result.points;
    // A finale week pairs teams in Sleeper but is scored league-wide, so its
    // nominal opponent is not a real one and contributes no points against.
    if (!result.isFinale) totals.totalPointsAgainst += result.opponentPoints ?? 0;

    // Finale and bye weeks are scoring-only: they award VP but no result.
    // This is what keeps a 14-week season at 13 games played.
    if (!result.isFinale && !result.bye) {
      if (result.tied) totals.ties++;
      else if (result.won) totals.wins++;
      else totals.losses++;
    }
  }

  return totals;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** One team's standings row over the subset of its weeks that `keep` accepts. */
export function restrictTeam(
  team: TeamStanding,
  keep: (result: WeeklyResult) => boolean
): TeamStanding {
  const weeklyResults = team.weeklyResults.filter(keep);
  const totals = foldWeeklyResults(weeklyResults);
  return {
    ...team,
    totalVP: totals.totalVP,
    totalPoints: round2(totals.totalPoints),
    totalPointsAgainst: round2(totals.totalPointsAgainst),
    wins: totals.wins,
    losses: totals.losses,
    ties: totals.ties,
    weeklyResults,
  };
}

/**
 * The whole table over a subset of weeks, re-sorted and re-counted so it is
 * indistinguishable from computing the season without those weeks at all.
 */
export function restrictStandings(
  standings: SeasonStandings,
  keep: (result: WeeklyResult) => boolean
): SeasonStandings {
  const teams = standings.teams
    .map((team) => restrictTeam(team, keep))
    .sort((a, b) => b.totalVP - a.totalVP || b.totalPoints - a.totalPoints);

  const weeks = new Set<number>();
  for (const team of teams) for (const result of team.weeklyResults) weeks.add(result.week);

  return { ...standings, teams, weeksCompleted: weeks.size };
}

/**
 * Which reading of the week in progress the dashboard is showing.
 *
 *   - "final": settled weeks only; the live week is folded away.
 *   - "projected": the live week as Sleeper's projections say it will finish.
 *   - "live": the live week at its raw score. Never a choice when projections
 *     exist -- see `resolveLiveView`.
 */
export type LiveView = "final" | "live" | "projected";

export interface LiveViewContext {
  /** Whether any included week is still being played. */
  hasPending: boolean;
  /** Whether a projected table exists to show. */
  canProject: boolean;
  /** Whether anything at all is settled to fall back to. */
  hasSettled: boolean;
}

/**
 * The view actually shown, given the one asked for (or none yet).
 *
 * With no choice made, a season with settled weeks opens on Final; the opening
 * Sunday, with nothing settled, opens on the live week instead.
 *
 * The live week is only ever shown projected. Its raw half-played score is
 * deliberately not on offer: at 1:05pm on a Sunday it reports that every
 * governor has scored ten points. "live" survives for two cases that are not a
 * choice -- a finished season, where every week is settled, and a live week
 * with no projections and nothing settled behind it, where the alternative is
 * an empty table.
 */
export function resolveLiveView(requested: LiveView | null, ctx: LiveViewContext): LiveView {
  if (!ctx.hasPending) return "live";
  const wanted = requested ?? (ctx.hasSettled ? "final" : "projected");
  if (wanted === "final") return "final";
  if (ctx.canProject) return "projected";
  return ctx.hasSettled ? "final" : "live";
}

/**
 * The standings rows for a view.
 *
 * VP, points, points against and the record are all per-week additive, and each
 * week's top-half cut is decided on that week alone -- so dropping the live week
 * and re-summing is exact, not an approximation. The projected rows need no
 * folding at all: they are a complete second set whose settled weeks are
 * identical to the live ones.
 */
export function teamsForView(
  view: LiveView,
  teams: TeamStanding[],
  pendingWeeks: readonly number[],
  projectedLive?: ProjectedLiveStandings
): TeamStanding[] {
  if (view === "projected" && projectedLive) return projectedLive.teams;
  if (view !== "final" || pendingWeeks.length === 0) return teams;
  const pending = new Set(pendingWeeks);
  return teams.map((team) => restrictTeam(team, (r) => !pending.has(r.week)));
}
