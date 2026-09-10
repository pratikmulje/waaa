import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Flame,
  CheckSquare,
  Clock,
  Bell,
  ChevronRight,
  Zap,
  Radio,
} from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import { useConnection } from "../context/ConnectionContext.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getAlerts } from "../api/intelligence.js";
import { getDeadlines } from "../api/intelligence.js";
import { getStatsSummary } from "../api/stats.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const conn = useConnection();
  const { data: alertsData } = usePolling(
    () => getAlerts({ unread: "true", limit: 5 }),
    { intervalMs: 15000 }
  );
  const { data: deadlinesData } = usePolling(
    () => getDeadlines({ limit: 5 }),
    { intervalMs: 30000 }
  );
  const { data: stats } = usePolling(getStatsSummary, { intervalMs: 20000 });

  const unreadAlerts = alertsData?.alerts || [];
  const upcomingDeadlines = (deadlinesData?.deadlines || []).slice(0, 3);

  const quickLinks = [
    { to: "/chats", icon: MessageSquare, label: "Chats", hint: stats?.totalConversations ? `${stats.totalConversations} conversations` : "Your messages" },
    { to: "/important", icon: Flame, label: "Important", hint: "High priority messages" },
    { to: "/tasks", icon: CheckSquare, label: "Tasks", hint: "Pending actions" },
    { to: "/deadlines", icon: Clock, label: "Deadlines", hint: "Upcoming due dates" },
    { to: "/alerts", icon: Bell, label: "Alerts", hint: unreadAlerts.length > 0 ? `${unreadAlerts.length} unread` : "Nothing new" },
    { to: "/assistant", icon: Zap, label: "Ask WAAA", hint: "JARVIS-powered search" },
  ];

  return (
    <AppShell title="Home">
      {/* Disconnected banner */}
      {conn?.status !== "connected" && (
        <Link
          to="/connection"
          className="mb-6 flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-400 hover:bg-amber-500/12 transition-colors animate-fade-in"
        >
          <span className="flex items-center gap-2">
            <Radio className="h-4 w-4 shrink-0" />
            WhatsApp isn't connected — showing previously collected data.
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-500" />
        </Link>
      )}

      {/* Greeting */}
      <div className="mb-8 animate-slide-up">
        <h2 className="font-display text-2xl font-semibold text-ink tracking-tight">
          {greeting()}.
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {conn?.status === "connected"
            ? "WAAA is active and processing your messages."
            : "WAAA is ready. Connect WhatsApp to begin."}
        </p>
      </div>

      {/* Quick nav grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 animate-slide-up">
        {quickLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="group relative flex flex-col rounded-2xl border border-surface-border bg-surface-panel p-4 transition-all duration-200 hover:border-accent/25 hover:bg-surface-hover hover:shadow-glow-sm"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-surface-border bg-surface-raised transition-colors group-hover:border-accent/25 group-hover:bg-accent/8">
              <link.icon className="h-4 w-4 text-ink-muted transition-colors group-hover:text-accent" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-semibold text-ink">{link.label}</p>
            <p className="mt-0.5 text-xs text-ink-faint">{link.hint}</p>
            <ChevronRight className="absolute right-3 top-3 h-3.5 w-3.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      {/* Upcoming deadlines (if any) */}
      {upcomingDeadlines.length > 0 && (
        <div className="mt-8 animate-slide-up">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Clock className="h-4 w-4 text-accent" strokeWidth={1.75} />
              Upcoming Deadlines
            </h3>
            <Link to="/deadlines" className="text-xs text-accent hover:text-accent-glow transition-colors">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingDeadlines.map((d, i) => (
              <div
                key={d.id || i}
                className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-panel px-4 py-3 text-sm"
              >
                <span className="text-ink truncate mr-3">{d.text || d.action || "Deadline"}</span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {d.dueDate ? new Date(d.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unread alerts (if any) */}
      {unreadAlerts.length > 0 && (
        <div className="mt-6 animate-slide-up">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Bell className="h-4 w-4 text-accent" strokeWidth={1.75} />
              Unread Alerts
              <span className="ml-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                {unreadAlerts.length}
              </span>
            </h3>
            <Link to="/alerts" className="text-xs text-accent hover:text-accent-glow transition-colors">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {unreadAlerts.slice(0, 3).map((a, i) => (
              <div
                key={a.alertId || i}
                className="rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-sm"
              >
                <p className="text-ink leading-snug">{a.message || a.text || "Alert"}</p>
                {a.createdAt && (
                  <p className="mt-1 text-[10px] text-ink-faint">
                    {new Date(a.createdAt).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — nothing to show */}
      {unreadAlerts.length === 0 && upcomingDeadlines.length === 0 && (
        <div className="mt-10 text-center animate-fade-in">
          <p className="text-sm text-ink-faint">No alerts or upcoming deadlines right now.</p>
          <p className="mt-1 text-xs text-ink-faint">
            Ask WAAA anything, or open a chat to get started.
          </p>
        </div>
      )}
    </AppShell>
  );
}
