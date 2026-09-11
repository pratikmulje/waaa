import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Sparkles, ArrowRight, Clock, User, MessageCircle } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import SmartReplyDrawer from "../components/intelligence/SmartReplyDrawer.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getMessages } from "../api/messages.js";
import { fullDateTime } from "../utils/format.js";

function getHumanSender(m) {
  // If sender is a human name and not an internal JID/number, use it
  if (m.sender && !m.sender.includes("@") && !/^\d{10,}$/.test(m.sender)) {
    return m.sender;
  }
  // If chatName is available and not a raw JID, use it
  if (m.chatName && !m.chatName.includes("@") && !/^\d{10,}$/.test(m.chatName)) {
    return m.chatName;
  }
  return "Unknown contact";
}

function getDisplayChat(m) {
  if (m.chatName && !m.chatName.includes("@")) {
    return m.chatName;
  }
  return null;
}

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
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
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
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center justify-between pb-1">
            <p className="text-xs font-medium text-ink-muted">
              {important.length} important message{important.length !== 1 ? "s" : ""}
            </p>
            <span className="text-[11px] text-ink-faint">Sorted by priority</span>
          </div>

          {important.map((m) => {
            const level = m.importanceAnalysis?.level || "normal";
            const score = m.importanceAnalysis?.finalScore ?? 0;
            const isHigh = level === "high" || score >= 75;
            const senderName = getHumanSender(m);
            const chatName = getDisplayChat(m);
            const rawTimestamp = m.createdAt || m.receivedAt;
            const dateDisplay = fullDateTime(rawTimestamp);
            const reasons = m.importanceAnalysis?.reasons || [];

            return (
              <div
                key={m.id}
                className="group relative rounded-2xl border border-surface-border bg-gradient-to-b from-surface-raised to-surface-panel p-5 shadow-panel transition-all duration-200 hover:border-accent/30 hover:shadow-glow-sm"
              >
                {/* Header row: Priority Badge + Score + Date/Time */}
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-surface-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
                        isHigh
                          ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                          : "bg-surface-raised text-ink-muted ring-1 ring-surface-border"
                      }`}
                    >
                      <Flame className="h-3 w-3 shrink-0" />
                      {isHigh ? "High priority" : "Medium priority"}
                    </span>
                    <span className="text-[11px] font-mono text-ink-faint">
                      {score}/100
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-ink-faint">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{dateDisplay}</span>
                  </div>
                </div>

                {/* Message preview text */}
                <div className="mb-4">
                  <p className="text-sm font-normal leading-relaxed text-ink line-clamp-4">
                    {m.text}
                  </p>
                </div>

                {/* Sender & Source Metadata */}
                <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-accent shrink-0" />
                    <span className="font-medium text-ink">{senderName}</span>
                  </div>
                  {chatName && chatName !== senderName && (
                    <div className="flex items-center gap-1.5 text-ink-faint">
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate max-w-[200px]">{chatName}</span>
                    </div>
                  )}
                </div>

                {/* Why it is important (Reasons) */}
                {reasons.length > 0 && (
                  <div className="mb-4 rounded-xl border border-accent/15 bg-accent/5 px-3.5 py-2.5 text-xs">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1">
                      Why it is important
                    </p>
                    <div className="space-y-1">
                      {reasons.map((r, i) => (
                        <p key={i} className="text-ink-muted leading-relaxed">
                          {r.replace(/^gemini:\s*/i, "")}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action footer */}
                <div className="flex items-center justify-between pt-1 border-t border-surface-border/40">
                  <button
                    onClick={() => setSelected(m)}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    Smart Reply
                  </button>

                  <button
                    onClick={() => navigate("/chats", { state: { chatId: m.chatId, messageId: m.id } })}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 hover:border-accent/40 transition-all"
                  >
                    <span>Open chat</span>
                    <ArrowRight className="h-3.5 w-3.5" />
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
