import { Suspense } from "react";
import { buildGameLog, loadPlayers, recordBook } from "@/lib/history";
import { loadLiveArchives } from "@/lib/live-archive";
import RecordBook from "@/components/RecordBook";
import Spinner from "@/components/Spinner";

export const metadata = { title: "Record book · FALE" };

/**
 * The season in progress is pulled from Sleeper, with the week still being
 * played left out -- so a week's scores join the book once the week is final.
 */
export const revalidate = 3600;

async function Book() {
  const [log, players] = await Promise.all([
    loadLiveArchives().then(buildGameLog),
    loadPlayers(),
  ]);
  return <RecordBook book={recordBook(log, players)} />;
}

export default function RecordsPage() {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Record book</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        All-time highs and lows since 2020, regular season and playoffs. Each week is added once its scores are final.
      </p>
      <Suspense fallback={<Spinner />}>
        <Book />
      </Suspense>
    </div>
  );
}
