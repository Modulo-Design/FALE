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
import { buildPlayoffBracket, fetchPlayoffBracket } from "./playoffs";
import { monteCarlo } from "./projections";
import { seedPlayoffField } from "./seeding";
import {
  getLeague,
  getMatchups,
  getRosters,
  getUsers,
  type SleeperMatchup,
} from "./sleeper";
import type { SeasonStandings, TeamStanding } from "./types";
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
      getMatchups(leagueId, i + 1).catch((): SleeperMatchup[] => [])
    )
  );

  const byWeek = allWeeks.map((matchups, i) => ({ week: i + 1, matchups }));
  const weeks = byWeek.filter(({ matchups }) => isWeekPlayed(matchups));

  const standings = computeSeasonStandings({
    season,
    leagueId,
    leagueName: league.name,
    rosters: rosterInfo,
    weeks,
  });

  const projections =
    weeks.length < weekCount
      ? projectSeason(season, standings, byWeek, league.settings?.playoff_week_start)
      : undefined;

  return { ...standings, playoffs, projections };
}
