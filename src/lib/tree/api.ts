/** Shapes returned by the app's own API routes. */
import type { TreeRenderState } from "@/lib/tree/growth";
import type { Profile, Tree } from "@/lib/types";

/** A tree plus its server-derived render state. */
export type TreeWithState = { tree: Tree; state: TreeRenderState };

/** A row of the public `tree_inspect` view (0006) — safe columns only. */
export type TreeInspect = {
  id: string;
  owner_id: string;
  species_key: string;
  name: string;
  planted_at: string;
  region_label: string | null;
  lat: number;
  lng: number;
  visual_seed: number;
  admire_count: number;
};

/** A row of the public `profile_public` view (0006). */
export type PublicProfile = { id: string; display_name: string | null; created_at: string };

/** A row of the public `tree_public_events` view (0006). */
export type PublicEvent = { tree_id: string; kind: string; occurred_at: string };

/** Response of GET /api/home. */
export type HomePayload =
  | { authed: false }
  | {
      authed: true;
      profile: Profile | null;
      trees: TreeWithState[];
      today: string;
      checkedInToday: boolean;
    };
