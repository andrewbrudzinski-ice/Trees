"use client";

export type Tab = "home" | "grove";

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      <button className={tab === "home" ? "active" : ""} onClick={() => onTab("home")}>
        🌳<span>Home</span>
      </button>
      <button className={tab === "grove" ? "active" : ""} onClick={() => onTab("grove")}>
        🪴<span>Grove</span>
      </button>
      <button className="soon" disabled title="Arrives in Step 8">
        🌎<span>Forest</span>
      </button>
    </nav>
  );
}
