"use client";

interface WeeklyResult {
  rosterId: number;
  points: number;
  won: boolean;
  vpMatchup: number;
  vpScoring: number;
  vp: number;
}

interface TeamStanding {
  rosterId: number;
  displayName: string;
  weeklyResults: WeeklyResult[];
}

interface Props {
  standings: TeamStanding[];
  weeksCompleted: number;
}

function vpColor(vp: number) {
  if (vp === 3) return "bg-green-500 text-white";
  if (vp === 2) return "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100";
  if (vp === 1) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100";
  return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
}

export default function WeeklyVPGrid({ standings, weeksCompleted }: Props) {
  const weeks = Array.from({ length: weeksCompleted }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left px-2 py-2 font-semibold text-gray-600 dark:text-gray-300 min-w-[120px]">
              Team
            </th>
            {weeks.map((w) => (
              <th key={w} className="px-1 py-2 text-center font-semibold text-gray-500 dark:text-gray-400 w-9">
                W{w}
              </th>
            ))}
            <th className="px-2 py-2 text-center font-semibold text-gray-600 dark:text-gray-300 w-12">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((team) => {
            const byWeek = new Map(team.weeklyResults.map((r, i) => [i + 1, r]));
            const total = team.weeklyResults.reduce((s, r) => s + r.vp, 0);
            return (
              <tr key={team.rosterId} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-2 py-1.5 font-medium text-gray-800 dark:text-gray-200">
                  {team.displayName.split(" ")[0]}
                </td>
                {weeks.map((w) => {
                  const result = byWeek.get(w);
                  return (
                    <td key={w} className="px-0.5 py-1 text-center">
                      {result ? (
                        <span
                          className={`inline-block w-7 h-7 rounded text-xs font-bold leading-7 ${vpColor(result.vp)}`}
                          title={`${result.points.toFixed(2)} pts | ${result.won ? "W" : "L"} | ${result.vpMatchup}+${result.vpScoring} VP`}
                        >
                          {result.vp}
                        </span>
                      ) : (
                        <span className="inline-block w-7 h-7 rounded bg-gray-100 dark:bg-gray-800" />
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-bold text-gray-900 dark:text-gray-100">
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
