/*
==============================================================================
WAAA - Per-Chat Summarization                                          Phase 5
==============================================================================

Builds and incrementally updates persistent per-chat summaries from completed
chunk summaries.

ARCHITECTURE & DESIGN PRINCIPLES:
1. Reuses completed chunk summaries from chunkSummaries.json.
   Does NOT re-chunk or send raw message transcripts to Gemini.
2. Incremental rollup:
   old chat summary + new chunk summaries -> updated chat summary.
3. Strict idempotency:
   If 0 new completed chunks exist, ZERO Gemini calls are made.
4. Checkpointing:
   Stores incorporatedChunkIds, lastIncorporatedChunkId, lastMessageId,
   and lastMessageTime to guarantee no duplicate processing or skipped chunks.
5. Tier Gate Protection:
   Only STARRED and IMPORTANT chats are automatically summarized.
   NORMAL, LOW, and IGNORED are skipped.
6. Rate limit & cooldown protection:
   Wraps Gemini calls with global cooldown and per-chat rate gates.
7. Structured information preserved:
   Current topic, important events, decisions, tasks, pending items,
   blockers, people involved, deadlines, recent changes, conversation state.
==============================================================================
*/

import { readCollection, writeCollection } from "../db/localStore.js";
import { loadChunks } from "./chunkSummarizer.js";
import { getIntelligenceTier, meetsTierGate } from "./chatRelevance.js";
import { askAI } from "../ai/geminiClient.js";
import { getCooldownStatus, isPerChatRateLimited, recordPerChatCall } from "../ai/geminiCooldown.js";

const COLLECTION = "chatSummaries";

// In-memory counter for testing and reporting Gemini calls in Phase 5
let sessionGeminiCallCount = 0;

export function getSessionGeminiCallCount() {
  return sessionGeminiCallCount;
}

export function resetSessionGeminiCallCount() {
  sessionGeminiCallCount = 0;
}

// ── Storage Operations ────────────────────────────────────────────────────────

/**
 * Load all per-chat summaries.
 */
export async function loadChatSummaries() {
  return readCollection(COLLECTION);
}

/**
 * Save all per-chat summaries.
 */
async function saveChatSummaries(summaries) {
  return writeCollection(COLLECTION, summaries);
}

/**
 * Get summary for a specific chat.
 */
export async function getChatSummary(chatId) {
  const summaries = await loadChatSummaries();
  return summaries.find((s) => s.chatId === chatId) || null;
}

// ── Helper: Safe JSON Parser ──────────────────────────────────────────────────

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

// ── Incremental Per-Chat Summarizer ───────────────────────────────────────────

/**
 * Updates the per-chat summary for a specific chat using only NEW completed chunks.
 *
 * @param {string} chatId
 * @param {object} options
 * @param {boolean} options.ignoreTierGate - If true, bypasses tier check (for manual triggers)
 * @param {boolean} options.force - If true, re-summarizes from all available completed chunks
 * @returns {Promise<{ updated: boolean, reason?: string, summary?: object }>}
 */
export async function updateChatSummary(chatId, options = {}) {
  const { ignoreTierGate = false, force = false, ignoreRateLimit = false } = options;

  // 1. Tier gate verification
  if (!ignoreTierGate) {
    const tierMeta = await getIntelligenceTier(chatId);
    if (!meetsTierGate(tierMeta.tier, "BATCH_SUMMARIZATION")) {
      return {
        updated: false,
        reason: `Chat tier "${tierMeta.tier}" is not eligible for automatic summarization (requires STARRED or IMPORTANT)`,
      };
    }
  }

  // 2. Load existing chat summary and completed chunks
  const [allSummaries, allChunks] = await Promise.all([
    loadChatSummaries(),
    loadChunks(),
  ]);

  let existing = allSummaries.find((s) => s.chatId === chatId);

  // Filter chunks for this chat that HAVE completed summaries
  const chatCompletedChunks = allChunks
    .filter((c) => c.chatId === chatId && c.summary && c.summary.trim().length > 0)
    .sort((a, b) => new Date(a.firstMessageTime).getTime() - new Date(b.firstMessageTime).getTime());

  if (chatCompletedChunks.length === 0) {
    return {
      updated: false,
      reason: "No completed chunk summaries available for this chat yet",
    };
  }

  // 3. Determine newly completed chunks to incorporate
  const alreadyIncorporated = new Set(force ? [] : (existing?.incorporatedChunkIds || []));
  const newChunks = chatCompletedChunks.filter((c) => !alreadyIncorporated.has(c.chunkId));

  // IDEMPOTENCY CHECK: If no new chunks, zero Gemini calls!
  if (newChunks.length === 0) {
    return {
      updated: false,
      reason: "All available chunk summaries are already incorporated (0 new chunks)",
      summary: existing,
    };
  }

  // 4. Rate-limiting & cooldown check before calling Gemini
  const cooldownStatus = getCooldownStatus();
  if (cooldownStatus.inCooldown) {
    return {
      updated: false,
      reason: `Gemini is currently in cooldown (${Math.round(cooldownStatus.remainingMs / 1000)}s remaining)`,
    };
  }

  if (!ignoreRateLimit && isPerChatRateLimited(chatId)) {
    return {
      updated: false,
      reason: "Per-chat rate limit active for this chat (wait cooldown)",
    };
  }

  // 5. Construct Rollup Prompt
  let prompt = "";
  if (existing && !force) {
    prompt = `You are incrementally updating an ongoing per-chat intelligence summary for a WhatsApp conversation.

CURRENT CHAT STATE (Prior Summary):
- Summary: ${existing.summary || "None"}
- Current Topic: ${existing.currentTopic || "Unknown"}
- Ongoing Important Events: ${JSON.stringify(existing.importantEvents || [])}
- Active Decisions: ${JSON.stringify(existing.decisions || [])}
- Active Tasks/Actions: ${JSON.stringify(existing.tasks || [])}
- Pending Items: ${JSON.stringify(existing.pendingItems || [])}
- Blockers: ${JSON.stringify(existing.blockers || [])}
- People Involved: ${JSON.stringify(existing.peopleInvolved || [])}
- Deadlines: ${JSON.stringify(existing.deadlines || [])}
- Conversation State: ${existing.conversationState || "ACTIVE"}

NEW CHUNK SUMMARIES TO MERGE (in chronological order):
${newChunks
  .map(
    (c, idx) => `
[Chunk ${idx + 1} (${c.firstMessageTime} to ${c.lastMessageTime})]
- Chunk Summary: ${c.summary}
- Topics: ${(c.topics || []).join(", ") || "None"}
- Entities: ${(c.entities || []).join(", ") || "None"}
- Important Events: ${(c.importantEvents || []).join(", ") || "None"}
`
  )
  .join("\n")}

INSTRUCTIONS:
Merge the new chunk information into the current chat state.
- Update the overall summary to reflect the full conversation arc accurately and concisely.
- Update the current topic.
- Keep ongoing active tasks, decisions, and blockers. If a pending item or task was resolved in the new chunks, remove it or mark resolved.
- Track people involved, deadlines, and recent changes.
- Conversation state must be one of: "ACTIVE", "IDLE", "RESOLVED", "BLOCKED", "WAITING".
- If any information is uncertain, represent that uncertainty rather than making confident false claims.

Respond with strictly valid JSON only (no markdown code fences, no commentary) matching this schema:
{
  "summary": "Comprehensive updated summary...",
  "currentTopic": "Current focus topic...",
  "importantEvents": ["event 1", "..."],
  "decisions": ["decision 1", "..."],
  "tasks": ["task 1", "..."],
  "pendingItems": ["pending 1", "..."],
  "blockers": ["blocker 1", "..."],
  "peopleInvolved": ["person 1", "..."],
  "deadlines": ["deadline 1", "..."],
  "recentChanges": "Brief note on what changed in latest chunks...",
  "conversationState": "ACTIVE",
  "confidence": 0.95
}`;
  } else {
    prompt = `You are generating the initial per-chat intelligence summary for a WhatsApp conversation from completed chunk summaries.

CHUNK SUMMARIES (in chronological order):
${newChunks
  .map(
    (c, idx) => `
[Chunk ${idx + 1} (${c.firstMessageTime} to ${c.lastMessageTime})]
- Chunk Summary: ${c.summary}
- Topics: ${(c.topics || []).join(", ") || "None"}
- Entities: ${(c.entities || []).join(", ") || "None"}
- Important Events: ${(c.importantEvents || []).join(", ") || "None"}
`
  )
  .join("\n")}

INSTRUCTIONS:
Synthesize all chunk summaries into a structured, unified chat summary.
- Provide a concise yet thorough overall summary.
- Identify the current active topic.
- Extract important events, decisions, tasks/actions, pending items, blockers, people involved, and deadlines.
- Set conversation state to one of: "ACTIVE", "IDLE", "RESOLVED", "BLOCKED", "WAITING".
- If something is uncertain, represent that uncertainty honestly.

Respond with strictly valid JSON only matching this schema:
{
  "summary": "Initial comprehensive summary...",
  "currentTopic": "Main or current topic...",
  "importantEvents": ["event 1", "..."],
  "decisions": ["decision 1", "..."],
  "tasks": ["task 1", "..."],
  "pendingItems": ["pending 1", "..."],
  "blockers": ["blocker 1", "..."],
  "peopleInvolved": ["person 1", "..."],
  "deadlines": ["deadline 1", "..."],
  "recentChanges": "Initial summary created",
  "conversationState": "ACTIVE",
  "confidence": 0.95
}`;
  }

  // 6. Execute Gemini Call
  sessionGeminiCallCount++;
  const rawResponse = await askAI({
    system:
      "You are WAAA's per-chat intelligence summarizer. You synthesize chunk summaries into a coherent, structured, incremental chat record. Always output strictly valid JSON.",
    prompt,
    maxTokens: 1400,
  });

  const parsed = safeParseJSON(rawResponse);
  if (!parsed || typeof parsed.summary !== "string") {
    throw new Error("Failed to parse valid structured JSON from Gemini response");
  }

  // Record rate limit
  recordPerChatCall(chatId);

  // 7. Assemble Updated Summary Record with checkpoints
  const tierMeta = await getIntelligenceTier(chatId);
  const now = new Date().toISOString();

  const newlyIncorporatedIds = newChunks.map((c) => c.chunkId);
  const combinedChunkIds = force
    ? newlyIncorporatedIds
    : Array.from(new Set([...(existing?.incorporatedChunkIds || []), ...newlyIncorporatedIds]));

  const latestChunk = newChunks[newChunks.length - 1];

  const updatedRecord = {
    chatId,
    chatName: tierMeta?.chatName || chatId,
    tier: tierMeta?.tier || "unknown",
    summary: parsed.summary || "",
    currentTopic: parsed.currentTopic || "General",
    importantEvents: Array.isArray(parsed.importantEvents) ? parsed.importantEvents : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    pendingItems: Array.isArray(parsed.pendingItems) ? parsed.pendingItems : [],
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
    peopleInvolved: Array.isArray(parsed.peopleInvolved) ? parsed.peopleInvolved : [],
    deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : [],
    recentChanges: parsed.recentChanges || "Updated with new chunks",
    conversationState: parsed.conversationState || "ACTIVE",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
    lastMessageId: latestChunk.lastMessageId || existing?.lastMessageId || null,
    lastMessageTime: latestChunk.lastMessageTime || existing?.lastMessageTime || null,
    lastIncorporatedChunkId: latestChunk.chunkId,
    incorporatedChunkIds: combinedChunkIds,
    totalChunksIncorporated: combinedChunkIds.length,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // 8. Save updated list
  const existingIdx = allSummaries.findIndex((s) => s.chatId === chatId);
  if (existingIdx >= 0) {
    allSummaries[existingIdx] = updatedRecord;
  } else {
    allSummaries.push(updatedRecord);
  }

  await saveChatSummaries(allSummaries);

  return {
    updated: true,
    newChunksIncorporated: newChunks.length,
    summary: updatedRecord,
  };
}

// ── Batch Process All Eligible Chats ──────────────────────────────────────────

/**
 * Processes all eligible chats (STARRED and IMPORTANT) and incrementally
 * updates their per-chat summaries if new completed chunks exist.
 */
export async function updateAllEligibleChatSummaries() {
  const { classifyAllChats } = await import("./chatRelevance.js");
  const classified = await classifyAllChats();

  const eligibleChats = classified.filter((c) =>
    meetsTierGate(c.tier, "BATCH_SUMMARIZATION")
  );

  const results = {
    totalEligible: eligibleChats.length,
    updated: 0,
    skippedNoNewChunks: 0,
    skippedCooldownOrRateLimit: 0,
    errors: [],
    geminiCalls: 0,
  };

  const startCalls = sessionGeminiCallCount;

  for (const chat of eligibleChats) {
    try {
      const res = await updateChatSummary(chat.chatId);
      if (res.updated) {
        results.updated++;
      } else {
        if (res.reason?.includes("cooldown") || res.reason?.includes("rate limit")) {
          results.skippedCooldownOrRateLimit++;
        } else {
          results.skippedNoNewChunks++;
        }
      }
    } catch (err) {
      results.errors.push(`Chat ${chat.chatId}: ${err.message}`);
    }
  }

  results.geminiCalls = sessionGeminiCallCount - startCalls;
  return results;
}
