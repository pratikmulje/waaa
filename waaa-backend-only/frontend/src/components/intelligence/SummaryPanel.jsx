import React from "react";
import { X, Sparkles, RotateCw, AlertCircle } from "lucide-react";
import MarkdownContent from "../common/MarkdownContent.jsx";

// Shows a real Claude-generated summary (via /api/ai/summarize/:chatId).
// Parent owns the fetch/loading/error state — this just renders it.
export default function SummaryPanel({ chatName, loading, error, summary, messageCount, onClose, onRetry }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg animate-[cardIn_0.25s_ease-out] rounded-t-2xl border border-surface-border bg-surface-raised p-6 shadow-panel sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-glow">
              <Sparkles className="h-3.5 w-3.5" /> AI Summary
            </p>
            <p className="mt-1 text-sm text-ink-muted">{chatName}</p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-lg p-1 text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border p-4 text-xs text-ink-faint">
            <RotateCw className="h-3.5 w-3.5 animate-spin" /> Reading the conversation…
          </div>
        )}

        {!loading && error === "not_configured" && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            AI isn't configured yet — add <code className="font-mono">ANTHROPIC_API_KEY</code> to the backend's <code className="font-mono">.env</code> and restart <code className="font-mono">npm run api</code>.
          </div>
        )}

        {!loading && error === "failed" && (
          <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">
            <span>Couldn't generate a summary.</span>
            <button onClick={onRetry} className="underline underline-offset-2 hover:text-red-300">Retry</button>
          </div>
        )}

        {!loading && !error && summary && (
          <div className="space-y-3">
            <div className="rounded-xl border border-surface-border bg-surface-panel/60 p-4">
              <MarkdownContent>{summary}</MarkdownContent>
            </div>
            <p className="text-[10px] text-ink-faint">Based on the last {messageCount} messages in this chat.</p>
          </div>
        )}
      </div>
      <style>{`@keyframes cardIn { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  );
}
