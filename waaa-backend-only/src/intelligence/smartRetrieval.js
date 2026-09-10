/*
==============================================================================
WAAA - Smart Retrieval Layer                                           Phase 9
==============================================================================

Lightweight retrieval over existing Phase 6-8 intelligence with strict
cost-control ordering:

  1. Structured Phase 8 data (actions, projects)      -- 0 Gemini
  2. Cached Phase 7 range summaries                   -- 0 Gemini
  3. Chunk/chat summaries                             -- 0 Gemini
  4. Raw messages (fallback, limited)                 -- 0 Gemini
  5. Gemini synthesis (ONLY when above fails)         -- Gemini

Tier gating: excludes LOW and IGNORED by default.
Preserves source references throughout.
==============================================================================
*/

import { readCollection } from "../db/localStore.js";
import { loadActions } from "./actionExtractor.js";
import { loadProjects } from "./projectIntelligence.js";
import { loadChatSummaries } from "./chatSummarizer.js";
import { loadChunks } from "./chunkSummarizer.js";
import { loadRangeCache } from "./rangeCache.js";
import { classifyAllChats, TIERS } from "./chatRelevance.js";
import { resolveRange } from "./rangeResolver.js";
import { askAI } from "../ai/geminiClient.js";
import { getCooldownStatus } from "../ai/geminiCooldown.js";
import { getFilteredMediaAnalysis } from "./mediaStore.js";

const EXCLUDED_TIERS = new Set([TIERS.LOW, TIERS.IGNORED]);

const retrievalMetrics = {
  geminiCallsMade: 0,
  geminiCallsAvoided: 0,
  structuredHits: 0,
  cacheHits: 0,
  summaryHits: 0,
  rawMessageHits: 0,
  mediaHits: 0,
};

export function getRetrievalMetrics() { return { ...retrievalMetrics }; }

// Normalizes a query to detect known retrieval intents
export function detectRetrievalIntent(query) {
  const lower = String(query || "").toLowerCase();

  if (/summarize|summary|what happened|overview/i.test(lower) && /group|chat|message|conversation|discussion/i.test(lower)) return "SUMMARY";
  if (/what changed|recent(?:ly)?|latest|new(?:ly)?/i.test(lower)) return "CHANGES";
  if (/waiting for|waiting on me|someone waiting/i.test(lower)) return "WAITING";
  if (/blocker|stuck|impediment/i.test(lower)) return "BLOCKERS";
  if (/deadline|due|overdue/i.test(lower)) return "DEADLINES";
  if (/decision|agreed|decided/i.test(lower)) return "DECISIONS";
  if (/task|to.?do|pending/i.test(lower)) return "TASKS";
  if (/sih|vierp|waaa|feedback|project/i.test(lower)) return "PROJECT";
  if (/important|urgent|high.?priority/i.test(lower)) return "URGENT";
  if (/screenshot|image|photo|picture|pdf|document|attachment|sent.*pdf|pdf.*sent|in that (image|screenshot|pdf|photo|doc)/i.test(lower)) return "MEDIA";

  return "GENERAL";
}

// Extracts topic/person/project keyword from query
export function extractTopicFromQuery(query) {
  const lower = String(query || "").toLowerCase();

  // Named project
  const knownProjects = { sih: "SIH", vierp: "VIERP", waaa: "WAAA", feedback: "Feedback" };
  for (const [key, name] of Object.entries(knownProjects)) {
    if (lower.includes(key)) return { kind: "project", value: name };
  }

  // "about X" / "with X" / "from X"
  const aboutMatch = query.match(/(?:about|with|from|for|of)\s+([A-Za-z][A-Za-z0-9 ]+?)(?:\?|$|,|\s+(?:and|or|in|at))/i);
  if (aboutMatch) return { kind: "topic", value: aboutMatch[1].trim() };

  // Capitalized word (excluding common sentence-starting question words)
  const capMatch = query.match(/\b([A-Z][a-z]{2,})\b/);
  if (capMatch && !/^(What|Where|When|Who|Why|How|Which|Does|Did|Can|Could|Should|Would|Any|Show|Tell)$/i.test(capMatch[1])) {
    return { kind: "person_or_topic", value: capMatch[1] };
  }

  return null;
}

/**
 * Executes a smart retrieval query.
 *
 * @param {object} params
 * @param {string} params.query - Natural language query
 * @param {string} [params.range] - Time range preset
 * @param {string} [params.chatId] - Limit to specific chat
 * @param {string} [params.projectId] - Limit to specific project
 * @param {string} [params.person] - Limit to specific person
 * @param {boolean} [params.forceGemini] - Force Gemini synthesis
 * @returns {Promise<object>}
 */
export async function smartRetrieve(params = {}) {
  const {
    query = "",
    range,
    chatId,
    projectId,
    person,
    forceGemini = false,
    referenceDate = new Date(),
    userId = null,
  } = params;

  const intent = detectRetrievalIntent(query);
  const topicHint = extractTopicFromQuery(query);

  // Get eligible chats (respects tier gating)
  const classified = await classifyAllChats();
  const eligibleChats = classified.filter((c) => !EXCLUDED_TIERS.has(c.tier));
  const eligibleChatIds = new Set(eligibleChats.map((c) => c.chatId));

  const sources = [];
  let answer = null;
  let items = [];

  // ── TIER 0: Media Analysis (Phase 10) — 0 Gemini ──────────────────────────
  // For media-intent queries (screenshot, pdf, image, document), search
  // existing mediaAnalysis records before anything else.
  const mediaFilters = {};
  if (chatId) mediaFilters.chatId = chatId;
  if (person) mediaFilters.sender = person;
  const topicHintValue = topicHint?.value?.toLowerCase();
  if (topicHintValue && !/^(screenshot|image|photo|picture|pdf|document|doc)$/i.test(topicHintValue)) {
    mediaFilters.topic = topicHintValue;
  }
  if (params.startAt) mediaFilters.startAt = params.startAt;
  if (params.endAt) mediaFilters.endAt = params.endAt;

  // Detect media-type filter from query
  const qLower = String(query).toLowerCase();
  if (/\bpdf\b|document/.test(qLower)) mediaFilters.mediaType = "pdf";
  else if (/screenshot|image|photo|picture/.test(qLower)) mediaFilters.mediaType = "image";

  let mediaResults = await getFilteredMediaAnalysis(mediaFilters);
  if (userId) {
    mediaResults = mediaResults.filter((r) => !r.userId || r.userId === userId);
  }

  if (mediaResults.length > 0) {
    retrievalMetrics.mediaHits++;
    retrievalMetrics.geminiCallsAvoided++;
    items = mediaResults;
    answer = mediaResults.slice(0, 5).map((r) => {
      const a = r.analysis || {};
      const desc = a.description || a.summary || "";
      return `[${r.mediaType.toUpperCase()} from ${r.sender} in ${r.chatName || r.chatId}]: ${desc}`;
    }).join("\n");
    sources.push("media_analysis");

    if (intent === "MEDIA" && !forceGemini) {
      return buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
    }
  }

  // ── TIER 1: Structured Phase 8 data (0 Gemini) ────────────────────────────
  const structuredResult = await tryStructuredRetrieval(intent, topicHint, chatId, projectId, person, eligibleChatIds, userId);
  if (structuredResult && (structuredResult.items.length > 0 || structuredResult.summary)) {
    retrievalMetrics.structuredHits++;
    retrievalMetrics.geminiCallsAvoided++;
    items = structuredResult.items;
    answer = structuredResult.summary;
    sources.push("structured_actions");

    if (!forceGemini) {
      return buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
    }
  }

  // ── TIER 2: Cached Phase 7 range summaries (0 Gemini) ─────────────────────
  if (!answer && range) {
    const rangeCache = await loadRangeCache();
    const resolved = resolveRange(query || range, { referenceDate });
    const cachedEntry = rangeCache.find(
      (e) =>
        e.startAt === resolved.startAt &&
        e.endAt === resolved.endAt &&
        (!chatId || e.targetId === chatId || e.scope === "global")
    );
    if (cachedEntry && cachedEntry.summary) {
      retrievalMetrics.cacheHits++;
      retrievalMetrics.geminiCallsAvoided++;
      answer = cachedEntry.summary;
      items = [...(cachedEntry.tasks || []), ...(cachedEntry.decisions || []), ...(cachedEntry.blockers || [])];
      sources.push("range_cache");

      if (!forceGemini) {
        return buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
      }
    }
  }

  // ── TIER 3: Chat / Chunk summaries (0 Gemini) ─────────────────────────────
  if (!answer) {
    const [chatSummaries, chunks] = await Promise.all([loadChatSummaries(), loadChunks()]);

    const filteredSummaries = chatSummaries.filter((s) => {
      if (!eligibleChatIds.has(s.chatId)) return false;
      if (chatId && s.chatId !== chatId) return false;
      return true;
    });
    const filteredChunks = chunks.filter((c) => {
      if (!eligibleChatIds.has(c.chatId)) return false;
      if (chatId && c.chatId !== chatId) return false;
      return c.summary;
    });

    // Topic filter
    const topicFilter = topicHint?.value?.toLowerCase() || person?.toLowerCase();
    const topicSummaries = topicFilter
      ? filteredSummaries.filter((s) =>
          (s.summary || "").toLowerCase().includes(topicFilter) ||
          (s.currentTopic || "").toLowerCase().includes(topicFilter) ||
          (s.importantEvents || []).some((e) => e.toLowerCase().includes(topicFilter))
        )
      : filteredSummaries;

    if (topicSummaries.length > 0 || filteredChunks.length > 0) {
      retrievalMetrics.summaryHits++;
      retrievalMetrics.geminiCallsAvoided++;

      const summaryLines = topicSummaries.slice(0, 8).map((s) =>
        `[${s.chatName || s.chatId}]: ${s.summary || "No summary"}`
      );
      const chunkLines = filteredChunks.slice(0, 5).map((c) => `[chunk]: ${c.summary}`);

      answer = [...summaryLines, ...chunkLines].join("\n");
      items = topicSummaries.flatMap((s) => [
        ...(s.tasks || []),
        ...(s.blockers || []),
        ...(s.decisions || []),
      ]);
      sources.push("chat_summaries", "chunk_summaries");

      if (!forceGemini) {
        return buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
      }
    }
  }

  // ── TIER 4: Raw messages (limited fallback, 0 Gemini) ─────────────────────
  if (!answer && (chatId || topicHint)) {
    const allMessages = await readCollection("messages");
    const target = topicHint?.value?.toLowerCase() || person?.toLowerCase() || "";

    const matchedMessages = allMessages
      .filter((m) => {
        if (userId && m.userId && m.userId !== userId) return false;
        if (!eligibleChatIds.has(m.chatId)) return false;
        if (chatId && m.chatId !== chatId) return false;
        if (target && !String(m.text || "").toLowerCase().includes(target)) return false;
        return true;
      })
      .slice(-20); // Latest 20 messages only

    if (matchedMessages.length > 0) {
      retrievalMetrics.rawMessageHits++;
      retrievalMetrics.geminiCallsAvoided++;
      answer = matchedMessages
        .slice(-5)
        .map((m) => `[${m.sender || m.senderJid}]: ${m.text || ""}`)
        .join("\n");
      items = matchedMessages;
      sources.push("raw_messages");

      if (!forceGemini) {
        return buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
      }
    }
  }

  // ── TIER 5: Gemini synthesis (only when required) ─────────────────────────
  if (!answer || forceGemini) {
    if (getCooldownStatus().inCooldown) {
      answer = answer || "No structured data found. Gemini is in cooldown — unable to synthesize.";
      return buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
    }

    retrievalMetrics.geminiCallsMade++;

    const contextBlob = items.slice(0, 10).map((i) => JSON.stringify(i)).join("\n");
    const prompt = `You are WAAA's Smart Retrieval Assistant. Answer this query concisely using ONLY the provided context.

Query: "${query}"

Context:
${contextBlob || answer || "No context available."}

Instructions:
- Answer factually and directly.
- Do NOT hallucinate.
- If the answer is not in the context, say "No information found."`;

    const raw = await askAI({
      system: "You are a concise, factual WhatsApp intelligence assistant. Answer queries based strictly on provided data.",
      prompt,
      maxTokens: 600,
    });
    answer = raw;
    sources.push("gemini");

    return buildResult({ query, intent, answer, items, sources, geminiCalled: true, eligibleChatsCount: eligibleChats.length });
  }

  return buildResult({ query, intent, answer: "No information found.", items: [], sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
}

async function tryStructuredRetrieval(intent, topicHint, chatId, projectId, person, eligibleChatIds, userId = null) {
  let [actions, projects] = await Promise.all([loadActions(), loadProjects()]);

  if (userId) {
    actions = actions.filter((a) => !a.userId || a.userId === userId);
    projects = projects.filter((p) => !p.userId || p.userId === userId);
  }

  // Filter by eligible chats + optional chatId scope
  let filteredActions = actions.filter((a) => {
    if (!eligibleChatIds.has(a.chatId) && a.chatId) return false;
    if (chatId && a.chatId !== chatId) return false;
    return true;
  });

  // Apply projectId or topic/person filter
  const topicFilter = topicHint?.value?.toLowerCase() || person?.toLowerCase();
  if (projectId) {
    filteredActions = filteredActions.filter((a) => a.projectId === projectId || (a.projectName || "").toLowerCase().includes(projectId.toLowerCase()));
  } else if (topicFilter) {
    // Check if it's a project
    const matchedProject = projects.find(
      (p) =>
        p.name.toLowerCase().includes(topicFilter) ||
        (p.aliases || []).some((a) => a.toLowerCase().includes(topicFilter))
    );
    if (matchedProject) {
      filteredActions = filteredActions.filter(
        (a) => a.projectId === matchedProject.projectId ||
          String(a.text || "").toLowerCase().includes(topicFilter)
      );
    } else if (person) {
      filteredActions = filteredActions.filter(
        (a) =>
          String(a.person || "").toLowerCase().includes(topicFilter) ||
          String(a.waitingFor || "").toLowerCase().includes(topicFilter) ||
          String(a.waitingOnUser || "").toLowerCase().includes(topicFilter)
      );
    } else {
      filteredActions = filteredActions.filter((a) =>
        String(a.text || "").toLowerCase().includes(topicFilter)
      );
    }
  }

  // Intent routing
  let items = [];
  let summary = "";

  switch (intent) {
    case "CHANGES":
      items = filteredActions.filter((a) => a.status !== "completed").slice(0, 20);
      summary = items.length > 0 ? `Found ${items.length} recent active item(s).` : "";
      break;
    case "WAITING":
      items = filteredActions.filter((a) => a.responsibility === "waiting_for_person" || a.responsibility === "someone_waiting_for_user");
      summary = items.length > 0 ? `Found ${items.length} waiting item(s).` : "No waiting items.";
      break;
    case "BLOCKERS":
      items = filteredActions.filter((a) => a.type === "blocker" || a.status === "blocked");
      summary = items.length > 0 ? `Found ${items.length} blocker(s).` : "No blockers found.";
      break;
    case "DEADLINES":
      items = filteredActions.filter((a) => a.type === "deadline" || a.dueAt);
      summary = items.length > 0 ? `Found ${items.length} deadline(s).` : "No deadlines tracked.";
      break;
    case "DECISIONS":
      items = filteredActions.filter((a) => a.type === "decision");
      summary = items.length > 0 ? `Found ${items.length} decision(s).` : "No decisions recorded.";
      break;
    case "TASKS":
      items = filteredActions.filter((a) => a.type === "task" && a.status !== "completed");
      summary = items.length > 0 ? `Found ${items.length} active task(s).` : "No active tasks.";
      break;
    case "URGENT":
      items = filteredActions.filter((a) => a.priority === "high" || a.status === "blocked");
      summary = items.length > 0 ? `Found ${items.length} urgent/high-priority item(s).` : "No urgent items.";
      break;
    case "PROJECT":
      if (topicHint) {
        const proj = projects.find(
          (p) => p.name.toLowerCase().includes(topicFilter) ||
                 (p.aliases || []).some((a) => a.toLowerCase().includes(topicFilter))
        );
        if (proj) {
          items = [...(proj.tasks || []), ...(proj.blockers || []), ...(proj.decisions || [])];
          summary = `Project ${proj.name} (${proj.currentState}): ${items.length} items tracked.`;
        }
      }
      break;
    default:
      break;
  }

  return { items, summary };
}

function buildResult({ query, intent, answer, items, sources, geminiCalled, eligibleChatsCount }) {
  return {
    query,
    intent,
    answer,
    itemsCount: items.length,
    items,
    sources,
    geminiCalled,
    eligibleChatsCount,
    retrievedAt: new Date().toISOString(),
    metrics: getRetrievalMetrics(),
  };
}
