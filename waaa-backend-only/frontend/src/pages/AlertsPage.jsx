import React, { useMemo, useState } from "react";
import { Bell, BellOff, Check, Clock } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getAlerts, markAlertRead } from "../api/intelligence.js";
import { timeAgo } from "../utils/format.js";
import { isWithinDays, getStoredDoneSet, addStoredDoneId } from "../utils/recency.js";

const STORAGE_KEY = "waaa_alerts_done_ids";

const SEVERITY_STYLES = {
  critical: { border: "border-red-500/25", badge: "bg-red-500/10 text-red-400 ring-red-500/20", dot: "bg-red-400" },
  warning: { border: "border-amber-500/20", badge: "bg-amber-500/10 text-amber-glow ring-amber-500/20", dot: "bg-amber-glow" },
  info: { border: "border-accent/15", badge: "bg-accent/8 text-accent ring-accent/20", dot: "bg-accent" },
};

function AlertItem({ alert, onDone }) {
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
          onClick={() => onDone(alert.alertId)}
          className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all shadow-sm"
          title="Mark alert as read & done"
        >
          <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
          <span>Done</span>
        </button>
      )}
    </div>
  );
}

export default function AlertsPage() {
  const [showAll, setShowAll] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [doneIds, setDoneIds] = useState(() => getStoredDoneSet(STORAGE_KEY));

  const { data, error, loading, reload } = usePolling(
    () => getAlerts(showAll ? { limit: 100 } : { unread: "true", limit: 50 }),
    { intervalMs: 10000, deps: [showAll] }
  );

  const rawAlerts = data?.alerts || [];

  // Count older alerts (> 2 days)
  const totalOlderCount = useMemo(() => {
    return rawAlerts.filter((a) => !isWithinDays(a.createdAt, 2)).length;
  }, [rawAlerts]);

  // Filter alerts by 2-day cutoff and local Done state
  const alerts = useMemo(() => {
    return rawAlerts.map((a) => {
      if (doneIds.has(a.alertId)) {
        return { ...a, read: true };
      }
      return a;
    }).filter((a) => {
      // If showing unread only, filter out read
      if (!showAll && a.read) return false;
      // Filter out older than 2 days unless showOlder is true
      if (!showOlder && !isWithinDays(a.createdAt, 2)) return false;
      return true;
    });
  }, [rawAlerts, doneIds, showAll, showOlder]);

  async function handleDone(alertId) {
    const updated = addStoredDoneId(STORAGE_KEY, alertId);
    setDoneIds(updated);
    try {
      await markAlertRead(alertId, true);
      reload();
    } catch {
      // optimistic update is preserved in local storage
    }
  }

  return (
    <AppShell title="Alerts">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-surface-border/40 pb-3">
        <div className="flex flex-wrap items-center gap-2">
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

          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-ink-muted">
            <Clock className="h-3 w-3 text-accent" />
            {showOlder ? "All history" : "Last 48 hours"}
          </span>

          {totalOlderCount > 0 && (
            <button
              onClick={() => setShowOlder(!showOlder)}
              className="text-xs font-medium text-accent hover:underline ml-1"
            >
              {showOlder ? "Show last 48h only" : `Include older (${totalOlderCount})`}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-ink-faint">
          {doneIds.size > 0 && (
            <span className="text-[11px] text-emerald-400">
              {doneIds.size} completed
            </span>
          )}
          {alerts.length > 0 && (
            <span>
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
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
          description={
            showOlder
              ? "All alerts have been reviewed."
              : "No alerts from the last 48 hours. Older and completed alerts are automatically removed."
          }
        />
      )}

      {!error && !loading && alerts.length > 0 && (
        <div className="space-y-2 max-w-2xl">
          {alerts.map((a, i) => (
            <AlertItem key={a.alertId || i} alert={a} onDone={handleDone} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
