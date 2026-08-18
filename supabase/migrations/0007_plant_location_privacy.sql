-- ============================================================================
-- The Tree — Migration 0007: Plant-location privacy fuzzing (Step 8b)
--
-- Replaces plant_tree() so the stored coordinate is ALWAYS area-level, never an
-- exact address. The client sends a chosen point (from the map pin-drop); the
-- server jitters it slightly and snaps it to a ~1 km grid before storing. So the
-- public map communicates "a tree is in this area", not "this user lives here".
-- Privacy is enforced server-side — the client can't opt out.
--
-- Everything else (first-free / second-costs-7 / guest gate, spec §6a) is
-- unchanged from 0005. Additive and idempotent. Prereqs: 0001–0006 applied.
-- ============================================================================

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
  v_lat     double precision;
  v_lng     double precision;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.species where key = p_species) then
    raise exception 'unknown species %', p_species;
  end if;

  select * into prof from public.profiles where id = uid for update;
  select count(*) into n from public.trees where owner_id = uid;

  if n > 0 then
    if prof.is_guest then
      raise exception 'account required';
    end if;
    cost := 7;
    seed_bal := coalesce((select sum(amount) from public.seed_transactions where user_id = uid), 0);
    if seed_bal < cost then
      raise exception 'insufficient seeds';
    end if;
  end if;

  -- Privacy: jitter ~±1 km then snap to a ~1 km grid (2 decimal places). The
  -- stored point is deliberately approximate and never the exact input.
  v_lat := round((greatest(-85, least(85, p_lat)) + (random() - 0.5) * 0.02)::numeric, 2);
  v_lng := round((greatest(-180, least(180, p_lng)) + (random() - 0.5) * 0.02)::numeric, 2);

  insert into public.trees (owner_id, species_key, name, visual_seed, lat, lng, region_label)
  values (
    uid, p_species,
    coalesce(nullif(trim(p_name), ''), 'My Tree'),
    (floor(random() * 1000000000))::bigint,
    v_lat, v_lng, p_region
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
