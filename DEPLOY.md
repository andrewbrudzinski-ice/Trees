# Deploying The Tree

The app is a standard Next.js (App Router) app backed by Supabase. Everything
server-authoritative lives in Postgres (migrations + RPCs), so deploying is:
stand up a **production** Supabase project, apply the migrations, and host the
Next app (Vercel is the easy path).

## 1. Production Supabase project

1. Create a **new** Supabase project for production (keep your dev project
   separate so the `dev_mode` time-warp never touches real data).
2. Apply all migrations in order. With the CLI (recommended):
   ```bash
   supabase link --project-ref <PROD_REF>
   supabase db push        # applies supabase/migrations/0001 … 0009
   ```
   Or paste each `supabase/migrations/000N_*.sql` into the SQL editor in order.
3. **Authentication → Sign In / Providers:** enable **Anonymous sign-ins** (the
   guest entry point).
4. **Email confirmation** (Authentication → Providers → Email):
   - MVP-simple: leave **Confirm email OFF** so guest→member linking is instant.
   - Production-proper: turn it ON and add a "check your email" state to the
     signup flow (the one deferred bit of `src/components/Account.tsx`). Also set
     the **Site URL** and **Redirect URLs** to your deployed domain.
5. **Turn OFF dev mode** (critical — leaves the time-warp inert in prod):
   ```sql
   update public.app_config set dev_mode = false;
   ```

## 2. Host the Next app (Vercel)

1. Import the GitHub repo into Vercel. Framework preset: **Next.js** (defaults are
   fine — build `next build`, output handled automatically).
2. Set **Environment Variables** (Production):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your prod project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon / publishable key |
   | `NEXT_PUBLIC_MAPTILER_KEY` | *(optional)* a MapTiler key for nicer/faster satellite tiles; omit to use the keyless Esri + AWS basemap |
   Never set the service-role key here — the app is scoped by RLS and never needs it.
3. Deploy. Add your Vercel domain to Supabase **Auth → URL Configuration** (Site
   URL + Redirect URLs) if you enabled email confirmation.

Any other Node host works too (`npm run build` → `npm start`), as long as the two
`NEXT_PUBLIC_*` vars are set at build time.

## 3. Post-deploy smoke test

- Open the site → **Plant your first tree** → pick a species, name it, drop a pin,
  plant. You land on Home with a seedling.
- **Check in** → seeds +1. **Water** → water −1, health full.
- Open **Forest** → the globe with your tree on it; **My Grove** flies to it.
- Earn seeds (or use a dev project to time-warp) → the Grove plant slot shows the
  **account gate** → create an account → your tree + seeds carry over.

## Production-readiness checklist

- [ ] Migrations 0001–0009 applied to the **prod** project (verify: tables +
      functions exist; `supabase db push` reports nothing pending).
- [ ] Anonymous sign-ins **enabled**.
- [ ] `app_config.dev_mode = false` in prod. (`dev_warp`/`dev_dry_out` refuse.)
- [ ] Email confirmation decision made (off for MVP, or on + redirect URLs set).
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set on the host;
      **no** service-role key exposed.
- [ ] `.env.local` and real keys are **not** committed (they're gitignored).
- [ ] RLS holds: run `node scripts/verify-step9.mjs` against a throwaway
      **dev** project (not prod) to confirm the anti-cheat surface.
- [ ] Watch `docs/METRICS.md` #1–#4 after launch; tune `SECOND_TREE_COST`.

## Known deferrals (safe to ship without; see HANDOFF.md)

- Email-confirmation signup state (MVP ships with confirmation off).
- Server-side map aggregation / vector tiles for true planet-scale (MVP uses
  client heatmap + clustering; the GIST index is already in place).
- A dedicated rate-limiter on the RPCs (idempotency + economy caps cover MVP).
- A live-eyes tuning pass on the globe's satellite look.
