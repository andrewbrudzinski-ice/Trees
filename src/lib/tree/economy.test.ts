import { describe, it, expect } from "vitest";
import { SECOND_TREE_COST, FREE_SPECIES, greeting } from "./economy";

describe("economy", () => {
  it("ships the second-tree cost at 7 (spec §6a/§12)", () => {
    expect(SECOND_TREE_COST).toBe(7);
  });

  it("offers three free starter species", () => {
    expect(FREE_SPECIES).toEqual(["maple", "oak", "pine"]);
  });

  it("greets by time of day", () => {
    expect(greeting(0)).toBe("Good morning");
    expect(greeting(11)).toBe("Good morning");
    expect(greeting(12)).toBe("Good afternoon");
    expect(greeting(17)).toBe("Good afternoon");
    expect(greeting(18)).toBe("Good evening");
    expect(greeting(23)).toBe("Good evening");
  });
});
