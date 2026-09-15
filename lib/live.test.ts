import assert from "node:assert/strict";
import { test } from "node:test";
import { ARCHIVED_SEASONS, CURRENT_SEASON } from "./config";
import { archiveToSeasonInput, loadSeasonArchive } from "./archive-data";
import { computeSeasonStandings, pendingWeeks, type SeasonInput } from "./season";
import { restrictStandings, restrictTeam } from "./standings-view";
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
