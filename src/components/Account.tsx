"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { track } from "@/lib/analytics";

/**
 * Account sheet — plant-first signup / sign-in (spec §6a, §7).
 *
 * Signup on a guest session uses `updateUser({ email, password })`, which
 * converts the anonymous user into a permanent one IN PLACE — the user id is
 * unchanged, so the guest's profile, seeds, and first tree carry over with no
 * data migration. The is_guest flag flips server-side (0005 trigger).
 */
export function Account({
  supabase,
  initialMode,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient;
  initialMode: "signup" | "signin";
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signin = mode === "signin";

  async function submit() {
    setError(null);
    if (!/.+@.+\..+/.test(email)) return setError("Enter a valid email.");
    if (pass.length < 6) return setError("Password must be at least 6 characters.");
    if (!signin && !name.trim()) return setError("What should we call you?");
    setBusy(true);

    if (signin) {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (e) {
        setError(e.message);
        setBusy(false);
        return;
      }
    } else {
      // Link the current (guest) session in place, or create fresh if none.
      const { data: sess } = await supabase.auth.getUser();
      const linking = !!sess.user && sess.user.is_anonymous;
      const { error: e } = linking
        ? await supabase.auth.updateUser({ email, password: pass, data: { display_name: name.trim() } })
        : await supabase.auth.signUp({ email, password: pass, options: { data: { display_name: name.trim() } } });
      if (e) {
        setError(e.message);
        setBusy(false);
        return;
      }
      // Persist the chosen display name (client may write only this column).
      const { data: who } = await supabase.auth.getUser();
      if (who.user) await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", who.user.id);
      track(supabase, "signup_completed", who.user?.id ?? null);
    }

    await onDone();
    setBusy(false);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{signin ? "Welcome back" : "Save your forest"}</div>
        <h2 className="flow-title serif">{signin ? "Sign in" : "Create your account"}</h2>
        <p className="sub">
          {signin
            ? "Sign in to return to your grove."
            : "Your tree keeps growing while you're away — and your grove unlocks."}
        </p>

        {!signin && (
          <input className="text-input" placeholder="Your name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        )}
        <input
          className="text-input"
          type="email"
          placeholder="you@example.com"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
        />
        <input
          className="text-input"
          type="password"
          placeholder="Password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        {error && <p className="error">{error}</p>}

        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "…" : signin ? "Sign in" : "Create account"}
        </button>
        <button className="linklike" onClick={() => setMode(signin ? "signup" : "signin")} disabled={busy}>
          {signin ? "Create a new account" : "I already have an account"}
        </button>
        <button className="linklike dim" onClick={onClose} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
