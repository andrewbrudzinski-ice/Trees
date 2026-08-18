-- ============================================================================
-- The Tree — Migration 0008: Anti-cheat hardening (roadmap Step 9)
--
-- Server owns time and the economy. This closes the two remaining client write
-- paths on `trees`:
--   • direct INSERT (bypassing plant_tree's cost / the account gate), and
--   • direct UPDATE of planted_at / care timestamps (faking age → free milestone
--     seeds, defeating "server owns time").
-- After this, trees are mutated ONLY by the SECURITY DEFINER RPCs (plant_tree,
-- check_in, water). The dev time-warp becomes guarded server functions so it
-- keeps working locally without being a live cheat.
--
-- Additive and idempotent. Prereqs: 0001–0007 applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Dev flag. Gameplay never reads this; only the dev_* helpers below do. Ships
-- FALSE in production so the time-warp helpers refuse. No client access at all.
-- (Set dev_mode = true in a dev project to use the time-warp / run verify-*.mjs.)
-- ----------------------------------------------------------------------------
create table if not exists public.app_config (
  id       int primary key default 1,
  dev_mode boolean not null default false,
  constraint app_config_singleton check (id = 1)
);
insert into public.app_config (id, dev_mode) values (1, true)
  on conflict (id) do nothing;

alter table public.app_config enable row level security;  -- no policies → no client access

-- ----------------------------------------------------------------------------
-- Remove the client's direct write paths on trees. SELECT-own stays (Home reads
-- its trees); all mutation now flows through the gameplay RPCs.
-- ----------------------------------------------------------------------------
drop policy if exists trees_insert_own on public.trees;
drop policy if exists trees_update_own on public.trees;
revoke insert, update on public.trees from authenticated;

-- ----------------------------------------------------------------------------
-- Dev-only time-warp helpers (guarded by app_config.dev_mode), owner-scoped.
-- These exist so the growth/health loop is testable in seconds; they are inert
-- in production (dev_mode = false).
-- ----------------------------------------------------------------------------
create or replace function public.dev_warp(p_tree uuid, p_days numeric)
returns public.trees
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); t public.trees;
begin
  if not (select dev_mode from public.app_config where id = 1) then
    raise exception 'dev mode is off';
  end if;
  if uid is null then raise exception 'not authenticated'; end if;
  update public.trees
     set planted_at      = planted_at - (p_days * interval '1 day'),
         last_visit_at   = last_visit_at - (p_days * interval '1 day'),
         last_watered_at = last_watered_at - (p_days * interval '1 day')
   where id = p_tree and owner_id = uid
   returning * into t;
  if not found then raise exception 'tree not found or not yours'; end if;
  return t;
end;
$$;

create or replace function public.dev_dry_out(p_tree uuid, p_days numeric)
returns public.trees
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); t public.trees;
begin
  if not (select dev_mode from public.app_config where id = 1) then
    raise exception 'dev mode is off';
  end if;
  if uid is null then raise exception 'not authenticated'; end if;
  update public.trees
     set last_watered_at = now() - (p_days * interval '1 day'),
         last_visit_at   = now() - (p_days * interval '1 day')
   where id = p_tree and owner_id = uid
   returning * into t;
  if not found then raise exception 'tree not found or not yours'; end if;
  return t;
end;
$$;

grant execute on function public.dev_warp(uuid, numeric)    to authenticated;
grant execute on function public.dev_dry_out(uuid, numeric) to authenticated;
