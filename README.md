# The Tree

> Plant a tree. Come back tomorrow. Watch it grow into something only time could make.

A living-forest web app where **time is the scarce resource**: a 1,000-day tree
can't be bought, only lived. Built from `the-tree-spec.md` (the source of truth);
`the-tree.html` is a throwaway prototype kept only as a reference for the
procedural tree renderer and the growth/age math.

## Stack

- **Next.js (App Router) + React + TypeScript**
- **Supabase** — Postgres, Auth (incl. anonymous/guest), Row-Level Security, Edge Functions
- MapLibre GL (map), Framer Motion (transitions) — arrive in later roadmap steps

## Getting started

1. Create a Supabase project and run the migrations, following
   **[`supabase/SETUP.md`](supabase/SETUP.md)**.
2. Copy `.env.local.example` → `.env.local` and fill in your project URL + anon key.
3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Open <http://localhost:3000>.

## Roadmap status (spec §17)

The app is built **one roadmap step at a time**, in order.

- [x] **Step 1 — Foundation.** Next.js + TypeScript scaffold; Supabase clients
      (browser/server/middleware) via `@supabase/ssr`; `profiles` table with RLS;
      a trigger that auto-creates a profile for every user; **anonymous auth** so a
      first plant creates a guest identity with no signup. The home page is a
      temporary verification screen that exercises guest sign-in → profile → RLS.
- [ ] Step 2 — Tree model + growth/age/health math (server-authoritative) + dev time-warp
- [ ] Step 3 — Procedural SVG renderer (port of `renderTree()`)
- [ ] Step 4 — Plant-first onboarding + Home + check-in/seed ledger
- [ ] Step 5 — Health + water
- [ ] Step 6 — Second tree + Grove + account gate (anonymous→email linking)
- [ ] Step 7 — Journal + Inspect + Profile + Admire
- [ ] Step 8 — Map (MapLibre, clustering, ambient forest)
- [ ] Step 9 — Polish + anti-cheat pass
- [ ] Step 10 — Ship + instrument + tune

## Project layout

```
src/
  app/
    layout.tsx        Root layout, fonts (Fraunces serif + Inter), metadata
    page.tsx          Step 1 verification screen (temporary)
    globals.css       "Naturalist observatory" design tokens (ported from prototype)
  lib/
    supabase/
      client.ts       Browser Supabase client
      server.ts       Server Component / Route Handler client
      middleware.ts   Session-refresh helper
    types.ts          Shared DB-mirroring types
  middleware.ts       Next.js middleware entry (refreshes the auth session)
supabase/
  migrations/
    0001_foundation.sql   profiles + RLS + auto-profile trigger
  SETUP.md                Step-by-step Supabase setup
```

## Core principles (keep visible on every decision)

- **Server owns time.** Age, growth stage, health, and all balances are derived
  server-side from timestamps and event logs — never trusted from the client.
- **Money and accounts buy _breadth_, never _depth_.** A guest's single tree can
  reach Elder and be every bit as special as a paying member's.
- **First tree is free and complete; the account gate is at tree #2.**
