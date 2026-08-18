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

/**
 * Curated world cities for map labels, each with the zoom at which it appears.
 * Big global cities show at planet view; more fill in as you fly down — so the
 * map stays clean far out and gets oriented up close.
 */
export const WORLD_CITIES: { name: string; lat: number; lng: number; minZoom: number }[] = [
  // Global tier — visible at planet view.
  { name: "New York", lat: 40.71, lng: -74.0, minZoom: 1 },
  { name: "Los Angeles", lat: 34.05, lng: -118.24, minZoom: 1 },
  { name: "London", lat: 51.51, lng: -0.13, minZoom: 1 },
  { name: "Paris", lat: 48.85, lng: 2.35, minZoom: 1 },
  { name: "Tokyo", lat: 35.68, lng: 139.7, minZoom: 1 },
  { name: "Beijing", lat: 39.9, lng: 116.4, minZoom: 1 },
  { name: "Shanghai", lat: 31.23, lng: 121.47, minZoom: 1 },
  { name: "Moscow", lat: 55.75, lng: 37.62, minZoom: 1 },
  { name: "Delhi", lat: 28.61, lng: 77.21, minZoom: 1 },
  { name: "Mumbai", lat: 19.08, lng: 72.88, minZoom: 1 },
  { name: "São Paulo", lat: -23.55, lng: -46.63, minZoom: 1 },
  { name: "Mexico City", lat: 19.43, lng: -99.13, minZoom: 1 },
  { name: "Cairo", lat: 30.04, lng: 31.24, minZoom: 1 },
  { name: "Lagos", lat: 6.52, lng: 3.38, minZoom: 1 },
  { name: "Sydney", lat: -33.87, lng: 151.21, minZoom: 1 },
  { name: "Istanbul", lat: 41.01, lng: 28.98, minZoom: 1 },
  { name: "Jakarta", lat: -6.2, lng: 106.85, minZoom: 1 },
  { name: "Chicago", lat: 41.88, lng: -87.63, minZoom: 1 },
  // Regional tier — fill in once you zoom past a continent.
  { name: "Toronto", lat: 43.7, lng: -79.42, minZoom: 3 },
  { name: "San Francisco", lat: 37.77, lng: -122.42, minZoom: 3 },
  { name: "Seattle", lat: 47.61, lng: -122.33, minZoom: 3 },
  { name: "Miami", lat: 25.76, lng: -80.19, minZoom: 3 },
  { name: "Detroit", lat: 42.33, lng: -83.05, minZoom: 3 },
  { name: "Houston", lat: 29.76, lng: -95.37, minZoom: 3 },
  { name: "Vancouver", lat: 49.28, lng: -123.12, minZoom: 3 },
  { name: "Buenos Aires", lat: -34.6, lng: -58.38, minZoom: 3 },
  { name: "Lima", lat: -12.05, lng: -77.04, minZoom: 3 },
  { name: "Bogotá", lat: 4.71, lng: -74.07, minZoom: 3 },
  { name: "Santiago", lat: -33.45, lng: -70.67, minZoom: 3 },
  { name: "Madrid", lat: 40.42, lng: -3.7, minZoom: 3 },
  { name: "Rome", lat: 41.9, lng: 12.5, minZoom: 3 },
  { name: "Berlin", lat: 52.52, lng: 13.4, minZoom: 3 },
  { name: "Amsterdam", lat: 52.37, lng: 4.9, minZoom: 3 },
  { name: "Cape Town", lat: -33.92, lng: 18.42, minZoom: 3 },
  { name: "Nairobi", lat: -1.29, lng: 36.82, minZoom: 3 },
  { name: "Johannesburg", lat: -26.2, lng: 28.05, minZoom: 3 },
  { name: "Dubai", lat: 25.2, lng: 55.27, minZoom: 3 },
  { name: "Singapore", lat: 1.35, lng: 103.82, minZoom: 3 },
  { name: "Bangkok", lat: 13.76, lng: 100.5, minZoom: 3 },
  { name: "Seoul", lat: 37.57, lng: 126.98, minZoom: 3 },
  { name: "Hong Kong", lat: 22.32, lng: 114.17, minZoom: 3 },
  { name: "Melbourne", lat: -37.81, lng: 144.96, minZoom: 3 },
  { name: "Auckland", lat: -36.85, lng: 174.76, minZoom: 3 },
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
