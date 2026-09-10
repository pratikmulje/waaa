import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import ScoreBar from "../components/common/ScoreBar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getMessages } from "../api/messages.js";
import { RISK_COLORS, clockTime, timeAgo } from "../utils/format.js";

const LEVELS = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

export default function FraudCenter() {
  const [level, setLevel] = useState("all");
  const navigate = useNavigate();

  const { data, error, loading, reload } = usePolling(() => getMessages({ limit: 250 }), { intervalMs: 10000 });

  const alerts = useMemo(() => {
    const msgs = (data?.messages || []).filter((m) => (m.fraudAnalysis?.finalScore ?? 0) >= 30);
    const filtered = level === "all" ? msgs : msgs.filter((m) => m.fraudAnalysis?.riskLevel === level);
    return filtered.sort((a, b) => (b.fraudAnalysis?.finalScore ?? 0) - (a.fraudAnalysis?.finalScore ?? 0));
  }, [data, level]);

  return (
    <AppShell title="Fraud Center">
      <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => setLevel(l.key)}
            className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              level === l.key
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-surface-border text-ink-muted hover:bg-white/5"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message="Couldn't load fraud data." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && alerts.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="No fraud alerts"
          description="Your current message feed has no detected threats at this risk level."
        />
      )}

      {!error && !loading && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((m) => {
            const c = RISK_COLORS[m.fraudAnalysis?.riskLevel] || RISK_COLORS.low;
            return (
              <div key={m.id} className={`rounded-2xl border bg-surface-panel/60 p-4 ring-1 ${c.ring} border-surface-border`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`h-4 w-4 ${c.text}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wide ${c.text}`}>
                      {m.fraudAnalysis?.riskLevel} risk
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-faint">{timeAgo(m.createdAt || m.receivedAt)}</span>
                </div>

                <p className="text-sm leading-relaxed text-ink">{m.text}</p>

                <div className="mt-2 text-xs text-ink-muted">
                  {m.sender} · {m.chatName} · {clockTime(m.createdAt || m.receivedAt)}
                </div>

                <div className="mt-3">
                  <ScoreBar value={m.fraudAnalysis?.finalScore ?? 0} color={c.bar} label="Risk score" size="sm" />
                </div>

                {m.fraudAnalysis?.reasons?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.fraudAnalysis.reasons.map((r, i) => (
                      <span key={i} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400 ring-1 ring-red-500/20">
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => navigate("/chats", { state: { chatId: m.chatId } })}
                    className="focus-ring rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-white/5"
                  >
                    Open conversation
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
