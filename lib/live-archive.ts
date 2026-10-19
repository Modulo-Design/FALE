import { buildSeasonArchive, type SeasonArchive } from "./archive";
import { committedArchives } from "./archive-data";
import { CURRENT_SEASON } from "./config";
import { pendingWeeks } from "./season";
import { getNflState, type SleeperNflState } from "./sleeper";

/**
 * The committed archive with the season in progress swapped for a fresh pull.
 *
 * The committed snapshot of `CURRENT_SEASON` is taken once and never refreshed
 * until the season is over, so the trade tracker and the record book would
 * otherwise freeze on whatever it held. Every other season still comes from
 * disk, and if Sleeper cannot be reached the committed snapshot stands in.
 */
export async function loadLiveArchives(): Promise<SeasonArchive[]> {
  const [committed, current] = await Promise.all([committedArchives(), currentSeasonArchive()]);
  return committed.map((a) => (a.season === CURRENT_SEASON && current ? current : a));
}

async function currentSeasonArchive(): Promise<SeasonArchive | null> {
  try {
    const [archive, nflState] = await Promise.all([
      // "deep" carries the lineups the positional records are built from.
      buildSeasonArchive(CURRENT_SEASON, "deep"),
      getNflState().catch(() => null),
    ]);
    return settledOnly(archive, nflState);
  } catch {
    return null;
  }
}

/**
 * Unmark the week still being played, so a half-finished Sunday never becomes
 * somebody's career low. Uses the same `pendingWeeks` rule as the dashboard.
 */
export function settledOnly(
  archive: SeasonArchive,
  nflState: SleeperNflState | null
): SeasonArchive {
  const played = archive.weeks
    .filter((w) => w.played)
    .map((w) => ({
      week: w.week,
      // pendingWeeks only reads the roster count and points of each matchup.
      matchups: w.matchups.map((m) => ({
        roster_id: m.rosterId,
        matchup_id: m.matchupId,
        points: m.points,
        starters: [],
        starters_points: [],
        players: [],
        players_points: {},
      })),
    }));
  const pending = new Set(
    pendingWeeks(archive.season, played, { rosterCount: archive.rosters.length, nflState })
  );
  if (pending.size === 0) return archive;
  return {
    ...archive,
    weeks: archive.weeks.map((w) => (pending.has(w.week) ? { ...w, played: false } : w)),
  };
}
