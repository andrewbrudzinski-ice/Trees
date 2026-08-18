# Handoff — continuing The Tree in a fresh session

**Step 1 (Foundation) is complete and now LIVE-VERIFIED.** On 2026-08-17, in a
session allowed to reach `*.supabase.co`, `node scripts/verify-step1.mjs` passed
end to end against the real project: anonymous ("guest") sign-in ✅, profile
auto-created by the trigger (`is_guest=true, seeds=0, water=3`) ✅, and RLS
blocking cross-user reads ✅. Work continues on `claude/tree-step1-verify-ptdymu`
(based on the original `claude/the-tree-foundation-vkpyus`).

Two setup notes learned during that verification:
- The Supabase project needs **anonymous sign-ins enabled** (Authentication →
  Sign In / Providers) — the migration can't toggle this; it's a dashboard switch.
- In Claude Code web sessions, outbound HTTPS goes through an egress proxy. The
  verify script now self-re-execs with `NODE_USE_ENV_PROXY=1` when `HTTPS_PROXY`
  is set, so `node scripts/verify-step1.mjs` works both in web sessions and on a
  plain local machine. The environment's network policy must still permit
  `*.supabase.co`.

## Working agreement (from the project kickoff)

- **`the-tree-spec.md` is the source of truth.** `the-tree.html` is a throwaway
  prototype kept only as a reference for the procedural renderer (`renderTree()`)
  and the growth/age math (`growthT`, `ageFactor`, `stageInfo`, health decay).
- **Build one roadmap step at a time (spec §17), in order.** Finish and verify a
  step before starting the next. After each step, report what was built, how to
  test it, and the next step — then **wait for the user**.
- When spec and prototype disagree, **the spec wins**.
- **Server owns time.** Age, growth, health, and balances are derived
  server-side from timestamps/ledgers — never trusted from the client.

## Verify Step 1 (do this first)

1. Recreate `.env.local` at the repo root from `.env.local.example` with the
   project's URL and **anon/publishable** key (the browser-safe one — NOT the
   service_role/secret key). Ask the user for the two values if you don't have
   them.
2. Make sure the Supabase project is set up (see `supabase/SETUP.md`):
   migration `supabase/migrations/0001_foundation.sql` run, and **anonymous
   sign-ins enabled** (Authentication → Sign In / Providers → Anonymous).
3. Run:

   ```bash
   npm install
   node scripts/verify-step1.mjs
   ```

   Expect: anonymous sign-in ✅, profile auto-created (`is_guest=true`,
   `seeds=0`, `water=3`) ✅, and RLS blocking cross-user reads ✅, ending with
   "🌱 Step 1 verified".

   You can also verify in the browser: `npm run dev` → <http://localhost:3000>
   → "Plant your first tree" shows a Guest card.

## What Step 1 delivered

- Next.js (App Router) + TypeScript scaffold; `@supabase/ssr` clients
  (`src/lib/supabase/{client,server,middleware}.ts`).
- `profiles` table + RLS (own-row read/update only) + `on_auth_user_created`
  trigger that auto-creates a profile for guests and members alike.
- Anonymous auth as the guest entry point; a temporary Step 1 verification
  screen at `src/app/page.tsx`.
- Design tokens + fonts (Fraunces/Inter) ported from the prototype.

## Step 2 — Tree model + growth math (spec §9–11, roadmap §17.2) — BUILT

Offline-verified (unit tests + typecheck + `next build` all green). The live
schema check needs migration `0002` applied first (see below).

- **Migration `supabase/migrations/0002_tree_model.sql`**: `species` (seeded with
  maple/oak/pine free + cherry/birch/willow locked), `trees`, and append-only
  `tree_events`, with owner-scoped RLS and the GIST geo index. Public inspect/map
  views stay deferred to their own roadmap steps (§7/§8), matching 0001's pattern.
- **Growth math** — `src/lib/tree/growth.ts`: pure, server-authoritative
  functions of timestamps — `ageDays`, `growth` (g), `stage`, `ageFactor`,
  `ageTier`, `health`, and `computeTreeState` (the render state the client
  requests). Unit-tested in `src/lib/tree/growth.test.ts` (**17 tests, `npm test`
  via vitest**; no network needed).
- **Dev-only time-warp** — `src/app/api/dev/time-warp/route.ts`: 404 outside
  development. `POST {create:true}` plants a quick dev tree; `POST {days,treeId?}`
  ages a tree by moving `planted_at`/care timestamps *backwards in real server
  time* (server still owns the clock — no faked `now`, nothing trusted from the
  client). `GET` lists your trees with derived state.

### Decision recorded: `ageFactor` cap (spec §10 internal contradiction)

§10's literal formula caps `ageFactor` at ~2.6, which **saturates at day 188** —
so every tree from ~6 months to Elder (day 2000) would look identical. That
contradicts §10's own "grows slowly and indefinitely" and §17.3's "7/365/2000
must keep diverging". **Resolution (confirmed with the product owner):** keep the
spec's ×1.15 multiplier, raise the cap to `MAX_AGE_FACTOR = 4.0` so the whole
named lifespan stays on the diverging part of the curve (Elder ≈ 3.80, unclipped).

### To verify Step 2 live (after Step 1)

1. Apply `supabase/migrations/0002_tree_model.sql` in the Supabase SQL editor
   (same as 0001; idempotent). No new dashboard toggles — anonymous auth from
   Step 1 is all that's needed.
2. `node scripts/verify-step2.mjs` → expects the species catalog readable, a
   guest planting a tree + logging an event, and RLS blocking a second guest from
   reading or forging into the first's tree, ending "🌳 Step 2 verified".

## Step 3 — Procedural renderer (roadmap §17.3) — BUILT

Offline-verified (31 unit tests + typecheck + lint + `next build` all green).
This step is fully client/server-side rendering — no new DB or network.

- **`src/lib/tree/render.ts`**: `renderTree({ species, g, ageFactor, health, seed })`
  → SVG string. Pure, DOM-free, SSR-safe; the same function runs on the client
  and (for thumbnails) the server (spec §16). Ported from the prototype's
  `renderTree()`, preserving its geometry constants and RNG call order so output
  is deterministic per `seed`. Also exports `speciesVisual(key, render_params)`
  to build the visual from a `species` row.
- **`src/lib/tree/render.test.ts`** (14 tests): output shape, determinism,
  seed-mound + two-leaf-sprout early stages, per-species canopies (pine
  triangles / willow strands / cherry blossoms), health dimming, and the
  **§17.3 divergence gate** — element count rises monotonically 7 → 30 → 100 →
  365 → 1000 → 2000 (10→22→28→30→35→39), so ancient trees keep reading distinctly
  (this only holds because of the raised `ageFactor` cap from Step 2).
- **`.tree-breathe`** ambient-sway CSS added to `globals.css` (respects
  reduced-motion); the renderer emits `<g class="tree-breathe">`.
- **`scripts/render-gallery.mjs`**: renders 6 species × 9 ages into a
  self-contained HTML gallery via Node's TS type-stripping —
  `node scripts/render-gallery.mjs out.html` — for eyeballing the divergence.

The renderer takes `g`/`ageFactor`/`health` as inputs; callers derive them from
timestamps via `growth.ts` (server-authoritative) and pass them in. It never
reads a clock.

## Next — Step 4: Plant-first onboarding + Home (roadmap §17.4)

Species/name/map-pin plant flow **as a guest** (no signup wall); the home
screen showing the tree via `renderTree` + `computeTreeState`; a check-in RPC +
seed ledger (idempotent `dedupe_key`, e.g. `checkin:{user}:{date}` per §12/§14).
This is where the growth math, renderer, and the guest identity from Step 1 all
come together into the real loop. Keep balances/age/health server-derived; the
client requests render state, never computes it.
