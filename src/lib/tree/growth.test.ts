import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  STAGES,
  AGE_TIERS,
  MAX_AGE_FACTOR,
  HEALTH_FLOOR,
  HEALTH_MAX,
  VISIT_RESTORE,
  WATER_RESTORE,
  ageMs,
  ageDays,
  ageDaysInt,
  growth,
  stageIndex,
  stage,
  ageFactor,
  ageTier,
  health,
  restoreHealth,
  healthWord,
  computeTreeState,
} from "./growth";

// Fixed clock so every test is deterministic. `plantedDaysAgo(n)` returns a
// planted_at that makes the tree exactly n days old at NOW.
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const plantedDaysAgo = (days: number) => NOW - days * DAY_MS;

describe("age", () => {
  it("is zero at planting and never negative for a future plant", () => {
    expect(ageMs(NOW, NOW)).toBe(0);
    expect(ageMs(NOW + 5 * DAY_MS, NOW)).toBe(0); // planted "in the future"
    expect(ageDays(plantedDaysAgo(3), NOW)).toBeCloseTo(3, 10);
    expect(ageDaysInt(plantedDaysAgo(3.9), NOW)).toBe(3);
  });

  it("accepts Date, number, and ISO string inputs equivalently", () => {
    const planted = plantedDaysAgo(2);
    const asNum = ageDays(planted, NOW);
    const asDate = ageDays(new Date(planted), new Date(NOW));
    const asIso = ageDays(new Date(planted).toISOString(), new Date(NOW).toISOString());
    expect(asDate).toBeCloseTo(asNum, 10);
    expect(asIso).toBeCloseTo(asNum, 10);
  });
});

describe("growth g = min(1, ageDays/7)", () => {
  it("runs 0→1 across the first week then holds at 1", () => {
    expect(growth(plantedDaysAgo(0), NOW)).toBeCloseTo(0, 10);
    expect(growth(plantedDaysAgo(3.5), NOW)).toBeCloseTo(0.5, 10);
    expect(growth(plantedDaysAgo(7), NOW)).toBeCloseTo(1, 10);
    expect(growth(plantedDaysAgo(999), NOW)).toBe(1);
  });
});

describe("stage = min(7, floor(ageDays))", () => {
  it("advances one named stage per day and caps at Mature", () => {
    expect(stageIndex(plantedDaysAgo(0), NOW)).toBe(0);
    expect(stage(plantedDaysAgo(0), NOW).label).toBe("Seed");
    expect(stage(plantedDaysAgo(3), NOW).label).toBe("Sapling");
    expect(stageIndex(plantedDaysAgo(6.99), NOW)).toBe(6);
    expect(stageIndex(plantedDaysAgo(7), NOW)).toBe(7);
    expect(stage(plantedDaysAgo(7), NOW).label).toBe("Mature Tree");
    expect(stageIndex(plantedDaysAgo(500), NOW)).toBe(7); // never exceeds 7
    expect(STAGES).toHaveLength(8);
  });
});

describe("ageFactor = clamp(0, log10(ageDays−6)×1.15, 2.6) (spec §10)", () => {
  it("is zero through maturity, then positive", () => {
    expect(ageFactor(plantedDaysAgo(0), NOW)).toBe(0);
    expect(ageFactor(plantedDaysAgo(7), NOW)).toBe(0);
    expect(ageFactor(plantedDaysAgo(7.0001), NOW)).toBeGreaterThan(0);
  });

  it("matches the spec formula at a known point", () => {
    // day 16 → log10(10) × 1.15 = 1.15
    expect(ageFactor(plantedDaysAgo(16), NOW)).toBeCloseTo(1.15, 6);
  });

  it("increases monotonically and is capped at MAX_AGE_FACTOR", () => {
    const days = [8, 30, 100, 365, 1000, 2000, 5000];
    const values = days.map((d) => ageFactor(plantedDaysAgo(d), NOW));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      expect(values[i]).toBeLessThanOrEqual(MAX_AGE_FACTOR + 1e-9);
    }
  });

  it("keeps 7-day, 365-day, and 2000-day trees visually distinct (spec §10, Step 3 gate)", () => {
    const a = ageFactor(plantedDaysAgo(7), NOW);
    const b = ageFactor(plantedDaysAgo(365), NOW);
    const c = ageFactor(plantedDaysAgo(2000), NOW);
    // Each older tree must have a meaningfully larger factor than the younger.
    expect(b - a).toBeGreaterThan(0.5);
    expect(c - b).toBeGreaterThan(0.1);
    // Elder (day 2000) must not be clipped by the cap — the whole named
    // lifespan stays on the diverging part of the curve.
    expect(c).toBeLessThan(MAX_AGE_FACTOR);
    expect(c).toBeCloseTo(3.795, 2);
  });
});

describe("ageTier", () => {
  it("is null in the biological phase, then names the reached tier", () => {
    expect(ageTier(plantedDaysAgo(3), NOW)).toBeNull();
    expect(ageTier(plantedDaysAgo(7), NOW)?.label).toBe("Mature");
    expect(ageTier(plantedDaysAgo(29), NOW)?.label).toBe("Mature");
    expect(ageTier(plantedDaysAgo(30), NOW)?.label).toBe("Established");
    expect(ageTier(plantedDaysAgo(365), NOW)?.label).toBe("Ancient");
    expect(ageTier(plantedDaysAgo(2000), NOW)?.label).toBe("Elder");
    expect(AGE_TIERS[AGE_TIERS.length - 1].label).toBe("Elder");
  });
});

describe("health (spec §11: gentle)", () => {
  it("stays full through the one-day grace period", () => {
    expect(health({ planted_at: plantedDaysAgo(0) }, NOW)).toBe(HEALTH_MAX);
    expect(health({ planted_at: plantedDaysAgo(1) }, NOW)).toBe(HEALTH_MAX);
  });

  it("decays ~9%/day after grace", () => {
    // 3 days since care → 2 days past grace → 100 − 18 = 82
    expect(health({ planted_at: plantedDaysAgo(3) }, NOW)).toBe(82);
  });

  it("never falls below the floor (nothing dies in MVP)", () => {
    expect(health({ planted_at: plantedDaysAgo(9999) }, NOW)).toBe(HEALTH_FLOOR);
  });

  it("measures decay from the most recent care timestamp", () => {
    // Planted long ago but watered 1 day ago → still full.
    const state = {
      planted_at: plantedDaysAgo(400),
      last_watered_at: plantedDaysAgo(1),
    };
    expect(health(state, NOW)).toBe(HEALTH_MAX);
    // A visit yesterday also counts as care.
    expect(
      health({ planted_at: plantedDaysAgo(400), last_visit_at: plantedDaysAgo(0.5) }, NOW),
    ).toBe(HEALTH_MAX);
  });

  it("restoreHealth clamps to 100", () => {
    expect(restoreHealth(80, VISIT_RESTORE)).toBe(95);
    expect(restoreHealth(90, WATER_RESTORE)).toBe(HEALTH_MAX);
  });

  it("labels health with the right word", () => {
    expect(healthWord(100)).toBe("Thriving");
    expect(healthWord(75)).toBe("Healthy");
    expect(healthWord(50)).toBe("Dry");
    expect(healthWord(30)).toBe("Wilting");
    expect(healthWord(HEALTH_FLOOR)).toBe("Struggling");
  });
});

describe("computeTreeState", () => {
  it("bundles the full derived render state", () => {
    const s = computeTreeState({ planted_at: plantedDaysAgo(30) }, NOW);
    expect(s.ageDaysInt).toBe(30);
    expect(s.stage.label).toBe("Mature Tree");
    expect(s.growth).toBe(1);
    expect(s.tier?.label).toBe("Established");
    expect(s.ageFactor).toBeGreaterThan(0);
    // 30 days untended → floored health, "Struggling".
    expect(s.health).toBe(HEALTH_FLOOR);
    expect(s.healthWord).toBe("Struggling");
  });

  it("a freshly planted, tended tree reads as a thriving Seed", () => {
    const s = computeTreeState({ planted_at: NOW }, NOW);
    expect(s.stage.label).toBe("Seed");
    expect(s.growth).toBe(0);
    expect(s.tier).toBeNull();
    expect(s.health).toBe(HEALTH_MAX);
    expect(s.healthWord).toBe("Thriving");
  });
});
