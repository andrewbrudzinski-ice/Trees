"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderTree, speciesVisual } from "@/lib/tree/render";
import type { Species } from "@/lib/types";

/** A small curated set of real places to plant (the real map arrives in Step 8). */
const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "Detroit", lat: 42.3314, lng: -83.0458 },
  { name: "New York", lat: 40.7128, lng: -74.006 },
  { name: "London", lat: 51.5072, lng: -0.1276 },
  { name: "Paris", lat: 48.8566, lng: 2.3522 },
  { name: "Lagos", lat: 6.5244, lng: 3.3792 },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
  { name: "Mumbai", lat: 19.076, lng: 72.8777 },
  { name: "São Paulo", lat: -23.5558, lng: -46.6396 },
  { name: "Sydney", lat: -33.8688, lng: 151.2093 },
  { name: "Cape Town", lat: -33.9249, lng: 18.4241 },
  { name: "Mexico City", lat: 19.4326, lng: -99.1332 },
  { name: "Cairo", lat: 30.0444, lng: 31.2357 },
];

type Step = "species" | "name" | "place" | "planting";

/** A miniature preview of a species (a ~3-day-old sapling). */
function speciesPreview(species: Species): string {
  return renderTree({
    species: speciesVisual(species.key, species.render_params),
    g: 3 / 7,
    ageFactor: 0,
    health: 100,
    seed: 12345,
    className: "sp-mini",
  });
}

export function PlantFlow({
  supabase,
  species,
  onPlanted,
}: {
  supabase: SupabaseClient;
  species: Species[];
  onPlanted: () => void;
}) {
  const free = useMemo(() => species.filter((s) => s.is_free), [species]);
  const [step, setStep] = useState<Step>("species");
  const [chosen, setChosen] = useState<string>(free[0]?.key ?? "maple");
  const [name, setName] = useState("");
  const [place, setPlace] = useState(CITIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosenSpecies = species.find((s) => s.key === chosen);

  async function plant() {
    if (!chosenSpecies) return;
    setBusy(true);
    setError(null);
    setStep("planting");
    // plant_tree() is the sanctioned path: it enforces first-free / second-cost,
    // logs the 'planted' event, and (for a paid tree) deducts seeds server-side.
    const { error: rpcErr } = await supabase.rpc("plant_tree", {
      p_species: chosen,
      p_name: name.trim() || "My Tree",
      p_lat: place.lat,
      p_lng: place.lng,
      p_region: place.name,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      setStep("place");
      return;
    }
    // Let the seed settle, then into Home.
    setTimeout(onPlanted, 2200);
  }

  if (step === "planting") {
    const preview = chosenSpecies
      ? renderTree({
          species: speciesVisual(chosenSpecies.key, chosenSpecies.render_params),
          g: 0,
          ageFactor: 0,
          health: 100,
          seed: 1,
          className: "plant-stage-svg",
        })
      : "";
    return (
      <div className="center-screen">
        <div className="plant-stage" dangerouslySetInnerHTML={{ __html: preview }} />
        <p className="sub fade-in">You planted {name.trim() || "your tree"} in {place.name}.</p>
        <p className="eyebrow fade-in">A seed takes root…</p>
      </div>
    );
  }

  return (
    <div className="flow">
      {step === "species" && (
        <>
          <h2 className="flow-title serif">Choose a tree</h2>
          <p className="sub">Three species to start. More unlock as your grove grows.</p>
          <div className="species-grid">
            {species.map((s) => {
              const locked = !s.is_free;
              return (
                <button
                  key={s.key}
                  className={`species-card${chosen === s.key ? " sel" : ""}${locked ? " locked" : ""}`}
                  disabled={locked}
                  onClick={() => !locked && setChosen(s.key)}
                  dangerouslySetInnerHTML={{
                    __html: `${speciesPreview(s)}<div class="sp-name">${s.display_name}${locked ? " 🔒" : ""}</div>`,
                  }}
                />
              );
            })}
          </div>
          <button className="btn" onClick={() => setStep("name")} disabled={!chosenSpecies?.is_free}>
            Next
          </button>
        </>
      )}

      {step === "name" && (
        <>
          <h2 className="flow-title serif">Name your {chosenSpecies?.display_name.toLowerCase()}</h2>
          <p className="sub">A tree with a name is a tree you come back to.</p>
          <input
            className="text-input"
            autoFocus
            value={name}
            maxLength={40}
            placeholder="e.g. Gary"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("place")}
          />
          <div className="flow-actions">
            <button className="btn ghost" onClick={() => setStep("species")}>
              Back
            </button>
            <button className="btn" onClick={() => setStep("place")} disabled={!name.trim()}>
              Next
            </button>
          </div>
        </>
      )}

      {step === "place" && (
        <>
          <h2 className="flow-title serif">Where should it grow?</h2>
          <p className="sub">Pick a place on Earth. (The full map arrives soon.)</p>
          <div className="place-grid">
            {CITIES.map((c) => (
              <button
                key={c.name}
                className={`place-chip${place.name === c.name ? " sel" : ""}`}
                onClick={() => setPlace(c)}
              >
                {c.name}
              </button>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <div className="flow-actions">
            <button className="btn ghost" onClick={() => setStep("name")} disabled={busy}>
              Back
            </button>
            <button className="btn" onClick={plant} disabled={busy}>
              {busy ? "Planting…" : `Plant in ${place.name}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
