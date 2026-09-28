"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import LiveWeekBanner from "./LiveWeekBanner";
import StandingsTable from "./StandingsTable";
import WeeklyVPGrid from "./WeeklyVPGrid";
import PlayoffBracket from "./PlayoffBracket";
import PlayoffProjections from "./PlayoffProjections";
import { VP_LEGEND, vpColor } from "./vp-colors";

const VPChart = dynamic(() => import("./VPChart"), { ssr: false });

import { isFinaleWeek } from "@/lib/config";
import { resolveLiveView, teamsForView, type LiveView } from "@/lib/standings-view";
import { useStoredChoice } from "@/lib/use-stored-choice";
import type { SeasonStandings } from "@/lib/types";

interface Props {
  data: SeasonStandings;
}

const TABS = ["Standings", "VP Breakdown", "Weekly Grid", "Playoffs"] as const;
type Tab = (typeof TABS)[number];

/** A stable identity for the common case, so the memos below do not churn. */
const NO_PENDING_WEEKS: number[] = [];

const LIVE_VIEWS: readonly LiveView[] = ["final", "live", "projected"];

export default function Dashboard({ data }: Props) {
  const {
    teams: standings,
    weeksCompleted,
    season,
    leagueName,
    playoffs,
    projections,
    pendingWeeks = NO_PENDING_WEEKS,
    liveStatus,
    projectedLive,
  } = data;
  const [tab, setTab] = useState<Tab>("Standings");

  // A week that is still being played is not a week completed, whatever the
  // grid needs to number its columns.
  const pendingCount = pendingWeeks.length;
  const weeksFinal = weeksCompleted - pendingCount;
  const firstPending = pendingCount > 0 ? Math.min(...pendingWeeks) : 0;
  const lastSettled = weeksFinal;
  const finalePending = pendingWeeks.some((week) => isFinaleWeek(week, season));

  // One Final / Including projections switch drives the standings, the VP
  // breakdown and the weekly grid alike, and is remembered across refreshes.
  const [storedView, setStoredView] = useStoredChoice("fale:standings-view", LIVE_VIEWS);
  const view = resolveLiveView(storedView, {
    hasPending: pendingCount > 0,
    canProject: pendingCount > 0 && projectedLive != null,
    hasSettled: weeksFinal > 0,
  });
  const rows = useMemo(
    () => teamsForView(view, standings, pendingWeeks, projectedLive),
    [view, standings, pendingWeeks, projectedLive]
  );
  const showLiveBanner = pendingCount > 0 && tab !== "Playoffs";

  // A season still being played shows what the bracket is likely to become,
  // rather than an empty one.
  const playoffTabLabel = projections ? "Playoff Projections" : "Playoffs";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{leagueName}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {season} Season · {weeksFinal} {weeksFinal === 1 ? "week" : "weeks"} completed
          {pendingCount > 0 && ` · week ${firstPending} in progress`}
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-green-500 text-green-600 dark:text-green-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {t === "Playoffs" ? playoffTabLabel : t}
          </button>
        ))}
      </div>

      {showLiveBanner && (
        <LiveWeekBanner
          firstPending={firstPending}
          lastSettled={lastSettled}
          finalePending={finalePending}
          liveStatus={liveStatus}
          projectedLive={projectedLive}
          view={view}
          onChange={setStoredView}
        />
      )}

      {tab === "Standings" && (
        <StandingsTable
          standings={rows}
          season={season}
          view={view}
          firstPending={firstPending}
        />
      )}

      {tab === "VP Breakdown" && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Green = matchup win VPs (2 pts). Light green = top-half scoring VPs (1 pt each week).
          </p>
          <VPChart standings={rows} />
        </div>
      )}

      {tab === "Weekly Grid" && (
        <div>
          <div className="flex gap-4 text-xs mb-3 flex-wrap">
            {VP_LEGEND.map((entry) => (
              <span key={entry.min} className="flex items-center gap-1">
                <span className={`inline-block w-5 h-5 rounded ${vpColor(entry.min)}`} />
                {entry.label}
              </span>
            ))}
          </div>
          <WeeklyVPGrid
            standings={rows}
            weeksCompleted={view === "final" ? weeksFinal : weeksCompleted}
            pendingWeeks={pendingWeeks}
            view={view}
          />
        </div>
      )}

      {tab === "Playoffs" &&
        (projections ? (
          <PlayoffProjections projections={projections} />
        ) : playoffs ? (
          <PlayoffBracket bracket={playoffs} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No playoff data available for this season.</p>
        ))}
    </div>
  );
}
