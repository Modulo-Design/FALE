import { NextResponse, type NextRequest } from "next/server";
import { LEAGUE_IDS } from "@/lib/config";
import { buildSeasonArchive, type ArchiveScope } from "@/lib/archive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Export raw league data as a single JSON document.
 *
 * Sleeper is not reachable from every environment this project is worked on
 * from, so this endpoint exists to snapshot a season into a file that can be
 * committed as a fixture. Once data/archive/ is populated this route can go.
 *
 *   /api/debug/archive?season=2020            one season, core data (small)
 *   /api/debug/archive?season=2020&scope=deep adds starters and player points
 *   /api/debug/archive?season=all             every season, core data
 *
 * Set ARCHIVE_TOKEN in the environment to require ?token=... Without it the
 * endpoint is open, which is fine for a private league but means anyone who
 * guesses the URL can bulk-read it.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const requiredToken = process.env.ARCHIVE_TOKEN;
  if (requiredToken && searchParams.get("token") !== requiredToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope: ArchiveScope = searchParams.get("scope") === "deep" ? "deep" : "core";
  const seasonParam = searchParams.get("season") ?? "all";

  const seasons =
    seasonParam === "all"
      ? Object.keys(LEAGUE_IDS).sort()
      : seasonParam.split(",").map((s) => s.trim()).filter(Boolean);

  const unknown = seasons.filter((s) => !LEAGUE_IDS[s]);
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown season(s): ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Sequential: a whole-league fetch is hundreds of upstream requests, and
    // hammering them in parallel risks rate limiting mid-export.
    const archives = [];
    for (const season of seasons) {
      archives.push(await buildSeasonArchive(season, scope));
    }

    return NextResponse.json(
      { scope, seasons, archives },
      { headers: { "Content-Disposition": `inline; filename="fale-${scope}.json"` } }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to build archive", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
