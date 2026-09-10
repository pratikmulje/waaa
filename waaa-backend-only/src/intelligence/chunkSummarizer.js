/*
==============================================================================
WAAA - Incremental Chunk Summarization                                Phase 4
==============================================================================

Builds persistent, incremental conversational chunks from WhatsApp chats.
Chunks act as the atomic units for global intelligence, memory, and actions.

CRITICAL DESIGN RULES:
1. Deterministic boundaries: split at MAX_MESSAGES (20) or MAX_TIME_GAP (4h).
2. Idempotency: The builder only looks at messages AFTER the last sealed chunk.
3. Sealing: A chunk is only "sealed" (and saved) if it reaches 20 msgs or is
   followed by a 4-hour gap. The trailing open conversation is ignored until
   the conversation naturally pauses or hits the limit.
4. Intelligence Tiers: Only STARRED and IMPORTANT chats are eligible.
5. Gemini Safety: Does not automatically blast Gemini. Chunk building is
   separate from chunk summarization.
==============================================================================
*/

import { readCollection, writeCollection, genId } from "../db/localStore.js";
import { getIntelligenceTier, meetsTierGate, TIERS } from "./chatRelevance.js";
import { askAI } from "../ai/geminiClient.js";
import { getCooldownStatus, isPerChatRateLimited, recordPerChatCall } from "../ai/geminiCooldown.js";

const COLLECTION = "chunkSummaries";
const MAX_CHUNK_SIZE = 20;
const MAX_TIME_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

function toMillis(m) {
  if (m.receivedAt) return new Date(m.receivedAt).getTime();
  if (m.createdAt?.iso) return new Date(m.createdAt.iso).getTime();
  return 0;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function loadChunks() {
  return readCollection(COLLECTION);
}

async function saveChunks(chunks) {
  return writeCollection(COLLECTION, chunks);
}

// ── Chunk Building ────────────────────────────────────────────────────────────

/**
 * Builds and seals new chunks for a specific chat.
 * Idempotent: only processes messages after the last sealed chunk's end time.
 * @param {string} chatId
 * @returns {Promise<{ createdCount: number }>}
 */
export async function buildChunksForChat(chatId) {
  const { readCollection: rc } = await import("../db/localStore.js");
  const [messages, chunks] = await Promise.all([rc("messages"), loadChunks()]);

  const chatChunks = chunks.filter((c) => c.chatId === chatId);
  
  // Find high watermark (time of the last message in the last sealed chunk)
  let highWatermark = 0;
  for (const c of chatChunks) {
    const chunkEndTime = new Date(c.lastMessageTime).getTime();
    if (chunkEndTime > highWatermark) {
      highWatermark = chunkEndTime;
    }
  }

  // Get new messages, sorted chronologically
  const chatMsgs = messages
    .filter((m) => m.chatId === chatId && toMillis(m) > highWatermark)
    .sort((a, b) => toMillis(a) - toMillis(b));

  if (chatMsgs.length === 0) return { createdCount: 0 };

  let createdCount = 0;
  let currentGroup = [];
  let lastTime = 0;

  for (let i = 0; i < chatMsgs.length; i++) {
    const msg = chatMsgs[i];
    const time = toMillis(msg);

    if (currentGroup.length > 0) {
      const gap = time - lastTime;
      // If gap is large, the CURRENT group is complete.
      if (gap > MAX_TIME_GAP_MS) {
        chunks.push(sealChunk(chatId, currentGroup));
        createdCount++;
        currentGroup = [];
      } else if (currentGroup.length >= MAX_CHUNK_SIZE) {
        // Limit reached, seal it.
        chunks.push(sealChunk(chatId, currentGroup));
        createdCount++;
        currentGroup = [];
      }
    }

    currentGroup.push(msg);
    lastTime = time;
  }

  // If there are leftover messages, we ONLY seal them if they have been idle for > 4 hours.
  // Otherwise, we leave them unsealed so next time we can append to them.
  if (currentGroup.length > 0) {
    const timeSinceLastMsg = Date.now() - lastTime;
    if (timeSinceLastMsg > MAX_TIME_GAP_MS) {
      chunks.push(sealChunk(chatId, currentGroup));
      createdCount++;
    }
  }

  if (createdCount > 0) {
    await saveChunks(chunks);
  }

  return { createdCount };
}

function sealChunk(chatId, messages) {
  const now = new Date().toISOString();
  return {
    chunkId: "chunk_" + genId(),
    chatId,
    messageIds: messages.map((m) => m.messageId).filter(Boolean),
    firstMessageId: messages[0].messageId,
    lastMessageId: messages[messages.length - 1].messageId,
    firstMessageTime: new Date(toMillis(messages[0])).toISOString(),
    lastMessageTime: new Date(toMillis(messages[messages.length - 1])).toISOString(),
    messageCount: messages.length,
    summary: null,         // Null indicates pending Gemini summary
    topics: [],
    entities: [],
    importantEvents: [],
    createdAt: now,
    updatedAt: now,
    _rawTranscript: buildTranscript(messages), // Cached for the summarize step, can be dropped later to save space
  };
}

function buildTranscript(messages) {
  return messages.map((m) => `[${m.sender || "Unknown"}]: ${m.text || ""}`).join("\n");
}

/**
 * Global batch job to build chunks for all eligible chats.
 */
export async function buildAllPendingChunks() {
  const { classifyAllChats } = await import("./chatRelevance.js");
  const classified = await classifyAllChats();
  
  // Only process STARRED and IMPORTANT
  const eligibleChats = classified.filter((c) =>
    meetsTierGate(c.tier, "BATCH_SUMMARIZATION")
  );

  let totalCreated = 0;
  for (const chat of eligibleChats) {
    const { createdCount } = await buildChunksForChat(chat.chatId);
    totalCreated += createdCount;
  }

  return { eligibleChats: eligibleChats.length, chunksCreated: totalCreated };
}

// ── Chunk Summarization (Gemini) ──────────────────────────────────────────────

/**
 * Summarizes a single chunk using Gemini.
 */
export async function summarizeChunk(chunkId) {
  const chunks = await loadChunks();
  const chunkIndex = chunks.findIndex((c) => c.chunkId === chunkId);
  
  if (chunkIndex === -1) throw new Error("Chunk not found");
  const chunk = chunks[chunkIndex];
  
  if (chunk.summary) return chunk; // Already summarized

  // Respect global cooldown
  if (getCooldownStatus().inCooldown) {
    throw new Error("Gemini is in cooldown");
  }

  // Respect per-chat rate limit
  if (isPerChatRateLimited(chunk.chatId)) {
    throw new Error("Per-chat rate limit active");
  }

  const prompt = `Summarize this segment of a WhatsApp conversation incrementally.
Be concise. Extract:
1. A short summary paragraph.
2. Key topics discussed.
3. Entities (people, places, projects) mentioned.
4. Any decisions, tasks, or important events.

Conversation transcript:
${chunk._rawTranscript || "(empty)"}

Respond with strictly valid JSON matching this schema:
{
  "summary": "String...",
  "topics": ["String..."],
  "entities": ["String..."],
  "importantEvents": ["String..."]
}`;

  const raw = await askAI({
    system: "You are an AI assistant that summarizes chunked WhatsApp conversations into structured JSON. Always output valid JSON.",
    prompt,
    maxTokens: 1000,
  });

  let parsed;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch (err) {
    throw new Error("Failed to parse Gemini output as JSON: " + err.message);
  }

  recordPerChatCall(chunk.chatId);

  chunk.summary = parsed.summary || "";
  chunk.topics = parsed.topics || [];
  chunk.entities = parsed.entities || [];
  chunk.importantEvents = parsed.importantEvents || [];
  chunk.updatedAt = new Date().toISOString();
  
  // Free up space since we don't need the raw text anymore
  delete chunk._rawTranscript;

  chunks[chunkIndex] = chunk;
  await saveChunks(chunks);

  return chunk;
}

/**
 * Summarizes up to `limit` unsummarized chunks globally.
 */
export async function summarizePendingChunks(limit = 5) {
  const chunks = await loadChunks();
  const pending = chunks.filter((c) => c.summary === null);
  
  const results = { successful: 0, failed: 0, skipped: 0, errors: [] };

  for (let i = 0; i < Math.min(pending.length, limit); i++) {
    const c = pending[i];
    
    if (getCooldownStatus().inCooldown || isPerChatRateLimited(c.chatId)) {
      results.skipped++;
      continue;
    }

    try {
      await summarizeChunk(c.chunkId);
      results.successful++;
    } catch (err) {
      results.failed++;
      results.errors.push(`Chunk ${c.chunkId}: ${err.message}`);
      if (err.message.includes("cooldown") || err.message.includes("quota")) {
        break; // Stop processing if quota hit
      }
    }
  }

  return results;
}
