"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderTree, speciesVisual } from "@/lib/tree/render";
import type { Species } from "@/lib/types";
import { PlantMap } from "./PlantMap";

type Step = "species" | "name" | "place" | "planting";
type Pin = { lat: number; lng: number; region: string };

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
  const [pin, setPin] = useState<Pin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosenSpecies = species.find((s) => s.key === chosen);

  async function plant() {
    if (!chosenSpecies || !pin) return;
    setBusy(true);
    setError(null);
    setStep("planting");
    // plant_tree() is the sanctioned path: enforces first-free / second-cost,
    // logs 'planted', deducts seeds for a paid tree, and fuzzes the coordinate
    // server-side (0007) so the exact spot is never stored.
    const { error: rpcErr } = await supabase.rpc("plant_tree", {
      p_species: chosen,
      p_name: name.trim() || "My Tree",
      p_lat: pin.lat,
      p_lng: pin.lng,
      p_region: pin.region,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      setStep("place");
      return;
    }
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
        <p className="sub fade-in">
          You planted {name.trim() || "your tree"}
          {pin ? ` near ${pin.region}` : ""}.
        </p>
        <p className="eyebrow fade-in">A seed takes root…</p>
      </div>
    );
  }

  // The location step is a full-screen globe — pick where your tree lives.
  if (step === "place") {
    return (
      <div className="plant-place">
        <PlantMap onChange={(lat, lng, region) => setPin({ lat, lng, region })} />
        <div className="plant-place-bar">
          <div className="ppb-text serif">
            {pin ? (
              <>
                Plant <b>{name.trim() || "your tree"}</b> near <b>{pin.region}</b>
              </>
            ) : (
              "Tap the globe to choose where it lives"
            )}
          </div>
          <div className="ppb-note">Its exact spot stays private — trees show only their area.</div>
          {error && <p className="error">{error}</p>}
          <div className="flow-actions">
            <button className="btn ghost" onClick={() => setStep("name")} disabled={busy}>
              Back
            </button>
            <button className="btn" onClick={plant} disabled={busy || !pin}>
              {busy ? "Planting…" : "Plant here"}
            </button>
          </div>
        </div>
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
    </div>
  );
}
