@AGENTS.md

# FALE — Fantasy League Analytics Engine

Next.js app that pulls live data from the Sleeper Fantasy Football API and displays standings using a custom Victory Points (VP) scoring system.

Run locally: `npm run dev` (port 3000). Build check: `npm run build`.

---

## Architecture

| Path | Role |
|---|---|
| `lib/config.ts` | Governor name map, league IDs by season, VP overrides, `CURRENT_SEASON` |
| `lib/sleeper.ts` | Sleeper API fetch wrappers: `getLeague`, `getRosters`, `getUsers`, `getMatchups` |
| `lib/vp.ts` | VP logic: `calculateWeekVPs`, `applyVPOverrides`, `aggregateStandings` |
| `lib/historical.ts` | Fetches and aggregates stats across all seasons for the Historical tab |
| `app/api/league/[leagueId]/season/[season]/route.ts` | Single GET endpoint; computes full standings with VP overrides applied; 1-hour cache |
| `app/page.tsx` | Server component; fetches standings for the current season and renders Dashboard |
| `components/Dashboard.tsx` | Tabbed shell — passes full standings down to each tab component |
| `components/StandingsTable.tsx` | Standings tab |
| `components/VPChart.tsx` | VP Breakdown tab — stacked bar using `weeklyResults` for accurate matchup/scoring split |
| `components/PointsChart.tsx` | Points tab |
| `components/WeeklyVPGrid.tsx` | Weekly Grid tab |
| `components/HistoricalStats.tsx` | Historical tab |

---

## VP Scoring Rules

- **Matchup VP:** 2 pts for a head-to-head win; 0 for a loss.
- **Scoring VP:** 1 pt if your score lands in the top half of all teams that week.
- **Finale week (Week 14, seasons 2021+):** No H2H matchup VPs. Top-half scoring earns **3 VP** instead of 1.
- **Commissioner overrides:** See `VP_OVERRIDES` in `lib/config.ts`. Each entry adds `vpDelta` to a specific governor's VP for a specific week. A win-to-loss override uses `vpDelta: -2` (negates the +2 matchup VP the team earned in Sleeper).

---

## Configuration Guide

### Add a new season
1. Get the Sleeper league ID from the app URL (`sleeper.com/leagues/<ID>`).
2. Add it to `LEAGUE_IDS` in `lib/config.ts`.
3. Update `CURRENT_SEASON` if needed.

### Add or change a governor
Edit `GOVERNOR_NAMES` in `lib/config.ts`. Keys are Sleeper usernames **lowercased**; values are display names. A governor with multiple Sleeper accounts gets one entry per username pointing to the same display name.

### Add a commissioner VP override
Append to `VP_OVERRIDES` in `lib/config.ts`:

```ts
{
  season: "2025",        // string year
  week: 6,               // regular season week number
  governorName: "Chris", // must match a GOVERNOR_NAMES value exactly
  vpDelta: -2,           // negative to penalise, positive to award
  reason: "Illegal lineup; auto-loss awarded",
}
```
