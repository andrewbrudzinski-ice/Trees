-- ============================================================================
-- The Tree — Pre-launch data reset
--
-- Wipes ALL users and game data so your live stats start from zero, and
-- releases the owner slot so you can re-claim it from your REAL account.
--
-- ⚠️ DESTRUCTIVE: deletes every user and every tree. Only run this BEFORE you
-- have shared the app / have real players. It clears the test rows that the
-- build's verification scripts created (the "36 users" you saw).
--
-- Run in: Supabase dashboard → SQL Editor → New query → paste all → Run.
-- ============================================================================

-- 1) Delete every auth user. FK cascades do the rest:
--    auth.users → profiles → trees → tree_events, and
--    profiles → seed_transactions, water_transactions, tree_reactions.
delete from auth.users;

-- 2) analytics_events.user_id is ON DELETE SET NULL, so those rows survive
--    step 1. Clear the funnel log too.
truncate table public.analytics_events;

-- 3) Release the owner slot so the first /admin claim from your REAL account
--    wins. (The species catalog and app_config settings are kept.)
update public.app_config set admin_user_id = null;

-- Sanity check — every count below should be 0:
-- select
--   (select count(*) from auth.users)               as users,
--   (select count(*) from public.trees)             as trees,
--   (select count(*) from public.seed_transactions) as checkins;
