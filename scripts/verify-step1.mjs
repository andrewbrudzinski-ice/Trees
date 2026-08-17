// Step 1 (Foundation) end-to-end verification against the real Supabase backend.
//
// Proves the foundation works: anonymous ("guest") sign-in -> profile row
// auto-created by the on_auth_user_created trigger -> Row-Level Security scopes
// reads to the signed-in user only.
//
// Usage (from the repo root):
//   node scripts/verify-step1.mjs
//
// Credentials are read from process.env, falling back to a local .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//
// Requires this environment to be allowed to reach *.supabase.co (see HANDOFF.md).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
  } catch {
    // no .env.local — rely on process.env
  }
  return out;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
      "Create .env.local from .env.local.example, or pass them as env vars.",
  );
  process.exit(2);
}

console.log("URL:", url);
console.log("Key:", key.slice(0, 20) + "…\n");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function ok(label, cond, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
}

// 1. Anonymous sign-in — the "first plant creates a guest" moment.
const { data: signData, error: signErr } = await supabase.auth.signInAnonymously();
ok("Anonymous sign-in succeeds", !signErr && !!signData?.user, signErr ? "→ " + signErr.message : "");
if (signErr) {
  console.log(
    "\nIf this reports anonymous sign-ins are disabled, enable them in\n" +
      "Authentication → Sign In / Providers → Anonymous.",
  );
  process.exit(1);
}
const uid = signData.user.id;
console.log("   guest uid:", uid, "| is_anonymous:", signData.user.is_anonymous);

// 2. Profile auto-created by the trigger (retry: it can land just after signup).
let profile = null;
for (let i = 0; i < 8; i++) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) { ok("Profile read (RLS)", false, "→ " + error.message); break; }
  if (data) { profile = data; break; }
  await new Promise((r) => setTimeout(r, 300));
}
ok("Profile auto-created by trigger", !!profile);
if (profile) {
  console.log("   profile:", JSON.stringify(profile));
  ok("is_guest defaults true for a guest", profile.is_guest === true);
  ok("seeds defaults to 0", profile.seeds === 0);
  ok("water defaults to 3", profile.water === 3);
  ok("profile.id == auth uid", profile.id === uid);
}

// 3. RLS negative check: a second, unrelated guest must NOT see the first's row.
const other = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
await other.auth.signInAnonymously();
const { data: leaked } = await other.from("profiles").select("*").eq("id", uid).maybeSingle();
ok("RLS blocks reading another user's profile", leaked === null, leaked ? "→ LEAKED!" : "");
const { data: visible } = await other.from("profiles").select("id");
ok("A guest sees only its own row", visible?.length === 1, `(saw ${visible?.length})`);

console.log(`\n${failures === 0 ? "🌱 Step 1 verified — foundation is live." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
