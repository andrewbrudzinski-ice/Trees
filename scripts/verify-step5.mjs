// Step 5 (Health + water) end-to-end verification against Supabase.
//
// Proves watering is server-authoritative: a guest starts with 3 water, a
// check-in grants +1 (→4), watering a tree spends 1 (→3), refreshes health
// (last_watered_at) and logs a 'watered' event, the balance reconciles to the
// ledger, watering with zero water is refused, and RLS keeps the water ledger
// private.
//
// Prereqs: migrations 0001–0004 applied, anonymous sign-ins enabled. Run:
//   node scripts/verify-step5.mjs
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
const { data: signA, error: signErr } = await a.auth.signInAnonymously();
ok("Guest A sign-in", !signErr && !!signA?.user, signErr ? "→ " + signErr.message : "");
if (signErr) process.exit(1);
const uidA = signA.user.id;

const { data: prof0 } = await a.from("profiles").select("water").eq("id", uidA).single();
ok("Starts with 3 water", prof0?.water === 3, `(water=${prof0?.water})`);

const { data: tree } = await a
  .from("trees")
  .insert({ owner_id: uidA, species_key: "oak", name: "verify-step5", visual_seed: 5, lat: 51.5, lng: -0.12, region_label: "London" })
  .select("*")
  .single();
ok("Guest A plants a tree", !!tree);

// Check-in grants +1 water → 4.
const { data: p1, error: ciErr } = await a.rpc("check_in");
if (ciErr) ok("check_in RPC", false, "→ " + ciErr.message);
else ok("Check-in grants +1 water (→4)", p1.water === 4, `(water=${p1.water})`);

// Water the tree → spends 1 → 3.
const { data: p2, error: wErr } = await a.rpc("water", { p_tree: tree.id });
if (wErr) ok("water RPC", false, "→ " + wErr.message + "  (did you run 0004_water.sql?)");
else ok("Watering spends 1 water (→3)", p2.water === 3, `(water=${p2.water})`);

// Ledger reconciles: 3 (start) + (+1 checkin) + (-1 water) = 3.
const { data: wtx } = await a.from("water_transactions").select("amount");
const ledger = (wtx ?? []).reduce((s, t) => s + t.amount, 0);
ok("Balance == 3 + ledger sum", 3 + ledger === (p2?.water ?? -1), `(3+${ledger})`);

// A 'watered' event was logged, and last_watered_at is set (health refreshed).
const { data: evs } = await a.from("tree_events").select("kind").eq("tree_id", tree.id);
ok("A 'watered' event was logged", (evs ?? []).some((e) => e.kind === "watered"));
const { data: treeAfter } = await a.from("trees").select("last_watered_at").eq("id", tree.id).single();
ok("last_watered_at is set (health refreshed)", !!treeAfter?.last_watered_at);

// Spend the rest, then watering with zero water must be refused.
await a.rpc("water", { p_tree: tree.id }); // 3 → 2
await a.rpc("water", { p_tree: tree.id }); // 2 → 1
const { data: pLast } = await a.rpc("water", { p_tree: tree.id }); // 1 → 0
ok("Water reaches 0 after spending", pLast?.water === 0, `(water=${pLast?.water})`);
const { error: emptyErr } = await a.rpc("water", { p_tree: tree.id }); // 0 → refused
ok("Watering with no water is refused", !!emptyErr, emptyErr ? "" : "→ allowed!");

// Watering a tree you don't own is refused.
const b = createClient(url, key, opts);
await b.auth.signInAnonymously();
const { error: theftErr } = await b.rpc("water", { p_tree: tree.id });
ok("Cannot water someone else's tree", !!theftErr, theftErr ? "" : "→ allowed!");
const { data: leak } = await b.from("water_transactions").select("*").eq("user_id", uidA);
ok("RLS: guest B cannot read guest A's water ledger", (leak?.length ?? 0) === 0, leak?.length ? "→ LEAKED!" : "");

console.log(`\n${failures === 0 ? "💧 Step 5 verified — water is live." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
