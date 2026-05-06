import { NextRequest, NextResponse } from "next/server";
import { getLeague, getRosters, getUsers, getMatchups } from "@/lib/sleeper";
import { calculateWeekVPs, aggregateStandings } from "@/lib/vp";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leagueId: string; season: string }> }
) {
  const { leagueId, season } = await params;

  try {
    const [league, rosters, users] = await Promise.all([
      getLeague(leagueId),
      getRosters(leagueId),
      getUsers(leagueId),
    ]);

    const userMap = new Map(users.map((u) => [u.user_id, u]));
    const rosterOwnerMap = new Map(rosters.map((r) => [r.roster_id, r.owner_id]));

    const REGULAR_SEASON_WEEKS = 14;
    const weekPromises = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) =>
      getMatchups(leagueId, i + 1).catch(() => [])
    );
    const allWeekMatchups = await Promise.all(weekPromises);

    const completedWeeks = allWeekMatchups
      .map((week, i) => ({ week, weekNum: i + 1 }))
      .filter(({ week }) => week.length > 0 && week.some((m) => m.points > 0));

    const weeklyVPs = completedWeeks.map(({ week, weekNum }) =>
      calculateWeekVPs(week, rosters.length, weekNum, season)
    );

    const standings = aggregateStandings(weeklyVPs);

    const standingsArray = Array.from(standings.values())
      .map((s) => {
        const ownerId = rosterOwnerMap.get(s.rosterId);
        const user = ownerId ? userMap.get(ownerId) : undefined;
        return {
          rosterId: s.rosterId,
          userId: ownerId,
          displayName: user?.display_name ?? user?.username ?? `Team ${s.rosterId}`,
          avatar: user?.avatar ?? null,
          totalVP: s.totalVP,
          totalPoints: Math.round(s.totalPoints * 100) / 100,
          wins: s.wins,
          losses: s.losses,
          weeklyResults: s.weeklyResults,
        };
      })
      .sort((a, b) => b.totalVP - a.totalVP || b.totalPoints - a.totalPoints);

    return NextResponse.json({
      league,
      season,
      weeksCompleted: completedWeeks.length,
      standings: standingsArray,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch league data" }, { status: 500 });
  }
}
