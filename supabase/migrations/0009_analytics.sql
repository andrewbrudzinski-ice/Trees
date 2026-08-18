-- ============================================================================
-- The Tree — Migration 0009: Funnel instrumentation (roadmap Step 10)
--
-- A minimal, append-only event log for the parts of the day-1→day-7 funnel and
-- guest→signup conversion that the gameplay tables can't already show (e.g. how
-- many people see the welcome screen but never plant). Retention and conversion
-- themselves are derived from existing tables — see docs/METRICS.md.
--
-- Write-only for clients (insert own / anonymous); analysis runs via the SQL
-- editor / service role. No PII is stored — event names + small metadata only.
--
-- Additive and idempotent. Prereqs: 0001–0008 applied.
-- ============================================================================

create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  event      text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_event_idx on public.analytics_events(event, created_at);
create index if not exists analytics_events_user_idx  on public.analytics_events(user_id, created_at);

alter table public.analytics_events enable row level security;

-- Insert only, and only as yourself (or anonymously for pre-auth events like the
-- welcome view). No SELECT policy → clients are write-only; analysis is done with
-- the service role / dashboard, which bypass RLS.
drop policy if exists analytics_insert on public.analytics_events;
create policy analytics_insert on public.analytics_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

grant insert on public.analytics_events to anon, authenticated;
