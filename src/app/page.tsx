"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { HomePayload } from "@/lib/tree/api";
import type { Species } from "@/lib/types";
import { PlantFlow } from "@/components/PlantFlow";
import { Home } from "@/components/Home";

/**
 * The Tree — plant-first onboarding + Home (roadmap Step 4).
 *
 * Welcome → plant your first tree as a guest (no signup) → Home, where the
 * daily loop lives: check in for seeds, watch the tree grow. All derived state
 * (age/stage/health, balances) comes from the server; the client only draws and
 * triggers server RPCs.
 */
export default function App() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSupabase(createClient());
    } catch {
      setError("Supabase env vars are missing. Add them to .env.local and restart.");
    }
  }, []);

  const refetchHome = useCallback(async () => {
    const res = await fetch("/api/home", { cache: "no-store" });
    setPayload((await res.json()) as HomePayload);
  }, []);

  // Initial load: species catalog (readable pre-auth) + home state.
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const [{ data: sp }] = await Promise.all([
        supabase.from("species").select("*").order("key"),
      ]);
      if (!active) return;
      setSpecies((sp as Species[]) ?? []);
      await refetchHome();
    })();
    return () => {
      active = false;
    };
  }, [supabase, refetchHome]);

  const speciesByKey = useMemo(() => new Map(species.map((s) => [s.key, s])), [species]);

  const plantAsGuest = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: signErr } = await supabase.auth.signInAnonymously();
    if (signErr) {
      setError(
        signErr.message +
          " — is anonymous sign-in enabled in Supabase (Authentication → Sign In / Providers)?",
      );
      setBusy(false);
      return;
    }
    await refetchHome();
    setBusy(false);
  };

  const checkIn = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("check_in");
    if (rpcErr) setError(rpcErr.message);
    await refetchHome();
    setBusy(false);
  };

  const devWarp = async (days: number) => {
    setBusy(true);
    await fetch("/api/dev/time-warp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days }),
    });
    // A warp changes planted_at; a check-in then collects any milestones reached.
    if (supabase) await supabase.rpc("check_in");
    await refetchHome();
    setBusy(false);
  };

  // --- Render by phase -------------------------------------------------------
  const phase = !supabase || payload === null
    ? "loading"
    : !payload.authed
      ? "welcome"
      : payload.trees.length === 0
        ? "plant"
        : "home";

  return (
    <main className="app-frame">
      {phase === "loading" && (
        <div className="center-screen">
          <h1 className="title serif fade-in">The Tree</h1>
          <p className="sub fade-in">Waking the forest…</p>
        </div>
      )}

      {phase === "welcome" && (
        <div className="center-screen">
          <div className="eyebrow fade-in">A living forest</div>
          <h1 className="title serif fade-in">The Tree</h1>
          <p className="sub fade-in">
            Plant one tree anywhere on Earth. Come back tomorrow. Watch it grow into
            something only time could make.
          </p>
          <button className="btn fade-in" onClick={plantAsGuest} disabled={busy}>
            {busy ? "Planting…" : "Plant your first tree"}
          </button>
          <p className="sub fade-in" style={{ fontSize: 12, opacity: 0.7 }}>
            No signup — this creates a guest identity.
          </p>
          {error && <p className="error fade-in">{error}</p>}
        </div>
      )}

      {phase === "plant" && supabase && payload?.authed && (
        <PlantFlow
          supabase={supabase}
          species={species}
          userId={payload.profile?.id ?? ""}
          onPlanted={refetchHome}
        />
      )}

      {phase === "home" && payload?.authed && (
        <>
          <Home
            payload={payload}
            speciesByKey={speciesByKey}
            onCheckin={checkIn}
            onDevWarp={devWarp}
            busy={busy}
          />
          {error && <p className="error fade-in">{error}</p>}
        </>
      )}
    </main>
  );
}
