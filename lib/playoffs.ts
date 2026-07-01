import { getLeague, getRosters, getUsers, getMatchups, getWinnersBracket, SleeperBracketMatchup } from "./sleeper";
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

// A node in the real championship lineage: either a resolved match (identified by
// its bracket match id `m`) or a team that entered directly with no prior game (a bye).
type TreeChild = { kind: "match"; m: number } | { kind: "bye"; rosterId: number };

// Walks backward from a match's t1_from/t2_from to find what actually feeds it, so we
// only follow the winner's-bracket lineage and never a consolation/placement branch.
function childFor(
  rawId: number | null,
  from: { w?: number; l?: number } | null | undefined,
  matchByM: Map<number, SleeperBracketMatchup>
): TreeChild | null {
  const refId = from?.w ?? from?.l;
  if (refId != null && matchByM.has(refId)) {
    return { kind: "match", m: refId };
  }
  if (rawId != null) return { kind: "bye", rosterId: rawId };
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

  if (bracket.length === 0) {
    return { season, playoffWeekStart: (REGULAR_SEASON_LENGTH[season] ?? 14) + 1, rounds: [] };
  }

  const playoffWeekStart = league.settings?.playoff_week_start ?? (REGULAR_SEASON_LENGTH[season] ?? 14) + 1;
  const sortedBracket = [...bracket].sort((a, b) => a.r - b.r || a.m - b.m);
  const maxRound = sortedBracket.reduce((max, m) => Math.max(max, m.r), 0);
  const matchByM = new Map(sortedBracket.map((e) => [e.m, e]));

  const weekPointsMaps = await Promise.all(
    Array.from({ length: maxRound }, (_, i) =>
      getMatchups(leagueId, playoffWeekStart + i)
        .then((matchups) => new Map(matchups.map((m) => [m.roster_id, m.points])))
        .catch(() => new Map<number, number>())
    )
  );

  // Resolve every bracket entry's actual participants/scores once, keyed by match id,
  // independent of which entries end up in the real championship lineage.
  const winnerByMatch = new Map<number, number>();
  const loserByMatch = new Map<number, number>();
  const matchInfoByM = new Map<number, { week: number; placement?: number; teams: PlayoffTeamResult[] }>();
  for (const entry of sortedBracket) {
    const t1 = resolveRosterId(entry.t1, entry.t1_from, winnerByMatch, loserByMatch);
    const t2 = resolveRosterId(entry.t2, entry.t2_from, winnerByMatch, loserByMatch);
    const week = playoffWeekStart + (entry.r - 1);
    const pointsMap = weekPointsMaps[entry.r - 1] ?? new Map<number, number>();

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

    matchInfoByM.set(entry.m, { week, placement: entry.p, teams });
  }

  // Walk backward from the championship match through t1_from/t2_from only, so
  // consolation/placement games (3rd place, 5th place, etc.) are never included, and
  // so each round's list is ordered such that round r+1's match i pairs exactly with
  // round r's matches 2i and 2i+1 (needed to draw correct bracket connector lines).
  const championshipEntry =
    sortedBracket.find((e) => e.p === 1) ?? sortedBracket.reduce((max, e) => (e.r > max.r ? e : max));

  const roundNodes = new Map<number, TreeChild[]>();
  roundNodes.set(championshipEntry.r, [{ kind: "match", m: championshipEntry.m }]);
  for (let r = championshipEntry.r; r > 1; r--) {
    const nodes = roundNodes.get(r)!;
    const nextNodes: TreeChild[] = [];
    for (const node of nodes) {
      if (node.kind !== "match") continue;
      const entry = matchByM.get(node.m)!;
      const left = childFor(entry.t1, entry.t1_from, matchByM);
      const right = childFor(entry.t2, entry.t2_from, matchByM);
      if (left) nextNodes.push(left);
      if (right) nextNodes.push(right);
    }
    roundNodes.set(r - 1, nextNodes);
  }

  const round1PointsMap = weekPointsMaps[0] ?? new Map<number, number>();
  const rounds: PlayoffMatchupResult[] = [];
  for (let r = 1; r <= championshipEntry.r; r++) {
    for (const node of roundNodes.get(r) ?? []) {
      if (node.kind === "bye") {
        rounds.push({
          round: r,
          week: playoffWeekStart,
          isBye: true,
          teams: [
            {
              rosterId: node.rosterId,
              governorName: rosterToGovernor.get(node.rosterId) ?? `Team ${node.rosterId}`,
              points: round1PointsMap.get(node.rosterId) ?? 0,
              won: true,
            },
          ],
        });
      } else {
        const info = matchInfoByM.get(node.m)!;
        rounds.push({ round: r, week: info.week, placement: info.placement, teams: info.teams });
      }
    }
  }

  const championshipInfo = matchInfoByM.get(championshipEntry.m)!;
  const champion = championshipInfo.teams.find((t) => t.won)?.governorName;
  const runnerUp = championshipInfo.teams.find((t) => !t.won)?.governorName;

  return { season, playoffWeekStart, rounds, champion, runnerUp };
}
