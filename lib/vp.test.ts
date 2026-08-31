import assert from "node:assert/strict";
import { test } from "node:test";
import type { SleeperMatchup } from "./sleeper";
import { aggregateStandings, applyVPOverrides, calculateWeekVPs } from "./vp";

function matchup(
  rosterId: number,
  matchupId: number | null,
  points: number
): SleeperMatchup {
  return {
    roster_id: rosterId,
    matchup_id: matchupId,
    points,
    starters: [],
    starters_points: [],
    players: [],
    players_points: {},
  };
}

/** Four teams, two games: 1 beats 2, 3 beats 4. Top half is rosters 1 and 3. */
function fourTeamWeek(): SleeperMatchup[] {
  return [
    matchup(1, 1, 120),
    matchup(2, 1, 100),
    matchup(3, 2, 110),
    matchup(4, 2, 90),
  ];
}

test("a win in the top half is worth 3 VP", () => {
  const results = calculateWeekVPs(fourTeamWeek(), 4, 1, "2025");
  const winner = results.find((r) => r.rosterId === 1)!;
  assert.equal(winner.vpMatchup, 2);
  assert.equal(winner.vpScoring, 1);
  assert.equal(winner.vp, 3);
  assert.equal(winner.won, true);
  assert.equal(winner.opponentRosterId, 2);
  assert.equal(winner.opponentPoints, 100);
});

test("a bottom-half loss is worth 0 VP", () => {
  const results = calculateWeekVPs(fourTeamWeek(), 4, 1, "2025");
  const loser = results.find((r) => r.rosterId === 4)!;
  assert.equal(loser.vp, 0);
  assert.equal(loser.won, false);
});

test("an exact tie is not scored as a win for one side", () => {
  const results = calculateWeekVPs(
    [matchup(1, 1, 100), matchup(2, 1, 100)],
    2,
    1,
    "2025"
  );
  const [a, b] = results;
  assert.equal(a.tied, true);
  assert.equal(b.tied, true);
  assert.equal(a.won, false);
  assert.equal(b.won, false);
  assert.equal(a.vpMatchup, b.vpMatchup, "both sides of a tie earn the same matchup VP");
});

test("a bye team still scores and can still earn scoring VP", () => {
  const results = calculateWeekVPs(
    [matchup(1, 1, 120), matchup(2, 1, 100), matchup(3, null, 200)],
    3,
    1,
    "2025"
  );
  const bye = results.find((r) => r.rosterId === 3);
  assert.ok(bye, "the bye team must not be dropped from the week");
  assert.equal(bye.bye, true);
  assert.equal(bye.points, 200);
  assert.equal(bye.vpMatchup, 0);
  assert.equal(bye.vpScoring, 1, "top score earns scoring VP even on a bye");
});

test("the finale week trades matchup VP for triple scoring VP", () => {
  const results = calculateWeekVPs(fourTeamWeek(), 4, 14, "2025");
  const winner = results.find((r) => r.rosterId === 1)!;
  assert.equal(winner.vpMatchup, 0, "no head-to-head VP in the finale");
  assert.equal(winner.vpScoring, 3);
  assert.equal(winner.isFinale, true);
});

test("2020 has no finale week because its regular season is 13 weeks", () => {
  const results = calculateWeekVPs(fourTeamWeek(), 4, 14, "2020");
  assert.equal(results[0].isFinale, false);
  const week13 = calculateWeekVPs(fourTeamWeek(), 4, 13, "2020");
  assert.equal(week13[0].isFinale, false, "2020 week 13 is a normal week, not a finale");
});

test("finale weeks contribute no win or loss to the record", () => {
  const regular = calculateWeekVPs(fourTeamWeek(), 4, 13, "2025");
  const finale = calculateWeekVPs(fourTeamWeek(), 4, 14, "2025");
  const standings = aggregateStandings([regular, finale]);
  const team = standings.get(1)!;
  assert.equal(team.wins, 1, "a 14-week season still plays 13 head-to-head games");
  assert.equal(team.losses, 0);
});

test("setResult flips the result and recomputes matchup VP", () => {
  const raw = calculateWeekVPs(fourTeamWeek(), 4, 1, "2025");
  const adjusted = applyVPOverrides(raw, [
    { rosterId: 1, setResult: "loss" },
    { rosterId: 2, setResult: "win" },
  ]);

  const demoted = adjusted.find((r) => r.rosterId === 1)!;
  assert.equal(demoted.won, false);
  assert.equal(demoted.vpMatchup, 0);
  assert.equal(demoted.vp, 1, "keeps its scoring VP, loses the matchup VP");

  const promoted = adjusted.find((r) => r.rosterId === 2)!;
  assert.equal(promoted.won, true);
  assert.equal(promoted.vpMatchup, 2);
  assert.equal(promoted.vp, 2, "no scoring VP: it was in the bottom half");
});

test("multiple adjustments for the same roster accumulate", () => {
  const raw = calculateWeekVPs(fourTeamWeek(), 4, 1, "2025");
  const adjusted = applyVPOverrides(raw, [
    { rosterId: 1, vpDelta: -2 },
    { rosterId: 1, vpDelta: -1 },
  ]);
  const team = adjusted.find((r) => r.rosterId === 1)!;
  assert.equal(team.vpAdjustment, -3, "a second ruling must not be silently ignored");
  assert.equal(team.vp, 0);
});

test("Chris 2025: a forced loss plus a penalty reproduces the spreadsheet", () => {
  // Ground truth has Chris at 2 VP from a 2-11 record, which requires the
  // head-to-head to flip AND a 2 VP penalty on top of it.
  const raw = calculateWeekVPs(fourTeamWeek(), 4, 6, "2025");
  const adjusted = applyVPOverrides(raw, [
    { rosterId: 1, setResult: "loss", vpDelta: -2 },
  ]);
  const chris = adjusted.find((r) => r.rosterId === 1)!;
  assert.equal(chris.won, false);
  assert.equal(chris.vpMatchup, 0);
  assert.equal(chris.vpAdjustment, -2);
  assert.equal(chris.vp, -1, "1 scoring VP minus the 2 VP penalty");
});
