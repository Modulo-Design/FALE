import { Suspense } from "react";
import { CURRENT_SEASON, SEASONS } from "@/lib/config";
import { loadPlayers } from "@/lib/history";
import { loadLiveArchives } from "@/lib/live-archive";
import { seasonMVP } from "@/lib/mvp";
import MVPTable from "@/components/MVPTable";
import Spinner from "@/components/Spinner";

export const metadata = { title: "MVP · FALE" };

/**
 * The season in progress is pulled from Sleeper, with the week still being
 * played left out -- so a week counts toward the MVP once its scores are final.
 */
export const revalidate = 3600;

interface PageProps {
  searchParams: Promise<{ season?: string }>;
}

async function Ranking({ season }: { season: string }) {
  const [archives, players] = await Promise.all([loadLiveArchives(), loadPlayers()]);
  const archive = archives.find((a) => a.season === season);
  const mvp = archive ? seasonMVP(archive, players) : { season, hasBench: false, entries: [] };
  return <MVPTable mvp={mvp} seasons={SEASONS} />;
}

export default async function MVPPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const season = params.season && SEASONS.includes(params.season) ? params.season : CURRENT_SEASON;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">FALE MVP</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        Each week, every starter is swapped for the best player his governor had on the bench for that slot, and the
        week is re-scored under the VP rules. <span className="font-medium">VP added</span> is what his governor would
        have lost. A stud backed up by another stud adds little; one with nothing behind him adds a lot. It is hindsight:
        the bench is scored on what it actually did.
      </p>
      <Suspense key={season} fallback={<Spinner />}>
        <Ranking season={season} />
      </Suspense>
    </div>
  );
}
