"use client";

import { useState, useMemo } from "react";
import type { GovernorStats } from "@/lib/historical";

type SortKey = keyof Omit<GovernorStats, "governorName">;
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey | "governorName"; label: string; numeric: boolean }[] = [
  { key: "governorName", label: "Governor", numeric: false },
  { key: "seasonsPlayed", label: "Seasons", numeric: true },
  { key: "weekCount", label: "Weeks", numeric: true },
  { key: "totalPoints", label: "Total Pts", numeric: true },
  { key: "avgPoints", label: "Avg", numeric: true },
  { key: "highScore", label: "High", numeric: true },
  { key: "lowScore", label: "Low", numeric: true },
];

interface Props {
  stats: GovernorStats[];
}

export default function HistoricalStats({ stats }: Props) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | "governorName">("totalPoints");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: typeof sortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "governorName" ? "asc" : "desc");
    }
  };

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return stats.filter((s) => s.governorName.toLowerCase().includes(q));
  }, [stats, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: typeof sortKey }) => {
    if (col !== sortKey) return <span className="text-gray-300 dark:text-gray-600 ml-1">↕</span>;
    return <span className="text-green-500 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Filter by governor…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 w-48"
        />
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {sorted.length} governor{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-left">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100 whitespace-nowrap ${
                    col.numeric ? "text-right" : ""
                  }`}
                >
                  {col.label}
                  <SortIcon col={col.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr
                key={row.governorName}
                className={`border-t border-gray-100 dark:border-gray-700 ${
                  idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/40"
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                  {row.governorName}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                  {row.seasonsPlayed}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                  {row.weekCount}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">
                  {row.totalPoints.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700 dark:text-gray-300">
                  {row.avgPoints.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-green-600 dark:text-green-400">
                  {row.highScore.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-red-500 dark:text-red-400">
                  {row.lowScore.toFixed(2)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                  No governors match &ldquo;{filter}&rdquo;
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
