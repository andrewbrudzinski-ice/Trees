"use client";

import { useEffect, useRef } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import { baseStyle, applyGlobe } from "@/lib/tree/mapstyle";
import { nearestRegion } from "@/lib/tree/geo";

/**
 * The planting map: the same globe Earth, used to choose where a tree lives
 * (spec §6/§13 — "drag the globe, tap to drop a pin"). Reports the tapped point
 * and an offline region label up to the flow. The exact coordinate is fuzzed
 * server-side at plant time (0007), so what's chosen here is only an area.
 */
export function PlantMap({
  onChange,
}: {
  onChange: (lat: number, lng: number, region: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;
    let marker: Marker | null = null;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        attributionControl: false,
        maxZoom: 16,
        minZoom: 0.8,
        center: [-20, 25],
        zoom: 1.4,
        style: baseStyle(),
      });
      const m = map;
      m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      m.on("style.load", () => applyGlobe(m));

      m.on("click", (e) => {
        const { lat, lng } = e.lngLat;
        if (!marker) {
          const el = document.createElement("div");
          el.className = "plant-pin";
          el.textContent = "🌱";
          marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(m);
        } else {
          marker.setLngLat([lng, lat]);
        }
        changeRef.current(lat, lng, nearestRegion(lat, lng));
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  return <div ref={containerRef} className="plant-map-canvas" />;
}
