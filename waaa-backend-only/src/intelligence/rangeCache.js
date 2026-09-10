/*
==============================================================================
WAAA - Range Summary Cache & Invalidation                              Phase 7
==============================================================================

Lightweight persistent cache for completed range and global summaries.
Stored in data/rangeSummaries.json.

Invalidation Strategy:
- When new relevant messages arrive in a chat within [startAt, endAt],
  affected cache entries are marked as `stale: true` (or removed).
- No background re-generation until the user queries again (lazy evaluation).
- Repeated identical queries reuse valid (non-stale) cached summaries.
==============================================================================
*/

import { readCollection, writeCollection } from "../db/localStore.js";

const COLLECTION = "rangeSummaries";

export async function loadRangeCache() {
  return readCollection(COLLECTION);
}

export async function saveRangeCache(entries) {
  return writeCollection(COLLECTION, entries);
}

/**
 * Builds a deterministic cache key.
 */
export function buildCacheKey({ scope = "chat", targetId = "global", startAt = null, endAt = null, topic = null }) {
  const normScope = String(scope).toLowerCase();
  const normTarget = String(targetId || "global").toLowerCase();
  const normTopic = topic ? `:${String(topic).toLowerCase()}` : "";
  const sAt = startAt ? new Date(startAt).toISOString() : "all";
  const eAt = endAt ? new Date(endAt).toISOString() : "all";
  return `${normScope}:${normTarget}${normTopic}:${sAt}:${eAt}`;
}

/**
 * Retrieves a non-stale cached summary.
 *
 * @param {object} params
 * @param {string} [params.scope] - "chat" | "global" | "topic"
 * @param {string} [params.targetId] - chatId, "global", or topic string
 * @param {string} [params.startAt] - start ISO
 * @param {string} [params.endAt] - end ISO
 * @param {string} [params.topic] - topic
 * @returns {Promise<object|null>}
 */
export async function getCachedRangeSummary({ scope = "chat", targetId = "global", startAt = null, endAt = null, topic = null }) {
  const cache = await loadRangeCache();
  const key = buildCacheKey({ scope, targetId, startAt, endAt, topic });

  const entry = cache.find((e) => e.cacheKey === key);
  if (!entry) return null;

  if (entry.stale) {
    return null; // Cache is stale, requires refresh
  }

  return entry;
}

/**
 * Saves or updates a range summary in cache.
 */
export async function setCachedRangeSummary(data) {
  const cache = await loadRangeCache();
  const cacheKey = buildCacheKey({
    scope: data.scope || "chat",
    targetId: data.targetId || "global",
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    topic: data.topic || null,
  });

  const now = new Date().toISOString();
  const entry = {
    cacheKey,
    scope: data.scope || "chat",
    targetId: data.targetId || "global",
    topic: data.topic || null,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    rangeLabel: data.rangeLabel || "custom",
    summary: data.summary || "",
    keyTopics: Array.isArray(data.keyTopics) ? data.keyTopics : (data.topics || []),
    decisions: Array.isArray(data.decisions) ? data.decisions : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    pendingItems: Array.isArray(data.pendingItems) ? data.pendingItems : [],
    blockers: Array.isArray(data.blockers) ? data.blockers : [],
    peopleInvolved: Array.isArray(data.peopleInvolved) ? data.peopleInvolved : [],
    deadlines: Array.isArray(data.deadlines) ? data.deadlines : [],
    recentChanges: data.recentChanges || null,
    sourceChunks: Array.isArray(data.sourceChunks) ? data.sourceChunks : [],
    sourceChats: Array.isArray(data.sourceChats) ? data.sourceChats : [],
    messageCount: typeof data.messageCount === "number" ? data.messageCount : 0,
    confidence: typeof data.confidence === "number" ? data.confidence : 0.9,
    stale: false,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };

  const idx = cache.findIndex((e) => e.cacheKey === cacheKey);
  if (idx >= 0) {
    cache[idx] = { ...cache[idx], ...entry, createdAt: cache[idx].createdAt, updatedAt: now };
  } else {
    cache.push(entry);
  }

  await saveRangeCache(cache);
  return entry;
}

/**
 * Invalidates cache entries when new messages arrive.
 *
 * @param {object} params
 * @param {string} params.chatId - chatId where new message arrived
 * @param {string|number|Date} [params.timestamp] - timestamp of the new message (defaults to now)
 */
export async function invalidateRangeCache({ chatId, timestamp = new Date() }) {
  const cache = await loadRangeCache();
  const msgTime = new Date(timestamp).getTime();
  let modified = false;

  for (const entry of cache) {
    if (entry.stale) continue;

    // 1. If entry is for this specific chat
    const matchesChat =
      entry.targetId === chatId ||
      (Array.isArray(entry.sourceChats) && entry.sourceChats.includes(chatId)) ||
      entry.scope === "global";

    if (matchesChat) {
      const sTime = entry.startAt ? new Date(entry.startAt).getTime() : 0;
      const eTime = entry.endAt ? new Date(entry.endAt).getTime() : Infinity;

      // If message falls inside the range, mark cache stale
      if (msgTime >= sTime && msgTime <= eTime) {
        entry.stale = true;
        entry.updatedAt = new Date().toISOString();
        modified = true;
      }
    }
  }

  if (modified) {
    await saveRangeCache(cache);
  }

  return { invalidated: modified };
}

/**
 * Clears all cached range summaries.
 */
export async function clearRangeCache() {
  await saveRangeCache([]);
}
