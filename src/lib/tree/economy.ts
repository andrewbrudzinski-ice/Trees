/**
 * The Tree — economy constants and small pure helpers (spec §12, §6a).
 *
 * The reward amounts themselves live server-side in the check_in() RPC (that is
 * the only place seeds can be minted). These are the client-visible dials and
 * presentation helpers.
 */

/**
 * Seeds to plant a second tree — the number that decides when the account gate
 * appears for a guest (spec §6a/§12). Spec ships with 7 (the prototype used 5);
 * treat as tunable once the funnel is instrumented.
 */
export const SECOND_TREE_COST = 7;

/** The three free starter species (spec §6: "3 free at start"). */
export const FREE_SPECIES = ["maple", "oak", "pine"] as const;

/** Time-of-day salutation for the Home greeting. */
export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
