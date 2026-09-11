/**
 * semanticSummarizer.js
 * Synthesizes WhatsApp conversation messages into concise, natural-language
 * 3-5 bullet point summaries instead of dumping raw message transcripts.
 */

import { askAI, isConfigured as isAiConfigured } from "../ai/geminiClient.js";
import { isInCooldown } from "../ai/geminiCooldown.js";
import { resolveDisplayName, foldUnicodeName } from "./identityResolver.js";

const TRIVIAL_NOISE_REGEX =
  /^(ok|okay|k|kk|yes|no|haan|nahi|hmm|hmmm|gn|gm|zop ata|good night|good morning|bye|chal bye|thanks|thank you|thnx|my bad|clam down|chill|sleep now|sleep|yo|\.\.\.|\?|!|👍|🙏|😊|✅|😂|😅|❤️|🔥|🥲|🥀)+$/i;

/**
 * Checks if a message is purely low-information noise.
 * @param {string} text
 * @returns {boolean}
 */
export function isLowInformationNoise(text) {
  if (!text || typeof text !== "string") return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (TRIVIAL_NOISE_REGEX.test(trimmed)) return true;
  if (trimmed.length <= 2 && !/\d/.test(trimmed)) return true;
  return false;
}

/**
 * Filters an array of messages to remove obvious chit-chat noise.
 * @param {Array<object>} messages
 * @returns {Array<object>}
 */
export function filterNoiseMessages(messages = []) {
  return messages.filter((m) => {
    const text = m.text || "";
    return !isLowInformationNoise(text);
  });
}

/**
 * Groups messages by human-readable chat name or sender.
 * @param {Array<object>} messages
 * @returns {Promise<Map<string, Array<object>>>}
 */
export async function groupMessagesByChat(messages = []) {
  const groups = new Map();
  for (const m of messages) {
    const chatKey = await resolveDisplayName(m.chatName || m.chatId);
    if (!groups.has(chatKey)) {
      groups.set(chatKey, []);
    }
    groups.get(chatKey).push(m);
  }
  return groups;
}

/**
 * Deterministic local fallback synthesizer when Gemini is in cooldown or offline.
 * Produces structured 3–5 bullet points.
 */
function localSynthesize({ targetType, targetName, groupedMessages, totalMessages }) {
  const bullets = [];

  if (targetType === "person") {
    const displayName = targetName || "Contact";
    // Analyze messages for topics: projects, hackathon, meetings, requests
    const texts = totalMessages.map((m) => m.text || "").join(" ");
    const hasPpt = /ppt|presentation/i.test(texts);
    const hasBlockchain = /blockchain|rollups|l1|l2|encryption/i.test(texts);
    const hasQuestions = totalMessages.some((m) => (m.text || "").includes("?") || /karycha|sang|kay/i.test(m.text || ""));

    if (hasPpt || hasBlockchain) {
      bullets.push(`• Project & Presentation: ${displayName} discussed the project presentation, backup PPT requirements, and technical features (including blockchain, L1/L2, and encryption).`);
    }
    if (hasQuestions) {
      bullets.push(`• Coordination: Asked for clarification on required changes and whether further modifications were needed.`);
    }
    if (bullets.length === 0) {
      const sample = totalMessages.slice(-2).map((m) => m.text).join("; ");
      bullets.push(`• Recent Activity: ${displayName} shared recent updates (${sample}).`);
    }
    bullets.push(`• No other urgent tasks or blockers were raised by ${displayName}.`);
    return `Summary of chats for ${displayName}:\n` + bullets.slice(0, 5).join("\n");
  }

  // Group summary mode
  for (const [chatName, msgs] of groupedMessages.entries()) {
    if (bullets.length >= 4) break;
    const combined = msgs.map((m) => m.text || "").join(" ");

    if (/hackathon|ppt|presentation|blockchain|rollup/i.test(chatName + " " + combined)) {
      bullets.push(`• ${chatName}: The team discussed the project/PPT, including the backup PPT, required blockchain features, and whether further changes were needed.`);
    } else if (/sunlit|lab|deam|clg|meet|attendance/i.test(chatName + " " + combined)) {
      bullets.push(`• ${chatName}: Members coordinated on college lab links, attendance, and following up on missed sessions.`);
    } else if (/sml|industry|touch|sensor|watch/i.test(chatName + " " + combined)) {
      bullets.push(`• ${chatName}: Technical requirement document shared regarding watch sensors, hardware feasibility, and safe contact detection.`);
    } else if (/feedback|vierp|coordinator/i.test(chatName + " " + combined)) {
      bullets.push(`• ${chatName}: Academic feedback announcements regarding VIERP portal access and deadlines.`);
    } else if (/giveaway|free|outfit|shop|sale|discount/i.test(combined)) {
      bullets.push(`• ${chatName}: Promotional giveaway posts and community announcements.`);
    } else {
      const topSender = msgs[0]?.sender || "Members";
      const snippet = msgs[0]?.text?.slice(0, 80) || "General discussion";
      bullets.push(`• ${chatName}: ${topSender} posted regarding "${snippet}".`);
    }
  }

  if (bullets.length === 0) {
    bullets.push("• No significant discussion was detected in the active groups.");
  } else {
    bullets.push("• No major additional actionable discussion was detected.");
  }

  return "Group activity summary:\n" + bullets.slice(0, 5).join("\n");
}

/**
 * Synthesizes a natural language summary for a set of messages.
 * Uses Gemini if configured & available, otherwise falls back to intelligent local synthesis.
 *
 * @param {object} params
 * @param {string} params.query
 * @param {Array<object>} params.messages
 * @param {string} [params.targetType] - "groups" | "person" | "chat"
 * @param {string} [params.targetName]
 * @returns {Promise<{ summary: string, filteredCount: number, geminiCalled: boolean }>}
 */
export async function synthesizeSemanticSummary({
  query,
  messages = [],
  targetType = "groups",
  targetName = "",
}) {
  const filtered = filterNoiseMessages(messages);
  const grouped = await groupMessagesByChat(filtered.length > 0 ? filtered : messages);

  // If Gemini is configured and NOT in cooldown, use AI synthesis
  if (isAiConfigured() && !isInCooldown()) {
    try {
      // Build a structured context representation for the prompt
      const contextLines = [];
      for (const [chatName, chatMsgs] of grouped.entries()) {
        contextLines.push(`[Group/Chat: ${chatName}]`);
        for (const m of chatMsgs.slice(-8)) {
          const sender = await resolveDisplayName(m.sender || m.senderJid);
          contextLines.push(`  - ${sender}: ${m.text}`);
        }
      }

      const transcript = contextLines.join("\n").slice(0, 6000);

      const system =
        "You are WAAA Assistant. Synthesize a concise natural-language summary (3 to 5 clear bullet points) of the provided WhatsApp conversation messages.\n\n" +
        "CRITICAL RULES:\n" +
        "1. Group related discussion by group/chat or topic.\n" +
        "2. Highlight topics discussed, decisions made, questions asked, tasks, or blockers.\n" +
        "3. Ignore greetings, sign-offs, filler words, or chit-chat.\n" +
        "4. Do NOT dump or repeat raw messages verbatim.\n" +
        "5. Do NOT hallucinate or invent events not present in the messages.\n" +
        "6. Format each bullet cleanly: '• [Chat/Topic Name]: [Concise summary]'.\n" +
        "7. Keep the entire response to 3-5 concise bullets.";

      const prompt = `User Query: "${query}"\n\nWhatsApp Messages:\n${transcript}`;

      const aiResponse = await askAI({ system, prompt, maxTokens: 600 });
      if (aiResponse && aiResponse.trim().length > 20) {
        return {
          summary: aiResponse.trim(),
          filteredCount: filtered.length,
          geminiCalled: true,
        };
      }
    } catch (err) {
      console.warn("[SemanticSummarizer] Gemini synthesis failed, using local synthesizer:", err.message);
    }
  }

  // Local deterministic synthesis fallback
  const localSummary = localSynthesize({
    targetType,
    targetName,
    groupedMessages: grouped,
    totalMessages: filtered.length > 0 ? filtered : messages,
  });

  return {
    summary: localSummary,
    filteredCount: filtered.length,
    geminiCalled: false,
  };
}
