import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Sparkles, ChevronRight } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import SmartReplyDrawer from "../components/intelligence/SmartReplyDrawer.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getMessages } from "../api/messages.js";
import { timeAgo } from "../utils/format.js";

export default function ImportantMessages() {
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  const { data, error, loading, reload } = usePolling(
    () => getMessages({ limit: 250 }),
    { intervalMs: 10000 }
  );

  const important = useMemo(() => {
    return (data?.messages || [])
      .filter((m) => (m.importanceAnalysis?.finalScore ?? 0) >= 50)
      .sort((a, b) => (b.importanceAnalysis?.finalScore ?? 0) - (a.importanceAnalysis?.finalScore ?? 0));
  }, [data]);

  return (
    <AppShell title="Important">
      {error && <ErrorState message="Couldn't load important messages." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && important.length === 0 && (
        <EmptyState
          icon={Flame}
          title="Nothing needs attention right now"
          description="Messages scoring 50+ on importance appear here."
        />
      )}

      {!error && !loading && important.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-ink-faint mb-4">
            {important.length} important message{important.length !== 1 ? "s" : ""} · sorted by priority
          </p>
          {important.map((m) => {
            const level = m.importanceAnalysis?.level || "normal";
            const score = m.importanceAnalysis?.finalScore ?? 0;
            const isHigh = level === "high";
            const isMedium = level === "medium";

            return (
              <div
                key={m.id}
                className={`relative flex flex-col rounded-2xl border bg-surface-panel p-4 transition-all animate-slide-up ${
                  isHigh
                    ? "border-violet-glow/20 importance-accent"
                    : isMedium
                    ? "border-accent/15"
                    : "border-surface-border"
                }`}
              >
                {/* Header row */}
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isHigh && (
                      <span className="flex items-center gap-1 rounded-full bg-violet-glow/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-glow ring-1 ring-violet-glow/20">
                        <Flame className="h-3 w-3" />
                        High priority
                      </span>
                    )}
                    {isMedium && (
                      <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent ring-1 ring-accent/20">
                        Medium
                      </span>
                    )}
                    <span className="text-[10px] text-ink-faint">Score {score}</span>
                  </div>
                  <span className="text-[10px] text-ink-faint shrink-0">{timeAgo(m.createdAt || m.receivedAt)}</span>
                </div>

                {/* Message text */}
                <p className="text-sm leading-relaxed text-ink line-clamp-3">{m.text}</p>

                {/* Reason tags */}
                {m.importanceAnalysis?.reasons?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.importanceAnalysis.reasons.map((r, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-ink-faint ring-1 ring-surface-border"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {/* Source */}
                <p className="mt-2.5 text-[11px] text-ink-muted">
                  From <span className="font-medium text-ink">{m.chatName}</span>
                  {m.sender && ` · ${m.sender}`}
                </p>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => navigate("/chats", { state: { chatId: m.chatId } })}
                    className="focus-ring flex flex-1 items-center justify-center gap-1 rounded-xl border border-surface-border py-2 text-xs font-medium text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
                  >
                    Open chat
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setSelected(m)}
                    className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent/20 bg-accent/8 py-2 text-xs font-medium text-accent hover:bg-accent/15 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Smart Reply
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SmartReplyDrawer message={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}
