"use client";

import { useMemo } from "react";
import { renderTree, speciesVisual } from "@/lib/tree/render";
import type { TreeRenderState } from "@/lib/tree/growth";
import type { Species, Tree } from "@/lib/types";

/**
 * Draws a tree from its server-derived render state. This component only draws:
 * `g`, `ageFactor`, and `health` are computed server-side (spec §9) and passed
 * in via `state`; the SVG is a pure function of those plus the species visual.
 */
export function TreeSvg({
  tree,
  state,
  species,
  className,
}: {
  tree: Pick<Tree, "species_key" | "visual_seed">;
  state: Pick<TreeRenderState, "growth" | "ageFactor" | "health">;
  species: Pick<Species, "key" | "render_params"> | undefined;
  className?: string;
}) {
  const svg = useMemo(() => {
    const visual = speciesVisual(tree.species_key, species?.render_params ?? null);
    return renderTree({
      species: visual,
      g: state.growth,
      ageFactor: state.ageFactor,
      health: state.health,
      seed: tree.visual_seed,
    });
  }, [tree.species_key, tree.visual_seed, species?.render_params, state.growth, state.ageFactor, state.health]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}
