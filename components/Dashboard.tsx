"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import StandingsTable from "./StandingsTable";
import WeeklyVPGrid from "./WeeklyVPGrid";
import PlayoffBracket from "./PlayoffBracket";
import PlayoffProjections from "./PlayoffProjections";
import { VP_LEGEND, vpColor } from "./vp-colors";

const VPChart = dynamic(() => import("./VPChart"), { ssr: false });

import type { SeasonStandings } from "@/lib/types";

interface Props {
  data: SeasonStandings;
}

const TABS = ["Standings", "VP Breakdown", "Weekly Grid", "Playoffs"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard({ data }: Props) {
  const {
    teams: standings,
    weeksCompleted,
    season,
    leagueName,
    playoffs,
    projections,
    pendingWeeks,
    liveStatus,
    projectedLive,
  } = data;
  const [tab, setTab] = useState<Tab>("Standings");

  // A week that is still being played is not a week completed, whatever the
  // grid needs to number its columns.
  const pendingCount = pendingWeeks?.length ?? 0;
  const weeksFinal = weeksCompleted - pendingCount;

  // A season still being played shows what the bracket is likely to become,
  // rather than an empty one.
  const playoffTabLabel = projections ? "Playoff Projections" : "Playoffs";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{leagueName}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {season} Season · {weeksFinal} {weeksFinal === 1 ? "week" : "weeks"} completed
          {pendingCount > 0 && ` · week ${Math.min(...pendingWeeks!)} in progress`}
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

      {tab === "Standings" && (
        <StandingsTable
          standings={standings}
          season={season}
          pendingWeeks={pendingWeeks}
          liveStatus={liveStatus}
          projectedLive={projectedLive}
        />
      )}

      {tab === "VP Breakdown" && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Green = matchup win VPs (2 pts). Light green = top-half scoring VPs (1 pt each week).
          </p>
          <VPChart standings={standings} />
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
            standings={standings}
            weeksCompleted={weeksCompleted}
            pendingWeeks={pendingWeeks}
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
