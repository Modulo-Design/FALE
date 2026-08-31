import Link from "next/link";
import { Suspense } from "react";
import { LEAGUE_IDS, CURRENT_SEASON, SEASONS } from "@/lib/config";
import { fetchHistoricalStats } from "@/lib/historical";
import { fetchSeasonStandings } from "@/lib/season";
import SeasonSelector from "@/components/SeasonSelector";
import Dashboard from "@/components/Dashboard";
import HistoricalStats from "@/components/HistoricalStats";

interface PageProps {
  searchParams: Promise<{ season?: string; view?: string }>;
}

async function LeagueData({ season }: { season: string }) {
  if (!LEAGUE_IDS[season]) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 p-6 text-center">
        <p className="text-yellow-800 dark:text-yellow-200 font-medium">
          No league ID configured for {season}.
        </p>
        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
          Add it to{" "}
          <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">LEAGUE_IDS</code>{" "}
          in <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">lib/config.ts</code>.
        </p>
      </div>
    );
  }

  try {
    const data = await fetchSeasonStandings(season);
    return <Dashboard data={data} />;
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
