import Link from "next/link";
import { Suspense } from "react";
import { LEAGUE_IDS, CURRENT_SEASON, SEASONS, GOVERNOR_NAMES, VP_OVERRIDES } from "@/lib/config";
import { getLeague, getRosters, getUsers, getMatchups } from "@/lib/sleeper";
import { calculateWeekVPs, applyVPOverrides, aggregateStandings } from "@/lib/vp";
import { fetchHistoricalStats } from "@/lib/historical";
import SeasonSelector from "@/components/SeasonSelector";
import Dashboard from "@/components/Dashboard";
import HistoricalStats from "@/components/HistoricalStats";

interface PageProps {
  searchParams: Promise<{ season?: string; view?: string }>;
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
    const governorToRoster = new Map(
      rosters.map((r) => {
        const user = r.owner_id ? userMap.get(r.owner_id) : undefined;
        const sleeperName = (user?.username ?? user?.display_name ?? "").toLowerCase();
        const governorName = GOVERNOR_NAMES[sleeperName] ?? user?.display_name ?? `Team ${r.roster_id}`;
        return [governorName, r.roster_id];
      })
    );

    const REGULAR_SEASON_WEEKS = 14;
    const weekPromises = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) =>
      getMatchups(leagueId, i + 1).catch(() => [])
    );
    const allWeekMatchups = await Promise.all(weekPromises);

    const completedWeeks = allWeekMatchups
      .map((week, i) => ({ week, weekNum: i + 1 }))
      .filter(({ week }) => week.length > 0 && week.some((m) => m.points > 0));

    const weeklyVPs = completedWeeks.map(({ week, weekNum }) => {
      const raw = calculateWeekVPs(week, rosters.length, weekNum, season);
      const adjustments = VP_OVERRIDES
        .filter((o) => o.season === season && o.week === weekNum)
        .map((o) => ({ rosterId: governorToRoster.get(o.governorName) ?? -1, vpDelta: o.vpDelta }))
        .filter((a) => a.rosterId !== -1);
      return applyVPOverrides(raw, adjustments);
    });
    const standings = aggregateStandings(weeklyVPs);

    const standingsArray = Array.from(standings.values())
      .map((s) => {
        const ownerId = rosterOwnerMap.get(s.rosterId);
        const user = ownerId ? userMap.get(ownerId) : undefined;
        const sleeperName = (user?.username ?? user?.display_name ?? "").toLowerCase();
        const governorName = GOVERNOR_NAMES[sleeperName];
        return {
          rosterId: s.rosterId,
          userId: ownerId,
          displayName: governorName ?? user?.display_name ?? user?.username ?? `Team ${s.rosterId}`,
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

async function HistoricalDataLoader() {
  const stats = await fetchHistoricalStats();
  return <HistoricalStats stats={stats} />;
}

export default async function Home({ searchParams }: PageProps) {
  const { season: seasonParam, view } = await searchParams;
  const season =
    seasonParam && LEAGUE_IDS[seasonParam] !== undefined ? seasonParam : CURRENT_SEASON;
  const availableSeasons = SEASONS.length > 0 ? SEASONS : [CURRENT_SEASON];
  const historicalActive = view === "historical";

  const spinner = (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              <Link
                href={`/?season=${CURRENT_SEASON}`}
                className="hover:text-green-600 dark:hover:text-green-400 transition-colors"
              >
                🏈 FALE League Dashboard
              </Link>
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Victory Points standings tracker
            </p>
          </div>
          <SeasonSelector
            seasons={availableSeasons}
            current={season}
            historicalActive={historicalActive}
          />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {historicalActive ? (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              All-time scoring stats across every regular season week. Click any column header to sort.
            </p>
            <Suspense fallback={spinner}>
              <HistoricalDataLoader />
            </Suspense>
          </div>
        ) : (
          <Suspense fallback={spinner}>
            <LeagueData season={season} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
