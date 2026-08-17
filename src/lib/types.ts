/**
 * Shared app types. Mirrors the database schema in
 * supabase/migrations. Grows as the roadmap progresses.
 */

/** A row of public.profiles (see 0001_foundation.sql). */
export type Profile = {
  id: string;
  display_name: string | null;
  is_guest: boolean;
  seeds: number;
  water: number;
  streak_count: number;
  last_checkin_date: string | null;
  created_at: string;
};
