// Step 9 (anti-cheat / RLS audit) verification against Supabase.
//
// Consolidates the security guarantees: clients cannot insert or mutate trees
// directly (plant + time are server-owned), cannot promote themselves or mint
// balances, and cannot read another user's health / private history / profile.
//
// Prereqs: migrations 0001–0008 applied, anon sign-ins on. Run:
//   node scripts/verify-step9.mjs
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
ok("Guest A sign-in", !sErr && !!signA?.user, sErr ? "→ " + sErr.message : "");
if (sErr) process.exit(1);
const uidA = signA.user.id;

const { data: tree, error: pErr } = await a
  .rpc("plant_tree", { p_species: "maple", p_name: "verify-9", p_lat: 42.33, p_lng: -83.05, p_region: "Detroit" })
  .single();
ok("Plant via RPC works", !pErr && !!tree, pErr ? "→ " + pErr.message : "");

// --- Trees are server-owned: no direct client insert or update -------------
const { data: ins, error: insErr } = await a
  .from("trees")
  .insert({ owner_id: uidA, species_key: "maple", name: "hack", visual_seed: 1, lat: 0, lng: 0 })
  .select("*");
ok("Direct tree INSERT is blocked", !!insErr || (ins?.length ?? 0) === 0, ins?.length ? "→ INSERTED!" : "");

if (tree) {
  const cheatDate = new Date(Date.now() - 3000 * 86400000).toISOString();
  await a.from("trees").update({ planted_at: cheatDate }).eq("id", tree.id);
  const { data: after } = await a.from("trees").select("planted_at").eq("id", tree.id).single();
  ok("Direct planted_at UPDATE is blocked (no age-cheat)", after?.planted_at === tree.planted_at,
    after?.planted_at === tree.planted_at ? "" : "→ AGE FAKED!");
}

// --- Profiles: is_guest / seeds / water are server-owned -------------------
const { error: guestErr } = await a.from("profiles").update({ is_guest: false }).eq("id", uidA);
ok("Cannot self-set is_guest", !!guestErr, guestErr ? "" : "→ allowed!");
await a.from("profiles").update({ seeds: 99999 }).eq("id", uidA).catch(() => {});
const { data: prof } = await a.from("profiles").select("seeds").eq("id", uidA).single();
ok("Cannot mint seeds via profiles", (prof?.seeds ?? 0) < 99999, `(seeds=${prof?.seeds})`);

// --- Cross-user privacy: no health / private history / profile leak --------
const b = createClient(url, key, opts);
await b.auth.signInAnonymously();

const { data: insp } = await b.from("tree_inspect").select("*").eq("id", tree?.id).maybeSingle();
ok("Public inspect exposes no health/care columns",
  !!insp && !Object.keys(insp).some((k) => ["health", "health_cache", "last_watered_at", "last_visit_at"].includes(k)));
const { data: pe } = await b.from("tree_events").select("*").eq("tree_id", tree?.id);
ok("Cannot read another user's tree_events", (pe?.length ?? 0) === 0, pe?.length ? "→ LEAKED!" : "");
const { data: pr } = await b.from("profiles").select("*").eq("id", uidA).maybeSingle();
ok("Cannot read another user's profile row", pr === null, pr ? "→ LEAKED!" : "");
const { data: pubp } = await b.from("profile_public").select("*").eq("id", uidA).maybeSingle();
ok("Public profile carries no email/auth", !!pubp && !Object.keys(pubp).some((k) => ["email", "seeds", "water", "is_guest"].includes(k)));

console.log(`\n${failures === 0 ? "🛡️ Step 9 verified — the anti-cheat surface holds." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
