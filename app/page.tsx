import { Suspense } from "react";
import { LEAGUE_IDS, CURRENT_SEASON, SEASONS } from "@/lib/config";
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

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/league/${leagueId}/season/${season}`, {
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-6 text-center">
        <p className="text-red-700 dark:text-red-300">
          Failed to load league data. Check your league ID and try again.
        </p>
      </div>
    );
  }

  const data = await res.json();

  return (
    <Dashboard
      standings={data.standings}
      weeksCompleted={data.weeksCompleted}
      season={season}
      leagueName={data.league.name}
    />
  );
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
