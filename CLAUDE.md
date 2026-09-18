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
| `lib/seeding.ts` | Playoff qualification, seeding, and round pairings |
| `lib/standings-view.ts` | The week-folding rules, shared by `aggregateStandings` and the standings table |
| `lib/rounds.ts` | Playoff round naming — the one definition every surface reads |
| `lib/use-media-query.ts` | `matchMedia` as a hook, for the VP chart's phone layout |
| `lib/history.ts` | Cross-season game log, head-to-head, Rivalry Week, record book |
| `lib/projections.ts` | Seeded Monte Carlo playoff projections for the season in progress |
| `lib/live-projections.ts` | Re-scores the week in progress on Sleeper's player projections |
| `lib/trades.ts` | Trade log, draft-slot derivation, and multi-hop pick lineage |
| `lib/archive.ts` | Snapshots a season into a committable JSON fixture |
| `lib/archive-data.ts` | Loads the committed archive and re-resolves governors on read |
| `data/archive/*.json` | Committed Sleeper snapshot per season — the offline source of truth |
| `data/ground-truth.json` | The league spreadsheet's figures, for the audit test |
| `data/players.json` | Player id to name/position, trimmed to the ids this league has used |
| `app/page.tsx` | Season dashboard |
| `app/history/*` | All-time stats, head-to-head, record book |
| `app/trades/page.tsx` | Trade tracker |
| `app/api/league/[leagueId]/season/[season]/route.ts` | Standings as JSON — a thin wrapper over `lib/season.ts` |
| `app/api/debug/governors/route.ts` | Reports rosters the governor registry cannot resolve. Must be empty |
| `app/api/debug/archive/route.ts` | Exports raw league data as JSON for offline fixtures |
| `components/Dashboard.tsx` | Tabbed shell — takes a single `SeasonStandings` |
| `components/StandingsTable.tsx` | Standings tab — playoff-field highlight, and the final/projected toggle |
| `components/VPChart.tsx` | VP Breakdown tab |
| `components/WeeklyVPGrid.tsx` | Weekly Grid tab |
| `components/PlayoffBracket.tsx` | Playoffs tab — absolutely-positioned bracket with drawn connectors |
| `components/HistoricalStats.tsx` | All-time stats table |
| `components/Podium.tsx` | 1st/2nd/3rd beside a completed bracket |
| `components/PlayoffProjections.tsx` | Odds table, seed heatmap, projected bracket |
| `components/HeadToHead.tsx` | Two-governor series lookup incl. Rivalry Week |
| `components/RecordBook.tsx` | All-time and per-position records |
| `components/TradeTracker.tsx` | Player search over every trade |
| `components/SegmentedControl.tsx` | The shared scope filter used by standings, head-to-head and stats |
| `components/vp-colors.ts` | The weekly-grid cell colours and their legend, in one place |
| `components/SiteHeader.tsx` / `SeasonSelector.tsx` | Shared header and nav |

---

## VP Scoring Rules

- **Matchup VP:** 2 pts for a head-to-head win; 0 for a loss.
- **Scoring VP:** 1 pt if your score lands in the top half of all teams that week.
- **Finale week (the last regular-season week, seasons 2021+):** No H2H matchup VPs. Top-half scoring earns **3 VP** instead of 1. A finale week also awards **no win or loss**, which is why a 14-week season still shows 13 games played.
- **Ties:** worth `TIE_VP` (1) to both sides, and counted as a tie rather than a win and a loss.
- **Byes:** a team with no opponent still scores and can still earn scoring VP.
- **Commissioner overrides:** See `VP_OVERRIDES` in `lib/config.ts`. Use `setResult: "win" | "loss"` to force a result — it recomputes the matchup VP for you — and `vpDelta` only for an award or penalty *on top* of the result. Multiple entries for the same governor and week accumulate.

---

## Playoffs

- **Field:** 6 teams through 2022, 7 from 2023. See `PLAYOFF_FORMAT` in `lib/config.ts`.
- **Qualification:** all but the last spot go to the VP standings, with points scored breaking ties. The **final spot is a wildcard** for the highest-scoring team not already in — which is how DanP made it in 2025 on 21 VP while Knute missed on 25, having outscored him 1664.0 to 1660.7.
- **Seeding:** the wildcard is always seeded last, never re-sorted into the field by VP.
- **Round 1:** the top seeds get byes (1 seed with a 7-team field, 1 and 2 with a 6-team field); everyone else pairs highest against lowest — 2v7, 3v6, 4v5.
- **Later rounds re-seed:** the top surviving seed always draws the lowest.
- **Third place** is the **better-seeded losing semi-finalist**. Sleeper generates a third-place game, but the league treats it as an exhibition — Eli won it in 2020 and Chris in 2022, yet Sam and DanK are the recorded third-place finishers.
- **Not every post-season game is a playoff game.** Sleeper schedules all 14 rosters every playoff week and posts one more week after the bracket ends, with scores but no pairings at all. `Game.postseason` in `lib/history.ts` sorts them into `bracket` / `consolation` / `exhibition` from the winners bracket; `isCounting` is the filter every all-time figure uses, so only real bracket games count. Round names come from `lib/rounds.ts` — never from a week number.

## Draft picks

Sleeper leaves `slot_to_roster_id` empty for this league, and a draft pick's `roster_id` is whoever actually *made* the selection, not whose pick it was. `deriveSlotOwners` in `lib/trades.ts` recovers the original owner by intersecting, across every round, the rosters that could have owned that slot given the traded-pick record. It resolves to a complete one-to-one mapping in all seven seasons — a test asserts that.

Because roster ids are scoped to one season's league, every cross-season hop (and pick trading is nothing else) goes through the governor name.

## Rivalry Week

The finale week is also **Rivalry Week**: the same seven pairings every season since 2021 — Ben/Peter, Brent/Knute, Chris/Mark, DanK/DanP, Eli/Sam, Jeremy/Matt, Johnathan/Josh.

It awards no head-to-head VP and no win or loss, so it is deliberately excluded from head-to-head records, points against, and the season W-L. `headToHead()` reports it separately as `rivalryWeek`, decided on the scores, purely for bragging rights.

## Record book positions

The league starts QB/RB/WR/TE (and occasionally FB) — no kickers, no defences. Positions are read from `data/players.json` rather than hardcoded, and a scoreless week never counts as a record, which also keeps stray misfiled players from each claiming a section.

To refresh the player map after a season, hit `/api/debug/players` and save the `players` object to `data/players.json`.

## The week in progress

`isWeekPlayed` calls a week played the moment any team scores, which is true at 1:05pm on a Sunday. `pendingWeeks` in `lib/season.ts` is what separates a live week from a settled one: it reads Sleeper's `/state/nfl` and falls back to the newest week's scores only when that call fails. **It returns `[]` for anything but `CURRENT_SEASON`** — that one guard is what keeps every archived season, the offline audit and the history pipelines byte-identical.

The standings table defaults to final-only and folds the live week back in on request. Folding happens client-side through `restrictTeam`, which is exact rather than approximate: every figure is per-week additive and each week's top-half cut is decided on that week alone. `lib/live.test.ts` proves it against a full recompute for every week of every archived season.

The second option folds that week in **projected** rather than live — its raw half-played score is deliberately not offered, since at 1:05pm on a Sunday it says every governor has scored ten points. `lib/live-projections.ts` re-scores each pending week per starter — a finished game counts at its real score, an unplayed one at its Sleeper projection, an in-progress one at whichever is higher — and `buildProjectedLive` in `lib/season.ts` runs those matchups back through `computeSeasonStandings`, so a projected week is scored by the same VP rules, top-half cut and overrides as a real one. It arrives as `projectedLive`, a complete second `teams` array.

Projections and the NFL schedule come from `api.sleeper.com`, which is undocumented and unversioned, so the whole path is best-effort: any failure drops `projectedLive`, and the toggle falls back to offering the live score, which is the only case in which the table shows a half-played week at face value. Nothing archived, audited or historical can reach this code — it only ever runs on a pending week, which only `CURRENT_SEASON` can have.

Live weeks are fetched at a 60-second cache (`LIVE_REVALIDATE`); everything that cannot change again stays at an hour. Projections sit between the two at 15 minutes — they move on injury news, not by the minute — while the NFL schedule that decides whether a starter's game is over is fetched live.

## Data sources

Completed seasons are read from `data/archive/`, not from Sleeper. Only `CURRENT_SEASON` hits the network, which is what lets `npm test` reconcile six seasons against the league spreadsheet with no network at all.

To refresh or add a season, hit `/api/debug/archive?season=YYYY` on a deployment that can reach Sleeper, save the JSON, and commit it. Governor identity is deliberately **not** stored in the archive — it is re-resolved on every read, so adding an alias fixes history without re-fetching.

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
