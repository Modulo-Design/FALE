import { NextResponse, type NextRequest } from "next/server";
import { collectPlayerIds, trimPlayers } from "@/lib/archive-data";
import { getAllPlayers } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Player names and positions for every player this league has used.
 *
 * Sleeper's player dictionary is 5-10 MB and must never be fetched during a
 * render. This route pulls it once, trims it to the ids that actually appear in
 * the committed archive, and returns a map small enough to commit -- which is
 * what makes positional records ("best TE week ever") possible offline.
 *
 * Save the response to data/players.json.
 */
export async function GET(req: NextRequest) {
  const requiredToken = process.env.ARCHIVE_TOKEN;
  if (requiredToken && req.nextUrl.searchParams.get("token") !== requiredToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [ids, players] = await Promise.all([collectPlayerIds(), getAllPlayers()]);

    const { players: trimmed, missing } = trimPlayers(ids, players);

    return NextResponse.json(
      { count: Object.keys(trimmed).length, requested: ids.length, missing, players: trimmed },
      { headers: { "Content-Disposition": 'inline; filename="players.json"' } }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to build player map", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
