import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeasonArchive } from "./archive";
import { archivedSeasons, loadSeasonArchive, resolveArchiveRosters } from "./archive-data";
import { loadPlayers, type PlayerMap } from "./history";
import {
  benchReplacement,
  eligiblePositions,
  hasBenchData,
  lineupFits,
  lineupReplacement,
  replacementLevels,
  seasonMVP,
  starterSlots,
  weekVP,
} from "./mvp";
import { archivedSeasonStandings } from "./season";

async function archive(season: string): Promise<SeasonArchive> {
  const a = await loadSeasonArchive(season);
  assert.ok(a, `no archive for ${season}`);
  return a;
}

/**
 * The 2025 archive with a bench added to every lineup. `twin` picks which
 * starters get an identical bench backup; everyone else has an empty bench.
 */
async function withBench(
  twin: (starterId: string) => boolean
): Promise<{ archive: SeasonArchive; players: PlayerMap }> {
  const base = await archive("2025");
  const players: PlayerMap = { ...(await loadPlayers()) };
  const weeks = base.weeks.map((w) => ({
    ...w,
    matchups: w.matchups.map((m) => {
      const starters = m.starters ?? [];
      const roster = [...starters];
      const playersPoints: Record<string, number> = {};
      starters.forEach((id, i) => {
        if (id === "0") return;
        playersPoints[id] = m.startersPoints?.[i] ?? 0;
        if (!twin(id)) return;
        const backup = `twin-${id}`;
        players[backup] = { n: `Twin of ${id}`, p: players[id]?.p ?? null, t: null };
        roster.push(backup);
        playersPoints[backup] = playersPoints[id];
      });
      // Every lineup needs some bench data for the season to count as having it.
      roster.push("bench-k");
      playersPoints["bench-k"] = 0;
      return { ...m, players: roster, playersPoints };
    }),
  }));
  players["bench-k"] = { n: "Bench kicker", p: "K", t: null };
  return { archive: { ...base, weeks }, players };
}

test("every completed season has a bench, lineup slots and a top ten", async () => {
  const players = await loadPlayers();
  for (const season of archivedSeasons()) {
    const a = await archive(season);
    if (!a.weeks.some((w) => w.played)) continue;
    assert.ok(hasBenchData(a), `${season} has bench scores`);
    assert.equal(starterSlots(a.rosterPositions)?.length, 9, `${season} has nine lineup slots`);
    const { entries } = seasonMVP(a, players);
    assert.equal(entries.length, 10, season);
    for (const e of entries) {
      // Even a starter nobody could cover is measured against a fringe starter, not nothing.
      assert.ok(e.pointsOverBench < e.points, `${season} ${e.playerName}: ${e.pointsOverBench} of ${e.points}`);
    }
  }
});

test("a QB with no playable backup isn't credited with every point he scored", async () => {
  const players = await loadPlayers();
  const find = async (season: string, name: string) =>
    seasonMVP(await archive(season), players, Infinity).entries.find((e) => e.playerName === name);
  // DanK rostered no other QB at all; Matt's bench QBs were backups who scored 0.
  for (const e of [await find("2025", "Drake Maye"), await find("2020", "Tom Brady")]) {
    assert.ok(e);
    assert.ok(e.pointsOverBench < e.points * 0.75, `${e.playerName}: ${e.pointsOverBench} of ${e.points}`);
  }
});

test("weekVP reproduces the standings' VP for every team and week", async () => {
  for (const season of archivedSeasons()) {
    const a = await archive(season);
    const standings = await archivedSeasonStandings(season);
    if (!standings || standings.weeksCompleted === 0) continue;
    const governorToRoster = new Map(
      resolveArchiveRosters(season, a.rosters).map((r) => [r.governorName, r.rosterId])
    );
    for (const week of a.weeks) {
      if (!week.played || week.week > a.regularSeasonWeeks) continue;
      const vp = weekVP(a, week.week, week.matchups, governorToRoster);
      for (const team of standings.teams) {
        const result = team.weeklyResults.find((r) => r.week === week.week);
        if (!result) continue;
        assert.equal(vp.get(team.rosterId), result.vp, `${season} wk${week.week} ${team.governorName}`);
      }
    }
  }
});

test("slot eligibility follows the lineup slot, falling back to the starter's position", () => {
  assert.deepEqual(starterSlots(["QB", "RB", "FLEX", "BN", "BN", "IR"]), ["QB", "RB", "FLEX"]);
  assert.equal(starterSlots(undefined), null);
  assert.ok(eligiblePositions("FLEX", "WR").includes("RB"));
  assert.deepEqual(eligiblePositions("QB", "QB"), ["QB"]);
  assert.deepEqual(eligiblePositions(undefined, "TE"), ["TE"]);
  assert.deepEqual(eligiblePositions(undefined, null), []);
});

test("the bench replacement is the best eligible bench player, or nothing", () => {
  const players: PlayerMap = {
    a: { n: "A", p: "WR", t: null },
    b: { n: "B", p: "RB", t: null },
    c: { n: "C", p: "WR", t: null },
    q: { n: "Q", p: "QB", t: null },
  };
  const matchup = {
    starters: ["a"],
    players: ["a", "b", "c", "q"],
    playersPoints: { a: 20, b: 15, c: 9, q: 30 },
  };
  // A QB on the bench can't fill a WR slot, however many he scored.
  assert.deepEqual(benchReplacement(matchup, ["WR"], players), { playerId: "c", points: 9 });
  assert.deepEqual(benchReplacement(matchup, ["RB", "WR", "TE"], players), { playerId: "b", points: 15 });
  assert.deepEqual(benchReplacement(matchup, ["TE"], players), { playerId: null, points: 0 });
});

test("lineupFits finds an arrangement when one exists", () => {
  assert.equal(lineupFits(["QB", "QB", "RB"], ["QB", "RB", "SUPER_FLEX"]), true);
  // The first QB tried takes the superflex; the matching has to move him.
  assert.equal(lineupFits(["QB", "WR", "QB"], ["SUPER_FLEX", "WR", "QB"]), true);
  assert.equal(lineupFits(["QB", "QB", "QB"], ["QB", "RB", "SUPER_FLEX"]), false);
  assert.equal(lineupFits(["TE", "TE"], ["TE", "FLEX"]), true);
  assert.equal(lineupFits(["WR"], ["QB"]), false);
});

test("a starter's replacement can come from any position the reshuffled lineup can take", () => {
  const players: PlayerMap = {
    burrow: { n: "Joe Burrow", p: "QB", t: null },
    qb2: { n: "Other QB", p: "QB", t: null },
    rb1: { n: "RB1", p: "RB", t: null },
    wr1: { n: "WR1", p: "WR", t: null },
    te: { n: "Bench TE", p: "TE", t: null },
    rb: { n: "Bench RB", p: "RB", t: null },
    k: { n: "Bench K", p: "K", t: null },
  };
  const slots = ["QB", "RB", "WR", "SUPER_FLEX"];
  const matchup = {
    starters: ["burrow", "rb1", "wr1", "qb2"],
    players: ["burrow", "rb1", "wr1", "qb2", "te", "rb", "k"],
    playersPoints: { burrow: 30, rb1: 10, wr1: 10, qb2: 18, te: 11, rb: 9, k: 40 },
  };
  // No QB on the bench: the other QB slides into the QB slot and the best
  // bench flex player takes the superflex. The kicker fits nowhere.
  assert.deepEqual(lineupReplacement(matchup, 0, slots, players), { playerId: "te", points: 11 });
  assert.deepEqual(lineupReplacement(matchup, 3, slots, players), { playerId: "te", points: 11 });
  // The RB slot only takes a running back, and nobody else can move into it.
  assert.deepEqual(lineupReplacement(matchup, 1, slots, players), { playerId: "rb", points: 9 });
  assert.deepEqual(
    lineupReplacement({ ...matchup, players: matchup.starters }, 0, slots, players),
    { playerId: null, points: 0 }
  );
});

test("a starter of unknown position holds his own slot", () => {
  const players: PlayerMap = {
    q: { n: "Q", p: "QB", t: null },
    r: { n: "R", p: "RB", t: null },
  };
  const slots = ["QB", "SUPER_FLEX"];
  // "mystery" stays where he played. With him in the QB slot, the RB can cover
  // q's superflex; with him in the superflex, q's QB slot has no taker.
  const matchup = { starters: ["mystery", "q"], players: ["mystery", "q", "r"], playersPoints: { r: 7 } };
  assert.deepEqual(lineupReplacement(matchup, 1, slots, players), { playerId: "r", points: 7 });
  assert.deepEqual(
    lineupReplacement(matchup, 1, ["SUPER_FLEX", "QB"], players),
    { playerId: null, points: 0 }
  );
});

test("with an empty bench, each start is measured against the season's replacement level", async () => {
  const { archive: a, players } = await withBench(() => false);
  const levels = replacementLevels(a, players);
  assert.ok((levels.get("QB") ?? 0) > (levels.get("TE") ?? 0), "a fringe QB outscores a fringe TE");

  const mvp = seasonMVP(a, players, Infinity);
  assert.equal(mvp.hasBench, true);
  for (const e of mvp.entries) {
    assert.ok(Math.abs(e.vpAdded) <= 3 * e.starts, `${e.playerName}: ${e.vpAdded} VP in ${e.starts}`);
    const level = levels.get(e.position ?? "") ?? 0;
    // Only the 0-point bench kicker is on the bench, so every stand-in is the floor.
    assert.ok(Math.abs(e.pointsOverBench - (e.points - level * e.starts)) < 0.01, e.playerName);
  }
  assert.equal(new Set(mvp.entries.map((e) => e.playerId)).size, mvp.entries.length);
  assert.ok(mvp.entries[0].vpAdded > 0);
});

test("replacement level is the 20th percentile of the season's starts at a position", () => {
  const archive = {
    regularSeasonWeeks: 14,
    weeks: [
      {
        week: 1,
        played: true,
        matchups: [
          { rosterId: 1, matchupId: 1, points: 0, starters: ["a", "b", "c"], startersPoints: [10, 20, 30] },
          { rosterId: 2, matchupId: 1, points: 0, starters: ["d", "e", "f"], startersPoints: [40, 50, 0] },
        ],
      },
    ],
  } as unknown as SeasonArchive;
  const players: PlayerMap = Object.fromEntries(
    ["a", "b", "c", "d", "e", "f"].map((id) => [id, { n: id, p: id === "e" ? "TE" : "QB", t: null }])
  );
  const levels = replacementLevels(archive, players);
  // QB starts 10, 20, 30, 40 and a 0 that doesn't count: the 20th percentile
  // lands on the lowest that scored.
  assert.equal(levels.get("QB"), 10);
  assert.equal(levels.get("TE"), 50);
});

test("a stud with an identical stud behind him adds nothing", async () => {
  const thin = await withBench(() => false);
  const top = seasonMVP(thin.archive, thin.players).entries[0];
  assert.ok(top.vpAdded > 0);

  const deep = await withBench((id) => id === top.playerId);
  const entry = seasonMVP(deep.archive, deep.players, Infinity).entries.find(
    (e) => e.playerId === top.playerId
  );
  assert.ok(entry);
  // Never more than nothing: the identical backup covers every week, and in a
  // week he scores under replacement level a pickup would have done better.
  assert.ok(entry.vpAdded <= 0, `${entry.vpAdded}`);
  assert.ok(entry.pointsOverBench <= 0, `${entry.pointsOverBench}`);
  assert.equal(entry.playoffWinsSwung, 0);
});

test("the default list is a top ten, ranked on VP added then points over bench", async () => {
  const { archive: a, players } = await withBench(() => false);
  const { entries } = seasonMVP(a, players);
  assert.equal(entries.length, 10);
  entries.forEach((e, i) => {
    assert.equal(e.rank, i + 1);
    if (i === 0) return;
    const prev = entries[i - 1];
    assert.ok(
      prev.vpAdded > e.vpAdded ||
        (prev.vpAdded === e.vpAdded && prev.pointsOverBench >= e.pointsOverBench)
    );
  });
});
