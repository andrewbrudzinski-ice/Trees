"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { HomePayload } from "@/lib/tree/api";
import type { Species } from "@/lib/types";
import { PlantFlow } from "@/components/PlantFlow";
import { Home } from "@/components/Home";
import { Grove } from "@/components/Grove";
import { Account } from "@/components/Account";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { TreeSheet, type TreeTarget } from "@/components/TreeSheet";
import { ProfileSheet } from "@/components/ProfileSheet";
import { ForestMap } from "@/components/ForestMap";
import { track } from "@/lib/analytics";

/**
 * The Tree — app shell (roadmap Steps 4–6).
 *
 * Welcome → plant as a guest → Home / Grove. The second tree is the account
 * moment: the Grove plant slot gates a guest into signup, which links the
 * anonymous session in place so seeds + first tree carry over.
 */
export default function App() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [plantingSecond, setPlantingSecond] = useState(false);
  const [account, setAccount] = useState<"signup" | "signin" | null>(null);
  const [sheet, setSheet] = useState<{ type: "tree"; target: TreeTarget } | { type: "profile"; userId: string } | null>(null);
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

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    (async () => {
      const { data: sp } = await supabase.from("species").select("*").order("key");
      if (!active) return;
      setSpecies((sp as Species[]) ?? []);
      await refetchHome();
    })();
    return () => {
      active = false;
    };
  }, [supabase, refetchHome]);

  const speciesByKey = useMemo(() => new Map(species.map((s) => [s.key, s])), [species]);

  // Funnel: welcome view (pre-auth), once.
  const welcomeTracked = useRef(false);
  useEffect(() => {
    if (supabase && payload && payload.authed === false && !welcomeTracked.current) {
      welcomeTracked.current = true;
      track(supabase, "welcome_viewed");
    }
  }, [supabase, payload]);

  const plantAsGuest = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.auth.signInAnonymously();
    if (e) setError(e.message + " — is anonymous sign-in enabled in Supabase?");
    else {
      track(supabase, "guest_started", data.user?.id ?? null);
      await refetchHome();
    }
    setBusy(false);
  };

  const checkIn = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("check_in");
    if (e) setError(e.message);
    await refetchHome();
    setBusy(false);
  };

  const water = async (treeId: string) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("water", { p_tree: treeId });
    if (e) setError(e.message);
    await refetchHome();
    setBusy(false);
  };

  const signOut = async () => {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setTab("home");
    setPlantingSecond(false);
    await refetchHome();
    setBusy(false);
  };

  const onAccountDone = async () => {
    await refetchHome();
    setTab("grove");
  };

  const devWarp = async (days: number) => {
    setBusy(true);
    await fetch("/api/dev/time-warp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days }),
    });
    if (supabase) await supabase.rpc("check_in");
    await refetchHome();
    setBusy(false);
  };

  const devDryOut = async (days: number) => {
    setBusy(true);
    await fetch("/api/dev/time-warp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryOutDays: days }),
    });
    await refetchHome();
    setBusy(false);
  };

  const authed = payload?.authed === true;
  const trees = authed ? payload.trees : [];
  const myUid = authed ? payload.profile?.id ?? null : null;
  const selfIsGuest = authed ? payload.profile?.is_guest ?? true : true;

  const openTreeById = (treeId: string) => {
    const entry = trees.find((e) => e.tree.id === treeId);
    setSheet({ type: "tree", target: entry ? { kind: "own", entry } : { kind: "inspect", treeId } });
  };
  const mustPlantFirst = authed && trees.length === 0;
  const showPlant = supabase && authed && (mustPlantFirst || plantingSecond);

  const phase = !supabase || payload === null ? "loading" : !authed ? "welcome" : "app";

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
          <button className="linklike fade-in" onClick={() => setAccount("signin")} disabled={busy}>
            I already have an account
          </button>
          {error && <p className="error fade-in">{error}</p>}
        </div>
      )}

      {phase === "app" && showPlant && (
        <PlantFlow
          supabase={supabase!}
          species={species}
          onPlanted={async () => {
            setPlantingSecond(false);
            setTab("home");
            if (supabase) track(supabase, "tree_planted", myUid);
            await refetchHome();
          }}
        />
      )}

      {phase === "app" && authed && !showPlant && (
        <>
          {tab === "home" && (
            <Home
              payload={payload}
              speciesByKey={speciesByKey}
              onCheckin={checkIn}
              onWater={water}
              onOpenTree={() => payload.trees[0] && setSheet({ type: "tree", target: { kind: "own", entry: payload.trees[0] } })}
              onDevWarp={devWarp}
              onDevDryOut={devDryOut}
              busy={busy}
            />
          )}
          {tab === "grove" && (
            <Grove
              payload={payload}
              speciesByKey={speciesByKey}
              onPlantSlot={() => setPlantingSecond(true)}
              onCreateAccount={() => {
                if (supabase) track(supabase, "gate_signup_opened", myUid);
                setAccount("signup");
              }}
              onSignOut={signOut}
              onOpenTree={openTreeById}
              onOpenProfile={() => myUid && setSheet({ type: "profile", userId: myUid })}
              busy={busy}
            />
          )}
          {tab === "forest" && supabase && (
            <ForestMap supabase={supabase} myUid={myUid} onInspect={openTreeById} />
          )}
          <BottomNav tab={tab} onTab={setTab} />
          {error && <p className="error fade-in error-float">{error}</p>}
        </>
      )}

      {account && supabase && (
        <Account
          supabase={supabase}
          initialMode={account}
          onClose={() => setAccount(null)}
          onDone={onAccountDone}
        />
      )}

      {sheet?.type === "tree" && supabase && (
        <TreeSheet
          supabase={supabase}
          target={sheet.target}
          speciesByKey={speciesByKey}
          onClose={() => setSheet(null)}
          onOpenProfile={(userId) => setSheet({ type: "profile", userId })}
        />
      )}

      {sheet?.type === "profile" && supabase && (
        <ProfileSheet
          supabase={supabase}
          userId={sheet.userId}
          isSelf={sheet.userId === myUid}
          selfIsGuest={selfIsGuest}
          speciesByKey={speciesByKey}
          onClose={() => setSheet(null)}
          onOpenTree={openTreeById}
          onSignOut={() => {
            setSheet(null);
            signOut();
          }}
          onCreateAccount={() => {
            setSheet(null);
            setAccount("signup");
          }}
        />
      )}
    </main>
  );
}
