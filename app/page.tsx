import { Suspense } from "react";
import { LEAGUE_IDS, CURRENT_SEASON, SEASONS } from "@/lib/config";
import { getLeague, getRosters, getUsers, getMatchups } from "@/lib/sleeper";
import { calculateWeekVPs, aggregateStandings } from "@/lib/vp";
import SeasonSelector from "@/components/SeasonSelector";
import Dashboard from "@/components/Dashboard";

interface PageProps {
  searchParams: Promise<{ season?: string }>;
}

async function LeagueData({ season }: { season: string }) {
  const leagueId = LEAGUE_IDS[season];

  if (!leagueId) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 p-6 text-center">
        <p className="text-yellow-800 dark:text-yellow-200 font-medium">
          No league ID configured for {season}.
        </p>
        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
          Add{" "}
          <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">
            NEXT_PUBLIC_LEAGUE_ID_{season}
          </code>{" "}
          to your environment variables.
        </p>
      </div>
    );
  }

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

    const completedWeeks = allWeekMatchups.filter(
      (week) => week.length > 0 && week.some((m) => m.points > 0)
    );

    const weeklyVPs = completedWeeks.map((week) => calculateWeekVPs(week, rosters.length));
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

    return (
      <Dashboard
        standings={standingsArray}
        weeksCompleted={completedWeeks.length}
        season={season}
        leagueName={league.name}
      />
    );
  } catch {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-6 text-center">
        <p className="text-red-700 dark:text-red-300">
          Failed to load league data. Check your league ID and try again.
        </p>
      </div>
    );
  }
}

export default async function Home({ searchParams }: PageProps) {
  const { season: seasonParam } = await searchParams;
  const season =
    seasonParam && LEAGUE_IDS[seasonParam] !== undefined ? seasonParam : CURRENT_SEASON;
  const availableSeasons = SEASONS.length > 0 ? SEASONS : [CURRENT_SEASON];

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              🏈 Fantasy League Dashboard
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Victory Points standings tracker
            </p>
          </div>
          <SeasonSelector seasons={availableSeasons} current={season} />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
            </div>
          }
        >
          <LeagueData season={season} />
        </Suspense>
      </div>
    </main>
  );
}
