import React from "react";
import { MessagesSquare, Users, Star, Flame, ShieldAlert, Radio } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import { SkeletonCard } from "../components/common/Skeleton.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import StatusDot from "../components/common/StatusDot.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getStatsSummary } from "../api/stats.js";
import { useConnection } from "../context/ConnectionContext.jsx";
import { Link } from "react-router-dom";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const conn = useConnection();
  const { data, error, loading, reload } = usePolling(getStatsSummary, { intervalMs: 8000 });

  const cards = [
    { key: "totalMessages", label: "Total Messages", icon: MessagesSquare, tone: "emerald", to: "/chats" },
    { key: "totalConversations", label: "Conversations", icon: Users, tone: "cyan", to: "/chats" },
    { key: "priorityChatMessages", label: "Priority Chat Msgs", icon: Star, tone: "violet", hint: "last 500", to: "/priority" },
    { key: "importantMessages", label: "Important Messages", icon: Flame, tone: "violet", hint: "last 500", to: "/important" },
    { key: "fraudAlerts", label: "Fraud Alerts", icon: ShieldAlert, tone: "red", hint: "last 500", to: "/fraud" },
  ];

  const toneClasses = {
    emerald: "text-emerald-glow bg-emerald-500/10 ring-emerald-500/25",
    cyan: "text-cyan-glow bg-cyan-500/10 ring-cyan-500/25",
    violet: "text-violet-glow bg-violet-500/10 ring-violet-500/25",
    red: "text-red-400 bg-red-500/10 ring-red-500/25",
  };

  return (
    <AppShell title="Dashboard">
      {conn?.status !== "connected" && (
        <Link
          to="/connection"
          className="mb-6 flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 hover:bg-amber-500/15"
        >
          <span className="flex items-center gap-2">
            <Radio className="h-4 w-4" /> WhatsApp isn't connected right now — showing data already collected.
          </span>
          <span className="font-medium underline underline-offset-2">Connect →</span>
        </Link>
      )}

      <div className="mb-8">
        <h2 className="font-display text-2xl font-semibold text-ink">{greeting()}</h2>
        <p className="mt-1 text-sm text-ink-muted">Here's what needs your attention.</p>
      </div>

      {error && <ErrorState message="Couldn't load dashboard stats from the API." onRetry={reload} />}

      {!error && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {loading || !data
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            : cards.map((c) => (
                <Link
                  to={c.to}
                  key={c.key}
                  className="group rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel transition-colors hover:border-white/10 hover:bg-white/[0.02]"
                >
                  <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${toneClasses[c.tone]}`}>
                    <c.icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                  </div>
                  <p className="font-mono text-2xl font-semibold text-ink">{data[c.key] ?? "—"}</p>
                  <p className="mt-1 text-xs text-ink-muted">{c.label}</p>
                  {c.hint && <p className="mt-0.5 text-[10px] text-ink-faint">{c.hint}</p>}
                </Link>
              ))}
        </div>
      )}

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <QuickLink to="/priority" title="Priority Chats" desc="Conversations flagged high-importance or manually starred." icon={Star} />
        <QuickLink to="/fraud" title="Fraud Center" desc="Messages with elevated risk scores from rule + ML analysis." icon={ShieldAlert} />
      </div>
    </AppShell>
  );
}

function QuickLink({ to, title, desc, icon: Icon }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel transition-colors hover:border-white/10 hover:bg-white/[0.03]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
          <Icon className="h-4.5 w-4.5 text-ink-muted" strokeWidth={1.75} />
        </div>
        <div>
          <p className="font-medium text-ink">{title}</p>
          <p className="text-xs text-ink-muted">{desc}</p>
        </div>
      </div>
      <span className="text-ink-faint">→</span>
    </Link>
  );
}
