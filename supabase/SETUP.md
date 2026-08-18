# Supabase setup — Step 1 (Foundation)

Everything Claude Code needs from you to make Step 1 run against a real backend.
Takes ~5 minutes.

## 1. Create the project

1. Go to <https://supabase.com> → **New project** (the free tier is plenty).
2. Pick a name and a strong database password. Choose a region near you.
3. Wait for it to finish provisioning.

## 2. Run the migration

1. In the dashboard: **SQL Editor → New query**.
2. Open `supabase/migrations/0001_foundation.sql` from this repo, paste the whole
   file in, and click **Run**.
3. You should see "Success. No rows returned." This creates the `profiles`
   table, its RLS policies, and the trigger that auto-creates a profile for
   every new user.

## 3. Enable anonymous auth (the guest tier)

1. **Authentication → Sign In / Providers** (older UIs: **Authentication →
   Providers**).
2. Turn on **"Allow anonymous sign-ins"** and save.

This is what lets a first plant create a guest identity with no signup. Without
it, the "Plant your first tree" button returns an error.

## 4. Give Claude the two public values

1. **Project Settings → API.**
2. Copy these two values into a new file `.env.local` at the repo root (use
   `.env.local.example` as the template):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-OR-PUBLISHABLE-KEY
   ```

   - **URL** = "Project URL".
   - **Key** = the **anon / public** key (newer projects call it the
     **publishable** key). It is safe in the browser.

### ⚠️ Which key?

Supabase gives you two keys:

- **anon / publishable** → safe in the browser. **This is the one Step 1 needs.**
- **service_role / secret** → server-only superuser key. **Never** put it in
  `.env.local` or any client code. We don't need it until a later step, and even
  then only in server-side code.

If you're ever unsure which a key is, ask before pasting it anywhere.

## 5. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>:

- Click **"Plant your first tree"** → a **Guest** card appears with a profile ID,
  `seeds: 0`, `water: 3`. That's anonymous auth + the profile trigger + RLS all
  working.
- **Reset (sign out)** clears the session so you can do it again.

You can confirm the row server-side too: **Table Editor → profiles** shows one
row per guest you created, each with `is_guest = true`.

---

## Step 2 (Tree model) — one more migration

When you move to Step 2, apply the next migration the same way:

1. **SQL Editor → New query**, paste all of
   `supabase/migrations/0002_tree_model.sql`, and **Run**. It adds the `species`
   catalog (seeded), `trees`, and `tree_events`, with owner-scoped RLS. It's
   additive and idempotent — safe to re-run.
2. No new dashboard toggles are needed; anonymous auth from Step 1 already covers
   guests.
3. Verify: `node scripts/verify-step2.mjs` → should end with "🌳 Step 2 verified".

---

## Step 4 (Check-in economy) — one more migration

1. **SQL Editor → New query**, paste all of
   `supabase/migrations/0003_checkin_economy.sql`, and **Run**. It adds the
   `seed_transactions` / `water_transactions` ledgers and the server-authoritative
   `check_in()` function. Additive and idempotent.
2. No new dashboard toggles.
3. Verify: `node scripts/verify-step4.mjs` → should end with "🌱 Step 4 verified".

---

## Step 5 (Water) — one more migration

1. **SQL Editor → New query**, paste all of `supabase/migrations/0004_water.sql`,
   and **Run**. It adds the `water()` function and updates `check_in()` to grant
   daily water. Additive and idempotent.
2. No new dashboard toggles.
3. Verify: `node scripts/verify-step5.mjs` → should end with "💧 Step 5 verified".

---

## Step 6 (Account gate) — migration + one toggle

1. **SQL Editor → New query**, paste all of
   `supabase/migrations/0005_account_gate.sql`, and **Run**. It adds `plant_tree()`,
   the guest→member `is_guest` trigger, and locks profile writes to `display_name`.
   Additive and idempotent.
2. **Turn OFF "Confirm email"** for the MVP: **Authentication → Providers → Email**
   → uncheck **Confirm email** → Save. This lets a guest link an email account
   *instantly* (the anonymous session converts in place, so seeds + first tree
   carry over with no data migration). Production can re-enable confirmation later
   with a "check your email" step.
3. Verify: `node scripts/verify-step6.mjs` → should end with "🌲 Step 6 verified".

---

## Step 7 (Inspect + profiles + admire) — one migration

1. **SQL Editor → New query**, paste all of `supabase/migrations/0006_social.sql`,
   and **Run**. It adds `tree_reactions` and the public views `tree_inspect`,
   `tree_public_events`, `profile_public`. Additive and idempotent.
2. No new dashboard toggles.
3. Verify: `node scripts/verify-step7.mjs` → should end with "🌿 Step 7 verified".
