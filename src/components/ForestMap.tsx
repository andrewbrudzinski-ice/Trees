"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import { treesToGeoJSON, ambientForest, boundsOf, CITY_ANCHORS, type InspectPoint } from "@/lib/tree/geo";

/**
 * The Forest map (roadmap §17.8, spec §13). A self-contained MapLibre GL map:
 * real world geography embedded from Natural Earth (world-atlas via npm — no
 * external tiles or API keys), a custom forest-ink style, and trees as native
 * GL layers on top. Low zoom clusters into density blobs; high zoom shows
 * individual trees (own trees ringed). Tap a cluster to zoom in, a tree to
 * inspect. An ambient seeded forest fills the map for cold-start density.
 *
 * No glyphs/sprite are referenced, so nothing loads from outside the app; city
 * labels are DOM markers (auto-tracked by MapLibre).
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

  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      const topojson = await import("topojson-client");
      const landMod = await import("world-atlas/land-110m.json");
      const landTopo = (landMod.default ?? landMod) as unknown as Parameters<typeof topojson.feature>[0] & {
        objects: { land: object };
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const land = topojson.feature(landTopo as any, (landTopo as any).objects.land);
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        attributionControl: false,
        dragRotate: false,
        maxZoom: 12,
        minZoom: 1,
        center: [-20, 30],
        zoom: 1.3,
        style: {
          version: 8,
          sources: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            land: { type: "geojson", data: land as any },
          },
          layers: [
            { id: "sea", type: "background", paint: { "background-color": "#0a1611" } },
            { id: "land", type: "fill", source: "land", paint: { "fill-color": "#24422f" } },
            { id: "coast", type: "line", source: "land", paint: { "line-color": "#47694d", "line-width": 0.8 } },
          ],
        },
      });
      const m = map;
      mapRef.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      // City labels as auto-tracked DOM markers (no glyphs needed).
      for (const c of CITY_ANCHORS) {
        const el = document.createElement("div");
        el.className = "map-city-label";
        el.textContent = c.name;
        new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(m);
      }

      m.on("load", async () => {

        // Ambient decorative forest (non-interactive).
        m.addSource("ambient", { type: "geojson", data: ambientForest() });
        m.addLayer({
          id: "ambient",
          type: "circle",
          source: "ambient",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.6, 6, 3],
            "circle-color": "#6e8f4e",
            "circle-opacity": 0.55,
          },
        });

        // Real trees, clustered.
        const { data } = await supabase
          .from("tree_inspect")
          .select("id,owner_id,name,species_key,lat,lng,admire_count");
        const rows = (data as InspectPoint[]) ?? [];
        if (cancelled) return;
        setMyCoords(rows.filter((r) => r.owner_id === myUid).map((r) => [r.lng, r.lat]));

        m.addSource("trees", {
          type: "geojson",
          data: treesToGeoJSON(rows, myUid),
          cluster: true,
          clusterRadius: 46,
          clusterMaxZoom: 7,
        });

        m.addLayer({
          id: "clusters",
          type: "circle",
          source: "trees",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#5e7e4e",
            "circle-opacity": 0.85,
            "circle-stroke-color": "#8fb57a",
            "circle-stroke-width": 1,
            "circle-radius": ["step", ["get", "point_count"], 12, 10, 18, 50, 26, 200, 34],
          },
        });

        // Individual trees; the viewer's own are ringed in bone.
        m.addLayer({
          id: "tree-points",
          type: "circle",
          source: "trees",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": ["case", ["get", "mine"], 6, 4],
            "circle-color": ["case", ["get", "mine"], "#8fb57a", "#6e8f4e"],
            "circle-stroke-color": ["case", ["get", "mine"], "#e9e5d8", "#243528"],
            "circle-stroke-width": ["case", ["get", "mine"], 2, 0.5],
          },
        });

        // Tap a cluster → zoom into it.
        m.on("click", "clusters", async (e) => {
          const f = m.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          const clusterId = f.properties?.cluster_id;
          const src = m.getSource("trees") as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.easeTo({ center: (f.geometry as any).coordinates, zoom });
        });

        // Tap a tree → inspect.
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
    if (b && mapRef.current) mapRef.current.fitBounds(b, { padding: 80, maxZoom: 9, duration: 800 });
  }

  return (
    <div className="forest">
      <div ref={containerRef} className="forest-canvas" />
      <button className="my-grove-btn" onClick={flyToMyGrove} disabled={myCoords.length === 0}>
        📍 My Grove
      </button>
    </div>
  );
}
