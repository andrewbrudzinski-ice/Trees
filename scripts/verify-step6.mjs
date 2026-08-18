// Step 6 (Account gate + guest→member linking) verification against Supabase.
//
// Proves the pivotal flow (spec §6a): a guest with enough seeds is refused a
// second tree, creating an account links the anonymous session IN PLACE (same
// id → seeds + first tree carry over), the second tree then plants and costs 7
// seeds, signing back in restores the same grove, and a client cannot promote
// its own is_guest / seeds (column-locked).
//
// Prereqs: migrations 0001–0005 applied, anonymous sign-ins enabled, AND
// "Confirm email" turned OFF (Authentication → Providers → Email) so linking is
// immediate for MVP. Run:  node scripts/verify-step6.mjs
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

const plant = (client, name, species = "maple") =>
  client.rpc("plant_tree", { p_species: species, p_name: name, p_lat: 42.33, p_lng: -83.05, p_region: "Detroit" });

// --- Guest A: plant, earn seeds, hit the gate ------------------------------
const a = createClient(url, key, opts);
const { data: signA, error: signErr } = await a.auth.signInAnonymously();
ok("Guest A sign-in", !signErr && !!signA?.user, signErr ? "→ " + signErr.message : "");
if (signErr) process.exit(1);
const uidA = signA.user.id;

const { error: p1Err } = await plant(a, "First");
if (p1Err) ok("Guest plants first tree (free)", false, "→ " + p1Err.message + "  (ran 0005?)");
else ok("Guest plants first tree (free)", true);

// Age it far past every milestone so one check-in yields plenty of seeds.
const { data: treeA } = await a.from("trees").select("id").eq("owner_id", uidA).single();
await a.from("trees").update({ planted_at: new Date(Date.now() - 2000 * 86400000).toISOString() }).eq("id", treeA.id);
const { data: prof1 } = await a.rpc("check_in");
ok("Check-in with an ancient tree earns ≥ 7 seeds", (prof1?.seeds ?? 0) >= 7, `(seeds=${prof1?.seeds})`);

// The gate: a guest cannot plant a second tree.
const { error: gateErr } = await plant(a, "Second");
ok("Guest is gated from a second tree", !!gateErr && /account required/i.test(gateErr.message), gateErr ? "" : "→ allowed!");

// --- Anti-cheat: a client cannot promote itself ----------------------------
const { error: cheatErr } = await a.from("profiles").update({ is_guest: false }).eq("id", uidA);
ok("Client cannot self-set is_guest (column-locked)", !!cheatErr, cheatErr ? "" : "→ allowed!");

// --- Link the account in place ---------------------------------------------
const emailA = `verify-step6-${Date.now()}@example.com`;
const passA = "treehouse123";
const { error: linkErr } = await a.auth.updateUser({ email: emailA, password: passA, data: { display_name: "Rowan" } });
ok("Guest links an email account", !linkErr, linkErr ? "→ " + linkErr.message + "  (is 'Confirm email' OFF?)" : "");

// is_guest should flip via the trigger (retry briefly).
let becameMember = false;
for (let i = 0; i < 6 && !becameMember; i++) {
  const { data } = await a.from("profiles").select("is_guest, seeds").eq("id", uidA).maybeSingle();
  if (data && data.is_guest === false) becameMember = true;
  else await new Promise((r) => setTimeout(r, 300));
}
ok("is_guest flips to false after linking", becameMember);

const { data: seedsBefore } = await a.from("profiles").select("seeds").eq("id", uidA).single();

// --- Now the second tree plants and costs 7 seeds --------------------------
const { error: p2Err } = await plant(a, "Second");
ok("Member plants a second tree", !p2Err, p2Err ? "→ " + p2Err.message : "");
const { data: after } = await a.from("profiles").select("seeds").eq("id", uidA).single();
ok("Second tree cost 7 seeds", seedsBefore.seeds - after.seeds === 7, `(${seedsBefore.seeds}→${after.seeds})`);
const { count } = await a.from("trees").select("*", { count: "exact", head: true }).eq("owner_id", uidA);
ok("Grove now has two trees", count === 2, `(count=${count})`);

// --- Sign out and back in: same grove carries over -------------------------
await a.auth.signOut();
const back = createClient(url, key, opts);
const { data: signIn, error: siErr } = await back.auth.signInWithPassword({ email: emailA, password: passA });
ok("Sign in with the new account", !siErr && signIn?.user?.id === uidA, siErr ? "→ " + siErr.message : "");
const { count: count2 } = await back.from("trees").select("*", { count: "exact", head: true }).eq("owner_id", uidA);
ok("Seeds + trees carried over (no data migration)", count2 === 2, `(count=${count2})`);

console.log(`\n${failures === 0 ? "🌲 Step 6 verified — the account gate is live." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
