// Visual proof for Step 3 (roadmap §17.3): render every species across the full
// age range with the REAL renderer, so a 7-day, 365-day, and 2000-day tree can
// be seen to read distinctly. Writes a self-contained HTML gallery.
//
//   node scripts/render-gallery.mjs [outfile.html]
//
// Uses Node's TypeScript type-stripping to import the source modules directly.
import { writeFileSync } from "node:fs";
import { growth, ageFactor, ageDaysInt } from "../src/lib/tree/growth.ts";
import { renderTree, speciesVisual } from "../src/lib/tree/render.ts";

const NOW = Date.now();
const dayAge = (d) => NOW - d * 86_400_000;

// Mirror the seeded catalog (0002_tree_model.sql).
const SPECIES = {
  maple: { canopy: "#C25A3B", canopy2: "#9E3F2B", trunk: "#5A4632" },
  oak: { canopy: "#6E8F4E", canopy2: "#4E6E38", trunk: "#584636" },
  pine: { canopy: "#3E6B4E", canopy2: "#2C4F39", trunk: "#4A3A2C" },
  cherry: { canopy: "#E5B4CC", canopy2: "#D094B4", trunk: "#5C4638" },
  birch: { canopy: "#C7C56A", canopy2: "#9FA24E", trunk: "#C9C6BC" },
  willow: { canopy: "#8FB57A", canopy2: "#6E9560", trunk: "#4E4030" },
};

const AGES = [0.3, 1, 3, 7, 30, 100, 365, 1000, 2000];
const SEED = 424242;

const rows = Object.entries(SPECIES)
  .map(([key, params]) => {
    const sv = speciesVisual(key, params);
    const cells = AGES.map((d) => {
      const planted = dayAge(d);
      const svg = renderTree({
        species: sv,
        g: growth(planted, NOW),
        ageFactor: ageFactor(planted, NOW),
        health: 100,
        seed: SEED,
      });
      const af = ageFactor(planted, NOW).toFixed(2);
      const label = d < 1 ? `${d}d` : `${ageDaysInt(planted, NOW)}d`;
      return `<figure><div class="stage">${svg}</div><figcaption>${label} · af ${af}</figcaption></figure>`;
    }).join("");
    return `<section><h2>${key}</h2><div class="track">${cells}</div></section>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>The Tree — renderer gallery</title>
<style>
  :root{--bg:#141a14;--panel:#1b231b;--ink:#e9e5d8;--dim:#9fb07f;--line:#2c3a2c}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:28px}
  h1{font-weight:600;letter-spacing:.02em;margin:0 0 4px}
  .sub{color:var(--dim);margin:0 0 24px}
  section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0 0 18px}
  h2{margin:0 0 10px;text-transform:capitalize;font-weight:600;color:var(--dim);letter-spacing:.08em;font-size:13px}
  .track{display:flex;gap:14px;overflow-x:auto;padding-bottom:6px}
  figure{margin:0;flex:0 0 auto;width:120px;text-align:center}
  .stage{width:120px;height:144px;background:radial-gradient(120% 90% at 50% 100%,#20301f 0%,#161d16 70%);border-radius:10px;display:flex;align-items:flex-end;justify-content:center}
  .stage svg{width:100%;height:100%}
  figcaption{margin-top:6px;font-size:11px;color:var(--dim);letter-spacing:.04em}
  .tree-breathe{transform-origin:100px 222px;animation:breathe 6s ease-in-out infinite}
  @keyframes breathe{0%,100%{transform:rotate(-.6deg)}50%{transform:rotate(.6deg) scaleY(1.008)}}
  @media (prefers-reduced-motion:reduce){.tree-breathe{animation:none}}
</style></head>
<body>
  <h1>The Tree — procedural renderer</h1>
  <p class="sub">Same seed (${SEED}), full health. Each row is one species from seed → Elder; note how trunk, branches, canopy, and age ornaments keep growing well past day 365 — the §17.3 divergence gate.</p>
  ${rows}
</body></html>`;

const out = process.argv[2] ?? "tree-gallery.html";
writeFileSync(out, html);
console.log("Wrote", out, `(${Object.keys(SPECIES).length} species × ${AGES.length} ages)`);
