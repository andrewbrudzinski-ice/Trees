"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

/**
 * Step 1 — Foundation verification screen.
 *
 * This is a scaffold check, not the real onboarding (that arrives in Step 4).
 * It proves the foundation end-to-end:
 *   1. Anonymous ("guest") sign-in creates an auth.users row.
 *   2. The on_auth_user_created trigger creates a matching profiles row.
 *   3. Row-Level Security lets the guest read exactly their own profile.
 *
 * The point is: a first plant can create a guest identity with no signup.
 */
export default function Step1Check() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Construct the browser client in an effect so it never runs during SSR.
  useEffect(() => {
    try {
      setSupabase(createClient());
    } catch {
      setError(
        "Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and " +
          "NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.",
      );
      setReady(true);
    }
  }, []);

  const loadProfile = useCallback(
    async (client: SupabaseClient, uid: string) => {
      // Small retry: the profile row is created by a DB trigger the moment the
      // auth user is inserted, which can land a beat after signInAnonymously resolves.
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error: profErr } = await client
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .maybeSingle();
        if (profErr) {
          setError(profErr.message);
          return;
        }
        if (data) {
          setProfile(data as Profile);
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      setError(
        "Signed in, but no profile row appeared. Did the 0001_foundation.sql " +
          "migration (with the on_auth_user_created trigger) run?",
      );
    },
    [],
  );

  // Watch auth state; hydrate user + profile whenever a session exists.
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setReady(true);
      if (data.user) loadProfile(supabase, data.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(supabase, session.user.id);
      else setProfile(null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const plantAsGuest = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: signErr } = await supabase.auth.signInAnonymously();
    if (signErr) {
      setError(
        signErr.message +
          " — is anonymous sign-in enabled in Supabase (Authentication → Sign In / Providers → Anonymous)?",
      );
    }
    setBusy(false);
  };

  const signOut = async () => {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setProfile(null);
    setBusy(false);
  };

  return (
    <main className="app-frame">
      <div className="center-screen">
        <div className="eyebrow fade-in">A living forest</div>
        <h1 className="title serif fade-in">The Tree</h1>

        {!ready ? (
          <p className="sub fade-in">Waking the forest…</p>
        ) : !user ? (
          <>
            <p className="sub fade-in">
              Plant one tree anywhere on Earth. Come back tomorrow. Watch it grow
              into something only time could make.
            </p>
            <button
              className="btn fade-in"
              onClick={plantAsGuest}
              disabled={busy || !supabase}
            >
              {busy ? "Planting…" : "Plant your first tree"}
            </button>
            <p className="sub fade-in" style={{ fontSize: 12, opacity: 0.7 }}>
              No signup — this creates a guest identity.
            </p>
          </>
        ) : (
          <>
            <p className="sub fade-in">
              A guest identity now exists — your tree could live here with no
              signup.
            </p>
            {profile ? (
              <div className="card fade-in">
                <div className="row">
                  <span className="k">Account</span>
                  <span className="v">
                    <span className={`badge ${profile.is_guest ? "" : "member"}`}>
                      {profile.is_guest ? "Guest" : "Member"}
                    </span>
                  </span>
                </div>
                <div className="row">
                  <span className="k">Profile ID</span>
                  <span className="v">{profile.id}</span>
                </div>
                <div className="row">
                  <span className="k">Seeds</span>
                  <span className="v">{profile.seeds}</span>
                </div>
                <div className="row">
                  <span className="k">Water</span>
                  <span className="v">{profile.water}</span>
                </div>
                <div className="row">
                  <span className="k">Streak</span>
                  <span className="v">{profile.streak_count}</span>
                </div>
                <div className="row">
                  <span className="k">Created</span>
                  <span className="v">
                    {new Date(profile.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <p className="sub fade-in">Reading your profile…</p>
            )}
            <button className="btn ghost fade-in" onClick={signOut} disabled={busy}>
              Reset (sign out)
            </button>
          </>
        )}

        {error && <p className="error fade-in">{error}</p>}
      </div>
    </main>
  );
}
