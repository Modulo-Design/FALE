import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYOFF_FORMAT } from "./config";
import { firstRoundPairings, reseedPairings, seedPlayoffField } from "./seeding";
import type { TeamStanding } from "./types";

function team(governorName: string, totalVP: number, totalPoints: number, rosterId: number): TeamStanding {
  return {
    rosterId,
    governorName,
    displayName: governorName,
    avatar: null,
    totalVP,
    totalPoints,
    totalPointsAgainst: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    weeklyResults: [],
  };
}

// Real final regular-season figures from the league spreadsheet.
const SEASON_2025: TeamStanding[] = [
  ["Ben", 38, 1791.8], ["Brent", 32, 1901.2], ["Chris", 2, 727.4], ["DanK", 11, 1205.8],
  ["DanP", 21, 1664.0], ["Eli", 29, 1861.7], ["Jeremy", 34, 2022.6], ["Johnathan", 33, 2098.3],
  ["Josh", 15, 1456.1], ["Knute", 25, 1660.7], ["Mark", 4, 688.7], ["Matt", 29, 1853.8],
  ["Peter", 15, 1554.8], ["Sam", 6, 1274.1],
].map(([n, v, p], i) => team(n as string, v as number, p as number, i + 1));

const SEASON_2020: TeamStanding[] = [
  ["Ben", 2, 78.4], ["Brent", 7, 401.6], ["Chris", 2, 179.5], ["DanK", 24, 1561.4],
  ["DanP", 9, 879.7], ["Eli", 28, 1697.3], ["Jeremy", 31, 1804.1], ["Johnathan", 21, 1569.7],
  ["Josh", 33, 1889.1], ["Knute", 31, 1675.0], ["Mark", 34, 1798.9], ["Matt", 12, 1015.0],
  ["Peter", 11, 1005.2], ["Sam", 28, 1843.7],
].map(([n, v, p], i) => team(n as string, v as number, p as number, i + 1));

const names = (seeds: { governorName: string }[]) => seeds.map((s) => s.governorName);

test("2025 seeding reproduces the real seven-team field", () => {
  const seeds = seedPlayoffField(SEASON_2025, PLAYOFF_FORMAT["2025"]);
  assert.deepEqual(names(seeds), [
    "Ben", "Jeremy", "Johnathan", "Brent", "Eli", "Matt", "DanP",
  ]);
});

test("2025: DanP takes the wildcard over Knute despite 4 fewer VP", () => {
  const seeds = seedPlayoffField(SEASON_2025, PLAYOFF_FORMAT["2025"]);
  const last = seeds[seeds.length - 1];
  assert.equal(last.governorName, "DanP");
  assert.equal(last.qualifiedBy, "points");
  assert.equal(last.totalVP, 21);
  // Knute finished on 25 VP but scored 1660.7 to DanP's 1664.0.
  assert.ok(!names(seeds).includes("Knute"));
});

test("2025: Eli edges Matt for the 5 seed on points at equal VP", () => {
  const seeds = seedPlayoffField(SEASON_2025, PLAYOFF_FORMAT["2025"]);
  assert.equal(seeds[4].governorName, "Eli");
  assert.equal(seeds[5].governorName, "Matt");
  assert.equal(seeds[4].totalVP, seeds[5].totalVP);
});

test("2025 round one is 2v7, 3v6, 4v5 with the 1 seed on bye", () => {
  const format = PLAYOFF_FORMAT["2025"];
  const seeds = seedPlayoffField(SEASON_2025, format);
  assert.equal(seeds.filter((s) => s.hasBye).length, 1);
  assert.equal(seeds[0].governorName, "Ben");

  const pairings = firstRoundPairings(seeds, format.byes);
  assert.deepEqual(
    pairings.map((p) => [p.high.governorName, p.low.governorName]),
    [
      ["Jeremy", "DanP"],      // Jeremy 143.30 def. DanP 95.00
      ["Johnathan", "Matt"],   // Matt 182.50 def. Johnathan 142.20
      ["Brent", "Eli"],        // Brent 152.95 def. Eli 123.95
    ]
  );
});

test("2020 seeding reproduces the real six-team field", () => {
  const seeds = seedPlayoffField(SEASON_2020, PLAYOFF_FORMAT["2020"]);
  assert.deepEqual(names(seeds), ["Mark", "Josh", "Jeremy", "Knute", "Sam", "Eli"]);
  assert.equal(seeds[5].qualifiedBy, "points", "Eli was the highest scorer left over");
});

test("2020 round one is 3v6, 4v5 with two byes", () => {
  const format = PLAYOFF_FORMAT["2020"];
  const seeds = seedPlayoffField(SEASON_2020, format);
  assert.deepEqual(names(seeds.filter((s) => s.hasBye)), ["Mark", "Josh"]);

  const pairings = firstRoundPairings(seeds, format.byes);
  assert.deepEqual(
    pairings.map((p) => [p.high.governorName, p.low.governorName]),
    [
      ["Jeremy", "Eli"],   // Eli 134.80 def. Jeremy 110.10
      ["Knute", "Sam"],    // Sam 175.30 def. Knute 135.60
    ]
  );
});

test("later rounds re-seed so the top seed draws the lowest survivor", () => {
  const seeds = seedPlayoffField(SEASON_2020, PLAYOFF_FORMAT["2020"]);
  const byName = (n: string) => seeds.find((s) => s.governorName === n)!;
  // 2020 semi-finalists: byes Mark (1) and Josh (2), plus winners Sam (5) and Eli (6).
  const pairings = reseedPairings([byName("Mark"), byName("Josh"), byName("Sam"), byName("Eli")]);
  assert.deepEqual(
    pairings.map((p) => [p.high.governorName, p.low.governorName]),
    [
      ["Mark", "Eli"],   // Mark 193.65 def. Eli 134.35
      ["Josh", "Sam"],   // Josh 194.95 def. Sam 132.65
    ]
  );
});

test("re-seeding ignores the order survivors are supplied in", () => {
  const seeds = seedPlayoffField(SEASON_2025, PLAYOFF_FORMAT["2025"]);
  const pick = (n: string) => seeds.find((s) => s.governorName === n)!;
  const pairings = reseedPairings([pick("Matt"), pick("Ben"), pick("Brent"), pick("Jeremy")]);
  assert.deepEqual(pairings.map((p) => [p.high.seed, p.low.seed]), [[1, 6], [2, 4]]);
});
