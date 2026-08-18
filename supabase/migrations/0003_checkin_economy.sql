-- ============================================================================
-- The Tree — Migration 0003: Check-in + seed economy (roadmap Step 4)
--
-- Adds the currency ledgers (`seed_transactions`, `water_transactions`) and the
-- server-authoritative `check_in()` RPC. Balances are DERIVED = sum of the
-- ledger; `profiles.seeds` is only a cache the RPC keeps in sync (spec §8, §12,
-- §14). Clients can never write the ledger — rewards are granted only inside
-- SECURITY DEFINER functions, so device clocks and replays can't mint seeds.
--
-- Additive and idempotent. Paste into the Supabase SQL editor and Run.
-- Prereqs: 0001 + 0002 applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Ledgers. `dedupe_key` is unique → the same reward can never be paid twice
-- (idempotency for check-ins, streaks, and milestones). Water ledger is defined
-- now (additive) but not exercised until Step 5.
-- ----------------------------------------------------------------------------
create table if not exists public.seed_transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int not null,
  reason     text not null,          -- 'daily_checkin','streak_bonus','maturity_bonus','age_milestone','plant_tree'
  ref_tree   uuid references public.trees(id) on delete set null,
  created_at timestamptz not null default now(),
  dedupe_key text unique
);
create index if not exists seed_tx_user_idx on public.seed_transactions(user_id);

create table if not exists public.water_transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int not null,
  reason     text not null,
  ref_tree   uuid references public.trees(id) on delete set null,
  created_at timestamptz not null default now(),
  dedupe_key text unique
);
create index if not exists water_tx_user_idx on public.water_transactions(user_id);

-- Read-only to the owner; NO client write policies (rewards are minted only by
-- the SECURITY DEFINER RPCs below, which run past RLS).
alter table public.seed_transactions  enable row level security;
alter table public.water_transactions enable row level security;

drop policy if exists seed_tx_select_own on public.seed_transactions;
create policy seed_tx_select_own on public.seed_transactions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists water_tx_select_own on public.water_transactions;
create policy water_tx_select_own on public.water_transactions
  for select to authenticated using (auth.uid() = user_id);

grant select on public.seed_transactions  to authenticated;
grant select on public.water_transactions to authenticated;

-- ----------------------------------------------------------------------------
-- check_in(): the daily loop's heartbeat (spec §12).
--   • +1 seed per UTC day (idempotent: dedupe 'checkin:{uid}:{date}')
--   • +2 streak bonus every 3rd consecutive day ('streak:{uid}:{date}')
--   • milestone rewards per tree: maturity (+3, day 7) and age tiers
--     (30/100/365/1000/2000 → small bonuses), each idempotent per tree+kind,
--     and each also written to the tree's biography (tree_events).
--   • a check-in is a visit → restores health (sets last_visit_at).
--   • recomputes profiles.seeds from the ledger (cache stays honest).
-- The server clock is the only clock; the client passes nothing.
-- ----------------------------------------------------------------------------
create or replace function public.check_in()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  today     date := (now() at time zone 'utc')::date;
  prof      public.profiles;
  inserted  int;
  new_streak int;
  m         record;
  tr        record;
  age_days  int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = uid for update;
  if not found then
    raise exception 'no profile for %', uid;
  end if;

  -- Daily grant (idempotent). If it no-ops, the user already checked in today.
  insert into public.seed_transactions (user_id, amount, reason, dedupe_key)
  values (uid, 1, 'daily_checkin', 'checkin:' || uid || ':' || today)
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    -- Consecutive-day streak.
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

    update public.profiles
       set streak_count = new_streak,
           last_checkin_date = today
     where id = uid;

    -- A check-in is a visit: restore health on the user's trees.
    update public.trees set last_visit_at = now() where owner_id = uid;
  end if;

  -- Milestone rewards + biography, evaluated every call (idempotent), so a tree
  -- that matured today is rewarded on the next check-in regardless of ordering.
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

  -- Reconcile the cached balance from the ledger (the source of truth).
  update public.profiles
     set seeds = (select coalesce(sum(amount), 0) from public.seed_transactions where user_id = uid)
   where id = uid
   returning * into prof;

  return prof;
end;
$$;

grant execute on function public.check_in() to authenticated;
