-- ============================================================================
-- The Tree — Migration 0006: Inspect, public profiles, admire (roadmap Step 7)
--
-- Adds the `tree_reactions` table (one admire per user per tree) and the
-- public-but-scoped read paths the spec deferred to here (§8, §7):
--   • tree_inspect      — any tree's species, age-inputs, location, admire count
--                         (NEVER health or private care history)
--   • tree_public_events— the SHORT public timeline: milestone events only
--                         ('planted','sapling','mature','age_*'), never 'watered'
--   • profile_public    — display name + join date + id (NEVER email/auth data)
--
-- The views are SECURITY DEFINER (security_invoker = off) on purpose: they run
-- past the owner-only RLS on the base tables to expose ONLY the safe columns
-- selected here. Health, last_watered_at/last_visit_at, and the full event log
-- stay owner-only via their base-table RLS.
--
-- Additive and idempotent. Prereqs: 0001–0005 applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Admire: one row per (user, tree). Count is a cached aggregate (via the view).
-- ----------------------------------------------------------------------------
create table if not exists public.tree_reactions (
  tree_id    uuid not null references public.trees(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);
create index if not exists tree_reactions_tree_idx on public.tree_reactions(tree_id);

alter table public.tree_reactions enable row level security;

-- A viewer manages only their own reactions (add/remove/see). Public counts come
-- from the definer view below, so no broad select policy is needed here.
drop policy if exists tree_reactions_select_own on public.tree_reactions;
create policy tree_reactions_select_own on public.tree_reactions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists tree_reactions_insert_own on public.tree_reactions;
create policy tree_reactions_insert_own on public.tree_reactions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists tree_reactions_delete_own on public.tree_reactions;
create policy tree_reactions_delete_own on public.tree_reactions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.tree_reactions to authenticated;

-- ----------------------------------------------------------------------------
-- Public inspect: safe columns only + the admire count. No health, no care
-- timestamps. Age/stage/growth are derived by the client from planted_at
-- (public), exactly like the map.
-- ----------------------------------------------------------------------------
create or replace view public.tree_inspect
with (security_invoker = off) as
select
  t.id,
  t.owner_id,
  t.species_key,
  t.name,
  t.planted_at,
  t.region_label,
  t.lat,
  t.lng,
  t.visual_seed,
  (select count(*) from public.tree_reactions r where r.tree_id = t.id) as admire_count
from public.trees t
where t.is_alive;

grant select on public.tree_inspect to anon, authenticated;

-- Short public timeline: milestone biography only (never 'watered'/private).
create or replace view public.tree_public_events
with (security_invoker = off) as
select tree_id, kind, occurred_at
from public.tree_events
where kind in ('planted', 'sapling', 'mature', 'age_30', 'age_100', 'age_365', 'age_1000', 'age_2000');

grant select on public.tree_public_events to anon, authenticated;

-- Public profile: display name + join date only.
create or replace view public.profile_public
with (security_invoker = off) as
select id, display_name, created_at
from public.profiles;

grant select on public.profile_public to anon, authenticated;
