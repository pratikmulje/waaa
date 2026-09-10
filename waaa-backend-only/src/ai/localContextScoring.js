import { findMemoryMatches, getFreqMatches } from "./chatMemory.js";
import { isPerChatRateLimited } from "./geminiCooldown.js";

const CONCRETE_CATEGORIES = ["deadline", "urgency", "exam", "meeting", "academic", "event", "task"];

const TRIVIAL_PATTERN =
  /^(ok|okay|k|kk|yes|no|haan|nahi|hmm|thanks|thank you|thnx|👍|🙏|😊|✅|😂|😅)$/i;

export function scoreWithLocalContext(ruleResult, text, memory) {
  const { matchedEntity, matchedTopic } = findMemoryMatches(memory, text);
  const hasMemoryMatch = Boolean(matchedEntity || matchedTopic);

  let score = ruleResult.score;
  const reasons = [...ruleResult.reasons];

  if (matchedEntity) {
    reasons.push(`known entity: ${matchedEntity}`);
    score += 20;
  }

  if (matchedTopic) {
    reasons.push(`active topic: ${matchedTopic}`);
    score += 15;
  }

  const hasConcreteSignal = ruleResult.reasons.some((r) =>
    CONCRETE_CATEGORIES.includes(r)
  );

  if (hasMemoryMatch && hasConcreteSignal) {
    score += 15;
    reasons.push("known context + signal combo");
  }

  // ── Frequency-based adaptive boost ──────────────────────────────────────
  const freqMatches = getFreqMatches(memory, text);
  if (freqMatches.length > 0) {
    const freqBoost = Math.min(freqMatches.length * 15, 30);
    score += freqBoost;
    reasons.push(`recurring topic: ${freqMatches.join(", ")}`);
  }
  // ────────────────────────────────────────────────────────────────────────

  score = Math.min(score, 100);

  let level =
    score >= 75 ? "critical" :
    score >= 50 ? "high" :
    score >= 30 ? "low" :
    "normal";

  if (level === "normal" && hasMemoryMatch) {
    level = "low";
  }

  let confidence;

  if (hasMemoryMatch && hasConcreteSignal) {
    confidence = 0.95; // hybrid: strong enough → never call Gemini
  } else if (freqMatches.length > 0 && hasConcreteSignal) {
    confidence = 0.92;
  } else if (ruleResult.score >= 55) {
    confidence = 0.88;
  } else if (hasMemoryMatch && !hasConcreteSignal) {
    confidence = 0.55; // improved: memory match alone is now more trusted
  } else if (freqMatches.length > 0 && !hasConcreteSignal) {
    confidence = 0.50;
  } else if (ruleResult.score > 0 && ruleResult.score < 55) {
    confidence = 0.45;
  } else if (ruleResult.score === 0 && !hasMemoryMatch) {
    confidence = text.trim().length < 15 ? 0.90 : 0.30;
  } else {
    confidence = 0.70;
  }

  return { score, level, reasons, confidence, matchedEntity, matchedTopic, freqMatches };
}

// ─────────────────────────────────────────────────────────────────────────────
// HYBRID 3-TIER GEMINI DECISION SYSTEM
//
//  HIGH confidence (≥ 0.85) → Local result only. Never call Gemini.
//  MEDIUM confidence (0.4–0.85) → Gemini IF: not rate-gated + worth-knowing signal
//  LOW confidence  (< 0.4)  → Batch queue only. Never call Gemini real-time.
//
// This preserves accuracy for genuinely ambiguous messages while protecting
// quota from routine messages and busy chats.
// ─────────────────────────────────────────────────────────────────────────────

// Marathi/Hinglish words that local rules cannot parse
const NON_ENGLISH_PATTERN =
  /\b(aapan|udya|jauyat|gad|la|torna|aaj|kal|ugach|aamhi|tumhi|ata|bagh|ya|ho|nahi|kar|gel|ala|gela|sangto|sangitla|thambh|bas|bai|bhaau|dada|tai|kaka|mama|mast|chal|ekda|tikde|ikde)\b/i;

const NUMBERED_LIST_PATTERN = /^\s*\d+[.\)]/m;

const PLAN_UPDATE_KEYWORDS =
  /\b(changed|updated|new plan|sequence|order|schedule|revised|instead|replace|swap|shifted)\b/i;

// A "worth-knowing" signal means the message might contain new learnable
// information — a new entity, new topic, or context update — that Gemini
// should extract to enrich memory. Without this signal, even medium-confidence
// messages go to batch instead of real-time Gemini.
function hasWorthKnowingSignal(text, memory) {
  const trimmed = text.trim();

  // Cold-chat bootstrap: memory has very few known things → Gemini teaches early
  // Limit: only when knownCount < 3 (tighter than old threshold of 6)
  if (memory) {
    const knownCount =
      Object.keys(memory.entities || {}).length +
      (memory.activeTopics || []).length;
    if (knownCount < 3 && trimmed.length > 30) return true;
  }

  // Hinglish/Marathi that local rules truly can't parse — only for longer messages
  // (short Hinglish like "haan" is handled locally just fine)
  if (NON_ENGLISH_PATTERN.test(trimmed) && trimmed.length > 60) return true;

  // Plan/sequence update — worth knowing if there are pending items to resolve
  if (PLAN_UPDATE_KEYWORDS.test(trimmed)) {
    const hasPending = (memory?.pending || []).length > 0;
    const hasTopics  = (memory?.activeTopics || []).length > 0;
    if (hasPending || hasTopics) return true; // updating something known
  }

  // Numbered list = potential plan or schedule Gemini should learn
  if (NUMBERED_LIST_PATTERN.test(trimmed)) return true;

  return false;
}

/**
 * Hybrid 3-tier Gemini gate.
 *
 * Returns true ONLY if Gemini should be called REAL-TIME for this message.
 * Handles HIGH (skip Gemini) and LOW (batch queue) tiers directly.
 * For MEDIUM tier, applies rate gate + worth-knowing signal filter.
 *
 * @param {object} localResult - output of scoreWithLocalContext()
 * @param {string} text
 * @param {object} memory - chat memory
 * @param {string} chatId - needed for per-chat rate gate
 */
export function needsGeminiForImportance(localResult, text, memory, chatId) {
  if (!text || text.trim().length < 6) return false;
  if (TRIVIAL_PATTERN.test(text.trim())) return false;

  const { confidence } = localResult;

  // ── TIER 1: HIGH confidence — local result is reliable, skip Gemini ────────
  if (confidence >= 0.85) return false;

  // ── TIER 3: LOW confidence — never real-time, always batch queue ───────────
  // (index.js calls shouldQueueForBatch() separately for this path)
  if (confidence < 0.40) return false;

  // ── TIER 2: MEDIUM confidence (0.40–0.85) — conditional Gemini ────────────

  // Per-chat rate gate: max 1 real-time call per chatId per 5 minutes
  if (chatId && isPerChatRateLimited(chatId)) return false;

  // Must have a worth-knowing signal to justify a real-time API call
  if (!hasWorthKnowingSignal(text, memory)) return false;

  return true;
}

/**
 * Returns true if this message should be queued for the background batch
 * memory refresh (even if Gemini is not called real-time).
 *
 * Covers:
 *  - LOW confidence messages (< 0.40) that need Gemini eventually
 *  - MEDIUM confidence messages blocked by rate gate or no worth-knowing signal
 *
 * index.js calls this AFTER needsGeminiForImportance() returns false,
 * to decide whether to enqueue for the 10-minute batch sweep.
 */
export function shouldQueueForBatch(localResult, text) {
  if (!text || text.trim().length < 15) return false;
  if (TRIVIAL_PATTERN.test(text.trim())) return false;

  const { confidence } = localResult;

  // LOW confidence → always queue — batch will process when quota is available
  if (confidence < 0.40) return true;

  // MEDIUM confidence messages with a Hinglish/Marathi signal → queue
  // (they couldn't get a real-time slot but are worth a batch look)
  if (confidence < 0.70 && NON_ENGLISH_PATTERN.test(text.trim())) return true;

  return false;
}