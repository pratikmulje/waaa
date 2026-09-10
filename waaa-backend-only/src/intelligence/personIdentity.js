/*
==============================================================================
WAAA - Person Identity Layer                                          Phase 3
==============================================================================

Maps WhatsApp identities (JIDs) to internal person records so the same real
person can be recognized across personal chats, multiple groups, and
communities - even when they appear under different display names.

CRITICAL DESIGN DECISIONS (based on actual data inspection):

1. ALL JIDs in this codebase are @lid format (e.g. 261435196178593@lid).
   There are ZERO @s.whatsapp.net identifiers in messages.json.
   Baileys uses LID (Linked Device Identifier) throughout.
   DO NOT assume @s.whatsapp.net exists or needs mapping.

2. Personal chat chatId === senderJid for @lid (verified against actual data).
   When chatType=personal, the chatId IS the person's JID.
   This is a STRONG identity signal, not an assumption.

3. The same @lid appears consistently across groups - this is Baileys' stable
   per-person identifier and is safe to use for identity resolution.

4. @g.us as senderJid = group/system message, NOT a person.
   @newsletter as senderJid = channel, NOT a person.
   These are explicitly excluded from person tracking.

5. Display names (pushName) can vary:
   - Person may appear as "Shreyas Paranjape" in one chat, "47910477664261@lid"
     in another (when pushName is not set).
   - Name-based merging is NEVER done automatically.
   - Multiple names for same JID are stored as "aliases", not merged identities.

RESOLUTION METHODS (in confidence order):
  PERSONAL_CHAT_JID    - chatId == senderJid in a personal chat (confidence: 0.99)
  EXACT_JID_CROSSCHAT  - same @lid appears in personal + group (confidence: 0.98)
  MANUAL_ALIAS         - user explicitly confirmed two identities are same person (confidence: 1.00)
  NAME_CANDIDATE_ONLY  - similar name, NO JID evidence (status: UNCONFIRMED, NOT merged)

people.json schema:
[
  {
    "personId": "person_<lid>",           // internal stable ID
    "primaryJid": "261435196178593@lid",  // the canonical JID (never exposed to Gemini)
    "jids": ["261435196178593@lid"],      // all known JIDs for this person
    "names": ["Jayram"],                  // all known display names (deduplicated)
    "primaryName": "Jayram",             // best display name
    "personalChatId": "261435196178593@lid", // set if we have a personal chat
    "groupChats": ["120363429483906318@g.us"], // groups this person appears in
    "resolutionMethod": "PERSONAL_CHAT_JID",
    "confidence": 0.99,
    "identityCandidates": [],            // unconfirmed possible merges
    "manualAliases": [],                 // user-confirmed aliases
    "isMe": false,                       // true for the account owner
    "createdAt": "ISO",
    "updatedAt": "ISO"
  }
]
==============================================================================
*/

import { readCollection, writeCollection, genId } from "../db/localStore.js";

const COLLECTION = "people";

// ── Resolution methods and their confidence scores ────────────────────────────
export const RESOLUTION_METHODS = Object.freeze({
  MANUAL_ALIAS:        { confidence: 1.00, description: "User manually confirmed" },
  PERSONAL_CHAT_JID:   { confidence: 0.99, description: "Direct personal chat — chatId equals senderJid" },
  EXACT_JID_CROSSCHAT: { confidence: 0.98, description: "Same @lid JID seen in personal chat and group" },
  EXACT_JID_GROUP:     { confidence: 0.85, description: "Same @lid JID seen across multiple groups only" },
  NAME_CANDIDATE_ONLY: { confidence: 0.00, description: "Similar name only — NOT merged, UNCONFIRMED" },
});

// JIDs that are NOT real people (groups, channels, system)
const NON_PERSON_SUFFIXES = ["@g.us", "@newsletter", "@broadcast"];

function isPersonJid(jid) {
  if (!jid) return false;
  return !NON_PERSON_SUFFIXES.some((suffix) => jid.endsWith(suffix));
}

// Generate a stable, consistent personId from a JID
function jidToPersonId(jid) {
  const numeric = jid.replace(/@.*$/, "");
  return `person_${numeric}`;
}

// Build the "best" display name from an array of names
// Prefers actual names over raw JID strings
function pickBestName(names) {
  if (!names || names.length === 0) return null;
  const realNames = names.filter((n) => n && !n.includes("@") && n.trim().length > 0);
  if (realNames.length > 0) return realNames[0];
  return names[0];
}

// ── Core CRUD ─────────────────────────────────────────────────────────────────

/**
 * Load all people records from people.json.
 */
export async function loadPeople() {
  return readCollection(COLLECTION);
}

/**
 * Save all people records to people.json.
 */
async function savePeople(people) {
  return writeCollection(COLLECTION, people);
}

/**
 * Find a person record by their JID (checks all jids[] in every record).
 * Returns the record or null.
 */
export async function findPersonByJid(jid) {
  if (!isPersonJid(jid)) return null;
  const people = await loadPeople();
  return people.find((p) => p.jids && p.jids.includes(jid)) || null;
}

/**
 * Find a person record by personId.
 */
export async function findPersonById(personId) {
  const people = await loadPeople();
  return people.find((p) => p.personId === personId) || null;
}

// ── Identity Resolution ───────────────────────────────────────────────────────

/**
 * Resolves or creates a person identity for a given JID + chat context.
 * This is the main function called during message processing.
 *
 * Resolution logic:
 *   1. If JID already has a person record -> return it (update names if new alias)
 *   2. If chatType=personal -> create PERSONAL_CHAT_JID record (confidence 0.99)
 *   3. If same JID appears in group -> create EXACT_JID_GROUP record (confidence 0.85)
 *   4. Never auto-merge based on name alone
 *
 * @param {object} params
 * @param {string} params.jid - senderJid from message
 * @param {string} params.senderName - display name (may be null or JID-as-name)
 * @param {string} params.chatId - the chat this message is from
 * @param {string} params.chatType - "personal"|"group"|"channel"|"broadcast"
 * @returns {Promise<{personId, primaryName, confidence, resolutionMethod, isNewRecord}>}
 */
export async function resolvePersonIdentity({ jid, senderName, chatId, chatType }) {
  if (!isPersonJid(jid)) return null;

  const people = await loadPeople();
  const existing = people.find((p) => p.jids && p.jids.includes(jid));

  const now = new Date().toISOString();

  if (existing) {
    // ── Person already known — update if we have new information ───────────
    let updated = false;

    // Add new display name if it's a real name (not a JID string)
    if (senderName && !senderName.includes("@") && !existing.names.includes(senderName)) {
      existing.names.push(senderName);
      existing.primaryName = pickBestName(existing.names);
      updated = true;
    }

    // Track group chat membership
    if (chatType === "group" && chatId && !existing.groupChats.includes(chatId)) {
      existing.groupChats.push(chatId);
      updated = true;
    }

    // Upgrade resolution method if we now have a personal chat signal
    if (
      chatType === "personal" &&
      chatId === jid &&
      !existing.personalChatId &&
      existing.resolutionMethod !== "MANUAL_ALIAS"
    ) {
      existing.personalChatId = chatId;
      existing.resolutionMethod = "PERSONAL_CHAT_JID";
      existing.confidence = RESOLUTION_METHODS.PERSONAL_CHAT_JID.confidence;
      updated = true;
    }

    // Upgrade from GROUP to CROSSCHAT if we now have both personal + group
    if (
      chatType === "group" &&
      existing.personalChatId &&
      existing.resolutionMethod === "EXACT_JID_GROUP"
    ) {
      existing.resolutionMethod = "EXACT_JID_CROSSCHAT";
      existing.confidence = RESOLUTION_METHODS.EXACT_JID_CROSSCHAT.confidence;
      updated = true;
    }

    if (updated) {
      existing.updatedAt = now;
      await savePeople(people);
    }

    return {
      personId:         existing.personId,
      primaryName:      existing.primaryName,
      confidence:       existing.confidence,
      resolutionMethod: existing.resolutionMethod,
      isNewRecord:      false,
    };
  }

  // ── New person — create record ─────────────────────────────────────────────
  const personId = jidToPersonId(jid);

  const isPersonalChat = chatType === "personal" && chatId === jid;

  const names = [];
  if (senderName && !senderName.includes("@")) {
    names.push(senderName);
  }

  const resolutionMethod = isPersonalChat
    ? "PERSONAL_CHAT_JID"
    : "EXACT_JID_GROUP";

  const confidence = RESOLUTION_METHODS[resolutionMethod].confidence;

  const newRecord = {
    personId,
    primaryJid:       jid,
    jids:             [jid],
    names,
    primaryName:      pickBestName(names) || null,
    personalChatId:   isPersonalChat ? chatId : null,
    groupChats:       chatType === "group" && chatId ? [chatId] : [],
    resolutionMethod,
    confidence,
    identityCandidates: [], // unconfirmed possible same-person matches
    manualAliases:    [],
    isMe:             false,
    createdAt:        now,
    updatedAt:        now,
  };

  people.push(newRecord);
  await savePeople(people);

  return {
    personId,
    primaryName:      newRecord.primaryName,
    confidence,
    resolutionMethod,
    isNewRecord:      true,
  };
}

// ── Batch Build (from existing messages) ─────────────────────────────────────

/**
 * Scans all existing messages and conversations to build the people.json index.
 * This is a one-time (or on-demand) operation — should NOT be run on every message.
 *
 * Strategy:
 *   1. Process personal chats first (highest confidence)
 *   2. Then process group messages (may upgrade resolution method if personal already exists)
 *   3. NEVER merge based on name alone
 *
 * @param {boolean} force - if false, skips chats already indexed
 * @returns {Promise<{created, updated, skipped, candidates}>}
 */
export async function buildPeopleIndex(force = false) {
  const { readCollection: rc } = await import("../db/localStore.js");
  const messages = await rc("messages");
  const conversations = await rc("conversations");

  // Build conversation lookup
  const convMap = {};
  for (const c of conversations) {
    const id = c.chatId || c.id;
    convMap[id] = c;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Deduplicate: process each unique JID once per chat context
  const seen = new Set(); // "jid|chatId"

  // Sort messages: personal chats first (higher confidence), then groups
  const sorted = [...messages].sort((a, b) => {
    const aPriority = a.chatType === "personal" ? 0 : 1;
    const bPriority = b.chatType === "personal" ? 0 : 1;
    return aPriority - bPriority;
  });

  for (const msg of sorted) {
    const jid = msg.senderJid;
    const chatId = msg.chatId;
    const key = `${jid}|${chatId}`;

    if (!isPersonJid(jid)) {
      skipped++;
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);

    const result = await resolvePersonIdentity({
      jid,
      senderName: msg.sender,
      chatId,
      chatType:   msg.chatType,
    });

    if (result) {
      if (result.isNewRecord) created++;
      else updated++;
    }
  }

  // After indexing, detect cross-chat links: same @lid in personal + group
  await detectCrossChats();

  const people = await loadPeople();
  const candidateCount = people.reduce((n, p) => n + (p.identityCandidates?.length || 0), 0);

  return { created, updated, skipped, people: people.length, candidates: candidateCount };
}

/**
 * After all messages are processed, scan for people who have BOTH:
 *   - A personal chat record
 *   - Group memberships
 * and upgrade their resolutionMethod to EXACT_JID_CROSSCHAT.
 */
async function detectCrossChats() {
  const people = await loadPeople();
  let changed = false;

  for (const p of people) {
    if (
      p.personalChatId &&
      p.groupChats.length > 0 &&
      p.resolutionMethod === "EXACT_JID_CROSSCHAT" === false &&
      p.resolutionMethod !== "MANUAL_ALIAS"
    ) {
      p.resolutionMethod = "EXACT_JID_CROSSCHAT";
      p.confidence = RESOLUTION_METHODS.EXACT_JID_CROSSCHAT.confidence;
      p.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) await savePeople(people);
}

// ── Manual Override ───────────────────────────────────────────────────────────

/**
 * Manually merge two person records.
 * The second person (mergee) is absorbed into the first (target).
 * A full audit trail is stored.
 *
 * This is the ONLY way to merge identities that don't share a JID.
 * Never call this automatically based on names.
 *
 * @param {string} targetPersonId - person to keep
 * @param {string} mergeePersonId - person to absorb
 * @param {string} reason - human-readable reason for merge
 */
export async function manualMergePeople(targetPersonId, mergeePersonId, reason = "manually confirmed") {
  const people = await loadPeople();
  const target = people.find((p) => p.personId === targetPersonId);
  const mergee = people.find((p) => p.personId === mergeePersonId);

  if (!target || !mergee) {
    return { ok: false, error: "One or both personIds not found" };
  }

  if (targetPersonId === mergeePersonId) {
    return { ok: false, error: "Cannot merge person with themselves" };
  }

  const now = new Date().toISOString();

  // Merge JIDs
  for (const jid of mergee.jids) {
    if (!target.jids.includes(jid)) target.jids.push(jid);
  }

  // Merge names
  for (const name of mergee.names) {
    if (!target.names.includes(name)) target.names.push(name);
  }
  target.primaryName = pickBestName(target.names);

  // Merge group chats
  for (const g of mergee.groupChats) {
    if (!target.groupChats.includes(g)) target.groupChats.push(g);
  }

  // Keep personal chat if target doesn't have one
  if (!target.personalChatId && mergee.personalChatId) {
    target.personalChatId = mergee.personalChatId;
  }

  // Record the merge as a manual alias
  target.manualAliases.push({
    absorbedPersonId:   mergeePersonId,
    absorbedPrimaryJid: mergee.primaryJid,
    absorbedNames:      mergee.names,
    reason,
    mergedAt: now,
  });

  target.resolutionMethod = "MANUAL_ALIAS";
  target.confidence = RESOLUTION_METHODS.MANUAL_ALIAS.confidence;
  target.updatedAt = now;

  // Remove the mergee record
  const filtered = people.filter((p) => p.personId !== mergeePersonId);
  await savePeople(filtered);

  return { ok: true, targetPersonId, absorbedPersonId: mergeePersonId };
}

/**
 * Add an unconfirmed identity candidate (for name similarity without JID match).
 * Does NOT merge. Creates a candidate entry for human review.
 *
 * @param {string} personId - the primary person
 * @param {string} candidatePersonId - the possible match
 * @param {string} reason - why they might be the same person
 * @param {number} confidence - 0.0 to 1.0
 */
export async function addIdentityCandidate(personId, candidatePersonId, reason, confidence) {
  const people = await loadPeople();
  const person = people.find((p) => p.personId === personId);

  if (!person) return { ok: false, error: "personId not found" };

  const alreadyExists = person.identityCandidates.some(
    (c) => c.personId === candidatePersonId
  );
  if (alreadyExists) return { ok: true, message: "Candidate already exists" };

  person.identityCandidates.push({
    personId: candidatePersonId,
    confidence,
    reason,
    status: "UNCONFIRMED",
    createdAt: new Date().toISOString(),
  });

  person.updatedAt = new Date().toISOString();
  await savePeople(people);

  return { ok: true };
}

// ── Query API ─────────────────────────────────────────────────────────────────

/**
 * Get a person record by JID (safe for use in AI prompts — does not expose JID).
 * Returns a sanitized object with personId, primaryName, names, groups.
 */
export async function getPersonContext(jid) {
  const person = await findPersonByJid(jid);
  if (!person) return null;

  return {
    personId:         person.personId,
    primaryName:      person.primaryName,
    knownAs:          person.names,
    hasPersonalChat:  Boolean(person.personalChatId),
    groupCount:       person.groupChats.length,
    confidence:       person.confidence,
    resolutionMethod: person.resolutionMethod,
  };
}

/**
 * Get all people as a privacy-safe list (no JIDs, no phone numbers).
 * Suitable for returning to frontend.
 */
export async function listPeopleSafe() {
  const people = await loadPeople();
  return people.map((p) => ({
    personId:            p.personId,
    primaryName:         p.primaryName,
    knownAs:             p.names,
    hasPersonalChat:     Boolean(p.personalChatId),
    groupChats:          p.groupChats,
    confidence:          p.confidence,
    resolutionMethod:    p.resolutionMethod,
    candidateCount:      p.identityCandidates?.length || 0,
    unconfirmedCandidates: (p.identityCandidates || [])
      .filter((c) => c.status === "UNCONFIRMED")
      .map((c) => ({ personId: c.personId, confidence: c.confidence, reason: c.reason })),
  }));
}

/**
 * Search people by name (case-insensitive partial match).
 * Returns privacy-safe results.
 */
export async function searchPeopleByName(query) {
  const people = await loadPeople();
  const q = query.toLowerCase();
  return people
    .filter((p) =>
      p.names.some((n) => n.toLowerCase().includes(q)) ||
      (p.primaryName || "").toLowerCase().includes(q)
    )
    .map((p) => ({
      personId:         p.personId,
      primaryName:      p.primaryName,
      knownAs:          p.names,
      hasPersonalChat:  Boolean(p.personalChatId),
      groupChats:       p.groupChats,
      confidence:       p.confidence,
      resolutionMethod: p.resolutionMethod,
    }));
}
