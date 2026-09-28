"use client";

import SegmentedControl from "./SegmentedControl";
import type { LiveView } from "@/lib/standings-view";
import type { LiveStatus, ProjectedLiveStandings } from "@/lib/types";

interface Props {
  /** The earliest week still being played. */
  firstPending: number;
  /** The last settled week, or 0 when nothing is settled yet. */
  lastSettled: number;
  finalePending: boolean;
  liveStatus?: LiveStatus;
  projectedLive?: ProjectedLiveStandings;
  view: LiveView;
  onChange: (view: LiveView) => void;
}

/**
 * Central time, which is where the whole league lives.
 *
 * Both the zone and the locale are pinned rather than left to the viewer: this
 * renders on the server first, and a timestamp formatted in the machine's own
 * locale or zone would come back different in the browser and break hydration.
 * `timeZoneName` rides along so the label says CDT or CST on its own, without
 * anything here having to know when the clocks change.
 */
const CENTRAL_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function asOf(iso: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return "";
  return CENTRAL_CLOCK.format(stamp);
}

/**
 * The week-in-progress notice and its Final / Including projections switch.
 *
 * One switch for the standings, the VP breakdown and the weekly grid, so the
 * three tabs can never show three different readings of the same week.
 */
export default function LiveWeekBanner({
  firstPending,
  lastSettled,
  finalePending,
  liveStatus,
  projectedLive,
  view,
  onChange,
}: Props) {
  // The projected table is an offer, not a promise: Sleeper's projection feed
  // is undocumented, so a season in progress can perfectly well have none.
  const canProject = projectedLive != null;

  return (
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
            no head-to-head VP at all, so the cut swings much harder than in a normal
            week.
          </>
        )}
      </p>
      <SegmentedControl
        label="Standings scope"
        value={view}
        onChange={onChange}
        options={[
          { value: "final", label: "Final", title: `Through week ${lastSettled}` },
          canProject
            ? {
                value: "projected" as const,
                label: `Including projections`,
                title: `Week ${firstPending} as it is projected to finish`,
              }
            : {
                value: "live" as const,
                label: `Including week ${firstPending}`,
                title: `Week ${firstPending} at its live score -- Sleeper had no projections to work from`,
              },
        ]}
      />
      {!canProject && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Sleeper had no projections for week {firstPending}, so the only thing on
          offer is its live score — which is worth as little as the week is young.
        </p>
      )}
      {view === "projected" && projectedLive && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Week {firstPending} scored on Sleeper&apos;s projections:{" "}
          {projectedLive.projectedStarters}{" "}
          {projectedLive.projectedStarters === 1 ? "starter" : "starters"} still to
          finish count at their projection, and the{" "}
          {projectedLive.finalStarters} whose games are over count at their real
          score. Every VP here is a forecast, including the top-half cut.
        </p>
      )}
      {view === "final" && !lastSettled && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          No completed weeks yet — every figure below is zero until week {firstPending}{" "}
          finishes.
        </p>
      )}
    </div>
  );
}
