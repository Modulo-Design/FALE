import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYOFF_FORMAT } from "./config";
import {
  cleanPicks,
  clearWeek,
  parsePicks,
  runMachine,
  toggleTopHalf,
  toggleWinner,
  weekProgress,
} from "./playoff-machine";
import { monteCarlo } from "./projections";
import type { ProjectionInput } from "./types";

/** Twelve weeks played; 13 is an ordinary week and 14 the finale. */
const input: ProjectionInput = {
  season: "2026",
  regularSeasonWeeks: 14,
  weeksCompleted: 12,
  playoffWeekStart: 15,
  teams: Array.from({ length: 14 }, (_, i) => ({
    rosterId: i + 1,
    governorName: `G${i + 1}`,
    currentVP: (14 - i) * 2,
    currentPoints: (140 - i * 4) * 12,
    weeklyScores: Array.from({ length: 12 }, (_, w) => 140 - i * 4 + (w % 3) - 1),
  })),
  remainingSchedule: [13, 14].map((week) => ({
    week,
    pairs: [1, 3, 5, 7, 9, 11, 13].map((r): [number, number] => [r, r + 1]),
  })),
  playoffFormat: PLAYOFF_FORMAT["2026"],
  sims: 300,
};

test("picking a winner replaces the other side, and picking it again takes it back", () => {
  let picks = toggleWinner(input, [], 13, 1);
  assert.deepEqual(picks, [{ week: 13, winners: [1], topHalf: [] }]);
  picks = toggleWinner(input, picks, 13, 2);
  assert.deepEqual(picks, [{ week: 13, winners: [2], topHalf: [] }]);
  picks = toggleWinner(input, picks, 13, 2);
  assert.deepEqual(picks, [], "an emptied week is dropped");
});

test("the top half holds seven and no more", () => {
  let picks = [] as ReturnType<typeof cleanPicks>;
  for (let id = 1; id <= 9; id++) picks = toggleTopHalf(input, picks, 13, id);
  assert.deepEqual(picks[0].topHalf, [1, 2, 3, 4, 5, 6, 7]);
  picks = toggleTopHalf(input, picks, 13, 3);
  picks = toggleTopHalf(input, picks, 13, 9);
  assert.deepEqual(picks[0].topHalf, [1, 2, 4, 5, 6, 7, 9]);
});

test("progress counts games and places, and the finale has no games", () => {
  let picks = toggleWinner(input, [], 13, 1);
  picks = toggleTopHalf(input, picks, 13, 1);
  assert.deepEqual(weekProgress(input, picks, 13), { made: 2, total: 14 });
  assert.deepEqual(weekProgress(input, picks, 14), { made: 0, total: 7 });
  assert.deepEqual(clearWeek(picks, 13), []);
});

test("stored picks survive a round trip and stale ones fall away", () => {
  const picks = toggleTopHalf(input, toggleWinner(input, [], 13, 4), 14, 9);
  assert.deepEqual(parsePicks(JSON.stringify(picks), input), picks);

  // Week 12 has been played since; roster 40 never existed.
  const stale = [
    { week: 12, winners: [1], topHalf: [1] },
    { week: 13, winners: [40, 4], topHalf: [40] },
  ];
  assert.deepEqual(parsePicks(JSON.stringify(stale), input), [
    { week: 13, winners: [4], topHalf: [] },
  ]);

  for (const junk of [null, "", "not json", "{}", '[{"week":"13"}]', "[null, 3]"]) {
    assert.deepEqual(parsePicks(junk, input), []);
  }
});

test("no picks hands back the server's projection untouched", () => {
  const baseline = { ...monteCarlo.run(input), input };
  assert.equal(runMachine(baseline, []), baseline);

  const picked = runMachine(baseline, toggleWinner(input, [], 13, 14));
  assert.notEqual(picked, baseline);
  assert.equal(picked.input, input);
  const odds = picked.teams.reduce((sum, t) => sum + t.playoffOdds, 0);
  assert.ok(Math.abs(odds - 7) < 1e-9, "still exactly seven teams a season");
});
