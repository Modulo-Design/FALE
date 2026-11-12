import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYOFF_FORMAT } from "./config";
import {
  detectTanking,
  estimateDistributions,
  monteCarlo,
  mulberry32,
  pace,
  type ProjectionInput,
} from "./projections";

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

/** `makeInput`, with the given rosters scoring in the single digits. */
function withTankers(played: number, tankers: number[]): ProjectionInput {
  const input = makeInput(played);
  return {
    ...input,
    teams: input.teams.map((t) =>
      tankers.includes(t.rosterId)
        ? { ...t, weeklyScores: t.weeklyScores.map((_, w) => (w % 3) * 4), currentPoints: 4 * played }
        : t
    ),
  };
}

test("tanking is read off the last few weeks, not one bad week", () => {
  const input = withTankers(8, [3, 11]);
  assert.deepEqual([...detectTanking(input.teams)].sort((a, b) => a - b), [3, 11]);

  // A real team's single dud is not a tank.
  const dud = makeInput(8);
  dud.teams[0].weeklyScores[7] = 5;
  assert.equal(detectTanking(dud.teams).size, 0);

  // One week of data is not enough to call anyone.
  assert.equal(detectTanking(withTankers(1, [3]).teams).size, 0);
});

test("tanking teams stay out of the league prior", () => {
  const input = withTankers(8, [3, 11, 14]);
  const tanking = estimateDistributions(input.teams);
  const ignored = estimateDistributions(input.teams, new Set());
  const real = (d: typeof tanking) => d.filter((x) => ![3, 11, 14].includes(x.rosterId));
  for (const [a, b] of real(tanking).map((d, i) => [d, real(ignored)[i]] as const)) {
    assert.ok(a.sd < b.sd, "tankers must not inflate a real team's spread");
    assert.ok(a.mean > b.mean, "tankers must not drag a real team's mean down");
  }
});

test("a real team facing a tanking one always takes the 2 VP", () => {
  // Roster 3 tanks; in a schedule where it always draws roster 4, roster 4
  // banks 2 VP every head-to-head week, while the finale awards none.
  const input = withTankers(8, [3]);
  const schedule = input.remainingSchedule.map(({ week }) => ({
    week,
    pairs: [[3, 4], [1, 2], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14]] as [number, number][],
  }));
  const result = monteCarlo.run({ ...input, remainingSchedule: schedule, sims: 200 });
  const opponent = result.teams.find((t) => t.rosterId === 4)!;
  const tanker = result.teams.find((t) => t.rosterId === 3)!;
  const h2hWeeks = schedule.filter((w) => w.week < input.regularSeasonWeeks).length;
  assert.ok(opponent.p10VP >= opponent.currentVP + 2 * h2hWeeks, "every head-to-head week is a win");
  assert.equal(tanker.meanFinalVP, tanker.currentVP, "a tanking team banks nothing");
  assert.equal(tanker.tanking, true);
  assert.equal(opponent.tanking, false);
});

// ---------------------------------------------------------------------------
// The playoff machine: picks
// ---------------------------------------------------------------------------

/** Every game and every top-half place of every remaining week, decided. */
function fullPicks(input: ProjectionInput, winnerOf: (pair: [number, number]) => number, topHalf: number[]) {
  return input.remainingSchedule.map(({ week, pairs }) => ({
    week,
    winners: pairs.map(winnerOf),
    topHalf,
  }));
}

test("no picks, or empty picks, is the plain projection to the last digit", () => {
  const input = makeInput(9);
  const plain = monteCarlo.run(input);
  assert.deepEqual(monteCarlo.run({ ...input, picks: [] }), plain);
  assert.deepEqual(
    monteCarlo.run({
      ...input,
      picks: input.remainingSchedule.map(({ week }) => ({ week, winners: [], topHalf: [] })),
    }),
    plain
  );
});

test("a fully picked season leaves no doubt about anyone's VP", () => {
  const input = makeInput(10);
  // The worse team of every pair wins, and the bottom seven take the top half:
  // the opposite of what the scores say, so nothing here can come from a draw.
  const bottomSeven = [8, 9, 10, 11, 12, 13, 14];
  const picks = fullPicks(input, ([, b]) => b, bottomSeven);
  const result = monteCarlo.run({ ...input, picks });

  for (const team of result.teams) {
    const start = input.teams.find((t) => t.rosterId === team.rosterId)!.currentVP;
    const wins = team.rosterId % 2 === 0;
    const top = bottomSeven.includes(team.rosterId);
    // Weeks 11-13 are ordinary (2 for the win, 1 for top half); 14 is the
    // finale (no head-to-head, 3 for top half).
    const expected = start + 3 * ((wins ? 2 : 0) + (top ? 1 : 0)) + (top ? 3 : 0);
    assert.equal(team.p10VP, expected, `${team.governorName} floor`);
    assert.equal(team.p90VP, expected, `${team.governorName} ceiling`);
    assert.equal(team.meanFinalVP, expected, `${team.governorName} mean`);
  }
});

test("a pick only moves the game it names", () => {
  const input = makeInput(13, { regularSeasonWeeks: 15 });
  // One ordinary week left to pick in, then the finale.
  const week = input.remainingSchedule[0].week;
  const picked = monteCarlo.run({ ...input, picks: [{ week, winners: [14], topHalf: [] }] });
  const plain = monteCarlo.run(input);
  const meanVP = (run: typeof plain, id: number) =>
    run.teams.find((t) => t.rosterId === id)!.meanFinalVP;

  // Roster 14 is the worst team in the league and was handed a win.
  assert.ok(meanVP(picked, 14) > meanVP(plain, 14) + 1);
  assert.ok(meanVP(picked, 13) < meanVP(plain, 13));
});

test("picked top-half teams take their places and the rest are still played for", () => {
  const input = makeInput(13);
  const week = input.remainingSchedule[0].week;
  // The finale: 3 VP to each of seven teams, two of them named.
  const result = monteCarlo.run({ ...input, picks: [{ week, winners: [], topHalf: [13, 14] }] });

  const gained = (id: number) => {
    const team = result.teams.find((t) => t.rosterId === id)!;
    return { low: team.p10VP - team.currentVP, mean: team.meanFinalVP - team.currentVP };
  };
  assert.equal(gained(13).low, 3);
  assert.equal(gained(14).low, 3);
  const total = result.teams.reduce((sum, t) => sum + (t.meanFinalVP - t.currentVP), 0);
  assert.ok(Math.abs(total - 21) < 0.5, "seven places, no more and no fewer");
});

test("picks that cannot be honoured are dropped, not half-applied", () => {
  const input = makeInput(12);
  const week = input.remainingSchedule[0].week;
  const plain = monteCarlo.run(input);

  // An unknown roster, a week that is not on the schedule.
  assert.deepEqual(
    monteCarlo.run({
      ...input,
      picks: [
        { week, winners: [99], topHalf: [99] },
        { week: 3, winners: [1], topHalf: [1] },
      ],
    }),
    plain
  );

  // Both sides of one game: the first named stands.
  const both = monteCarlo.run({ ...input, picks: [{ week, winners: [2, 1], topHalf: [] }] });
  const one = monteCarlo.run({ ...input, picks: [{ week, winners: [2], topHalf: [] }] });
  assert.deepEqual(both, one);

  // Nine teams named for seven places: only seven are paid.
  const nine = monteCarlo.run({
    ...input,
    picks: [{ week, winners: [], topHalf: [6, 7, 8, 9, 10, 11, 12, 13, 14] }],
  });
  const seven = monteCarlo.run({
    ...input,
    picks: [{ week, winners: [], topHalf: [6, 7, 8, 9, 10, 11, 12] }],
  });
  assert.deepEqual(nine, seven);
});

test("a pick beats the tanking rule", () => {
  const input = makeInput(9);
  // Roster 14 scores in the single digits, so its opponent is normally handed the win.
  const teams = input.teams.map((t) =>
    t.rosterId === 14 ? { ...t, weeklyScores: t.weeklyScores.map(() => 5) } : t
  );
  const tanked = { ...input, teams };
  assert.ok(detectTanking(teams).has(14));

  const picks = tanked.remainingSchedule
    .filter(({ week }) => week < 14)
    .map(({ week }) => ({ week, winners: [14], topHalf: [] }));
  const result = monteCarlo.run({ ...tanked, picks });
  const team = result.teams.find((t) => t.rosterId === 14)!;
  assert.ok(team.p10VP >= team.currentVP + 2 * picks.length);
});

test("picked results pull the points with them", () => {
  const input = makeInput(9, { sims: 2000 });
  // Roster 8 sits mid-table; pick it to win out and finish top half every week.
  const picks = input.remainingSchedule.map(({ week }) => ({ week, winners: [8], topHalf: [8] }));
  const plain = monteCarlo.run(input).teams.find((t) => t.rosterId === 8)!;
  const picked = monteCarlo.run({ ...input, picks }).teams.find((t) => t.rosterId === 8)!;
  assert.ok(picked.playoffOdds > plain.playoffOdds);
  assert.ok(picked.meanFinalVP > plain.meanFinalVP);
});
