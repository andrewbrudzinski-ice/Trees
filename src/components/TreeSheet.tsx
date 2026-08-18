"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTreeState } from "@/lib/tree/growth";
import { eventMeta } from "@/lib/tree/events";
import type { TreeWithState, TreeInspect, PublicEvent } from "@/lib/tree/api";
import type { Species, TreeEvent } from "@/lib/types";
import { TreeSvg } from "./TreeSvg";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export type TreeTarget =
  | { kind: "own"; entry: TreeWithState }
  | { kind: "inspect"; treeId: string };

/**
 * The tree sheet (spec §7). For your own tree it's the Journal: health + the
 * full timeline. For another's it's Inspect: no health, a short public timeline,
 * an admire button, and an owner chip. Health and private events never leave the
 * owner-scoped path — Inspect reads only the public `tree_inspect` view.
 */
export function TreeSheet({
  supabase,
  target,
  speciesByKey,
  onClose,
  onOpenProfile,
}: {
  supabase: SupabaseClient;
  target: TreeTarget;
  speciesByKey: Map<string, Species>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const isOwn = target.kind === "own";
  const [ownEvents, setOwnEvents] = useState<TreeEvent[]>([]);
  const [inspect, setInspect] = useState<TreeInspect | null>(null);
  const [pubEvents, setPubEvents] = useState<PublicEvent[]>([]);
  const [admired, setAdmired] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: who } = await supabase.auth.getUser();
      if (active) setUid(who.user?.id ?? null);

      if (target.kind === "own") {
        const { data } = await supabase
          .from("tree_events")
          .select("*")
          .eq("tree_id", target.entry.tree.id)
          .order("occurred_at", { ascending: false });
        if (active) setOwnEvents((data as TreeEvent[]) ?? []);
      } else {
        const [{ data: insp }, { data: evs }, { data: mine }] = await Promise.all([
          supabase.from("tree_inspect").select("*").eq("id", target.treeId).maybeSingle(),
          supabase.from("tree_public_events").select("*").eq("tree_id", target.treeId).order("occurred_at", { ascending: false }),
          supabase.from("tree_reactions").select("tree_id").eq("tree_id", target.treeId),
        ]);
        if (!active) return;
        setInspect((insp as TreeInspect) ?? null);
        setPubEvents((evs as PublicEvent[]) ?? []);
        setAdmired(((mine as unknown[]) ?? []).length > 0);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, target]);

  async function toggleAdmire() {
    if (target.kind !== "own" && inspect) {
      if (admired) {
        await supabase.from("tree_reactions").delete().eq("tree_id", inspect.id);
        setInspect({ ...inspect, admire_count: Math.max(0, inspect.admire_count - 1) });
        setAdmired(false);
      } else if (uid) {
        await supabase.from("tree_reactions").insert({ tree_id: inspect.id, user_id: uid });
        setInspect({ ...inspect, admire_count: inspect.admire_count + 1 });
        setAdmired(true);
      }
    }
  }

  // Normalize the two sources into common display fields.
  const view = useMemo(() => {
    if (target.kind === "own") {
      const { tree, state } = target.entry;
      return {
        tree,
        state,
        ownerId: tree.owner_id,
        planted_at: tree.planted_at,
        region: tree.region_label,
        admireCount: null as number | null,
        events: ownEvents.map((e) => ({ kind: e.kind, at: e.occurred_at })),
      };
    }
    if (!inspect) return null;
    const state = computeTreeState({ planted_at: inspect.planted_at }, Date.now());
    return {
      tree: { species_key: inspect.species_key, visual_seed: inspect.visual_seed, name: inspect.name },
      state,
      ownerId: inspect.owner_id,
      planted_at: inspect.planted_at,
      region: inspect.region_label,
      admireCount: inspect.admire_count,
      events: pubEvents.map((e) => ({ kind: e.kind, at: e.occurred_at })),
    };
  }, [target, ownEvents, inspect, pubEvents]);

  if (!view) {
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <p className="sub">Loading…</p>
        </div>
      </div>
    );
  }

  const { state } = view;
  const chip = state.tier ?? state.stage;
  const species = speciesByKey.get(view.tree.species_key);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet journal-sheet" onClick={(e) => e.stopPropagation()}>
        <TreeSvg
          tree={{ species_key: view.tree.species_key, visual_seed: view.tree.visual_seed }}
          state={state}
          species={species}
          className="journal-mini"
        />
        <h2 className="tree-name serif">{view.tree.name}</h2>
        <p className="tree-meta">
          {species?.display_name ?? view.tree.species_key}
          {view.region ? ` · ${view.region}` : ""}
        </p>

        <button className="owner-chip" onClick={() => onOpenProfile(view.ownerId)}>
          {isOwn ? "Your grove ›" : "View planter ›"}
        </button>

        <div className="jstats">
          <Stat k="Age" v={`${state.ageDaysInt} days`} />
          <Stat k="Stage" v={`${chip.glyph} ${state.tier ? state.tier.label : state.stage.label}`} />
          <Stat k="Height" v={`${state.heightCm} cm`} />
          {isOwn ? (
            <Stat k="Health" v={`${state.health}%`} />
          ) : (
            <Stat k="Admired" v={`${view.admireCount ?? 0} 🌱`} />
          )}
          <Stat k="Planted" v={fmtDate(view.planted_at)} />
          <Stat k="Location" v={view.region ?? "—"} />
        </div>

        {!isOwn && (
          <button className="btn" onClick={toggleAdmire}>
            {admired ? "🌱 Admired" : "🌱 Nice tree"} · {view.admireCount ?? 0}
          </button>
        )}

        <div className="timeline">
          <div className="tl-head">{isOwn ? "Life so far" : "A glimpse of its life"}</div>
          <ul>
            {view.events.map((e, i) => {
              const m = eventMeta(e.kind);
              return (
                <li key={i}>
                  <div className="tl-date">{fmtDate(e.at)}</div>
                  <div className="tl-ev">
                    {m.glyph} {m.label}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <button className="linklike dim" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="jstat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
