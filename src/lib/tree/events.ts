/**
 * Presentation for tree_events (the biography). Pure lookups — the events
 * themselves are written server-side by the RPCs (spec §8).
 */

export type EventMeta = { glyph: string; label: string; public: boolean };

const META: Record<string, EventMeta> = {
  planted: { glyph: "🌱", label: "Planted", public: true },
  sapling: { glyph: "🌿", label: "Became a sapling", public: true },
  mature: { glyph: "🌳", label: "Reached maturity", public: true },
  age_30: { glyph: "🌳", label: "30 days old", public: true },
  age_100: { glyph: "🌳", label: "100 days — became Old", public: true },
  age_365: { glyph: "🌲", label: "One year old — now Ancient", public: true },
  age_1000: { glyph: "🌲", label: "1,000 days — Legendary", public: true },
  age_2000: { glyph: "🌲", label: "2,000 days — Elder", public: true },
  watered: { glyph: "💧", label: "Watered", public: false },
};

/** Label + glyph for an event kind; unknown kinds get a gentle fallback. */
export function eventMeta(kind: string): EventMeta {
  return META[kind] ?? { glyph: "•", label: kind, public: false };
}

/** The milestone kinds that appear in a tree's SHORT public timeline. */
export const PUBLIC_EVENT_KINDS = Object.entries(META)
  .filter(([, m]) => m.public)
  .map(([k]) => k);
