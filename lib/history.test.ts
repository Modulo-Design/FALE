import assert from "node:assert/strict";
import { test } from "node:test";
import groundTruth from "../data/ground-truth.json" with { type: "json" };
import { buildGameLog, headToHead, recordBook, type Game } from "./history";

const h2hTruth = groundTruth.headToHeadRegularSeason as Record<
  string,
  Record<string, { wins: number; losses: number }>
>;

let cached: Game[] | undefined;
async function log(): Promise<Game[]> {
  cached ??= await buildGameLog();
  return cached;
}

test("the game log covers every season", async () => {
  const games = await log();
  const seasons = [...new Set(games.map((g) => g.season))].sort();
  assert.deepEqual(seasons, ["2020", "2021", "2022", "2023", "2024", "2025"]);
  assert.ok(games.length > 1000, `expected a full log, got ${games.length} games`);
});

test("every game log entry resolves to a known governor", async () => {
  const games = await log();
  const unmapped = new Set(
    games.filter((g) => g.governorName.startsWith("Unmapped:")).map((g) => g.governorName)
  );
  assert.deepEqual([...unmapped], []);
});

test("head-to-head reconciles with the league spreadsheet's matrix", async () => {
  const games = await log();
  // The spreadsheet's matrix counts regular-season meetings only.
  const regular = games.filter((g) => g.phase === "regular");

  // The spreadsheet's matrix predates the 2025 week 6 auto-loss, exactly as its
  // win-loss column does, so Chris still has that win against DanK there.
  const STALE: Record<string, { wins: number; losses: number }> = {
    "Chris|DanK": { wins: 3, losses: 3 },
    "DanK|Chris": { wins: 3, losses: 3 },
  };

  let checked = 0;
  for (const [a, opponents] of Object.entries(h2hTruth)) {
    for (const [b, expected] of Object.entries(opponents)) {
      const result = headToHead(regular, a, b);
      const want = STALE[`${a}|${b}`] ?? expected;
      assert.equal(result.wins, want.wins, `${a} vs ${b} wins`);
      assert.equal(result.losses, want.losses, `${a} vs ${b} losses`);
      checked++;
    }
  }
  assert.equal(checked, 182, "every ordered pair of the 14 governors");
});

test("every pair has met exactly six times — a perfect round robin", async () => {
  const games = await log();
  const regular = games.filter((g) => g.phase === "regular");
  for (const [a, opponents] of Object.entries(h2hTruth)) {
    for (const b of Object.keys(opponents)) {
      const { wins, losses, ties } = headToHead(regular, a, b);
      assert.equal(wins + losses + ties, 6, `${a} vs ${b} meeting count`);
    }
  }
});

test("head-to-head is symmetric", async () => {
  const games = await log();
  const forward = headToHead(games, "Ben", "Jeremy");
  const reverse = headToHead(games, "Jeremy", "Ben");
  assert.equal(forward.wins, reverse.losses);
  assert.equal(forward.losses, reverse.wins);
  assert.equal(forward.pointsFor, reverse.pointsAgainst);
  assert.equal(forward.meetings.length, reverse.meetings.length);
});

test("head-to-head reports per-season splits and a streak", async () => {
  const games = await log();
  const result = headToHead(games, "Ben", "Jeremy");
  assert.ok(result.perSeason.length > 0);
  const totalFromSplits = result.perSeason.reduce((sum, s) => sum + s.wins + s.losses + s.ties, 0);
  assert.equal(totalFromSplits, result.meetings.length);
  assert.notEqual(result.streak, 0, "a played series always has a current streak");
});

test("an unplayed pairing returns an empty series rather than throwing", async () => {
  const games = await log();
  const result = headToHead(games, "Ben", "Nobody");
  assert.equal(result.meetings.length, 0);
  assert.equal(result.wins, 0);
  assert.equal(result.streak, 0);
  assert.equal(result.biggestWin, undefined);
});

test("the record book ranks weeks, blowouts and nail-biters", async () => {
  const games = await log();
  const book = recordBook(games);

  assert.equal(book.highestWeek.length, 10);
  assert.ok(book.highestWeek[0].value > book.highestWeek[9].value);
  assert.ok(book.lowestWeek[0].value < book.highestWeek[0].value);
  assert.ok(book.lowestWeek[0].value > 0, "a team that never set a lineup is not a record");

  // Blowouts are ranked from the winner's side, so every margin is positive.
  assert.ok(book.biggestBlowouts.every((r) => r.value > 0));
  assert.ok(book.biggestBlowouts[0].value > book.closestMatchups[0].value);
  assert.ok(book.closestMatchups[0].value > 0, "a tie is not the closest matchup");

  assert.ok(book.highestCombined[0].value > book.lowestCombined[0].value);
  assert.equal(book.hasPlayerData, false, "no player map committed yet");
  assert.deepEqual(book.byPosition, {});
});

test("positional records use the player map when one is supplied", async () => {
  const games = await log();
  const withStarters = games.find((g) => g.starters.length > 0 && g.startersPoints.length > 0);
  assert.ok(withStarters, "the archive carries starting lineups");

  const players = Object.fromEntries(
    withStarters.starters.map((id, i) => [id, { n: `Player ${id}`, p: i === 0 ? "TE" : "WR", t: null }])
  );
  const book = recordBook([withStarters], players);

  assert.equal(book.hasPlayerData, true);
  assert.ok(book.byPosition.TE?.length, "TE records are produced");
  const best = book.byPosition.TE[0];
  assert.equal(best.position, "TE");
  assert.ok(best.playerName?.startsWith("Player "));
  assert.equal(best.value, withStarters.startersPoints[0]);
});

test("Rivalry Week is tracked separately from the head-to-head record", async () => {
  const games = await log();
  const result = headToHead(games, "Ben", "Jeremy");

  // The finale pairing awards no VP and no result, so it must not leak into
  // the series record -- but it is still played, and still counts for pride.
  // (Regular meetings still include playoff games, which run to week 18.)
  const leaked = result.meetings.filter(
    (m) => m.phase === "regular" && m.week === 14 && m.season >= "2021"
  );
  assert.deepEqual(leaked, [], "finale weeks must not count as head-to-head meetings");
  assert.ok(
    result.rivalryWeek.meetings.every((m) => m.season >= "2021"),
    "Rivalry Week only exists from 2021, when the finale format started"
  );

  const rivalry = result.rivalryWeek;
  assert.equal(
    rivalry.wins + rivalry.losses + rivalry.ties,
    rivalry.meetings.length
  );
  for (const meeting of rivalry.meetings) {
    assert.equal(meeting.won, meeting.points > meeting.opponentPoints);
  }
});

test("every governor's Rivalry Week meetings are symmetric", async () => {
  const games = await log();
  const forward = headToHead(games, "Ben", "Jeremy").rivalryWeek;
  const reverse = headToHead(games, "Jeremy", "Ben").rivalryWeek;
  assert.equal(forward.wins, reverse.losses);
  assert.equal(forward.losses, reverse.wins);
  assert.equal(forward.meetings.length, reverse.meetings.length);
});
