/**
 * The Tree — procedural SVG renderer (spec §10, §16; roadmap §17.3).
 *
 * A shared, DOM-free TypeScript module that produces an SVG string from
 * `(species, g, ageFactor, health, seed)` — the same function on the client and
 * (for thumbnails) the server. This is what lets a 7-day maple and a 1,000-day
 * maple genuinely differ without hand-drawing thousands of assets: the trunk
 * thickens, branches multiply, and — as `ageFactor` climbs — moss, hollows,
 * mushrooms, and nesting birds appear, all gradually.
 *
 * Ported from the prototype's `renderTree()`, preserving its geometry constants
 * and its RNG call order so output stays deterministic per `seed`. The renderer
 * is intentionally decoupled from time: callers derive `g` / `ageFactor` /
 * `health` from timestamps via `growth.ts` (server-authoritative) and pass them
 * in. It never reads a clock and never touches the DOM.
 */

/** The visual identity of a species (from `species.render_params` + its key). */
export type SpeciesVisual = {
  key: string; // 'maple' | 'oak' | 'pine' | 'cherry' | 'birch' | 'willow' | …
  canopy: string; // hex
  canopy2: string; // hex
  trunk: string; // hex
};

export type RenderInput = {
  species: SpeciesVisual;
  /** Continuous growth 0→1 across the first week (`growth()` in growth.ts). */
  g: number;
  /** Post-maturity complexity factor (`ageFactor()` in growth.ts). */
  ageFactor: number;
  /** Health 0–100 (`health()` in growth.ts). Dims saturation as it drops. */
  health: number;
  /** Deterministic per-tree randomness (`trees.visual_seed`). */
  seed: number;
  /** Optional class on the outer <svg>. */
  className?: string;
};

/** Small LCG — same constants as the prototype so seeds reproduce exactly. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function hx(c: string): [number, number, number] {
  const h = c.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Linear blend of two hex colors → an `rgb()` string. */
function mix(a: string, b: string, t: number): string {
  const pa = hx(a);
  const pb = hx(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(
    pa[1] + (pb[1] - pa[1]) * t,
  )},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}

function svgWrap(parts: string[], W: number, H: number, className?: string): string {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg"><g class="tree-breathe">${parts.join(
    "",
  )}</g></svg>`;
}

/**
 * Render a tree to an SVG string. Pure: identical inputs → identical output.
 */
export function renderTree(input: RenderInput): string {
  const { species: sp, className } = input;
  const g = clamp01(input.g);
  const af = Math.max(0, input.ageFactor);
  const h = clamp01(input.health / 100);
  const rand = rng(input.seed);

  // For days < 7, g === days/7 exactly, so we recover the early-life age (the
  // only place a day count matters — the seed mound and the two-leaf sprout).
  const days = g * 7;

  const W = 200,
    H = 240,
    cx = 100,
    ground = 222;
  const parts: string[] = [];

  // Ground shadow — widens as the tree ages.
  parts.push(`<ellipse cx="${cx}" cy="${ground + 6}" rx="${34 + af * 10}" ry="7" fill="#000" opacity="0.28"/>`);

  // --- Seed mound (day < 0.6) ------------------------------------------------
  if (days < 0.6) {
    parts.push(
      `<path d="M60 ${ground} Q100 ${ground - 10} 140 ${ground}" stroke="#3A2C1E" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    );
    parts.push(`<ellipse cx="${cx}" cy="${ground - 6}" rx="7" ry="9" fill="#6B4E32"/>`);
    return svgWrap(parts, W, H, className);
  }

  // --- Trunk -----------------------------------------------------------------
  const trunkH = 42 + g * 78 + af * 22,
    trunkW = 5 + g * 10 + af * 14,
    topY = ground - trunkH,
    tw = trunkW,
    twTop = Math.max(2, trunkW * 0.45);
  parts.push(
    `<path d="M${cx - tw / 2} ${ground} C ${cx - tw / 2 - af} ${ground - trunkH * 0.4}, ${
      cx - twTop / 2 - 2
    } ${topY + 8}, ${cx - twTop / 2} ${topY} L ${cx + twTop / 2} ${topY} C ${
      cx + twTop / 2 + 2
    } ${topY + 8}, ${cx + tw / 2 + af} ${ground - trunkH * 0.4}, ${cx + tw / 2} ${ground} Z" fill="${sp.trunk}"/>`,
  );
  // Bark seam, then a hollow — signs of age.
  if (af > 0.6)
    parts.push(
      `<path d="M${cx - tw / 4} ${ground - 6} Q${cx - tw / 4 - 2} ${topY + trunkH * 0.5} ${
        cx - tw / 6
      } ${topY + 10}" stroke="#00000030" stroke-width="1.5" fill="none"/>`,
    );
  if (af > 1.4 && rand() > 0.3)
    parts.push(
      `<ellipse cx="${cx + (rand() - 0.5) * tw * 0.4}" cy="${ground - trunkH * 0.45}" rx="${
        3 + af
      }" ry="${5 + af * 1.5}" fill="#00000055"/>`,
    );

  const branchCount = Math.floor(1 + g * 2 + af * 3),
    isPine = sp.key === "pine",
    isWillow = sp.key === "willow";
  if (g > 0.3 && !isPine) {
    for (let i = 0; i < branchCount; i++) {
      const t = (i + 1) / (branchCount + 1),
        by = topY + trunkH * 0.15 + t * trunkH * 0.5,
        dir = i % 2 === 0 ? -1 : 1,
        len = (14 + af * 10) * (1 - t * 0.3),
        bx = cx + dir * len,
        byEnd = by - 8 - af * 3;
      parts.push(
        `<path d="M${cx} ${by} Q${cx + dir * len * 0.5} ${by - 4} ${bx} ${byEnd}" stroke="${
          sp.trunk
        }" stroke-width="${Math.max(1.5, twTop * 0.6 * (1 - t))}" fill="none" stroke-linecap="round"/>`,
      );
    }
  }

  const canopyR = 26 + g * 30 + af * 18,
    canopyCy = topY - canopyR * 0.35,
    leafColor = mix(sp.canopy, "#2C4432", (1 - h) * 0.55),
    leafColor2 = mix(sp.canopy2, "#243528", (1 - h) * 0.55);

  // --- Two-leaf sprout (0.6 ≤ day < 2) --------------------------------------
  if (days >= 0.6 && days < 2) {
    parts.push(
      `<path d="M${cx} ${ground} L${cx} ${ground - 18 - g * 14}" stroke="#6E9560" stroke-width="3" stroke-linecap="round"/>`,
    );
    parts.push(
      `<ellipse cx="${cx - 6}" cy="${ground - 18 - g * 10}" rx="7" ry="4" fill="${
        sp.canopy
      }" transform="rotate(-30 ${cx - 6} ${ground - 18 - g * 10})"/>`,
    );
    parts.push(
      `<ellipse cx="${cx + 6}" cy="${ground - 22 - g * 12}" rx="7" ry="4" fill="${
        sp.canopy
      }" transform="rotate(30 ${cx + 6} ${ground - 22 - g * 12})"/>`,
    );
    return svgWrap(parts, W, H, className);
  }

  // --- Canopy, per species ---------------------------------------------------
  if (isPine) {
    const layers = Math.floor(3 + g * 2 + af);
    for (let i = 0; i < layers; i++) {
      const ly = topY + i * (trunkH / layers) - 6,
        lw = canopyR * (1 - i / (layers + 1)) * 1.1;
      parts.push(
        `<path d="M${cx} ${ly - canopyR * 0.5} L${cx - lw} ${ly + 8} L${cx + lw} ${ly + 8} Z" fill="${
          i % 2 ? leafColor2 : leafColor
        }"/>`,
      );
    }
  } else if (isWillow) {
    parts.push(
      `<ellipse cx="${cx}" cy="${canopyCy}" rx="${canopyR}" ry="${canopyR * 0.7}" fill="${leafColor}"/>`,
    );
    for (let i = 0; i < 6 + Math.floor(af * 3); i++) {
      const dx = cx + (i - 3) * (canopyR / 3);
      parts.push(
        `<path d="M${dx} ${canopyCy} Q${dx + 4} ${canopyCy + 30} ${dx - 3} ${
          canopyCy + 46 + af * 8
        }" stroke="${leafColor2}" stroke-width="2" fill="none" opacity="0.8"/>`,
      );
    }
  } else {
    const blobs = Math.floor(3 + af * 3);
    parts.push(`<circle cx="${cx}" cy="${canopyCy}" r="${canopyR}" fill="${leafColor2}"/>`);
    for (let i = 0; i < blobs; i++) {
      const a = rand() * Math.PI * 2,
        rr = canopyR * (0.55 + rand() * 0.5),
        px = cx + Math.cos(a) * canopyR * 0.6,
        py = canopyCy + Math.sin(a) * canopyR * 0.5;
      parts.push(
        `<circle cx="${px}" cy="${py}" r="${rr}" fill="${i % 2 ? leafColor : leafColor2}" opacity="0.96"/>`,
      );
    }
    parts.push(`<circle cx="${cx}" cy="${canopyCy - 4}" r="${canopyR * 0.7}" fill="${leafColor}" opacity="0.9"/>`);
  }

  // --- Age ornaments: moss → mushroom → blossoms → nesting bird --------------
  if (af > 0.5) {
    parts.push(`<ellipse cx="${cx - tw / 2}" cy="${ground - 3}" rx="6" ry="3" fill="#6E8F4E" opacity="0.6"/>`);
    parts.push(`<ellipse cx="${cx + tw / 3}" cy="${ground - 2}" rx="5" ry="2.5" fill="#5E7E4E" opacity="0.5"/>`);
  }
  if (af > 1.0 && rand() > 0.4) {
    const mx = cx - tw / 2 - 8;
    parts.push(`<rect x="${mx - 1}" y="${ground - 8}" width="2.5" height="7" fill="#D8CDBA"/>`);
    parts.push(`<ellipse cx="${mx}" cy="${ground - 8}" rx="5" ry="3" fill="#B5603F"/>`);
  }
  if (sp.key === "cherry" && g > 0.7) {
    for (let i = 0; i < Math.floor(6 + af * 4); i++) {
      const a = rand() * Math.PI * 2,
        rr = canopyR * (0.4 + rand() * 0.6);
      parts.push(
        `<circle cx="${cx + Math.cos(a) * rr}" cy="${canopyCy + Math.sin(a) * rr * 0.8}" r="2.4" fill="#FBEAF2"/>`,
      );
    }
  }
  if (af > 1.6 && rand() > 0.35) {
    const bx = cx + canopyR * 0.5,
      by = canopyCy - canopyR * 0.4;
    parts.push(`<path d="M${bx - 5} ${by} Q${bx} ${by - 4} ${bx + 5} ${by}" stroke="#111" stroke-width="1.6" fill="none"/>`);
  }

  return svgWrap(parts, W, H, className);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Build a `SpeciesVisual` from a `public.species` row (`key` + `render_params`).
 * Falls back to a neutral green so a malformed/absent row still renders.
 */
export function speciesVisual(key: string, renderParams: Record<string, unknown> | null): SpeciesVisual {
  const p = renderParams ?? {};
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  return {
    key,
    canopy: str(p.canopy, "#6E8F4E"),
    canopy2: str(p.canopy2, "#4E6E38"),
    trunk: str(p.trunk, "#5A4632"),
  };
}
