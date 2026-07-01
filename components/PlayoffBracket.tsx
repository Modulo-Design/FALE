"use client";

interface PlayoffTeamResult {
  rosterId: number;
  governorName: string;
  points: number;
  won: boolean;
}

interface PlayoffMatchupResult {
  round: number;
  week: number;
  placement?: number;
  isBye?: boolean;
  teams: PlayoffTeamResult[];
}

interface PlayoffBracket {
  season: string;
  playoffWeekStart: number;
  rounds: PlayoffMatchupResult[];
  champion?: string;
  runnerUp?: string;
}

interface Props {
  bracket: PlayoffBracket;
}

function roundLabel(round: number, maxRound: number, isChampionship: boolean) {
  if (isChampionship) return "Championship";
  if (round === maxRound) return "Final Round";
  return `Round ${round}`;
}

export default function PlayoffBracket({ bracket }: Props) {
  const { rounds, champion, runnerUp } = bracket;

  if (rounds.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No playoff data available for this season.
      </div>
    );
  }

  const maxRound = rounds.reduce((max, r) => Math.max(max, r.round), 0);
  const byRound = new Map<number, PlayoffMatchupResult[]>();
  for (const r of rounds) {
    if (!byRound.has(r.round)) byRound.set(r.round, []);
    byRound.get(r.round)!.push(r);
  }
  // Byes first, so the column reads the way Sleeper lays it out.
  for (const matchups of byRound.values()) {
    matchups.sort((a, b) => Number(b.isBye) - Number(a.isBye));
  }
  const roundNumbers = Array.from(byRound.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {champion && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-center">
          <p className="text-xs text-green-700 dark:text-green-300 font-medium uppercase tracking-wide">
            Champion
          </p>
          <p className="text-xl font-bold text-green-900 dark:text-green-100">{champion}</p>
          {runnerUp && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-1">defeated {runnerUp}</p>
          )}
        </div>
      )}

      <div className="flex gap-8 overflow-x-auto pb-2">
        {roundNumbers.map((round) => {
          const matchups = byRound.get(round)!;
          const isChampionship = matchups.some((m) => m.placement === 1);
          return (
            <div key={round} className="flex flex-col flex-1 min-w-[220px]">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center mb-3">
                {roundLabel(round, maxRound, isChampionship)}
              </h3>
              <div className="flex flex-col flex-1 justify-around gap-6">
                {matchups.map((matchup, idx) => (
                  <div
                    key={`${matchup.round}-${idx}`}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900"
                  >
                    {matchup.teams.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 text-center">TBD</p>
                    ) : (
                      matchup.teams.map((team) => (
                        <div
                          key={team.rosterId}
                          className={`flex items-center justify-between px-3 py-2 text-sm ${
                            team.won
                              ? "bg-green-50 dark:bg-green-900/20 font-semibold text-green-900 dark:text-green-100"
                              : "text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <span>{team.governorName}</span>
                          <span className="font-mono">{team.points.toFixed(2)}</span>
                        </div>
                      ))
                    )}
                    {matchup.isBye && (
                      <p className="px-3 py-1 text-[10px] text-gray-400 dark:text-gray-500 text-center border-t border-gray-100 dark:border-gray-800">
                        BYE
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
