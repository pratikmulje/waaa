import React from "react";

export function SkeletonLine({ width = "100%", className = "" }) {
  return (
    <div
      className={`h-3 animate-pulse rounded bg-white/[0.06] ${className}`}
      style={{ width }}
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-panel/40 p-3">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="flex-1 space-y-2">
        <SkeletonLine width="40%" />
        <SkeletonLine width="70%" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-2xl border border-surface-border bg-surface-panel/40 p-5">
      <SkeletonLine width="30%" />
      <SkeletonLine width="55%" className="h-6" />
      <SkeletonLine width="45%" />
    </div>
  );
}
