import { describe, it, expect } from "vitest";
import { eventMeta, PUBLIC_EVENT_KINDS } from "./events";
import { heightCm, computeTreeState, DAY_MS } from "./growth";

describe("eventMeta", () => {
  it("labels known milestone kinds", () => {
    expect(eventMeta("planted").label).toBe("Planted");
    expect(eventMeta("mature").glyph).toBe("🌳");
    expect(eventMeta("age_365").label).toContain("Ancient");
  });

  it("marks care events as private and milestones as public", () => {
    expect(eventMeta("watered").public).toBe(false);
    expect(eventMeta("mature").public).toBe(true);
  });

  it("falls back gently for unknown kinds", () => {
    expect(eventMeta("mystery")).toEqual({ glyph: "•", label: "mystery", public: false });
  });

  it("PUBLIC_EVENT_KINDS excludes 'watered' but includes milestones", () => {
    expect(PUBLIC_EVENT_KINDS).toContain("planted");
    expect(PUBLIC_EVENT_KINDS).toContain("age_2000");
    expect(PUBLIC_EVENT_KINDS).not.toContain("watered");
  });
});

describe("heightCm", () => {
  it("grows with g and ageFactor", () => {
    expect(heightCm(0, 0)).toBe(4);
    expect(heightCm(1, 0)).toBe(184);
    expect(heightCm(1, 2)).toBe(424);
  });

  it("is surfaced on computeTreeState", () => {
    const s = computeTreeState({ planted_at: Date.now() - 365 * DAY_MS }, Date.now());
    expect(s.heightCm).toBeGreaterThan(184);
  });
});
