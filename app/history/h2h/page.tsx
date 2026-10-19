import { Suspense } from "react";
import { buildGameLog, headToHead } from "@/lib/history";
import { governorNames } from "@/lib/governors";
import { loadLiveArchives } from "@/lib/live-archive";
import HeadToHead from "@/components/HeadToHead";
import Spinner from "@/components/Spinner";

export const metadata = { title: "Head-to-head · FALE" };

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

async function Series({ a, b }: { a: string; b: string }) {
  // The season in progress comes from Sleeper, minus the week still being
  // played, so a meeting counts once its scores are final.
  const log = await loadLiveArchives().then(buildGameLog);
  // Only governors who have actually played can be compared.
  const played = [...new Set(log.map((g) => g.governorName))].sort();
  return <HeadToHead governors={played} a={a} b={b} result={headToHead(log, a, b)} />;
}

export default async function HeadToHeadPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const known = new Set(governorNames());
  const a = params.a && known.has(params.a) ? params.a : "Ben";
  const b = params.b && known.has(params.b) && params.b !== a ? params.b : a === "Jeremy" ? "Ben" : "Jeremy";

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Head-to-head</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        Every meeting between any two governors since 2020. Each week is added once its scores are final.
      </p>
      <Suspense key={`${a}-${b}`} fallback={<Spinner />}>
        <Series a={a} b={b} />
      </Suspense>
    </div>
  );
}
