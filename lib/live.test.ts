import assert from "node:assert/strict";
import { test } from "node:test";
import { ARCHIVED_SEASONS, CURRENT_SEASON } from "./config";
import { archiveToSeasonInput, loadSeasonArchive } from "./archive-data";
import { computeSeasonStandings, pendingWeeks, type SeasonInput } from "./season";
import {
  resolveLiveView,
  restrictStandings,
  restrictTeam,
  teamsForView,
} from "./standings-view";
import type { SleeperMatchup, SleeperNflState } from "./sleeper";

/**
 * The live-week machinery, checked entirely offline.
 *
 * The two things that matter are that no archived season can ever grow a
 * pending week, and that hiding a week on the client gives exactly the numbers
 * the server would have computed without that week at all.
 */

async function seasonInput(season: string): Promise<SeasonInput> {
  const archive = await loadSeasonArchive(season);
  assert.ok(archive, `archive for ${season}`);
  return archiveToSeasonInput(archive);
}

function nflState(partial: Partial<SleeperNflState>): SleeperNflState {
  return {
    season: CURRENT_SEASON,
    week: 1,
    season_type: "regular",
    display_week: 1,
    ...partial,
  };
}

function matchup(rosterId: number, points: number): SleeperMatchup {
  return {
    roster_id: rosterId,
    matchup_id: 1,
    points,
    starters: [],
    starters_points: [],
    players: [],
    players_points: {},
  };
}

test("an archived season never has a pending week, under any context", async () => {
  const contexts = [
    { rosterCount: 14, nflState: null },
    { rosterCount: 14, nflState: nflState({ week: 1 }) },
    { rosterCount: 14, nflState: nflState({ week: 8 }) },
    { rosterCount: 14, nflState: nflState({ season_type: "post", week: 16 }) },
    { rosterCount: 99, nflState: undefined },
  ];

  for (const season of ARCHIVED_SEASONS) {
    const input = await seasonInput(season);
    for (const ctx of contexts) {
      assert.deepEqual(
        pendingWeeks(season, input.weeks, ctx),
        [],
        `${season} must stay final whatever the NFL clock says`
      );
    }
  }
});

test("the NFL clock decides which weeks are pending", () => {
  const weeks = [1, 2, 3].map((week) => ({ week, matchups: [matchup(1, 100)] }));

  assert.deepEqual(
    pendingWeeks(CURRENT_SEASON, weeks, { rosterCount: 1, nflState: nflState({ week: 3 }) }),
    [3]
  );
  assert.deepEqual(
    pendingWeeks(CURRENT_SEASON, weeks, { rosterCount: 1, nflState: nflState({ week: 2 }) }),
    [2, 3]
  );
  // Everything is behind the clock, so everything is settled.
  assert.deepEqual(
    pendingWeeks(CURRENT_SEASON, weeks, { rosterCount: 1, nflState: nflState({ week: 4 }) }),
    []
  );
  // The regular season is over, or the NFL has moved on a year.
  assert.deepEqual(
    pendingWeeks(CURRENT_SEASON, weeks, {
      rosterCount: 1,
      nflState: nflState({ week: 1, season_type: "post" }),
    }),
    []
  );
  assert.deepEqual(
    pendingWeeks(CURRENT_SEASON, weeks, {
      rosterCount: 1,
      nflState: nflState({ week: 1, season: String(Number(CURRENT_SEASON) + 1) }),
    }),
    []
  );
});

test("without the NFL clock, only the newest week can be pending", () => {
  const settled = [matchup(1, 100), matchup(2, 90)];
  // A zero in an older week -- the league's history has genuine 0.0 weeks, and
  // the heuristic must not reach back and demote one.
  const weeks = [
    { week: 1, matchups: [matchup(1, 0), matchup(2, 0)] },
    { week: 2, matchups: settled },
  ];

  assert.deepEqual(pendingWeeks(CURRENT_SEASON, weeks, { rosterCount: 2 }), []);

  assert.deepEqual(
    pendingWeeks(CURRENT_SEASON, [...weeks, { week: 3, matchups: [matchup(1, 0), matchup(2, 40)] }], {
      rosterCount: 2,
    }),
    [3],
    "a team yet to score marks the newest week unfinished"
  );

  assert.deepEqual(
    pendingWeeks(CURRENT_SEASON, [...weeks, { week: 3, matchups: [matchup(1, 40)] }], {
      rosterCount: 2,
    }),
    [3],
    "a missing roster marks the newest week unfinished"
  );

  assert.deepEqual(pendingWeeks(CURRENT_SEASON, [], { rosterCount: 2 }), []);
});

test("hiding a week equals never having computed it", async () => {
  for (const season of ARCHIVED_SEASONS) {
    const input = await seasonInput(season);
    const full = computeSeasonStandings(input);

    for (const { week } of input.weeks) {
      const withoutWeek = computeSeasonStandings({
        ...input,
        weeks: input.weeks.filter((w) => w.week !== week),
      });
      const restricted = restrictStandings(full, (r) => r.week !== week);

      assert.deepEqual(
        restricted.teams,
        withoutWeek.teams,
        `${season}: dropping week ${week} client-side must match recomputing without it`
      );
      assert.equal(restricted.weeksCompleted, withoutWeek.weeksCompleted);
    }
  }
});

test("restrictTeam keeps a team that played no surviving weeks", async () => {
  const full = computeSeasonStandings(await seasonInput(ARCHIVED_SEASONS[0]));
  const stripped = restrictTeam(full.teams[0], () => false);

  assert.equal(stripped.governorName, full.teams[0].governorName);
  assert.deepEqual(stripped.weeklyResults, []);
  assert.equal(stripped.totalVP, 0);
  assert.equal(stripped.totalPoints, 0);
  assert.equal(stripped.totalPointsAgainst, 0);
  assert.equal(stripped.wins + stripped.losses + stripped.ties, 0);
});

test("the dashboard opens on Final, or on the live week when nothing is settled", () => {
  const ctx = { hasPending: true, canProject: true, hasSettled: true };
  assert.equal(resolveLiveView(null, ctx), "final");
  assert.equal(resolveLiveView(null, { ...ctx, hasSettled: false }), "projected");
  assert.equal(resolveLiveView(null, { ...ctx, hasSettled: false, canProject: false }), "live");
});

test("a remembered choice is honoured, but never shows a raw live week beside projections", () => {
  const ctx = { hasPending: true, canProject: true, hasSettled: true };
  assert.equal(resolveLiveView("projected", ctx), "projected");
  assert.equal(resolveLiveView("final", ctx), "final");
  // A choice made on a day projections were down reads as projected once they are back.
  assert.equal(resolveLiveView("live", ctx), "projected");
  // And a projected choice falls back to Final on a day they are not.
  assert.equal(resolveLiveView("projected", { ...ctx, canProject: false }), "final");
  // A finished season has no live week to choose about.
  assert.equal(resolveLiveView("final", { ...ctx, hasPending: false }), "live");
});

test("every view reads its week-in-progress results from the same source", async () => {
  const full = await seasonInput(ARCHIVED_SEASONS[ARCHIVED_SEASONS.length - 1]);
  const pending = [3];
  const input = { ...full, weeks: full.weeks.filter((w) => w.week <= 3) };
  const live = computeSeasonStandings(input).teams;

  // Projections that turn every week-3 result around, as a late Sunday can.
  const projected = computeSeasonStandings({
    ...input,
    weeks: input.weeks.map((entry) =>
      entry.week === 3
        ? { ...entry, matchups: entry.matchups.map((m) => ({ ...m, points: 300 - m.points })) }
        : entry
    ),
  }).teams;
  const projectedLive = {
    weeks: pending,
    teams: projected,
    finalStarters: 0,
    projectedStarters: 0,
    fetchedAt: "",
  };

  const week3 = (teams: typeof live) =>
    new Map(teams.map((t) => [t.rosterId, t.weeklyResults.find((r) => r.week === 3)?.vp]));
  assert.notDeepEqual(week3(live), week3(projected), "the fixture must actually differ");

  // The weekly grid and the VP chart are handed these rows, so a projected
  // standings table can no longer sit beside a live grid.
  assert.deepEqual(week3(teamsForView("projected", live, pending, projectedLive)), week3(projected));
  assert.equal(teamsForView("live", live, pending, projectedLive), live);
  assert.deepEqual(
    teamsForView("final", live, pending, projectedLive),
    live.map((t) => restrictTeam(t, (r) => r.week !== 3))
  );
});
