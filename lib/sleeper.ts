const BASE = "https://api.sleeper.app/v1";
const PLAYERS_URL = `${BASE}/players/nfl`;

// Projections and the NFL schedule live on the newer host, which has no /v1.
const PROJECTIONS_BASE = "https://api.sleeper.com";

export class SleeperError extends Error {
  constructor(readonly path: string, readonly status: number) {
    super(`Sleeper request failed: ${path} returned ${status}`);
    this.name = "SleeperError";
  }
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  metadata?: { team_name?: string | null } | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  status: string;
  previous_league_id?: string | null;
  settings: {
    playoff_week_start: number;
    playoff_teams?: number;
  };
  /** Only `rec` is read, to pick the projection feed's scoring column. */
  scoring_settings?: Record<string, number> | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    ppts: number;
    ppts_decimal: number;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  /** Null when the roster was not scheduled against anyone that week. */
  matchup_id: number | null;
  points: number;
  /** Player ids in starting-lineup slot order. */
  starters: string[];
  /** Points per starter, index-aligned with `starters`. */
  starters_points: number[];
  /** Every rostered player id, starters included. */
  players: string[];
  /** Points keyed by player id, bench included. */
  players_points: Record<string, number>;
}

export interface SleeperBracketMatchup {
  r: number; // round
  m: number; // match id
  t1: number | null; // roster_id, known seed
  t2: number | null;
  w: number | null; // winning roster_id, once played
  l: number | null; // losing roster_id, once played
  t1_from?: { w?: number; l?: number } | null; // t1 advances from winner/loser of match m
  t2_from?: { w?: number; l?: number } | null;
  p?: number; // placement game (1 = championship, 3 = third place)
}

export interface SleeperTransaction {
  transaction_id: string;
  type: string;
  status: string;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: {
    season: string;
    round: number;
    roster_id: number; // roster the pick originally belonged to
    previous_owner_id: number;
    owner_id: number;
  }[];
  waiver_budget: { sender: number; receiver: number; amount: number }[];
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface SleeperDraft {
  draft_id: string;
  season: string;
  status: string;
  slot_to_roster_id: Record<string, number>;
}

export interface SleeperDraftPick {
  draft_id: string;
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  player_id: string;
  metadata?: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
  };
}

export interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
}

export interface SleeperNflState {
  season: string;
  week: number;
  season_type: string;
  display_week: number;
}

/** One player's projection for one week, as the projections feed returns it. */
export interface SleeperProjection {
  player_id: string;
  /** The player's NFL team, which is how a projection is tied to a kickoff. */
  team?: string | null;
  opponent?: string | null;
  /** Keyed by scoring format: pts_ppr, pts_half_ppr, pts_std, plus raw stats. */
  stats?: Record<string, number> | null;
}

/** One NFL game, used only for whether it has finished. */
export interface SleeperScheduleGame {
  game_id?: string;
  status?: string | null;
  home?: string | null;
  away?: string | null;
}

/** An hour is right for everything that cannot change again. */
const DEFAULT_REVALIDATE = 3600;

/** What the week in progress is fetched at, so live scores are actually live. */
export const LIVE_REVALIDATE = 60;

export interface SleeperFetchOptions {
  /** Cache lifetime in seconds. Defaults to an hour. */
  revalidate?: number;
}

async function fetchJson<T>(
  url: string,
  label: string,
  fallback?: T,
  options: SleeperFetchOptions = {}
): Promise<T> {
  const res = await fetch(url, {
    next: { revalidate: options.revalidate ?? DEFAULT_REVALIDATE },
  });
  if (!res.ok) {
    if (fallback !== undefined) return fallback;
    throw new SleeperError(label, res.status);
  }
  return (await res.json()) as T;
}

async function sleeperFetch<T>(
  path: string,
  fallback?: T,
  options: SleeperFetchOptions = {}
): Promise<T> {
  return fetchJson<T>(`${BASE}${path}`, path, fallback, options);
}

export function getLeague(leagueId: string): Promise<SleeperLeague> {
  return sleeperFetch<SleeperLeague>(`/league/${leagueId}`);
}

export function getRosters(leagueId: string): Promise<SleeperRoster[]> {
  return sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`);
}

export function getUsers(leagueId: string): Promise<SleeperUser[]> {
  return sleeperFetch<SleeperUser[]>(`/league/${leagueId}/users`);
}

export function getMatchups(
  leagueId: string,
  week: number,
  options?: SleeperFetchOptions
): Promise<SleeperMatchup[]> {
  return sleeperFetch<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`, [], options);
}

export function getWinnersBracket(leagueId: string): Promise<SleeperBracketMatchup[]> {
  return sleeperFetch<SleeperBracketMatchup[]>(`/league/${leagueId}/winners_bracket`, []);
}

export function getLosersBracket(leagueId: string): Promise<SleeperBracketMatchup[]> {
  return sleeperFetch<SleeperBracketMatchup[]>(`/league/${leagueId}/losers_bracket`, []);
}

export function getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
  return sleeperFetch<SleeperTransaction[]>(`/league/${leagueId}/transactions/${week}`, []);
}

export function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
  return sleeperFetch<SleeperTradedPick[]>(`/league/${leagueId}/traded_picks`, []);
}

export function getDrafts(leagueId: string): Promise<SleeperDraft[]> {
  return sleeperFetch<SleeperDraft[]>(`/league/${leagueId}/drafts`, []);
}

export function getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
  return sleeperFetch<SleeperDraftPick[]>(`/draft/${draftId}/picks`, []);
}

/**
 * Which week the NFL is actually on.
 *
 * Cached for a minute, not an hour: it is what decides whether the dashboard
 * calls a week final, so an hour-stale answer would keep a finished week
 * flagged as in progress well past the last whistle.
 */
export function getNflState(): Promise<SleeperNflState> {
  return sleeperFetch<SleeperNflState>("/state/nfl", undefined, {
    revalidate: LIVE_REVALIDATE,
  });
}

/**
 * The full NFL player dictionary: 5-10 MB.
 *
 * NEVER call this from a page render or a route handler. It is meant for
 * scripts/sync-archive.ts, which fetches it once and commits a trimmed map of
 * only the player ids this league has actually used.
 */
export async function getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
  const res = await fetch(PLAYERS_URL, { cache: "no-store" });
  if (!res.ok) throw new SleeperError("/players/nfl", res.status);
  return (await res.json()) as Record<string, SleeperPlayer>;
}

/** The only positions this league starts, so the projection feed stays small. */
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "FB"];

/** Projections move on injury news, not by the minute. */
const PROJECTION_REVALIDATE = 900;

/**
 * Every skill player's projection for one week.
 *
 * This is the newer api.sleeper.com host rather than the documented /v1 API, so
 * it is treated as best-effort everywhere: an empty array simply means the
 * projected standings view is not offered.
 */
export function getWeekProjections(
  season: string,
  week: number,
  options?: SleeperFetchOptions
): Promise<SleeperProjection[]> {
  const params = new URLSearchParams({ season_type: "regular", order_by: "ppr" });
  for (const position of PROJECTION_POSITIONS) params.append("position[]", position);
  const path = `/projections/nfl/${season}/${week}?${params}`;
  return fetchJson<SleeperProjection[]>(`${PROJECTIONS_BASE}${path}`, path, [], {
    revalidate: PROJECTION_REVALIDATE,
    ...options,
  });
}

/**
 * The week's NFL games, for whether a starter's game has finished.
 *
 * Fetched at the live cadence: it is what decides whether a player counts at
 * his real score or his projection, so a stale answer holds a finished player
 * at his projection long after the whistle.
 */
export function getWeekSchedule(
  season: string,
  week: number,
  options?: SleeperFetchOptions
): Promise<SleeperScheduleGame[]> {
  const path = `/schedule/nfl/regular/${season}/${week}`;
  return fetchJson<SleeperScheduleGame[]>(`${PROJECTIONS_BASE}${path}`, path, [], {
    revalidate: LIVE_REVALIDATE,
    ...options,
  });
}
