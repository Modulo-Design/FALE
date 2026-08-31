"use client";

import { useMemo, useState } from "react";
import type { ResolvedTrade } from "@/lib/trades";

interface Props {
  trades: ResolvedTrade[];
  /** Player id to display name, for the search box. */
  playerNames: Record<string, string>;
}

function PickLine({ pick }: { pick: ResolvedTrade["picks"][number] }) {
  const { outcome } = pick;
  return (
    <li className="text-xs text-gray-600 dark:text-gray-400">
      <span className="font-medium text-gray-800 dark:text-gray-200">
        {pick.pickSeason} round {pick.round}
      </span>
      {pick.originalGovernor && (
        <span className="text-gray-400 dark:text-gray-500"> (via {pick.originalGovernor})</span>
      )}
      {outcome.resolved ? (
        <>
          <span className="text-gray-400 dark:text-gray-500"> → </span>
          <span className="font-medium text-green-700 dark:text-green-400">
            {outcome.playerName}
          </span>
          <span className="text-gray-400 dark:text-gray-500">
            {outcome.position ? ` (${outcome.position})` : ""} · pick {outcome.pickNo}
            {outcome.draftedBy ? `, drafted by ${outcome.draftedBy}` : ""}
          </span>
        </>
      ) : (
        <span className="text-gray-400 dark:text-gray-500 italic">
          {outcome.reason === "season-not-archived" || outcome.reason === "no-draft-data"
            ? " — not drafted yet"
            : outcome.reason === "governor-not-in-draft"
              ? " — owner left the league before the draft"
              : " — could not be traced"}
        </span>
      )}
    </li>
  );
}

function TradeCard({ trade, highlight }: { trade: ResolvedTrade; highlight?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {trade.governors.join(" ↔ ")}
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {trade.season} · week {trade.week}
        </span>
      </div>

      {trade.players.length > 0 && (
        <ul className="space-y-1">
          {trade.players.map((player) => (
            <li
              key={`${player.playerId}-${player.toGovernor}`}
              className={`text-sm ${
                player.playerId === highlight
                  ? "font-semibold text-green-800 dark:text-green-300"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {player.name}
              {player.position && (
                <span className="text-gray-400 dark:text-gray-500"> ({player.position})</span>
              )}
              <span className="text-gray-400 dark:text-gray-500">
                {" "}
                {player.fromGovernor ?? "—"} → {player.toGovernor}
              </span>
            </li>
          ))}
        </ul>
      )}

      {trade.picks.length > 0 && (
        <ul className="space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2">
          {trade.picks.map((pick, i) => (
            <PickLine key={`${pick.pickSeason}-${pick.round}-${i}`} pick={pick} />
          ))}
        </ul>
      )}

      {trade.faab.length > 0 && (
        <ul className="border-t border-gray-100 dark:border-gray-800 pt-2">
          {trade.faab.map((f, i) => (
            <li key={i} className="text-xs text-gray-500 dark:text-gray-400">
              ${f.amount} FAAB · {f.fromGovernor ?? "—"} → {f.toGovernor ?? "—"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TradeTracker({ trades, playerNames }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Only players who were actually traded are worth offering.
  const tradedPlayers = useMemo(() => {
    const ids = new Set(trades.flatMap((t) => t.players.map((p) => p.playerId)));
    return [...ids]
      .map((id) => ({ id, name: playerNames[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [trades, playerNames]);

  // Once a player is chosen the query holds their exact name, which would
  // otherwise keep matching and leave the dropdown hanging open.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || selected) return [];
    return tradedPlayers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, tradedPlayers, selected]);

  const shown = useMemo(
    () => (selected ? trades.filter((t) => t.players.some((p) => p.playerId === selected)) : trades.slice(0, 25)),
    [trades, selected]
  );

  const selectedName = selected ? (playerNames[selected] ?? selected) : null;

  return (
    <div className="space-y-5">
      <div className="relative max-w-sm">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder={`Search ${tradedPlayers.length} traded players…`}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setSelected(p.id);
                    setQuery(p.name);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {selectedName ? (
          <>
            {shown.length} {shown.length === 1 ? "trade" : "trades"} involving{" "}
            <span className="font-medium text-gray-700 dark:text-gray-200">{selectedName}</span>.{" "}
            <button
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              className="text-green-600 dark:text-green-400 hover:underline"
            >
              Clear
            </button>
          </>
        ) : (
          <>Showing the {shown.length} most recent of {trades.length} trades. Search a player to filter.</>
        )}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {shown.map((trade) => (
          <TradeCard key={trade.id} trade={trade} highlight={selected ?? undefined} />
        ))}
      </div>
    </div>
  );
}
