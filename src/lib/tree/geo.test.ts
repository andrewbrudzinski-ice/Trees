import { describe, it, expect } from "vitest";
import { treesToGeoJSON, boundsOf, ambientForest, CITY_ANCHORS, type InspectPoint } from "./geo";

const rows: InspectPoint[] = [
  { id: "t1", owner_id: "me", name: "A", species_key: "maple", lat: 42.3, lng: -83, admire_count: 2 },
  { id: "t2", owner_id: "other", name: "B", species_key: "oak", lat: 51.5, lng: -0.1, admire_count: 0 },
];

describe("treesToGeoJSON", () => {
  it("emits [lng, lat] points and flags the viewer's own trees", () => {
    const fc = treesToGeoJSON(rows, "me");
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features[0].geometry.coordinates).toEqual([-83, 42.3]); // lng, lat
    expect(fc.features[0].properties.mine).toBe(true);
    expect(fc.features[1].properties.mine).toBe(false);
    expect(fc.features[0].properties.id).toBe("t1");
  });
});

describe("boundsOf", () => {
  it("computes a bounding box, or null when empty", () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        [-83, 42.3],
        [-0.1, 51.5],
      ]),
    ).toEqual([
      [-83, 42.3],
      [-0.1, 51.5],
    ]);
  });
});

describe("ambientForest", () => {
  it("is deterministic for a given seed", () => {
    const a = ambientForest();
    const b = ambientForest();
    expect(a.features.length).toBe(CITY_ANCHORS.length * 22);
    expect(a.features[0].geometry.coordinates).toEqual(b.features[0].geometry.coordinates);
  });

  it("varies with the seed", () => {
    const a = ambientForest(22, 1);
    const b = ambientForest(22, 2);
    expect(a.features[0].geometry.coordinates).not.toEqual(b.features[0].geometry.coordinates);
  });
});
