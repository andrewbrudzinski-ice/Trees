-- ============================================================================
-- The Tree — Migration 0001: Foundation (roadmap Step 1)
--
-- Creates the `profiles` table (an app-level extension of Supabase's
-- auth.users), locks it down with Row-Level Security, and auto-creates a
-- profile row for every new auth user — anonymous guest or email member alike.
--
-- HOW TO RUN: paste this whole file into the Supabase dashboard SQL editor
-- (Project → SQL Editor → New query → Run). It is idempotent, so re-running
-- is safe.
--
-- NOTE: Anonymous auth itself is enabled via the dashboard toggle
-- (Authentication → Sign In / Providers → "Allow anonymous sign-ins"),
-- not from SQL. See supabase/SETUP.md.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto; present by default on Supabase, but be safe.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles: one row per auth user. Currency balances (seeds/water) are cached
-- here for fast reads but remain DERIVABLE from the ledgers added in later
-- steps — the ledgers, not this cache, are the source of truth (spec §8, §14).
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text,
  is_guest          boolean not null default true,   -- flips false on email signup (Step 6)
  seeds             int not null default 0,          -- cache; validated vs seed_transactions
  water             int not null default 3,          -- cache; validated vs water_transactions
  streak_count      int not null default 0,
  last_checkin_date date,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row-Level Security: a user may read and update ONLY their own profile.
-- There is deliberately no client INSERT policy (rows are created by the
-- trigger below, which runs as SECURITY DEFINER) and no DELETE policy
-- (profiles cascade away when the auth user is deleted).
-- Public, aggregated read paths (map, public profiles) arrive as dedicated
-- views in later steps — never as broad table access here.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- A signed-in guest uses the `authenticated` Postgres role (they hold a JWT),
-- so these grants + policies cover guests too. The `anon` role (no JWT) gets
-- nothing on profiles.
grant select, update on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- Auto-create a profile whenever an auth user is created. Runs for anonymous
-- guests (is_anonymous = true) and email signups alike, so onboarding never
-- has to insert a profile from the client. SECURITY DEFINER lets it write past
-- RLS; search_path is pinned to avoid hijacking.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_guest, display_name)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
