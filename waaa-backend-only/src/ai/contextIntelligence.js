import { db } from "../firebase.js";
import { askAI } from "./geminiClient.js";
import { updateChatMemoryFromGemini, memoryMatchesText } from "./chatMemory.js";

const TRIVIAL_PATTERN =
  /^(ok|okay|k|kk|yes|no|haan|nahi|hmm|thanks|thank you|thnx|👍|🙏|😊|✅|😂|😅)$/i;

export function shouldCallGemini({ text, ruleScore }, memory) {
  if (!text || text.trim().length < 6) return false;
  if (TRIVIAL_PATTERN.test(text.trim())) return false;
  if (memoryMatchesText(memory, text)) return true;
  if (ruleScore > 0 && ruleScore < 70) return true;
  if (ruleScore === 0 && text.trim().length >= 40) return true;
  return false;
}

async function getRecentMessages(chatId, limit = 6) {
  const snapshot = await db
    .collection("messages")
    .where("chatId", "==", chatId)
    .limit(300)
    .get();

  return snapshot.docs
    .map((doc) => doc.data())
    .sort(
      (a, b) =>
        (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    )
    .slice(-limit);
}

function buildPrompt(memory, recentMessages, newText) {
  const topicsStr = memory.activeTopics.length
    ? memory.activeTopics.map((t) => t.topic).join(", ")
    : "(none yet)";

  const entitiesStr = Object.keys(memory.entities).length
    ? Object.keys(memory.entities).join(", ")
    : "(none yet)";

  const pendingStr = memory.pending.length
    ? memory.pending.map((p) => p.what).join("; ")
    : "(none)";

  const recentStr = recentMessages
    .map((m) => `${m.sender || "?"}: ${m.text || ""}`)
    .join("\n");

  return (
    `CHAT CONTEXT:\n` +
    `Active topics: ${topicsStr}\n` +
    `Known entities: ${entitiesStr}\n` +
    `Pending/unresolved: ${pendingStr}\n` +
    (memory.recentSummary ? `Recent summary: ${memory.recentSummary}\n` : "") +
    `\nRECENT MESSAGES (most recent last):\n${recentStr || "(none yet)"}\n\n` +
    `NEW MESSAGE:\n"${newText}"\n\n` +
    `Analyze the NEW MESSAGE in light of the chat context above. The chat may mix ` +
    `English, Hinglish, and Roman-script Hindi/Marathi — reason about meaning, not ` +
    `just keywords. Respond with ONLY a JSON object (no markdown, no text outside ` +
    `the JSON) matching exactly this shape:\n` +
    `{"importanceScore": <0-100>, "importanceLevel": "normal|low|high|critical", ` +
    `"reason": "<short string>", "entities": ["..."], "topics": ["..."], ` +
    `"updatesPreviousPlan": <true|false>, "pendingResolved": "<string or null>", ` +
    `"newPending": "<string or null>", "deadline": {"when": "<string>"} or null, ` +
    `"actionRequired": <true|false>, "action": "<string or null>", ` +
    `"consequence": "<string or null>", ` +
    `"contextSummary": "<1-2 sentence updated summary of this chat's current state>", ` +
    `"confidence": <0-1>}`
  );
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

export async function analyzeWithContext(chatId, text, memory) {
  const recentMessages = await getRecentMessages(chatId);
  const prompt = buildPrompt(memory, recentMessages, text);

  const raw = await askAI({
    system:
      "You are WAAA's context-aware importance analyzer for WhatsApp messages, which " +
      "are often Hinglish (Hindi/Marathi written in Roman script mixed with English) " +
      "or informal/short. Judge the NEW MESSAGE's importance specifically in light of " +
      "the chat's ongoing context — a message that resolves a pending item, updates a " +
      "plan, or relates to a known entity/topic is more important than the same words " +
      "would be in isolation. Never invent context that wasn't given to you.",
    prompt,
    maxTokens: 700,
  });

  const parsed = safeParseJSON(raw);

  if (!parsed || typeof parsed.importanceScore !== "number") {
    throw new Error("Gemini returned an unparseable or incomplete response");
  }

  const updatedMemory = await updateChatMemoryFromGemini(chatId, memory, parsed);

  return { gemini: parsed, memory: updatedMemory };
}