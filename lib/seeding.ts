import type { PlayoffFormat } from "./config";
import type { TeamStanding } from "./types";

/**
 * Playoff qualification and seeding.
 *
 * The field is filled in two stages:
 *
 *  1. All but the last spot go to the top of the VP standings, with total
 *     points scored breaking ties.
 *  2. The final spot is a wildcard: whichever of the remaining teams scored the
 *     most points, regardless of VP.
 *
 * Stage 2 is why the standings order alone does not predict the field. In 2025
 * DanP took the last spot on 21 VP over Knute on 25, because DanP outscored him
 * 1664.0 to 1660.7. The wildcard is always seeded last, not re-sorted into the
 * field by VP -- confirmed against every round-one matchup of 2020 and 2025.
 */
export interface PlayoffSeed {
  seed: number;
  rosterId: number;
  governorName: string;
  totalVP: number;
  totalPoints: number;
  /** How the team qualified: on the VP standings, or as the points wildcard. */
  qualifiedBy: "vp" | "points";
  hasBye: boolean;
}

export function byStandings(a: TeamStanding, b: TeamStanding): number {
  return b.totalVP - a.totalVP || b.totalPoints - a.totalPoints;
}

export function seedPlayoffField(
  teams: TeamStanding[],
  format: PlayoffFormat
): PlayoffSeed[] {
  if (teams.length === 0 || format.teams <= 0) return [];

  const ranked = [...teams].sort(byStandings);
  const autoCount = Math.min(format.teams - 1, ranked.length);
  const automatic = ranked.slice(0, autoCount);
  const remaining = ranked.slice(autoCount);

  const wildcard = remaining.reduce<TeamStanding | undefined>(
    (best, team) => (!best || team.totalPoints > best.totalPoints ? team : best),
    undefined
  );

  const field = wildcard ? [...automatic, wildcard] : automatic;

  return field.map((team, index) => ({
    seed: index + 1,
    rosterId: team.rosterId,
    governorName: team.governorName,
    totalVP: team.totalVP,
    totalPoints: team.totalPoints,
    qualifiedBy: index < autoCount ? "vp" : "points",
    hasBye: index < format.byes,
  }));
}

export interface SeedPairing {
  high: PlayoffSeed;
  low: PlayoffSeed;
}

/**
 * Round one: the bye teams sit out, and everyone else is paired highest against
 * lowest. With 7 teams and 1 bye that is 2v7, 3v6, 4v5; with 6 teams and 2 byes
 * it is 3v6, 4v5.
 */
export function firstRoundPairings(seeds: PlayoffSeed[], byes: number): SeedPairing[] {
  const playing = seeds.slice(byes);
  const pairings: SeedPairing[] = [];
  for (let lo = 0, hi = playing.length - 1; lo < hi; lo++, hi--) {
    pairings.push({ high: playing[lo], low: playing[hi] });
  }
  return pairings;
}

/**
 * Later rounds are re-seeded: the highest surviving seed always draws the
 * lowest, rather than following a fixed bracket line.
 */
export function reseedPairings(survivors: PlayoffSeed[]): SeedPairing[] {
  const ordered = [...survivors].sort((a, b) => a.seed - b.seed);
  const pairings: SeedPairing[] = [];
  for (let lo = 0, hi = ordered.length - 1; lo < hi; lo++, hi--) {
    pairings.push({ high: ordered[lo], low: ordered[hi] });
  }
  return pairings;
}
