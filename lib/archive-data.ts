import { resolveGovernor } from "./governors";
import type { ArchiveRoster, SeasonArchive } from "./archive";
import type { SeasonInput, SeasonRosterInfo } from "./season";
import type { SleeperMatchup } from "./sleeper";

// An explicit map rather than a template-literal dynamic import: bundlers
// resolve these statically, so the archive is traced into the build without
// any filesystem access at runtime.
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  "2020": () => import("../data/archive/2020.json"),
  "2021": () => import("../data/archive/2021.json"),
  "2022": () => import("../data/archive/2022.json"),
  "2023": () => import("../data/archive/2023.json"),
  "2024": () => import("../data/archive/2024.json"),
  "2025": () => import("../data/archive/2025.json"),
  "2026": () => import("../data/archive/2026.json"),
};

export function hasArchive(season: string): boolean {
  return season in LOADERS;
}

export function archivedSeasons(): string[] {
  return Object.keys(LOADERS).sort();
}

export async function loadSeasonArchive(season: string): Promise<SeasonArchive | null> {
  const loader = LOADERS[season];
  if (!loader) return null;
  const mod = await loader();
  return mod.default as SeasonArchive;
}

/**
 * Governor identity is resolved when the archive is read, never stored in it.
 * A roster that could not be mapped when the snapshot was taken should start
 * resolving the moment its alias is added, without re-fetching anything.
 */
export function resolveArchiveRosters(
  season: string,
  rosters: ArchiveRoster[]
): SeasonRosterInfo[] {
  return rosters.map((roster) => {
    const resolution = resolveGovernor(season, {
      rosterId: roster.rosterId,
      username: roster.username,
      displayName: roster.displayName,
      teamName: roster.teamName,
    });
    return {
      rosterId: roster.rosterId,
      ownerId: roster.ownerId ?? undefined,
      governorName: resolution.name,
      resolved: resolution.resolved,
      avatar: roster.avatar,
    };
  });
}

function toSleeperMatchup(m: SeasonArchive["weeks"][number]["matchups"][number]): SleeperMatchup {
  return {
    roster_id: m.rosterId,
    matchup_id: m.matchupId,
    points: m.points,
    starters: m.starters ?? [],
    starters_points: m.startersPoints ?? [],
    players: m.players ?? [],
    players_points: m.playersPoints ?? {},
  };
}

export function archiveToSeasonInput(archive: SeasonArchive): SeasonInput {
  return {
    season: archive.season,
    leagueId: archive.leagueId,
    leagueName: archive.leagueName,
    rosters: resolveArchiveRosters(archive.season, archive.rosters),
    weeks: archive.weeks
      .filter((w) => w.played && w.week <= archive.regularSeasonWeeks)
      .map((w) => ({ week: w.week, matchups: w.matchups.map(toSleeperMatchup) })),
  };
}

/** Points by roster id for each playoff round, for bracket reconstruction. */
export function archivePlayoffPoints(archive: SeasonArchive): Map<number, number>[] {
  const maxRound = archive.winnersBracket.reduce((max, m) => Math.max(max, m.r), 0);
  return Array.from({ length: maxRound }, (_, i) => {
    const week = archive.playoffWeekStart + i;
    const entry = archive.weeks.find((w) => w.week === week);
    return new Map((entry?.matchups ?? []).map((m) => [m.rosterId, m.points]));
  });
}

/**
 * Every player id the league has ever used — started, drafted or traded.
 *
 * Used to trim Sleeper's 5-10 MB player dictionary down to the few thousand
 * entries this league actually needs before committing it.
 */
export async function collectPlayerIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const season of archivedSeasons()) {
    const archive = await loadSeasonArchive(season);
    if (!archive) continue;
    for (const week of archive.weeks) {
      for (const matchup of week.matchups) {
        for (const id of matchup.starters ?? []) ids.add(id);
        for (const id of matchup.players ?? []) ids.add(id);
        for (const id of Object.keys(matchup.playersPoints ?? {})) ids.add(id);
      }
    }
    for (const pick of archive.draft?.picks ?? []) ids.add(pick.player_id);
    for (const transaction of archive.transactions) {
      for (const move of transaction.playerMoves) ids.add(move.playerId);
    }
  }
  // Sleeper uses "0" as an empty starting slot.
  ids.delete("0");
  return [...ids].sort();
}
