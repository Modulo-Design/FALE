import { NextResponse, type NextRequest } from "next/server";
import { LEAGUE_IDS } from "@/lib/config";
import { fetchSeasonStandings } from "@/lib/season";

/**
 * Standings for one season as JSON.
 *
 * A thin wrapper over the same lib/season.ts pipeline the dashboard renders
 * from. It used to reimplement that pipeline, and the two had already drifted
 * apart on governor naming.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leagueId: string; season: string }> }
) {
  const { leagueId, season } = await params;

  const configuredLeagueId = LEAGUE_IDS[season];
  if (!configuredLeagueId) {
    return NextResponse.json({ error: `Unknown season ${season}` }, { status: 404 });
  }
  if (leagueId !== configuredLeagueId) {
    return NextResponse.json(
      { error: `League ${leagueId} does not match the configured league for ${season}` },
      { status: 400 }
    );
  }

  try {
    const standings = await fetchSeasonStandings(season);
    return NextResponse.json(standings);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch league data" }, { status: 500 });
  }
}
