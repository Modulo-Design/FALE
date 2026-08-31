// Governor identity.
//
// A "governor" is a person, not a Sleeper account. Across six seasons people
// have changed usernames, run second accounts, left the league and joined it,
// so a flat username -> name map cannot express the roster. Every alias below
// is matched lowercased against a roster's Sleeper username, display name, and
// team name, in that order.
//
// Resolution failure is dangerous rather than cosmetic: the old code fell back
// to the raw Sleeper display_name, which is how the team name "TurtMoans"
// became a governor in its own right. `resolveGovernor` therefore reports
// whether it actually matched, and CI fails on any unresolved roster.

export interface Governor {
  /** Canonical display name. Must match the league spreadsheet exactly. */
  name: string;
  /** Lowercased Sleeper usernames, display names and team names. */
  aliases: string[];
  /** First and last season played, inclusive. Omit for current governors. */
  firstSeason?: string;
  lastSeason?: string;
  note?: string;
}

export const GOVERNORS: Governor[] = [
  { name: "Ben", aliases: ["bbakk", "mittens7"] },
  { name: "Brent", aliases: ["gorter33"] },
  { name: "Chris", aliases: ["saltyminnesotan"] },
  { name: "DanK", aliases: ["dhkrause"] },
  { name: "DanP", aliases: ["prostrollod89"] },
  { name: "Eli", aliases: ["soloeli"] },
  { name: "Jeremy", aliases: ["jdub21"] },
  { name: "Johnathan", aliases: ["johnathan"] },
  { name: "Knute", aliases: ["koldre"] },
  { name: "Mark", aliases: ["fierst", "starzofthenorth"] },
  { name: "Matt", aliases: ["loondog"] },
  {
    name: "Mike",
    // "turtmoans" is Mike's team name / second account. Before this entry the
    // app displayed him as "TurtMoans" via the raw display_name fallback.
    aliases: ["yank4225", "turtmoans"],
  },
  { name: "Peter", aliases: ["pb4kk"] },
  { name: "Gunnar", aliases: ["goldre15"] },

  // Departed governors, replaced by Mike and Gunnar for 2026. Sleeper drops the
  // username once an account leaves a league, so these two resolve on display
  // name only -- which is exactly why they never mapped before.
  { name: "Josh", aliases: ["jmignanelli"], lastSeason: "2025" },
  { name: "Sam", aliases: ["samdahl3"], lastSeason: "2025" },
];

/**
 * Last-resort mapping for rosters that cannot be resolved by alias at all --
 * abandoned teams with no owner_id, or a roster co-owned mid-season.
 * Keyed by season, then by roster id.
 */
export const ROSTER_OVERRIDES: Record<string, Record<number, string>> = {};

const ALIAS_TO_NAME: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const governor of GOVERNORS) {
    for (const alias of governor.aliases) {
      const key = alias.toLowerCase();
      const existing = map.get(key);
      if (existing && existing !== governor.name) {
        throw new Error(
          `Governor alias "${alias}" is claimed by both ${existing} and ${governor.name}`
        );
      }
      map.set(key, governor.name);
    }
  }
  return map;
})();

export const GOVERNOR_NAMES: Record<string, string> = Object.fromEntries(ALIAS_TO_NAME);

export interface ResolvableRoster {
  rosterId: number;
  username?: string | null;
  displayName?: string | null;
  teamName?: string | null;
}

export interface ResolvedGovernor {
  name: string;
  resolved: boolean;
}

/**
 * Map a Sleeper roster to a canonical governor name.
 *
 * An unresolved roster returns `resolved: false` and a deliberately ugly name,
 * so it shows up loudly in the UI and in the audit rather than masquerading as
 * a real governor.
 */
export function resolveGovernor(season: string, roster: ResolvableRoster): ResolvedGovernor {
  const override = ROSTER_OVERRIDES[season]?.[roster.rosterId];
  if (override) return { name: override, resolved: true };

  for (const candidate of [roster.username, roster.displayName, roster.teamName]) {
    if (!candidate) continue;
    const name = ALIAS_TO_NAME.get(candidate.toLowerCase());
    if (name) return { name, resolved: true };
  }

  const fallback = roster.displayName ?? roster.username ?? `Roster ${roster.rosterId}`;
  return { name: `Unmapped: ${fallback}`, resolved: false };
}

export function isKnownGovernor(name: string): boolean {
  return GOVERNORS.some((g) => g.name === name);
}

export function governorNames(): string[] {
  return GOVERNORS.map((g) => g.name);
}

/** Rosters in a season that no alias matched. Should always be empty. */
export function findUnmappedRosters(
  season: string,
  rosters: ResolvableRoster[]
): { season: string; rosterId: number; username: string | null; displayName: string | null; teamName: string | null }[] {
  return rosters
    .filter((roster) => !resolveGovernor(season, roster).resolved)
    .map((roster) => ({
      season,
      rosterId: roster.rosterId,
      username: roster.username ?? null,
      displayName: roster.displayName ?? null,
      teamName: roster.teamName ?? null,
    }));
}
