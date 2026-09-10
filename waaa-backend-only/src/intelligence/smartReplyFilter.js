/*
==============================================================================
WAAA - Smart Reply Eligibility Filter                                Phase 11
==============================================================================

Evaluates whether an incoming WhatsApp message is eligible for smart reply.
Avoids wasting Gemini calls on:
  - Greetings ("hi", "hello", "good morning")
  - Casual acknowledgements ("ok", "k", "cool", "haan", "acha")
  - Emoji-only messages
  - Low-value chatter / hangouts ("chalte hai khelne", "kya chal raha hai")
  - One-word confirmations ("yes", "no", "done")

Modes:
  - SMART (default): local rules filter casual/low-value out; meaningful messages pass
  - MANUAL: only generate if explicitly requested by user
  - ALWAYS: always generate (unless completely empty)
==============================================================================
*/

export const SMART_REPLY_MODES = Object.freeze({
  SMART: "SMART",
  MANUAL: "MANUAL",
  ALWAYS: "ALWAYS",
});

const CASUAL_GREETINGS = new Set([
  "hi", "hello", "hey", "hlo", "heyy", "hii", "hiii",
  "good morning", "gm", "good night", "gn", "good afternoon", "good evening",
  "namaste", "pranam", "salam", "hola"
]);

const CASUAL_ACKS = new Set([
  "ok", "k", "kk", "okay", "okk", "okies", "cool", "fine", "sure", "nice",
  "great", "yup", "yeah", "yes", "no", "nah", "nope", "haan", "ha", "acha",
  "accha", "theek", "thik", "sahi", "done", "got it", "noted", "understood",
  "thanks", "thank you", "thx", "tq", "ty", "welcome", "np", "nw", "shukriya"
]);

const CASUAL_PHRASES = [
  /^chalte hai/i,
  /^khelne/i,
  /^kya chal raha/i,
  /^aur bata/i,
  /^sab badiya/i,
  /^whats up/i,
  /^sup\b/i,
  /^how are you/i,
  /^kaise ho/i,
  /^kaisa hai/i,
  /^busy ho/i,
  /^free ho/i,
  /^lol\b/i,
  /^haha/i,
  /^rofl/i,
  /^lmao/i
];

// Regex for emoji only strings
const EMOJI_ONLY_REGEX = /^[\p{Emoji}\s\p{P}]+$/u;

/**
 * Checks if a message text is eligible for AI smart reply.
 * Deterministic, zero AI calls.
 *
 * @param {string} text - Message text
 * @param {string} mode - "SMART" | "MANUAL" | "ALWAYS"
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isEligibleForSmartReply(text, mode = SMART_REPLY_MODES.SMART) {
  if (mode === SMART_REPLY_MODES.MANUAL) {
    return { eligible: false, reason: "manual_mode_requires_explicit_trigger" };
  }

  const clean = String(text || "").trim();
  if (!clean) {
    return { eligible: false, reason: "empty_message" };
  }

  if (mode === SMART_REPLY_MODES.ALWAYS) {
    return { eligible: true, reason: "always_mode" };
  }

  // 1. Emoji only or mostly punctuation
  if (EMOJI_ONLY_REGEX.test(clean) && !/[a-zA-Z0-9]/.test(clean)) {
    return { eligible: false, reason: "emoji_or_punctuation_only" };
  }

  const lower = clean.toLowerCase();

  // 2. Greetings
  if (CASUAL_GREETINGS.has(lower)) {
    return { eligible: false, reason: "casual_greeting" };
  }

  // 3. Acknowledgements
  if (CASUAL_ACKS.has(lower)) {
    return { eligible: false, reason: "casual_acknowledgement" };
  }

  // 4. Common low-value casual phrases
  for (const pattern of CASUAL_PHRASES) {
    if (pattern.test(lower)) {
      return { eligible: false, reason: "low_value_casual_chatter" };
    }
  }

  // 5. Extremely short non-informative phrases (< 3 chars unless question)
  if (clean.length < 3 && !clean.includes("?")) {
    return { eligible: false, reason: "too_short" };
  }

  return { eligible: true, reason: "meaningful_message" };
}
