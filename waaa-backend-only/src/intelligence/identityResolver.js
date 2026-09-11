/*
==============================================================================
WAAA - Central Identity & Display Name Resolver
==============================================================================

Resolves raw WhatsApp identifiers (@lid, @g.us, @newsletter, @s.whatsapp.net)
to human-readable contact and chat names without exposing raw internal IDs.
Provides unicode folding for stylized names (e.g. fancy fonts / small caps).
==============================================================================
*/

import { readCollection } from "../db/localStore.js";

const UNICODE_LOOKALIKES = {
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm',
  'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ǫ': 'q', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'x': 'x', 'ʏ': 'y', 'ᴢ': 'z',
  'Ꮲ': 'p', 'Ҏ': 'p', 'ᑭ': 'p', 'р': 'p', 'Р': 'p', 'а': 'a', 'А': 'a', 'е': 'e', 'Е': 'e', 'о': 'o', 'О': 'o', 'с': 'c', 'С': 'c',
  'у': 'y', 'У': 'y', 'х': 'x', 'Х': 'x', 'і': 'i', 'І': 'i', 'ϳ': 'j', 'Ј': 'j', 'ѕ': 's', 'Ѕ': 's',
  '@': 'a', '0': 'o', '1': 'i', '3': 'e', '5': 's', '7': 't', '8': 'b', '$': 's', '!': 'i',
};

/**
 * Normalizes fancy unicode fonts, Cherokee lookalikes, small capitals, and accents to lowercase ASCII.
 * e.g. "Ꮲʀᴀɴᴀᴠ" -> "pranav", "T ᴀ ɴ ɪ ꜱ ʜ Q ⸙" -> "tanishq"
 *
 * @param {string} str
 * @returns {string}
 */
export function foldUnicodeName(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  let out = "";
  for (const ch of s) {
    out += UNICODE_LOOKALIKES[ch] || ch;
  }
  return out.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalizes typos in common words like summarize/summerise
 *
 * @param {string} query
 * @returns {string}
 */
export function normalizeQueryTypos(query) {
  if (!query || typeof query !== "string") return "";
  return query
    .replace(/\bsummeri[sz]e\b/gi, "summarize")
    .replace(/\bsumari[sz]e\b/gi, "summarize")
    .replace(/\bsummeries\b/gi, "summaries")
    .replace(/\bsumary\b/gi, "summary")
    .replace(/\bsummerize\b/gi, "summarize");
}

/**
 * Checks if a string is a raw JID or internal ID that should be masked/resolved
 *
 * @param {string} str
 * @returns {boolean}
 */
export function isRawJid(str) {
  if (!str || typeof str !== "string") return false;
  return str.includes("@") || /^\d{10,}$/.test(str);
}

/**
 * Resolves a display name for a given raw ID, message, or conversation.
 *
 * Lookup order:
 * 1. If string is already clean/human-readable, return it.
 * 2. Lookup in conversations collection.
 * 3. Lookup in messages collection.
 * 4. Lookup in people collection.
 * 5. Safe fallback ("Unknown contact" or "Group chat").
 *
 * @param {string|object} input - ID string or object containing chatId/sender/senderJid
 * @returns {Promise<string>} Human-readable name
 */
export async function resolveDisplayName(input) {
  if (!input) return "Unknown contact";

  let id = typeof input === "string" ? input.trim() : (input.chatName || input.sender || input.chatId || input.senderJid || "");
  if (!isRawJid(id)) {
    return id;
  }

  try {
    const [conversations, messages, people] = await Promise.all([
      readCollection("conversations"),
      readCollection("messages"),
      readCollection("people"),
    ]);

    // 1. Check conversation names
    const conv = conversations.find((c) => (c.chatId === id || c.id === id) && c.chatName && !isRawJid(c.chatName));
    if (conv) return conv.chatName;

    // 2. Check people index
    const person = people.find((p) => (p.primaryJid === id || (p.jids && p.jids.includes(id))) && p.primaryName && !isRawJid(p.primaryName));
    if (person) return person.primaryName;

    // 3. Check messages for human sender or chatName
    const msgSender = messages.find((m) => (m.senderJid === id || m.chatId === id) && m.sender && !isRawJid(m.sender));
    if (msgSender) return msgSender.sender;

    const msgChat = messages.find((m) => m.chatId === id && m.chatName && !isRawJid(m.chatName));
    if (msgChat) return msgChat.chatName;
  } catch (err) {
    console.warn("[IdentityResolver] Error during name lookup:", err.message);
  }

  // 4. Safe fallback
  if (id.endsWith("@g.us")) return "Group chat";
  if (id.endsWith("@newsletter")) return "Channel";
  return "Unknown contact";
}

/**
 * Sanitizes item source names so raw IDs are never exposed in final outputs
 *
 * @param {object} item
 * @returns {Promise<object>} Item with sanitized chatName / sender
 */
export async function sanitizeItemSource(item) {
  if (!item || typeof item !== "object") return item;

  const clone = { ...item };
  if (clone.chatName && isRawJid(clone.chatName)) {
    clone.chatName = await resolveDisplayName(clone.chatName);
  } else if (!clone.chatName && clone.chatId) {
    clone.chatName = await resolveDisplayName(clone.chatId);
  }

  if (clone.sender && isRawJid(clone.sender)) {
    clone.sender = await resolveDisplayName(clone.sender);
  } else if (!clone.sender && clone.senderJid) {
    clone.sender = await resolveDisplayName(clone.senderJid);
  }

  return clone;
}
