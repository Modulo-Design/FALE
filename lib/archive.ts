import { LEAGUE_IDS, regularSeasonWeeks } from "./config";
import {
  getDraftPicks,
  getDrafts,
  getLeague,
  getLosersBracket,
  getMatchups,
  getRosters,
  getTradedPicks,
  getTransactions,
  getUsers,
  getWinnersBracket,
  type SleeperBracketMatchup,
  type SleeperDraftPick,
  type SleeperTradedPick,
} from "./sleeper";

export const ARCHIVE_SCHEMA_VERSION = 1;

/** How much of a season to capture. */
export type ArchiveScope = "core" | "deep";

export interface ArchiveMatchup {
  rosterId: number;
  matchupId: number | null;
  points: number;
  /** Only present in the "deep" scope: the record book needs these. */
  starters?: string[];
  startersPoints?: number[];
  players?: string[];
  playersPoints?: Record<string, number>;
}

export interface ArchiveRoster {
  rosterId: number;
  ownerId: string | null;
  username: string | null;
  displayName: string | null;
  teamName: string | null;
  avatar: string | null;
}

export interface ArchiveTransaction {
  season: string;
  week: number;
  transactionId: string;
  type: string;
  status: string;
  created: number;
  rosterIds: number[];
  playerMoves: { playerId: string; fromRosterId: number | null; toRosterId: number }[];
  pickMoves: {
    pickSeason: string;
    round: number;
    originalRosterId: number;
    fromRosterId: number;
    toRosterId: number;
  }[];
  faabMoves: { fromRosterId: number; toRosterId: number; amount: number }[];
}

export interface SeasonArchive {
  schemaVersion: number;
  scope: ArchiveScope;
  season: string;
  leagueId: string;
  leagueName: string;
  regularSeasonWeeks: number;
  playoffWeekStart: number;
  totalRosters: number;
  playoffTeams: number | null;
  rosters: ArchiveRoster[];
  weeks: { week: number; played: boolean; matchups: ArchiveMatchup[] }[];
  winnersBracket: SleeperBracketMatchup[];
  losersBracket: SleeperBracketMatchup[];
  transactions: ArchiveTransaction[];
  draft: {
    draftId: string;
    slotToRosterId: Record<string, number>;
    picks: SleeperDraftPick[];
  } | null;
  tradedPicks: SleeperTradedPick[];
  fetchedAt: string;
}

/**
 * Trades are the only transaction type worth archiving in full: waivers and
 * free agency are noise for the history book, and there are thousands of them.
 */
function normalizeTransactions(
  season: string,
  week: number,
  transactions: Awaited<ReturnType<typeof getTransactions>>
): ArchiveTransaction[] {
  return transactions
    .filter((t) => t.type === "trade" && t.status === "complete")
    .map((t) => ({
      season,
      week,
      transactionId: t.transaction_id,
      type: t.type,
      status: t.status,
      created: t.created,
      rosterIds: t.roster_ids ?? [],
      playerMoves: Object.entries(t.adds ?? {}).map(([playerId, toRosterId]) => ({
        playerId,
        fromRosterId: t.drops?.[playerId] ?? null,
        toRosterId,
      })),
      pickMoves: (t.draft_picks ?? []).map((p) => ({
        pickSeason: p.season,
        round: p.round,
        originalRosterId: p.roster_id,
        fromRosterId: p.previous_owner_id,
        toRosterId: p.owner_id,
      })),
      faabMoves: (t.waiver_budget ?? []).map((w) => ({
        fromRosterId: w.sender,
        toRosterId: w.receiver,
        amount: w.amount,
      })),
    }));
}

/**
 * Snapshot one season from Sleeper.
 *
 * Seasons before the current one never change, so an archive committed to the
 * repo lets the audit, the record book and the trade tracker all run with no
 * network at all.
 */
export async function buildSeasonArchive(
  season: string,
  scope: ArchiveScope = "core"
): Promise<SeasonArchive> {
  const leagueId = LEAGUE_IDS[season];
  if (!leagueId) throw new Error(`No league id configured for season ${season}`);

  const [league, rosters, users, winnersBracket, losersBracket, drafts, tradedPicks] =
    await Promise.all([
      getLeague(leagueId),
      getRosters(leagueId),
      getUsers(leagueId),
      getWinnersBracket(leagueId),
      getLosersBracket(leagueId),
      getDrafts(leagueId),
      getTradedPicks(leagueId),
    ]);

  const userMap = new Map(users.map((u) => [u.user_id, u]));
  const archiveRosters: ArchiveRoster[] = rosters.map((roster) => {
    const user = roster.owner_id ? userMap.get(roster.owner_id) : undefined;
    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id ?? null,
      username: user?.username ?? null,
      displayName: user?.display_name ?? null,
      teamName: user?.metadata?.team_name ?? null,
      avatar: user?.avatar ?? null,
    };
  });

  const playoffWeekStart =
    league.settings?.playoff_week_start ?? regularSeasonWeeks(season) + 1;
  // Regular season plus the playoff rounds, so the bracket has scores.
  const lastWeek = Math.max(regularSeasonWeeks(season), playoffWeekStart + 3);

  const weekResults = await Promise.all(
    Array.from({ length: lastWeek }, (_, i) =>
      getMatchups(leagueId, i + 1)
        .then((matchups) => ({ week: i + 1, matchups }))
        .catch(() => ({ week: i + 1, matchups: [] }))
    )
  );

  const weeks = weekResults.map(({ week, matchups }) => ({
    week,
    played: matchups.length > 0 && matchups.some((m) => m.points > 0),
    matchups: matchups.map((m): ArchiveMatchup => {
      const base: ArchiveMatchup = {
        rosterId: m.roster_id,
        matchupId: m.matchup_id ?? null,
        points: m.points,
      };
      if (scope === "deep") {
        base.starters = m.starters ?? [];
        base.startersPoints = m.starters_points ?? [];
        base.players = m.players ?? [];
        base.playersPoints = m.players_points ?? {};
      }
      return base;
    }),
  }));

  // Transactions are indexed by week and run past the regular season.
  const transactionWeeks = await Promise.all(
    Array.from({ length: 18 }, (_, i) =>
      getTransactions(leagueId, i + 1)
        .then((t) => normalizeTransactions(season, i + 1, t))
        .catch((): ArchiveTransaction[] => [])
    )
  );

  const draft = drafts[0] ?? null;
  const draftPicks = draft ? await getDraftPicks(draft.draft_id).catch(() => []) : [];

  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    scope,
    season,
    leagueId,
    leagueName: league.name,
    regularSeasonWeeks: regularSeasonWeeks(season),
    playoffWeekStart,
    totalRosters: league.total_rosters,
    playoffTeams: league.settings?.playoff_teams ?? null,
    rosters: archiveRosters,
    weeks,
    winnersBracket,
    losersBracket,
    transactions: transactionWeeks.flat(),
    draft: draft
      ? {
          draftId: draft.draft_id,
          slotToRosterId: draft.slot_to_roster_id ?? {},
          picks: draftPicks,
        }
      : null,
    fetchedAt: new Date().toISOString(),
    tradedPicks,
  };
}
