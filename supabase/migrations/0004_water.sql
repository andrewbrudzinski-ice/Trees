-- ============================================================================
-- The Tree — Migration 0004: Water (roadmap Step 5)
--
-- Gives the water resource a life: a server-authoritative water() RPC that
-- spends one water to tend a tree (restoring its health and logging a 'watered'
-- event), and a check_in() that now also grants +1 water per day so the balance
-- replenishes. Water balance is DERIVED = 3 (starting grant) + sum(the ledger),
-- reconciled into profiles.water; clients never write it (spec §8, §11, §14).
--
-- Health itself is already modeled server-side (src/lib/tree/growth.ts): any
-- care (visit or water) refreshes last_watered_at/last_visit_at, and health is a
-- pure function of time-since-care. So watering restores health via the
-- timestamp, not a trusted client number.
--
-- Additive and idempotent. Prereqs: 0001–0003 applied.
-- ============================================================================

-- Starting water every profile has before any ledger activity (matches the
-- profiles.water default of 3). Balance = STARTING_WATER + sum(ledger).
-- Kept as a literal in each function below for a single source of truth.

-- ----------------------------------------------------------------------------
-- water(p_tree): spend 1 water to tend one of your trees.
-- ----------------------------------------------------------------------------
create or replace function public.water(p_tree uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  prof public.profiles;
  bal  int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.trees where id = p_tree and owner_id = uid and is_alive) then
    raise exception 'tree not found or not yours';
  end if;

  bal := 3 + coalesce((select sum(amount) from public.water_transactions where user_id = uid), 0);
  if bal < 1 then
    raise exception 'no water';
  end if;

  insert into public.water_transactions (user_id, amount, reason, ref_tree)
  values (uid, -1, 'water_tree', p_tree);

  -- Watering is care: refresh the timestamp health derives from, and log it.
  update public.trees set last_watered_at = now() where id = p_tree;
  insert into public.tree_events (tree_id, kind, occurred_at) values (p_tree, 'watered', now());

  update public.profiles
     set water = 3 + coalesce((select sum(amount) from public.water_transactions where user_id = uid), 0)
   where id = uid
   returning * into prof;

  return prof;
end;
$$;

grant execute on function public.water(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- check_in(): unchanged from 0003 except it now also grants +1 water per UTC
-- day (idempotent) and reconciles the water cache, so the resource replenishes.
-- ----------------------------------------------------------------------------
create or replace function public.check_in()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  today      date := (now() at time zone 'utc')::date;
  prof       public.profiles;
  inserted   int;
  new_streak int;
  m          record;
  tr         record;
  age_days   int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = uid for update;
  if not found then
    raise exception 'no profile for %', uid;
  end if;

  insert into public.seed_transactions (user_id, amount, reason, dedupe_key)
  values (uid, 1, 'daily_checkin', 'checkin:' || uid || ':' || today)
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    if prof.last_checkin_date = today - 1 then
      new_streak := prof.streak_count + 1;
    else
      new_streak := 1;
    end if;

    if new_streak % 3 = 0 then
      insert into public.seed_transactions (user_id, amount, reason, dedupe_key)
      values (uid, 2, 'streak_bonus', 'streak:' || uid || ':' || today)
      on conflict (dedupe_key) do nothing;
    end if;

    -- Daily water grant (idempotent per day) so the resource replenishes.
    insert into public.water_transactions (user_id, amount, reason, dedupe_key)
    values (uid, 1, 'daily_water', 'water_checkin:' || uid || ':' || today)
    on conflict (dedupe_key) do nothing;

    update public.profiles
       set streak_count = new_streak,
           last_checkin_date = today
     where id = uid;

    update public.trees set last_visit_at = now() where owner_id = uid;
  end if;

  for m in
    select * from (values
      ('sapling', 3, 0),
      ('mature', 7, 3),
      ('age_30', 30, 1),
      ('age_100', 100, 2),
      ('age_365', 365, 5),
      ('age_1000', 1000, 8),
      ('age_2000', 2000, 12)
    ) as v(kind, day, reward)
  loop
    for tr in select id, planted_at from public.trees where owner_id = uid and is_alive loop
      age_days := floor(extract(epoch from (now() - tr.planted_at)) / 86400);
      if age_days >= m.day then
        insert into public.tree_events (tree_id, kind, occurred_at)
        select tr.id, m.kind, tr.planted_at + (m.day * interval '1 day')
        where not exists (
          select 1 from public.tree_events e where e.tree_id = tr.id and e.kind = m.kind
        );

        if m.reward > 0 then
          insert into public.seed_transactions (user_id, amount, reason, ref_tree, dedupe_key)
          values (
            uid, m.reward,
            case when m.kind = 'mature' then 'maturity_bonus' else 'age_milestone' end,
            tr.id, 'milestone:' || tr.id || ':' || m.kind
          )
          on conflict (dedupe_key) do nothing;
        end if;
      end if;
    end loop;
  end loop;

  -- Reconcile both cached balances from their ledgers.
  update public.profiles
     set seeds = (select coalesce(sum(amount), 0) from public.seed_transactions where user_id = uid),
         water = 3 + coalesce((select sum(amount) from public.water_transactions where user_id = uid), 0)
   where id = uid
   returning * into prof;

  return prof;
end;
$$;

grant execute on function public.check_in() to authenticated;
