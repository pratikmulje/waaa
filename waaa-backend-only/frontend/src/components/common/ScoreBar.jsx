import React from "react";

// Signature UI element: a thin horizontal "signal bar" used everywhere
// a score (importance/risk/confidence) is shown, so scores read
// consistently across the whole product.
export default function ScoreBar({ value = 0, color = "#17E3A6", label, size = "md" }) {
  const pct = Math.max(0, Math.min(100, value));
  const height = size === "sm" ? "h-1" : "h-1.5";

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px] font-mono text-ink-muted">
          <span>{label}</span>
          <span className="text-ink">{pct}</span>
        </div>
      )}
      <div className={`signal-bar ${height}`}>
        <span style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}55, ${color})` }} />
      </div>
    </div>
  );
}
