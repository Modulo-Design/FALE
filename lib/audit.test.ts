import assert from "node:assert/strict";
import { test } from "node:test";
import groundTruth from "../data/ground-truth.json" with { type: "json" };
import { archivedSeasonStandings } from "./season";
import type { SeasonStandings } from "./types";

/**
 * The league spreadsheet is the book of record, so this reconciles every
 * computed figure against it for all six completed seasons, offline, from the
 * committed archive. It is the regression test for the whole VP engine.
 */

const SEASONS = ["2020", "2021", "2022", "2023", "2024", "2025"] as const;

type Expected = { vp: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number };
const truth = groundTruth.seasons as Record<string, Record<string, Expected>>;

/**
 * Cells where the spreadsheet is known to be wrong and the app is right.
 * Each is explained rather than silently tolerated.
 */
const SHEET_IS_STALE = {
  // The commissioner confirmed the week 6 auto-loss stands. The sheet's VP
  // column reflects it; its win-loss column was never updated.
  record: new Map<string, { wins: number; losses: number }>([
    ["2025:Chris", { wins: 1, losses: 12 }],
    ["2025:DanK", { wins: 5, losses: 8 }],
  ]),
  // The 2024 Points Scored column was never refreshed after the finale week,
  // so it is short by every team's week 14 score. Its VP and W-L are correct.
  pointsFor: new Set(SEASONS.filter((s) => s === "2024").flatMap((s) =>
    Object.keys(truth[s]).map((n) => `${s}:${n}`)
  )),
  // Score corrections behind the 2020 and 2022 rulings: the app flips the
  // result but still carries Sleeper's raw points, so points-for and the
  // opponent's points-against stay off by the corrected amount.
  scoreCorrections: new Set(["2020:DanP:pf", "2020:Chris:pa", "2022:Matt:pf", "2022:Johnathan:pa"]),
};

// The sheet carries one decimal, and Sleeper applies small stat corrections
// after the fact, so points comparisons allow a couple of points of drift.
const POINTS_TOLERANCE = 2.5;

const loaded = new Map<string, SeasonStandings>();
async function standings(season: string): Promise<SeasonStandings> {
  const cached = loaded.get(season);
  if (cached) return cached;
  const result = await archivedSeasonStandings(season);
  assert.ok(result, `no committed archive for ${season}`);
  loaded.set(season, result);
  return result;
}

for (const season of SEASONS) {
  test(`${season}: every governor resolves to a known person`, async () => {
    const { teams } = await standings(season);
    const unmapped = teams.filter((t) => t.governorName.startsWith("Unmapped:"));
    assert.deepEqual(unmapped.map((t) => t.governorName), [], `unmapped rosters in ${season}`);
    assert.equal(teams.length, 14);
  });

  test(`${season}: VP and record match the league spreadsheet`, async () => {
    const { teams } = await standings(season);
    const byName = new Map(teams.map((t) => [t.governorName, t]));

    for (const [name, expected] of Object.entries(truth[season])) {
      const team = byName.get(name);
      assert.ok(team, `${name} missing from ${season}`);

      assert.equal(team.totalVP, expected.vp, `${season} ${name} VP`);

      const record = SHEET_IS_STALE.record.get(`${season}:${name}`) ?? expected;
      assert.equal(team.wins, record.wins, `${season} ${name} wins`);
      assert.equal(team.losses, record.losses, `${season} ${name} losses`);
    }
  });

  test(`${season}: every season plays exactly 91 head-to-head games`, async () => {
    const { teams } = await standings(season);
    const wins = teams.reduce((sum, t) => sum + t.wins, 0);
    const losses = teams.reduce((sum, t) => sum + t.losses, 0);
    // 14 teams over 13 head-to-head weeks. A 14-week season still totals 91
    // because the finale is scored league-wide and awards no result.
    assert.equal(wins, 91, `${season} total wins`);
    assert.equal(losses, 91, `${season} total losses`);
  });

  test(`${season}: points for and against match the league spreadsheet`, async () => {
    const { teams } = await standings(season);
    const byName = new Map(teams.map((t) => [t.governorName, t]));

    for (const [name, expected] of Object.entries(truth[season])) {
      const team = byName.get(name)!;
      if (!SHEET_IS_STALE.pointsFor.has(`${season}:${name}`) &&
          !SHEET_IS_STALE.scoreCorrections.has(`${season}:${name}:pf`)) {
        assert.ok(
          Math.abs(team.totalPoints - expected.pointsFor) <= POINTS_TOLERANCE,
          `${season} ${name} points for: sheet ${expected.pointsFor}, app ${team.totalPoints}`
        );
      }
      if (!SHEET_IS_STALE.scoreCorrections.has(`${season}:${name}:pa`)) {
        assert.ok(
          Math.abs(team.totalPointsAgainst - expected.pointsAgainst) <= POINTS_TOLERANCE,
          `${season} ${name} points against: sheet ${expected.pointsAgainst}, app ${team.totalPointsAgainst}`
        );
      }
    }
  });
}

test("podiums match the league's recorded champions", async () => {
  // Third place is the better-seeded losing semi-finalist. Sleeper's
  // third-place game is an exhibition and does not decide it: Eli won it in
  // 2020 and Chris in 2022, but Sam and DanK were the higher seeds.
  const expected: Record<string, [string, string, string]> = {
    "2020": ["Mark", "Josh", "Sam"],
    "2021": ["Jeremy", "Chris", "Sam"],
    "2022": ["Ben", "Jeremy", "DanK"],
    "2023": ["Chris", "Eli", "Johnathan"],
    "2024": ["Jeremy", "Peter", "Knute"],
    "2025": ["Ben", "Brent", "Jeremy"],
  };

  for (const [season, [first, second, third]] of Object.entries(expected)) {
    const { playoffs } = await standings(season);
    assert.ok(playoffs, `${season} has no bracket`);
    assert.equal(playoffs.champion, first, `${season} champion`);
    assert.equal(playoffs.runnerUp, second, `${season} runner-up`);
    assert.equal(playoffs.thirdPlace, third, `${season} third place`);
  }
});
