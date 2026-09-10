/*
Circuit breaker for Gemini quota/rate-limit errors. Runs in-process
only — the bot process is the sole caller of Gemini for context
intelligence, so no cross-process state sharing is needed here
(unlike connection state, which genuinely needed a cross-process fix
earlier in this project).
*/

const QUOTA_ERROR_PATTERN = /429|quota|resource_exhausted|rate limit|503|unavailable|overloaded|timeout/i;

let cooldownUntil = 0;
let lastCooldownReason = null;

export function isQuotaError(error) {
  const msg = String(error?.message || error || "");
  return QUOTA_ERROR_PATTERN.test(msg);
}

export function isInCooldown() {
  return Date.now() < cooldownUntil;
}

export function getCooldownRemainingMs() {
  return Math.max(0, cooldownUntil - Date.now());
}

export function triggerCooldown(reason, ms = 10 * 60 * 1000) {
  cooldownUntil = Date.now() + ms;
  lastCooldownReason = reason;
  console.log(
    `[Gemini Cooldown] Activated for ${Math.round(ms / 60000)} min — reason: ${reason}`
  );
}

export function clearCooldown() {
  cooldownUntil = 0;
  lastCooldownReason = null;
}

export function getCooldownStatus() {
  return {
    inCooldown: isInCooldown(),
    remainingMs: getCooldownRemainingMs(),
    lastReason: lastCooldownReason,
  };
}

// ── Per-chat rate gate ────────────────────────────────────────────────────────
// Prevents a single busy chat from consuming all quota.
// Max 1 real-time Gemini call per chatId per PER_CHAT_WINDOW_MS.
const PER_CHAT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const perChatLastCall = new Map(); // chatId → timestamp of last Gemini call

export function isPerChatRateLimited(chatId) {
  const last = perChatLastCall.get(chatId);
  if (!last) return false;
  return Date.now() - last < PER_CHAT_WINDOW_MS;
}

export function recordPerChatCall(chatId) {
  perChatLastCall.set(chatId, Date.now());
}

export function getPerChatCooldownRemainingMs(chatId) {
  const last = perChatLastCall.get(chatId);
  if (!last) return 0;
  return Math.max(0, PER_CHAT_WINDOW_MS - (Date.now() - last));
}