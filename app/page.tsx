import { Suspense } from "react";
import { CURRENT_SEASON, LEAGUE_IDS } from "@/lib/config";
import { fetchSeasonStandings } from "@/lib/season";
import Dashboard from "@/components/Dashboard";
import Spinner from "@/components/Spinner";

interface PageProps {
  searchParams: Promise<{ season?: string }>;
}

async function LeagueData({ season }: { season: string }) {
  if (!LEAGUE_IDS[season]) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 p-6 text-center">
        <p className="text-yellow-800 dark:text-yellow-200 font-medium">
          No league ID configured for {season}.
        </p>
        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
          Add it to <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">LEAGUE_IDS</code>{" "}
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

export default async function Home({ searchParams }: PageProps) {
  const { season: seasonParam } = await searchParams;
  const season =
    seasonParam && LEAGUE_IDS[seasonParam] !== undefined ? seasonParam : CURRENT_SEASON;

  return (
    <Suspense fallback={<Spinner />}>
      <LeagueData season={season} />
    </Suspense>
  );
}
