import { archivedSeasons, loadSeasonArchive, resolveArchiveRosters } from "./archive-data";
import { VP_OVERRIDES, isFinaleWeek } from "./config";
import type { SeasonArchive } from "./archive";

/**
 * One team's side of one game, across every season.
 *
 * Roster ids are not stable between seasons -- each year is a separate Sleeper
 * league -- so every cross-season join here goes through the governor name.
 */
export interface Game {
  season: string;
  week: number;
  phase: "regular" | "playoff";
  governorName: string;
  rosterId: number;
  opponent: string | null;
  points: number;
  opponentPoints: number | null;
  won: boolean;
  tied: boolean;
  /** Positive when this team won. Null for byes and finale weeks. */
  margin: number | null;
  isFinale: boolean;
  starters: string[];
  startersPoints: number[];
}

function gamesFromArchive(archive: SeasonArchive): Game[] {
  const names = new Map(
    resolveArchiveRosters(archive.season, archive.rosters).map((r) => [r.rosterId, r.governorName])
  );
  const games: Game[] = [];

  for (const week of archive.weeks) {
    if (!week.played) continue;
    const finale = isFinaleWeek(week.week, archive.season);
    const phase: Game["phase"] =
      week.week > archive.regularSeasonWeeks ? "playoff" : "regular";

    const groups = new Map<number, typeof week.matchups>();
    const unpaired: typeof week.matchups = [];
    for (const m of week.matchups) {
      if (m.matchupId == null) {
        unpaired.push(m);
        continue;
      }
      const group = groups.get(m.matchupId) ?? [];
      group.push(m);
      groups.set(m.matchupId, group);
    }

    const push = (
      m: (typeof week.matchups)[number],
      opp: (typeof week.matchups)[number] | null
    ) => {
      const governorName = names.get(m.rosterId) ?? `Roster ${m.rosterId}`;
      const tied = opp != null && m.points === opp.points;
      // A commissioner ruling decides the result regardless of what Sleeper
      // recorded, so the history book has to honour it too -- otherwise the
      // head-to-head records disagree with the standings.
      const ruling = VP_OVERRIDES.find(
        (o) =>
          o.season === archive.season &&
          o.week === week.week &&
          o.governorName === governorName &&
          o.setResult
      );
      games.push({
        season: archive.season,
        week: week.week,
        phase,
        governorName,
        rosterId: m.rosterId,
        opponent: opp ? (names.get(opp.rosterId) ?? `Roster ${opp.rosterId}`) : null,
        points: m.points,
        opponentPoints: opp ? opp.points : null,
        won: ruling ? ruling.setResult === "win" : opp != null && !tied && m.points > opp.points,
        tied: ruling ? false : tied,
        margin: opp && !finale ? Math.round((m.points - opp.points) * 100) / 100 : null,
        isFinale: finale,
        starters: m.starters ?? [],
        startersPoints: m.startersPoints ?? [],
      });
    };

    for (const group of groups.values()) {
      if (group.length === 2) {
        push(group[0], group[1]);
        push(group[1], group[0]);
      } else {
        for (const m of group) push(m, null);
      }
    }
    for (const m of unpaired) push(m, null);
  }

  return games;
}

export async function buildGameLog(): Promise<Game[]> {
  const games: Game[] = [];
  for (const season of archivedSeasons()) {
    const archive = await loadSeasonArchive(season);
    if (archive) games.push(...gamesFromArchive(archive));
  }
  return games.sort(
    (a, b) => a.season.localeCompare(b.season) || a.week - b.week || a.governorName.localeCompare(b.governorName)
  );
}

// ---------------------------------------------------------------------------
// Head to head
// ---------------------------------------------------------------------------

export interface HeadToHeadMeeting {
  season: string;
  week: number;
  phase: Game["phase"];
  points: number;
  opponentPoints: number;
  won: boolean;
  tied: boolean;
  margin: number;
}

export interface HeadToHeadSplit {
  season: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Rivalry Week: the finale-week pairing.
 *
 * It awards no VP for the head-to-head and does not count toward anyone's
 * record, so it sits outside the main series -- but the two teams are still
 * matched up, and the league plays it for bragging rights.
 */
export interface RivalryWeekRecord {
  wins: number;
  losses: number;
  ties: number;
  meetings: HeadToHeadMeeting[];
}

export interface HeadToHeadResult {
  governorA: string;
  governorB: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  avgFor: number;
  avgAgainst: number;
  perSeason: HeadToHeadSplit[];
  meetings: HeadToHeadMeeting[];
  biggestWin?: HeadToHeadMeeting;
  biggestLoss?: HeadToHeadMeeting;
  /** Positive for a current win streak, negative for a losing one. */
  streak: number;
  /** Finale-week meetings, kept out of the record above. */
  rivalryWeek: RivalryWeekRecord;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Every meeting between two governors, from A's perspective.
 *
 * Finale weeks are excluded: Sleeper pairs teams that week but it is scored
 * league-wide, so it is not a head-to-head meeting and the league does not
 * count it as one. Including it would put every pair on seven games instead of
 * the six their round robin actually produces.
 */
export function headToHead(log: Game[], a: string, b: string): HeadToHeadResult {
  const toMeeting = (g: Game): HeadToHeadMeeting => ({
    season: g.season,
    week: g.week,
    phase: g.phase,
    points: g.points,
    opponentPoints: g.opponentPoints!,
    won: g.won,
    tied: g.tied,
    margin: round2(g.points - g.opponentPoints!),
  });

  const paired = log.filter(
    (g) => g.governorName === a && g.opponent === b && g.opponentPoints != null
  );
  const meetings: HeadToHeadMeeting[] = paired.filter((g) => !g.isFinale).map(toMeeting);

  const rivalryMeetings = paired
    .filter((g) => g.isFinale)
    .map((g) => {
      const meeting = toMeeting(g);
      // The finale awards no result, so decide Rivalry Week on the scores.
      meeting.tied = meeting.points === meeting.opponentPoints;
      meeting.won = !meeting.tied && meeting.points > meeting.opponentPoints;
      return meeting;
    });

  const rivalryWeek: RivalryWeekRecord = {
    wins: rivalryMeetings.filter((m) => m.won).length,
    losses: rivalryMeetings.filter((m) => !m.won && !m.tied).length,
    ties: rivalryMeetings.filter((m) => m.tied).length,
    meetings: rivalryMeetings,
  };

  const splits = new Map<string, HeadToHeadSplit>();
  let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;

  for (const m of meetings) {
    let split = splits.get(m.season);
    if (!split) {
      split = { season: m.season, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
      splits.set(m.season, split);
    }
    if (m.tied) { ties++; split.ties++; }
    else if (m.won) { wins++; split.wins++; }
    else { losses++; split.losses++; }
    pointsFor += m.points;
    pointsAgainst += m.opponentPoints;
    split.pointsFor = round2(split.pointsFor + m.points);
    split.pointsAgainst = round2(split.pointsAgainst + m.opponentPoints);
  }

  const decided = meetings.filter((m) => !m.tied);
  let streak = 0;
  for (let i = decided.length - 1; i >= 0; i--) {
    const won = decided[i].won;
    if (streak === 0) streak = won ? 1 : -1;
    else if (won === streak > 0) streak += won ? 1 : -1;
    else break;
  }

  const byMargin = [...meetings].sort((x, y) => y.margin - x.margin);
  const best = byMargin[0];
  const worst = byMargin[byMargin.length - 1];

  return {
    governorA: a,
    governorB: b,
    wins, losses, ties,
    pointsFor: round2(pointsFor),
    pointsAgainst: round2(pointsAgainst),
    avgFor: meetings.length ? round2(pointsFor / meetings.length) : 0,
    avgAgainst: meetings.length ? round2(pointsAgainst / meetings.length) : 0,
    perSeason: [...splits.values()].sort((x, y) => x.season.localeCompare(y.season)),
    meetings,
    biggestWin: best && best.margin > 0 ? best : undefined,
    biggestLoss: worst && worst.margin < 0 ? worst : undefined,
    streak,
    rivalryWeek,
  };
}

// ---------------------------------------------------------------------------
// Record book
// ---------------------------------------------------------------------------

export interface PlayerInfo {
  n: string;
  p: string | null;
  t: string | null;
}
export type PlayerMap = Record<string, PlayerInfo>;

export interface RecordEntry {
  value: number;
  governorName: string;
  season: string;
  week: number;
  phase: Game["phase"];
  opponent?: string | null;
  opponentPoints?: number | null;
  playerName?: string;
  position?: string;
}

export interface RecordBook {
  highestWeek: RecordEntry[];
  lowestWeek: RecordEntry[];
  biggestBlowouts: RecordEntry[];
  closestMatchups: RecordEntry[];
  highestCombined: RecordEntry[];
  lowestCombined: RecordEntry[];
  /** Best single week by a started player, keyed by position. */
  byPosition: Record<string, RecordEntry[]>;
  /** Positions are only available once data/players.json is committed. */
  hasPlayerData: boolean;
}

const TOP_N = 10;

/**
 * Display order for positions. Anything present in the data but not listed
 * here still gets a record section, sorted after these -- the league runs no
 * kickers or defences, but that is a league setting, not an assumption worth
 * baking in.
 */
export const POSITION_ORDER = ["QB", "RB", "WR", "TE", "FB", "K", "DEF"];

export function sortPositions(positions: string[]): string[] {
  return [...positions].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a);
    const bi = POSITION_ORDER.indexOf(b);
    return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi) ||
      a.localeCompare(b);
  });
}

function base(game: Game, value: number): RecordEntry {
  return {
    value: round2(value),
    governorName: game.governorName,
    season: game.season,
    week: game.week,
    phase: game.phase,
    opponent: game.opponent,
    opponentPoints: game.opponentPoints,
  };
}

function top(entries: RecordEntry[], desc = true): RecordEntry[] {
  return [...entries].sort((a, b) => (desc ? b.value - a.value : a.value - b.value)).slice(0, TOP_N);
}

export function recordBook(log: Game[], players?: PlayerMap): RecordBook {
  // A team that never set a lineup is not a record, so ignore zero-score weeks
  // when ranking lows -- but keep them everywhere else.
  const scored = log.filter((g) => g.points > 0);

  const weekly = scored.map((g) => base(g, g.points));

  const decided = log.filter(
    (g) => g.margin != null && g.opponentPoints != null && g.points > 0 && g.opponentPoints > 0
  );
  const wins = decided.filter((g) => g.won);

  const blowouts = wins.map((g) => base(g, g.margin!));
  const closest = wins
    .filter((g) => g.margin! > 0)
    .map((g) => base(g, g.margin!));

  // Each matchup appears twice in the log, once per side; dedupe on the pair.
  const seen = new Set<string>();
  const combined: RecordEntry[] = [];
  for (const g of decided) {
    const key = [g.season, g.week, ...[g.governorName, g.opponent].sort()].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(base(g, g.points + (g.opponentPoints ?? 0)));
  }

  const byPosition: Record<string, RecordEntry[]> = {};
  if (players) {
    const buckets = new Map<string, RecordEntry[]>();
    for (const game of log) {
      for (let i = 0; i < game.starters.length; i++) {
        const id = game.starters[i];
        if (!id || id === "0") continue;
        const info = players[id];
        const position = info?.p;
        if (!position) continue;
        const points = game.startersPoints[i];
        // A scoreless week is not a record. This also drops the stray
        // defensive players who were started once and never scored, which
        // would otherwise each get a section of their own.
        if (typeof points !== "number" || points <= 0) continue;
        const entry = base(game, points);
        entry.playerName = info.n;
        entry.position = position;
        const bucket = buckets.get(position) ?? [];
        bucket.push(entry);
        buckets.set(position, bucket);
      }
    }
    for (const [position, entries] of buckets) {
      byPosition[position] = top(entries);
    }
  }

  return {
    highestWeek: top(weekly),
    lowestWeek: top(weekly, false),
    biggestBlowouts: top(blowouts),
    closestMatchups: top(closest, false),
    highestCombined: top(combined),
    lowestCombined: top(combined, false),
    byPosition,
    hasPlayerData: Boolean(players),
  };
}

/**
 * The committed player map: id -> name, position, team.
 *
 * Trimmed from Sleeper's full dictionary to only the ids this league has used,
 * so positional records work offline without a multi-megabyte download.
 */
export async function loadPlayers(): Promise<PlayerMap> {
  const mod = await import("../data/players.json");
  return mod.default as PlayerMap;
}
