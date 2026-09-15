/**
 * Playoff round naming, in one place.
 *
 * Every season the league has played runs a three-round bracket, but nothing
 * here hardcodes that: the name is counted back from the final round, so a
 * format change adds a "Playoffs Rd n" column rather than mislabelling the
 * semifinal. Consolation games and the dead trailing week Sleeper posts after
 * the bracket are not rounds at all and never reach this function.
 */
export function playoffRoundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd <= 0) return "Championship";
  if (fromEnd === 1) return "Semifinal";
  return `Playoffs Rd ${round}`;
}

/**
 * Sleeper's placement marker, when the game is a placement game rather than a
 * step on the championship line. `p === 1` is the championship itself, so it
 * falls through to the round name.
 */
export function placementGameLabel(placement: number | undefined): string | null {
  if (placement == null || placement === 1) return null;
  if (placement === 3) return "Third-place game";
  if (placement === 5) return "Fifth-place game";
  return `${placement}th-place game`;
}
