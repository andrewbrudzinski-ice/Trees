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

/** City anchors used to scatter the ambient forest and to label pin locations. */
export const CITY_ANCHORS: { name: string; lat: number; lng: number }[] = [
  { name: "Detroit", lat: 42.33, lng: -83.05 },
  { name: "New York", lat: 40.71, lng: -74.0 },
  { name: "Los Angeles", lat: 34.05, lng: -118.24 },
  { name: "Toronto", lat: 43.7, lng: -79.42 },
  { name: "Mexico City", lat: 19.43, lng: -99.13 },
  { name: "São Paulo", lat: -23.55, lng: -46.63 },
  { name: "Buenos Aires", lat: -34.6, lng: -58.38 },
  { name: "London", lat: 51.51, lng: -0.13 },
  { name: "Paris", lat: 48.85, lng: 2.35 },
  { name: "Berlin", lat: 52.52, lng: 13.4 },
  { name: "Moscow", lat: 55.75, lng: 37.62 },
  { name: "Lagos", lat: 6.52, lng: 3.38 },
  { name: "Cairo", lat: 30.04, lng: 31.24 },
  { name: "Cape Town", lat: -33.92, lng: 18.42 },
  { name: "Mumbai", lat: 19.08, lng: 72.88 },
  { name: "Beijing", lat: 39.9, lng: 116.4 },
  { name: "Tokyo", lat: 35.68, lng: 139.7 },
  { name: "Jakarta", lat: -6.2, lng: 106.85 },
  { name: "Sydney", lat: -33.87, lng: 151.21 },
];

/** Coarse continental fallback when a point is far from any known city. */
function coarseRegion(lat: number, lng: number): string {
  if (lat > 12 && lng > -170 && lng < -50) return "North America";
  if (lat <= 12 && lat > -57 && lng > -82 && lng < -34) return "South America";
  if (lat > 35 && lng > -12 && lng < 40) return "Europe";
  if (lat <= 37 && lat > -35 && lng > -18 && lng < 52) return "Africa";
  if (lat < 0 && lng > 110) return "Oceania";
  if (lng >= 40) return "Asia";
  return "Somewhere on Earth";
}

/**
 * Offline reverse-geocode: the nearest well-known city if the point is within
 * ~600 km, otherwise a coarse continental label. No external geocoder needed
 * (privacy-friendly and dependency-free) — good enough to label a pin's area.
 */
export function nearestRegion(lat: number, lng: number): string {
  let best: string | null = null;
  let bestKm = Infinity;
  for (const c of CITY_ANCHORS) {
    // Equirectangular approximation, good enough for a nearest-city label.
    const dLat = (c.lat - lat) * 111;
    const dLng = (c.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180);
    const km = Math.hypot(dLat, dLng);
    if (km < bestKm) {
      bestKm = km;
      best = c.name;
    }
  }
  return bestKm <= 600 && best ? best : coarseRegion(lat, lng);
}

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
