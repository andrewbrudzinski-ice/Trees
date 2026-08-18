"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import { treesToGeoJSON, ambientForest, boundsOf, type InspectPoint } from "@/lib/tree/geo";
import { baseStyle, applyGlobe } from "@/lib/tree/mapstyle";

/**
 * The Forest — a full-screen, world-scale Earth (roadmap §17.8, spec §13, reimagined).
 *
 * MapLibre GL with a true GLOBE projection: you see the whole planet and fly down
 * continuously to a single tree. Real satellite imagery + 3D elevation make it
 * read as Earth, not a game board — no roads, POIs, or label clutter. Trees live
 * at real coordinates ON the planet and resolve with zoom: a green density
 * heatmap at planet scale → clusters → individual tappable trees up close.
 *
 * Basemap is keyless by default (Esri World Imagery + AWS terrain); set
 * NEXT_PUBLIC_MAPTILER_KEY to use MapTiler instead (cleaner terms, faster tiles).
 * The scale path to millions of trees is the existing GIST index → server
 * aggregation / vector tiles; MVP renders from the public tree_inspect view.
 */

export function ForestMap({
  supabase,
  myUid,
  onInspect,
}: {
  supabase: SupabaseClient;
  myUid: string | null;
  onInspect: (treeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const inspectRef = useRef(onInspect);
  inspectRef.current = onInspect;
  const [myCoords, setMyCoords] = useState<[number, number][]>([]);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        attributionControl: false,
        maxZoom: 18,
        minZoom: 0.8,
        center: [10, 25],
        zoom: 1.3,
        style: baseStyle(),
      });
      const m = map;
      mapRef.current = m;
      m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      m.on("style.load", () => applyGlobe(m));

      m.on("load", async () => {
        // Real trees from the public inspect view.
        const { data } = await supabase
          .from("tree_inspect")
          .select("id,owner_id,name,species_key,lat,lng,admire_count");
        const rows = (data as InspectPoint[]) ?? [];
        if (cancelled) return;
        setCount(rows.length);
        setMyCoords(rows.filter((r) => r.owner_id === myUid).map((r) => [r.lng, r.lat]));

        const realFC = treesToGeoJSON(rows, myUid);
        // Density = real trees + a faint ambient seed, so the planet reads alive
        // at cold-start (placeholder; fades out as real trees populate).
        const density = {
          type: "FeatureCollection" as const,
          features: [...ambientForest(18).features, ...realFC.features],
        };

        m.addSource("density", { type: "geojson", data: density });
        m.addSource("trees", {
          type: "geojson",
          data: realFC,
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 8,
        });

        // 1) Planet-scale density bloom — green concentrations where trees gather.
        m.addLayer({
          id: "density-heat",
          type: "heatmap",
          source: "density",
          maxzoom: 7,
          paint: {
            "heatmap-weight": 0.6,
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 2.2],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 3, 6, 26],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.85, 6.5, 0],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(0,0,0,0)",
              0.2, "rgba(60,110,70,0.35)",
              0.5, "rgba(110,160,80,0.65)",
              0.8, "rgba(160,205,120,0.85)",
              1, "rgba(205,230,170,0.95)",
            ],
          },
        });

        // 2) Mid-zoom clusters — forests.
        m.addLayer({
          id: "clusters",
          type: "circle",
          source: "trees",
          filter: ["has", "point_count"],
          minzoom: 3,
          paint: {
            "circle-color": "rgba(94,126,78,0.85)",
            "circle-stroke-color": "#a7cf8a",
            "circle-stroke-width": 1.5,
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 20, 50, 28, 250, 38],
          },
        });

        // 3) Individual trees — the viewer's own ringed in bone.
        m.addLayer({
          id: "tree-points",
          type: "circle",
          source: "trees",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3, 12, 7, 16, 12],
            "circle-color": ["case", ["get", "mine"], "#b7e08f", "#6e8f4e"],
            "circle-stroke-color": ["case", ["get", "mine"], "#ffffff", "#0a1611"],
            "circle-stroke-width": ["case", ["get", "mine"], 2.5, 1],
          },
        });

        // Fly a cluster open on tap.
        m.on("click", "clusters", async (e) => {
          const f = m.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          const src = m.getSource("trees") as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.flyTo({ center: (f.geometry as any).coordinates, zoom: zoom + 0.4, speed: 0.8 });
        });

        // Tap an individual tree → inspect.
        m.on("click", "tree-points", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) inspectRef.current(String(id));
        });
        for (const layer of ["clusters", "tree-points"]) {
          m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
        }
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [supabase, myUid]);

  function flyToMyGrove() {
    const b = boundsOf(myCoords);
    if (b && mapRef.current) mapRef.current.fitBounds(b, { padding: 120, maxZoom: 14, duration: 1600 });
  }

  return (
    <div className="forest">
      <div ref={containerRef} className="forest-canvas" />
      <div className="forest-hud">
        <span className="forest-title serif">The Living Forest</span>
        {count !== null && (
          <span className="forest-count">{count.toLocaleString()} tree{count === 1 ? "" : "s"} on Earth</span>
        )}
      </div>
      <button className="my-grove-btn" onClick={flyToMyGrove} disabled={myCoords.length === 0}>
        📍 My Grove
      </button>
    </div>
  );
}
