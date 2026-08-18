-- ============================================================================
-- The Tree — Migration 0002: Tree model (roadmap Step 2)
--
-- Adds the `species` reference table, the `trees` table (one row per planted
-- tree), and the append-only `tree_events` log. Growth, age, and health are
-- NEVER stored as current values — they are derived server-side from the
-- timestamps here (see src/lib/tree/growth.ts, spec §8–11). `health_cache` is a
-- read optimization only; the ledgers/timestamps are the source of truth.
--
-- Additive and idempotent: paste the whole file into the Supabase SQL editor
-- (Project → SQL Editor → New query → Run). Safe to re-run.
--
-- RLS here is OWNER-SCOPED, matching 0001. The public-but-scoped read paths
-- (tree inspect, the aggregated map view) arrive as dedicated views in their
-- own roadmap steps (§7, §8) — never as broad table access.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- species: reference data. Colors/params drive the procedural renderer (Step 3).
-- `unlock_rule` gates non-free species (e.g. by grove size). Read-only to users;
-- rows are managed by migrations, never written from the client.
-- ----------------------------------------------------------------------------
create table if not exists public.species (
  key           text primary key,                 -- 'maple','oak',...
  display_name  text not null,
  is_free       boolean not null default false,
  unlock_rule   jsonb,                             -- {"type":"grove_size","value":2}
  render_params jsonb not null                     -- colors, growth pattern, seasonal behavior
);

alter table public.species enable row level security;

-- Everyone signed in (guests included) can read the catalog; the anon role too,
-- so a pre-auth species picker can render.
drop policy if exists species_select_all on public.species;
create policy species_select_all
  on public.species
  for select
  to anon, authenticated
  using (true);

grant select on public.species to anon, authenticated;

-- Seed the catalog (colors ported from the prototype's SPECIES map).
insert into public.species (key, display_name, is_free, unlock_rule, render_params) values
  ('maple',  'Maple',  true,  null,
    '{"canopy":"#C25A3B","canopy2":"#9E3F2B","trunk":"#5A4632"}'),
  ('oak',    'Oak',    true,  null,
    '{"canopy":"#6E8F4E","canopy2":"#4E6E38","trunk":"#584636"}'),
  ('pine',   'Pine',   true,  null,
    '{"canopy":"#3E6B4E","canopy2":"#2C4F39","trunk":"#4A3A2C"}'),
  ('cherry', 'Cherry', false, '{"type":"grove_size","value":2}',
    '{"canopy":"#E5B4CC","canopy2":"#D094B4","trunk":"#5C4638"}'),
  ('birch',  'Birch',  false, '{"type":"grove_size","value":3}',
    '{"canopy":"#C7C56A","canopy2":"#9FA24E","trunk":"#C9C6BC"}'),
  ('willow', 'Willow', false, '{"type":"grove_size","value":5}',
    '{"canopy":"#8FB57A","canopy2":"#6E9560","trunk":"#4E4030"}')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- trees: the one true clock is `planted_at` (server time). Everything else
-- renderable is derived from it. `health_cache` is a cache; `is_alive` is V2.
-- ----------------------------------------------------------------------------
create table if not exists public.trees (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  species_key     text not null references public.species(key),
  name            text not null,
  planted_at      timestamptz not null default now(),   -- SERVER time — the one true clock
  visual_seed     bigint not null,                      -- deterministic per-tree randomness
  lat             double precision not null,
  lng             double precision not null,
  region_label    text,                                 -- denormalized for map labels
  last_watered_at timestamptz,
  last_visit_at   timestamptz,
  health_cache    int,                                  -- recomputed server-side; never trusted
  is_alive        boolean not null default true,        -- V2
  created_at      timestamptz not null default now()
);
create index if not exists trees_owner_idx on public.trees(owner_id);
create index if not exists trees_geo_idx   on public.trees using gist (point(lng, lat));

alter table public.trees enable row level security;

-- Owner-only access. No public read here — inspect/map are scoped views later.
-- No DELETE policy: trees are not a user-deletable resource ("nothing dies").
drop policy if exists trees_select_own on public.trees;
create policy trees_select_own
  on public.trees for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists trees_insert_own on public.trees;
create policy trees_insert_own
  on public.trees for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists trees_update_own on public.trees;
create policy trees_update_own
  on public.trees for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

grant select, insert, update on public.trees to authenticated;

-- ----------------------------------------------------------------------------
-- tree_events: append-only biography and the source of truth for milestones
-- (spec §8). Rewards keyed off these events get their idempotency in later
-- steps; here we just scope reads/writes to the owning user.
-- ----------------------------------------------------------------------------
create table if not exists public.tree_events (
  id          bigint generated always as identity primary key,
  tree_id     uuid not null references public.trees(id) on delete cascade,
  kind        text not null,   -- 'planted','sapling','mature','age_30','watered','wilted',...
  occurred_at timestamptz not null default now(),
  meta        jsonb
);
create index if not exists tree_events_tree_idx on public.tree_events(tree_id, occurred_at);

alter table public.tree_events enable row level security;

drop policy if exists tree_events_select_own on public.tree_events;
create policy tree_events_select_own
  on public.tree_events for select to authenticated
  using (exists (
    select 1 from public.trees t
    where t.id = tree_events.tree_id and t.owner_id = auth.uid()
  ));

drop policy if exists tree_events_insert_own on public.tree_events;
create policy tree_events_insert_own
  on public.tree_events for insert to authenticated
  with check (exists (
    select 1 from public.trees t
    where t.id = tree_events.tree_id and t.owner_id = auth.uid()
  ));

grant select, insert on public.tree_events to authenticated;
