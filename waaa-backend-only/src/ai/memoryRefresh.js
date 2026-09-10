import { askAI } from "./geminiClient.js";
import { getChatMemory, updateChatMemoryFromGemini } from "./chatMemory.js";
import { isInCooldown, isQuotaError, triggerCooldown } from "./geminiCooldown.js";

const MIN_QUEUED_MESSAGES = 5;
const MAX_QUEUED_MESSAGES = 12;
const EAGER_FLUSH_THRESHOLD = 8;   // flush a chat immediately if it hits this
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const queues = new Map();

export function queueForMemoryReview(chatId, sender, text) {
  if (!text || text.trim().length < 15) return;

  const q = queues.get(chatId) || [];

  // Deduplicate: skip if the last queued message from same sender is identical
  const last = q[q.length - 1];
  if (last && last.sender === sender && last.text === text) return;

  q.push({ sender, text });

  if (q.length > MAX_QUEUED_MESSAGES) {
    q.shift();
  }

  queues.set(chatId, q);
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

function buildBatchPrompt(memory, batch) {
  const topicsStr = memory.activeTopics.length
    ? memory.activeTopics.map((t) => t.topic).join(", ")
    : "(none yet)";

  const entitiesStr = Object.keys(memory.entities).length
    ? Object.keys(memory.entities).join(", ")
    : "(none yet)";

  const pendingStr = memory.pending.length
    ? memory.pending.map((p) => p.what).join("; ")
    : "(none)";

  const batchStr = batch.map((m) => `${m.sender}: ${m.text}`).join("\n");

  return (
    `EXISTING CHAT MEMORY:\n` +
    `Topics: ${topicsStr}\nEntities: ${entitiesStr}\nPending: ${pendingStr}\n` +
    (memory.recentSummary ? `Summary: ${memory.recentSummary}\n` : "") +
    `\nNEW MESSAGES SINCE LAST REVIEW (may mix English/Hinglish/Roman Hindi-Marathi):\n${batchStr}\n\n` +
    `Extract what's worth remembering long-term from these messages, merging with the existing memory ` +
    `(don't repeat what's already known unless it changed). Respond with ONLY a JSON object:\n` +
    `{"topics": ["..."], "entities": ["..."], "pendingResolved": "<string or null>", ` +
    `"newPending": "<string or null>", "contextSummary": "<1-2 sentence updated summary>", ` +
    `"confidence": <0-1>}`
  );
}

async function reviewChat(chatId, batch) {
  const memory = await getChatMemory(chatId);
  const prompt = buildBatchPrompt(memory, batch);

  const raw = await askAI({
    system:
      "You extract durable facts (topics, entities, plans, pending items) from a batch of WhatsApp " +
      "messages, which may mix English, Hinglish, and Roman-script Hindi/Marathi. You are building " +
      "long-term memory for a chat, not judging any single message's importance. Be conservative — " +
      "only extract things likely to matter again later.",
    prompt,
    maxTokens: 500,
  });

  const parsed = safeParseJSON(raw);
  if (!parsed) throw new Error("Unparseable memory-review response");

  await updateChatMemoryFromGemini(chatId, memory, parsed);
  console.log(
    `[Memory Refresh] Updated memory for ${chatId} from ${batch.length} queued messages`
  );
}

export function startMemoryRefreshTimer() {
  setInterval(async () => {
    if (isInCooldown()) return;

    for (const [chatId, batch] of queues.entries()) {
      // Eager flush: process immediately if queue is large (busy chat)
      // Normal flush: process at minimum threshold
      const shouldFlush =
        batch.length >= EAGER_FLUSH_THRESHOLD ||
        batch.length >= MIN_QUEUED_MESSAGES;

      if (!shouldFlush) continue;

      try {
        await reviewChat(chatId, batch);
        queues.set(chatId, []);
      } catch (error) {
        console.error(`[Memory Refresh] Failed for ${chatId}:`, error.message);

        if (isQuotaError(error)) {
          triggerCooldown(`memory refresh: ${error.message}`);
          break;
        }
      }
    }
  }, SWEEP_INTERVAL_MS);

  console.log(
    `[Memory Refresh] Batched memory-review timer started (every ${SWEEP_INTERVAL_MS / 60000} min, eager flush at ${EAGER_FLUSH_THRESHOLD} messages)`
  );
}


export function getQueueSizes() {
  return Object.fromEntries(
    [...queues.entries()].map(([chatId, q]) => [chatId, q.length])
  );
}