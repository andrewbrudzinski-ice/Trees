// Step 2 (Tree model) end-to-end verification against the real Supabase backend.
//
// Proves migration 0002 works: the species catalog is readable, a guest can
// plant a tree and log an event scoped to itself, and Row-Level Security keeps
// one guest's trees/events private from another.
//
// Prereqs: migration 0002_tree_model.sql applied, and (from Step 1) anonymous
// sign-ins enabled. Run from the repo root:
//   node scripts/verify-step2.mjs
//
// Proxy note (same as verify-step1): supabase-js uses Node's built-in fetch,
// which ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set at process start.
// When a proxy is configured we re-exec ourselves once with that flag.
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
  } catch {
    // no .env.local — rely on process.env
  }
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

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };

let failures = 0;
function ok(label, cond, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
}

// --- Guest A: sign in and read the species catalog --------------------------
const a = createClient(url, key, clientOpts);
const { data: signA, error: signErrA } = await a.auth.signInAnonymously();
ok("Guest A anonymous sign-in", !signErrA && !!signA?.user, signErrA ? "→ " + signErrA.message : "");
if (signErrA) process.exit(1);
const uidA = signA.user.id;

const { data: species, error: spErr } = await a.from("species").select("*").order("key");
if (spErr) {
  ok("Species catalog readable", false, "→ " + spErr.message + "  (did you run 0002_tree_model.sql?)");
} else {
  ok("Species catalog readable", (species?.length ?? 0) >= 6, `(saw ${species?.length})`);
  const free = new Set(species.filter((s) => s.is_free).map((s) => s.key));
  ok("maple/oak/pine are free species", ["maple", "oak", "pine"].every((k) => free.has(k)));
  const cherry = species.find((s) => s.key === "cherry");
  ok("locked species carry an unlock_rule", !!cherry && cherry.is_free === false && !!cherry.unlock_rule);
}

// --- Guest A: plant a tree + log an event, scoped to itself -----------------
const treeIns = {
  owner_id: uidA,
  species_key: "maple",
  name: "verify-step2",
  visual_seed: Math.floor(Math.random() * 1_000_000),
  lat: 42.3314,
  lng: -83.0458,
  region_label: "Detroit",
};
const { data: tree, error: treeErr } = await a.from("trees").insert(treeIns).select("*").single();
ok("Guest A can plant a tree (RLS insert)", !treeErr && !!tree, treeErr ? "→ " + treeErr.message : "");
if (tree) {
  ok("tree.owner_id == guest A", tree.owner_id === uidA);
  ok("tree.is_alive defaults true", tree.is_alive === true);
  ok("planted_at is server-set", !!tree.planted_at);
  console.log("   tree:", tree.id, "|", tree.species_key, "|", tree.name);

  const { error: evErr } = await a
    .from("tree_events")
    .insert({ tree_id: tree.id, kind: "planted", meta: { via: "verify-step2" } });
  ok("Guest A can log a tree_event", !evErr, evErr ? "→ " + evErr.message : "");

  const { data: ownEvents } = await a.from("tree_events").select("*").eq("tree_id", tree.id);
  ok("Guest A sees its own tree_events", (ownEvents?.length ?? 0) >= 1, `(saw ${ownEvents?.length})`);
}

// --- Guest B: must not see or write into guest A's tree ----------------------
const b = createClient(url, key, clientOpts);
await b.auth.signInAnonymously();

const { data: leakTrees } = await b.from("trees").select("*").eq("owner_id", uidA);
ok("RLS: guest B cannot read guest A's trees", (leakTrees?.length ?? 0) === 0, leakTrees?.length ? "→ LEAKED!" : "");

if (tree) {
  const { data: leakEvents } = await b.from("tree_events").select("*").eq("tree_id", tree.id);
  ok("RLS: guest B cannot read guest A's tree_events", (leakEvents?.length ?? 0) === 0, leakEvents?.length ? "→ LEAKED!" : "");
}

// Guest B forging a tree owned by A must be rejected by the insert check.
const { data: forged, error: forgeErr } = await b
  .from("trees")
  .insert({ ...treeIns, name: "forged" })
  .select("*");
ok("RLS: guest B cannot plant a tree owned by A", !!forgeErr || (forged?.length ?? 0) === 0, forged?.length ? "→ FORGED!" : "");

// Guest B can still read the shared species catalog.
const { data: spB } = await b.from("species").select("key");
ok("Species catalog is shared (guest B reads it too)", (spB?.length ?? 0) >= 6, `(saw ${spB?.length})`);

console.log(`\n${failures === 0 ? "🌳 Step 2 verified — tree model is live." : `${failures} check(s) failed.`}`);
console.log("(Note: this leaves one 'verify-step2' tree on guest A; clear test rows in the dashboard if desired.)");
process.exit(failures === 0 ? 0 : 1);
