import { GoogleGenAI } from "@google/genai";
import { isQuotaError } from "./geminiCooldown.js";

// ── Key pool ──────────────────────────────────────────────────────────────────
// Reads GEMINI_API_KEY_1, GEMINI_API_KEY_2, … from .env (any count)
const API_KEYS = Object.keys(process.env)
  .filter((k) => /^GEMINI_API_KEY(_\d+)?$/.test(k))
  .sort()
  .map((k) => process.env[k].trim())
  .filter(Boolean);

if (API_KEYS.length === 0) {
  console.warn(
    "[GeminiClient] ⚠️ No Gemini API keys found in environment. Deterministic features will run; AI generation will be disabled."
  );
} else {
  console.log(`[GeminiClient] Loaded ${API_KEYS.length} API key(s) for rotation.`);
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentKeyIndex = 0;
const exhaustedKeys = new Set(); // keys that hit daily quota today

// ── Daily reset at midnight Pacific Time ──────────────────────────────────────
function getMsUntilMidnightPT() {
  const now = new Date();
  const ptOffset = -8 * 60; // PST (UTC-8), conservative
  const ptNow = new Date(now.getTime() + ptOffset * 60 * 1000);
  const midnight = new Date(ptNow);
  midnight.setUTCHours(24, 0, 0, 0);
  return midnight.getTime() - ptNow.getTime();
}

function scheduleDailyReset() {
  if (API_KEYS.length === 0) return;
  const msUntilMidnight = getMsUntilMidnightPT();
  setTimeout(() => {
    exhaustedKeys.clear();
    currentKeyIndex = 0;
    console.log("[GeminiClient] Daily quota reset — all keys refreshed.");
    scheduleDailyReset(); // reschedule for next midnight
  }, msUntilMidnight);
  console.log(
    `[GeminiClient] Next quota reset in ${Math.round(msUntilMidnight / 3600000)}h (midnight PT).`
  );
}

scheduleDailyReset();

// ── Internal helpers ──────────────────────────────────────────────────────────
function getActiveKey() {
  return API_KEYS[currentKeyIndex];
}

function rotateKey(failedKey) {
  exhaustedKeys.add(failedKey);
  const nextIndex = API_KEYS.findIndex(
    (k, i) => i !== currentKeyIndex && !exhaustedKeys.has(k)
  );
  if (nextIndex === -1) {
    console.error("[GeminiClient] ❌ All API keys exhausted for today.");
    return false;
  }
  currentKeyIndex = nextIndex;
  console.log(
    `[GeminiClient] 🔄 Rotated to key #${currentKeyIndex + 1} of ${API_KEYS.length}.`
  );
  return true;
}

// ── Error Classification ──────────────────────────────────────────────────────
export const ERROR_TYPES = Object.freeze({
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED",
  AUTH_INVALID: "AUTH_INVALID",
  TRANSIENT_NETWORK: "TRANSIENT_NETWORK",
  PERMANENT_REQUEST: "PERMANENT_REQUEST",
  UNKNOWN: "UNKNOWN",
});

const AUTH_ERROR_PATTERN = /401|403|api_key_invalid|permission_denied|invalid api key|unauthenticated/i;
const TRANSIENT_NETWORK_PATTERN = /500|502|503|504|timeout|timed out|network|fetch failed|econnreset|etimedout|socket hang up|unavailable|overloaded/i;
const PERMANENT_REQUEST_PATTERN = /400|invalid_argument|safety|blocked|context_length|prompt too long/i;

export function classifyGeminiError(error) {
  const msg = String(error?.message || error || "");
  const status = error?.status || error?.statusCode;

  // 1. Check Quota / Rate Limit (429, RESOURCE_EXHAUSTED, quota exceeded)
  if (status === 429 || /429|\bquota\b|resource_exhausted|rate limit/i.test(msg)) {
    return ERROR_TYPES.QUOTA_EXHAUSTED;
  }
  // 2. Check Auth / Permission (401, 403, invalid API key)
  if (status === 401 || status === 403 || /401|403|api_key_invalid|permission_denied|invalid api key|unauthenticated/i.test(msg)) {
    return ERROR_TYPES.AUTH_INVALID;
  }
  // 3. Check Transient Network / Server Unavailable (500, 502, 503, 504, timeout, socket hang up)
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /500|502|503|504|timeout|timed out|network|fetch failed|econnreset|etimedout|socket hang up|unavailable|overloaded/i.test(msg)
  ) {
    return ERROR_TYPES.TRANSIENT_NETWORK;
  }
  // 4. Check Permanent Request / Content Error (400, invalid argument, safety block)
  if (status === 400 || /400|invalid_argument|safety|blocked|context_length|prompt too long/i.test(msg)) {
    return ERROR_TYPES.PERMANENT_REQUEST;
  }
  return ERROR_TYPES.UNKNOWN;
}

// ── Test Adapter / Hook (for controlled tests without modifying prod behavior) ──
let customAskAIHook = null;

export function setCustomAskAIHook(hookFn) {
  customAskAIHook = hookFn;
}

export function clearCustomAskAIHook() {
  customAskAIHook = null;
}

export function getCurrentKeyIndex() {
  return currentKeyIndex;
}

export function getExhaustedKeysList() {
  return Array.from(exhaustedKeys);
}

export function rotateKeyManual(failedKey) {
  return rotateKey(failedKey || getActiveKey());
}

export function resetKeyPool() {
  exhaustedKeys.clear();
  currentKeyIndex = 0;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function isConfigured() {
  return API_KEYS.length > 0 && exhaustedKeys.size < API_KEYS.length;
}

export function getKeyStatus() {
  return {
    total: API_KEYS.length,
    activeKeyIndex: currentKeyIndex + 1,
    exhaustedCount: exhaustedKeys.size,
    availableCount: API_KEYS.length - exhaustedKeys.size,
    exhaustedKeys: Array.from(exhaustedKeys).map((_, idx) => `key_${idx + 1}_exhausted`),
  };
}

export async function askAI({ system, prompt, maxTokens = 2048 }) {
  if (customAskAIHook) {
    return customAskAIHook({ system, prompt, maxTokens, currentKeyIndex, getActiveKey, rotateKey });
  }

  if (API_KEYS.length === 0) {
    throw new Error("No Gemini API keys configured.");
  }

  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    if (exhaustedKeys.size >= API_KEYS.length) {
      throw new Error(
        "All Gemini API keys exhausted for today. They reset at midnight Pacific Time."
      );
    }

    const key = getActiveKey();
    const client = new GoogleGenAI({ apiKey: key });

    try {
      const response = await client.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction: system,
          maxOutputTokens: maxTokens,
          thinkingConfig: {
            thinkingLevel: "low",
          },
        },
      });
      return (response.text || "").trim();
    } catch (err) {
      const errorType = classifyGeminiError(err);

      if (errorType === ERROR_TYPES.QUOTA_EXHAUSTED || errorType === ERROR_TYPES.AUTH_INVALID) {
        console.warn(
          `[GeminiClient] ⚠️ Key #${currentKeyIndex + 1} encountered ${errorType}. Rotating…`
        );
        const rotated = rotateKey(key);
        if (!rotated) {
          throw new Error(
            "All Gemini API keys exhausted for today. They reset at midnight Pacific Time."
          );
        }
        // loop continues with the next key
      } else {
        throw err; // permanent content error, transient network error — thrown to caller/jobManager for structured retry
      }
    }
  }

  throw new Error("Gemini: failed after trying all available keys.");
}