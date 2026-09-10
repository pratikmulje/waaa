/*
==============================================================================
WAAA - Media Analysis Store                                           Phase 10
==============================================================================

Stores and retrieves structured media analysis records.
Collection: data/mediaAnalysis.json

Schema per record:
  analysisId    - unique ID
  messageId     - source WhatsApp message ID
  chatId        - source chat
  chatName      - human name
  sender        - sender name
  senderJid     - sender JID
  receivedAt    - original message timestamp
  mediaType     - "image" | "pdf"
  mimeType      - e.g. "image/jpeg", "application/pdf"
  fileSizeBytes - original file size
  tier          - intelligence tier at time of processing
  analysis      - { description, topics, entities, importantInformation,
                    dates, deadlines, decisions, summary, sections? }
  model         - Gemini model used
  processedAt   - ISO timestamp
  geminiCalled  - boolean
  status        - "ok" | "skipped" | "failed" | "size_exceeded" | "unsupported"
  skipReason    - if skipped, why
  errorMessage  - if failed, error
==============================================================================
*/

import { readCollection, writeCollection, genId } from "../db/localStore.js";

const COLLECTION = "mediaAnalysis";

export async function loadMediaAnalysis() {
  return readCollection(COLLECTION);
}

export async function saveMediaAnalysis(records) {
  return writeCollection(COLLECTION, records);
}

/**
 * Finds existing analysis for a messageId. Used for idempotency check.
 */
export async function getMediaAnalysisByMessageId(messageId) {
  const all = await loadMediaAnalysis();
  return all.find((r) => r.messageId === messageId) || null;
}

/**
 * Upserts a media analysis record.
 */
export async function upsertMediaAnalysis(record) {
  const all = await loadMediaAnalysis();
  const idx = all.findIndex((r) => r.messageId === record.messageId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...record, updatedAt: new Date().toISOString() };
  } else {
    all.push({
      analysisId: "media_" + genId(),
      createdAt: new Date().toISOString(),
      ...record,
    });
  }
  await saveMediaAnalysis(all);
  return all.find((r) => r.messageId === record.messageId);
}

/**
 * Filters media analysis records.
 * @param {object} filters - { mediaType, chatId, sender, topic, projectName, startAt, endAt, limit }
 */
export async function getFilteredMediaAnalysis(filters = {}) {
  const all = await loadMediaAnalysis();
  let result = all.filter((r) => r.status === "ok");

  if (filters.mediaType) result = result.filter((r) => r.mediaType === filters.mediaType);
  if (filters.chatId) result = result.filter((r) => r.chatId === filters.chatId);
  if (filters.sender) {
    const s = filters.sender.toLowerCase();
    result = result.filter((r) => (r.sender || "").toLowerCase().includes(s));
  }
  if (filters.topic) {
    const t = filters.topic.toLowerCase();
    result = result.filter((r) => {
      const a = r.analysis || {};
      return (
        (a.description || "").toLowerCase().includes(t) ||
        (a.summary || "").toLowerCase().includes(t) ||
        (a.topics || []).some((x) => x.toLowerCase().includes(t)) ||
        (a.entities || []).some((x) => x.toLowerCase().includes(t)) ||
        (a.importantInformation || []).some((x) => x.toLowerCase().includes(t))
      );
    });
  }
  if (filters.projectName) {
    const p = filters.projectName.toLowerCase();
    result = result.filter((r) => {
      const a = r.analysis || {};
      return (
        (a.description || "").toLowerCase().includes(p) ||
        (a.summary || "").toLowerCase().includes(p) ||
        (a.topics || []).some((x) => x.toLowerCase().includes(p))
      );
    });
  }
  if (filters.startAt) {
    const start = new Date(filters.startAt).getTime();
    result = result.filter((r) => r.receivedAt && new Date(r.receivedAt).getTime() >= start);
  }
  if (filters.endAt) {
    const end = new Date(filters.endAt).getTime();
    result = result.filter((r) => r.receivedAt && new Date(r.receivedAt).getTime() <= end);
  }

  result.sort((a, b) => new Date(b.processedAt || 0) - new Date(a.processedAt || 0));

  const limit = parseInt(filters.limit, 10) || 50;
  return result.slice(0, limit);
}
