"use client";

export type Tab = "home" | "grove" | "forest";

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      <button className={tab === "home" ? "active" : ""} onClick={() => onTab("home")}>
        🌳<span>Home</span>
      </button>
      <button className={tab === "grove" ? "active" : ""} onClick={() => onTab("grove")}>
        🪴<span>Grove</span>
      </button>
      <button className={tab === "forest" ? "active" : ""} onClick={() => onTab("forest")}>
        🌎<span>Forest</span>
      </button>
    </nav>
  );
}
