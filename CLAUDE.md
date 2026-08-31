@AGENTS.md

# FALE — Fantasy League Analytics Engine

Next.js app that pulls live data from the Sleeper Fantasy Football API and displays standings using a custom Victory Points (VP) scoring system.

Run locally: `npm run dev` (port 3000). Before pushing: `npm run typecheck && npm test && npm run lint && npm run build`.

`npm run lint` reports 3 pre-existing errors (1 `react-hooks/error-boundaries` in `app/page.tsx`, 2 `react-hooks/static-components` in `components/StandingsTable.tsx`). Leave the count at 3 or fix them; do not add to it.

---

## Architecture

| Path | Role |
|---|---|
| `lib/config.ts` | League IDs by season, VP overrides, playoff formats, season lengths, `CURRENT_SEASON` |
| `lib/governors.ts` | Governor registry: canonical people, their Sleeper aliases, and roster resolution |
| `lib/types.ts` | Every shared type. Components import from here — never redeclare these shapes |
| `lib/sleeper.ts` | Sleeper API wrappers: leagues, rosters, users, matchups, brackets, transactions, drafts, players |
| `lib/vp.ts` | VP logic: `calculateWeekVPs`, `applyVPOverrides`, `aggregateStandings` |
| `lib/season.ts` | `computeSeasonStandings` (pure) and `fetchSeasonStandings` — the one standings pipeline |
| `lib/playoffs.ts` | Bracket reconstruction, bye detection, third-place capture, podium |
| `lib/historical.ts` | Cross-season aggregation for the Historical tab, including all-play records |
| `lib/archive.ts` | Snapshots a season into a committable JSON fixture |
| `app/page.tsx` | Server component; renders Dashboard or the Historical view |
| `app/api/league/[leagueId]/season/[season]/route.ts` | Standings as JSON — a thin wrapper over `lib/season.ts` |
| `app/api/debug/governors/route.ts` | Reports rosters the governor registry cannot resolve. Must be empty |
| `app/api/debug/archive/route.ts` | Exports raw league data as JSON for offline fixtures |
| `components/Dashboard.tsx` | Tabbed shell — takes a single `SeasonStandings` |
| `components/StandingsTable.tsx` | Standings tab |
| `components/VPChart.tsx` | VP Breakdown tab |
| `components/PointsChart.tsx` | Points tab |
| `components/WeeklyVPGrid.tsx` | Weekly Grid tab |
| `components/PlayoffBracket.tsx` | Playoffs tab — absolutely-positioned bracket with drawn connectors |
| `components/HistoricalStats.tsx` | Historical tab |
| `components/SeasonSelector.tsx` | Season / Historical navigation pills |

---

## VP Scoring Rules

- **Matchup VP:** 2 pts for a head-to-head win; 0 for a loss.
- **Scoring VP:** 1 pt if your score lands in the top half of all teams that week.
- **Finale week (the last regular-season week, seasons 2021+):** No H2H matchup VPs. Top-half scoring earns **3 VP** instead of 1. A finale week also awards **no win or loss**, which is why a 14-week season still shows 13 games played.
- **Ties:** worth `TIE_VP` (1) to both sides, and counted as a tie rather than a win and a loss.
- **Byes:** a team with no opponent still scores and can still earn scoring VP.
- **Commissioner overrides:** See `VP_OVERRIDES` in `lib/config.ts`. Use `setResult: "win" | "loss"` to force a result — it recomputes the matchup VP for you — and `vpDelta` only for an award or penalty *on top* of the result. Multiple entries for the same governor and week accumulate.

---

## Configuration Guide

### Add a new season
1. Get the Sleeper league ID from the app URL (`sleeper.com/leagues/<ID>`).
2. Add it to `LEAGUE_IDS` in `lib/config.ts`.
3. Update `CURRENT_SEASON` if needed.

### Add or change a governor
Edit `GOVERNORS` in `lib/governors.ts`. Each entry is a person, with `aliases` holding every lowercased Sleeper **username, display name and team name** they have used. Someone with two accounts gets both usernames in one entry.

After any roster change, hit `/api/debug/governors` and confirm `unmappedTotal` is 0. An unresolved roster renders as `Unmapped: <name>` — this is deliberate. The app used to fall back to the raw Sleeper display name, which silently invented a governor called "TurtMoans" out of Mike's team name.

### Add a commissioner VP override
Append to `VP_OVERRIDES` in `lib/config.ts`:

```ts
{
  season: "2025",         // string year
  week: 6,                // regular season week number
  governorName: "Chris",  // must match a canonical name in lib/governors.ts
  setResult: "loss",      // forces the result and recomputes matchup VP
  vpDelta: -2,            // optional extra penalty on top of the forced result
  reason: "Illegal lineup; auto-loss awarded",
}
```
