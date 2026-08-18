# The Tree

> Plant a tree. Come back tomorrow. Watch it grow into something only time could make.

A living-forest web app where **time is the scarce resource**: a 1,000-day tree
can't be bought, only lived. Built from `the-tree-spec.md` (the source of truth);
`the-tree.html` is a throwaway prototype kept only as a reference for the
procedural tree renderer and the growth/age math.

## Stack

- **Next.js (App Router) + React + TypeScript**
- **Supabase** — Postgres, Auth (incl. anonymous/guest), Row-Level Security
- **MapLibre GL** — a full-screen globe Earth with satellite imagery + 3D terrain
  (keyless by default; a `NEXT_PUBLIC_MAPTILER_KEY` upgrades the tiles)

## Getting started

1. Create a Supabase project and run the migrations, following
   **[`supabase/SETUP.md`](supabase/SETUP.md)**.
2. Copy `.env.local.example` → `.env.local` and fill in your project URL + anon key.
3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Open <http://localhost:3000>. To **deploy**, see **[`DEPLOY.md`](DEPLOY.md)**;
   to analyze the funnel, **[`docs/METRICS.md`](docs/METRICS.md)**; for the current
   working state and next steps, **[`HANDOFF.md`](HANDOFF.md)**.

   Each roadmap step has a one-command live check, e.g. `node scripts/verify-step9.mjs`.

## Roadmap status (spec §17) — MVP complete

Built **one roadmap step at a time**, in order; each verified live against Supabase.

- [x] **Step 1 — Foundation:** scaffold, `@supabase/ssr` clients, `profiles` + RLS,
      auto-profile trigger, **anonymous/guest auth**.
- [x] **Step 2 — Tree model + growth math:** `trees`/`tree_events`, server-authoritative
      age/growth/health as pure functions (unit-tested), dev time-warp.
- [x] **Step 3 — Procedural SVG renderer:** typed port of `renderTree()`; a 7/365/2000-day
      tree reads distinctly.
- [x] **Step 4 — Plant-first onboarding + Home:** guest plant flow, Home, idempotent
      check-in + seed ledger.
- [x] **Step 5 — Health + water:** `water()` RPC + ledger; Home's second action.
- [x] **Step 6 — Second tree + Grove + account gate:** state-aware plant slot,
      email signup with **anonymous→member linking** (seeds + first tree carry over).
- [x] **Step 7 — Journal + Inspect + Profile + Admire:** owner-only health/timeline,
      public inspect/profiles via scoped views, one-per-user admire.
- [x] **Step 8 — The Forest map:** full-screen **globe Earth** (satellite + 3D terrain),
      density heatmap → clusters → individual trees; **8b:** plant on the globe with
      server-side location **privacy fuzzing**.
- [x] **Step 9 — Polish + anti-cheat:** trees mutate only via RPCs (no plant-cost or
      age cheat), balances/`is_guest` column-locked, reduced-motion + mobile polish.
- [x] **Step 10 — Ship + instrument:** funnel/analytics, `DEPLOY.md`, `docs/METRICS.md`.

## Project layout

```
src/
  app/
    page.tsx              App shell: welcome → plant → Home / Grove / Forest
    layout.tsx            Root layout, fonts, MapLibre CSS
    globals.css           "Naturalist observatory" design tokens + all UI styles
    api/home/route.ts     Server-authoritative render state for the signed-in user
    api/dev/time-warp/    Dev-only time-warp (guarded; inert in production)
  components/             Home, Grove, PlantFlow, PlantMap, ForestMap,
                          TreeSheet (Journal/Inspect), ProfileSheet, Account, …
  lib/
    tree/
      growth.ts           Server-authoritative age/growth/health (pure, tested)
      render.ts           Procedural SVG tree renderer (pure, tested)
      economy.ts          SECOND_TREE_COST + helpers   events.ts  geo.ts  mapstyle.ts
      api.ts              Shapes for the app's routes/views
    supabase/{client,server,middleware}.ts   @supabase/ssr clients
    analytics.ts          Best-effort funnel tracking
    types.ts              DB-mirroring types
supabase/migrations/      0001 foundation … 0009 analytics (apply in order)
supabase/SETUP.md         Per-step Supabase setup
scripts/verify-step*.mjs  One-command live checks per step
DEPLOY.md  docs/METRICS.md  HANDOFF.md
```

## Core principles (keep visible on every decision)

- **Server owns time.** Age, growth stage, health, and all balances are derived
  server-side from timestamps and event logs — never trusted from the client.
- **Money and accounts buy _breadth_, never _depth_.** A guest's single tree can
  reach Elder and be every bit as special as a paying member's.
- **First tree is free and complete; the account gate is at tree #2.**
