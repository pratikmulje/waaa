import { db } from "../firebase.js";
import { askAI } from "./geminiClient.js";
import { isEligibleForSmartReply, SMART_REPLY_MODES } from "../intelligence/smartReplyFilter.js";
async function getMessageWithContext(messageId) {
  const doc = await db.collection("messages").doc(messageId).get();
  if (!doc.exists) return null;

  const target = { id: doc.id, ...doc.data() };

  // A little surrounding context helps draft quality — same
  // equality-only, index-safe query pattern as everywhere else.
  const snapshot = await db
    .collection("messages")
    .where("chatId", "==", target.chatId)
    .limit(300)
    .get();

  const context = snapshot.docs
    .map((d) => d.data())
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
    .slice(-8);

  return { target, context };
}

export async function generateDraftReplies(messageId, options = {}) {
  const mode = options.mode || SMART_REPLY_MODES.SMART;
  const found = await getMessageWithContext(messageId);
  if (!found) return null;

  const { target, context } = found;

  // Local eligibility check (0 Gemini)
  const eligibility = isEligibleForSmartReply(target.text, mode);
  if (!eligibility.eligible) {
    return {
      messageId,
      skipped: true,
      reason: eligibility.reason,
      replies: [],
    };
  }

  const transcript = context
    .map((m) => `${m.sender || "Unknown"}: ${m.text || ""}`)
    .join("\n")
    .slice(0, 6000);

  const raw = await askAI({
    system:
      "You draft short WhatsApp reply suggestions. Given recent conversation context and one message " +
      "that needs a reply, propose exactly 3 short, distinct reply options in the same tone as the " +
      "conversation. Return ONLY a JSON array of exactly 3 strings.",

    prompt:
      `Recent conversation:\n${transcript}\n\n` +
      `Message needing a reply (from ${target.sender}):\n"${target.text}"\n\n` +
      `Give 3 short reply options as a JSON array of strings.`,

    maxTokens: 800,

    json: true,
  });

  let replies;
  try {
    replies = JSON.parse(raw);
  } catch {
    // Model didn't return clean JSON — fall back to splitting lines
    // rather than failing outright.
    replies = raw
      .split("\n")
      .map((l) => l.replace(/^[-\d.\s"]+/, "").replace(/"$/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return { messageId, replies: Array.isArray(replies) ? replies.slice(0, 3) : [] };
}
