import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeasonArchive } from "./archive";
import { archivedSeasons, loadSeasonArchive, resolveArchiveRosters } from "./archive-data";
import { loadPlayers, type PlayerMap } from "./history";
import {
  benchReplacement,
  eligiblePositions,
  hasBenchData,
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

test("the committed archives carry no bench, so no MVP is invented", async () => {
  const players = await loadPlayers();
  for (const season of archivedSeasons()) {
    const a = await archive(season);
    if (!a.weeks.some((w) => w.played) || hasBenchData(a)) continue;
    assert.deepEqual(seasonMVP(a, players), { season, hasBench: false, entries: [] });
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

test("with an empty bench, every start is worth between 0 and 3 VP", async () => {
  const { archive: a, players } = await withBench(() => false);
  const mvp = seasonMVP(a, players, Infinity);
  assert.equal(mvp.hasBench, true);
  for (const e of mvp.entries) {
    assert.ok(e.vpAdded >= 0 && e.vpAdded <= 3 * e.starts, `${e.playerName}: ${e.vpAdded} VP in ${e.starts}`);
    assert.equal(e.pointsOverBench, e.points);
  }
  assert.equal(mvp.entries.length > 10, true);
  assert.equal(new Set(mvp.entries.map((e) => e.playerId)).size, mvp.entries.length);
  assert.ok(mvp.entries[0].vpAdded > 0);
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
  assert.equal(entry.vpAdded, 0);
  assert.equal(entry.pointsOverBench, 0);
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
