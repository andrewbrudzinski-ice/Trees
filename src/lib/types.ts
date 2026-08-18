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

/** A row of public.species (see 0002_tree_model.sql). */
export type Species = {
  key: string;
  display_name: string;
  is_free: boolean;
  unlock_rule: Record<string, unknown> | null;
  render_params: Record<string, unknown>;
};

/** A row of public.trees (see 0002_tree_model.sql). */
export type Tree = {
  id: string;
  owner_id: string;
  species_key: string;
  name: string;
  planted_at: string;
  visual_seed: number;
  lat: number;
  lng: number;
  region_label: string | null;
  last_watered_at: string | null;
  last_visit_at: string | null;
  health_cache: number | null;
  is_alive: boolean;
  created_at: string;
};

/** A row of public.tree_events (see 0002_tree_model.sql). */
export type TreeEvent = {
  id: number;
  tree_id: string;
  kind: string;
  occurred_at: string;
  meta: Record<string, unknown> | null;
};
