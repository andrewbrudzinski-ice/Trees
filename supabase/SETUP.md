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

---

## Step 8b (plant-location privacy) — one migration

1. **SQL Editor → New query**, paste all of
   `supabase/migrations/0007_plant_location_privacy.sql`, and **Run**. It replaces
   `plant_tree()` so stored coordinates are fuzzed to an area (~1 km). Additive
   and idempotent.
2. No new dashboard toggles.
3. Verify: `node scripts/verify-step8b.mjs` → should end with "📍 Step 8b verified".

---

## Step 9 (anti-cheat hardening) — one migration

1. **SQL Editor → New query**, paste all of `supabase/migrations/0008_hardening.sql`,
   and **Run**. It removes the client's direct write paths on `trees` (plant + age
   are now RPC-only), adds an `app_config.dev_mode` flag, and adds guarded dev
   time-warp helpers. Additive and idempotent.
   - The migration seeds `dev_mode = true` so this **dev** project can still use
     the time-warp and run the `verify-*.mjs` scripts. **Before a production
     launch, set it false:** `update public.app_config set dev_mode = false;`
2. No new dashboard toggles.
3. Verify: `node scripts/verify-step9.mjs` → should end with "🛡️ Step 9 verified".
   (The earlier verify scripts still pass — they now plant/age via the RPCs.)

---

## Step 10 (funnel instrumentation) — one migration

1. **SQL Editor → New query**, paste all of `supabase/migrations/0009_analytics.sql`,
   and **Run**. It adds the write-only `analytics_events` log. Additive, idempotent.
2. No new dashboard toggles.
3. Verify: `node scripts/verify-step10.mjs` → should end with "📈 Step 10 verified".

For deploying to production, see **[`../DEPLOY.md`](../DEPLOY.md)**; for the funnel
queries, **[`../docs/METRICS.md`](../docs/METRICS.md)**.

---

## Step 10b (owner analytics dashboard) — one migration

1. **SQL Editor → New query**, paste `supabase/migrations/0010_admin_stats.sql`,
   and **Run**. It adds the owner-only `admin_stats()` / `claim_admin()` functions.
2. Open **`/admin`** on your site (e.g. `https://your-app.vercel.app/admin`), sign
   in with your account, and tap **Claim owner access** (first claim wins — do it
   before sharing the app widely). You'll then see live user/activity/forest counts.
   Only the owner account can read them.

   ⚠️ Claim from a **real member account**, not a guest session. The claim binds
   the owner slot to whatever session your browser holds when you tap it — if you
   haven't signed up yet, that's an anonymous guest. Create your email account
   first (plant a seed → **Account** → sign up), then sign in on `/admin` and claim.

---

## Clearing test data before launch

The build's `verify-*.mjs` scripts create throwaway guests, trees, and check-ins
in your project — so a freshly deployed dashboard can show dozens of "users."
To reset live stats to zero and release the owner slot, run
`supabase/reset-dev-data.sql` (SQL Editor → New query → paste → Run). It deletes
**all** users and game data, so only run it before you have real players. Then
create your account and re-claim `/admin`.
