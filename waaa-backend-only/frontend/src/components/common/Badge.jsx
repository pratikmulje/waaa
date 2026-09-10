import React from "react";

export default function Badge({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-white/5 text-ink-muted ring-1 ring-white/10",
    emerald: "bg-emerald-500/10 text-emerald-glow ring-1 ring-emerald-500/25",
    cyan: "bg-cyan-500/10 text-cyan-glow ring-1 ring-cyan-500/25",
    violet: "bg-violet-500/10 text-violet-glow ring-1 ring-violet-500/25",
    amber: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25",
    red: "bg-red-500/10 text-red-400 ring-1 ring-red-500/25",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}
