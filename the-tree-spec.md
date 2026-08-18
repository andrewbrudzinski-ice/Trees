# The Tree — Build Specification (v2)

*Plant a tree. Come back tomorrow. Watch it grow into something only time could make.*

This is the working spec for the production build. The companion file `the-tree.html` is a
throwaway prototype that proves the loop; treat this document as the source of truth. Where the
two disagree, this wins.

**Settled since v1:** plant-first onboarding with a free guest tier; the account gate lives at the
*second* tree, not the first; guest seeds + first tree carry over on signup; the map uses MapLibre
GL with real geography (the prototype's hand-drawn continents are throwaway).

---

## 1. Product analysis (what we're actually building)

The defensible idea is **time as the scarce resource**. A 1,000-day tree cannot be bought, only
lived. Everything in the design should protect that: money buys *breadth* (more trees, cosmetics),
never *age* or *health advantage*.

**The account model follows the same principle.** An account buys breadth, never depth. A guest's
single tree can become a 1,000-day Elder every bit as special as a member's — signing up gets you
*more* forest (a second tree and beyond), never a *better* individual tree. This is why the first
tree is free and complete, and the account gate lives at tree #2 (see §6a).

Three risks drive most of the design decisions below:

1. **Cold-start emptiness.** The shared map is the product, but the map is empty at launch. We
   solve this by seeding ambient/procedural forest so no region ever looks dead, and by making the
   *individual tree* satisfying enough to carry retention before the map is full.
2. **The pre-loop retention cliff (days 1–6).** A user must return for a week before the loop
   closes with a second tree. We front-load delight (a real visible jump on day 1) and time the
   economy so the second tree unlocks right as the first matures (~day 5–6).
3. **Punishment vs. peace.** Health decay creates anxiety, which fights the calm goal. In the MVP,
   **trees do not die.** They wilt and fully recover on a visit. Death and revival are V2, added
   only once we know people are attached enough to fear loss.

---

## 2. Recommended changes from the original brief

- **No tree death in MVP.** Wilt only; one visit restores. (Brief §6 death → V2.)
- **Seed the map** with ambient forest for density. Real user trees render distinctly.
- **Health is gentle:** grace period of 1 full day, slow decay after, hard floor so nothing is ever
  destroyed in MVP.
- **Plant-first onboarding.** No signup wall. A guest plants, names, grows, waters, checks in, earns
  seeds, and explores the whole forest with one tree — the full magic, free. (See §6a.)
- **Account gate at tree #2, not tree #1.** The account unlocks *breadth*. When a guest earns enough
  seeds and tries to plant their second tree, that's the signup moment; the first tree is never
  gated. Guest seeds + first tree carry over on signup.
- **Real map.** Production uses MapLibre GL with real vector geography and a custom minimal style;
  the prototype's hand-typed continents exist only to test the explore/tap loop. (See §13.)
- **Cut from MVP** (all → V2): weather, day/night, seasons, rare variants, achievements, forest
  events, sound, revival. They're polish on an unproven loop.
- **Dev time-warp** is a first-class dev tool (see §11). Without it you cannot test a 7-day loop.

---

## 3. Core gameplay loop

```
🌱 Plant → 🌿 Return daily → 🌳 Watch the stage change → 🌲 Maintain (water) →
🌱 Earn seeds → 🌱 Plant another → 🌎 Explore the forest → (repeat, for years)
```

The user never needs to understand a "game." The magic is the passage of time.

---

## 4. MVP scope

Plant-first onboarding (guest) · plant first tree (species/name/location on a real map) · 7-day
visual growth · gentle health · daily check-in + seeds · water · account creation gated at tree #2 ·
plant additional trees · personal Grove · clustered map with real locations · tap-to-inspect any
tree · tap-through to any owner's public profile · one-tap "admire" reaction · tree age · basic
long-term evolution (age tiers) · tree journal/timeline.

**Explicitly out of MVP:** weather, seasons, day/night, rare trees, achievements, death/revival,
sound, global live-event system.

*(Note: light social — public inspect, public profiles, a single "admire" reaction — is in the MVP
because it makes the shared map legible. It stays deliberately minimal per the brief: no feeds,
follows, likes-as-vanity, or comments.)*

## 5. V2 scope

Real weather · seasons · day/night · more species · rare variants · achievements · death & revival ·
global statistics ticker · environmental events · richer long-term evolution · grove customization ·
optional ambient sound · vector-tile map at scale.

---

## 6. User flow

**Onboarding (plant-first — no signup wall):**
1. Welcome → "Plant your first tree" **or** "I already have an account" (sign in).
2. Choose species (3 free at start).
3. Name it.
4. Choose location on a real world map — drag the globe, tap to drop a pin; reverse-geocode to a
   region label.
5. Plant → seed→sprout animation → "Keep this tree" → straight into the app **as a guest**. The
   first tree is never gated.

**Daily return:** open → home shows *your tree*, current stage, age, health → "Check in" (grants
seeds, restores health, advances streak) → optionally water → optionally explore Grove / Forest.

**Explore:** Forest map → tap a tree → inspect card (species, age, stage, height, planted date,
location, short public timeline; your own trees also show health, others show admiration count) →
tap the owner chip → that user's public profile (avatar, joined, aggregate stats, their grove) →
tap any of their trees to inspect. "🌱 Nice tree" admires another's tree.

**Second tree — the account moment (see §6a):** once seeds ≥ cost, the Grove's plant slot invites a
guest to *create an account*; a member plants directly.

---

## 6a. Account model & the second-tree gate

The account is not a wall in front of the product — it's the unlock for *more* product.

- **Guest tier (no account):** plant one tree, name/place it, grow it through every stage and age
  tier indefinitely, water, check in, earn seeds, and fully explore the forest. Complete, not
  crippled. (Prototype keeps guest state in-session; production persists it to an anonymous
  device/session identity so a guest's tree survives across visits until they sign up.)
- **The gate:** the second tree. When a guest has enough seeds and opens the Grove plant slot, it
  reads "You've earned a second tree — create an account to grow your grove," and routes to signup.
  The daily check-in nudge mirrors this once the threshold is crossed.
- **Carryover:** on signup, the guest's seeds and first tree (with its full timestamped history)
  migrate to the new account. They land on the Grove with the plant slot now unlocked, so the payoff
  is immediate.
- **Auth mechanics:** Supabase Auth (email/password for MVP; social/magic-link optional later).
  Production must implement the anonymous-guest → registered-user **account linking** so no tree or
  history is lost. This is the one flow the prototype fakes (in-memory accounts) and the real build
  must get right.

**Tuning flag (needs real data):** with the current economy (check-in +1, streak +2 every 3rd day,
second tree = 5 seeds), a consistent guest crosses the second-tree threshold on **day 3** — before
the first tree matures on day 7. That may ask for the account too early, before the user has felt a
tree grow up. Levers: raise the second-tree cost to ~7–8, delay the streak bonus to day 5, or grant
the maturity bonus (+3) only at day 7. Don't hard-code a guess; instrument the day-1→day-7 funnel
and the guest→signup conversion, then tune. Ship with cost = 7 as a starting point.

---

## 7. UI architecture

Five surfaces, tree always the visual centerpiece:

- **Home** — one tree fills most of the screen; name, species, age, stage chip, health bar; two
  actions (Check in, Water); bottom nav. The greeting shows the signed-in name and taps to your
  own profile.
- **Grove** — grid of the user's trees; tap → Journal. The plant slot is state-aware: locked (not
  enough seeds) / account-gate (guest with enough seeds) / plantable (member with enough seeds).
- **Forest (map)** — real-geography map; clustered density blobs at low zoom, individual trees at
  high zoom; your own trees ringed + labelled; "📍 My Grove" recenters. Tap a tree → Inspect.
- **Inspect / Journal (sheet)** — per-tree stats + timeline biography. Own tree shows health + full
  private history; another's shows admiration count + a short public timeline + a "🌱 Nice tree"
  button + an owner chip.
- **Profile (sheet)** — any user's public view: avatar, "planting since", aggregate stats (trees,
  oldest, total growth days, ancient count, regions, admiration), and a tappable grid of their
  grove. Your own profile adds Sign out (member) or a Create-account prompt (guest).
- **Account** — plant-first signup/sign-in; validation; guest→member carryover.
- **Onboarding** — the flow above.

Design language: *naturalist observatory*, not mobile-game dashboard. Deep forest-ink background,
bone text, living-moss accent, earthen bark, pale bloom used sparingly. Humanist serif for the
tree's **name and age** (it's a name, it deserves dignity); clean grotesque for UI/data. Subtle
breathing/sway animation only. Reduced-motion respected.

---

## 8. Database schema (PostgreSQL / Supabase)

Growth, age, health, and balances are **never stored as current values** where they can be derived.
Store *events and timestamps*; compute state server-side. This is both the anti-cheat backbone and
the thing that makes "3 years old" trustworthy.

```sql
-- Users are Supabase auth.users; app profile extends it.
-- Guests are supported via Supabase anonymous sign-in: an anon auth.users row exists
-- from first plant, so a guest's tree/seeds persist. On real signup, Supabase links the
-- anonymous identity to the email identity — the profile row and all its trees carry over
-- with NO data migration needed. This is why the account gate can be frictionless.
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  is_guest      boolean not null default true,   -- flips false on email signup
  seeds         int  not null default 0,   -- balance is a materialized cache…
  water         int  not null default 3,   -- …validated against *_transactions
  streak_count  int  not null default 0,
  last_checkin_date date,
  created_at    timestamptz not null default now()
);

create table species (
  key           text primary key,          -- 'maple','oak',...
  display_name  text not null,
  is_free       boolean not null default false,
  unlock_rule   jsonb,                      -- {"type":"grove_size","value":2} etc.
  render_params jsonb not null              -- colors, growth pattern, seasonal behavior
);

create table trees (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  species_key   text not null references species(key),
  name          text not null,
  planted_at    timestamptz not null default now(),   -- SERVER time, the one true clock
  visual_seed   bigint not null,            -- deterministic per-tree randomness
  -- location
  lat           double precision not null,
  lng           double precision not null,
  region_label  text,                       -- 'Detroit' — denormalized for map labels
  -- health is derived from last_watered_at + visit history, but we cache it:
  last_watered_at timestamptz,
  last_visit_at   timestamptz,
  health_cache    int,                      -- recomputed server-side, never trusted from client
  is_alive        boolean not null default true,  -- V2
  created_at    timestamptz not null default now()
);
create index trees_owner_idx on trees(owner_id);
create index trees_geo_idx  on trees using gist (point(lng, lat));  -- spatial

-- Append-only event log = the tree's biography and the source of truth for milestones.
create table tree_events (
  id         bigint generated always as identity primary key,
  tree_id    uuid not null references trees(id) on delete cascade,
  kind       text not null,   -- 'planted','sapling','mature','age_30','watered','wilted','revived',...
  occurred_at timestamptz not null default now(),
  meta       jsonb
);
create index tree_events_tree_idx on tree_events(tree_id, occurred_at);

-- Currency ledgers: balance is derived = sum of these. Cache in profiles for reads.
create table seed_transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  amount     int not null,          -- +1 checkin, +2 streak, -7 plant (see §12)
  reason     text not null,         -- 'daily_checkin','streak_bonus','plant_tree','maturity_bonus'
  ref_tree   uuid references trees(id),
  created_at timestamptz not null default now(),
  -- idempotency: prevents duplicate rewards
  dedupe_key text unique
);
create table water_transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  amount     int not null,
  reason     text not null,
  ref_tree   uuid references trees(id),
  created_at timestamptz not null default now(),
  dedupe_key text unique
);

-- Admiration: the one social reaction. One row per (user, tree); count is a cached aggregate.
create table tree_reactions (
  tree_id    uuid not null references trees(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tree_id, user_id)   -- one admire per user per tree; no spam
);
create index tree_reactions_tree_idx on tree_reactions(tree_id);

-- V2 tables (defined now so migrations are additive): achievements, user_achievements,
-- weather_events, forest_events, tree_seasons. Omitted here to keep MVP lean.
```

Row-Level Security: every table scoped so a user can only mutate their own rows; the map reads a
**public, aggregated** view (region → count, sampled points), never raw ownership. Two read paths are
public-but-scoped: **tree inspect** (any tree's species, age, stage, location, planted date, and
admiration count — never another user's health or private history) and **public profile** (display
name, join date, and aggregate grove stats — never email or auth data). Health and the full event
timeline are owner-only.

---

## 9. Tree growth system

All pure functions of `now() − planted_at`, computed server-side.

- **Biological phase (days 0–7):** eight named stages — Seed, Sprout, Seedling, Sapling, Young,
  Growing, Large, Mature — one per integer day. `stage = min(7, floor(ageDays))`.
- **Continuous growth `g = min(1, ageDays/7)`** drives smooth visual interpolation so it reads as a
  *tree growing*, not a stage snapping.
- The client requests render state; it never computes age or stage.

## 10. Long-term evolution system

After maturity, an **age factor** grows slowly and indefinitely and drives visual complexity:

```
ageFactor = clamp(0, log10(ageDays − 6) × 1.15, ~2.6)
```

Age tiers (labels + glyph): Mature (7) → Established (30) → Old (100) → Ancient (365) →
Legendary (1000) → Elder (2000). Tiers are labels; the *visual* evolves continuously via ageFactor:
thicker trunk, more branches, larger canopy, then moss → knots/hollows → mushrooms → nesting birds →
ground plants. Evolution is **organic and gradual** — never a sudden transform. Progression details
differ per species (`species.render_params`).

**Rendering approach: procedural SVG**, parameterized by `(species, g, ageFactor, health,
visual_seed)`. This is what lets a 7-day maple and a 1,000-day maple genuinely differ without hand-
drawing thousands of assets. The prototype's `renderTree()` is a working reference implementation.

## 11. Tree health system (MVP: gentle)

- Grace period: 1 full day with no penalty.
- After that, ~9%/day decay, **floored** (nothing dies in MVP).
- A check-in or water restores health (visit +15, water +22, clamped to 100).
- Health only ever dims the tree's saturation/vibrancy — a wilting tree looks tired, then recovers.
- Health is derived server-side from `last_visit_at` / `last_watered_at`; `health_cache` is a read
  optimization only.

## 12. Seed economy

| Action | Reward |
|---|---|
| Daily check-in | +1 seed |
| Streak (every 3rd consecutive day) | +2 bonus |
| Grow a tree to maturity (day 7) | +3 bonus |
| Age milestones (30/100/365…) | small bonus |

- **Second tree cost: 7 seeds (starting value).** This is the number that decides when the account
  gate appears for a guest (§6a), so it is the most important economy dial. At cost 5 a consistent
  guest crosses the threshold on **day 3**, before the first tree matures — likely too early. Cost 7
  pushes it toward day 5–6, so the reward for nearly a full week is *a new beginning* and the account
  ask lands after the user has felt a tree grow. Treat as tunable; instrument and adjust (see §6a).
- Money buys seeds (breadth), never age or health (depth). A purchased seed and an earned seed are
  identical; they only ever let you plant *more*, never grow a *better* tree.
- No reward for time-on-site. Rewards attach to **meaningful events**, granted server-side with an
  idempotency `dedupe_key` (e.g. `checkin:{user}:{date}`) so refreshes/replays can't double-pay.

## 13. Map architecture

- **Production: MapLibre GL** with real vector geography (accurate coastlines, borders, cities) and a
  **custom minimal style** — plain land/water, city/region labels only, no buildings or roads, tuned
  to the forest-ink palette. This replaces the prototype's hand-typed continent polygons entirely;
  that geometry exists only to test the explore/tap loop offline and is throwaway.
- Trees render as a **layer on top** of the basemap (GL symbol/circle layer or a custom canvas/WebGL
  overlay), not as DOM nodes. Low zoom → server-aggregated density blobs + counts per region; high
  zoom → individual trees. Your own trees ringed + labelled; "📍 My Grove" recenters to them.
- **Tap targets:** clusters zoom in on tap; individual trees open Inspect. Hit-testing against the
  rendered layer (GL feature query or nearest-point on the overlay).
- Scale path: spatial index (PostGIS/GIST) → server clustering (aggregate view / edge function) →
  vector tiles → WebGL. The `trees_geo_idx` GIST index is in place from day one.
- **Planting on the map** reuses the same MapLibre instance: drag/zoom the globe, tap to drop a pin,
  reverse-geocode the point to a `region_label`, confirm → write the tree at real lat/lng.

## 14. Anti-cheat architecture

- **Server owns time.** `planted_at` and all derivations use server clock; client-supplied
  timestamps are ignored. Device-clock manipulation does nothing.
- All state changes (check-in, water, plant, reward) go through server RPCs / edge functions that
  validate eligibility and write the ledger. Client never writes balances, age, or health.
- **Idempotency keys** on every reward and action prevent duplicate check-ins and replayed rewards.
- Rate-limit action endpoints. Validate species unlock server-side. Balances reconciled from
  ledgers, never trusted from the client cache.

## 15. Monetization

Seed packs, premium species, cosmetic variants, grove/theme customization. **Never** pay-to-age,
pay-to-heal, energy systems, loot boxes, or nag prompts. Money buys breadth and beauty; time buys
meaning. Guardrail: a purchased tree and a free tree of the same age are equally healthy and equally
old — the only difference money makes is *how many* trees you tend. This is the same line the account
model draws (§6a): a guest's single tree can reach Elder and be every bit as special as a paying
member's; accounts and money both grant *more forest*, never a *better tree*.

## 16. Technical architecture

- **Frontend:** Next.js + React + TypeScript.
- **Backend/DB/Auth:** Supabase (Postgres, Auth, Row-Level Security, Edge Functions for the action
  RPCs and reward grants).
- **Map:** MapLibre GL with a custom minimal style; trees as a layer on top; aggregate via a
  Postgres view / edge function. Same instance powers planting and exploring.
- **Animation:** CSS transforms for ambient breathing/sway; Framer Motion for screen transitions.
- **Tree rendering:** shared TypeScript module producing SVG from `(species, g, ageFactor, health,
  seed)` — same function client and (for thumbnails) server.

## 17. Implementation roadmap

1. **Foundation** — Next.js + Supabase project, RLS, `profiles`. Enable **anonymous auth** so a
   first plant creates a guest identity with no signup.
2. **Tree model + growth math** — `trees`, `tree_events`, server growth/age/health functions +
   tests. Dev time-warp endpoint (dev builds only).
3. **Procedural renderer** — port `renderTree()` to a typed module; species params; verify a 7-day,
   365-day, and 2000-day tree each read distinctly (the ageFactor curve must keep diverging).
4. **Plant-first onboarding + Home** — species/name/map-pin plant flow as a guest; home screen;
   check-in RPC + seed ledger (idempotent). No signup wall.
5. **Health + water** — decay/restore, water ledger.
6. **Second tree + Grove + the account gate** — Grove grid; state-aware plant slot
   (locked / guest-account-gate / plantable); Supabase email signup with **anonymous→email account
   linking** so guest seeds + first tree carry over; sign in / sign out.
7. **Journal + Inspect + Profile + Admire** — own-tree journal (health + full timeline); public
   inspect of any tree (no health/private history); public profiles with aggregate stats; the
   `tree_reactions` admire flow (one per user per tree).
8. **Map** — MapLibre custom style; aggregated public view; clustering; real lat/lng; tap-to-inspect;
   "My Grove" recenter; ambient/seeded forest for cold-start density.
9. **Polish + anti-cheat pass** — rate limits, dedupe keys, RLS audit (verify inspect/profile leak
   no health/email), reduced-motion, mobile.
10. **Ship MVP → instrument the day-1→day-7 funnel and guest→signup conversion → tune the
    second-tree cost (§6a/§12) → then start V2.**

---

### Central philosophy (keep this visible on every decision)

Plant a tree. Come back tomorrow. Watch it grow. Keep it alive. Build a forest. And over years,
watch your tree become something that only time could create.
