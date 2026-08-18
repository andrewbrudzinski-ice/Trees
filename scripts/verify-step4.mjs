// Step 4 (Check-in + seed economy) end-to-end verification against Supabase.
//
// Proves the daily loop is server-authoritative and idempotent: a guest plants,
// checks in (+1 seed), a repeat check-in the same day pays nothing, a tree aged
// past maturity earns the +3 bonus exactly once, and balances reconcile to the
// ledger. RLS keeps another guest out of the ledger.
//
// Prereqs: migrations 0001–0003 applied, anonymous sign-ins enabled. Run:
//   node scripts/verify-step4.mjs
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

// Plant the free first tree.
const { data: tree, error: plantErr } = await a
  .from("trees")
  .insert({ owner_id: uidA, species_key: "maple", name: "verify-step4", visual_seed: 7, lat: 42.33, lng: -83.05, region_label: "Detroit" })
  .select("*")
  .single();
ok("Guest A plants first tree", !plantErr && !!tree, plantErr ? "→ " + plantErr.message : "");

// First check-in → +1 seed.
const { data: p1, error: ci1 } = await a.rpc("check_in");
if (ci1) ok("check_in RPC", false, "→ " + ci1.message + "  (did you run 0003_checkin_economy.sql?)");
else {
  ok("First check-in grants +1 seed", p1.seeds === 1, `(seeds=${p1.seeds})`);
  ok("Streak starts at 1", p1.streak_count === 1);
  ok("last_checkin_date set to today", !!p1.last_checkin_date);
}

// Second check-in same day → idempotent, no extra seed.
const { data: p2 } = await a.rpc("check_in");
ok("Repeat check-in same day pays nothing", p2?.seeds === 1, `(seeds=${p2?.seeds})`);

// Balance reconciles to the ledger.
const { data: txs } = await a.from("seed_transactions").select("amount,reason");
const ledgerSum = (txs ?? []).reduce((s, t) => s + t.amount, 0);
ok("Cached balance == ledger sum", ledgerSum === p2?.seeds, `(ledger=${ledgerSum})`);
ok("Exactly one daily_checkin row", (txs ?? []).filter((t) => t.reason === "daily_checkin").length === 1);

// Age the tree past maturity, then check in → +3 maturity bonus, once.
if (tree) {
  const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
  await a.from("trees").update({ planted_at: eightDaysAgo }).eq("id", tree.id);

  const { data: p3 } = await a.rpc("check_in");
  ok("Maturity bonus (+3) granted after day 7", p3?.seeds === 4, `(seeds=${p3?.seeds})`);

  const { data: p4 } = await a.rpc("check_in");
  ok("Maturity bonus is idempotent (still 4)", p4?.seeds === 4, `(seeds=${p4?.seeds})`);

  const { data: evs } = await a.from("tree_events").select("kind").eq("tree_id", tree.id);
  const kinds = new Set((evs ?? []).map((e) => e.kind));
  ok("Biography logged sapling + mature milestones", kinds.has("sapling") && kinds.has("mature"), `(${[...kinds].join(",")})`);

  const { data: mtx } = await a.from("seed_transactions").select("reason").eq("reason", "maturity_bonus");
  ok("Exactly one maturity_bonus ledger row", (mtx ?? []).length === 1);
}

// RLS: guest B cannot read guest A's ledger.
const b = createClient(url, key, opts);
await b.auth.signInAnonymously();
const { data: leak } = await b.from("seed_transactions").select("*").eq("user_id", uidA);
ok("RLS: guest B cannot read guest A's ledger", (leak?.length ?? 0) === 0, leak?.length ? "→ LEAKED!" : "");

console.log(`\n${failures === 0 ? "🌱 Step 4 verified — the daily loop is live." : `${failures} check(s) failed.`}`);
console.log("(Leaves a 'verify-step4' tree + ledger rows on a throwaway guest; clear in the dashboard if desired.)");
process.exit(failures === 0 ? 0 : 1);
