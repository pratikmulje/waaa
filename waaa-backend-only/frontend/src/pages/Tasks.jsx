import React, { useMemo, useState } from "react";
import { CheckSquare, Clock, CheckCircle2, Circle, Check } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getTasks, updateActionStatus } from "../api/intelligence.js";
import { timeAgo } from "../utils/format.js";
import { isWithinDays, getStoredDoneSet, addStoredDoneId } from "../utils/recency.js";

const STORAGE_KEY = "waaa_tasks_done_ids";

const STATUS_LABELS = {
  pending: { label: "Pending", color: "text-amber-glow", dot: "bg-amber-glow" },
  "in-progress": { label: "In Progress", color: "text-accent", dot: "bg-accent" },
  done: { label: "Done", color: "text-emerald-glow", dot: "bg-emerald-glow" },
  overdue: { label: "Overdue", color: "text-red-400", dot: "bg-red-400" },
};

function TaskItem({ task, onDone }) {
  const isDone = task.status === "done";
  const status = isDone ? STATUS_LABELS.done : (STATUS_LABELS[task.status] || STATUS_LABELS.pending);

  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 transition-all animate-slide-up ${
      isDone
        ? "border-surface-border bg-surface-panel/50 opacity-60"
        : "border-surface-border bg-surface-panel hover:border-surface-border-strong hover:bg-surface-panel/90"
    }`}>
      <button
        onClick={() => !isDone && onDone(task.id)}
        disabled={isDone}
        className={`focus-ring mt-0.5 rounded-full p-0.5 transition-colors ${isDone ? "cursor-default" : "cursor-pointer hover:text-emerald-400"}`}
        title={isDone ? "Completed" : "Click to mark as done"}
      >
        {isDone ? (
          <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-glow" strokeWidth={1.75} />
        ) : (
          <Circle className="h-4.5 w-4.5 shrink-0 text-ink-faint hover:text-emerald-400 transition-colors" strokeWidth={1.75} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-ink-faint" : "text-ink"}`}>
          {task.text || task.action || "Task"}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`flex items-center gap-1 text-[10px] font-semibold ${status.color}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          {task.dueDate && (
            <span className="flex items-center gap-1 text-[10px] text-ink-faint">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              Due {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
          {task.chatName && (
            <span className="text-[10px] text-ink-faint truncate">
              · {task.chatName}
            </span>
          )}
          {task.assignedTo && (
            <span className="text-[10px] text-ink-faint">→ {task.assignedTo}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isDone && (
          <button
            onClick={() => onDone(task.id)}
            className="focus-ring inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all shadow-sm"
            title="Mark task as done"
          >
            <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
            <span>Done</span>
          </button>
        )}

        <span className="text-[10px] text-ink-faint whitespace-nowrap">
          {timeAgo(task.extractedAt || task.createdAt || task.updatedAt)}
        </span>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [showOlder, setShowOlder] = useState(false);
  const [doneIds, setDoneIds] = useState(() => getStoredDoneSet(STORAGE_KEY));
  const { data, error, loading, reload } = usePolling(getTasks, { intervalMs: 15000 });

  const rawTasks = data?.tasks || [];

  // Count older tasks (> 2 days)
  const totalOlderCount = useMemo(() => {
    return rawTasks.filter((t) => {
      const ts = t.extractedAt || t.createdAt || t.updatedAt;
      return !isWithinDays(ts, 2);
    }).length;
  }, [rawTasks]);

  // Merge backend status with local storage Done status and filter 2-day cutoff
  const { pending, done } = useMemo(() => {
    const activeTasks = rawTasks.filter((t) => {
      if (!showOlder) {
        const ts = t.extractedAt || t.createdAt || t.updatedAt;
        if (!isWithinDays(ts, 2)) return false;
      }
      return true;
    });

    const p = [];
    const d = [];

    for (const t of activeTasks) {
      const isDone = t.status === "done" || doneIds.has(t.id);
      const normalizedTask = isDone ? { ...t, status: "done" } : t;
      if (isDone) {
        d.push(normalizedTask);
      } else {
        p.push(normalizedTask);
      }
    }

    return { pending: p, done: d };
  }, [rawTasks, doneIds, showOlder]);

  const handleDone = async (taskId) => {
    const updated = addStoredDoneId(STORAGE_KEY, taskId);
    setDoneIds(updated);
    try {
      await updateActionStatus(taskId, "done");
      reload();
    } catch {
      // optimistic update is saved in local storage
    }
  };

  const totalVisible = pending.length + done.length;

  return (
    <AppShell title="Tasks">
      {/* Recency Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-surface-border/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-ink-muted">
            <Clock className="h-3 w-3 text-accent" />
            {showOlder ? "All tasks (history)" : "Last 48 hours"}
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
          <span className="text-[11px] text-ink-faint">
            Auto-removing tasks older than 2 days
          </span>
        </div>
      </div>

      {error && <ErrorState message="Couldn't load tasks." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && totalVisible === 0 && (
        <EmptyState
          icon={CheckSquare}
          title="No tasks found"
          description={
            showOlder
              ? "No tasks have been extracted yet."
              : "No tasks extracted in the last 48 hours. Older and completed tasks are automatically removed."
          }
        />
      )}

      {!error && !loading && totalVisible > 0 && (
        <div className="space-y-6 max-w-2xl">
          {pending.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-glow inline-block" />
                Pending · {pending.length}
              </h3>
              <div className="space-y-2">
                {pending.map((t, i) => (
                  <TaskItem key={t.id || i} task={t} onDone={handleDone} />
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-glow inline-block" />
                Completed · {done.length}
              </h3>
              <div className="space-y-2">
                {done.map((t, i) => (
                  <TaskItem key={t.id || i} task={t} onDone={handleDone} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
