// Step 10 (funnel instrumentation) verification against Supabase.
//
// Proves analytics is write-only and self-scoped: a client can log its own
// events, cannot read the log back, and cannot attribute an event to another
// user. Prereqs: migrations 0001–0009 applied, anon sign-ins on.
//   node scripts/verify-step10.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== "1") {
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(process.execPath, ["--no-warnings", fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(res.status ?? 1);
}

function loadEnv() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && !line.trimStart().startsWith("#")) {
        const k = line.slice(0, i).trim();
        if (!out[k]) out[k] = line.slice(i + 1).trim();
      }
    }
  } catch {}
  return out;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(2);
}
console.log("URL:", url);
if (process.env.NODE_USE_ENV_PROXY === "1") console.log("Proxy: via HTTPS_PROXY");
console.log("");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
let failures = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
};

// Pre-auth (anon) event.
const anon = createClient(url, key, opts);
const { error: anonErr } = await anon.from("analytics_events").insert({ event: "welcome_viewed", user_id: null });
ok("Anonymous can log a pre-auth event", !anonErr, anonErr ? "→ " + anonErr.message + "  (ran 0009?)" : "");

// Authed self-attributed event.
const a = createClient(url, key, opts);
const { data: signA } = await a.auth.signInAnonymously();
const uidA = signA.user.id;
const { error: selfErr } = await a.from("analytics_events").insert({ event: "guest_started", user_id: uidA });
ok("Guest can log a self-attributed event", !selfErr, selfErr ? "→ " + selfErr.message : "");

// Cannot attribute an event to a different user.
const { error: spoofErr } = await a
  .from("analytics_events")
  .insert({ event: "signup_completed", user_id: "00000000-0000-0000-0000-000000000000" });
ok("Cannot attribute an event to another user", !!spoofErr, spoofErr ? "" : "→ allowed!");

// Write-only: no client SELECT.
const { data: readBack } = await a.from("analytics_events").select("*").limit(5);
ok("Analytics is write-only for clients (no read)", (readBack?.length ?? 0) === 0, readBack?.length ? "→ READABLE!" : "");

console.log(`\n${failures === 0 ? "📈 Step 10 verified — funnel instrumentation is live." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
