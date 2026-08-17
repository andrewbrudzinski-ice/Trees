import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (uses the public anon/publishable key).
 *
 * Safe to call in Client Components. Auth state is persisted to cookies via
 * @supabase/ssr so Server Components and middleware can read the same session.
 *
 * Anonymous ("guest") sign-in is the entry point for The Tree: the first plant
 * calls `supabase.auth.signInAnonymously()`, which creates an anon auth.users
 * row and — via the on_auth_user_created trigger — a matching profiles row.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
