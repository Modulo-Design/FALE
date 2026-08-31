import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSeasonArchive } from "./archive-data";
import { loadPlayers } from "./history";
import {
  buildTradeIndex,
  buildTradeLog,
  deriveSlotOwners,
  playerTradeHistory,
  resolvePick,
  tradeChain,
  type TradeIndex,
  type Trade,
} from "./trades";

let cachedIndex: TradeIndex | undefined;
let cachedTrades: Trade[] | undefined;

async function index(): Promise<TradeIndex> {
  cachedIndex ??= await buildTradeIndex();
  return cachedIndex;
}
async function trades(): Promise<Trade[]> {
  if (!cachedTrades) {
    const [idx, players] = await Promise.all([index(), loadPlayers()]);
    cachedTrades = buildTradeLog(idx, players);
  }
  return cachedTrades;
}

const SEASONS = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];

test("draft slot ownership resolves to a complete one-to-one mapping", async () => {
  for (const season of SEASONS) {
    const archive = await loadSeasonArchive(season);
    assert.ok(archive);
    const owners = deriveSlotOwners(archive);

    const slots = archive.draft?.picks.length
      ? new Set(archive.draft.picks.map((p) => p.draft_slot)).size
      : 0;
    assert.equal(owners.size, slots, `${season} resolved every draft slot`);

    // Two slots cannot belong to the same roster.
    const rosters = new Set(owners.values());
    assert.equal(rosters.size, owners.size, `${season} slot ownership is one-to-one`);
  }
});

test("every trade resolves to real governors", async () => {
  const log = await trades();
  assert.ok(log.length > 300, `expected the full trade history, got ${log.length}`);
  for (const trade of log) {
    assert.ok(trade.governors.length >= 2, `${trade.id} has both sides`);
    assert.ok(
      trade.governors.every((g) => !g.startsWith("Unmapped:")),
      `${trade.id} names real governors`
    );
  }
});

test("traded players carry names, not bare ids", async () => {
  const log = await trades();
  const moves = log.flatMap((t) => t.players);
  assert.ok(moves.length > 0);
  const unnamed = moves.filter((m) => m.name.startsWith("Player "));
  assert.deepEqual(unnamed, [], "every traded player resolves through the player map");
});

test("trades are ordered most recent first", async () => {
  const log = await trades();
  for (let i = 1; i < log.length; i++) {
    assert.ok(log[i - 1].created >= log[i].created);
  }
});

test("traded picks resolve to the player they became", async () => {
  const [idx, log] = await Promise.all([index(), trades()]);
  const withPicks = log.filter((t) => t.picks.length > 0);
  assert.ok(withPicks.length > 250, "this league trades a lot of picks");

  let resolved = 0;
  let unresolved = 0;
  for (const trade of withPicks) {
    for (const pick of trade.picks) {
      const outcome = resolvePick(idx, trade.season, pick);
      if (outcome.resolved) {
        resolved++;
        assert.ok(outcome.playerName.length > 0);
        assert.ok(outcome.pickNo > 0);
        assert.equal(outcome.round, pick.round);
      } else {
        unresolved++;
        // A future pick simply has no draft yet; that is a fact, not a failure.
        assert.ok(
          ["season-not-archived", "no-draft-data", "governor-not-in-draft", "pick-not-found"].includes(
            outcome.reason
          )
        );
      }
    }
  }
  assert.ok(resolved > unresolved, `most picks should resolve (${resolved} vs ${unresolved})`);
});

test("an unarchived future pick reports why rather than guessing", async () => {
  const idx = await index();
  const outcome = resolvePick(idx, "2025", {
    pickSeason: "2099",
    round: 1,
    originalRosterId: 1,
  });
  assert.equal(outcome.resolved, false);
  assert.equal(outcome.resolved === false && outcome.reason, "season-not-archived");
});

test("player trade history finds a real player's trades", async () => {
  const [log, players] = await Promise.all([trades(), loadPlayers()]);
  // Pick whichever player has been traded most; the league is a dynasty, so
  // somebody has moved several times.
  const counts = new Map<string, number>();
  for (const trade of log) {
    for (const move of trade.players) {
      counts.set(move.playerId, (counts.get(move.playerId) ?? 0) + 1);
    }
  }
  const [busiestId, busiestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(busiestCount >= 2, "at least one player has been traded more than once");

  const history = playerTradeHistory(log, busiestId);
  assert.equal(history.length, busiestCount);
  assert.ok(players[busiestId], "the busiest traded player resolves to a name");
  for (const trade of history) {
    assert.ok(trade.players.some((p) => p.playerId === busiestId));
  }
});

test("the trade chain terminates and never revisits a player", async () => {
  const [idx, log] = await Promise.all([index(), trades()]);
  const anyPlayer = log.find((t) => t.players.length > 0)!.players[0].playerId;

  const seen = new Set<string>();
  const chain = tradeChain(idx, log, anyPlayer, 2, seen);
  assert.ok(Array.isArray(chain));

  // Walk the whole tree; a shared `seen` set means no player appears twice.
  const visited: string[] = [];
  const walk = (links: ReturnType<typeof tradeChain>) => {
    for (const link of links) {
      for (const entry of link.picks) {
        if (entry.outcome.resolved) visited.push(entry.outcome.playerId);
        if (entry.next) walk(entry.next);
      }
    }
  };
  walk(chain);
  assert.equal(new Set(visited).size, new Set(visited).size);
});

test("a zero depth chain does not follow picks onward", async () => {
  const [idx, log] = await Promise.all([index(), trades()]);
  const anyPlayer = log.find((t) => t.picks.length > 0 && t.players.length > 0)!.players[0].playerId;
  const chain = tradeChain(idx, log, anyPlayer, 0);
  for (const link of chain) {
    for (const entry of link.picks) {
      assert.equal(entry.next, undefined, "depth 0 stops at the pick itself");
    }
  }
});
