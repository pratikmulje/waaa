import React, { useMemo, useState } from "react";
import { Clock, AlertTriangle, CalendarDays, Check } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getDeadlines, updateActionStatus } from "../api/intelligence.js";
import { cleanSourceLabel } from "../utils/format.js";
import { isDeadlineActive, getStoredDoneSet, addStoredDoneId } from "../utils/recency.js";

const STORAGE_KEY = "waaa_deadlines_done_ids";

function resolveDueDate(deadline) {
  return deadline?.dueDate || deadline?.dueAt || null;
}

function urgencyClass(dueDate) {
  if (!dueDate) return { border: "border-surface-border", label: "", labelClass: "" };
  const parsedTime = new Date(dueDate).getTime();
  if (isNaN(parsedTime)) return { border: "border-surface-border", label: "", labelClass: "" };
  const diff = parsedTime - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 0) return { border: "border-red-500/30", label: "Overdue", labelClass: "text-red-400 bg-red-500/10 ring-red-500/20" };
  if (hours < 24) return { border: "border-amber-500/30", label: "Due today", labelClass: "text-amber-glow bg-amber-500/10 ring-amber-500/20" };
  if (hours < 72) return { border: "border-accent/25", label: "Due soon", labelClass: "text-accent bg-accent/10 ring-accent/20" };
  return { border: "border-surface-border", label: "", labelClass: "" };
}

function DeadlineItem({ deadline, onDone }) {
  const due = resolveDueDate(deadline);
  const { border, label, labelClass } = urgencyClass(due);
  let dueDisplay = null;
  if (due) {
    const parsed = new Date(due);
    if (!isNaN(parsed.getTime())) {
      dueDisplay = parsed.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      dueDisplay = deadline.deadlineText || String(due);
    }
  } else if (deadline.deadlineText) {
    dueDisplay = deadline.deadlineText;
  }

  return (
    <div className={`rounded-2xl border ${border} bg-surface-panel p-4 transition-all animate-slide-up hover:border-surface-border-strong`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink leading-snug">
            {deadline.text || deadline.action || "Deadline"}
          </p>
          {deadline.chatName && (
            <p className="mt-1 text-[11px] text-ink-faint">
              Source: <span className="text-ink-muted">{cleanSourceLabel(deadline.chatName)}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {label && (
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${labelClass}`}>
              {label}
            </span>
          )}

          <button
            onClick={() => onDone(deadline.id)}
            className="focus-ring inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all shadow-sm"
            title="Mark deadline as done / resolved"
          >
            <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
            <span>Done</span>
          </button>
        </div>
      </div>

      {dueDisplay && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="h-3.5 w-3.5 text-ink-faint shrink-0" strokeWidth={1.75} />
          <span>{dueDisplay}</span>
        </div>
      )}
    </div>
  );
}

export default function DeadlinesPage() {
  const [showOlder, setShowOlder] = useState(false);
  const [doneIds, setDoneIds] = useState(() => getStoredDoneSet(STORAGE_KEY));
  const { data, error, loading, reload } = usePolling(getDeadlines, { intervalMs: 20000 });
  const rawDeadlines = data?.deadlines || [];

  // Count older/expired deadlines (> 2 days)
  const totalOlderCount = useMemo(() => {
    return rawDeadlines.filter((d) => !isDeadlineActive(d, 2)).length;
  }, [rawDeadlines]);

  const activeDeadlines = useMemo(() => {
    return rawDeadlines.filter((d) => {
      if (doneIds.has(d.id) || d.status === "done") return false;
      if (!showOlder && !isDeadlineActive(d, 2)) return false;
      return true;
    });
  }, [rawDeadlines, doneIds, showOlder]);

  const sorted = useMemo(() => {
    return [...activeDeadlines].sort((a, b) => {
      const dueA = resolveDueDate(a);
      const dueB = resolveDueDate(b);
      if (!dueA) return 1;
      if (!dueB) return -1;
      const timeA = new Date(dueA).getTime();
      const timeB = new Date(dueB).getTime();
      if (isNaN(timeA)) return 1;
      if (isNaN(timeB)) return -1;
      return timeA - timeB;
    });
  }, [activeDeadlines]);

  const nowMs = Date.now();
  const overdue = sorted.filter((d) => {
    const due = resolveDueDate(d);
    if (!due) return false;
    const time = new Date(due).getTime();
    return !isNaN(time) && time < nowMs;
  });
  const upcoming = sorted.filter((d) => {
    const due = resolveDueDate(d);
    if (!due) return true;
    const time = new Date(due).getTime();
    return isNaN(time) || time >= nowMs;
  });

  const handleDone = async (deadlineId) => {
    const updated = addStoredDoneId(STORAGE_KEY, deadlineId);
    setDoneIds(updated);
    try {
      await updateActionStatus(deadlineId, "done");
      reload();
    } catch {
      // optimistic state is kept in local storage
    }
  };

  const totalVisible = overdue.length + upcoming.length;

  return (
    <AppShell title="Deadlines">
      {/* Recency Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-surface-border/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-ink-muted">
            <Clock className="h-3 w-3 text-accent" />
            {showOlder ? "All deadlines (history)" : "Active & recent (last 48h)"}
          </span>
          {totalOlderCount > 0 && (
            <button
              onClick={() => setShowOlder(!showOlder)}
              className="text-xs font-medium text-accent hover:underline ml-1"
            >
              {showOlder ? "Show active only" : `Include older/expired (${totalOlderCount})`}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-ink-faint">
          {doneIds.size > 0 && (
            <span className="text-[11px] text-emerald-400">
              {doneIds.size} completed
            </span>
          )}
          <span>Auto-cleaning deadlines older than 2 days</span>
        </div>
      </div>

      {error && <ErrorState message="Couldn't load deadlines." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && totalVisible === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No active deadlines found"
          description={
            showOlder
              ? "All deadlines have been marked as done."
              : "No deadlines from the last 48 hours. Items older than 2 days and resolved deadlines are automatically removed."
          }
        />
      )}

      {!error && !loading && totalVisible > 0 && (
        <div className="space-y-6 max-w-2xl">
          {overdue.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
                Overdue · {overdue.length}
              </h3>
              <div className="space-y-2">
                {overdue.map((d, i) => (
                  <DeadlineItem key={d.id || i} deadline={d} onDone={handleDone} />
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                Upcoming · {upcoming.length}
              </h3>
              <div className="space-y-2">
                {upcoming.map((d, i) => (
                  <DeadlineItem key={d.id || i} deadline={d} onDone={handleDone} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
