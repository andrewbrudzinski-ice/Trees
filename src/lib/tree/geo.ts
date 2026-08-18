/**
 * Pure geo helpers for the Forest map (roadmap §17.8). No MapLibre imports here
 * so these stay unit-testable; the map component consumes what they return.
 */

export type InspectPoint = {
  id: string;
  owner_id: string;
  name: string;
  species_key: string;
  lat: number;
  lng: number;
  admire_count: number;
};

type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, string | number | boolean>;
};
type FeatureCollection = { type: "FeatureCollection"; features: PointFeature[] };

/** Real trees → a GeoJSON FeatureCollection; `mine` marks the viewer's own. */
export function treesToGeoJSON(rows: InspectPoint[], myUid: string | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        name: r.name,
        species: r.species_key,
        mine: r.owner_id === myUid,
        admire: r.admire_count ?? 0,
      },
    })),
  };
}

/** Bounding box [[minLng,minLat],[maxLng,maxLat]] of some coordinates, or null. */
export function boundsOf(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** City anchors used to scatter the ambient (cold-start) forest. */
export const CITY_ANCHORS: { name: string; lat: number; lng: number }[] = [
  { name: "Detroit", lat: 42.33, lng: -83.05 },
  { name: "New York", lat: 40.71, lng: -74.0 },
  { name: "London", lat: 51.51, lng: -0.13 },
  { name: "Paris", lat: 48.85, lng: 2.35 },
  { name: "Lagos", lat: 6.52, lng: 3.38 },
  { name: "Tokyo", lat: 35.68, lng: 139.7 },
  { name: "Mumbai", lat: 19.08, lng: 72.88 },
  { name: "São Paulo", lat: -23.55, lng: -46.63 },
  { name: "Sydney", lat: -33.87, lng: 151.21 },
  { name: "Cape Town", lat: -33.92, lng: 18.42 },
  { name: "Mexico City", lat: 19.43, lng: -99.13 },
  { name: "Moscow", lat: 55.75, lng: 37.62 },
  { name: "Beijing", lat: 39.9, lng: 116.4 },
];

/**
 * A deterministic decorative "forest" scattered around the city anchors, so the
 * map reads as alive before there are many real trees (spec §17.8 cold-start).
 * Non-interactive; kept separate from real, tappable trees.
 */
export function ambientForest(perCluster = 22, seed = 1337): FeatureCollection {
  const rand = rng(seed);
  const features: PointFeature[] = [];
  for (const c of CITY_ANCHORS) {
    for (let i = 0; i < perCluster; i++) {
      const lat = c.lat + (rand() - 0.5) * 7;
      const lng = c.lng + (rand() - 0.5) * 9;
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {} });
    }
  }
  return { type: "FeatureCollection", features };
}
