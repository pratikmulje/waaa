/*
==============================================================================
WAAA - Deadline Monitor                                                Phase 9
==============================================================================

Checks deadline actions from Phase 8 and fires deadline_check events
for "approaching" and "overdue" deadlines.

Integrates with:
- Phase 8 actionExtractor.js (deadline/task items with dueAt)
- Phase 9 watchManager.js (evaluateWatches)
- Phase 9 alertEngine.js (processWatchMatches)

Run intervals:
- Checked once per server boot (via startDeadlineMonitor)
- Re-checked every CHECK_INTERVAL_MS (default: 1 hour)

Avoids duplicate alerts via alertEngine deduplication.
==============================================================================
*/

import { loadActions } from "./actionExtractor.js";
import { evaluateWatches } from "./watchManager.js";
import { processWatchMatches } from "./alertEngine.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;    // 1 hour
const APPROACHING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours ahead

let monitorInterval = null;

/**
 * Scans all deadline/task actions and fires watch events for approaching/overdue deadlines.
 *
 * @returns {Promise<{ checked: number, approaching: number, overdue: number, alertsCreated: number }>}
 */
export async function checkDeadlines() {
  const now = new Date();
  const nowMs = now.getTime();
  const approachingCutoff = nowMs + APPROACHING_WINDOW_MS;

  const actions = await loadActions();
  const deadlineActions = actions.filter(
    (a) => (a.type === "deadline" || a.dueAt) && a.status !== "completed" && a.status !== "cancelled"
  );

  let approaching = 0;
  let overdue = 0;
  let alertsCreated = 0;

  for (const action of deadlineActions) {
    if (!action.dueAt) continue;

    const dueMs = new Date(action.dueAt).getTime();

    let eventType = null;
    if (dueMs < nowMs) {
      eventType = "overdue";
      overdue++;
    } else if (dueMs <= approachingCutoff) {
      eventType = "approaching";
      approaching++;
    } else {
      continue; // Not yet approaching
    }

    // Fire deadline_check event through watch system
    const event = {
      type: "deadline_check",
      data: {
        id: action.id,
        type: eventType,
        text: action.text,
        dueAt: action.dueAt,
        deadlineText: action.deadlineText,
        chatId: action.chatId,
        projectId: action.projectId,
        projectName: action.projectName,
        responsibility: action.responsibility,
      },
    };

    const matches = await evaluateWatches(event);

    // If no specific deadline watches, create alert for all overdue/approaching
    if (matches.length === 0) {
      // Create a synthetic watch match for "any" deadline watch
      const { loadWatches } = await import("./watchManager.js");
      const watches = await loadWatches();
      const deadlineWatches = watches.filter((w) => w.enabled && w.type === "deadline");

      for (const watch of deadlineWatches) {
        matches.push({
          watch,
          event,
          matchReason: `Deadline ${eventType}: ${action.text}`,
        });
      }
    }

    if (matches.length > 0) {
      const result = await processWatchMatches(matches);
      alertsCreated += result.created;
    }
  }

  return {
    checked: deadlineActions.length,
    approaching,
    overdue,
    alertsCreated,
  };
}

/**
 * Starts the periodic deadline monitor.
 * Safe to call multiple times — only one interval runs.
 */
export function startDeadlineMonitor() {
  if (monitorInterval) return;

  // Run once immediately (non-blocking)
  checkDeadlines().catch((err) => console.error("[DeadlineMonitor] Initial check failed:", err));

  monitorInterval = setInterval(() => {
    checkDeadlines().catch((err) => console.error("[DeadlineMonitor] Periodic check failed:", err));
  }, CHECK_INTERVAL_MS);

  console.log("[DeadlineMonitor] Started (checks every 1 hour).");
}

export function stopDeadlineMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[DeadlineMonitor] Stopped.");
  }
}
