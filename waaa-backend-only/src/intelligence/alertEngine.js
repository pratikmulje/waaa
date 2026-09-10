/*
==============================================================================
WAAA - Alert Engine                                                    Phase 9
==============================================================================

Creates, deduplicates, and manages persistent alerts triggered by watches.
Stored in data/alerts.json.

Design:
- Deduplication: Same watch + sourceId within DEDUP_WINDOW_MS = no new alert.
- Cooldown: Per-watch minimum interval of WATCH_COOLDOWN_MS between alerts.
- Severity levels: info, warning, critical
==============================================================================
*/

import { readCollection, writeCollection, genId } from "../db/localStore.js";

const COLLECTION = "alerts";
const DEDUP_WINDOW_MS = 60 * 60 * 1000;      // 1 hour dedup window per sourceId
const WATCH_COOLDOWN_MS = 5 * 60 * 1000;     // 5 min minimum between alerts for same watch

// Phase 9 alert-level metrics (tracked independently from watchManager metrics)
const alertMetrics = {
  alertsCreated: 0,
  duplicateAlertsSuppressed: 0,
};

export function getAlertMetrics() { return { ...alertMetrics }; }
export function resetAlertMetrics() {
  alertMetrics.alertsCreated = 0;
  alertMetrics.duplicateAlertsSuppressed = 0;
}

export const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
};

export const ALERT_TYPES = {
  IMPORTANT_EVENT: "important_event",
  DEADLINE_APPROACHING: "deadline_approaching",
  DEADLINE_MISSED: "deadline_missed",
  BLOCKER_DETECTED: "blocker_detected",
  PERSON_ACTIVITY: "person_activity",
  PROJECT_CHANGED: "project_changed",
  ACTION_STATUS_CHANGED: "action_status_changed",
  COMMITMENT_WAITING: "commitment_waiting",
  WATCH_MATCH: "watch_match",
};

// ── Storage ─────────────────────────────────────────────────────────────────

export async function loadAlerts() { return readCollection(COLLECTION); }
export async function saveAlerts(alerts) { return writeCollection(COLLECTION, alerts); }

// ── Alert Creation with Deduplication ───────────────────────────────────────

/**
 * Creates an alert if it passes deduplication/cooldown checks.
 *
 * @param {object} params
 * @param {string} params.watchId - Source watch ID
 * @param {string} params.type - ALERT_TYPES value
 * @param {string} params.title - Short alert title
 * @param {string} params.message - Full alert message
 * @param {string} [params.severity] - ALERT_SEVERITY value
 * @param {string} [params.sourceId] - Dedup key (actionId, messageId, etc.)
 * @param {string} [params.chatId]
 * @param {string} [params.projectId]
 * @param {object} [params.metadata]
 * @returns {Promise<{ alert: object|null, suppressed: boolean }>}
 */
export async function createAlert(params) {
  const alerts = await loadAlerts();
  const now = Date.now();

  // 1. sourceId deduplication (same alert within DEDUP_WINDOW_MS)
  if (params.sourceId) {
    const dedupCutoff = now - DEDUP_WINDOW_MS;
    const duplicate = alerts.find(
      (a) =>
        a.sourceId === params.sourceId &&
        a.watchId === params.watchId &&
        new Date(a.createdAt).getTime() > dedupCutoff
    );
    if (duplicate) {
      alertMetrics.duplicateAlertsSuppressed++;
      return { alert: null, suppressed: true, reason: "duplicate_source_id" };
    }
  }

  // 2. Per-watch cooldown
  if (params.watchId) {
    const cooldownCutoff = now - WATCH_COOLDOWN_MS;
    const recentAlert = alerts.find(
      (a) =>
        a.watchId === params.watchId &&
        a.type === params.type &&
        new Date(a.createdAt).getTime() > cooldownCutoff
    );
    if (recentAlert) {
      alertMetrics.duplicateAlertsSuppressed++;
      return { alert: null, suppressed: true, reason: "watch_cooldown" };
    }
  }

  const alert = {
    alertId: "alert_" + genId(),
    watchId: params.watchId || null,
    type: params.type || ALERT_TYPES.WATCH_MATCH,
    title: params.title || "New Alert",
    message: params.message || "",
    severity: params.severity || ALERT_SEVERITY.INFO,
    sourceId: params.sourceId || null,
    chatId: params.chatId || null,
    projectId: params.projectId || null,
    metadata: params.metadata || {},
    read: false,
    createdAt: new Date(now).toISOString(),
  };

  alerts.push(alert);
  await saveAlerts(alerts);
  alertMetrics.alertsCreated++;

  return { alert, suppressed: false };
}

/**
 * Processes watch matches and creates appropriate alerts.
 *
 * @param {Array<{watch: object, event: object, matchReason: string}>} matches
 * @returns {Promise<{ created: number, suppressed: number, alerts: Array }>}
 */
export async function processWatchMatches(matches) {
  let created = 0;
  let suppressed = 0;
  const createdAlerts = [];

  for (const { watch, event, matchReason } of matches) {
    const { type: eventType, data } = event;

    // Determine alert properties from watch type and event
    const alertParams = buildAlertParams(watch, eventType, data, matchReason);

    const { alert, suppressed: wasSuppressed } = await createAlert({
      watchId: watch.watchId,
      ...alertParams,
    });

    if (wasSuppressed) {
      suppressed++;
    } else if (alert) {
      created++;
      createdAlerts.push(alert);
    }
  }

  return { created, suppressed, alerts: createdAlerts };
}

function buildAlertParams(watch, eventType, data, matchReason) {
  const watchTarget = watch.target || watch.person || watch.topic || watch.chatId || "watched item";
  const sourceId = data.id || data.alertId || data.messageId || data.actionId || data.chunkId || null;

  // Project changes
  if (watch.type === "project") {
    const severity = data.type === "blocker" ? ALERT_SEVERITY.CRITICAL
      : data.type === "deadline" ? ALERT_SEVERITY.WARNING
      : ALERT_SEVERITY.INFO;
    return {
      type: data.type === "blocker" ? ALERT_TYPES.BLOCKER_DETECTED
          : data.type === "deadline" ? ALERT_TYPES.DEADLINE_APPROACHING
          : ALERT_TYPES.PROJECT_CHANGED,
      title: `${watchTarget}: ${matchReason}`,
      message: data.text || matchReason,
      severity,
      sourceId,
      chatId: data.chatId || null,
      projectId: watch.projectId || data.projectId || null,
      metadata: { eventType, watchType: watch.type, data },
    };
  }

  // Deadline checks
  if (eventType === "deadline_check") {
    const isOverdue = data.type === "overdue";
    return {
      type: isOverdue ? ALERT_TYPES.DEADLINE_MISSED : ALERT_TYPES.DEADLINE_APPROACHING,
      title: isOverdue ? `Overdue: ${data.text}` : `Deadline approaching: ${data.text}`,
      message: isOverdue
        ? `Deadline was: ${data.dueAt || "unknown"} — ${data.text}`
        : `Due ${data.dueAt ? `on ${data.dueAt.slice(0, 10)}` : "soon"} — ${data.text}`,
      severity: isOverdue ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      sourceId: data.id || `deadline_${data.text?.slice(0, 30)}`,
      chatId: data.chatId || null,
      projectId: data.projectId || null,
      metadata: { eventType, watchType: watch.type, data },
    };
  }

  // Blocker detected
  if (watch.type === "blocker" || data.type === "blocker" || data.status === "blocked") {
    return {
      type: ALERT_TYPES.BLOCKER_DETECTED,
      title: `Blocker: ${(data.text || "").slice(0, 80)}`,
      message: data.text || matchReason,
      severity: ALERT_SEVERITY.CRITICAL,
      sourceId,
      chatId: data.chatId || null,
      projectId: data.projectId || null,
      metadata: { eventType, watchType: watch.type, data },
    };
  }

  // Person activity
  if (watch.type === "person") {
    return {
      type: ALERT_TYPES.PERSON_ACTIVITY,
      title: `${watchTarget}: ${matchReason}`,
      message: data.text || matchReason,
      severity: ALERT_SEVERITY.INFO,
      sourceId,
      chatId: data.chatId || null,
      projectId: null,
      metadata: { eventType, watchType: watch.type, data },
    };
  }

  // Important events
  if (watch.type === "important") {
    return {
      type: ALERT_TYPES.IMPORTANT_EVENT,
      title: matchReason,
      message: data.text || data.summary || matchReason,
      severity: ALERT_SEVERITY.WARNING,
      sourceId,
      chatId: data.chatId || null,
      projectId: null,
      metadata: { eventType, watchType: watch.type, data },
    };
  }

  // Generic fallback
  return {
    type: ALERT_TYPES.WATCH_MATCH,
    title: `Watch triggered: ${watchTarget}`,
    message: matchReason || data.text || "",
    severity: ALERT_SEVERITY.INFO,
    sourceId,
    chatId: data.chatId || null,
    projectId: data.projectId || null,
    metadata: { eventType, watchType: watch.type, data },
  };
}

// ── Alert Queries ────────────────────────────────────────────────────────────

export async function getFilteredAlerts(filters = {}) {
  const alerts = await loadAlerts();
  let result = alerts;

  if (filters.unread !== undefined) {
    const unreadBool = filters.unread === "true" || filters.unread === true;
    result = result.filter((a) => a.read === !unreadBool);
  }
  if (filters.severity) result = result.filter((a) => a.severity === filters.severity);
  if (filters.type) result = result.filter((a) => a.type === filters.type);
  if (filters.watchId) result = result.filter((a) => a.watchId === filters.watchId);
  if (filters.project) result = result.filter((a) => a.projectId === filters.project);
  if (filters.chat) result = result.filter((a) => a.chatId === filters.chat);

  // Sort newest first
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const limit = parseInt(filters.limit, 10) || 100;
  return result.slice(0, limit);
}

export async function markAlertRead(alertId, read = true) {
  const alerts = await loadAlerts();
  const alert = alerts.find((a) => a.alertId === alertId);
  if (!alert) return null;
  alert.read = read;
  await saveAlerts(alerts);
  return alert;
}

export async function markAllAlertsRead() {
  const alerts = await loadAlerts();
  let count = 0;
  for (const a of alerts) {
    if (!a.read) { a.read = true; count++; }
  }
  if (count > 0) await saveAlerts(alerts);
  return { markedRead: count };
}
