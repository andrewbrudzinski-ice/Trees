/**
 * Shared basemap for the globe Earth — used by the explore map (ForestMap) and
 * the planting pin-drop map (PlantMap). Satellite imagery + 3D terrain, keyless
 * by default (Esri + AWS), or MapTiler when NEXT_PUBLIC_MAPTILER_KEY is set.
 *
 * Type-only imports keep this SSR-safe; the runtime `applyGlobe` receives an
 * already-constructed MapLibre map (client only).
 */
import type { SourceSpecification, StyleSpecification, LayerSpecification } from "maplibre-gl";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export function basemapSources(): Record<string, SourceSpecification> {
  if (MAPTILER_KEY) {
    return {
      sat: {
        type: "raster",
        tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`],
        tileSize: 256,
        maxzoom: 20,
        attribution: "© MapTiler © Esri",
      },
      dem: {
        type: "raster-dem",
        tiles: [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${MAPTILER_KEY}`],
        encoding: "mapbox",
        tileSize: 256,
        maxzoom: 12,
      },
    };
  }
  return {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    dem: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
    },
  };
}

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: basemapSources(),
    layers: [
      { id: "space", type: "background", paint: { "background-color": "#05080c" } },
      { id: "sat", type: "raster", source: "sat" } as LayerSpecification,
    ],
  };
}

/** Turn the map into a globe with atmosphere + real elevation. Degrades safely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyGlobe(m: any): void {
  try {
    m.setProjection({ type: "globe" });
  } catch {}
  try {
    m.setSky({
      "sky-color": "#0a1420",
      "sky-horizon-blend": 0.5,
      "horizon-color": "#2b4a52",
      "horizon-fog-blend": 0.6,
      "fog-color": "#0a1611",
      "fog-ground-blend": 0.5,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 6, 0.2, 10, 0],
    });
  } catch {}
  try {
    m.setTerrain({ source: "dem", exaggeration: 1.35 });
  } catch {}
}
