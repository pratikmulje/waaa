import React, { useMemo } from "react";
import { CheckSquare, Clock, CheckCircle2, Circle } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getTasks } from "../api/intelligence.js";
import { timeAgo } from "../utils/format.js";

const STATUS_LABELS = {
  pending: { label: "Pending", color: "text-amber-glow", dot: "bg-amber-glow" },
  "in-progress": { label: "In Progress", color: "text-accent", dot: "bg-accent" },
  done: { label: "Done", color: "text-emerald-glow", dot: "bg-emerald-glow" },
  overdue: { label: "Overdue", color: "text-red-400", dot: "bg-red-400" },
};

function TaskItem({ task }) {
  const status = STATUS_LABELS[task.status] || STATUS_LABELS.pending;
  const isDone = task.status === "done";

  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 transition-all animate-slide-up ${
      isDone
        ? "border-surface-border bg-surface-panel/50 opacity-60"
        : "border-surface-border bg-surface-panel"
    }`}>
      {isDone ? (
        <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-glow" strokeWidth={1.75} />
      ) : (
        <Circle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-ink-faint" strokeWidth={1.75} />
      )}

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

      <span className="shrink-0 text-[10px] text-ink-faint whitespace-nowrap">
        {timeAgo(task.extractedAt || task.createdAt)}
      </span>
    </div>
  );
}

export default function TasksPage() {
  const { data, error, loading, reload } = usePolling(getTasks, { intervalMs: 15000 });

  const tasks = data?.tasks || [];

  const { pending, done } = useMemo(() => ({
    pending: tasks.filter((t) => t.status !== "done"),
    done: tasks.filter((t) => t.status === "done"),
  }), [tasks]);

  return (
    <AppShell title="Tasks">
      {error && <ErrorState message="Couldn't load tasks." onRetry={reload} />}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {!error && !loading && tasks.length === 0 && (
        <EmptyState
          icon={CheckSquare}
          title="No tasks found"
          description="Tasks are automatically extracted from your WhatsApp conversations."
        />
      )}

      {!error && !loading && tasks.length > 0 && (
        <div className="space-y-6 max-w-2xl">
          {pending.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-glow inline-block" />
                Pending · {pending.length}
              </h3>
              <div className="space-y-2">
                {pending.map((t, i) => <TaskItem key={t.id || i} task={t} />)}
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
                {done.map((t, i) => <TaskItem key={t.id || i} task={t} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
