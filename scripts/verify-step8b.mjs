// Step 8b (plant-location privacy fuzzing) verification against Supabase.
//
// Proves plant_tree() never stores the exact chosen coordinate: it snaps to a
// ~1 km grid (2 decimals) with a small jitter, so the public map shows only an
// AREA, not an address. Prereqs: migrations 0001–0007 applied, anon sign-ins on.
//   node scripts/verify-step8b.mjs
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

const a = createClient(url, key, opts);
const { data: signA, error: sErr } = await a.auth.signInAnonymously();
ok("Guest sign-in", !sErr && !!signA?.user, sErr ? "→ " + sErr.message : "");
if (sErr) process.exit(1);
const uid = signA.user.id;

// Plant at a deliberately precise "home address" coordinate.
const exactLat = 42.331427;
const exactLng = -83.045753;
const { error: pErr } = await a.rpc("plant_tree", {
  p_species: "maple",
  p_name: "verify-8b",
  p_lat: exactLat,
  p_lng: exactLng,
  p_region: "Detroit",
});
if (pErr) ok("plant_tree runs", false, "→ " + pErr.message + "  (ran 0007?)");

const { data: tree } = await a.from("trees").select("lat,lng").eq("owner_id", uid).single();
if (tree) {
  console.log(`   input (${exactLat}, ${exactLng}) → stored (${tree.lat}, ${tree.lng})`);
  ok("Stored coordinate is NOT the exact input", tree.lat !== exactLat && tree.lng !== exactLng);
  ok("Stored coordinate is snapped to 2 decimals (~1 km grid)",
    Number.isInteger(Math.round(tree.lat * 100)) && Math.abs(tree.lat * 100 - Math.round(tree.lat * 100)) < 1e-9 &&
    Math.abs(tree.lng * 100 - Math.round(tree.lng * 100)) < 1e-9,
    `(${tree.lat}, ${tree.lng})`);
  const km = Math.hypot((tree.lat - exactLat) * 111, (tree.lng - exactLng) * 111 * Math.cos((exactLat * Math.PI) / 180));
  ok("Fuzzed point stays in the right area (< 2 km)", km < 2, `(${km.toFixed(2)} km away)`);
}

console.log(`\n${failures === 0 ? "📍 Step 8b verified — plant locations are privacy-fuzzed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
