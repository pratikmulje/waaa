import React from "react";
import { Menu, Sun, Moon } from "lucide-react";
import StatusDot from "../common/StatusDot.jsx";
import { useConnection } from "../../context/ConnectionContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

export default function Topbar({ onMenuClick, title }) {
  const conn = useConnection();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-surface-border bg-surface/80 px-4 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="focus-ring rounded-lg p-1.5 text-ink-muted hover:bg-white/5 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-display text-lg font-semibold text-ink">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-surface-border bg-surface-panel px-3 py-1.5 sm:flex">
          <StatusDot status={conn?.status} />
        </div>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="focus-ring rounded-lg border border-surface-border bg-surface-panel p-2 text-ink-muted hover:text-ink"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
