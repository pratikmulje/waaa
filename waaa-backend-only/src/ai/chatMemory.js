import { db } from "../firebase.js";

const MAX_TOPICS = 5;
const MAX_ENTITIES = 15;
const MAX_PENDING = 10;
const TOPIC_STALE_DAYS = 7;
const MAX_WORD_FREQ = 60; // max unique words tracked per chat

// Words too common to carry meaning — ignored in frequency tracking
const STOPWORDS = new Set([
  // English
  "the","a","an","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should",
  "may","might","shall","can","need","i","me","my","we","our","you",
  "your","he","him","his","she","her","it","its","they","them","their",
  "what","which","who","this","that","these","those","am","at","by",
  "for","in","of","on","to","up","as","or","and","but","not","with",
  "about","from","into","here","there","when","where","why","how",
  "all","some","just","then","than","too","very","so","also","only",
  // Hinglish / Marathi
  "hai","hain","tha","thi","ko","ka","ki","ke","se","me","mein",
  "bhi","hi","ho","hoga","kar","karo","karna","kiya","kiye","aur",
  "ya","toh","na","nahi","nhi","mat","haan","acha","okay","ok","kk",
  "bhai","yaar","dost","re","be","arre","oye","hmm","hm","lol","haha",
  "nice","good","bad","cool","great","send","please","can","get",
]);

function extractSignificantWords(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function toMillisSafe(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function emptyMemory(chatId) {
  return {
    chatId,
    activeTopics: [],
    entities: {},
    pending: [],
    wordFreq: {},
    recentSummary: null,
    updatedAt: null,
  };
}

export async function getChatMemory(chatId) {
  const doc = await db.collection("chatMemory").doc(chatId).get();

  if (!doc.exists) {
    return emptyMemory(chatId);
  }

  const data = doc.data();

  return {
    chatId,
    activeTopics: data.activeTopics || [],
    entities: data.entities || {},
    pending: data.pending || [],
    wordFreq: data.wordFreq || {},
    recentSummary: data.recentSummary || null,
    updatedAt: data.updatedAt || null,
  };
}

function pruneStaleTopics(topics) {
  const cutoff = Date.now() - TOPIC_STALE_DAYS * 24 * 60 * 60 * 1000;

  return topics
    .filter((t) => toMillisSafe(t.lastMentioned) >= cutoff)
    .slice(-MAX_TOPICS);
}

export function memoryMatchesText(memory, text) {
  const lower = text.toLowerCase();

  const topicHit = memory.activeTopics.some((t) =>
    lower.includes(t.topic.toLowerCase())
  );

  const entityHit = Object.keys(memory.entities).some((e) =>
    lower.includes(e.toLowerCase())
  );

  return topicHit || entityHit;
}

export function findMemoryMatches(memory, text) {
  if (!memory || !memory.entities || !Array.isArray(memory.activeTopics)) {
    return { matchedEntity: null, matchedTopic: null };
  }
  const lower = String(text || "").toLowerCase();

  const matchedEntity = Object.keys(memory.entities).find((e) =>
    lower.includes(e.toLowerCase())
  );

  const matchedTopic = memory.activeTopics.find((t) =>
    lower.includes(t.topic.toLowerCase())
  );

  return { matchedEntity, matchedTopic: matchedTopic?.topic };
}

export async function updateChatMemoryFromGemini(chatId, memory, geminiResult) {
  const now = new Date();

  let topics = [...memory.activeTopics];

  for (const topic of geminiResult.topics || []) {
    const idx = topics.findIndex(
      (t) => t.topic.toLowerCase() === String(topic).toLowerCase()
    );

    if (idx >= 0) {
      topics[idx] = { ...topics[idx], lastMentioned: now };
    } else {
      topics.push({
        topic,
        confidence: geminiResult.confidence ?? 0.5,
        lastMentioned: now,
      });
    }
  }

  topics = pruneStaleTopics(topics);

  const entities = { ...memory.entities };

  for (const entity of geminiResult.entities || []) {
    entities[entity] = {
      ...(entities[entity] || {}),
      lastMentioned: now,
      confidence: geminiResult.confidence ?? 0.5,
    };
  }

  const entityKeys = Object.keys(entities);

  if (entityKeys.length > MAX_ENTITIES) {
    const sorted = entityKeys.sort(
      (a, b) =>
        toMillisSafe(entities[a].lastMentioned) -
        toMillisSafe(entities[b].lastMentioned)
    );

    for (const key of sorted.slice(0, entityKeys.length - MAX_ENTITIES)) {
      delete entities[key];
    }
  }

  let pending = [...memory.pending];

  if (geminiResult.pendingResolved) {
    pending = pending.filter(
      (p) =>
        !p.what
          .toLowerCase()
          .includes(String(geminiResult.pendingResolved).toLowerCase())
    );
  }

  if (geminiResult.newPending) {
    pending.push({ what: geminiResult.newPending, since: now });
  }

  pending = pending.slice(-MAX_PENDING);

  const updated = {
    chatId,
    activeTopics: topics,
    entities,
    pending,
    recentSummary: geminiResult.contextSummary || memory.recentSummary,
    updatedAt: now,
  };

  await db.collection("chatMemory").doc(chatId).set(updated, { merge: false });

  return updated;
}

// ─── Word-frequency adaptive tracking ───────────────────────────────────────
// Every incoming message runs through updateWordFreq. Significant words are
// counted; once a word hits 2+ occurrences it becomes a "chat-specific signal"
// that boosts any future message containing it — without needing Gemini.

export async function updateWordFreq(chatId, text) {
  const words = extractSignificantWords(text);
  if (!words.length) return;

  const doc = await db.collection("chatMemory").doc(chatId).get();
  const existing = doc.exists ? (doc.data().wordFreq || {}) : {};

  const updated = { ...existing };
  const now = new Date();

  for (const word of words) {
    updated[word] = {
      count: (updated[word]?.count || 0) + 1,
      lastSeen: now,
    };
  }

  // Keep only the most recently seen words to cap storage
  const keys = Object.keys(updated);
  if (keys.length > MAX_WORD_FREQ) {
    const sorted = keys.sort(
      (a, b) =>
        toMillisSafe(updated[a].lastSeen) - toMillisSafe(updated[b].lastSeen)
    );
    for (const k of sorted.slice(0, keys.length - MAX_WORD_FREQ)) {
      delete updated[k];
    }
  }

  // Merge-write so we don't touch other memory fields
  await db
    .collection("chatMemory")
    .doc(chatId)
    .set({ wordFreq: updated }, { merge: true });
}

// Returns significant words from `text` that have appeared 2+ times in this
// chat's history. Used by the local scorer to boost repeated-topic messages.
export function getFreqMatches(memory, text) {
  const wordFreq = memory?.wordFreq || {};
  const words = extractSignificantWords(text);
  return words.filter((w) => (wordFreq[w]?.count || 0) >= 2);
}