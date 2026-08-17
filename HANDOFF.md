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

## Next — Step 2: Tree model + growth math (spec §9–11, roadmap §17.2)

- `trees` and `tree_events` tables (schema in spec §8), additive migration
  `supabase/migrations/0002_*.sql`.
- Server-authoritative growth/age/health as pure functions, ported from the
  prototype's `growthT` / `ageFactor` / `stageInfo` / `recomputeHealth`
  (spec §9–11) — **with unit tests** (these need no network).
- **Dev-only time-warp** endpoint so a 7-day loop is testable (spec §11 note,
  §2 "Dev time-warp is a first-class dev tool").

Keep balances/age/health derived server-side; the client requests render state,
never computes it.
