"use client";

import { useState, useMemo } from "react";
import Image from "next/image";

interface TeamStanding {
  rosterId: number;
  displayName: string;
  avatar: string | null;
  totalVP: number;
  totalPoints: number;
  wins: number;
  losses: number;
}

interface Props {
  standings: TeamStanding[];
}

type SortKey = "totalVP" | "totalPoints";

function avatarUrl(avatar: string | null): string | null {
  if (!avatar) return null;
  return `https://sleepercdn.com/avatars/thumbs/${avatar}`;
}

export default function StandingsTable({ standings }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalVP");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const vpTopHalf = useMemo(() => {
    const byVP = [...standings].sort((a, b) => b.totalVP - a.totalVP || b.totalPoints - a.totalPoints);
    const cutoff = Math.ceil(byVP.length / 2);
    return new Set(byVP.slice(0, cutoff).map((t) => t.rosterId));
  }, [standings]);

  const sorted = useMemo(() => {
    return [...standings].sort((a, b) => {
      const diff =
        sortKey === "totalVP"
          ? b.totalVP - a.totalVP || b.totalPoints - a.totalPoints
          : b.totalPoints - a.totalPoints || b.totalVP - a.totalVP;
      return sortDir === "desc" ? diff : -diff;
    });
  }, [standings, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <span className="text-gray-300 dark:text-gray-600 ml-1">↕</span>;
    return <span className="text-green-500 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 text-left">
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 w-8">#</th>
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 w-36">Team</th>
            <th
              className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100 whitespace-nowrap w-20"
              onClick={() => handleSort("totalVP")}
            >
              VP&apos;s<SortIcon col="totalVP" />
            </th>
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center w-16">W-L</th>
            <th
              className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100 whitespace-nowrap w-24"
              onClick={() => handleSort("totalPoints")}
            >
              Points<SortIcon col="totalPoints" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, idx) => {
            const isTop = vpTopHalf.has(team.rosterId);
            return (
              <tr
                key={team.rosterId}
                className={`border-t border-gray-100 dark:border-gray-700 ${
                  isTop
                    ? "bg-green-50 dark:bg-green-900/20"
                    : "bg-white dark:bg-gray-900"
                }`}
              >
                <td className="px-3 py-3 text-gray-400 dark:text-gray-500 font-mono">{idx + 1}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {avatarUrl(team.avatar) ? (
                      <Image
                        src={avatarUrl(team.avatar)!}
                        alt={team.displayName}
                        width={28}
                        height={28}
                        className="rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                        {team.displayName[0]}
                      </div>
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {team.displayName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center font-bold text-gray-900 dark:text-gray-100">
                  {team.totalVP}
                </td>
                <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-400">
                  {team.wins}-{team.losses}
                </td>
                <td className="px-3 py-3 text-right font-mono text-gray-700 dark:text-gray-300">
                  {team.totalPoints.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
