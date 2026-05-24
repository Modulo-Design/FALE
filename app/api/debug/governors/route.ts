import { NextResponse } from "next/server";
import { LEAGUE_IDS, GOVERNOR_NAMES } from "@/lib/config";
import { getRosters, getUsers, getMatchups } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

interface SeasonReport {
  unmappedRosters: { rosterId: number; sleeperName: string; displayName: string }[];
  zeroPointWeeks: { week: number; governorName: string; rosterId: number }[];
  governorWeekCounts: Record<string, number>;
  error?: string;
}

export async function GET() {
  const seasons = Object.keys(LEAGUE_IDS).sort();
  const report: Record<string, SeasonReport> = {};

  await Promise.all(
    seasons.map(async (season) => {
      const leagueId = LEAGUE_IDS[season];
      try {
        const [rosters, users] = await Promise.all([
          getRosters(leagueId),
          getUsers(leagueId),
        ]);

        const userMap = new Map(users.map((u) => [u.user_id, u]));
        const unmappedRosters: SeasonReport["unmappedRosters"] = [];

        const rosterGovernor = new Map(
          rosters.map((r) => {
            const user = r.owner_id ? userMap.get(r.owner_id) : undefined;
            const sleeperName = (user?.username ?? user?.display_name ?? "").toLowerCase();
            const mapped = GOVERNOR_NAMES[sleeperName];
            if (!mapped) {
              unmappedRosters.push({
                rosterId: r.roster_id,
                sleeperName,
                displayName: user?.display_name ?? `Team ${r.roster_id}`,
              });
            }
            return [r.roster_id, mapped ?? user?.display_name ?? `Team ${r.roster_id}`];
          })
        );

        const weekMatchups = await Promise.all(
          Array.from({ length: 14 }, (_, i) =>
            getMatchups(leagueId, i + 1).catch(() => [])
          )
        );

        const zeroPointWeeks: SeasonReport["zeroPointWeeks"] = [];
        const governorWeekCounts: Record<string, number> = {};

        for (let i = 0; i < weekMatchups.length; i++) {
          const week = weekMatchups[i];
          const weekNum = i + 1;
          if (week.length === 0 || !week.some((m) => m.points > 0)) continue;

          for (const matchup of week) {
            const governorName = rosterGovernor.get(matchup.roster_id) ?? `Unknown_${matchup.roster_id}`;
            if (matchup.points === 0) {
              zeroPointWeeks.push({ week: weekNum, governorName, rosterId: matchup.roster_id });
            } else {
              governorWeekCounts[governorName] = (governorWeekCounts[governorName] ?? 0) + 1;
            }
          }
        }

        report[season] = { unmappedRosters, zeroPointWeeks, governorWeekCounts };
      } catch (err) {
        report[season] = {
          unmappedRosters: [],
          zeroPointWeeks: [],
          governorWeekCounts: {},
          error: String(err),
        };
      }
    })
  );

  // Cross-season totals per governor name
  const totals: Record<string, number> = {};
  for (const { governorWeekCounts } of Object.values(report)) {
    for (const [name, count] of Object.entries(governorWeekCounts)) {
      if (!name.startsWith("_")) {
        totals[name] = (totals[name] ?? 0) + count;
      }
    }
  }

  return NextResponse.json({ totals, report }, { status: 200 });
}
