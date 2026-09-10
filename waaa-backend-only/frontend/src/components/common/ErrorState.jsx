import React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 px-8 py-14 text-center">
      <AlertTriangle className="mb-3 h-5 w-5 text-red-400" strokeWidth={1.75} />
      <p className="text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-white/5"
        >
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}
