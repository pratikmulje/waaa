import React, { useState } from "react";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getAlerts, markAlertRead } from "../api/intelligence.js";
import { timeAgo } from "../utils/format.js";

const SEVERITY_STYLES = {
  critical: { border: "border-red-500/25", badge: "bg-red-500/10 text-red-400 ring-red-500/20", dot: "bg-red-400" },
  warning: { border: "border-amber-500/20", badge: "bg-amber-500/10 text-amber-glow ring-amber-500/20", dot: "bg-amber-glow" },
  info: { border: "border-accent/15", badge: "bg-accent/8 text-accent ring-accent/20", dot: "bg-accent" },
};

function AlertItem({ alert, onRead }) {
  const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
  const isUnread = !alert.read;

  return (
    <div className={`relative rounded-2xl border ${severity.border} bg-surface-panel p-4 transition-all animate-slide-up ${isUnread ? "ring-1 ring-inset ring-white/5" : "opacity-70"}`}>
      {/* Unread indicator */}
      {isUnread && (
        <span className={`absolute right-4 top-4 h-2 w-2 rounded-full ${severity.dot}`} />
      )}

      <div className="flex items-start gap-3 pr-6">
        <div className="flex-1 min-w-0">
          {/* Severity badge */}
          {alert.severity && alert.severity !== "info" && (
            <span className={`mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${severity.badge}`}>
              {alert.severity}
            </span>
          )}

          <p className="text-sm text-ink leading-snug">
            {alert.message || alert.text || "Alert"}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-faint">
            {alert.chatName && <span>From {alert.chatName}</span>}
            {alert.createdAt && <span>{timeAgo(alert.createdAt)}</span>}
          </div>
        </div>
      </div>

      {isUnread && (
        <button
          onClick={() => onRead(alert.alertId)}
          className="focus-ring mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-ink-faint hover:bg-surface-hover hover:text-ink transition-colors"
        >
          <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
          Mark as read
        </button>
      )}
    </div>
  );
}

export default function AlertsPage() {
  const [showAll, setShowAll] = useState(false);

  const { data, error, loading, reload } = usePolling(
    () => getAlerts(showAll ? { limit: 100 } : { unread: "true", limit: 50 }),
    { intervalMs: 10000, deps: [showAll] }
  );

  const alerts = data?.alerts || [];

  async function handleRead(alertId) {
    try {
      await markAlertRead(alertId, true);
      reload();
    } catch { /* ignore */ }
  }

  return (
    <AppShell title="Alerts">
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!showAll ? (
            <button
              onClick={() => setShowAll(true)}
              className="focus-ring flex items-center gap-1.5 rounded-xl border border-surface-border bg-surface-panel px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              Unread only
            </button>
          ) : (
            <button
              onClick={() => setShowAll(false)}
              className="focus-ring flex items-center gap-1.5 rounded-xl border border-accent/20 bg-accent/8 px-3 py-1.5 text-xs text-accent transition-colors"
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              All alerts
            </button>
          )}
        </div>
        {alerts.length > 0 && (
          <span className="text-xs text-ink-faint">
            {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error && <ErrorState message="Couldn't load alerts." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && alerts.length === 0 && (
        <EmptyState
          icon={BellOff}
          title={showAll ? "No alerts" : "No unread alerts"}
          description={showAll ? "No alerts have been generated yet." : "You're all caught up."}
        />
      )}

      {!error && !loading && alerts.length > 0 && (
        <div className="space-y-2 max-w-2xl">
          {alerts.map((a, i) => (
            <AlertItem key={a.alertId || i} alert={a} onRead={handleRead} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
