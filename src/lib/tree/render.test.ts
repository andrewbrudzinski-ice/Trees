import { describe, it, expect } from "vitest";
import { DAY_MS, growth, ageFactor, health } from "./growth";
import { renderTree, speciesVisual, type SpeciesVisual } from "./render";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const plantedDaysAgo = (days: number) => NOW - days * DAY_MS;

// Species visuals (mirror the seeded catalog in 0002_tree_model.sql).
const MAPLE: SpeciesVisual = { key: "maple", canopy: "#C25A3B", canopy2: "#9E3F2B", trunk: "#5A4632" };
const PINE: SpeciesVisual = { key: "pine", canopy: "#3E6B4E", canopy2: "#2C4F39", trunk: "#4A3A2C" };
const WILLOW: SpeciesVisual = { key: "willow", canopy: "#8FB57A", canopy2: "#6E9560", trunk: "#4E4030" };
const CHERRY: SpeciesVisual = { key: "cherry", canopy: "#E5B4CC", canopy2: "#D094B4", trunk: "#5C4638" };

/** Render a tree of a given age with everything else fixed. */
function renderAtAge(days: number, species = MAPLE, seed = 12345, hp = 100) {
  const planted = plantedDaysAgo(days);
  return renderTree({
    species,
    g: growth(planted, NOW),
    ageFactor: ageFactor(planted, NOW),
    health: hp,
    seed,
  });
}

/** Count the drawn primitives in an SVG (a proxy for visual complexity). */
function countEls(svg: string): number {
  return (svg.match(/<(ellipse|circle|path|rect)\b/g) ?? []).length;
}

describe("renderTree — output shape", () => {
  it("produces a well-formed, self-contained SVG", () => {
    const svg = renderAtAge(30);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect((svg.match(/<g class="tree-breathe">/g) ?? []).length).toBe(1);
  });

  it("is deterministic: same inputs → identical output", () => {
    expect(renderAtAge(100)).toBe(renderAtAge(100));
  });

  it("varies with the seed (per-tree randomness)", () => {
    expect(renderAtAge(100, MAPLE, 111)).not.toBe(renderAtAge(100, MAPLE, 222));
  });
});

describe("renderTree — early life stages", () => {
  it("day < 0.6 is a bare seed mound (no canopy)", () => {
    const svg = renderAtAge(0.3);
    expect(svg).toContain('fill="#6B4E32"'); // the seed
    expect(svg).not.toContain("<circle"); // no canopy yet
  });

  it("0.6 ≤ day < 2 is a two-leaf sprout", () => {
    const svg = renderAtAge(1);
    expect(svg).toContain('stroke="#6E9560"'); // the sprout stem
    // Two leaf ellipses, rotated apart.
    expect((svg.match(/rotate\((-?30)/g) ?? []).length).toBe(2);
  });
});

describe("renderTree — the spec §17.3 divergence gate", () => {
  it("a 7-day, 365-day, and 2000-day tree are each structurally distinct", () => {
    const young = renderAtAge(7);
    const old = renderAtAge(365);
    const ancient = renderAtAge(2000);

    // All different strings.
    expect(new Set([young, old, ancient]).size).toBe(3);

    // Visual complexity increases monotonically with age.
    expect(countEls(old)).toBeGreaterThan(countEls(young));
    expect(countEls(ancient)).toBeGreaterThan(countEls(old));
  });

  it("age ornaments appear only on older trees", () => {
    const young = renderAtAge(7); // ageFactor 0
    const old = renderAtAge(365); // ageFactor ≈ 2.94
    // Moss at the base appears once ageFactor > 0.5 (no randomness gate).
    expect(young).not.toContain('fill="#6E8F4E"');
    expect(old).toContain('fill="#6E8F4E"');
  });
});

describe("renderTree — species behavior", () => {
  it("pine is drawn as stacked triangles, not blob circles", () => {
    const svg = renderAtAge(30, PINE);
    expect(svg).not.toContain("<circle");
    expect(svg).toContain('Z" fill='); // triangle layers
  });

  it("willow has trailing strand paths", () => {
    const svg = renderAtAge(30, WILLOW);
    // Base canopy ellipse + several drooping strands.
    expect(svg).toContain("<ellipse");
    expect((svg.match(/stroke-width="2" fill="none"/g) ?? []).length).toBeGreaterThan(3);
  });

  it("cherry gains blossoms once grown (g > 0.7)", () => {
    expect(renderAtAge(30, CHERRY)).toContain('fill="#FBEAF2"');
    expect(renderAtAge(2, CHERRY)).not.toContain('fill="#FBEAF2"');
  });
});

describe("renderTree — health dims the canopy", () => {
  it("full health shows the species' true canopy color", () => {
    // health 100 → (1−h)·0.55 = 0 → canopy renders as the exact species hue.
    // Maple canopy #C25A3B = rgb(194,90,59).
    expect(renderAtAge(30, MAPLE, 12345, 100)).toContain("rgb(194,90,59)");
  });

  it("low health shifts the canopy toward a dim green (different output)", () => {
    const healthy = renderAtAge(30, MAPLE, 12345, 100);
    const wilting = renderAtAge(30, MAPLE, 12345, 20);
    expect(healthy).not.toBe(wilting);
    expect(wilting).not.toContain("rgb(194,90,59)");
  });
});

describe("speciesVisual", () => {
  it("reads a species row's render_params, with safe fallbacks", () => {
    const v = speciesVisual("oak", { canopy: "#6E8F4E", canopy2: "#4E6E38", trunk: "#584636" });
    expect(v).toEqual({ key: "oak", canopy: "#6E8F4E", canopy2: "#4E6E38", trunk: "#584636" });
    const fallback = speciesVisual("mystery", null);
    expect(fallback.key).toBe("mystery");
    expect(fallback.canopy).toMatch(/^#/);
  });

  it("health input is derived, not trusted — integrates with growth.health()", () => {
    // A long-untended tree renders dim; a freshly watered one renders true.
    const planted = plantedDaysAgo(400);
    const untended = health({ planted_at: planted }, NOW); // floored
    const watered = health({ planted_at: planted, last_watered_at: plantedDaysAgo(0.5) }, NOW);
    expect(untended).toBeLessThan(watered);
  });
});
