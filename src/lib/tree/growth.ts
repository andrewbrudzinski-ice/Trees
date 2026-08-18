/**
 * The Tree — server-authoritative growth, age, and health math (spec §9–11).
 *
 * Every value here is a **pure function of timestamps** (`planted_at`,
 * `last_visit_at`, `last_watered_at`) against a caller-supplied `now`. Nothing
 * is stored as a current value where it can be derived — that is both the
 * anti-cheat backbone (spec §14, "server owns time") and the thing that makes
 * "3 years old" trustworthy. The client requests render state; it never
 * computes age, stage, or health itself.
 *
 * Ported from the prototype's `growthT` / `ageFactor` / `stageInfo` /
 * `recomputeHealth`. Where the prototype and `the-tree-spec.md` disagree, the
 * spec wins — see the note on `ageFactor` below.
 */

export const DAY_MS = 86_400_000;

/** Anything that can name a moment in time. */
export type DateInput = Date | number | string;

/** The eight biological stages, one per integer day 0–7 (spec §9). */
export const STAGES = [
  { day: 0, label: "Seed", glyph: "🌱" },
  { day: 1, label: "Sprout", glyph: "🌱" },
  { day: 2, label: "Seedling", glyph: "🌿" },
  { day: 3, label: "Sapling", glyph: "🌿" },
  { day: 4, label: "Young Tree", glyph: "🌳" },
  { day: 5, label: "Growing Tree", glyph: "🌳" },
  { day: 6, label: "Large Tree", glyph: "🌳" },
  { day: 7, label: "Mature Tree", glyph: "🌳" },
] as const;
export type Stage = (typeof STAGES)[number];

/** Post-maturity age tiers (labels only; the visual evolves via `ageFactor`). */
export const AGE_TIERS = [
  { day: 7, label: "Mature", glyph: "🌳" },
  { day: 30, label: "Established", glyph: "🌳" },
  { day: 100, label: "Old", glyph: "🌳" },
  { day: 365, label: "Ancient", glyph: "🌲" },
  { day: 1000, label: "Legendary", glyph: "🌲" },
  { day: 2000, label: "Elder", glyph: "🌲" },
] as const;
export type AgeTier = (typeof AGE_TIERS)[number];

/**
 * Upper bound on `ageFactor`.
 *
 * Spec §10's formula names a hard cap of ~2.6, but that cap makes the curve
 * saturate at ~day 188 — which contradicts the same section's "grows slowly and
 * indefinitely" and the §17.3 gate ("a 7-day, 365-day, and 2000-day tree each
 * read distinctly — the ageFactor curve must keep diverging"). We keep the
 * spec's ×1.15 multiplier but raise the ceiling to 4.0 so the factor keeps
 * growing across the entire named lifespan (Elder at day 2000 ≈ 3.80, unclipped)
 * and only plateaus far beyond it. Decision confirmed with the product owner.
 */
export const MAX_AGE_FACTOR = 4.0;

// --- Health tuning (spec §11: gentle) ---------------------------------------
/** Days after last care before decay begins. */
export const HEALTH_GRACE_DAYS = 1;
/** Percentage points of health lost per day, after the grace period. */
export const HEALTH_DECAY_PER_DAY = 9;
/** Health never falls below this in the MVP — nothing dies (spec §11). */
export const HEALTH_FLOOR = 18;
export const HEALTH_MAX = 100;
/** Restore amounts for the two care actions (spec §11); used from Step 4/5. */
export const VISIT_RESTORE = 15;
export const WATER_RESTORE = 22;

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Normalize any DateInput to epoch milliseconds. */
export function toMs(t: DateInput): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return new Date(t).getTime();
}

/** Milliseconds a tree has been alive; never negative (server clock only). */
export function ageMs(plantedAt: DateInput, now: DateInput = Date.now()): number {
  return Math.max(0, toMs(now) - toMs(plantedAt));
}

/** Age in fractional days. */
export function ageDays(plantedAt: DateInput, now: DateInput = Date.now()): number {
  return ageMs(plantedAt, now) / DAY_MS;
}

/** Whole days of age (what the UI shows as "12d"). */
export function ageDaysInt(plantedAt: DateInput, now: DateInput = Date.now()): number {
  return Math.floor(ageDays(plantedAt, now));
}

/**
 * Continuous growth `g = min(1, ageDays / 7)` (spec §9). Drives smooth visual
 * interpolation so a tree *grows* rather than snapping between stages.
 */
export function growth(plantedAt: DateInput, now: DateInput = Date.now()): number {
  return Math.min(1, ageDays(plantedAt, now) / 7);
}

/** Discrete biological stage index `min(7, floor(ageDays))` (spec §9). */
export function stageIndex(plantedAt: DateInput, now: DateInput = Date.now()): number {
  return Math.min(7, ageDaysInt(plantedAt, now));
}

/** The named stage for a tree (Seed … Mature Tree). */
export function stage(plantedAt: DateInput, now: DateInput = Date.now()): Stage {
  return STAGES[stageIndex(plantedAt, now)];
}

/**
 * Post-maturity age factor driving visual complexity (spec §10):
 *
 *     ageFactor = clamp(0, log10(ageDays − 6) × 1.15, 2.6)
 *
 * Zero until maturity (day 7), then grows slowly and indefinitely toward the
 * cap. We keep the spec's ×1.15 multiplier; the ceiling is raised from the
 * literal ~2.6 to MAX_AGE_FACTOR so the curve keeps diverging through Elder
 * (see the note on MAX_AGE_FACTOR — this resolves an internal §10 contradiction,
 * confirmed with the product owner). The prototype's ×1.28 is not used.
 */
export function ageFactor(plantedAt: DateInput, now: DateInput = Date.now()): number {
  const d = ageDays(plantedAt, now);
  if (d <= 7) return 0;
  return clamp(0, Math.log10(d - 6) * 1.15, MAX_AGE_FACTOR);
}

/**
 * The highest age tier a tree has reached, or `null` while it is still in the
 * 0–7 day biological phase (before "Mature").
 */
export function ageTier(plantedAt: DateInput, now: DateInput = Date.now()): AgeTier | null {
  const d = ageDaysInt(plantedAt, now);
  let tier: AgeTier | null = null;
  for (const t of AGE_TIERS) {
    if (d >= t.day) tier = t;
  }
  return tier;
}

/** The most recent moment of care; decay is measured from here (spec §11). */
function lastCareMs(input: TreeTimestamps, now: number): number {
  const planted = toMs(input.planted_at);
  let last = planted;
  if (input.last_visit_at != null) last = Math.max(last, toMs(input.last_visit_at));
  if (input.last_watered_at != null) last = Math.max(last, toMs(input.last_watered_at));
  // Guard against a future timestamp (clock skew): never care "in the future".
  return Math.min(last, now);
}

/** The timestamp inputs health derives from. */
export type TreeTimestamps = {
  planted_at: DateInput;
  last_visit_at?: DateInput | null;
  last_watered_at?: DateInput | null;
};

/**
 * Health as a pure derivation from timestamps (spec §11): full health through a
 * one-day grace period, then ~9%/day decay, floored so nothing dies in the MVP.
 * A visit or water resets the relevant timestamp, which restores health on the
 * next read — so health is fully reconstructable from the ledger, and
 * `health_cache` on the row is only a read optimization.
 */
export function health(input: TreeTimestamps, now: DateInput = Date.now()): number {
  const nowMs = toMs(now);
  const sinceDays = (nowMs - lastCareMs(input, nowMs)) / DAY_MS;
  if (sinceDays <= HEALTH_GRACE_DAYS) return HEALTH_MAX;
  const decayed = HEALTH_MAX - (sinceDays - HEALTH_GRACE_DAYS) * HEALTH_DECAY_PER_DAY;
  return Math.round(clamp(HEALTH_FLOOR, decayed, HEALTH_MAX));
}

/** Apply a care restore to a health value, clamped to 100 (spec §11). */
export function restoreHealth(current: number, amount: number): number {
  return Math.min(HEALTH_MAX, current + amount);
}

/**
 * A whimsical "height" for display, derived from growth + age (spec §7 Inspect
 * shows height). Purely cosmetic; ported from the prototype's formula.
 */
export function heightCm(g: number, factor: number): number {
  return Math.round(4 + g * 180 + factor * 120);
}

/** Human word for a health value (matches the prototype's thresholds). */
export function healthWord(h: number): string {
  if (h >= 90) return "Thriving";
  if (h >= 70) return "Healthy";
  if (h >= 45) return "Dry";
  if (h >= 28) return "Wilting";
  return "Struggling";
}

/** The full derived render state the client requests for a tree (spec §9–11). */
export type TreeRenderState = {
  ageMs: number;
  ageDays: number;
  ageDaysInt: number;
  growth: number;
  stageIndex: number;
  stage: Stage;
  ageFactor: number;
  tier: AgeTier | null;
  heightCm: number;
  health: number;
  healthWord: string;
};

/**
 * One call that derives everything renderable about a tree from its timestamps
 * and the server clock. This is the shape a render/inspect endpoint returns;
 * the client never recomputes any of it.
 */
export function computeTreeState(
  input: TreeTimestamps,
  now: DateInput = Date.now(),
): TreeRenderState {
  const nowMs = toMs(now);
  const planted = input.planted_at;
  const h = health(input, nowMs);
  const g = growth(planted, nowMs);
  const factor = ageFactor(planted, nowMs);
  return {
    ageMs: ageMs(planted, nowMs),
    ageDays: ageDays(planted, nowMs),
    ageDaysInt: ageDaysInt(planted, nowMs),
    growth: g,
    stageIndex: stageIndex(planted, nowMs),
    stage: stage(planted, nowMs),
    ageFactor: factor,
    tier: ageTier(planted, nowMs),
    heightCm: heightCm(g, factor),
    health: h,
    healthWord: healthWord(h),
  };
}
