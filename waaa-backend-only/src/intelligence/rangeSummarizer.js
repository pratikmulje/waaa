/*
==============================================================================
WAAA - Range Retrieval & Summarization                                 Phase 7
==============================================================================

Hierarchical Range Summarizer:
1. Resolves range to timezone-aware boundaries [startAt, endAt].
2. Checks Range Cache (data/rangeSummaries.json) -> Returns immediately on hit.
3. Finds overlapping existing Chunk Summaries in range -> Reuses them.
4. Identifies any uncovered message gaps in [startAt, endAt] -> Summarizes ONLY missing data.
5. If 1 completed chunk covers entire range -> Reuses chunk summary directly (0 Gemini calls).
6. Synthesizes multiple chunk summaries into a unified range summary.
7. Stores in Range Cache and returns source references.

Strictly adheres to GEMINI COST CONTROL principles.
==============================================================================
*/

import { readCollection } from "../db/localStore.js";
import { loadChunks } from "./chunkSummarizer.js";
import { resolveRange } from "./rangeResolver.js";
import { getCachedRangeSummary, setCachedRangeSummary } from "./rangeCache.js";
import { askAI } from "../ai/geminiClient.js";
import { getCooldownStatus, isPerChatRateLimited, recordPerChatCall } from "../ai/geminiCooldown.js";
import { getIntelligenceTier, meetsTierGate } from "./chatRelevance.js";

// Metrics Tracking
const metrics = {
  geminiCallsMade: 0,
  geminiCallsAvoided: 0,
  cacheHits: 0,
  existingSummaryReuse: 0,
  callsFromMissingCoverage: 0,
};

export function getPhase7Metrics() {
  return { ...metrics };
}

export function resetPhase7Metrics() {
  metrics.geminiCallsMade = 0;
  metrics.geminiCallsAvoided = 0;
  metrics.cacheHits = 0;
  metrics.existingSummaryReuse = 0;
  metrics.callsFromMissingCoverage = 0;
}

function toMillis(m) {
  if (m.receivedAt) return new Date(m.receivedAt).getTime();
  if (m.createdAt?.iso) return new Date(m.createdAt.iso).getTime();
  if (typeof m.createdAt === "string") return new Date(m.createdAt).getTime();
  return 0;
}

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Summarizes a single chat across a time range.
 *
 * @param {string} chatId
 * @param {object|string} rangeInput - e.g. "today", "last 3 days", or { startAt, endAt }
 * @param {object} [options]
 * @param {boolean} [options.force] - bypass cache
 * @param {boolean} [options.ignoreCooldown] - bypass cooldown gate
 * @param {Date} [options.referenceDate] - reference date for relative ranges
 * @returns {Promise<object>}
 */
export async function summarizeChatRange(chatId, rangeInput, options = {}) {
  const { force = false, ignoreCooldown = false, referenceDate = new Date() } = options;

  // 1. Resolve Range Boundaries
  const resolved = resolveRange(rangeInput, { referenceDate });
  const { startAt, endAt, label: rangeLabel, topic, intent } = resolved;
  const startTimeMs = startAt ? new Date(startAt).getTime() : 0;
  const endTimeMs = endAt ? new Date(endAt).getTime() : Infinity;

  // 2. Check Range Cache (Cost Control Level 1)
  if (!force) {
    const cached = await getCachedRangeSummary({
      scope: "chat",
      targetId: chatId,
      startAt,
      endAt,
      topic,
    });
    if (cached) {
      metrics.cacheHits++;
      metrics.geminiCallsAvoided++;
      return {
        ...cached,
        fromCache: true,
        source: "range_cache",
      };
    }
  }

  // 3. Load all chunks and messages for the chat
  const [allChunks, allMessages] = await Promise.all([
    loadChunks(),
    readCollection("messages"),
  ]);

  const chatChunks = allChunks.filter((c) => c.chatId === chatId);
  const chatMessages = allMessages
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => toMillis(a) - toMillis(b));

  // Filter messages in the requested time range
  const messagesInRange = chatMessages.filter((m) => {
    const t = toMillis(m);
    return t >= startTimeMs && t <= endTimeMs;
  });

  // If no messages at all in range -> 0 calls, return empty summary
  if (messagesInRange.length === 0) {
    metrics.geminiCallsAvoided++;
    return {
      chatId,
      rangeLabel,
      timeRange: { startAt, endAt },
      summary: "No messages found for this time range.",
      keyTopics: [],
      decisions: [],
      tasks: [],
      pendingItems: [],
      blockers: [],
      peopleInvolved: [],
      deadlines: [],
      recentChanges: null,
      sourceChunks: [],
      sourceChats: [chatId],
      messageCount: 0,
      confidence: 1.0,
      fromCache: false,
    };
  }

  // 4. Identify overlapping COMPLETED chunk summaries in range
  const overlappingChunks = chatChunks
    .filter((c) => {
      const cStart = new Date(c.firstMessageTime).getTime();
      const cEnd = new Date(c.lastMessageTime).getTime();
      // Overlap condition
      return cEnd >= startTimeMs && cStart <= endTimeMs && c.summary && c.summary.trim().length > 0;
    })
    .sort((a, b) => new Date(a.firstMessageTime).getTime() - new Date(b.firstMessageTime).getTime());

  // Check covered message IDs
  const coveredMessageIds = new Set();
  for (const c of overlappingChunks) {
    if (Array.isArray(c.messageIds)) {
      c.messageIds.forEach((id) => coveredMessageIds.add(id));
    }
  }

  // 5. Detect missing coverage (messages in range not in any completed chunk)
  const uncoveredMessages = messagesInRange.filter(
    (m) => m.messageId && !coveredMessageIds.has(m.messageId)
  );

  let gapSummary = null;
  if (uncoveredMessages.length > 0) {
    // Process ONLY missing data
    const gapTranscript = uncoveredMessages
      .map((m) => `[${m.sender || "Unknown"}]: ${m.text || ""}`)
      .join("\n")
      .slice(0, 8000);

    // If there are no overlapping chunks and few gap messages, or if gap needs summarizing
    if (uncoveredMessages.length >= 1) {
      if (!ignoreCooldown && getCooldownStatus().inCooldown) {
        // Fallback: simple text aggregation without crashing
        gapSummary = {
          summary: `Recent conversation with ${uncoveredMessages.length} messages.`,
          topics: [],
          entities: [],
          decisions: [],
          tasks: [],
        };
      } else {
        metrics.callsFromMissingCoverage++;
        metrics.geminiCallsMade++;
        try {
          const rawGap = await askAI({
            system: "You summarize a missing gap of WhatsApp messages into structured JSON.",
            prompt: `Summarize these recent WhatsApp messages concisely into JSON:\n\n${gapTranscript}\n\nSchema: {"summary": "...", "topics": [], "decisions": [], "tasks": []}`,
            maxTokens: 800,
          });
          const parsed = safeParseJSON(rawGap);
          if (parsed && parsed.summary) {
            gapSummary = parsed;
          }
        } catch (err) {
          console.warn("[RangeSummarizer] Gap summarization error:", err.message);
        }
      }
    }
  }

  // 6. Cost Control: Single Chunk Reuse
  // If exactly 1 chunk exists, covers all messages in range, and no gaps -> 0 Gemini calls!
  if (overlappingChunks.length === 1 && uncoveredMessages.length === 0) {
    const singleChunk = overlappingChunks[0];
    metrics.geminiCallsAvoided++;
    metrics.existingSummaryReuse++;

    const result = {
      chatId,
      rangeLabel,
      timeRange: { startAt, endAt },
      summary: singleChunk.summary,
      keyTopics: singleChunk.topics || [],
      decisions: singleChunk.importantEvents || [],
      tasks: [],
      pendingItems: [],
      blockers: [],
      peopleInvolved: singleChunk.entities || [],
      deadlines: [],
      recentChanges: "Single chunk summary reused",
      sourceChunks: [singleChunk.chunkId],
      sourceChats: [chatId],
      messageCount: messagesInRange.length,
      confidence: 0.95,
      fromCache: false,
    };

    await setCachedRangeSummary({
      scope: "chat",
      targetId: chatId,
      startAt,
      endAt,
      topic,
      ...result,
    });

    return result;
  }

  // 7. Synthesize Range Summary from existing chunks + gap summary
  const chunkSummariesList = overlappingChunks.map((c, idx) => ({
    id: c.chunkId,
    index: idx + 1,
    timeRange: `${c.firstMessageTime} to ${c.lastMessageTime}`,
    summary: c.summary,
    topics: c.topics || [],
    entities: c.entities || [],
    events: c.importantEvents || [],
  }));

  if (chunkSummariesList.length > 0) {
    metrics.existingSummaryReuse += chunkSummariesList.length;
  }

  // If no chunks and only a small gap was summarized
  if (chunkSummariesList.length === 0 && gapSummary) {
    const result = {
      chatId,
      rangeLabel,
      timeRange: { startAt, endAt },
      summary: gapSummary.summary || "Summary of recent messages.",
      keyTopics: gapSummary.topics || [],
      decisions: gapSummary.decisions || [],
      tasks: gapSummary.tasks || [],
      pendingItems: [],
      blockers: [],
      peopleInvolved: [],
      deadlines: [],
      recentChanges: "Uncovered messages summarized",
      sourceChunks: [],
      sourceChats: [chatId],
      messageCount: messagesInRange.length,
      confidence: 0.9,
      fromCache: false,
    };

    await setCachedRangeSummary({
      scope: "chat",
      targetId: chatId,
      startAt,
      endAt,
      topic,
      ...result,
    });

    return result;
  }

  // Prompt Gemini for synthesis of multiple chunks
  let synthesized;
  if (!ignoreCooldown && getCooldownStatus().inCooldown) {
    // Fallback synthesis from chunk summaries without Gemini
    synthesized = {
      summary: chunkSummariesList.map((c) => c.summary).join(" "),
      keyTopics: Array.from(new Set(chunkSummariesList.flatMap((c) => c.topics))),
      decisions: chunkSummariesList.flatMap((c) => c.events),
      tasks: [],
      pendingItems: [],
      blockers: [],
      peopleInvolved: Array.from(new Set(chunkSummariesList.flatMap((c) => c.entities))),
      deadlines: [],
    };
  } else {
    metrics.geminiCallsMade++;
    const synthesisPrompt = `You are WAAA's Range Intelligence Summarizer.
Synthesize the following chronologically ordered chunk summaries for the requested time range (${startAt || "earliest"} to ${endAt || "latest"}):

CHUNK SUMMARIES:
${chunkSummariesList
  .map(
    (c) =>
      `[Chunk ${c.index} | ${c.timeRange}]\n- Summary: ${c.summary}\n- Topics: ${c.topics.join(", ") || "None"}\n- Entities: ${c.entities.join(", ") || "None"}\n- Events: ${c.events.join(", ") || "None"}`
  )
  .join("\n\n")}

${gapSummary ? `\nUNCOVERED RECENT ACTIVITY:\n- Summary: ${gapSummary.summary}\n- Topics: ${(gapSummary.topics || []).join(", ")}` : ""}

Respond with strictly valid JSON only:
{
  "summary": "Unified comprehensive summary of the range...",
  "keyTopics": ["topic1", "..."],
  "decisions": ["decision1", "..."],
  "tasks": ["task1", "..."],
  "pendingItems": ["pending1", "..."],
  "blockers": ["blocker1", "..."],
  "peopleInvolved": ["person1", "..."],
  "deadlines": ["deadline1", "..."],
  "recentChanges": "Brief note on progression during this range"
}`;

    const raw = await askAI({
      system: "You synthesize multiple chunk summaries of WhatsApp chats into a unified range summary. Always output valid JSON.",
      prompt: synthesisPrompt,
      maxTokens: 1200,
    });

    synthesized = safeParseJSON(raw) || {
      summary: chunkSummariesList.map((c) => c.summary).join(" "),
      keyTopics: [],
      decisions: [],
      tasks: [],
      pendingItems: [],
      blockers: [],
      peopleInvolved: [],
      deadlines: [],
    };
  }

  const result = {
    chatId,
    rangeLabel,
    timeRange: { startAt, endAt },
    summary: synthesized.summary || "",
    keyTopics: synthesized.keyTopics || [],
    decisions: synthesized.decisions || [],
    tasks: synthesized.tasks || [],
    pendingItems: synthesized.pendingItems || [],
    blockers: synthesized.blockers || [],
    peopleInvolved: synthesized.peopleInvolved || [],
    deadlines: synthesized.deadlines || [],
    recentChanges: synthesized.recentChanges || null,
    sourceChunks: overlappingChunks.map((c) => c.chunkId),
    sourceChats: [chatId],
    messageCount: messagesInRange.length,
    confidence: 0.95,
    fromCache: false,
  };

  // 8. Cache result
  await setCachedRangeSummary({
    scope: "chat",
    targetId: chatId,
    startAt,
    endAt,
    topic,
    ...result,
  });

  return result;
}
