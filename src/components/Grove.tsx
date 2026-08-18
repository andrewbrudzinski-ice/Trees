"use client";

import { SECOND_TREE_COST } from "@/lib/tree/economy";
import type { HomePayload } from "@/lib/tree/api";
import type { Species } from "@/lib/types";
import { TreeSvg } from "./TreeSvg";

/**
 * The Grove — a grid of the user's trees and the state-aware plant slot where
 * the account gate lives (spec §6a, §7):
 *   • locked        — not enough seeds yet
 *   • account-gate  — a guest with enough seeds → create an account
 *   • plantable     — a member with enough seeds → plant directly
 */
export function Grove({
  payload,
  speciesByKey,
  onPlantSlot,
  onCreateAccount,
  onSignOut,
  busy,
}: {
  payload: Extract<HomePayload, { authed: true }>;
  speciesByKey: Map<string, Species>;
  onPlantSlot: () => void;
  onCreateAccount: () => void;
  onSignOut: () => void;
  busy: boolean;
}) {
  const trees = payload.trees;
  const seeds = payload.profile?.seeds ?? 0;
  const isGuest = payload.profile?.is_guest ?? true;
  const canAfford = seeds >= SECOND_TREE_COST;
  const remaining = Math.max(0, SECOND_TREE_COST - seeds);

  const slotState = !canAfford ? "locked" : isGuest ? "gate" : "plantable";

  return (
    <div className="grove">
      <header className="grove-head">
        <div>
          <h1 className="grove-title serif">Your grove</h1>
          <p className="grove-sub">
            {trees.length} tree{trees.length === 1 ? "" : "s"} · 🌱 {seeds}
          </p>
        </div>
        {isGuest ? (
          <button className="chip-btn" onClick={onCreateAccount} disabled={busy}>
            Create account
          </button>
        ) : (
          <button className="chip-btn ghost" onClick={onSignOut} disabled={busy}>
            {payload.profile?.display_name ? `${payload.profile.display_name} · ` : ""}Sign out
          </button>
        )}
      </header>

      <div className="grove-grid">
        {trees.map(({ tree, state }) => {
          const chip = state.tier ?? state.stage;
          return (
            <div className="grove-card" key={tree.id}>
              <TreeSvg tree={tree} state={state} species={speciesByKey.get(tree.species_key)} className="grove-mini" />
              <div className="gname serif">{tree.name}</div>
              <div className="gmeta">
                {speciesByKey.get(tree.species_key)?.display_name ?? tree.species_key} · {state.ageDaysInt}d
              </div>
              <div className="gtier">
                {chip.glyph} {state.tier ? state.tier.label : state.stage.label}
              </div>
            </div>
          );
        })}

        {/* The plant slot */}
        <button
          className={`grove-card plant-slot ${slotState}`}
          disabled={slotState === "locked" || busy}
          onClick={slotState === "gate" ? onCreateAccount : slotState === "plantable" ? onPlantSlot : undefined}
        >
          <div className="slot-plus">＋</div>
          {slotState === "locked" && (
            <div className="slot-text">
              Plant another
              <br />
              <span className="slot-dim">{remaining} more seed{remaining === 1 ? "" : "s"}</span>
            </div>
          )}
          {slotState === "gate" && (
            <div className="slot-text">
              You&rsquo;ve earned a second tree
              <br />
              <span className="slot-dim">Create an account to grow your grove</span>
            </div>
          )}
          {slotState === "plantable" && (
            <div className="slot-text">
              Plant another tree
              <br />
              <span className="slot-dim">Costs {SECOND_TREE_COST} seeds</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
