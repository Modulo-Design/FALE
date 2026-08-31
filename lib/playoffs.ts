import { PLAYOFF_FORMAT, regularSeasonWeeks } from "./config";
import { resolveGovernor } from "./governors";
import {
  getLeague,
  getMatchups,
  getRosters,
  getUsers,
  getWinnersBracket,
  type SleeperBracketMatchup,
} from "./sleeper";
import type { PlayoffBracket, PlayoffMatchupResult, PlayoffTeamResult } from "./types";

export type {
  PlayoffBracket,
  PlayoffMatchupResult,
  PlayoffTeamResult,
  Podium,
} from "./types";

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

export interface BuildBracketInput {
  season: string;
  playoffWeekStart: number;
  bracket: SleeperBracketMatchup[];
  rosterToGovernor: Map<number, string>;
  /** Points by roster id, one map per playoff round. */
  weekPointsMaps: Map<number, number>[];
}

export function buildPlayoffBracket(input: BuildBracketInput): PlayoffBracket {
  const { season, playoffWeekStart, bracket, rosterToGovernor, weekPointsMaps } = input;
  const format = PLAYOFF_FORMAT[season];

  if (bracket.length === 0) {
    return {
      season,
      playoffWeekStart,
      rounds: [],
      playoffTeams: format?.teams ?? 0,
      byeCount: format?.byes ?? 0,
      complete: false,
    };
  }

  const sortedBracket = [...bracket].sort((a, b) => a.r - b.r || a.m - b.m);
  const maxRound = sortedBracket.reduce((max, m) => Math.max(max, m.r), 0);

  const winnerByMatch = new Map<number, number>();
  const loserByMatch = new Map<number, number>();
  // Teams that actually took the field in round 1 (used to detect real byes below),
  // since Sleeper fills in t1/t2 directly on every round once played -- t1_from/t2_from
  // aren't reliably present once a bracket is complete, so they can't be used to tell
  // "won a real game" apart from "had a bye" for past seasons.
  const round1RosterIds = new Set<number>();
  const byeTeamIds = new Set<number>();
  const byRoundRaw = new Map<number, PlayoffMatchupResult[]>();

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

    if (!byRoundRaw.has(entry.r)) byRoundRaw.set(entry.r, []);
    byRoundRaw.get(entry.r)!.push({ round: entry.r, week, placement: entry.p, teams });
  }

  // The third-place game is a placement game, so the alive-set filter below
  // strips it out along with the rest of the consolation bracket. That filter is
  // correct -- the league counts neither in playoff records nor playoff points --
  // so capture third place here, before filtering, and keep it out of `rounds`
  // so the bracket's connector geometry is unaffected.
  //
  // Third place genuinely needs this game: it is not simply the higher-scoring
  // semi-final loser. In 2024 Knute finished third on 143.45 despite Chris
  // scoring 148.65, and 2020 has the same inversion.
  let thirdPlaceGame: PlayoffMatchupResult | undefined;
  for (const entries of byRoundRaw.values()) {
    const found = entries.find((m) => m.placement === 3);
    if (found) {
      thirdPlaceGame = found;
      break;
    }
  }
  const thirdPlace = thirdPlaceGame?.teams.find((t) => t.won)?.governorName;

  // Sleeper's bracket also carries consolation/placement games (3rd place, 5th place,
  // etc.) tagged with the same round numbers as the real championship lineage. Only
  // keep matches between teams still alive in the winner's-bracket line: winners of
  // the previous round (plus bye teams, who enter alive at round 2).
  const filteredByRound = new Map<number, PlayoffMatchupResult[]>();
  let alive: Set<number> | null = null;
  for (let r = 1; r <= maxRound; r++) {
    const entries = byRoundRaw.get(r) ?? [];
    const kept = alive ? entries.filter((m) => m.teams.every((t) => alive!.has(t.rosterId))) : entries;
    filteredByRound.set(r, kept);

    const survivors = new Set<number>();
    for (const m of kept) {
      const winner = m.teams.find((t) => t.won);
      if (winner) survivors.add(winner.rosterId);
    }
    if (r === 1) {
      for (const id of byeTeamIds) survivors.add(id);
    }
    alive = survivors;
  }

  const round1PointsMap = weekPointsMaps[0] ?? new Map<number, number>();
  const byeMatchup = (rosterId: number): PlayoffMatchupResult => ({
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

  // Reorder each round (working backward from the championship, joining on winner
  // roster id) so round r+1's match i always follows round r's matches 2i and 2i+1 --
  // this is what lets the UI draw correct bracket connector lines.
  const orderedByRound = new Map<number, PlayoffMatchupResult[]>();
  orderedByRound.set(maxRound, filteredByRound.get(maxRound) ?? []);
  for (let r = maxRound; r > 1; r--) {
    const thisRound = orderedByRound.get(r)!;
    const prevMatches = filteredByRound.get(r - 1) ?? [];
    const winnerToMatch = new Map<number, PlayoffMatchupResult>();
    for (const m of prevMatches) {
      const winner = m.teams.find((t) => t.won);
      if (winner) winnerToMatch.set(winner.rosterId, m);
    }

    const prevOrdered: PlayoffMatchupResult[] = [];
    const used = new Set<PlayoffMatchupResult>();
    for (const match of thisRound) {
      for (const team of match.teams) {
        const feeder = winnerToMatch.get(team.rosterId);
        if (feeder && !used.has(feeder)) {
          prevOrdered.push(feeder);
          used.add(feeder);
        } else if (r - 1 === 1 && byeTeamIds.has(team.rosterId)) {
          prevOrdered.push(byeMatchup(team.rosterId));
        }
      }
    }
    for (const m of prevMatches) {
      if (!used.has(m)) prevOrdered.push(m);
    }
    orderedByRound.set(r - 1, prevOrdered);
  }

  const rounds: PlayoffMatchupResult[] = [];
  for (let r = 1; r <= maxRound; r++) {
    rounds.push(...(orderedByRound.get(r) ?? []));
  }

  const championshipGame =
    filteredByRound.get(maxRound)?.find((m) => m.placement === 1) ?? filteredByRound.get(maxRound)?.[0];
  const champion = championshipGame?.teams.find((t) => t.won)?.governorName;
  const runnerUp = championshipGame?.teams.find((t) => !t.won)?.governorName;

  const podium = champion && runnerUp ? { first: champion, second: runnerUp, third: thirdPlace } : undefined;

  return {
    season,
    playoffWeekStart,
    rounds,
    champion,
    runnerUp,
    thirdPlace,
    thirdPlaceGame,
    podium,
    playoffTeams: round1RosterIds.size + byeTeamIds.size,
    byeCount: byeTeamIds.size,
    complete: Boolean(champion),
  };
}

export async function fetchPlayoffBracket(
  leagueId: string,
  season: string
): Promise<PlayoffBracket> {
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
      return [
        r.roster_id,
        resolveGovernor(season, {
          rosterId: r.roster_id,
          username: user?.username,
          displayName: user?.display_name,
          teamName: user?.metadata?.team_name,
        }).name,
      ] as const;
    })
  );

  const playoffWeekStart =
    league.settings?.playoff_week_start ?? regularSeasonWeeks(season) + 1;

  if (bracket.length === 0) {
    return buildPlayoffBracket({
      season,
      playoffWeekStart,
      bracket,
      rosterToGovernor: new Map(rosterToGovernor),
      weekPointsMaps: [],
    });
  }

  const maxRound = bracket.reduce((max, m) => Math.max(max, m.r), 0);
  const weekPointsMaps = await Promise.all(
    Array.from({ length: maxRound }, (_, i) =>
      getMatchups(leagueId, playoffWeekStart + i)
        .then((matchups) => new Map(matchups.map((m) => [m.roster_id, m.points])))
        .catch(() => new Map<number, number>())
    )
  );

  return buildPlayoffBracket({
    season,
    playoffWeekStart,
    bracket,
    rosterToGovernor: new Map(rosterToGovernor),
    weekPointsMaps,
  });
}
