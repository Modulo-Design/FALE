/**
 * The weekly grid's cell colours, and the legend that explains them.
 *
 * These lived in two places -- the grid had dark-mode variants, the legend in
 * Dashboard did not -- so in dark mode the 1 VP and 0 VP swatches showed
 * colours no cell in the grid ever used. One export now feeds both.
 *
 * Class strings stay written out in full so Tailwind's scanner still sees them.
 */
export function vpColor(vp: number): string {
  if (vp >= 3) return "bg-green-500 text-white";
  if (vp === 2) return "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100";
  if (vp === 1) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100";
  return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
}

/**
 * One entry per colour band, with the VP value that produces it.
 *
 * The top band is 3 *or more*: a finale week pays 3 VP for top-half scoring on
 * its own, and a commissioner award can push a week past that. The 1 VP band
 * also covers a tie, not just a loss with a top-half score.
 */
export const VP_LEGEND = [
  { min: 3, label: "3+ VP (win + top half)" },
  { min: 2, label: "2 VP (win only)" },
  { min: 1, label: "1 VP (top half, or tie)" },
  { min: 0, label: "0 VP" },
] as const;
