import { Suspense } from "react";
import { fetchHistoricalStats } from "@/lib/historical";
import HistoricalStats from "@/components/HistoricalStats";
import Spinner from "@/components/Spinner";

export const metadata = { title: "All-time stats · FALE" };

async function Stats() {
  const stats = await fetchHistoricalStats();
  return <HistoricalStats stats={stats} />;
}

export default function HistoryPage() {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        All-time scoring across every regular season week. Click any column header to sort.
      </p>
      <Suspense fallback={<Spinner />}>
        <Stats />
      </Suspense>
    </div>
  );
}
