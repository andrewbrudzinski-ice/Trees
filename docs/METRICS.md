# Metrics — the day-1→day-7 funnel & guest→signup conversion

Run these in the Supabase **SQL editor** (it uses the service role, which bypasses
RLS). They answer the questions spec §17.10 says to instrument before tuning the
second-tree cost. Most come straight from the gameplay tables; only the pre-auth
funnel needs `analytics_events` (migration 0009).

## 1. Acquisition funnel (pre-auth → planted → signed up)

```sql
select event, count(*) as n
from public.analytics_events
where event in ('welcome_viewed','guest_started','tree_planted','gate_signup_opened','signup_completed')
group by event
order by array_position(
  array['welcome_viewed','guest_started','tree_planted','gate_signup_opened','signup_completed']::text[],
  event
);
```

Read top-to-bottom as a funnel: how many saw the welcome, became a guest, planted,
opened signup at the gate, and completed an account.

## 2. Day-0 → Day-6 retention (check-ins relative to join date)

```sql
with checkins as (
  select user_id, (created_at at time zone 'utc')::date as d
  from public.seed_transactions
  where reason = 'daily_checkin'
),
joined as (
  select id, (created_at at time zone 'utc')::date as d0
  from public.profiles
)
select (c.d - j.d0) as day_n, count(distinct c.user_id) as users_active
from checkins c
join joined j on j.id = c.user_id
where c.d - j.d0 between 0 and 6
group by 1
order by 1;
```

`day_n = 0` is join day; watch the fall-off toward day 6. (Divide each by the
day-0 count for a retention curve.)

## 3. Guest → member conversion

```sql
select
  count(*)                                   as profiles_total,
  count(*) filter (where not is_guest)       as members,
  round(100.0 * count(*) filter (where not is_guest) / nullif(count(*), 0), 1) as pct_converted
from public.profiles;
```

## 4. When does the second-tree gate land? (tuning SECOND_TREE_COST)

The gate appears once a guest's cumulative seeds reach the cost (currently 7). If
that happens on day 3, the account ask comes before the first tree matures (spec
§6a) — raise the cost. If it lands ~day 5–6, it's about right.

```sql
with ledger as (
  select user_id, created_at,
         sum(amount) over (partition by user_id order by created_at) as running
  from public.seed_transactions
),
crossed as (
  select user_id, min(created_at) as crossed_at
  from ledger where running >= 7   -- SECOND_TREE_COST
  group by user_id
)
select
  count(*)                                                                          as users_reaching_gate,
  round(avg(extract(epoch from (c.crossed_at - p.created_at)) / 86400)::numeric, 2) as avg_days_to_gate,
  round(percentile_cont(0.5) within group (
    order by extract(epoch from (c.crossed_at - p.created_at)) / 86400)::numeric, 2) as median_days_to_gate
from crossed c
join public.profiles p on p.id = c.user_id;
```

## 5. Grove size & world totals (health of the forest)

```sql
select
  (select count(*) from public.trees)                              as trees_total,
  (select count(*) from public.trees where is_alive)               as trees_alive,
  (select count(distinct owner_id) from public.trees)              as planters,
  (select count(*) from public.tree_reactions)                     as admirations,
  (select count(*) from public.trees
     where now() - planted_at >= interval '365 days')              as ancient_or_older;
```

---

Tuning loop (spec §17.10): ship → watch #1–#4 for a week or two → adjust
`SECOND_TREE_COST` (in `plant_tree` **and** `src/lib/tree/economy.ts`, keep them
in sync) → repeat.
