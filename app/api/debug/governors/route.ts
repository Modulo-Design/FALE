import { NextResponse } from "next/server";
import { LEAGUE_IDS, regularSeasonWeeks } from "@/lib/config";
import { findUnmappedRosters, governorNames } from "@/lib/governors";
import { getRosters, getUsers } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

/**
 * Governor-resolution report.
 *
 * Any roster listed under `unmapped` is a person the registry does not know,
 * and will render under a placeholder name. Historically the app fell back to
 * the raw Sleeper display name instead, which quietly invented governors -- so
 * this endpoint is the tool to run after adding anyone to the league, and the
 * check that must come back empty before trusting historical numbers.
 */
export async function GET() {
  const seasons = Object.keys(LEAGUE_IDS).sort();

  const results = await Promise.all(
    seasons.map(async (season) => {
      const leagueId = LEAGUE_IDS[season];
      try {
        const [rosters, users] = await Promise.all([
          getRosters(leagueId),
          getUsers(leagueId),
        ]);
        const userMap = new Map(users.map((u) => [u.user_id, u]));
        const resolvable = rosters.map((roster) => {
          const user = roster.owner_id ? userMap.get(roster.owner_id) : undefined;
          return {
            rosterId: roster.roster_id,
            username: user?.username ?? null,
            displayName: user?.display_name ?? null,
            teamName: user?.metadata?.team_name ?? null,
          };
        });

        return {
          season,
          leagueId,
          regularSeasonWeeks: regularSeasonWeeks(season),
          rosterCount: rosters.length,
          unmapped: findUnmappedRosters(season, resolvable),
        };
      } catch (err) {
        return { season, leagueId, error: (err as Error).message };
      }
    })
  );

  const unmappedTotal = results.reduce(
    (sum, r) => sum + (r.unmapped?.length ?? 0),
    0
  );

  return NextResponse.json({
    ok: unmappedTotal === 0,
    unmappedTotal,
    knownGovernors: governorNames().sort(),
    seasons: results,
  });
}
