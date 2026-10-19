import assert from "node:assert/strict";
import { test } from "node:test";
import { CURRENT_SEASON } from "./config";
import { loadSeasonArchive } from "./archive-data";
import { buildGameLog } from "./history";
import { settledOnly } from "./live-archive";
import type { SeasonArchive } from "./archive";
import type { SleeperNflState } from "./sleeper";

/**
 * The record book only takes a week once it is final: the week the NFL is on
 * must drop out of a live pull of the season in progress.
 */

function nflState(week: number): SleeperNflState {
  return { season: CURRENT_SEASON, season_type: "regular", week, display_week: week };
}

/** The committed current-season archive with weeks 1-3 given scores. */
async function liveArchive(): Promise<SeasonArchive> {
  const archive = await loadSeasonArchive(CURRENT_SEASON);
  assert.ok(archive);
  return {
    ...archive,
    weeks: archive.weeks.map((w) =>
      w.week <= 3
        ? {
            ...w,
            played: true,
            matchups: archive.rosters.map((r, i) => ({
              rosterId: r.rosterId,
              matchupId: Math.floor(i / 2) + 1,
              points: 100 + i,
            })),
          }
        : w
    ),
  };
}

test("the week the NFL is on is left out until it is final", async () => {
  const settled = settledOnly(await liveArchive(), nflState(3));
  const played = settled.weeks.filter((w) => w.played).map((w) => w.week);
  assert.deepEqual(played, [1, 2]);

  const weeks = new Set((await buildGameLog([settled])).map((g) => g.week));
  assert.deepEqual([...weeks].sort(), [1, 2]);
});

test("once the NFL moves on, the week joins the log", async () => {
  const settled = settledOnly(await liveArchive(), nflState(4));
  assert.deepEqual(
    settled.weeks.filter((w) => w.played).map((w) => w.week),
    [1, 2, 3]
  );
});
