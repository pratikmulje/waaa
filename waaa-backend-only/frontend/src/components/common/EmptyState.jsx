import React from "react";

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface-panel/40 px-8 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
          <Icon className="h-5 w-5 text-ink-faint" strokeWidth={1.75} />
        </div>
      )}
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
