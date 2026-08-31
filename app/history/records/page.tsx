import { Suspense } from "react";
import { buildGameLog, loadPlayers, recordBook } from "@/lib/history";
import RecordBook from "@/components/RecordBook";
import Spinner from "@/components/Spinner";

export const metadata = { title: "Record book · FALE" };

async function Book() {
  const [log, players] = await Promise.all([buildGameLog(), loadPlayers()]);
  return <RecordBook book={recordBook(log, players)} />;
}

export default function RecordsPage() {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Record book</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        All-time highs and lows, 2020 to 2025, regular season and playoffs.
      </p>
      <Suspense fallback={<Spinner />}>
        <Book />
      </Suspense>
    </div>
  );
}
