"use client";

import PlayoffBracket from "./PlayoffBracket";
import type { ProjectionOutput } from "@/lib/types";

interface Props {
  projections: ProjectionOutput;
}

function pct(value: number): string {
  if (value >= 0.999) return "100%";
  if (value > 0 && value < 0.005) return "<1%";
  return `${Math.round(value * 100)}%`;
}

/** Opacity scales with probability, matching the weekly grid's cell idiom. */
function seedCell(probability: number): string {
  if (probability === 0) return "bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-700";
  if (probability >= 0.5) return "bg-green-500 text-white";
  if (probability >= 0.25) return "bg-green-300 text-green-900 dark:bg-green-700 dark:text-green-50";
  if (probability >= 0.1) return "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100";
  return "bg-green-50 text-green-800 dark:bg-green-900/40 dark:text-green-200";
}

export default function PlayoffProjections({ projections }: Props) {
  const { teams, sims, weeksRemaining, projectedBracket } = projections;
  const seedCount = teams[0]?.seedProbs.length ?? 0;

  return (
    <div className="space-y-8">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {weeksRemaining} {weeksRemaining === 1 ? "week" : "weeks"} left, simulated{" "}
        {sims.toLocaleString()} times. Each team&apos;s weekly scoring is drawn from its own
        season so far, pulled toward the league average while the sample is small. Every
        simulated week is scored under the real rules, top-half scoring VP included.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Governor</th>
              <th className="text-right px-3 py-2 font-semibold">VP</th>
              <th className="text-right px-3 py-2 font-semibold">Proj VP</th>
              <th className="text-right px-3 py-2 font-semibold hidden sm:table-cell">Range</th>
              <th className="text-left px-3 py-2 font-semibold w-40">Playoff odds</th>
              <th className="text-right px-3 py-2 font-semibold">Bye</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {teams.map((team) => (
              <tr key={team.rosterId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {team.governorName}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                  {team.currentVP}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                  {team.meanFinalVP.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400 dark:text-gray-500 hidden sm:table-cell">
                  {team.p10VP}–{team.p90VP}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${Math.max(team.playoffOdds * 100, team.playoffOdds > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-xs w-10 text-right text-gray-600 dark:text-gray-300">
                      {pct(team.playoffOdds)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-500 dark:text-gray-400">
                  {pct(team.byeOdds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {seedCount > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Seed probability
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            How often each governor lands on each seed. The last seed is the points wildcard.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="text-left font-semibold text-gray-500 dark:text-gray-400 pr-2" />
                  {Array.from({ length: seedCount }, (_, i) => (
                    <th key={i} className="w-10 text-center font-semibold text-gray-500 dark:text-gray-400">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.rosterId}>
                    <td className="pr-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {team.governorName}
                    </td>
                    {team.seedProbs.map((probability, seedIdx) => (
                      <td
                        key={seedIdx}
                        title={`${team.governorName} — ${seedIdx + 1} seed: ${pct(probability)}`}
                        className={`w-10 h-7 text-center rounded tabular-nums ${seedCell(probability)}`}
                      >
                        {probability >= 0.005 ? Math.round(probability * 100) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {projectedBracket && projectedBracket.rounds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Projected bracket
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            The most likely field, seeded by projected VP with the points wildcard last, and
            the higher seed advancing each round.
          </p>
          <PlayoffBracket bracket={projectedBracket} />
        </div>
      )}
    </div>
  );
}
