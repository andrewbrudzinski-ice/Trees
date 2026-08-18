// Step 7 (Inspect + public profile + admire) verification against Supabase.
//
// Proves the public-but-scoped read paths (spec §7/§8): another user can inspect
// a tree's species/age/location + admire count and see its SHORT public timeline
// (milestones only), but NEVER its health, care history ('watered'), or the
// owner's private profile row. Admire is one-per-user and toggles.
//
// Prereqs: migrations 0001–0006 applied, anonymous sign-ins enabled. Run:
//   node scripts/verify-step7.mjs
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

// --- Guest A: a tree with private care + public milestones ------------------
const a = createClient(url, key, opts);
const { data: signA, error: sErr } = await a.auth.signInAnonymously();
ok("Guest A sign-in", !sErr && !!signA?.user, sErr ? "→ " + sErr.message : "");
if (sErr) process.exit(1);
const uidA = signA.user.id;

const { error: pErr } = await a.rpc("plant_tree", { p_species: "cherry", p_name: "Cherith", p_lat: 48.85, p_lng: 2.35, p_region: "Paris" });
if (pErr) ok("Guest A plants a tree", false, "→ " + pErr.message);
const { data: treeA } = await a.from("trees").select("id").eq("owner_id", uidA).single();

await a.rpc("water", { p_tree: treeA.id }); // a private 'watered' event
await a.rpc("dev_warp", { p_tree: treeA.id, p_days: 400 });
await a.rpc("check_in"); // logs planted/sapling/mature/age_30/age_100/age_365

// --- Guest B: inspect A's tree publicly ------------------------------------
const b = createClient(url, key, opts);
const { data: signB } = await b.auth.signInAnonymously();
const uidB = signB.user.id;

const { data: insp, error: iErr } = await b.from("tree_inspect").select("*").eq("id", treeA.id).maybeSingle();
if (iErr) ok("B can inspect A's tree (public view)", false, "→ " + iErr.message + "  (ran 0006?)");
else {
  ok("B can inspect A's tree (public view)", !!insp && insp.name === "Cherith");
  const keys = Object.keys(insp ?? {});
  ok("Inspect exposes NO health/care columns", !keys.some((k) => ["health", "health_cache", "last_watered_at", "last_visit_at"].includes(k)), `(keys: ${keys.join(",")})`);
}

const { data: pubEvs } = await b.from("tree_public_events").select("kind").eq("tree_id", treeA.id);
const kinds = new Set((pubEvs ?? []).map((e) => e.kind));
ok("Public timeline shows milestones (planted, mature)", kinds.has("planted") && kinds.has("mature"));
ok("Public timeline hides private 'watered' events", !kinds.has("watered"), kinds.has("watered") ? "→ LEAKED!" : "");

// B cannot read A's full private event log or profile row directly.
const { data: privEvs } = await b.from("tree_events").select("*").eq("tree_id", treeA.id);
ok("B cannot read A's full tree_events (RLS)", (privEvs?.length ?? 0) === 0, privEvs?.length ? "→ LEAKED!" : "");
const { data: privProf } = await b.from("profiles").select("*").eq("id", uidA).maybeSingle();
ok("B cannot read A's private profile row (RLS)", privProf === null, privProf ? "→ LEAKED!" : "");

// But B can read A's PUBLIC profile (no email/auth).
const { data: pubProf } = await b.from("profile_public").select("*").eq("id", uidA).maybeSingle();
ok("B can read A's public profile", !!pubProf && !!pubProf.created_at);
ok("Public profile exposes no email/auth", !Object.keys(pubProf ?? {}).some((k) => ["email", "seeds", "water", "is_guest"].includes(k)));

// --- Admire: one per user, toggles -----------------------------------------
await b.from("tree_reactions").insert({ tree_id: treeA.id, user_id: uidB });
const { data: after1 } = await b.from("tree_inspect").select("admire_count").eq("id", treeA.id).single();
ok("Admire increments the public count", after1.admire_count === 1, `(count=${after1.admire_count})`);

// Duplicate admire is rejected (one per user per tree).
const { error: dupErr } = await b.from("tree_reactions").insert({ tree_id: treeA.id, user_id: uidB });
ok("Duplicate admire is rejected", !!dupErr);

await b.from("tree_reactions").delete().eq("tree_id", treeA.id);
const { data: after0 } = await b.from("tree_inspect").select("admire_count").eq("id", treeA.id).single();
ok("Un-admire decrements the count", after0.admire_count === 0, `(count=${after0.admire_count})`);

console.log(`\n${failures === 0 ? "🌿 Step 7 verified — inspect, profiles & admire are live." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
