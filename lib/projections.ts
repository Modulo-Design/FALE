import type { PlayoffFormat } from "./config";
import { firstRoundPairings, reseedPairings, seedPlayoffField, type PlayoffSeed } from "./seeding";
import type {
  PlayoffBracket,
  PlayoffMatchupResult,
  ProjectedTeam,
  ProjectionOutput,
  TeamStanding,
} from "./types";

/**
 * Playoff projections.
 *
 * Everything here is pure and seeded: no clock, no network, no Math.random, so
 * the same input always produces byte-identical output and the tests can assert
 * exact numbers.
 */

export interface ProjectionTeamInput {
  rosterId: number;
  governorName: string;
  currentVP: number;
  currentPoints: number;
  /** Scores from completed weeks, used to estimate this team's distribution. */
  weeklyScores: number[];
}

export interface ProjectionInput {
  season: string;
  regularSeasonWeeks: number;
  weeksCompleted: number;
  playoffWeekStart: number;
  teams: ProjectionTeamInput[];
  /** Remaining regular-season weeks and who plays whom. */
  remainingSchedule: { week: number; pairs: [number, number][] }[];
  playoffFormat: PlayoffFormat;
  sims?: number;
  seed?: number;
  /** Scales every team's spread. `pace` uses 0 to make the run deterministic. */
  varianceScale?: number;
}

export interface ProjectionStrategy {
  run(input: ProjectionInput): ProjectionOutput;
}

export const DEFAULT_SIMS = 10_000;
const DEFAULT_SEED = 0x5eed;
/**
 * Weight of the league-wide prior, in weeks. With four weeks of prior, a team
 * two games into the season is judged mostly on the league and only a third on
 * itself -- which is the honest reading of a two-game sample.
 */
const PRIOR_WEEKS = 4;
/** A team can never be treated as more predictable than this. */
const MIN_SD_RATIO = 0.6;

/** Deterministic PRNG. Same seed, same sequence, on every platform. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: one standard normal per call, from two uniforms. */
function standardNormal(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export interface TeamDistribution {
  rosterId: number;
  mean: number;
  sd: number;
}

/**
 * Per-team scoring distribution, shrunk toward the league.
 *
 * Abandoned rosters are deliberately not filtered out: a dead team really does
 * score near zero for the rest of the year, and the archive shows that happens
 * roughly once a season.
 */
export function estimateDistributions(teams: ProjectionTeamInput[]): TeamDistribution[] {
  const allScores = teams.flatMap((t) => t.weeklyScores);
  const leagueMean = mean(allScores);
  const leagueSd = stdDev(allScores, leagueMean) || 1;

  return teams.map((team) => {
    const n = team.weeklyScores.length;
    const teamMean = n ? mean(team.weeklyScores) : leagueMean;
    const teamSd = stdDev(team.weeklyScores, teamMean);

    const shrunkMean = (n * teamMean + PRIOR_WEEKS * leagueMean) / (n + PRIOR_WEEKS);
    const shrunkVar =
      (n * teamSd ** 2 + PRIOR_WEEKS * leagueSd ** 2) / (n + PRIOR_WEEKS);

    return {
      rosterId: team.rosterId,
      mean: shrunkMean,
      sd: Math.max(Math.sqrt(shrunkVar), MIN_SD_RATIO * leagueSd),
    };
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/** Teams that qualify in one simulated season, using the real seeding rules. */
function seedFromTotals(
  teams: ProjectionTeamInput[],
  vp: Map<number, number>,
  points: Map<number, number>,
  format: PlayoffFormat
): PlayoffSeed[] {
  const standings = teams.map(
    (t): TeamStanding => ({
      rosterId: t.rosterId,
      governorName: t.governorName,
      displayName: t.governorName,
      avatar: null,
      totalVP: vp.get(t.rosterId) ?? 0,
      totalPoints: points.get(t.rosterId) ?? 0,
      totalPointsAgainst: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      weeklyResults: [],
    })
  );
  return seedPlayoffField(standings, format);
}

export const monteCarlo: ProjectionStrategy = {
  run(input) {
    const sims = input.sims ?? DEFAULT_SIMS;
    const rand = mulberry32(input.seed ?? DEFAULT_SEED);
    const varianceScale = input.varianceScale ?? 1;
    const distributions = new Map(
      estimateDistributions(input.teams).map((d) => [d.rosterId, { ...d, sd: d.sd * varianceScale }])
    );
    const topHalfSize = Math.ceil(input.teams.length / 2);

    const finalVPs = new Map<number, number[]>(input.teams.map((t) => [t.rosterId, []]));
    const seedCounts = new Map<number, number[]>(
      input.teams.map((t) => [t.rosterId, Array(input.playoffFormat.teams).fill(0)])
    );
    const playoffCounts = new Map<number, number>(input.teams.map((t) => [t.rosterId, 0]));
    const byeCounts = new Map<number, number>(input.teams.map((t) => [t.rosterId, 0]));

    const scratch: { rosterId: number; score: number }[] = input.teams.map((t) => ({
      rosterId: t.rosterId,
      score: 0,
    }));

    for (let sim = 0; sim < sims; sim++) {
      const vp = new Map(input.teams.map((t) => [t.rosterId, t.currentVP]));
      const points = new Map(input.teams.map((t) => [t.rosterId, t.currentPoints]));

      for (const { week, pairs } of input.remainingSchedule) {
        const finale = week === input.regularSeasonWeeks && Number(input.season) >= 2021;

        for (const slot of scratch) {
          const dist = distributions.get(slot.rosterId)!;
          slot.score = Math.max(0, dist.mean + dist.sd * standardNormal(rand));
          points.set(slot.rosterId, (points.get(slot.rosterId) ?? 0) + slot.score);
        }
        const scoreOf = new Map(scratch.map((s) => [s.rosterId, s.score]));

        // Top-half scoring VP is a league-wide comparison, which is precisely
        // what a per-team pace projection cannot model.
        const ranked = [...scratch].sort((a, b) => b.score - a.score || a.rosterId - b.rosterId);
        const scoringVP = finale ? 3 : 1;
        for (let i = 0; i < topHalfSize; i++) {
          const id = ranked[i].rosterId;
          vp.set(id, (vp.get(id) ?? 0) + scoringVP);
        }

        // The finale awards no head-to-head VP at all.
        if (!finale) {
          for (const [a, b] of pairs) {
            const scoreA = scoreOf.get(a) ?? 0;
            const scoreB = scoreOf.get(b) ?? 0;
            if (scoreA === scoreB) {
              vp.set(a, (vp.get(a) ?? 0) + 1);
              vp.set(b, (vp.get(b) ?? 0) + 1);
            } else {
              const winner = scoreA > scoreB ? a : b;
              vp.set(winner, (vp.get(winner) ?? 0) + 2);
            }
          }
        }
      }

      for (const team of input.teams) {
        finalVPs.get(team.rosterId)!.push(vp.get(team.rosterId) ?? 0);
      }

      const seeds = seedFromTotals(input.teams, vp, points, input.playoffFormat);
      for (const seed of seeds) {
        playoffCounts.set(seed.rosterId, (playoffCounts.get(seed.rosterId) ?? 0) + 1);
        seedCounts.get(seed.rosterId)![seed.seed - 1] += 1;
        if (seed.hasBye) byeCounts.set(seed.rosterId, (byeCounts.get(seed.rosterId) ?? 0) + 1);
      }
    }

    const projected: ProjectedTeam[] = input.teams.map((team) => {
      const samples = finalVPs.get(team.rosterId)!;
      const sorted = [...samples].sort((a, b) => a - b);
      return {
        rosterId: team.rosterId,
        governorName: team.governorName,
        currentVP: team.currentVP,
        meanFinalVP: Math.round(mean(samples) * 10) / 10,
        p10VP: percentile(sorted, 0.1),
        p90VP: percentile(sorted, 0.9),
        seedProbs: seedCounts.get(team.rosterId)!.map((c) => c / sims),
        playoffOdds: (playoffCounts.get(team.rosterId) ?? 0) / sims,
        byeOdds: (byeCounts.get(team.rosterId) ?? 0) / sims,
      };
    });

    projected.sort((a, b) => b.playoffOdds - a.playoffOdds || b.meanFinalVP - a.meanFinalVP);

    return {
      strategy: "monte-carlo",
      sims,
      weeksRemaining: input.remainingSchedule.length,
      teams: projected,
      projectedBracket: projectedBracket(input, projected),
    };
  },
};

/**
 * The chalk bracket: every team's expected final VP, seeded by the real rules,
 * with the better seed advancing each round.
 */
export function projectedBracket(
  input: ProjectionInput,
  projected: ProjectedTeam[]
): PlayoffBracket {
  const vp = new Map(projected.map((t) => [t.rosterId, t.meanFinalVP]));
  const byRoster = new Map(input.teams.map((t) => [t.rosterId, t]));
  // Points are already on a per-team pace; projecting them forward keeps the
  // wildcard tiebreak meaningful rather than freezing it at today's totals.
  const perWeek = new Map(
    estimateDistributions(input.teams).map((d) => [d.rosterId, d.mean])
  );
  const points = new Map(
    input.teams.map((t) => [
      t.rosterId,
      t.currentPoints + (perWeek.get(t.rosterId) ?? 0) * input.remainingSchedule.length,
    ])
  );

  const seeds = seedFromTotals(input.teams, vp, points, input.playoffFormat);
  if (seeds.length === 0) {
    return {
      season: input.season,
      playoffWeekStart: input.playoffWeekStart,
      rounds: [],
      playoffTeams: input.playoffFormat.teams,
      byeCount: input.playoffFormat.byes,
      complete: false,
      projected: true,
    };
  }

  const teamResult = (seed: PlayoffSeed, won: boolean) => ({
    rosterId: seed.rosterId,
    governorName: byRoster.get(seed.rosterId)?.governorName ?? seed.governorName,
    points: 0,
    won,
  });

  // Round 1: byes are single-team slots, which is what keeps the round a power
  // of two so the renderer's connector maths line up.
  const byes = seeds.filter((s) => s.hasBye);
  const round1: { matchup: PlayoffMatchupResult; winner: PlayoffSeed }[] = [
    ...byes.map((seed) => ({
      matchup: {
        round: 1,
        week: input.playoffWeekStart,
        isBye: true,
        projected: true,
        teams: [teamResult(seed, true)],
      } satisfies PlayoffMatchupResult,
      winner: seed,
    })),
    ...firstRoundPairings(seeds, input.playoffFormat.byes).map(({ high, low }) => ({
      matchup: {
        round: 1,
        week: input.playoffWeekStart,
        projected: true,
        teams: [teamResult(high, true), teamResult(low, false)],
      } satisfies PlayoffMatchupResult,
      winner: high,
    })),
  ];

  const roundsBySeq: { matchup: PlayoffMatchupResult; winner: PlayoffSeed }[][] = [round1];
  let survivors = round1.map((r) => r.winner);
  let round = 2;

  while (survivors.length > 1) {
    const entries = reseedPairings(survivors).map(({ high, low }) => ({
      matchup: {
        round,
        week: input.playoffWeekStart + round - 1,
        projected: true,
        placement: survivors.length === 2 ? 1 : undefined,
        teams: [teamResult(high, true), teamResult(low, false)],
      } satisfies PlayoffMatchupResult,
      winner: high,
    }));
    roundsBySeq.push(entries);
    survivors = entries.map((e) => e.winner);
    round++;
  }

  // Order each round backward from the final so round r+1's match i follows
  // round r's matches 2i and 2i+1 -- the invariant the bracket connectors rely on.
  for (let r = roundsBySeq.length - 1; r > 0; r--) {
    const next = roundsBySeq[r];
    const prev = roundsBySeq[r - 1];
    const byWinner = new Map(prev.map((entry) => [entry.winner.rosterId, entry]));
    const ordered: typeof prev = [];
    const used = new Set<(typeof prev)[number]>();
    for (const entry of next) {
      for (const team of entry.matchup.teams) {
        const feeder = byWinner.get(team.rosterId);
        if (feeder && !used.has(feeder)) {
          ordered.push(feeder);
          used.add(feeder);
        }
      }
    }
    for (const entry of prev) if (!used.has(entry)) ordered.push(entry);
    roundsBySeq[r - 1] = ordered;
  }

  return {
    season: input.season,
    playoffWeekStart: input.playoffWeekStart,
    rounds: roundsBySeq.flatMap((entries) => entries.map((e) => e.matchup)),
    playoffTeams: seeds.length,
    byeCount: byes.length,
    complete: false,
    projected: true,
  };
}

/**
 * Deterministic alternative: every team scores exactly its projected mean every
 * week. Kept behind the same interface so the strategy is swappable in one line,
 * and useful as a test oracle -- with no variance the simulation must agree with
 * it exactly.
 */
export const pace: ProjectionStrategy = {
  run(input) {
    const result = monteCarlo.run({ ...input, sims: 1, varianceScale: 0 });
    return { ...result, strategy: "pace" };
  },
};
