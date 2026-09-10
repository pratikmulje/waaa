/*
==============================================================================
WAAA - Chat Relevance / Intelligence Filter                           Phase 2
==============================================================================

Classifies every WhatsApp chat into an INTELLIGENCE TIER that controls how
much AI processing the chat receives.

TIERS (highest to lowest):
  STARRED   - Full AI intelligence. User explicitly marked this as most important.
  IMPORTANT - AI intelligence. Personal chats + user-selected groups/communities.
  NORMAL    - Light processing. Local rules + memory only, no Gemini.
  LOW       - Skip AI. Store messages but no analysis.
  IGNORED   - Completely excluded from AI pipeline.

Design principles:
  Zero Gemini calls - entirely deterministic, rule-based
  User override always wins over auto-detection
  Personal chats default to IMPORTANT
  Broadcast/news channels default to IGNORED
  Communities default to LOW unless user marks them
  Backward compatible - existing priority/priorityLevel unchanged
  Deterministic - same inputs always produce same tier

Integration with later phases:
  Phase 3  - personIdentity.js checks tier before resolving cross-chat identity
  Phase 4  - chunkSummarizer.js only processes STARRED/IMPORTANT chats
  Phase 9  - globalSummarizer.js only pulls from STARRED/IMPORTANT chats
  Phase 11 - actionEngine.js only extracts from STARRED/IMPORTANT chats
  Phase 13 - watchEngine.js respects tier to scope watches
  Phase 15 - intentRouter.js uses tier for context retrieval decisions
==============================================================================
*/

import { db } from "../firebase.js";
import { readCollection } from "../db/localStore.js";

// Tier constants (ordered highest to lowest)
export const TIERS = Object.freeze({
  STARRED:   "starred",
  IMPORTANT: "important",
  NORMAL:    "normal",
  LOW:       "low",
  IGNORED:   "ignored",
});

// Numeric rank for comparison (higher = more important)
export const TIER_RANK = Object.freeze({
  starred:   5,
  important: 4,
  normal:    3,
  low:       2,
  ignored:   1,
});

// Minimum tier required for each type of AI processing (used in later phases)
export const TIER_GATES = Object.freeze({
  REAL_TIME_GEMINI:    "important",
  BATCH_SUMMARIZATION: "important",
  GLOBAL_SUMMARY:      "starred",
  ACTION_EXTRACTION:   "important",
  WATCH_ENGINE:        "normal",
  WORD_FREQ_UPDATE:    "normal",
});

// Labels for UI display
export const TIER_LABELS = Object.freeze({
  starred:   "Starred",
  important: "Important",
  normal:    "Normal",
  low:       "Low",
  ignored:   "Ignored",
});

// All valid tier values (for validation)
export const VALID_TIERS = ["starred", "important", "normal", "low", "ignored"];

// ── Auto-detection rules ─────────────────────────────────────────────────────
// Rules evaluated in ORDER. First match wins.
// chatMeta = conversation document from conversations collection.

const TIER_RULES = [
  {
    name: "broadcast_channel",
    tier: "ignored",
    test: (m) =>
      m.chatType === "broadcast" ||
      String(m.chatId || "").includes("@broadcast") ||
      m.isBroadcast === true,
  },
  {
    name: "status_broadcast",
    tier: "ignored",
    test: (m) => String(m.chatId || "").includes("status@broadcast"),
  },
  {
    name: "massive_group",
    tier: "ignored",
    test: (m) =>
      typeof m.participantCount === "number" && m.participantCount >= 1000,
  },
  {
    name: "community_root",
    tier: "low",
    test: (m) => m.isCommunity === true,
  },
  {
    name: "community_sub_group",
    tier: "low",
    test: (m) =>
      m.linkedParent != null &&
      m.linkedParent !== "" &&
      m.isCommunity !== true,
  },
  {
    name: "large_group",
    tier: "low",
    test: (m) =>
      typeof m.participantCount === "number" &&
      m.participantCount >= 500 &&
      m.participantCount < 1000,
  },
  {
    name: "personal_chat",
    tier: "important",
    test: (m) => m.chatType === "personal",
  },
  {
    name: "small_group",
    tier: "important",
    test: (m) =>
      m.chatType === "group" &&
      (m.participantCount === null ||
        m.participantCount === undefined ||
        m.participantCount < 100),
  },
  {
    name: "medium_group",
    tier: "normal",
    test: (m) =>
      m.chatType === "group" &&
      typeof m.participantCount === "number" &&
      m.participantCount >= 100 &&
      m.participantCount < 500,
  },
  {
    name: "fallback",
    tier: "normal",
    test: () => true,
  },
];

/**
 * Runs TIER_RULES against chat metadata.
 * Returns { tier, matchedRule }.
 */
export function autoDetectTier(chatMeta) {
  for (const rule of TIER_RULES) {
    if (rule.test(chatMeta)) {
      return { tier: rule.tier, matchedRule: rule.name };
    }
  }
  return { tier: "normal", matchedRule: "fallback" };
}

/**
 * Returns the effective intelligence tier for a chat.
 *
 * Resolution order:
 *   1. Explicit user override (intelligenceTier in chatSettings) - always wins
 *   2. Auto-detection from TIER_RULES
 *
 * @param {string} chatId
 * @param {object|null} chatMeta - conversation doc for auto-detection
 * @param {object|null} existingSettings - pre-loaded chatSettings (avoids extra read)
 */
export async function getIntelligenceTier(chatId, chatMeta = null, existingSettings = null) {
  let settings = existingSettings;
  if (!settings) {
    try {
      const doc = await db.collection("chatSettings").doc(chatId).get();
      settings = doc.exists ? doc.data() : null;
    } catch {
      settings = null;
    }
  }

  const userOverride = settings?.intelligenceTier ?? null;

  let meta = chatMeta;
  if (!meta) {
    try {
      const doc = await db.collection("conversations").doc(chatId).get();
      meta = doc.exists ? doc.data() : null;
    } catch {
      meta = null;
    }
  }

  let autoTier = "normal";
  let matchedRule = "fallback";
  if (meta) {
    const result = autoDetectTier(meta);
    autoTier = result.tier;
    matchedRule = result.matchedRule;
  }

  if (userOverride && VALID_TIERS.includes(userOverride)) {
    return { tier: userOverride, source: "user_override", autoTier, matchedRule };
  }

  return { tier: autoTier, source: "auto_detected", autoTier, matchedRule };
}

/**
 * Explicitly sets the intelligence tier for a chat (user override).
 * Does NOT touch priority/priorityLevel.
 */
export async function setIntelligenceTier(chatId, tier) {
  if (!VALID_TIERS.includes(tier)) {
    console.error(`[ChatRelevance] Invalid tier "${tier}" must be one of: ${VALID_TIERS.join(", ")}`);
    return false;
  }

  try {
    await db.collection("chatSettings").doc(chatId).set(
      { chatId, intelligenceTier: tier, tierUpdatedAt: new Date() },
      { merge: true }
    );
    console.log(`[ChatRelevance] ${chatId} intelligenceTier = ${tier}`);
    return true;
  } catch (error) {
    console.error("[ChatRelevance] setIntelligenceTier failed:", error.message);
    return false;
  }
}

/**
 * Removes the user override, reverting chat to auto-detected tier.
 */
export async function clearIntelligenceTierOverride(chatId) {
  try {
    const doc = await db.collection("chatSettings").doc(chatId).get();
    if (!doc.exists) return true;

    const data = doc.data();
    const { intelligenceTier: _t, tierUpdatedAt: _u, ...rest } = data;
    await db.collection("chatSettings").doc(chatId).set(rest, { merge: false });

    console.log(`[ChatRelevance] ${chatId} tier override cleared`);
    return true;
  } catch (error) {
    console.error("[ChatRelevance] clearIntelligenceTierOverride failed:", error.message);
    return false;
  }
}

/**
 * Checks whether a chat tier meets the minimum for a processing gate.
 * Used by later phases to decide whether to run AI processing.
 *
 * Example:
 *   meetsTierGate("important", "BATCH_SUMMARIZATION") // true
 *   meetsTierGate("low",       "BATCH_SUMMARIZATION") // false
 */
export function meetsTierGate(chatTier, gate) {
  const requiredTier = TIER_GATES[gate];
  if (!requiredTier) {
    console.warn(`[ChatRelevance] Unknown gate "${gate}"`);
    return false;
  }
  return (TIER_RANK[chatTier] ?? 0) >= (TIER_RANK[requiredTier] ?? 0);
}

/**
 * Batch-classifies all known conversations.
 * Returns sorted array (STARRED first, IGNORED last).
 * Used by the intelligence overview API.
 */
export async function classifyAllChats() {
  try {
    const [conversations, allSettings] = await Promise.all([
      readCollection("conversations"),
      readCollection("chatSettings"),
    ]);

    const settingsMap = Object.fromEntries(
      allSettings.map((s) => [s.chatId ?? s.id, s])
    );

    const results = await Promise.all(
      conversations.map(async (conv) => {
        const chatId = conv.chatId ?? conv.id;
        const existingSettings = settingsMap[chatId] ?? null;
        const { tier, source, autoTier, matchedRule } = await getIntelligenceTier(
          chatId, conv, existingSettings
        );

        return {
          chatId,
          chatName:        conv.chatName || chatId,
          chatType:        conv.chatType || null,
          participantCount: conv.participantCount ?? null,
          isCommunity:     conv.isCommunity ?? false,
          linkedParent:    conv.linkedParent ?? null,
          tier,
          tierLabel:       TIER_LABELS[tier] ?? tier,
          source,
          autoTier,
          matchedRule,
          priority:        existingSettings?.priority ?? false,
          priorityLevel:   existingSettings?.priorityLevel ?? "normal",
        };
      })
    );

    return results.sort(
      (a, b) => (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0)
    );
  } catch (error) {
    console.error("[ChatRelevance] classifyAllChats failed:", error.message);
    return [];
  }
}
