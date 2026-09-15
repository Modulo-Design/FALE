"use client";

import { useState, useMemo } from "react";
import Image from "next/image";

import SegmentedControl from "./SegmentedControl";
import { PLAYOFF_FORMAT, isFinaleWeek } from "@/lib/config";
import { seedPlayoffField } from "@/lib/seeding";
import { restrictTeam } from "@/lib/standings-view";
import type { LiveStatus, TeamStanding } from "@/lib/types";

interface Props {
  standings: TeamStanding[];
  season: string;
  /** Included weeks that are still being played. Empty for a finished season. */
  pendingWeeks?: number[];
  liveStatus?: LiveStatus;
}

type SortKey = "totalVP" | "totalPoints";
type View = "final" | "live";

/** A stable identity for the common case, so the memos below do not churn. */
const NO_PENDING_WEEKS: number[] = [];

function avatarUrl(avatar: string | null): string | null {
  if (!avatar) return null;
  return `https://sleepercdn.com/avatars/thumbs/${avatar}`;
}

/**
 * A fixed UTC clock time rather than the viewer's locale: this renders on the
 * server first, and a locale-formatted timestamp would not survive hydration.
 */
function asOf(iso: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return "";
  return `${stamp.toISOString().slice(11, 16)} UTC`;
}

export default function StandingsTable({
  standings,
  season,
  pendingWeeks = NO_PENDING_WEEKS,
  liveStatus,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalVP");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const pending = useMemo(() => new Set(pendingWeeks), [pendingWeeks]);
  const hasPending = pending.size > 0;

  const settledWeeks = useMemo(() => {
    const weeks = new Set<number>();
    for (const team of standings) {
      for (const result of team.weeklyResults) {
        if (!pending.has(result.week)) weeks.add(result.week);
      }
    }
    return [...weeks].sort((a, b) => a - b);
  }, [standings, pending]);

  // On the opening Sunday of a season there is nothing settled to fall back
  // to, so an empty "Final" table would be the less useful default.
  const noSettledWeeks = hasPending && settledWeeks.length === 0;
  const [view, setView] = useState<View>(noSettledWeeks ? "live" : "final");
  const showingLive = !hasPending || view === "live";

  // VP, points, points against and the record are all per-week additive, and
  // each week's top-half cut is decided on that week alone -- so dropping the
  // live week and re-summing is exact, not an approximation.
  const rows = useMemo(
    () =>
      showingLive
        ? standings
        : standings.map((team) => restrictTeam(team, (r) => !pending.has(r.week))),
    [standings, showingLive, pending]
  );

  // The playoff field is the real one, not the top half of the table: all but
  // the last spot go to the VP standings and the last is a points wildcard,
  // so the two disagree whenever the wildcard comes from outside the VP places.
  const qualifiers = useMemo(() => {
    const format = PLAYOFF_FORMAT[season];
    if (!format) return new Map<number, "vp" | "points">();
    return new Map(seedPlayoffField(rows, format).map((s) => [s.rosterId, s.qualifiedBy]));
  }, [rows, season]);

  // One of the field's spots is the wildcard; the rest go on VP.
  const autoSpots = (PLAYOFF_FORMAT[season]?.teams ?? 1) - 1;

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const diff =
        sortKey === "totalVP"
          ? b.totalVP - a.totalVP || b.totalPoints - a.totalPoints
          : b.totalPoints - a.totalPoints || b.totalVP - a.totalVP;
      return sortDir === "desc" ? diff : -diff;
    });
  }, [rows, sortKey, sortDir]);

  const firstPending = hasPending ? Math.min(...pending) : 0;
  const lastSettled = settledWeeks.length ? settledWeeks[settledWeeks.length - 1] : 0;
  const finalePending = [...pending].some((week) => isFinaleWeek(week, season));

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
    <div className="space-y-2">
      {hasPending && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Week {firstPending} in progress —{" "}
            {lastSettled
              ? `standings are final through week ${lastSettled}`
              : "no completed weeks yet"}
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {liveStatus?.fetchedAt && <>Scores as of {asOf(liveStatus.fetchedAt)}. </>}
            {liveStatus?.source === "heuristic" && (
              <>
                Sleeper&apos;s NFL clock could not be reached, so the live week was guessed
                from the scores themselves.{" "}
              </>
            )}
            {finalePending && (
              <>
                This is the finale week: top-half scoring pays 3 VP league-wide and there is
                no head-to-head VP at all, so the live cut swings much harder than a normal
                week.
              </>
            )}
          </p>
          <SegmentedControl
            label="Standings scope"
            value={view}
            onChange={setView}
            options={[
              { value: "final", label: "Final" },
              { value: "live", label: `Including week ${firstPending}` },
            ]}
          />
          {view === "final" && !lastSettled && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              No completed weeks yet — every figure below is zero until week {firstPending}{" "}
              finishes.
            </p>
          )}
        </div>
      )}

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
            const qualifiedBy = qualifiers.get(team.rosterId);
            // Only meaningful in the live view: which of these figures are
            // still moving, and whose team has not put a point on the board.
            const live = showingLive
              ? team.weeklyResults.filter((r) => r.pending)
              : [];
            const provisional = live.length > 0;
            const yetToScore = provisional && live.every((r) => r.points === 0);
            return (
              <tr
                key={team.rosterId}
                className={`border-t border-gray-100 dark:border-gray-700 ${
                  qualifiedBy === "points"
                    ? "bg-green-400 dark:bg-green-600/50 font-semibold"
                    : qualifiedBy === "vp"
                    ? "bg-green-200 dark:bg-green-900/40"
                    : "bg-white dark:bg-gray-900"
                } ${yetToScore ? "border-l-4 border-l-amber-400 dark:border-l-amber-500" : ""}`}
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
                  {provisional && (
                    <span
                      title={`Includes week ${firstPending}, still being played`}
                      className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-super ml-0.5"
                    />
                  )}
                </td>
                <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-400">
                  {team.wins}-{team.losses}
                </td>
                <td className="px-3 py-3 text-right font-mono text-gray-700 dark:text-gray-300">
                  {team.totalPoints.toFixed(2)}
                  {provisional && (
                    <span
                      title={`Includes week ${firstPending}, still being played`}
                      className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-super ml-0.5"
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {qualifiers.size > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          <span className="inline-block w-3 h-3 rounded-sm align-[-1px] mr-1 bg-green-200 dark:bg-green-900/40" />
          Playoff position on VP.
          <span className="inline-block w-3 h-3 rounded-sm align-[-1px] mx-1 ml-3 bg-green-400 dark:bg-green-600/50" />
          Wildcard — the highest-scoring team outside the top {autoSpots}.
        </p>
      )}
    </div>
  );
}
