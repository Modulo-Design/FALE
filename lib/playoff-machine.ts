import { monteCarlo, normalisePicks, topHalfPlaces } from "./projections";
import type { ProjectionInput, ProjectionOutput, ProjectionWeekPicks } from "./types";

/**
 * The playoff machine: the picks a governor makes by hand, and the projection
 * re-run with them.
 *
 * Everything here is pure, like the simulation it feeds. The picks are plain
 * data -- per week, who won and who finished top half -- so they can sit in
 * `localStorage` as JSON and be checked against the schedule on the way back.
 */

/**
 * Fewer runs than the server's projection, because this one happens in the
 * browser on every click. Enough that the odds settle to a point or two.
 */
export const MACHINE_SIMS = 4_000;

/**
 * Picks reduced to the ones the schedule can honour, weeks in order and empty
 * weeks dropped. Run on everything read back from storage, so a pick made
 * before a week was played, or by an older build, simply falls away.
 */
export function cleanPicks(
  input: ProjectionInput,
  picks: readonly ProjectionWeekPicks[]
): ProjectionWeekPicks[] {
  const normalised = normalisePicks({ ...input, picks: [...picks] });
  return [...normalised.entries()]
    .map(([week, { winners, topHalf }]) => ({
      week,
      winners: [...winners],
      topHalf: [...topHalf],
    }))
    .filter((pick) => pick.winners.length > 0 || pick.topHalf.length > 0)
    .sort((a, b) => a.week - b.week);
}

function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((id) => Number.isInteger(id));
}

/** Picks from their stored JSON. Anything unreadable is no picks at all. */
export function parsePicks(raw: string | null, input: ProjectionInput): ProjectionWeekPicks[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const picks = parsed.filter(
      (entry): entry is ProjectionWeekPicks =>
        entry != null &&
        typeof entry === "object" &&
        Number.isInteger((entry as ProjectionWeekPicks).week) &&
        isIdList((entry as ProjectionWeekPicks).winners) &&
        isIdList((entry as ProjectionWeekPicks).topHalf)
    );
    return cleanPicks(input, picks);
  } catch {
    return [];
  }
}

function weekPicks(picks: readonly ProjectionWeekPicks[], week: number): ProjectionWeekPicks {
  return picks.find((pick) => pick.week === week) ?? { week, winners: [], topHalf: [] };
}

function withWeek(
  input: ProjectionInput,
  picks: readonly ProjectionWeekPicks[],
  next: ProjectionWeekPicks
): ProjectionWeekPicks[] {
  return cleanPicks(input, [...picks.filter((pick) => pick.week !== next.week), next]);
}

/** Pick a team to win its game; picking the same team again takes it back. */
export function toggleWinner(
  input: ProjectionInput,
  picks: readonly ProjectionWeekPicks[],
  week: number,
  rosterId: number
): ProjectionWeekPicks[] {
  const current = weekPicks(picks, week);
  const pair = input.remainingSchedule
    .find((entry) => entry.week === week)
    ?.pairs.find((p) => p.includes(rosterId));
  if (!pair) return [...picks];

  const others = current.winners.filter((id) => !pair.includes(id));
  const winners = current.winners.includes(rosterId) ? others : [...others, rosterId];
  return withWeek(input, picks, { ...current, winners });
}

/**
 * Pick a team into the top half, or take it back out. Once every place is
 * taken a further pick does nothing -- someone has to be dropped first.
 */
export function toggleTopHalf(
  input: ProjectionInput,
  picks: readonly ProjectionWeekPicks[],
  week: number,
  rosterId: number
): ProjectionWeekPicks[] {
  const current = weekPicks(picks, week);
  if (current.topHalf.includes(rosterId)) {
    return withWeek(input, picks, {
      ...current,
      topHalf: current.topHalf.filter((id) => id !== rosterId),
    });
  }
  if (current.topHalf.length >= topHalfPlaces(input)) return [...picks];
  return withWeek(input, picks, { ...current, topHalf: [...current.topHalf, rosterId] });
}

export function clearWeek(
  picks: readonly ProjectionWeekPicks[],
  week: number
): ProjectionWeekPicks[] {
  return picks.filter((pick) => pick.week !== week);
}

/** The finale is Rivalry Week from 2021 on: no head-to-head VP to pick. */
export function isMachineFinale(input: ProjectionInput, week: number): boolean {
  return week === input.regularSeasonWeeks && Number(input.season) >= 2021;
}

export interface WeekProgress {
  /** Decisions made, out of `total`: one per game plus one per top-half place. */
  made: number;
  total: number;
}

export function weekProgress(
  input: ProjectionInput,
  picks: readonly ProjectionWeekPicks[],
  week: number
): WeekProgress {
  const fixture = input.remainingSchedule.find((entry) => entry.week === week);
  const current = weekPicks(picks, week);
  const games = isMachineFinale(input, week) ? 0 : fixture?.pairs.length ?? 0;
  return {
    made: (games > 0 ? current.winners.length : 0) + current.topHalf.length,
    total: games + topHalfPlaces(input),
  };
}

/**
 * The projection with the picks applied. No picks is the server's own run,
 * handed back untouched rather than recomputed at a lower count.
 */
export function runMachine(
  baseline: ProjectionOutput,
  picks: readonly ProjectionWeekPicks[]
): ProjectionOutput {
  const input = baseline.input;
  if (!input || picks.length === 0) return baseline;
  return {
    ...monteCarlo.run({ ...input, picks: [...picks], sims: MACHINE_SIMS }),
    input,
  };
}
