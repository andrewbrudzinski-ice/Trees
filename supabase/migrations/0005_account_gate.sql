-- ============================================================================
-- The Tree — Migration 0005: Second tree, account gate, guest→member linking
-- (roadmap Step 6, spec §6a)
--
-- • plant_tree(): the sanctioned, cost-enforcing plant path. The first tree is
--   free for anyone (guest included); a second+ tree requires a real account
--   (is_guest=false) AND >= 7 seeds, which it deducts via the ledger. This is
--   where the account gate actually lives.
-- • on_auth_user_updated: when Supabase converts an anonymous guest into a
--   permanent (email) user in place — same user id, so the profile, trees, and
--   ledgers carry over with NO data migration — flip profiles.is_guest to false.
-- • Lock down profiles writes to display_name only, so a client can never set
--   its own is_guest / seeds / water / streak (anti-cheat, spec §14).
--
-- Additive and idempotent. Prereqs: 0001–0004 applied.
-- ============================================================================

-- The second-tree cost. Keep in sync with SECOND_TREE_COST in src/lib/tree/economy.ts.
create or replace function public.plant_tree(
  p_species text,
  p_name    text,
  p_lat     double precision,
  p_lng     double precision,
  p_region  text default null
)
returns public.trees
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  prof      public.profiles;
  n         int;
  cost      int := 0;
  seed_bal  int;
  new_tree  public.trees;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.species where key = p_species) then
    raise exception 'unknown species %', p_species;
  end if;

  select * into prof from public.profiles where id = uid for update;
  select count(*) into n from public.trees where owner_id = uid;

  if n > 0 then
    -- The gate: a second tree needs an account and enough seeds.
    if prof.is_guest then
      raise exception 'account required';
    end if;
    cost := 7;
    seed_bal := coalesce((select sum(amount) from public.seed_transactions where user_id = uid), 0);
    if seed_bal < cost then
      raise exception 'insufficient seeds';
    end if;
  end if;

  insert into public.trees (owner_id, species_key, name, visual_seed, lat, lng, region_label)
  values (
    uid, p_species,
    coalesce(nullif(trim(p_name), ''), 'My Tree'),
    (floor(random() * 1000000000))::bigint,
    p_lat, p_lng, p_region
  )
  returning * into new_tree;

  insert into public.tree_events (tree_id, kind) values (new_tree.id, 'planted');

  if cost > 0 then
    insert into public.seed_transactions (user_id, amount, reason, ref_tree, dedupe_key)
    values (uid, -cost, 'plant_tree', new_tree.id, 'plant:' || new_tree.id);
    update public.profiles
       set seeds = (select coalesce(sum(amount), 0) from public.seed_transactions where user_id = uid)
     where id = uid;
  end if;

  return new_tree;
end;
$$;

grant execute on function public.plant_tree(text, text, double precision, double precision, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Flip is_guest → false when an anonymous user becomes permanent (gains an
-- identity / stops being anonymous). Same id, so nothing else needs to move.
-- ----------------------------------------------------------------------------
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) = false and coalesce(old.is_anonymous, false) = true then
    update public.profiles set is_guest = false where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row
  execute function public.handle_user_updated();

-- ----------------------------------------------------------------------------
-- Anti-cheat: a client may update ONLY its display_name. is_guest, seeds, water,
-- streak_count, etc. are server-owned (flipped by the trigger above / minted by
-- the SECURITY DEFINER RPCs). Column-level grant enforces this under the
-- existing profiles_update_own row policy.
-- ----------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
