/**
 * Re-snapshot completed seasons from Sleeper into data/archive/, and refresh
 * data/players.json to cover every player id they mention.
 *
 *   npx tsx scripts/sync-archive.ts            every completed season
 *   npx tsx scripts/sync-archive.ts 2023 2024  just these
 *
 * Needs a network that can reach api.sleeper.app. Seasons are written in the
 * "deep" scope -- lineups, the full roster with every bench score, and the
 * lineup slots -- which is what the MVP ranking is built on.
 *
 * The current season is pulled too but never written: its committed snapshot
 * only gets replaced once the season is over. Its player ids still go into
 * data/players.json, so this year's waiver pickups have names and positions.
 */
import { writeFile } from "node:fs/promises";
import { buildSeasonArchive, type SeasonArchive } from "../lib/archive";
import { collectPlayerIds, committedArchives, trimPlayers } from "../lib/archive-data";
import { ARCHIVED_SEASONS, CURRENT_SEASON } from "../lib/config";
import { getAllPlayers } from "../lib/sleeper";

/**
 * The committed files' layout: keys sorted as strings, one-space indent,
 * non-ASCII escaped, trailing newline. Hand-rolled because a JS object always lists integer-like
 * keys -- every player id -- numerically, whatever order they were added in.
 */
function stable(value: unknown): string {
  const ascii = (json: string) =>
    json.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const write = (v: unknown, indent: string): string => {
    const inner = indent + " ";
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      return `[\n${v.map((x) => inner + write(x, inner)).join(",\n")}\n${indent}]`;
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort();
      if (keys.length === 0) return "{}";
      const body = keys.map((k) => `${inner}${ascii(JSON.stringify(k))}: ${write((v as Record<string, unknown>)[k], inner)}`);
      return `{\n${body.join(",\n")}\n${indent}}`;
    }
    return ascii(JSON.stringify(v) ?? "null");
  };
  return write(value, "") + "\n";
}

async function main() {
  const requested = process.argv.slice(2);
  const seasons = requested.length > 0 ? requested : ARCHIVED_SEASONS;
  const unknown = seasons.filter((s) => !ARCHIVED_SEASONS.includes(s));
  if (unknown.length > 0) throw new Error(`Not a completed season: ${unknown.join(", ")}`);

  const fresh = new Map<string, SeasonArchive>();
  for (const season of seasons) {
    const archive = await buildSeasonArchive(season, "deep");
    const played = archive.weeks.filter((w) => w.played);
    const benched = played.filter((w) => w.matchups.some((m) => Object.keys(m.playersPoints ?? {}).length > 0));
    if (played.length === 0 || benched.length !== played.length) {
      throw new Error(`${season}: ${benched.length}/${played.length} played weeks came back with bench scores`);
    }
    await writeFile(`data/archive/${season}.json`, stable(archive));
    fresh.set(season, archive);
    console.log(`${season}: ${played.length} played weeks, ${archive.rosterPositions?.length ?? 0} lineup slots`);
  }

  const current = await buildSeasonArchive(CURRENT_SEASON, "deep").catch(() => null);
  const archives = (await committedArchives()).map((a) => fresh.get(a.season) ?? a);
  if (current) archives.push(current);

  const { players, missing } = trimPlayers(await collectPlayerIds(archives), await getAllPlayers());
  // A player Sleeper has since dropped keeps the name and position on file.
  const previous = (await import("../data/players.json")).default as typeof players;
  for (const id of missing) if (previous[id]) players[id] = previous[id];
  await writeFile("data/players.json", stable(players));
  console.log(`players.json: ${Object.keys(players).length} players, ${missing.length} ids Sleeper no longer knows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
