import type { ArchiveTransaction, SeasonArchive } from "./archive";
import { archivedSeasons, loadSeasonArchive, resolveArchiveRosters } from "./archive-data";
import type { PlayerMap } from "./history";

/**
 * Trades and draft-pick lineage.
 *
 * Roster ids are scoped to a single season's Sleeper league, so every
 * cross-season hop -- and pick trading is nothing but cross-season hops --
 * has to go through the governor name.
 */

export interface TradedPlayer {
  playerId: string;
  name: string;
  position: string | null;
  fromGovernor: string | null;
  toGovernor: string;
}

export interface TradedPick {
  pickSeason: string;
  round: number;
  /** Roster id in the *trading* season's league — resolution starts here. */
  originalRosterId: number;
  /** The governor whose original pick this is, resolved across seasons. */
  originalGovernor: string | null;
  fromGovernor: string | null;
  toGovernor: string | null;
}

export interface TradedFaab {
  fromGovernor: string | null;
  toGovernor: string | null;
  amount: number;
}

export interface Trade {
  id: string;
  season: string;
  week: number;
  created: number;
  governors: string[];
  players: TradedPlayer[];
  picks: TradedPick[];
  faab: TradedFaab[];
}

export type PickOutcome =
  | {
      resolved: true;
      playerId: string;
      playerName: string;
      position: string | null;
      pickNo: number;
      round: number;
      draftedBy: string | null;
    }
  | {
      resolved: false;
      reason: "season-not-archived" | "no-draft-data" | "governor-not-in-draft" | "pick-not-found";
    };

/**
 * Which draft slot each roster originally owned.
 *
 * Sleeper leaves `slot_to_roster_id` empty for this league and a pick's
 * `roster_id` is whoever actually made the selection, not whose pick it was.
 * The original owner is recovered by intersecting, across every round, the
 * rosters that could have owned that slot given the traded-pick record. It
 * resolves to a complete one-to-one mapping in all seven seasons.
 */
export function deriveSlotOwners(archive: SeasonArchive): Map<number, number> {
  const picks = archive.draft?.picks ?? [];
  const owners = new Map<number, number>();
  if (picks.length === 0) return owners;

  const traded = archive.tradedPicks.filter((t) => t.season === archive.season);
  const acquired = new Map<string, Set<number>>();
  const tradedAway = new Set<string>();
  for (const t of traded) {
    const key = `${t.round}:${t.owner_id}`;
    const existing = acquired.get(key) ?? new Set<number>();
    existing.add(t.roster_id);
    acquired.set(key, existing);
    if (t.owner_id !== t.roster_id) tradedAway.add(`${t.round}:${t.roster_id}`);
  }

  const bySlot = new Map<number, { round: number; picker: number }[]>();
  for (const pick of picks) {
    const entries = bySlot.get(pick.draft_slot) ?? [];
    entries.push({ round: pick.round, picker: pick.roster_id });
    bySlot.set(pick.draft_slot, entries);
  }

  for (const [slot, entries] of bySlot) {
    let candidates: number[] | null = null;
    for (const { round, picker } of entries) {
      const possible = new Set<number>(Array.from(acquired.get(`${round}:${picker}`) ?? []));
      if (!tradedAway.has(`${round}:${picker}`)) possible.add(picker);
      candidates =
        candidates === null
          ? Array.from(possible)
          : candidates.filter((id) => possible.has(id));
    }
    if (candidates !== null && candidates.length === 1) owners.set(slot, candidates[0]);
  }

  return owners;
}

interface SeasonIndex {
  archive: SeasonArchive;
  governorByRoster: Map<number, string>;
  rosterByGovernor: Map<string, number>;
  slotOwners: Map<number, number>;
}

export type TradeIndex = Map<string, SeasonIndex>;

export async function buildTradeIndex(): Promise<TradeIndex> {
  const index: TradeIndex = new Map();
  for (const season of archivedSeasons()) {
    const archive = await loadSeasonArchive(season);
    if (!archive) continue;
    const resolved = resolveArchiveRosters(season, archive.rosters);
    index.set(season, {
      archive,
      governorByRoster: new Map(resolved.map((r) => [r.rosterId, r.governorName])),
      rosterByGovernor: new Map(resolved.map((r) => [r.governorName, r.rosterId])),
      slotOwners: deriveSlotOwners(archive),
    });
  }
  return index;
}

/** What a traded pick actually became. */
export function resolvePick(
  index: TradeIndex,
  tradeSeason: string,
  pick: { pickSeason: string; round: number; originalRosterId: number }
): PickOutcome {
  // The original roster id is expressed in the trading season's league, so it
  // has to become a governor before it can mean anything in the draft season.
  const tradeIndex = index.get(tradeSeason);
  const governor = tradeIndex?.governorByRoster.get(pick.originalRosterId);

  const draftIndex = index.get(pick.pickSeason);
  if (!draftIndex) return { resolved: false, reason: "season-not-archived" };
  if (!draftIndex.archive.draft || draftIndex.archive.draft.picks.length === 0) {
    return { resolved: false, reason: "no-draft-data" };
  }

  const rosterInDraft = governor ? draftIndex.rosterByGovernor.get(governor) : undefined;
  if (rosterInDraft === undefined) {
    // The governor left the league between the trade and the draft.
    return { resolved: false, reason: "governor-not-in-draft" };
  }

  let slot: number | undefined;
  for (const [candidateSlot, rosterId] of draftIndex.slotOwners) {
    if (rosterId === rosterInDraft) {
      slot = candidateSlot;
      break;
    }
  }
  if (slot === undefined) return { resolved: false, reason: "pick-not-found" };

  const made = draftIndex.archive.draft.picks.find(
    (p) => p.round === pick.round && p.draft_slot === slot
  );
  if (!made) return { resolved: false, reason: "pick-not-found" };

  const meta = made.metadata ?? {};
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(" ");
  return {
    resolved: true,
    playerId: made.player_id,
    playerName: name || made.player_id,
    position: meta.position ?? null,
    pickNo: made.pick_no,
    round: made.round,
    draftedBy: draftIndex.governorByRoster.get(made.roster_id) ?? null,
  };
}

function normalize(
  index: TradeIndex,
  transaction: ArchiveTransaction,
  players: PlayerMap
): Trade {
  const season = index.get(transaction.season);
  const nameOf = (rosterId: number | null): string | null =>
    rosterId == null ? null : (season?.governorByRoster.get(rosterId) ?? null);

  return {
    id: transaction.transactionId,
    season: transaction.season,
    week: transaction.week,
    created: transaction.created,
    governors: transaction.rosterIds
      .map((id) => nameOf(id))
      .filter((n): n is string => n !== null),
    players: transaction.playerMoves.map((move) => ({
      playerId: move.playerId,
      name: players[move.playerId]?.n ?? `Player ${move.playerId}`,
      position: players[move.playerId]?.p ?? null,
      fromGovernor: nameOf(move.fromRosterId),
      toGovernor: nameOf(move.toRosterId) ?? "Unknown",
    })),
    picks: transaction.pickMoves.map((move) => ({
      pickSeason: move.pickSeason,
      round: move.round,
      originalRosterId: move.originalRosterId,
      originalGovernor: nameOf(move.originalRosterId),
      fromGovernor: nameOf(move.fromRosterId),
      toGovernor: nameOf(move.toRosterId),
    })),
    faab: transaction.faabMoves.map((move) => ({
      fromGovernor: nameOf(move.fromRosterId),
      toGovernor: nameOf(move.toRosterId),
      amount: move.amount,
    })),
  };
}

export function buildTradeLog(index: TradeIndex, players: PlayerMap): Trade[] {
  const trades: Trade[] = [];
  for (const { archive } of index.values()) {
    for (const transaction of archive.transactions) {
      trades.push(normalize(index, transaction, players));
    }
  }
  return trades.sort((a, b) => b.created - a.created);
}

/** Every trade a player appeared in, most recent first. */
export function playerTradeHistory(trades: Trade[], playerId: string): Trade[] {
  return trades.filter((t) => t.players.some((p) => p.playerId === playerId));
}

export interface ChainLink {
  trade: Trade;
  /** Picks in this trade, with what each became. */
  picks: { pick: TradedPick; outcome: PickOutcome; next?: ChainLink[] }[];
}

/**
 * Follow a player through the trades he was in, and follow any picks in those
 * trades to the players they became -- then follow those players in turn.
 *
 * `seen` guards against a player being revisited, which a league that trades
 * the same names back and forth will otherwise turn into an infinite walk.
 */
export function tradeChain(
  index: TradeIndex,
  trades: Trade[],
  playerId: string,
  depth = 2,
  seen: Set<string> = new Set()
): ChainLink[] {
  if (depth < 0 || seen.has(playerId)) return [];
  seen.add(playerId);

  return playerTradeHistory(trades, playerId).map((trade) => ({
    trade,
    picks: trade.picks.map((pick) => {
      const outcome = resolvePick(index, trade.season, pick);
      // Follow the pick into the player it became, and that player onward.
      // `seen` is shared across the whole walk, so a player already visited
      // ends the branch rather than looping.
      const next =
        outcome.resolved && depth > 0
          ? tradeChain(index, trades, outcome.playerId, depth - 1, seen)
          : undefined;
      return { pick, outcome, next: next?.length ? next : undefined };
    }),
  }));
}

/** A trade with every pick already resolved, ready to send to the client. */
export interface ResolvedTrade extends Omit<Trade, "picks"> {
  picks: (TradedPick & { outcome: PickOutcome })[];
}

export function resolveTrades(index: TradeIndex, trades: Trade[]): ResolvedTrade[] {
  return trades.map((trade) => ({
    ...trade,
    picks: trade.picks.map((pick) => ({ ...pick, outcome: resolvePick(index, trade.season, pick) })),
  }));
}
