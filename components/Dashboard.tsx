"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import StandingsTable from "./StandingsTable";
import WeeklyVPGrid from "./WeeklyVPGrid";

const VPChart = dynamic(() => import("./VPChart"), { ssr: false });
const PointsChart = dynamic(() => import("./PointsChart"), { ssr: false });

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
  userId?: string;
  displayName: string;
  avatar: string | null;
  totalVP: number;
  totalPoints: number;
  wins: number;
  losses: number;
  weeklyResults: WeeklyResult[];
}

interface Props {
  standings: TeamStanding[];
  weeksCompleted: number;
  season: string;
  leagueName: string;
}

const TABS = ["Standings", "VP Breakdown", "Points", "Weekly Grid"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard({ standings, weeksCompleted, season, leagueName }: Props) {
  const [tab, setTab] = useState<Tab>("Standings");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{leagueName}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {season} Season · {weeksCompleted} weeks completed
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
            {t}
          </button>
        ))}
      </div>

      {tab === "Standings" && <StandingsTable standings={standings} />}

      {tab === "VP Breakdown" && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Green = matchup win VPs (2 pts). Light green = top-half scoring VPs (1 pt each week).
          </p>
          <VPChart standings={standings} />
        </div>
      )}

      {tab === "Points" && <PointsChart standings={standings} />}

      {tab === "Weekly Grid" && (
        <div>
          <div className="flex gap-4 text-xs mb-3 flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded bg-green-500" /> 3 VP (W + top half)</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded bg-green-200" /> 2 VP (W only)</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded bg-yellow-100" /> 1 VP (L + top half)</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded bg-red-100" /> 0 VP</span>
          </div>
          <WeeklyVPGrid standings={standings} weeksCompleted={weeksCompleted} />
        </div>
      )}
    </div>
  );
}
