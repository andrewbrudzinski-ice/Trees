"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ageDaysInt, computeTreeState } from "@/lib/tree/growth";
import type { PublicProfile, TreeInspect } from "@/lib/tree/api";
import type { Species } from "@/lib/types";
import { TreeSvg } from "./TreeSvg";

/**
 * Public profile sheet (spec §7): display name, join date, aggregate grove
 * stats, and a tappable grid of the user's grove. Reads only the public
 * `profile_public` + `tree_inspect` views — never email or auth data. Your own
 * profile adds Sign out (member) or a create-account prompt (guest).
 */
export function ProfileSheet({
  supabase,
  userId,
  isSelf,
  selfIsGuest,
  speciesByKey,
  onClose,
  onOpenTree,
  onSignOut,
  onCreateAccount,
}: {
  supabase: SupabaseClient;
  userId: string;
  isSelf: boolean;
  selfIsGuest: boolean;
  speciesByKey: Map<string, Species>;
  onClose: () => void;
  onOpenTree: (treeId: string) => void;
  onSignOut: () => void;
  onCreateAccount: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [trees, setTrees] = useState<TreeInspect[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: p }, { data: t }] = await Promise.all([
        supabase.from("profile_public").select("*").eq("id", userId).maybeSingle(),
        supabase.from("tree_inspect").select("*").eq("owner_id", userId).order("planted_at", { ascending: true }),
      ]);
      if (!active) return;
      setProfile((p as PublicProfile) ?? null);
      setTrees((t as TreeInspect[]) ?? []);
    })();
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  const stats = useMemo(() => {
    const now = Date.now();
    const ages = trees.map((t) => ageDaysInt(t.planted_at, now));
    return {
      count: trees.length,
      oldest: ages.length ? Math.max(...ages) : 0,
      totalDays: ages.reduce((s, d) => s + d, 0),
      ancient: ages.filter((d) => d >= 365).length,
      regions: new Set(trees.map((t) => t.region_label).filter(Boolean)).size,
      admiration: trees.reduce((s, t) => s + (t.admire_count ?? 0), 0),
    };
  }, [trees]);

  const name = isSelf && selfIsGuest ? "You" : profile?.display_name || "A planter";
  const joined =
    isSelf && selfIsGuest
      ? "Guest · not saved yet"
      : profile?.created_at
        ? `Planting since ${new Date(profile.created_at).getFullYear()}`
        : "";

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet journal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="p-avatar">{isSelf && selfIsGuest ? "🌱" : "🌳"}</div>
        <h2 className="tree-name serif">{name}</h2>
        <p className="tree-meta">{joined}</p>

        <div className="jstats">
          <Stat k="Trees" v={`${stats.count}`} />
          <Stat k="Oldest" v={`${stats.oldest}d`} />
          <Stat k="Growth days" v={`${stats.totalDays}`} />
          <Stat k="Ancient" v={`${stats.ancient}`} />
          <Stat k="Regions" v={`${stats.regions}`} />
          <Stat k="Admiration" v={`${stats.admiration} 🌱`} />
        </div>

        <div className="p-grove">
          {trees.map((t) => {
            const state = computeTreeState({ planted_at: t.planted_at }, Date.now());
            return (
              <button className="p-tree" key={t.id} onClick={() => onOpenTree(t.id)}>
                <TreeSvg
                  tree={{ species_key: t.species_key, visual_seed: t.visual_seed }}
                  state={state}
                  species={speciesByKey.get(t.species_key)}
                  className="p-mini"
                />
                <div className="pn serif">{t.name}</div>
                <div className="pa">{ageDaysInt(t.planted_at)}d</div>
              </button>
            );
          })}
        </div>

        {isSelf && selfIsGuest && (
          <button className="btn" onClick={onCreateAccount}>
            Create an account to save
          </button>
        )}
        {isSelf && !selfIsGuest && (
          <button className="btn ghost" onClick={onSignOut}>
            Sign out
          </button>
        )}
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
