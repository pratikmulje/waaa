/**
 * Recency and Dismissal Utilities for WAAA
 * 
 * Provides:
 * - 2-day (48-hour) cutoff checks for important messages, tasks, deadlines, and alerts.
 * - Persistent local storage state management for items marked as "Done".
 */

export const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // 48 hours

/**
 * Returns true if dateInput is within the last `days` (default 2 days / 48 hours).
 * Returns false if missing, invalid, or older than `days`.
 */
export function isWithinDays(dateInput, days = 2) {
  if (!dateInput) return false;
  const time = new Date(dateInput).getTime();
  if (Number.isNaN(time)) return false;
  const maxMs = days * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - time;
  // If ageMs is negative (e.g. slight clock drift), it is still considered recent.
  return ageMs <= maxMs;
}

/**
 * Deadline-specific active check:
 * - If overdue: only active if it became overdue within the last `days` (overdue by <= 48h).
 *   Deadlines that expired more than 2 days ago are automatically removed.
 * - If upcoming: active if it was created within the last `days`, or if its due date is in the near future.
 */
export function isDeadlineActive(deadline, days = 2) {
  if (!deadline) return false;
  const maxMs = days * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const due = deadline.dueDate || deadline.dueAt;
  const dueTime = due ? new Date(due).getTime() : NaN;
  const createdTime = new Date(deadline.createdAt || deadline.extractedAt || 0).getTime();

  if (!Number.isNaN(dueTime)) {
    if (dueTime < now) {
      // Overdue: remove if overdue by more than 2 days
      return (now - dueTime) <= maxMs;
    }
    // Upcoming: if it was created more than 2 days ago, check if creation time exists
    if (!Number.isNaN(createdTime) && createdTime > 0) {
      return (now - createdTime) <= maxMs;
    }
    return true;
  }

  // If no due date, fall back to creation time
  if (!Number.isNaN(createdTime) && createdTime > 0) {
    return (now - createdTime) <= maxMs;
  }

  return false;
}

/**
 * Reads a Set of string IDs from localStorage.
 */
export function getStoredDoneSet(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Adds an ID to the stored Set in localStorage and returns a new Set instance.
 */
export function addStoredDoneId(storageKey, id) {
  if (!id) return getStoredDoneSet(storageKey);
  const set = getStoredDoneSet(storageKey);
  set.add(String(id));
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
  return new Set(set);
}

/**
 * Removes an ID from the stored Set in localStorage.
 */
export function removeStoredDoneId(storageKey, id) {
  if (!id) return getStoredDoneSet(storageKey);
  const set = getStoredDoneSet(storageKey);
  set.delete(String(id));
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
  return new Set(set);
}

/**
 * Clears all stored IDs for this key.
 */
export function clearStoredDoneSet(storageKey) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
  return new Set();
}
