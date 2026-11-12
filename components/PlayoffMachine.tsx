"use client";

import { useState } from "react";
import {
  clearWeek,
  isMachineFinale,
  toggleTopHalf,
  toggleWinner,
  weekProgress,
} from "@/lib/playoff-machine";
import { topHalfPlaces } from "@/lib/projections";
import type { ProjectionInput, ProjectionWeekPicks } from "@/lib/types";

interface Props {
  input: ProjectionInput;
  picks: ProjectionWeekPicks[];
  onChange: (picks: ProjectionWeekPicks[]) => void;
}

const PILL_BASE =
  "px-3 py-1.5 text-xs font-medium rounded-full border whitespace-nowrap transition-colors";
const PILL_OFF =
  "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
const PILL_ON = "border-green-600 bg-green-600 text-white";

/**
 * The playoff machine: decide the rest of the season by hand.
 *
 * One week at a time, every game takes a winner and every team can be put in
 * the top half. The component only edits the picks -- the odds they produce
 * are the parent's to run, so the table, heatmap and bracket below all move
 * off the one result.
 */
export default function PlayoffMachine({ input, picks, onChange }: Props) {
  const weeks = input.remainingSchedule.map((entry) => entry.week);
  const [chosenWeek, setChosenWeek] = useState<number | null>(null);
  // A week can drop off the schedule between refreshes; fall back to the first.
  const week = chosenWeek != null && weeks.includes(chosenWeek) ? chosenWeek : weeks[0];
  const fixture = input.remainingSchedule.find((entry) => entry.week === week);
  if (!fixture) return null;

  const finale = isMachineFinale(input, week);
  const places = topHalfPlaces(input);
  const current = picks.find((pick) => pick.week === week);
  const winners = new Set(current?.winners ?? []);
  const topHalf = new Set(current?.topHalf ?? []);
  const topHalfFull = topHalf.size >= places;
  const nameOf = new Map(input.teams.map((team) => [team.rosterId, team.governorName]));

  // A team with no game this week still scores, so it still gets a row.
  const paired = new Set(fixture.pairs.flat());
  const cards: number[][] = [
    ...fixture.pairs,
    ...input.teams.filter((team) => !paired.has(team.rosterId)).map((team) => [team.rosterId]),
  ];

  const scoringVP = finale ? 3 : 1;

  return (
    <section aria-label="Playoff machine">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
        Playoff machine
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Pick who wins each game and who lands in the top half, and everything below is
        re-simulated around your picks. Whatever you leave open is still played out.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {weeks.map((w) => {
          const { made, total } = weekProgress(input, picks, w);
          return (
            <button
              key={w}
              type="button"
              aria-pressed={w === week}
              onClick={() => setChosenWeek(w)}
              className={`${PILL_BASE} ${w === week ? PILL_ON : PILL_OFF}`}
            >
              Week {w}
              {made > 0 && (
                <span className={`ml-1.5 tabular-nums ${w === week ? "text-green-100" : "text-green-600 dark:text-green-400"}`}>
                  {made === total ? "✓" : `${made}/${total}`}
                </span>
              )}
            </button>
          );
        })}
        {picks.length > 0 && (
          <span className="ml-auto flex gap-3 text-xs">
            {current && (
              <button
                type="button"
                onClick={() => onChange(clearWeek(picks, week))}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline underline-offset-2"
              >
                Clear week {week}
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline underline-offset-2"
            >
              Clear all
            </button>
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {finale
          ? `Rivalry Week: no head-to-head VP, and the top half is worth ${scoringVP} VP.`
          : `A win is worth 2 VP and the top half ${scoringVP} VP.`}{" "}
        <span className="tabular-nums font-medium text-gray-700 dark:text-gray-200">
          Top half: {topHalf.size} of {places} picked
        </span>
        {topHalfFull && " — everyone else misses it."}
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.join("-")}
            className="rounded-lg border border-gray-200 dark:border-gray-700 p-1.5 space-y-1.5"
          >
            {card.map((rosterId) => {
              const name = nameOf.get(rosterId) ?? `Roster ${rosterId}`;
              const opponent = card.find((id) => id !== rosterId);
              const canWin = !finale && opponent != null;
              const won = winners.has(rosterId);
              const lost = opponent != null && winners.has(opponent);
              const inTop = topHalf.has(rosterId);
              const topBlocked = !inTop && topHalfFull;

              return (
                <div key={rosterId} className="flex items-stretch gap-1.5">
                  {canWin ? (
                    <button
                      type="button"
                      aria-pressed={won}
                      aria-label={`${name} wins in week ${week}`}
                      onClick={() => onChange(toggleWinner(input, picks, week, rosterId))}
                      className={`flex-1 min-w-0 flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-left transition-colors ${
                        won
                          ? "bg-green-600 text-white"
                          : lost
                            ? "bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      {won && <span className="text-xs tabular-nums text-green-100">W +2</span>}
                    </button>
                  ) : (
                    <span className="flex-1 min-w-0 truncate rounded-md px-2.5 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {name}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-pressed={inTop}
                    aria-label={`${name} finishes top half in week ${week}`}
                    disabled={topBlocked}
                    title={topBlocked ? `All ${places} top-half places are taken` : undefined}
                    onClick={() => onChange(toggleTopHalf(input, picks, week, rosterId))}
                    className={`shrink-0 w-[4.5rem] rounded-md border px-1.5 py-2 text-xs font-medium tabular-nums transition-colors ${
                      inTop
                        ? "border-green-300 bg-green-100 text-green-900 dark:border-green-700 dark:bg-green-900/60 dark:text-green-100"
                        : topBlocked
                          ? "border-transparent text-gray-300 dark:text-gray-700 cursor-not-allowed"
                          : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {inTop ? `Top ½ +${scoringVP}` : "Top ½"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
