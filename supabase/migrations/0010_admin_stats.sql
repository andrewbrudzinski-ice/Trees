-- ============================================================================
-- The Tree — Migration 0010: Owner analytics dashboard
--
-- A single owner-only aggregate stats function for the /admin page. One user is
-- the owner (app_config.admin_user_id); claim_admin() lets the first signed-in
-- user claim that slot, and admin_stats() returns the numbers ONLY to them.
-- Everyone else gets "not authorized". No PII is returned — counts only.
--
-- Additive and idempotent. Prereqs: 0001–0009 applied (needs app_config from 0008).
-- ============================================================================

alter table public.app_config add column if not exists admin_user_id uuid;

-- First signed-in user to call this becomes the owner (if the slot is empty).
-- Claim it right after deploying. Returns true if you now hold owner access.
create or replace function public.claim_admin()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.app_config set admin_user_id = uid where id = 1 and admin_user_id is null;
  return (select admin_user_id = uid from public.app_config where id = 1);
end;
$$;

grant execute on function public.claim_admin() to authenticated;

-- Owner-only aggregate stats.
create or replace function public.admin_stats()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  owner  uuid := (select admin_user_id from public.app_config where id = 1);
  utoday date := (now() at time zone 'utc')::date;
begin
  if uid is null or owner is null or uid <> owner then
    raise exception 'not authorized';
  end if;

  return jsonb_build_object(
    'profiles_total', (select count(*) from public.profiles),
    'members',        (select count(*) from public.profiles where not is_guest),
    'guests',         (select count(*) from public.profiles where is_guest),
    'new_users_7d',   (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'signups_7d',     (select count(*) from public.profiles where not is_guest and created_at >= now() - interval '7 days'),
    'active_1d',      (select count(distinct user_id) from public.seed_transactions where reason = 'daily_checkin' and created_at >= now() - interval '1 day'),
    'active_7d',      (select count(distinct user_id) from public.seed_transactions where reason = 'daily_checkin' and created_at >= now() - interval '7 days'),
    'checkins_today', (select count(*) from public.seed_transactions where reason = 'daily_checkin' and (created_at at time zone 'utc')::date = utoday),
    'trees_total',    (select count(*) from public.trees),
    'trees_alive',    (select count(*) from public.trees where is_alive),
    'planters',       (select count(distinct owner_id) from public.trees),
    'admirations',    (select count(*) from public.tree_reactions),
    'oldest_days',    (select coalesce(max(floor(extract(epoch from (now() - planted_at)) / 86400)), 0) from public.trees)
  );
end;
$$;

grant execute on function public.admin_stats() to authenticated;
