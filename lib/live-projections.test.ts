import assert from "node:assert/strict";
import { test } from "node:test";
import {
  indexProjections,
  indexSchedule,
  projectPendingWeeks,
  projectWeekMatchups,
  scoreProjection,
  scoringKey,
  type ProjectionSource,
} from "./live-projections";
import { getWeekSchedule, type SleeperMatchup } from "./sleeper";

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
    { home: "DAL", away: "PHI", status: "in_progress" },
    { home: "LV", away: "DEN", status: "canceled" },
  ]);

  assert.equal(byTeam.get("KC"), "complete");
  assert.equal(byTeam.get("BUF"), "complete");
  assert.equal(byTeam.get("MIN"), "in_game");
  assert.equal(byTeam.get("GB"), "in_game");
  assert.equal(byTeam.get("NYJ"), "pre_game");
  assert.equal(byTeam.get("SF"), "pre_game");
  // An unfamiliar in-progress string must not read as pre-game, which would
  // throw away the points already on the board.
  assert.equal(byTeam.get("DAL"), "in_game");
  assert.equal(byTeam.get("LV"), "complete");
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

test("a projection is scored on the league's settings, not stock PPR", () => {
  const stats = { pass_yd: 250, pass_td: 2, rec: 5, rec_yd: 60, pts_ppr: 999 };
  // 250 * 0.04 + 2 * 6 + 5 * 1 + 60 * 0.1
  assert.equal(scoreProjection(stats, { pass_yd: 0.04, pass_td: 6, rec: 1, rec_yd: 0.1 }), 33);
  // A tight end's reception bonus is not in the feed, so it comes from his receptions.
  assert.equal(scoreProjection({ rec: 4 }, { rec: 1, bonus_rec_te: 0.5 }, "TE"), 6);
  assert.equal(scoreProjection({ rec: 4 }, { rec: 1, bonus_rec_te: 0.5 }, "WR"), 4);
  // Nothing to score from: the caller falls back to the stock column.
  assert.equal(scoreProjection({ pts_ppr: 12 }, { pass_td: 6 }), null);

  const indexed = indexProjections(
    [
      { player_id: "a", stats: { rec: 3, rec_yd: 40, pts_ppr: 7 } },
      { player_id: "b", stats: { pts_ppr: 11 } },
    ],
    "pts_ppr",
    { rec: 1, rec_yd: 0.1 }
  );
  assert.equal(indexed.points.get("a"), 7);
  assert.equal(indexed.points.get("b"), 11);
});

/** Serve canned Sleeper responses by URL substring for the length of `run`. */
async function withFetch<T>(routes: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const hit = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[hit]), { status: 200 });
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("the schedule is read a season at a time and cut down to the week", async () => {
  const games = await withFetch(
    {
      "/schedule/nfl/regular/2026": [
        { week: 2, home: "KC", away: "BUF", status: "complete" },
        { week: 3, home: "KC", away: "DEN", status: "pre_game" },
        { week: 18, home: "KC", away: "LV", status: "pre_game" },
      ],
    },
    () => getWeekSchedule("2026", 3)
  );
  assert.deepEqual(games, [{ week: 3, home: "KC", away: "DEN", status: "pre_game" }]);
});

test("a finished bust keeps his real score in a projected week", async () => {
  // The case that projected the wrong winner: team 1's starter played Sunday
  // and busted, team 2's plays Monday. Scored on the schedule, team 2 wins.
  const weeks = [
    {
      week: 3,
      matchups: [
        matchup({ roster_id: 1, starters: ["bust"], starters_points: [4], points: 4 }),
        matchup({ roster_id: 2, starters: ["mnf"], starters_points: [0], points: 0 }),
      ],
    },
  ];
  const routes = {
    "/projections/nfl/2026/3": [
      { player_id: "bust", team: "KC", stats: { pts_ppr: 20 } },
      { player_id: "mnf", team: "DAL", stats: { pts_ppr: 15 } },
    ],
    "/schedule/nfl/regular/2026": [
      { week: 3, home: "KC", away: "DEN", status: "complete" },
      { week: 3, home: "DAL", away: "NYG", status: "pre_game" },
    ],
  };

  const projected = await withFetch(routes, () =>
    projectPendingWeeks({ season: "2026", weeks, scoringSettings: { rec: 1 } })
  );
  const points = projected?.byWeek.get(3)?.map((m) => m.points);
  assert.deepEqual(points, [4, 15]);
});

test("no schedule means no projected week, rather than a guessed one", async () => {
  const weeks = [
    { week: 3, matchups: [matchup({ starters: ["a"], starters_points: [4], points: 4 })] },
  ];
  const projected = await withFetch(
    { "/projections/nfl/2026/3": [{ player_id: "a", team: "KC", stats: { pts_ppr: 20 } }] },
    () => projectPendingWeeks({ season: "2026", weeks, scoringSettings: { rec: 1 } })
  );
  assert.equal(projected, null);
});
