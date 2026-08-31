import { Suspense } from "react";
import { loadPlayers } from "@/lib/history";
import { buildTradeIndex, buildTradeLog, resolveTrades } from "@/lib/trades";
import TradeTracker from "@/components/TradeTracker";
import Spinner from "@/components/Spinner";

export const metadata = { title: "Trades · FALE" };

async function Trades() {
  const [index, players] = await Promise.all([buildTradeIndex(), loadPlayers()]);
  const trades = resolveTrades(index, buildTradeLog(index, players));

  // Picks are resolved on the server so the client never needs the archive.
  const playerNames = Object.fromEntries(
    Object.entries(players).map(([id, info]) => [id, info.n])
  );

  return <TradeTracker trades={trades} playerNames={playerNames} />;
}

export default function TradesPage() {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Trade tracker</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        Every trade since 2020. Draft picks are traced to the player they became, across
        seasons — a pick traded in one year is resolved against the next year&apos;s draft.
      </p>
      <Suspense fallback={<Spinner />}>
        <Trades />
      </Suspense>
    </div>
  );
}
