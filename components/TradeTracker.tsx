"use client";

import { Fragment, useMemo, useState } from "react";
import type { ResolvedTrade } from "@/lib/trades";
import SegmentedControl from "./SegmentedControl";

type Order = "newest" | "oldest";

const ORDER_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

// A fixed zone, so the server and the browser agree on which day a late-night
// trade landed on.
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

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

function TradeCard({
  trade,
  highlight,
  team,
}: {
  trade: ResolvedTrade;
  highlight?: string;
  /** The team being filtered on, listed first so every card reads from its side. */
  team?: string;
}) {
  const governors = team
    ? [team, ...trade.governors.filter((g) => g !== team)]
    : trade.governors;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {governors.join(" ↔ ")}
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {DATE_FORMAT.format(trade.created)} · week {trade.week}
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
  const [team, setTeam] = useState<string>("");
  const [order, setOrder] = useState<Order>("newest");

  // Only governors who have actually made a trade are worth offering.
  const teams = useMemo(
    () => [...new Set(trades.flatMap((t) => t.governors))].sort(),
    [trades]
  );

  // Only players who were actually traded are worth offering -- and with a
  // team picked, only the ones that team traded.
  const tradedPlayers = useMemo(() => {
    const ids = new Set(
      trades
        .filter((t) => !team || t.governors.includes(team))
        .flatMap((t) => t.players.map((p) => p.playerId))
    );
    return [...ids]
      .map((id) => ({ id, name: playerNames[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [trades, playerNames, team]);

  // Once a player is chosen the query holds their exact name, which would
  // otherwise keep matching and leave the dropdown hanging open.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || selected) return [];
    return tradedPlayers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, tradedPlayers, selected]);

  const shown = useMemo(() => {
    const filtered = trades.filter(
      (t) =>
        (!team || t.governors.includes(team)) &&
        (!selected || t.players.some((p) => p.playerId === selected))
    );
    return filtered.sort((a, b) =>
      order === "newest" ? b.created - a.created : a.created - b.created
    );
  }, [trades, team, selected, order]);

  const selectedName = selected ? (playerNames[selected] ?? selected) : null;

  const filterLabel = [team && `made by ${team}`, selectedName && `involving ${selectedName}`]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          aria-label="Filter by team"
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
        >
          <option value="">All teams</option>
          {teams.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div className="relative w-full max-w-sm">
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

        <SegmentedControl options={ORDER_OPTIONS} value={order} onChange={setOrder} label="Order" />
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {filterLabel ? (
          <>
            {shown.length} {shown.length === 1 ? "trade" : "trades"} {filterLabel}.{" "}
            <button
              onClick={() => {
                setTeam("");
                setSelected(null);
                setQuery("");
              }}
              className="text-green-600 dark:text-green-400 hover:underline"
            >
              Clear
            </button>
          </>
        ) : (
          <>All {trades.length} trades. Pick a team or search a player to filter.</>
        )}
      </p>

      <div className="space-y-4">
        {shown.map((trade, i) => (
          <Fragment key={trade.id}>
            {/* A heading wherever the season changes, so the timeline stays readable. */}
            {trade.season !== shown[i - 1]?.season && (
              <h3 className="pt-2 text-sm font-bold text-gray-900 dark:text-gray-100">
                {trade.season}
              </h3>
            )}
            <TradeCard
              trade={trade}
              highlight={selected ?? undefined}
              team={team || undefined}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
