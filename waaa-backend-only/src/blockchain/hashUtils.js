/*
==============================================================================
WAAA - Canonical Hashing & Cryptographic Proof Utilities             Phase 15
==============================================================================

Provides deterministic canonical JSON serialization and SHA-256 hashing.
Ensures that:
  - Object keys are sorted deterministically
  - Arrays are preserved in order
  - Dates and timestamps are normalized to ISO-8601 strings
  - Sensitive internal attributes (API keys, credentials, tokens, raw buffers)
    are strictly stripped before hashing
  - Identical logical records produce identical cryptographic hashes
==============================================================================
*/

import crypto from "crypto";

const EXCLUDED_FIELDS = new Set([
  "apikey",
  "api_key",
  "secret",
  "token",
  "password",
  "credentials",
  "qr",
  "buffer",
  "bufferbase64",
  "sock",
  "privatekey",
  "private_key",
  "authtoken",
  "auth_token",
]);

function isExcludedKey(key) {
  const lower = key.toLowerCase();
  if (EXCLUDED_FIELDS.has(lower)) return true;
  if (lower.includes("secret") || lower.includes("privatekey") || lower.includes("authtoken") || lower.includes("apikey") || lower.includes("password")) {
    return true;
  }
  return false;
}

/**
 * Recursively normalizes an object into a canonical form:
 * - Omits undefined and function values
 * - Filters out sensitive fields
 * - Sorts all object keys lexicographically
 * - Formats Dates to ISO strings
 *
 * @param {any} value
 * @returns {any} Canonical representation
 */
export function canonicalize(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === "object") {
    // If it's a Buffer, do NOT include raw bytes
    if (Buffer.isBuffer(value)) {
      return null;
    }

    const sortedKeys = Object.keys(value)
      .filter((k) => !isExcludedKey(k) && value[k] !== undefined)
      .sort();

    const normalized = {};
    for (const key of sortedKeys) {
      normalized[key] = canonicalize(value[key]);
    }
    return normalized;
  }

  return value;
}

/**
 * Serializes a value into a deterministic JSON string.
 *
 * @param {any} value
 * @returns {string} Deterministic JSON string
 */
export function canonicalJsonStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export const canonicalSerialize = canonicalJsonStringify;

/**
 * Computes a deterministic SHA-256 hash of any record or value.
 *
 * @param {any} record
 * @returns {string} 64-character lowercase hexadecimal hash
 */
export function computeContentHash(record) {
  const canonicalString = canonicalJsonStringify(record);
  return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Computes a Merkle root from an array of SHA-256 leaf hashes.
 * If empty, returns null. If single leaf, returns that leaf.
 *
 * @param {Array<string>} hashes - Array of hex hashes
 * @returns {string|null} Merkle root hex hash
 */
export function computeMerkleRoot(hashes) {
  if (!hashes || !Array.isArray(hashes) || hashes.length === 0) {
    return null;
  }

  let currentLevel = [...hashes];

  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // duplicate if odd
      const combined = crypto.createHash("sha256").update(left + right, "utf8").digest("hex");
      nextLevel.push(combined);
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}
