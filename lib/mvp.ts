import type { ArchiveMatchup, SeasonArchive } from "./archive";
import { resolveArchiveRosters } from "./archive-data";
import { VP_OVERRIDES } from "./config";
import { gamesFromArchive, isBracket, type PlayerMap } from "./history";
import type { SleeperMatchup } from "./sleeper";
import type { MVPEntry, SeasonMVP } from "./types";
import { applyVPOverrides, calculateWeekVPs } from "./vp";

/** Which positions may fill each Sleeper lineup slot. */
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB", "FB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "FB", "WR", "TE"],
  WRRB_FLEX: ["RB", "FB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "FB", "WR", "TE"],
};

/** Slots Sleeper lists in `roster_positions` that are not part of the lineup. */
const NON_STARTING = new Set(["BN", "IR", "TAXI"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The lineup slots in starter order, or null when the archive predates them. */
export function starterSlots(rosterPositions: string[] | undefined): string[] | null {
  if (!rosterPositions?.length) return null;
  return rosterPositions.filter((slot) => !NON_STARTING.has(slot));
}

/**
 * The positions that could have taken a starter's place. Without the slot list
 * the best that can be said is "his own position" -- which undersells a FLEX.
 */
export function eligiblePositions(slot: string | undefined, starterPosition: string | null): string[] {
  if (slot && SLOT_ELIGIBILITY[slot]) return SLOT_ELIGIBILITY[slot];
  return starterPosition ? [starterPosition] : [];
}

/**
 * The best bench player the governor could have started in this slot instead.
 *
 * Nobody eligible means the slot would have sat empty, so the replacement is
 * worth nothing -- which is exactly what makes a thin bench raise a starter's
 * value, and a stud behind a stud lower it.
 */
export function benchReplacement(
  matchup: Pick<ArchiveMatchup, "starters" | "players" | "playersPoints">,
  eligible: string[],
  players: PlayerMap
): { playerId: string | null; points: number } {
  const starters = new Set(matchup.starters ?? []);
  let best: { playerId: string | null; points: number } = { playerId: null, points: 0 };
  for (const id of matchup.players ?? []) {
    if (id === "0" || starters.has(id)) continue;
    const position = players[id]?.p;
    if (!position || !eligible.includes(position)) continue;
    const points = matchup.playersPoints?.[id] ?? 0;
    if (best.playerId == null || points > best.points) best = { playerId: id, points };
  }
  return best;
}

/**
 * Every roster's VP for one week, with `override` standing in for one roster's
 * score. Commissioner rulings still apply, exactly as the standings apply them.
 */
export function weekVP(
  archive: SeasonArchive,
  week: number,
  matchups: ArchiveMatchup[],
  governorToRoster: Map<string, number>,
  override?: { rosterId: number; points: number }
): Map<number, number> {
  const sleeper: SleeperMatchup[] = matchups.map((m) => ({
    roster_id: m.rosterId,
    matchup_id: m.matchupId,
    points: override && m.rosterId === override.rosterId ? override.points : m.points,
    starters: [],
    starters_points: [],
    players: [],
    players_points: {},
  }));
  const raw = calculateWeekVPs(sleeper, archive.rosters.length, week, archive.season);
  const adjustments = VP_OVERRIDES.filter((o) => o.season === archive.season && o.week === week)
    .map((o) => ({
      rosterId: governorToRoster.get(o.governorName) ?? -1,
      setResult: o.setResult,
      vpDelta: o.vpDelta,
    }))
    .filter((a) => a.rosterId !== -1);
  return new Map(applyVPOverrides(raw, adjustments).map((r) => [r.rosterId, r.vp]));
}

/** A season with nothing played yet has nothing missing, so it counts as having a bench. */
export function hasBenchData(archive: SeasonArchive): boolean {
  const played = archive.weeks.filter((w) => w.played);
  return (
    played.length === 0 ||
    played.some((w) => w.matchups.some((m) => Object.keys(m.playersPoints ?? {}).length > 0))
  );
}

interface Tally {
  playerId: string;
  starts: number;
  points: number;
  pointsOverBench: number;
  vpAdded: number;
  governors: Map<string, number>;
  playoffStarts: number;
  playoffPointsOverBench: number;
  playoffWinsSwung: number;
}

/**
 * The season's most valuable players: who cost his governor the most VP to
 * lose, with the bench he actually had standing in for him.
 *
 * Each week, each starter is swapped for the best bench player who could have
 * filled his slot, and the week is re-scored under the real VP rules -- the
 * head-to-head, the shared top-half cut, the finale's 3 VP, every override.
 * What his governor would have lost is his VP added. Points over the bench
 * break ties, since most weeks no single swap moves a VP at all.
 *
 * Bracket games are tallied alongside, but do not count toward the rank.
 */
export function seasonMVP(archive: SeasonArchive, players: PlayerMap, limit = 10): SeasonMVP {
  if (!hasBenchData(archive)) return { season: archive.season, hasBench: false, entries: [] };

  const rosters = resolveArchiveRosters(archive.season, archive.rosters);
  const names = new Map(rosters.map((r) => [r.rosterId, r.governorName]));
  const governorToRoster = new Map(rosters.map((r) => [r.governorName, r.rosterId]));
  const slots = starterSlots(archive.rosterPositions);

  const tallies = new Map<string, Tally>();
  const tally = (id: string): Tally => {
    let t = tallies.get(id);
    if (!t) {
      t = {
        playerId: id,
        starts: 0,
        points: 0,
        pointsOverBench: 0,
        vpAdded: 0,
        governors: new Map(),
        playoffStarts: 0,
        playoffPointsOverBench: 0,
        playoffWinsSwung: 0,
      };
      tallies.set(id, t);
    }
    return t;
  };

  /** Each starter of one lineup, with what the bench would have scored in his place. */
  const swaps = (m: Pick<ArchiveMatchup, "starters" | "startersPoints" | "players" | "playersPoints">) =>
    (m.starters ?? []).flatMap((id, i) => {
      if (!id || id === "0") return [];
      const points = m.startersPoints?.[i] ?? 0;
      const eligible = eligiblePositions(slots?.[i], players[id]?.p ?? null);
      return [{ id, points, bench: benchReplacement(m, eligible, players).points }];
    });

  for (const week of archive.weeks) {
    if (!week.played || week.week > archive.regularSeasonWeeks) continue;
    const real = weekVP(archive, week.week, week.matchups, governorToRoster);
    for (const m of week.matchups) {
      const governor = names.get(m.rosterId) ?? `Roster ${m.rosterId}`;
      for (const swap of swaps(m)) {
        const counterfactual = weekVP(archive, week.week, week.matchups, governorToRoster, {
          rosterId: m.rosterId,
          points: round2(m.points - swap.points + swap.bench),
        });
        const t = tally(swap.id);
        t.starts += 1;
        t.points += swap.points;
        t.pointsOverBench += swap.points - swap.bench;
        t.vpAdded += (real.get(m.rosterId) ?? 0) - (counterfactual.get(m.rosterId) ?? 0);
        t.governors.set(governor, (t.governors.get(governor) ?? 0) + 1);
      }
    }
  }

  for (const game of gamesFromArchive(archive)) {
    if (!isBracket(game) || game.opponentPoints == null) continue;
    for (const swap of swaps(game)) {
      const t = tally(swap.id);
      t.playoffStarts += 1;
      t.playoffPointsOverBench += swap.points - swap.bench;
      // A tie is not a win either, so it counts as swung.
      const counterfactual = round2(game.points - swap.points + swap.bench);
      if (game.won && counterfactual <= game.opponentPoints) t.playoffWinsSwung += 1;
    }
  }

  const ranked = [...tallies.values()]
    .filter((t) => t.starts > 0)
    .sort(
      (a, b) =>
        b.vpAdded - a.vpAdded ||
        b.pointsOverBench - a.pointsOverBench ||
        b.points - a.points ||
        a.playerId.localeCompare(b.playerId)
    )
    .slice(0, limit);

  const entries: MVPEntry[] = ranked.map((t, i) => {
    const governors = [...t.governors].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    return {
      rank: i + 1,
      playerId: t.playerId,
      playerName: players[t.playerId]?.n ?? `Player ${t.playerId}`,
      position: players[t.playerId]?.p ?? null,
      governorName: governors[0],
      governors,
      starts: t.starts,
      points: round2(t.points),
      pointsOverBench: round2(t.pointsOverBench),
      vpAdded: t.vpAdded,
      playoffStarts: t.playoffStarts,
      playoffPointsOverBench: round2(t.playoffPointsOverBench),
      playoffWinsSwung: t.playoffWinsSwung,
    };
  });

  return { season: archive.season, hasBench: true, entries };
}
