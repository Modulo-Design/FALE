"use client";

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

function avatarUrl(avatar: string | null): string | null {
  if (!avatar) return null;
  return `https://sleepercdn.com/avatars/thumbs/${avatar}`;
}

export default function StandingsTable({ standings }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 text-left">
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 w-8">#</th>
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">Team</th>
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">VP's</th>
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">W-L</th>
            <th className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team, idx) => {
            const isTop = idx < Math.ceil(standings.length / 2);
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
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500">
                        {team.displayName[0]}
                      </div>
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
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
