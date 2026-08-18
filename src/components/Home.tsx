"use client";

import { greeting } from "@/lib/tree/economy";
import type { HomePayload } from "@/lib/tree/api";
import type { Species } from "@/lib/types";
import { TreeSvg } from "./TreeSvg";

const isDev = process.env.NODE_ENV !== "production";

export function Home({
  payload,
  speciesByKey,
  onCheckin,
  onWater,
  onDevWarp,
  onDevDryOut,
  busy,
}: {
  payload: Extract<HomePayload, { authed: true }>;
  speciesByKey: Map<string, Species>;
  onCheckin: () => void;
  onWater: (treeId: string) => void;
  onDevWarp: (days: number) => void;
  onDevDryOut: (days: number) => void;
  busy: boolean;
}) {
  const entry = payload.trees[0];
  if (!entry) return null;
  const { tree, state } = entry;
  const species = speciesByKey.get(tree.species_key);

  const chip = state.tier ?? state.stage;
  const chipLabel = state.tier ? state.tier.label : `${state.stage.label}`;
  const healthColor = state.health < 45 ? "var(--danger)" : "var(--moss)";
  const seeds = payload.profile?.seeds ?? 0;
  const water = payload.profile?.water ?? 0;
  const streak = payload.profile?.streak_count ?? 0;
  const days = state.ageDaysInt;

  return (
    <div className="home">
      <div className="home-top">
        <span className="greeting">{greeting(new Date().getHours())}</span>
        <div className="resources">
          <span title="Seeds">🌱 {seeds}</span>
          <span title="Water">💧 {water}</span>
          {streak > 0 && <span title="Day streak">🔥 {streak}</span>}
        </div>
      </div>

      <TreeSvg tree={tree} state={state} species={species} className="home-stage" />

      <div className="home-info">
        <div className="stage-chip">
          <span className="glyph">{chip.glyph}</span> {chipLabel}
        </div>
        <h1 className="tree-name serif">{tree.name}</h1>
        <p className="tree-meta">
          {species?.display_name ?? tree.species_key} · {days} day{days === 1 ? "" : "s"} old
          {tree.region_label ? ` · ${tree.region_label}` : ""}
        </p>

        <div className="health-line">
          <div className="health-track">
            <div className="health-fill" style={{ width: `${state.health}%`, background: healthColor }} />
          </div>
          <div className="health-label">
            <span>{state.healthWord}</span>
            <span>{state.health}%</span>
          </div>
        </div>
      </div>

      <div className="home-actions">
        <button className="btn" onClick={onCheckin} disabled={payload.checkedInToday || busy}>
          {payload.checkedInToday ? "✓ Checked in today" : busy ? "…" : "Check in today"}
        </button>
        <button
          className="btn ghost"
          onClick={() => onWater(tree.id)}
          disabled={water <= 0 || busy}
          title={water <= 0 ? "Out of water — check in to earn more" : "Water your tree (+restores health)"}
        >
          💧 Water{water <= 0 ? "" : ` (${water})`}
        </button>
      </div>

      {isDev && (
        <div className="dev-warp">
          <span>dev</span>
          <button onClick={() => onDevWarp(1)} disabled={busy}>
            +1 day
          </button>
          <button onClick={() => onDevWarp(7)} disabled={busy}>
            +7 days
          </button>
          <button onClick={() => onDevWarp(365)} disabled={busy}>
            +1 year
          </button>
          <button onClick={() => onDevDryOut(4)} disabled={busy} title="Age care timestamps so health decays">
            dry out
          </button>
        </div>
      )}
    </div>
  );
}
