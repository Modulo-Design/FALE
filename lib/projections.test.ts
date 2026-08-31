import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYOFF_FORMAT } from "./config";
import { estimateDistributions, monteCarlo, mulberry32, pace, type ProjectionInput } from "./projections";

const GOVERNORS = [
  "Ben", "Brent", "Chris", "DanK", "DanP", "Eli", "Jeremy",
  "Johnathan", "Josh", "Knute", "Mark", "Matt", "Peter", "Sam",
];

/** A 14-team season with `played` weeks done and the rest to simulate. */
function makeInput(played: number, overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  const teams = GOVERNORS.map((governorName, i) => ({
    rosterId: i + 1,
    governorName,
    // A clean talent gradient: roster 1 is the best team, roster 14 the worst.
    currentVP: (14 - i) * 2,
    currentPoints: (140 - i * 4) * played,
    weeklyScores: Array.from({ length: played }, (_, w) => 140 - i * 4 + (w % 3) - 1),
  }));

  const remainingSchedule = Array.from({ length: 14 - played }, (_, i) => {
    const week = played + i + 1;
    const pairs: [number, number][] = [];
    for (let r = 1; r <= 14; r += 2) pairs.push([r, r + 1]);
    return { week, pairs };
  });

  return {
    season: "2026",
    regularSeasonWeeks: 14,
    weeksCompleted: played,
    playoffWeekStart: 15,
    teams,
    remainingSchedule,
    playoffFormat: PLAYOFF_FORMAT["2026"],
    sims: 500,
    ...overrides,
  };
}

test("mulberry32 is deterministic and stays in range", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const value = a();
    assert.equal(value, b(), "same seed, same sequence");
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)(), "different seeds diverge");
});

test("the same seed produces byte-identical projections", () => {
  const input = makeInput(6);
  const first = monteCarlo.run({ ...input, seed: 7 });
  const second = monteCarlo.run({ ...input, seed: 7 });
  assert.deepEqual(first, second);
});

test("a different seed produces different projections", () => {
  const input = makeInput(6);
  const a = monteCarlo.run({ ...input, seed: 1 });
  const b = monteCarlo.run({ ...input, seed: 2 });
  assert.notDeepEqual(a.teams.map((t) => t.playoffOdds), b.teams.map((t) => t.playoffOdds));
});

test("estimates shrink toward the league when the sample is small", () => {
  const oneWeek = estimateDistributions(makeInput(1).teams);
  const manyWeeks = estimateDistributions(makeInput(12).teams);

  const leagueMean = oneWeek.reduce((s, d) => s + d.mean, 0) / oneWeek.length;
  const spreadAfterOne = Math.abs(oneWeek[0].mean - leagueMean);
  const spreadAfterTwelve = Math.abs(manyWeeks[0].mean - leagueMean);

  assert.ok(
    spreadAfterOne < spreadAfterTwelve,
    "one week of data must not be read as full talent"
  );
});

test("every team's seed probabilities and odds are coherent", () => {
  const result = monteCarlo.run(makeInput(7));
  const format = PLAYOFF_FORMAT["2026"];

  for (const team of result.teams) {
    assert.equal(team.seedProbs.length, format.teams);
    assert.ok(team.playoffOdds >= 0 && team.playoffOdds <= 1);
    assert.ok(team.byeOdds <= team.playoffOdds, "a bye requires making the playoffs");
    const summed = team.seedProbs.reduce((s, p) => s + p, 0);
    assert.ok(Math.abs(summed - team.playoffOdds) < 1e-9, "seed probabilities sum to playoff odds");
    assert.ok(team.p10VP <= team.meanFinalVP + 1e-9);
    assert.ok(team.p90VP >= team.meanFinalVP - 1e-9);
  }

  // Exactly one field's worth of teams qualifies in every simulated season.
  const expectedField = result.teams.reduce((s, t) => s + t.playoffOdds, 0);
  assert.ok(Math.abs(expectedField - format.teams) < 1e-9);
});

test("a completed season leaves nothing to simulate", () => {
  const result = monteCarlo.run(makeInput(14));
  assert.equal(result.weeksRemaining, 0);
  for (const team of result.teams) {
    assert.equal(team.meanFinalVP, team.currentVP, "no weeks left, no VP to add");
    assert.ok(team.playoffOdds === 0 || team.playoffOdds === 1, "the field is already decided");
  }
});

test("the stronger team is favoured", () => {
  const result = monteCarlo.run(makeInput(8));
  const best = result.teams.find((t) => t.governorName === "Ben")!;
  const worst = result.teams.find((t) => t.governorName === "Sam")!;
  assert.ok(best.playoffOdds > worst.playoffOdds);
  assert.ok(best.meanFinalVP > worst.meanFinalVP);
});

test("with no variance the simulation agrees with the pace projection", () => {
  const input = makeInput(6);
  const deterministic = monteCarlo.run({ ...input, sims: 1, varianceScale: 0 });
  const paced = pace.run(input);
  assert.equal(paced.strategy, "pace");
  assert.deepEqual(
    paced.teams.map((t) => [t.governorName, t.meanFinalVP]),
    deterministic.teams.map((t) => [t.governorName, t.meanFinalVP])
  );
});

test("the projected bracket is shaped so the connectors line up", () => {
  const result = monteCarlo.run(makeInput(9));
  const bracket = result.projectedBracket!;
  assert.ok(bracket.projected);
  assert.equal(bracket.complete, false);

  const round1 = bracket.rounds.filter((m) => m.round === 1);
  // Byes are padded into round 1 as single-team slots so each round is exactly
  // half the size of the one before it; the renderer depends on this.
  assert.equal(round1.length, 4, "7 teams and 1 bye must produce 4 round-one slots");
  assert.equal(Math.log2(round1.length) % 1, 0, "round one must be a power of two");
  assert.equal(round1.filter((m) => m.isBye).length, PLAYOFF_FORMAT["2026"].byes);

  const maxRound = Math.max(...bracket.rounds.map((m) => m.round));
  for (let r = 1; r < maxRound; r++) {
    const here = bracket.rounds.filter((m) => m.round === r).length;
    const next = bracket.rounds.filter((m) => m.round === r + 1).length;
    assert.equal(here, next * 2, `round ${r} must be twice round ${r + 1}`);
  }

  // Every projected match resolves to exactly one winner.
  for (const matchup of bracket.rounds) {
    assert.equal(matchup.teams.filter((t) => t.won).length, 1);
  }
  assert.equal(bracket.rounds.filter((m) => m.placement === 1).length, 1);
});

test("the projected field matches the seeding rules", () => {
  const result = monteCarlo.run(makeInput(9));
  const bracket = result.projectedBracket!;
  const inBracket = new Set(
    bracket.rounds.filter((m) => m.round === 1).flatMap((m) => m.teams.map((t) => t.governorName))
  );
  assert.equal(inBracket.size, PLAYOFF_FORMAT["2026"].teams);
});
