/** Shapes returned by the app's own API routes. */
import type { TreeRenderState } from "@/lib/tree/growth";
import type { Profile, Tree } from "@/lib/types";

/** A tree plus its server-derived render state. */
export type TreeWithState = { tree: Tree; state: TreeRenderState };

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
