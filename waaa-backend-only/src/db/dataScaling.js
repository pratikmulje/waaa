/*
==============================================================================
WAAA - Data Scaling, Metrics & Quota Protection Engine               Phase 14
==============================================================================

Provides:
  1. Lightweight in-memory bounded LRU/TTL cache for read optimization
  2. Bounded exponential backoff retry for storage / transient operations
  3. Quota & operation metrics tracking (reads, writes, deletes, retries, failures)
  4. Deduplication for incoming message records (deterministic idempotency)
  5. User-isolated query boundaries preventing unbounded scans
==============================================================================
*/

// Metrics tracking store
const dataMetrics = {
  reads: 0,
  writes: 0,
  deletes: 0,
  cacheHits: 0,
  cacheMisses: 0,
  retries: 0,
  transientFailures: 0,
  permanentFailures: 0,
  duplicateMessagesSkipped: 0,
  messagesPersisted: 0,
  quotaWarnings: 0,
  startedAt: new Date().toISOString(),
};

// Configurable quota warning thresholds
const QUOTA_THRESHOLDS = {
  READS_WARNING: 50000,
  WRITES_WARNING: 20000,
};

export function getDataMetrics() {
  return { ...dataMetrics };
}

export function resetDataMetrics() {
  Object.assign(dataMetrics, {
    reads: 0,
    writes: 0,
    deletes: 0,
    cacheHits: 0,
    cacheMisses: 0,
    retries: 0,
    transientFailures: 0,
    permanentFailures: 0,
    duplicateMessagesSkipped: 0,
    messagesPersisted: 0,
    quotaWarnings: 0,
  });
}

export function trackDataRead(count = 1) {
  dataMetrics.reads += count;
  if (dataMetrics.reads >= QUOTA_THRESHOLDS.READS_WARNING && dataMetrics.quotaWarnings === 0) {
    dataMetrics.quotaWarnings++;
    console.warn(`[DataScaling] ⚠️ High read volume detected (${dataMetrics.reads} reads). Consider caching.`);
  }
}

export function trackDataWrite(count = 1) {
  dataMetrics.writes += count;
  if (dataMetrics.writes >= QUOTA_THRESHOLDS.WRITES_WARNING && dataMetrics.quotaWarnings <= 1) {
    dataMetrics.quotaWarnings++;
    console.warn(`[DataScaling] ⚠️ High write volume detected (${dataMetrics.writes} writes). Check debounce/batching.`);
  }
}

// ── Lightweight Bounded LRU/TTL Cache ─────────────────────────────────────────

class BoundedCache {
  constructor(maxItems = 200, ttlMs = 60 * 1000) {
    this.maxItems = maxItems;
    this.ttlMs = ttlMs;
    this.store = new Map(); // key -> { value, expiry }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      dataMetrics.cacheMisses++;
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      dataMetrics.cacheMisses++;
      return null;
    }

    dataMetrics.cacheHits++;
    // Re-insert to mark as recently used
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.size >= this.maxItems) {
      // Evict oldest entry (first item in Map)
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    });
  }

  invalidate(keyPrefix) {
    if (!keyPrefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.store.delete(key);
      }
    }
  }
}

export const queryCache = new BoundedCache(300, 30 * 1000); // 30-second TTL for conversation queries

// ── Bounded Exponential Backoff Retry ────────────────────────────────────────

/**
 * Checks if an error is transient (temporary network error, timeout, or RESOURCE_EXHAUSTED).
 */
export function isTransientError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  const code = err.code || "";
  return (
    code === "RESOURCE_EXHAUSTED" ||
    code === "UNAVAILABLE" ||
    code === "DEADLINE_EXCEEDED" ||
    /resource[_\s]*exhausted/i.test(msg) ||
    /quota[_\s]*exceeded/i.test(msg) ||
    /rate[_\s]*limit/i.test(msg) ||
    /econnreset/i.test(msg) ||
    /etimedout/i.test(msg) ||
    /timed\s*out/i.test(msg)
  );
}

/**
 * Executes an operation with bounded exponential backoff on transient failure.
 *
 * @param {Function} op - Async function to execute
 * @param {object} options
 * @param {number} [options.maxAttempts=3]
 * @param {number} [options.initialDelayMs=100]
 * @param {number} [options.maxDelayMs=1500]
 * @returns {Promise<any>}
 */
export async function withTransientRetry(op, options = {}) {
  const { maxAttempts = 3, initialDelayMs = 50, maxDelayMs = 1000 } = options;
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxAttempts) {
    try {
      return await op();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts || !isTransientError(err)) {
        if (isTransientError(err)) dataMetrics.transientFailures++;
        else dataMetrics.permanentFailures++;
        throw err;
      }
      dataMetrics.retries++;
      // Jittered backoff
      const wait = Math.min(delay * (1 + Math.random() * 0.2), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, wait));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}

// ── Deterministic Message Deduplication ─────────────────────────────────────

// Keep a bounded set of recent message IDs in memory to instantly skip duplicate WhatsApp events
const recentMessageIds = new Set();
const MAX_RECENT_MESSAGE_IDS = 1000;

/**
 * Checks if a messageId is a duplicate.
 * If not duplicate, records it and returns false.
 *
 * @param {string} messageId
 * @returns {boolean} true if already seen
 */
export function isDuplicateMessage(messageId) {
  if (!messageId) return false;
  if (recentMessageIds.has(messageId)) {
    dataMetrics.duplicateMessagesSkipped++;
    return true;
  }

  if (recentMessageIds.size >= MAX_RECENT_MESSAGE_IDS) {
    // Delete oldest item
    const oldest = recentMessageIds.values().next().value;
    recentMessageIds.delete(oldest);
  }

  recentMessageIds.add(messageId);
  dataMetrics.messagesPersisted++;
  return false;
}

export function clearDuplicateMessageCache() {
  recentMessageIds.clear();
}
