import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Sparkles } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import SmartReplyDrawer from "../components/intelligence/SmartReplyDrawer.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getMessages } from "../api/messages.js";
import { IMPORTANCE_COLORS, timeAgo } from "../utils/format.js";

export default function ImportantMessages() {
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  const { data, error, loading, reload } = usePolling(() => getMessages({ limit: 250 }), { intervalMs: 10000 });

  const important = useMemo(() => {
    return (data?.messages || [])
      .filter((m) => (m.importanceAnalysis?.finalScore ?? 0) >= 50)
      .sort((a, b) => (b.importanceAnalysis?.finalScore ?? 0) - (a.importanceAnalysis?.finalScore ?? 0));
  }, [data]);

  return (
    <AppShell title="Important Messages">
      {error && <ErrorState message="Couldn't load important messages." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && important.length === 0 && (
        <EmptyState icon={Flame} title="Nothing needs attention right now" description="Messages scoring 50+ on importance will show up here." />
      )}

      {!error && !loading && important.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {important.map((m) => {
            const c = IMPORTANCE_COLORS[m.importanceAnalysis?.level] || IMPORTANCE_COLORS.normal;
            return (
              <div key={m.id} className="flex flex-col rounded-2xl border border-surface-border bg-surface-panel/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${c.bg} ${c.text} ring-1 ${c.ring}`}>
                    <Flame className="h-3 w-3" /> {m.importanceAnalysis?.level} priority
                  </span>
                  <span className="text-[11px] text-ink-faint">{timeAgo(m.createdAt || m.receivedAt)}</span>
                </div>

                <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-ink">{m.text}</p>

                {m.importanceAnalysis?.reasons?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.importanceAnalysis.reasons.map((r, i) => (
                      <span key={i} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-glow ring-1 ring-violet-500/20">
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                <p className="mt-3 text-xs text-ink-muted">From {m.chatName}</p>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => navigate("/chats", { state: { chatId: m.chatId } })}
                    className="focus-ring flex-1 rounded-lg border border-surface-border py-1.5 text-xs font-medium text-ink-muted hover:bg-white/5"
                  >
                    Open chat
                  </button>
                  <button
                    onClick={() => setSelected(m)}
                    className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500/10 py-1.5 text-xs font-medium text-violet-glow ring-1 ring-violet-500/25 hover:bg-violet-500/15"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Reply
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
