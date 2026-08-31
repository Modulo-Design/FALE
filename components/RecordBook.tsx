"use client";

import { useState } from "react";
import type { RecordBook as RecordBookData, RecordEntry } from "@/lib/history";
import { sortPositions } from "@/lib/history";

interface Props {
  book: RecordBookData;
}

interface Section {
  title: string;
  blurb: string;
  entries: RecordEntry[];
  unit?: string;
}

function EntryRow({ entry, rank, unit }: { entry: RecordEntry; rank: number; unit?: string }) {
  return (
    <li className="flex items-baseline gap-3 py-1.5">
      <span className="w-5 shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">{rank}</span>
      <span className="w-16 shrink-0 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100">
        {entry.value.toFixed(entry.value % 1 === 0 ? 0 : 2)}
        {unit}
      </span>
      <span className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
        {entry.playerName ? (
          <>
            <span className="font-medium text-gray-900 dark:text-gray-100">{entry.playerName}</span>
            <span className="text-gray-400 dark:text-gray-500"> · {entry.governorName}</span>
          </>
        ) : (
          <span className="font-medium text-gray-900 dark:text-gray-100">{entry.governorName}</span>
        )}
        {entry.opponent && !entry.playerName && (
          <span className="text-gray-400 dark:text-gray-500"> vs {entry.opponent}</span>
        )}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">
        {entry.season} wk{entry.week}
      </span>
    </li>
  );
}

function Card({ section }: { section: Section }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? section.entries : section.entries.slice(0, 5);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{section.title}</h3>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{section.blurb}</p>
      <ol className="divide-y divide-gray-100 dark:divide-gray-800">
        {shown.map((entry, i) => (
          <EntryRow
            key={`${entry.season}-${entry.week}-${entry.governorName}-${entry.playerName ?? ""}`}
            entry={entry}
            rank={i + 1}
            unit={section.unit}
          />
        ))}
      </ol>
      {section.entries.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-green-600 dark:text-green-400 hover:underline"
        >
          {expanded ? "Show less" : `Show all ${section.entries.length}`}
        </button>
      )}
    </div>
  );
}

export default function RecordBook({ book }: Props) {
  const teamSections: Section[] = [
    {
      title: "Highest scoring weeks",
      blurb: "Best single week by any team, any season.",
      entries: book.highestWeek,
    },
    {
      title: "Lowest scoring weeks",
      blurb: "Worst week that still put points on the board.",
      entries: book.lowestWeek,
    },
    {
      title: "Biggest blowouts",
      blurb: "Largest margin of victory.",
      entries: book.biggestBlowouts,
    },
    {
      title: "Closest matchups",
      blurb: "Smallest margin that still decided a game.",
      entries: book.closestMatchups,
    },
    {
      title: "Highest combined scores",
      blurb: "Both teams added together — the best games to watch.",
      entries: book.highestCombined,
    },
    {
      title: "Lowest combined scores",
      blurb: "Both teams added together — the worst.",
      entries: book.lowestCombined,
    },
  ];

  const positions = sortPositions(Object.keys(book.byPosition));

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2">
        {teamSections.map((section) => (
          <Card key={section.title} section={section} />
        ))}
      </div>

      {book.hasPlayerData && positions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Best weeks by position
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Started players only. Positions come from the league&apos;s own rosters, which is
            why there are no kickers or defences here.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {positions.map((position) => (
              <Card
                key={position}
                section={{
                  title: position,
                  blurb: `Highest scoring ${position} weeks on record.`,
                  entries: book.byPosition[position],
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
