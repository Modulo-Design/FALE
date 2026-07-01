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

const COL_WIDTH = 220;
const GAP_WIDTH = 40;
const SLOT_HEIGHT = 92;
const LINE_CLASS = "bg-gray-300 dark:bg-gray-600";

function roundLabel(round: number, maxRound: number, isChampionship: boolean) {
  if (isChampionship) return "Championship";
  if (round === maxRound) return "Final Round";
  return `Round ${round}`;
}

// Vertical center (as a % of the column height) of matchup `idx` out of `count`
// total matchups, assuming they're spaced evenly. Round r+1's match `i` is the
// midpoint of round r's matches `2i` and `2i+1` by construction of the data layer,
// so connector lines only need this one formula on both sides of a gap.
function centerPercent(idx: number, count: number) {
  return ((2 * idx + 1) / (2 * count)) * 100;
}

function MatchupCard({ matchup }: { matchup: PlayoffMatchupResult }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
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
  );
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
  const roundNumbers = Array.from(byRound.keys()).sort((a, b) => a - b);
  const slotCount = Math.max(...roundNumbers.map((r) => byRound.get(r)!.length));
  const bracketHeight = slotCount * SLOT_HEIGHT;

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

      <div className="overflow-x-auto pb-2">
        <div className="flex" style={{ width: "max-content" }}>
          {roundNumbers.map((round, roundIdx) => {
            const matchups = byRound.get(round)!;
            const isChampionship = matchups.some((m) => m.placement === 1);
            const nextRound = roundIdx < roundNumbers.length - 1 ? roundNumbers[roundIdx + 1] : undefined;
            const nextMatchups = nextRound !== undefined ? byRound.get(nextRound)! : undefined;

            return (
              <div key={round} className="flex items-start">
                <div style={{ width: COL_WIDTH }}>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center mb-3">
                    {roundLabel(round, maxRound, isChampionship)}
                  </h3>
                  <div className="relative" style={{ height: bracketHeight }}>
                    {matchups.map((matchup, idx) => (
                      <div
                        key={idx}
                        className="absolute left-0 right-0 px-1"
                        style={{ top: `${centerPercent(idx, matchups.length)}%`, transform: "translateY(-50%)" }}
                      >
                        <MatchupCard matchup={matchup} />
                      </div>
                    ))}
                  </div>
                </div>

                {nextMatchups && (
                  <div
                    className="relative shrink-0"
                    style={{ width: GAP_WIDTH, height: bracketHeight, marginTop: 28 }}
                  >
                    {matchups.map((_, idx) => (
                      <div
                        key={`stub-${idx}`}
                        className={`absolute left-0 w-1/2 h-px ${LINE_CLASS}`}
                        style={{ top: `${centerPercent(idx, matchups.length)}%` }}
                      />
                    ))}
                    {nextMatchups.map((_, idx) => {
                      const feederA = centerPercent(idx * 2, matchups.length);
                      const feederB = centerPercent(idx * 2 + 1, matchups.length);
                      const mid = centerPercent(idx, nextMatchups.length);
                      const top = Math.min(feederA, feederB);
                      const height = Math.abs(feederB - feederA);
                      return (
                        <div key={`pair-${idx}`}>
                          <div
                            className={`absolute left-1/2 w-px ${LINE_CLASS}`}
                            style={{ top: `${top}%`, height: `${height}%` }}
                          />
                          <div
                            className={`absolute right-0 w-1/2 h-px ${LINE_CLASS}`}
                            style={{ top: `${mid}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
