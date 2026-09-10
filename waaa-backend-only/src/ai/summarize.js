import { db } from "../firebase.js";
import { askAI } from "./geminiClient.js";
// Equality-only query (no orderBy alongside it) — same index-safe
// pattern used everywhere else in the API. Sorted in JS after fetch.
async function getRecentMessages(chatId, limit = 60) {
  const snapshot = await db
    .collection("messages")
    .where("chatId", "==", chatId)
    .limit(300)
    .get();

  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
    .slice(-limit);
}

export async function summarizeChat(chatId) {
  const messages = await getRecentMessages(chatId);

  if (messages.length === 0) {
    return { summary: null, messageCount: 0 };
  }

  const transcript = messages
    .map((m) => `${m.sender || "Unknown"}: ${m.text || ""}`)
    .join("\n")
    .slice(0, 12000); // keep prompt size sane

  const summary = await askAI({
    system:
      "You summarize WhatsApp group/chat conversations for someone who hasn't read them. " +
      "Be concise and concrete. Use short bullet points. Call out any deadlines, tasks, decisions, " +
      "or action items by name if present. Do not invent anything not in the transcript.",
    prompt: `Summarize this WhatsApp conversation:\n\n${transcript}`,
    maxTokens: 1500,
  });

  return { summary, messageCount: messages.length };
}

