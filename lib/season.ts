import {
  LEAGUE_IDS,
  VP_OVERRIDES,
  regularSeasonWeeks,
} from "./config";
import { resolveGovernor } from "./governors";
import { fetchPlayoffBracket } from "./playoffs";
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

export interface FetchSeasonOptions {
  /** Skip the playoff bracket when only regular-season data is needed. */
  includePlayoffs?: boolean;
}

/** Fetch a season from Sleeper and compute its standings. */
export async function fetchSeasonStandings(
  season: string,
  options: FetchSeasonOptions = {}
): Promise<SeasonStandings> {
  const { includePlayoffs = true } = options;
  const leagueId = LEAGUE_IDS[season];
  if (!leagueId) throw new Error(`No league id configured for season ${season}`);

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

  const weeks = allWeeks
    .map((matchups, i) => ({ week: i + 1, matchups }))
    .filter(({ matchups }) => isWeekPlayed(matchups));

  const standings = computeSeasonStandings({
    season,
    leagueId,
    leagueName: league.name,
    rosters: rosterInfo,
    weeks,
  });

  return { ...standings, playoffs };
}
