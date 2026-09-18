import assert from "node:assert/strict";
import { test } from "node:test";
import {
  indexProjections,
  indexSchedule,
  projectWeekMatchups,
  scoringKey,
  type ProjectionSource,
} from "./live-projections";
import type { SleeperMatchup } from "./sleeper";

/**
 * The projected live week, checked offline.
 *
 * The rule under test is the per-starter one: a finished game counts at its
 * real score, an unplayed one at its projection, and a game in progress at
 * whichever is higher. Everything downstream of that is the ordinary VP
 * pipeline, which its own tests already cover.
 */

function matchup(partial: Partial<SleeperMatchup> = {}): SleeperMatchup {
  return {
    roster_id: 1,
    matchup_id: 1,
    points: 0,
    starters: [],
    starters_points: [],
    players: [],
    players_points: {},
    ...partial,
  };
}

function source(
  entries: { id: string; points?: number; team?: string }[]
): ProjectionSource {
  return indexProjections(
    entries.map((e) => ({
      player_id: e.id,
      team: e.team ?? "KC",
      stats: e.points == null ? null : { pts_ppr: e.points },
    })),
    "pts_ppr"
  );
}

test("scoring format follows the league's reception value", () => {
  assert.equal(scoringKey({ rec: 1 }), "pts_ppr");
  assert.equal(scoringKey({ rec: 0.5 }), "pts_half_ppr");
  assert.equal(scoringKey({ rec: 0 }), "pts_std");
  assert.equal(scoringKey(null), "pts_std");
  assert.equal(scoringKey(undefined), "pts_std");
});

test("game status collapses to finished or not, for both teams", () => {
  const byTeam = indexSchedule([
    { home: "KC", away: "BUF", status: "complete" },
    { home: "min", away: "GB", status: "in_game" },
    { home: "NYJ", away: "NE", status: "pre_game" },
    { home: "SF", away: "SEA", status: null },
  ]);

  assert.equal(byTeam.get("KC"), "complete");
  assert.equal(byTeam.get("BUF"), "complete");
  assert.equal(byTeam.get("MIN"), "in_game");
  assert.equal(byTeam.get("GB"), "in_game");
  assert.equal(byTeam.get("NYJ"), "pre_game");
  assert.equal(byTeam.get("SF"), "pre_game");
});

test("a finished starter keeps his real score, however his projection read", () => {
  const result = projectWeekMatchups(
    [matchup({ starters: ["a"], starters_points: [3.4], points: 3.4 })],
    source([{ id: "a", points: 18 }]),
    indexSchedule([{ home: "KC", away: "BUF", status: "complete" }])
  );

  assert.equal(result.matchups[0].points, 3.4);
  assert.equal(result.finalStarters, 1);
  assert.equal(result.projectedStarters, 0);
});

test("a starter who has not kicked off counts at his projection", () => {
  const result = projectWeekMatchups(
    [matchup({ starters: ["a"], starters_points: [0], points: 0 })],
    source([{ id: "a", points: 12.5 }]),
    indexSchedule([{ home: "KC", away: "BUF", status: "pre_game" }])
  );

  assert.equal(result.matchups[0].points, 12.5);
  assert.equal(result.projectedStarters, 1);
});

test("a starter mid-game is never marked down below what he has scored", () => {
  const schedule = indexSchedule([{ home: "KC", away: "BUF", status: "in_game" }]);

  const behind = projectWeekMatchups(
    [matchup({ starters: ["a"], starters_points: [4], points: 4 })],
    source([{ id: "a", points: 14 }]),
    schedule
  );
  assert.equal(behind.matchups[0].points, 14);

  const ahead = projectWeekMatchups(
    [matchup({ starters: ["a"], starters_points: [26.2], points: 26.2 })],
    source([{ id: "a", points: 14 }]),
    schedule
  );
  assert.equal(ahead.matchups[0].points, 26.2);
});

test("an unknown kickoff is treated as in progress, so points already scored survive", () => {
  const result = projectWeekMatchups(
    [matchup({ starters: ["a"], starters_points: [20], points: 20 })],
    source([{ id: "a", points: 9, team: "KC" }]),
    new Map()
  );

  assert.equal(result.matchups[0].points, 20);
});

test("a starter with no projection counts at his real score rather than vanishing", () => {
  const result = projectWeekMatchups(
    [matchup({ starters: ["a", "b"], starters_points: [7, 11], points: 18 })],
    source([{ id: "a", points: 20 }]),
    indexSchedule([{ home: "KC", away: "BUF", status: "pre_game" }])
  );

  // 20 projected for a, 11 real for the unprojected b.
  assert.equal(result.matchups[0].points, 31);
  assert.equal(result.finalStarters, 1);
  assert.equal(result.projectedStarters, 1);
});

test("empty starting slots contribute nothing", () => {
  const result = projectWeekMatchups(
    [matchup({ starters: ["0", "a"], starters_points: [0, 5], points: 5 })],
    source([{ id: "a", points: 15 }]),
    indexSchedule([{ home: "KC", away: "BUF", status: "pre_game" }])
  );

  assert.equal(result.matchups[0].points, 15);
  assert.equal(result.finalStarters + result.projectedStarters, 1);
});

test("a matchup with no starter breakdown is left exactly as Sleeper gave it", () => {
  const original = matchup({ points: 104.2 });
  const result = projectWeekMatchups([original], source([]), new Map());

  assert.equal(result.matchups[0], original);
  assert.equal(result.matchups[0].points, 104.2);
});

test("a whole roster projects to the sum of its starters", () => {
  const result = projectWeekMatchups(
    [
      matchup({
        roster_id: 3,
        starters: ["done", "pending", "live"],
        starters_points: [22.1, 0, 6],
        points: 28.1,
      }),
    ],
    source([
      { id: "done", points: 10, team: "KC" },
      { id: "pending", points: 13.25, team: "NYJ" },
      { id: "live", points: 9, team: "MIN" },
    ]),
    indexSchedule([
      { home: "KC", away: "BUF", status: "complete" },
      { home: "NYJ", away: "NE", status: "pre_game" },
      { home: "MIN", away: "GB", status: "in_game" },
    ])
  );

  // 22.1 real + 13.25 projected + max(6, 9)
  assert.equal(result.matchups[0].points, 44.35);
  assert.equal(result.matchups[0].roster_id, 3);
  assert.equal(result.matchups[0].matchup_id, 1);
  assert.equal(result.finalStarters, 1);
  assert.equal(result.projectedStarters, 2);
});
