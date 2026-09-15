import { Suspense } from "react";
import { fetchScopedGovernorStats } from "@/lib/historical";
import HistoricalStats from "@/components/HistoricalStats";
import Spinner from "@/components/Spinner";

export const metadata = { title: "All-time stats · FALE" };

async function Stats() {
  // All three scopes together are about 6 KB, so the filter is instant rather
  // than a round trip.
  const stats = await fetchScopedGovernorStats();
  return <HistoricalStats stats={stats} />;
}

export default function HistoryPage() {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        All-time scoring, split by regular season and playoffs. Click any column header to
        sort.
      </p>
      <Suspense fallback={<Spinner />}>
        <Stats />
      </Suspense>
    </div>
  );
}
