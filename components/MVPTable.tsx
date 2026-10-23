import Link from "next/link";
import type { SeasonMVP } from "@/lib/types";

interface Props {
  mvp: SeasonMVP;
  seasons: string[];
}

function pill(active: boolean): string {
  return `px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
    active
      ? "bg-green-600 text-white"
      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
  }`;
}

function signed(n: number): string {
  const fixed = n.toFixed(n % 1 === 0 ? 0 : 1);
  return n > 0 ? `+${fixed}` : fixed;
}

export default function MVPTable({ mvp, seasons }: Props) {
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-4">
        {seasons.map((season) => (
          <Link key={season} href={`/history/mvp?season=${season}`} className={pill(season === mvp.season)}>
            {season}
          </Link>
        ))}
      </div>

      {!mvp.hasBench ? (
        <p className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">
          Bench scoring isn&apos;t archived for {mvp.season} yet, so there is no bench to measure anyone against.
        </p>
      ) : mvp.entries.length === 0 ? (
        <p className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">
          No weeks of {mvp.season} are final yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-left hidden sm:table-cell">Governor</th>
                <th className="px-3 py-2 text-right hidden md:table-cell">Starts</th>
                <th className="px-3 py-2 text-right hidden md:table-cell">Pts</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell" title="Points over the best eligible bench player">
                  Over bench
                </th>
                <th className="px-3 py-2 text-right">VP added</th>
                <th className="px-3 py-2 text-right" title="Bracket wins that become losses with the bench in his slot">
                  Playoffs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {mvp.entries.map((e) => (
                <tr key={e.playerId}>
                  <td className="px-3 py-2 tabular-nums text-gray-400 dark:text-gray-500">{e.rank}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{e.playerName}</span>
                    {e.position && <span className="text-gray-400 dark:text-gray-500"> · {e.position}</span>}
                    <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400">{e.governors.join(" → ")}</div>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell text-gray-700 dark:text-gray-300">
                    {e.governorName}
                    {e.governors.length > 1 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500"> (also {e.governors.slice(1).join(", ")})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell text-gray-600 dark:text-gray-400">{e.starts}</td>
                  <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell text-gray-600 dark:text-gray-400">
                    {e.points.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell text-gray-600 dark:text-gray-400">
                    {signed(e.pointsOverBench)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900 dark:text-gray-100">{signed(e.vpAdded)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600 dark:text-gray-400">
                    {e.playoffStarts === 0 ? (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    ) : (
                      <>
                        {e.playoffWinsSwung} {e.playoffWinsSwung === 1 ? "win" : "wins"}
                        <span className="text-gray-400 dark:text-gray-500"> · {signed(e.playoffPointsOverBench)}</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
