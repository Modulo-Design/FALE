// Shared types for the whole app.
//
// This module must stay free of runtime imports and side effects: client
// components import from it with `import type`, which is fully erased under
// isolatedModules, so nothing server-side is pulled into the browser bundle.
//
// NEVER redeclare these shapes inside a component. Six components used to keep
// structural copies, which meant adding one field here silently broke the build
// somewhere else.

// ---------------------------------------------------------------------------
// Victory Points
// ---------------------------------------------------------------------------

export interface WeeklyResult {
  rosterId: number;
  week: number;
  points: number;
  opponentRosterId: number | null;
  opponentPoints: number | null;
  won: boolean;
  /** True when the matchup finished exactly level. */
  tied: boolean;
  /** True when the team had no opponent that week. */
  bye: boolean;
  /**
   * True in a scoring-only finale week. Finale weeks award no head-to-head VP
   * and, critically, contribute no win or loss to the season record -- which is
   * why a 14-week season still shows 13 games played.
   */
  isFinale: boolean;
  /** 2 for a win, TIE_VP for a tie, 0 for a loss. Always 0 in a finale week. */
  vpMatchup: number;
  /** 1 for a top-half score, or FINALE_SCORING_VP in a finale week. */
  vpScoring: number;
  /** Commissioner adjustment applied on top of the computed VPs. */
  vpAdjustment: number;
  vp: number;
}

export interface TeamStanding {
  rosterId: number;
  userId?: string;
  governorName: string;
  displayName: string;
  avatar: string | null;
  totalVP: number;
  totalPoints: number;
  totalPointsAgainst: number;
  wins: number;
  losses: number;
  ties: number;
  weeklyResults: WeeklyResult[];
}

export interface SeasonStandings {
  season: string;
  leagueId: string;
  leagueName: string;
  weeksCompleted: number;
  regularSeasonWeeks: number;
  teams: TeamStanding[];
  playoffs?: PlayoffBracket;
  projections?: ProjectionOutput;
}

// ---------------------------------------------------------------------------
// Playoffs
// ---------------------------------------------------------------------------

export interface PlayoffTeamResult {
  rosterId: number;
  governorName: string;
  points: number;
  won: boolean;
}

export interface PlayoffMatchupResult {
  round: number;
  week: number;
  /** Sleeper placement marker: 1 = championship game, 3 = third-place game. */
  placement?: number;
  isBye?: boolean;
  /** True for a simulated matchup that has not been played yet. */
  projected?: boolean;
  teams: PlayoffTeamResult[];
}

export interface Podium {
  first: string;
  second: string;
  third?: string;
}

export interface PlayoffBracket {
  season: string;
  playoffWeekStart: number;
  /** Championship-line matchups only, ordered so the UI can draw connectors. */
  rounds: PlayoffMatchupResult[];
  champion?: string;
  runnerUp?: string;
  thirdPlace?: string;
  /** The p===3 placement game, kept out of `rounds` so bracket layout is unaffected. */
  thirdPlaceGame?: PlayoffMatchupResult;
  podium?: Podium;
  playoffTeams: number;
  byeCount: number;
  /** False for a bracket that is still in progress or purely projected. */
  complete: boolean;
  projected?: boolean;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface GovernorStats {
  governorName: string;
  seasonsPlayed: number;
  weekCount: number;
  totalPoints: number;
  avgPoints: number;
  highScore: number;
  lowScore: number;
  totalPointsAgainst: number;
  allPlayWins: number;
  allPlayLosses: number;
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

export interface ProjectedTeam {
  rosterId: number;
  governorName: string;
  currentVP: number;
  meanFinalVP: number;
  p10VP: number;
  p90VP: number;
  /** seedProbs[0] is the probability of finishing as the 1 seed. */
  seedProbs: number[];
  playoffOdds: number;
  byeOdds: number;
  titleOdds?: number;
}

export interface ProjectionOutput {
  strategy: "monte-carlo" | "pace";
  sims: number;
  weeksRemaining: number;
  teams: ProjectedTeam[];
  projectedBracket?: PlayoffBracket;
}
