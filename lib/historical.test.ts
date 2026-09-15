import assert from "node:assert/strict";
import { test } from "node:test";
import { ARCHIVED_SEASONS } from "./config";
import { archivedSeasonStandings } from "./season";
import { aggregateGameStats, aggregateGovernorStats } from "./historical";
import { buildGameLog, isBracket, isCounting, isRegular, type Game } from "./history";
import type { GovernorStats, SeasonStandings } from "./types";

/**
 * The all-time table moved off the standings pipeline and onto the game log so
 * it could be split by phase. `aggregateGovernorStats` stays exported purely as
 * the reference implementation these tests measure the new one against.
 */

let cachedLog: Game[] | undefined;
async function log(): Promise<Game[]> {
  cachedLog ??= await buildGameLog();
  return cachedLog;
}

let cachedSeasons: SeasonStandings[] | undefined;
async function archivedStandings(): Promise<SeasonStandings[]> {
  if (!cachedSeasons) {
    const loaded = await Promise.all(
      ARCHIVED_SEASONS.map((season) =>
        archivedSeasonStandings(season, { includePlayoffs: false })
      )
    );
    cachedSeasons = loaded.filter((s): s is SeasonStandings => s !== null);
  }
  return cachedSeasons;
}

function byName(stats: GovernorStats[]): Map<string, GovernorStats> {
  return new Map(stats.map((s) => [s.governorName, s]));
}

test("the regular-season scope reproduces the old pipeline field for field", async () => {
  const [games, seasons] = await Promise.all([log(), archivedStandings()]);

  const fromLog = aggregateGameStats(games.filter(isRegular));
  const reference = aggregateGovernorStats(seasons);

  assert.deepEqual(
    fromLog.map((s) => s.governorName),
    reference.map((s) => s.governorName),
    "same governors in the same order"
  );
  assert.deepEqual(fromLog, reference);
});

test("Total is exactly Regular season plus Playoffs", async () => {
  const games = await log();
  const all = byName(aggregateGameStats(games.filter(isCounting)));
  const regular = byName(aggregateGameStats(games.filter(isRegular)));
  const playoff = byName(aggregateGameStats(games.filter(isBracket)));

  for (const [name, total] of all) {
    const r = regular.get(name)!;
    const p = playoff.get(name)!;
    assert.equal(total.weekCount, r.weekCount + p.weekCount, `${name} weeks`);
    assert.equal(
      total.totalPoints,
      Math.round((r.totalPoints + p.totalPoints) * 100) / 100,
      `${name} points`
    );
    if (total.weekCount > 0) {
      assert.equal(
        total.highScore,
        Math.max(r.highScore, p.highScore),
        `${name} high score`
      );
      const lows = [r, p].filter((s) => s.weekCount > 0).map((s) => s.lowScore);
      assert.equal(total.lowScore, Math.min(...lows), `${name} low score`);
    }
    assert.ok(
      total.seasonsPlayed >= Math.max(r.seasonsPlayed, p.seasonsPlayed),
      `${name} seasons`
    );
  }
});

test("every season has exactly three bracket weeks", async () => {
  const games = await log();
  const weeksBySeason = new Map<string, Set<number>>();
  for (const game of games.filter(isBracket)) {
    const weeks = weeksBySeason.get(game.season) ?? new Set<number>();
    weeks.add(game.week);
    weeksBySeason.set(game.season, weeks);
  }

  assert.deepEqual([...weeksBySeason.keys()].sort(), [...ARCHIVED_SEASONS]);
  for (const [season, weeks] of weeksBySeason) {
    assert.equal(weeks.size, 3, `${season} bracket weeks`);
  }
});

test("no counting game falls past the last bracket round", async () => {
  const games = await log();
  const lastBracketWeek = new Map<string, number>();
  for (const game of games.filter(isBracket)) {
    lastBracketWeek.set(game.season, Math.max(lastBracketWeek.get(game.season) ?? 0, game.week));
  }

  for (const game of games.filter(isCounting)) {
    assert.ok(
      game.week <= lastBracketWeek.get(game.season)!,
      `${game.season} week ${game.week} is past the bracket and must not count`
    );
  }
});

test("every bracket game carries a round name and no other game does", async () => {
  const games = await log();
  for (const game of games) {
    if (isBracket(game)) assert.ok(game.roundLabel, `${game.season} wk${game.week} round name`);
    else assert.equal(game.roundLabel, null, `${game.season} wk${game.week} must not be named`);
  }

  const names = new Set(games.filter(isBracket).map((g) => g.roundLabel));
  assert.ok(names.has("Championship"));
  assert.ok(names.has("Semifinal"));
  assert.ok(names.has("Playoffs Rd 1"));
});

test("a bye means two bracket weeks that season, not three", async () => {
  const games = await log();
  const weeksPlayed = new Map<string, number>();
  for (const game of games.filter(isBracket)) {
    const key = `${game.season}|${game.governorName}`;
    weeksPlayed.set(key, (weeksPlayed.get(key) ?? 0) + 1);
  }
  assert.ok(
    [...weeksPlayed.values()].some((n) => n === 2),
    "a bye team plays two bracket weeks"
  );
  assert.ok([...weeksPlayed.values()].every((n) => n >= 1 && n <= 3));
});
