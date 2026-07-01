import { getRosters, getUsers, getMatchups, SleeperUser } from "../lib/sleeper";
import { calculateWeekVPs, applyVPOverrides, aggregateStandings } from "../lib/vp";
import { LEAGUE_IDS, GOVERNOR_NAMES, VP_OVERRIDES } from "../lib/config";

const SEASONS = ["2020", "2021", "2022", "2023", "2024", "2025"];
const REGULAR_SEASON_WEEKS = 14;

function canonicalName(user: SleeperUser | undefined): string {
  const sleeperName = (user?.username ?? user?.display_name ?? "").toLowerCase();
  return GOVERNOR_NAMES[sleeperName] ?? user?.display_name ?? user?.username ?? "UNKNOWN";
}

async function main() {
  const table: Record<string, Record<string, number>> = {};
  const rosterMappings: Record<string, { rosterId: number; owner: string; canonical: string }[]> = {};

  for (const season of SEASONS) {
    const leagueId = LEAGUE_IDS[season];
    const [rosters, users] = await Promise.all([getRosters(leagueId), getUsers(leagueId)]);
    const userMap = new Map(users.map((u) => [u.user_id, u]));

    const governorToRoster = new Map<string, number>();
    const rosterToGovernor = new Map<number, string>();
    const mappingLog: { rosterId: number; owner: string; canonical: string }[] = [];
    for (const r of rosters) {
      const user = r.owner_id ? userMap.get(r.owner_id) : undefined;
      const name = canonicalName(user);
      rosterToGovernor.set(r.roster_id, name);
      governorToRoster.set(name, r.roster_id);
      mappingLog.push({ rosterId: r.roster_id, owner: user?.username ?? user?.display_name ?? "??", canonical: name });
    }
    rosterMappings[season] = mappingLog;

    const weekPromises = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) =>
      getMatchups(leagueId, i + 1).catch(() => [])
    );
    const allWeekMatchups = await Promise.all(weekPromises);
    const completedWeeks = allWeekMatchups
      .map((week, i) => ({ week, weekNum: i + 1 }))
      .filter(({ week }) => week.length > 0 && week.some((m) => m.points > 0));

    const weeklyVPs = completedWeeks.map(({ week, weekNum }) => {
      const raw = calculateWeekVPs(week, rosters.length, weekNum, season);
      const adjustments = VP_OVERRIDES.filter((o) => o.season === season && o.week === weekNum)
        .map((o) => ({ rosterId: governorToRoster.get(o.governorName) ?? -1, vpDelta: o.vpDelta }))
        .filter((a) => a.rosterId !== -1);
      return applyVPOverrides(raw, adjustments);
    });

    const standings = aggregateStandings(weeklyVPs);

    for (const s of standings.values()) {
      const name = rosterToGovernor.get(s.rosterId) ?? "UNKNOWN";
      if (!table[name]) table[name] = {};
      table[name][season] = (table[name][season] ?? 0) + s.totalVP;
    }

    console.error(`season ${season}: ${completedWeeks.length} completed weeks, ${rosters.length} rosters`);
  }

  console.log("\n=== Roster -> Governor mapping per season ===");
  for (const season of SEASONS) {
    console.log(`\n${season}:`);
    for (const m of rosterMappings[season]) {
      console.log(`  roster ${m.rosterId}: owner=${m.owner} -> ${m.canonical}`);
    }
  }

  console.log("\n=== Computed VP table ===");
  const allNames = Object.keys(table).sort();
  console.log(["Governor", ...SEASONS].join("\t"));
  for (const name of allNames) {
    console.log([name, ...SEASONS.map((s) => table[name][s] ?? "")].join("\t"));
  }

  console.log("\nJSON:");
  console.log(JSON.stringify(table, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
