"use client";

import { useRouter } from "next/navigation";
import type { HeadToHeadResult } from "@/lib/history";

interface Props {
  governors: string[];
  a: string;
  b: string;
  result: HeadToHeadResult;
}

function streakLabel(streak: number): string {
  if (streak === 0) return "—";
  return `${streak > 0 ? "W" : "L"}${Math.abs(streak)}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

export default function HeadToHead({ governors, a, b, result }: Props) {
  const router = useRouter();
  const go = (next: { a?: string; b?: string }) =>
    router.push(`/history/h2h?a=${encodeURIComponent(next.a ?? a)}&b=${encodeURIComponent(next.b ?? b)}`);

  const select = (value: string, onChange: (v: string) => void, exclude: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-gray-100"
    >
      {governors.map((g) => (
        <option key={g} value={g} disabled={g === exclude}>
          {g}
        </option>
      ))}
    </select>
  );

  const { rivalryWeek } = result;
  const played = result.wins + result.losses + result.ties;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        {select(a, (v) => go({ a: v }), b)}
        <span className="text-sm text-gray-400 dark:text-gray-500">vs</span>
        {select(b, (v) => go({ b: v }), a)}
        <button
          onClick={() => go({ a: b, b: a })}
          className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Swap
        </button>
      </div>

      {played === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {a} and {b} have never played each other.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-green-700 dark:text-green-300">
              All-time series
            </p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100 tabular-nums">
              {a} {result.wins}–{result.losses}
              {result.ties > 0 ? `–${result.ties}` : ""} {b}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Avg for" value={result.avgFor.toFixed(1)} hint={a} />
            <Stat label="Avg against" value={result.avgAgainst.toFixed(1)} hint={b} />
            <Stat label="Current streak" value={streakLabel(result.streak)} hint={`for ${a}`} />
            <Stat
              label="Biggest win"
              value={result.biggestWin ? `+${result.biggestWin.margin.toFixed(1)}` : "—"}
              hint={result.biggestWin ? `${result.biggestWin.season} wk${result.biggestWin.week}` : undefined}
            />
          </div>

          {rivalryWeek.meetings.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">
                Rivalry Week
              </p>
              <p className="text-lg font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                {rivalryWeek.wins}–{rivalryWeek.losses}
                {rivalryWeek.ties > 0 ? `–${rivalryWeek.ties}` : ""} to {a}
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                The finale-week matchup. No VP, no win or loss — pride only, so it is kept out
                of the series record above.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {rivalryWeek.meetings.map((m) => (
                  <span
                    key={`${m.season}-${m.week}`}
                    className={`text-xs px-2 py-1 rounded tabular-nums ${
                      m.won
                        ? "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-50 font-semibold"
                        : "bg-white/70 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {m.season}: {m.points.toFixed(1)}–{m.opponentPoints.toFixed(1)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">By season</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Season</th>
                    <th className="text-right px-3 py-2 font-semibold">Record</th>
                    <th className="text-right px-3 py-2 font-semibold">{a} pts</th>
                    <th className="text-right px-3 py-2 font-semibold">{b} pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {result.perSeason.map((s) => (
                    <tr key={s.season}>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{s.season}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.wins}–{s.losses}
                        {s.ties > 0 ? `–${s.ties}` : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {s.pointsFor.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {s.pointsAgainst.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Every meeting
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Season</th>
                    <th className="text-left px-3 py-2 font-semibold">Week</th>
                    <th className="text-right px-3 py-2 font-semibold">{a}</th>
                    <th className="text-right px-3 py-2 font-semibold">{b}</th>
                    <th className="text-right px-3 py-2 font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {result.meetings.map((m) => (
                    <tr
                      key={`${m.season}-${m.week}`}
                      className={m.won ? "bg-green-50/60 dark:bg-green-900/10" : undefined}
                    >
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{m.season}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                        {m.phase === "playoff" ? `Playoffs wk${m.week}` : `Week ${m.week}`}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          m.won ? "font-semibold text-green-800 dark:text-green-200" : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {m.points.toFixed(1)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          !m.won && !m.tied
                            ? "font-semibold text-gray-900 dark:text-gray-100"
                            : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {m.opponentPoints.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-500 dark:text-gray-400">
                        {m.margin > 0 ? "+" : ""}
                        {m.margin.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
