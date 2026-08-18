"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Owner-only analytics dashboard (spec §17.10). Numbers come from the
 * SECURITY DEFINER admin_stats() RPC, which returns data only to the owner
 * (app_config.admin_user_id). Everyone else gets "not authorized". No PII.
 */
type Stats = Record<string, number>;
type Phase = "loading" | "signin" | "notadmin" | "ok";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Users",
    items: [
      ["profiles_total", "Total users"],
      ["members", "Members"],
      ["guests", "Guests"],
      ["new_users_7d", "New (7d)"],
    ],
  },
  {
    title: "Activity",
    items: [
      ["active_1d", "Active today"],
      ["active_7d", "Active (7d)"],
      ["checkins_today", "Check-ins today"],
      ["signups_7d", "Signups (7d)"],
    ],
  },
  {
    title: "Forest",
    items: [
      ["trees_total", "Trees total"],
      ["trees_alive", "Trees alive"],
      ["planters", "Planters"],
      ["admirations", "Admirations"],
      ["oldest_days", "Oldest (days)"],
    ],
  },
];

export default function Admin() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [stats, setStats] = useState<Stats | null>(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState("");

  useEffect(() => {
    try {
      setSupabase(createClient());
    } catch {
      setError("Supabase env vars are missing.");
    }
  }, []);

  const loadStats = useCallback(async (client: SupabaseClient) => {
    const { data: who } = await client.auth.getUser();
    if (!who.user) return setPhase("signin");
    const { data, error: e } = await client.rpc("admin_stats");
    if (e) setPhase("notadmin");
    else {
      setStats(data as Stats);
      setLoadedAt(new Date().toLocaleString());
      setPhase("ok");
    }
  }, []);

  useEffect(() => {
    if (supabase) loadStats(supabase);
  }, [supabase, loadStats]);

  const signIn = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (e) setError(e.message);
    else await loadStats(supabase);
    setBusy(false);
  };

  const claim = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("claim_admin");
    if (e) setError(e.message);
    else if (data === true) await loadStats(supabase);
    else setError("Owner access is already claimed by another account.");
    setBusy(false);
  };

  const refresh = () => supabase && loadStats(supabase);

  return (
    <main className="admin">
      <header className="admin-head">
        <h1 className="serif">The Tree · Owner</h1>
        {phase === "ok" && (
          <button className="linklike" onClick={refresh} disabled={busy}>
            ↻ Refresh
          </button>
        )}
      </header>

      {phase === "loading" && <p className="sub">Loading…</p>}

      {phase === "signin" && (
        <div className="admin-card">
          <p className="sub">Sign in with your owner account.</p>
          <input className="text-input" type="email" placeholder="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          <input className="text-input" type="password" placeholder="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} />
          <button className="btn" onClick={signIn} disabled={busy}>
            {busy ? "…" : "Sign in"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {phase === "notadmin" && (
        <div className="admin-card">
          <p className="sub">This dashboard is restricted to the owner.</p>
          <p className="sub" style={{ fontSize: 12 }}>
            If this is your project and no owner is set yet, claim it now (the first
            claim wins, so do it before sharing the app).
          </p>
          <button className="btn" onClick={claim} disabled={busy}>
            {busy ? "…" : "Claim owner access"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {phase === "ok" && stats && (
        <>
          {GROUPS.map((g) => (
            <section key={g.title} className="admin-group">
              <h2 className="admin-group-title">{g.title}</h2>
              <div className="admin-grid">
                {g.items.map(([key, label]) => (
                  <div className="admin-tile" key={key}>
                    <div className="admin-num">{(stats[key] ?? 0).toLocaleString()}</div>
                    <div className="admin-label">{label}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <p className="sub" style={{ fontSize: 11 }}>As of {loadedAt}</p>
        </>
      )}
    </main>
  );
}
