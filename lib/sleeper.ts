const BASE = "https://api.sleeper.app/v1";

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  status: string;
  settings: {
    playoff_week_start: number;
  };
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
  matchup_id: number;
  points: number;
  starters_points: number[];
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
  p?: number; // placement game (1 = championship)
}

export async function getLeague(leagueId: string): Promise<SleeperLeague> {
  const res = await fetch(`${BASE}/league/${leagueId}`, { next: { revalidate: 3600 } });
  return res.json();
}

export async function getRosters(leagueId: string): Promise<SleeperRoster[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/rosters`, { next: { revalidate: 3600 } });
  return res.json();
}

export async function getUsers(leagueId: string): Promise<SleeperUser[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/users`, { next: { revalidate: 3600 } });
  return res.json();
}

export async function getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/matchups/${week}`, { next: { revalidate: 3600 } });
  return res.json();
}

export async function getLeagueHistory(leagueId: string): Promise<SleeperLeague[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/previous_winner_roster_id`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  return res.json();
}

export async function getWinnersBracket(leagueId: string): Promise<SleeperBracketMatchup[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/winners_bracket`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  return res.json();
}

export async function getLosersBracket(leagueId: string): Promise<SleeperBracketMatchup[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/losers_bracket`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  return res.json();
}
