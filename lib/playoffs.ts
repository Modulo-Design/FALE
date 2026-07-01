import { getLeague, getRosters, getUsers, getMatchups, getWinnersBracket } from "./sleeper";
import { GOVERNOR_NAMES, REGULAR_SEASON_LENGTH } from "./config";

export interface PlayoffTeamResult {
  rosterId: number;
  governorName: string;
  points: number;
  won: boolean;
}

export interface PlayoffMatchupResult {
  round: number;
  week: number;
  placement?: number; // 1 = championship game
  isBye?: boolean;
  teams: PlayoffTeamResult[];
}

export interface PlayoffBracket {
  season: string;
  playoffWeekStart: number;
  rounds: PlayoffMatchupResult[];
  champion?: string;
  runnerUp?: string;
}

function resolveRosterId(
  id: number | null | undefined,
  from: { w?: number; l?: number } | null | undefined,
  winnerByMatch: Map<number, number>,
  loserByMatch: Map<number, number>
): number | null {
  if (id != null) return id;
  if (from?.w != null) return winnerByMatch.get(from.w) ?? null;
  if (from?.l != null) return loserByMatch.get(from.l) ?? null;
  return null;
}

export async function fetchPlayoffBracket(leagueId: string, season: string): Promise<PlayoffBracket> {
  const [league, rosters, users, bracket] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getUsers(leagueId),
    getWinnersBracket(leagueId),
  ]);

  const userMap = new Map(users.map((u) => [u.user_id, u]));
  const rosterToGovernor = new Map(
    rosters.map((r) => {
      const user = r.owner_id ? userMap.get(r.owner_id) : undefined;
      const sleeperName = (user?.username ?? user?.display_name ?? "").toLowerCase();
      const name = GOVERNOR_NAMES[sleeperName] ?? user?.display_name ?? user?.username ?? `Team ${r.roster_id}`;
      return [r.roster_id, name];
    })
  );

  const playoffWeekStart = league.settings?.playoff_week_start ?? (REGULAR_SEASON_LENGTH[season] ?? 14) + 1;
  const sortedBracket = [...bracket].sort((a, b) => a.r - b.r || a.m - b.m);
  const maxRound = sortedBracket.reduce((max, m) => Math.max(max, m.r), 0);

  const weekPointsMaps = await Promise.all(
    Array.from({ length: maxRound }, (_, i) =>
      getMatchups(leagueId, playoffWeekStart + i)
        .then((matchups) => new Map(matchups.map((m) => [m.roster_id, m.points])))
        .catch(() => new Map<number, number>())
    )
  );

  const winnerByMatch = new Map<number, number>();
  const loserByMatch = new Map<number, number>();
  const rounds: PlayoffMatchupResult[] = [];
  // Teams that actually took the field in round 1 (used to detect real byes below),
  // since some leagues' bracket data fills in t1/t2 directly on every round once
  // played, regardless of whether the team advanced via t*_from or a bye.
  const round1RosterIds = new Set<number>();
  const byeTeamIds = new Set<number>();
  let champion: string | undefined;
  let runnerUp: string | undefined;

  for (const entry of sortedBracket) {
    const t1 = resolveRosterId(entry.t1, entry.t1_from, winnerByMatch, loserByMatch);
    const t2 = resolveRosterId(entry.t2, entry.t2_from, winnerByMatch, loserByMatch);
    const week = playoffWeekStart + (entry.r - 1);
    const pointsMap = weekPointsMaps[entry.r - 1] ?? new Map<number, number>();

    if (entry.r === 1) {
      if (t1 != null) round1RosterIds.add(t1);
      if (t2 != null) round1RosterIds.add(t2);
    } else {
      if (t1 != null && !round1RosterIds.has(t1)) byeTeamIds.add(t1);
      if (t2 != null && !round1RosterIds.has(t2)) byeTeamIds.add(t2);
    }

    const teams: PlayoffTeamResult[] = [t1, t2]
      .filter((id): id is number => id != null)
      .map((rosterId) => ({
        rosterId,
        governorName: rosterToGovernor.get(rosterId) ?? `Team ${rosterId}`,
        points: pointsMap.get(rosterId) ?? 0,
        won: entry.w != null ? entry.w === rosterId : false,
      }));

    if (entry.w != null) winnerByMatch.set(entry.m, entry.w);
    if (entry.l != null) loserByMatch.set(entry.m, entry.l);

    rounds.push({ round: entry.r, week, placement: entry.p, teams });

    if (entry.p === 1 && entry.w != null) {
      champion = rosterToGovernor.get(entry.w);
      runnerUp = entry.l != null ? rosterToGovernor.get(entry.l) : undefined;
    }
  }

  if (!champion) {
    const finalRoundGame = rounds.find((r) => r.round === maxRound && !r.placement);
    const winnerTeam = finalRoundGame?.teams.find((t) => t.won);
    if (winnerTeam) {
      champion = winnerTeam.governorName;
      runnerUp = finalRoundGame?.teams.find((t) => !t.won)?.governorName;
    }
  }

  // A team that appears in round 2+ but never played round 1 had a first-round bye.
  // Sleeper's bracket has no round-1 entry for that team, so synthesize one for display.
  const round1PointsMap = weekPointsMaps[0] ?? new Map<number, number>();
  for (const rosterId of byeTeamIds) {
    rounds.unshift({
      round: 1,
      week: playoffWeekStart,
      isBye: true,
      teams: [
        {
          rosterId,
          governorName: rosterToGovernor.get(rosterId) ?? `Team ${rosterId}`,
          points: round1PointsMap.get(rosterId) ?? 0,
          won: true,
        },
      ],
    });
  }

  return { season, playoffWeekStart, rounds, champion, runnerUp };
}
