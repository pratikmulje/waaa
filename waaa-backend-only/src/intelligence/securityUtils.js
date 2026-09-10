/*
==============================================================================
WAAA - Security & Sanitization Helpers                                Phase 12
==============================================================================

Provides deterministic security validation, input sanitization, safe ID checking,
path-traversal protection, and error sanitization for all API routes & intelligence.
==============================================================================
*/

// Safe ID patterns
// WhatsApp IDs: numbers@s.whatsapp.net, numbers-numbers@g.us, numbers@lid, or hex/alphanumeric IDs
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-@.:]{1,128}$/;
const PATH_TRAVERSAL_REGEX = /(\.\.[\/\\]|[\/\\]\.\.|\0|~|\$)/;

/**
 * Validates that an identifier (chatId, messageId, watchId, alertId, projectId, etc.)
 * is safe against path traversal, SQL/NoSQL injection, and control characters.
 *
 * @param {any} id
 * @returns {boolean}
 */
export function isValidSafeId(id) {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128) return false;
  if (PATH_TRAVERSAL_REGEX.test(trimmed)) return false;
  return SAFE_ID_REGEX.test(trimmed);
}

/**
 * Validates and sanitizes a query string or user input to prevent excessive length,
 * null byte injection, or malicious control characters.
 *
 * @param {any} input
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeInputString(input, maxLength = 2000) {
  if (input === null || input === undefined) return "";
  const str = String(input);
  // Remove null bytes and dangerous control characters except newlines/tabs
  const cleaned = str.replace(/[\0\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return cleaned.slice(0, maxLength).trim();
}

/**
 * Validates an object against unexpected keys or deeply nested structures.
 *
 * @param {object} obj
 * @param {Array<string>} allowedKeys
 * @returns {{ ok: boolean, sanitized: object, extraKeys: Array<string> }}
 */
export function filterAllowedKeys(obj, allowedKeys) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, sanitized: {}, extraKeys: [] };
  }
  const allowedSet = new Set(allowedKeys);
  const sanitized = {};
  const extraKeys = [];

  for (const key of Object.keys(obj)) {
    if (allowedSet.has(key)) {
      sanitized[key] = obj[key];
    } else {
      extraKeys.push(key);
    }
  }

  return { ok: true, sanitized, extraKeys };
}

/**
 * Sanitizes errors returned to clients to ensure stack traces, internal filesystem paths,
 * or environment variables are NEVER leaked.
 *
 * @param {Error|any} err
 * @param {string} defaultMessage
 * @returns {string}
 */
export function sanitizeErrorMessage(err, defaultMessage = "An internal error occurred.") {
  if (!err) return defaultMessage;
  const raw = String(err.message || err);

  // If the error contains path-like strings or stack traces, redact
  if (/([a-zA-Z]:\\|\/home\/|\/usr\/|\/var\/|\.js:\d+|at\s+[\w\.]+)/i.test(raw)) {
    return defaultMessage;
  }
  // Check for potential API key leaks (Google AIza keys, Bearer tokens, general key prefixes)
  if (/AIza[0-9A-Za-z\-_]{10,}/i.test(raw) || /api[_\-\s]*key/i.test(raw) || /bearer\s+[a-zA-Z0-9\-_.]+/i.test(raw)) {
    return defaultMessage;
  }

  return raw.slice(0, 200);
}

/**
 * Checks for prompt injection indicators in untrusted WhatsApp or user content.
 * Flags attempts to instruct the AI to reveal secrets, bypass guidelines, or change personality.
 *
 * @param {string} text
 * @returns {{ suspicious: boolean, patterns: Array<string> }}
 */
export function detectPromptInjection(text) {
  if (!text || typeof text !== "string") return { suspicious: false, patterns: [] };

  const lower = text.toLowerCase();
  const matchedPatterns = [];

  const INJECTION_PATTERNS = [
    { name: "ignore_previous", regex: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?|commands?)/i },
    { name: "reveal_system_prompt", regex: /(reveal|print|show|output|leak)\s+(the\s+)?(system\s+prompt|instructions?|api\s*key|secret)/i },
    { name: "disregard_guidelines", regex: /disregard\s+(all\s+)?(guidelines|guardrails|safety)/i },
    { name: "roleplay_dan", regex: /\b(jailbreak|dan\s+mode|developer\s+mode|unrestricted\s+mode)\b/i },
    { name: "system_override", regex: /^system\s*:\s*/i },
  ];

  for (const { name, regex } of INJECTION_PATTERNS) {
    if (regex.test(lower)) {
      matchedPatterns.push(name);
    }
  }

  return {
    suspicious: matchedPatterns.length > 0,
    patterns: matchedPatterns,
  };
}
