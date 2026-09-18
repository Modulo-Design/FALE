import {
  CURRENT_SEASON,
  LEAGUE_IDS,
  PLAYOFF_FORMAT,
  VP_OVERRIDES,
  regularSeasonWeeks,
} from "./config";
import {
  archivePlayoffPoints,
  archiveToSeasonInput,
  hasArchive,
  loadSeasonArchive,
  resolveArchiveRosters,
} from "./archive-data";
import { resolveGovernor } from "./governors";
import { projectPendingWeeks } from "./live-projections";
import { buildPlayoffBracket, fetchPlayoffBracket } from "./playoffs";
import { monteCarlo } from "./projections";
import { seedPlayoffField } from "./seeding";
import {
  LIVE_REVALIDATE,
  getLeague,
  getMatchups,
  getNflState,
  getRosters,
  getUsers,
  type SleeperMatchup,
  type SleeperNflState,
} from "./sleeper";
import { restrictStandings } from "./standings-view";
import type {
  LiveStatus,
  ProjectedLiveStandings,
  SeasonStandings,
  TeamStanding,
} from "./types";
import { aggregateStandings, applyVPOverrides, calculateWeekVPs } from "./vp";

export interface SeasonRosterInfo {
  rosterId: number;
  ownerId?: string;
  governorName: string;
  resolved: boolean;
  avatar: string | null;
}

export interface SeasonInput {
  season: string;
  leagueId: string;
  leagueName: string;
  rosters: SeasonRosterInfo[];
  /** One entry per regular-season week that was actually played. */
  weeks: { week: number; matchups: SleeperMatchup[] }[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A week counts once any team has scored. An all-zero week is a week that has
 * not been played, not a week everyone lost.
 */
export function isWeekPlayed(matchups: SleeperMatchup[]): boolean {
  return matchups.length > 0 && matchups.some((m) => m.points > 0);
}

export interface LiveWeekContext {
  /** How many rosters the league has, for the no-nfl-state fallback. */
  rosterCount: number;
  /** Sleeper's /state/nfl, or null when the call failed. */
  nflState?: SleeperNflState | null;
}

/**
 * Which of the included weeks are still being played.
 *
 * `isWeekPlayed` calls a week played the moment any team scores, which is true
 * at 1:05pm on a Sunday -- so without this the standings present a third of a
 * week's results as if they were settled.
 *
 * Only ever non-empty for the season in progress. That one guard is what keeps
 * every archived season, the offline audit and the history pipelines producing
 * byte-identical numbers to before this existed.
 */
export function pendingWeeks(
  season: string,
  weeks: { week: number; matchups: SleeperMatchup[] }[],
  ctx: LiveWeekContext
): number[] {
  if (season !== CURRENT_SEASON) return [];
  if (weeks.length === 0) return [];

  const { nflState } = ctx;
  if (nflState) {
    // The NFL has moved on to a later season, or out of the regular season
    // altogether: nothing on this page can still be in progress.
    if (Number(nflState.season) > Number(season)) return [];
    if (nflState.season_type !== "regular") return [];
    return weeks
      .map(({ week }) => week)
      .filter((week) => week >= nflState.week)
      .sort((a, b) => a - b);
  }

  // No NFL clock to go on, so fall back to the newest included week only, and
  // judge it on whether its scores look finished. This heuristic must never
  // reach further back: the league's real history contains genuine 0.0 and
  // -0.1 weeks, and demoting a settled week over one of those would be worse
  // than leaving a live week marked final.
  const newest = weeks.reduce((max, w) => (w.week > max.week ? w : max), weeks[0]);
  const looksUnfinished =
    newest.matchups.length < ctx.rosterCount || newest.matchups.some((m) => m.points === 0);
  return looksUnfinished ? [newest.week] : [];
}

/**
 * The whole standings computation, with no I/O.
 *
 * This is the single source of truth: the page, the API route and the offline
 * audit all go through it, so none of them can drift from the others.
 */
export function computeSeasonStandings(input: SeasonInput): SeasonStandings {
  const { season, rosters } = input;
  const governorToRoster = new Map(rosters.map((r) => [r.governorName, r.rosterId]));

  const weeklyVPs = input.weeks.map(({ week, matchups }) => {
    const raw = calculateWeekVPs(matchups, rosters.length, week, season);
    const adjustments = VP_OVERRIDES.filter(
      (o) => o.season === season && o.week === week
    )
      .map((o) => ({
        rosterId: governorToRoster.get(o.governorName) ?? -1,
        setResult: o.setResult,
        vpDelta: o.vpDelta,
      }))
      .filter((a) => a.rosterId !== -1);
    return applyVPOverrides(raw, adjustments);
  });

  const aggregated = aggregateStandings(weeklyVPs);
  const rosterById = new Map(rosters.map((r) => [r.rosterId, r]));

  const teams: TeamStanding[] = rosters.map((roster) => {
    const agg = aggregated.get(roster.rosterId);
    return {
      rosterId: roster.rosterId,
      userId: roster.ownerId,
      governorName: roster.governorName,
      displayName: roster.governorName,
      avatar: roster.avatar,
      totalVP: agg?.totalVP ?? 0,
      totalPoints: round2(agg?.totalPoints ?? 0),
      totalPointsAgainst: round2(agg?.totalPointsAgainst ?? 0),
      wins: agg?.wins ?? 0,
      losses: agg?.losses ?? 0,
      ties: agg?.ties ?? 0,
      weeklyResults: agg?.weeklyResults ?? [],
    };
  });

  // Any roster the weekly data knows about but the roster list does not.
  for (const [rosterId, agg] of aggregated) {
    if (rosterById.has(rosterId)) continue;
    teams.push({
      rosterId,
      governorName: `Roster ${rosterId}`,
      displayName: `Roster ${rosterId}`,
      avatar: null,
      totalVP: agg.totalVP,
      totalPoints: round2(agg.totalPoints),
      totalPointsAgainst: round2(agg.totalPointsAgainst),
      wins: agg.wins,
      losses: agg.losses,
      ties: agg.ties,
      weeklyResults: agg.weeklyResults,
    });
  }

  teams.sort((a, b) => b.totalVP - a.totalVP || b.totalPoints - a.totalPoints);

  return {
    season,
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    weeksCompleted: input.weeks.length,
    regularSeasonWeeks: regularSeasonWeeks(season),
    teams,
  };
}

/**
 * Project the rest of an unfinished season.
 *
 * Sleeper publishes the full schedule up front -- future weeks come back with a
 * matchup_id and zero points -- so the remaining fixtures are real, not inferred.
 */
function projectSeason(
  season: string,
  standings: SeasonStandings,
  byWeek: { week: number; matchups: SleeperMatchup[] }[],
  playoffWeekStart?: number
): SeasonStandings["projections"] {
  const format = PLAYOFF_FORMAT[season];
  if (!format) return undefined;

  const played = new Set(standings.teams.flatMap((t) => t.weeklyResults.map((r) => r.week)));
  const remainingSchedule = byWeek
    .filter(({ week }) => week <= standings.regularSeasonWeeks && !played.has(week))
    .map(({ week, matchups }) => {
      const groups = new Map<number, number[]>();
      for (const m of matchups) {
        if (m.matchup_id == null) continue;
        groups.set(m.matchup_id, [...(groups.get(m.matchup_id) ?? []), m.roster_id]);
      }
      const pairs = [...groups.values()]
        .filter((ids): ids is [number, number] => ids.length === 2)
        .map((ids) => [ids[0], ids[1]] as [number, number]);
      return { week, pairs };
    });

  if (remainingSchedule.length === 0) return undefined;

  return monteCarlo.run({
    season,
    regularSeasonWeeks: standings.regularSeasonWeeks,
    weeksCompleted: standings.weeksCompleted,
    playoffWeekStart: playoffWeekStart ?? standings.regularSeasonWeeks + 1,
    teams: standings.teams.map((team) => ({
      rosterId: team.rosterId,
      governorName: team.governorName,
      currentVP: team.totalVP,
      currentPoints: team.totalPoints,
      weeklyScores: team.weeklyResults.map((r) => r.points),
    })),
    remainingSchedule,
    playoffFormat: format,
  });
}

/** Playoff seed by roster id, used to rank the beaten semi-finalists. */
function seedMap(season: string, standings: SeasonStandings): Map<number, number> | undefined {
  const format = PLAYOFF_FORMAT[season];
  if (!format) return undefined;
  return new Map(
    seedPlayoffField(standings.teams, format).map((s) => [s.rosterId, s.seed])
  );
}

export interface FetchSeasonOptions {
  /** Skip the playoff bracket when only regular-season data is needed. */
  includePlayoffs?: boolean;
}

/**
 * Standings for a completed season, computed from the committed archive.
 *
 * Past seasons never change, so reading them from disk keeps the dashboard off
 * the network entirely and lets the audit and the tests run in CI.
 */
export async function archivedSeasonStandings(
  season: string,
  options: FetchSeasonOptions = {}
): Promise<SeasonStandings | null> {
  const archive = await loadSeasonArchive(season);
  if (!archive) return null;

  const standings = computeSeasonStandings(archiveToSeasonInput(archive));
  if (options.includePlayoffs === false) return standings;

  const rosterToGovernor = new Map(
    resolveArchiveRosters(season, archive.rosters).map((r) => [r.rosterId, r.governorName])
  );
  const playoffs = buildPlayoffBracket({
    season,
    playoffWeekStart: archive.playoffWeekStart,
    bracket: archive.winnersBracket,
    rosterToGovernor,
    weekPointsMaps: archivePlayoffPoints(archive),
    seedByRoster: seedMap(season, standings),
  });

  return { ...standings, playoffs };
}

/** Fetch a season from Sleeper and compute its standings. */
export async function fetchSeasonStandings(
  season: string,
  options: FetchSeasonOptions = {}
): Promise<SeasonStandings> {
  const { includePlayoffs = true } = options;
  const leagueId = LEAGUE_IDS[season];
  if (!leagueId) throw new Error(`No league id configured for season ${season}`);

  // Only the season in progress needs live data.
  if (season !== CURRENT_SEASON && hasArchive(season)) {
    const archived = await archivedSeasonStandings(season, options);
    if (archived) return archived;
  }

  // Only the season in progress can have a week in progress, so only it pays
  // for the extra call.
  const nflState: SleeperNflState | null =
    season === CURRENT_SEASON ? await getNflState().catch(() => null) : null;

  const [league, rosters, users, playoffs] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getUsers(leagueId),
    includePlayoffs
      ? fetchPlayoffBracket(leagueId, season).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const userMap = new Map(users.map((u) => [u.user_id, u]));
  const rosterInfo: SeasonRosterInfo[] = rosters.map((roster) => {
    const user = roster.owner_id ? userMap.get(roster.owner_id) : undefined;
    const resolution = resolveGovernor(season, {
      rosterId: roster.roster_id,
      username: user?.username,
      displayName: user?.display_name,
      teamName: user?.metadata?.team_name,
    });
    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      governorName: resolution.name,
      resolved: resolution.resolved,
      avatar: user?.avatar ?? null,
    };
  });

  const weekCount = regularSeasonWeeks(season);
  const allWeeks = await Promise.all(
    Array.from({ length: weekCount }, (_, i) =>
      // Weeks the NFL has already finished cannot change, so they keep the
      // hour-long cache; only the week in progress and anything after it is
      // worth re-fetching every minute.
      getMatchups(
        leagueId,
        i + 1,
        nflState && i + 1 >= nflState.week ? { revalidate: LIVE_REVALIDATE } : undefined
      ).catch((): SleeperMatchup[] => [])
    )
  );

  const byWeek = allWeeks.map((matchups, i) => ({ week: i + 1, matchups }));
  const weeks = byWeek.filter(({ matchups }) => isWeekPlayed(matchups));

  const pending = pendingWeeks(season, weeks, {
    rosterCount: rosterInfo.length,
    nflState,
  });
  const isPending = (week: number) => pending.includes(week);

  const standings = computeSeasonStandings({
    season,
    leagueId,
    leagueName: league.name,
    rosters: rosterInfo,
    weeks,
  });

  const liveStatus: LiveStatus | undefined =
    pending.length === 0
      ? undefined
      : {
          source: nflState ? "nfl-state" : "heuristic",
          nflWeek: nflState?.week,
          seasonType: nflState?.season_type,
          fetchedAt: new Date().toISOString(),
        };

  // The table reads `pending` per result so it can mark the provisional
  // figures without being handed a second copy of the standings.
  const teams: TeamStanding[] =
    pending.length === 0
      ? standings.teams
      : standings.teams.map((team) => ({
          ...team,
          weeklyResults: team.weeklyResults.map((result) =>
            isPending(result.week) ? { ...result, pending: true } : result
          ),
        }));

  // The same table with the live week projected forward instead of frozen
  // mid-Sunday. Best-effort: when Sleeper has no projections to give, the
  // field is simply absent and the table offers only Final and Including.
  const projectedLive = await buildProjectedLive({
    season,
    leagueId,
    leagueName: league.name,
    rosters: rosterInfo,
    weeks,
    pending,
    scoringSettings: league.scoring_settings,
  });

  // Projections simulate the weeks that have not happened yet, and a week
  // still being played has not finished happening -- so they run on the
  // final-only standings and treat the live week as a fixture to simulate.
  const settled =
    pending.length === 0
      ? standings
      : restrictStandings(standings, (result) => !isPending(result.week));

  const projections =
    settled.weeksCompleted < weekCount
      ? projectSeason(season, settled, byWeek, league.settings?.playoff_week_start)
      : undefined;

  return {
    ...standings,
    teams,
    playoffs,
    projections,
    pendingWeeks: pending,
    liveStatus,
    projectedLive,
  };
}

interface ProjectedLiveInput extends SeasonInput {
  pending: number[];
  scoringSettings?: Record<string, number> | null;
}

/**
 * The standings recomputed with the pending weeks scored on projections.
 *
 * The projected matchups go back through `computeSeasonStandings` untouched,
 * so the top-half cut, the finale rules and the commissioner overrides all
 * apply to a projected week exactly as they would to a real one -- there is no
 * second reading of the VP rules anywhere in here.
 */
async function buildProjectedLive(
  input: ProjectedLiveInput
): Promise<ProjectedLiveStandings | undefined> {
  const { pending, scoringSettings, ...seasonInput } = input;
  if (pending.length === 0) return undefined;

  const projected = await projectPendingWeeks({
    season: seasonInput.season,
    weeks: seasonInput.weeks.filter(({ week }) => pending.includes(week)),
    scoringSettings,
  }).catch(() => null);
  if (!projected) return undefined;

  const standings = computeSeasonStandings({
    ...seasonInput,
    weeks: seasonInput.weeks.map((entry) => {
      const matchups = projected.byWeek.get(entry.week);
      return matchups ? { ...entry, matchups } : entry;
    }),
  });

  return {
    weeks: pending,
    teams: standings.teams.map((team) => ({
      ...team,
      weeklyResults: team.weeklyResults.map((result) =>
        pending.includes(result.week)
          ? { ...result, pending: true, projected: true }
          : result
      ),
    })),
    finalStarters: projected.finalStarters,
    projectedStarters: projected.projectedStarters,
    fetchedAt: new Date().toISOString(),
  };
}
