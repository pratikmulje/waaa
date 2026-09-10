import React, { useMemo } from "react";
import { Clock, AlertTriangle, CalendarDays } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getDeadlines } from "../api/intelligence.js";

function urgencyClass(dueDate) {
  if (!dueDate) return { border: "border-surface-border", label: "", labelClass: "" };
  const diff = new Date(dueDate).getTime() - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 0) return { border: "border-red-500/30", label: "Overdue", labelClass: "text-red-400 bg-red-500/10 ring-red-500/20" };
  if (hours < 24) return { border: "border-amber-500/30", label: "Due today", labelClass: "text-amber-glow bg-amber-500/10 ring-amber-500/20" };
  if (hours < 72) return { border: "border-accent/25", label: "Due soon", labelClass: "text-accent bg-accent/10 ring-accent/20" };
  return { border: "border-surface-border", label: "", labelClass: "" };
}

function DeadlineItem({ deadline }) {
  const { border, label, labelClass } = urgencyClass(deadline.dueDate);
  const dueDisplay = deadline.dueDate
    ? new Date(deadline.dueDate).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className={`rounded-2xl border ${border} bg-surface-panel p-4 transition-all animate-slide-up`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink leading-snug">
            {deadline.text || deadline.action || "Deadline"}
          </p>
          {deadline.chatName && (
            <p className="mt-1 text-[11px] text-ink-faint">
              Source: <span className="text-ink-muted">{deadline.chatName}</span>
            </p>
          )}
        </div>
        {label && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${labelClass}`}>
            {label}
          </span>
        )}
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
  const { data, error, loading, reload } = usePolling(getDeadlines, { intervalMs: 20000 });
  const deadlines = data?.deadlines || [];

  const sorted = useMemo(() => {
    return [...deadlines].sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [deadlines]);

  const overdue = sorted.filter((d) => d.dueDate && new Date(d.dueDate) < new Date());
  const upcoming = sorted.filter((d) => !d.dueDate || new Date(d.dueDate) >= new Date());

  return (
    <AppShell title="Deadlines">
      {error && <ErrorState message="Couldn't load deadlines." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && deadlines.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No deadlines found"
          description="Deadlines are automatically extracted from your WhatsApp conversations."
        />
      )}

      {!error && !loading && deadlines.length > 0 && (
        <div className="space-y-6 max-w-2xl">
          {overdue.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
                Overdue · {overdue.length}
              </h3>
              <div className="space-y-2">
                {overdue.map((d, i) => <DeadlineItem key={d.id || i} deadline={d} />)}
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
                {upcoming.map((d, i) => <DeadlineItem key={d.id || i} deadline={d} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
