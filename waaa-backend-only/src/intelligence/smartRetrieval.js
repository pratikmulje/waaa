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
import {
  foldUnicodeName,
  normalizeQueryTypos,
  resolveDisplayName,
  sanitizeItemSource,
  isRawJid,
} from "./identityResolver.js";
import { synthesizeSemanticSummary } from "./semanticSummarizer.js";

const EXCLUDED_TIERS = new Set([TIERS.LOW, TIERS.IGNORED]);

const retrievalMetrics = {
  geminiCallsMade: 0,
  geminiCallsAvoided: 0,
  structuredHits: 0,
  cacheHits: 0,
  summaryHits: 0,
  rawMessageHits: 0,
  mediaHits: 0,
  attentionHits: 0,
};

export function getRetrievalMetrics() { return { ...retrievalMetrics }; }

// Normalizes a query to detect known retrieval intents
export function detectRetrievalIntent(query) {
  const clean = normalizeQueryTypos(String(query || "").trim());
  const lower = clean.toLowerCase();

  // 1. Attention / Important / Action needed
  if (/(?:attention|need.*attention|require.*attention|important|urgent|priority|what should i (?:look at|check)|what did i miss|what is important|needs? action)/i.test(lower)) {
    return "ATTENTION";
  }

  // 2. Summary
  if (/(?:summarize|summarise|summary|overview|recap|what happened|what was discussed|what did they discuss|chats? of|messages? of)/i.test(lower)) {
    return "SUMMARY";
  }

  if (/what changed|recent(?:ly)?|latest|new(?:ly)?/i.test(lower)) return "CHANGES";
  if (/waiting for|waiting on me|someone waiting/i.test(lower)) return "WAITING";
  if (/blocker|stuck|impediment/i.test(lower)) return "BLOCKERS";
  if (/deadline|due|overdue/i.test(lower)) return "DEADLINES";
  if (/decision|agreed|decided/i.test(lower)) return "DECISIONS";
  if (/task|to.?do|pending/i.test(lower)) return "TASKS";
  if (/sih|vierp|waaa|feedback|project/i.test(lower)) return "PROJECT";
  if (/screenshot|image|photo|picture|pdf|document|attachment|sent.*pdf|pdf.*sent|in that (image|screenshot|pdf|photo|doc)/i.test(lower)) return "MEDIA";
  if (/(?:show|find|search|get|see)\s+(?:all\s+)?(?:the\s+)?(?:recent\s+|important\s+)?messages?/i.test(lower)) return "MESSAGES";
  if (/what\s+did\s+.+\s+(?:say|tell|send|write|discuss)/i.test(lower)) return "MESSAGES";

  return "GENERAL";
}

// Extracts topic/person/project keyword from query
export function extractTopicFromQuery(query) {
  const clean = normalizeQueryTypos(String(query || "").trim());
  const lower = clean.toLowerCase();

  // 1. Named projects
  const knownProjects = { sih: "SIH", vierp: "VIERP", waaa: "WAAA", feedback: "Feedback" };
  for (const [key, name] of Object.entries(knownProjects)) {
    if (lower.includes(key)) return { kind: "project", value: name };
  }

  // 2. from/in/about [Name] group/chat
  const groupMatch = clean.match(/(?:from|in|about|regarding|with)\s+(?:the\s+)?([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)?)\s+(?:group|chat|channel|conversation)/i);
  if (groupMatch) {
    const rawVal = groupMatch[1].replace(/^(the|my|our)\s+/i, "").trim();
    if (rawVal && !/^(group|chat|channel|whatsapp|recent|today|yesterday|chats|messages)$/i.test(rawVal)) {
      return { kind: "chat_or_topic", value: rawVal };
    }
  }

  // 3. chats of / messages from/by/with [Person]
  const ofMatch = clean.match(/(?:chats?|messages?|conversations?)\s+(?:of|from|by|with)\s+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)?)/i);
  if (ofMatch) {
    const rawVal = ofMatch[1].replace(/^(the|my|our)\s+/i, "").trim();
    if (rawVal && !/^(group|chat|channel|whatsapp|recent|today|yesterday)$/i.test(rawVal)) {
      return { kind: "person", value: rawVal };
    }
  }

  // 4. [Person]'s chats / messages
  const aposMatch = clean.match(/\b([A-Za-z0-9_\-]+)'s\s+(?:chats?|messages?|updates?|conversations?)/i);
  if (aposMatch) {
    const rawVal = aposMatch[1].replace(/^(the|my|our|today|yesterday)\s+/i, "").trim();
    if (rawVal && !/^(group|chat|channel|whatsapp|recent|today|yesterday|what|show|give)$/i.test(rawVal)) {
      return { kind: "person", value: rawVal };
    }
  }

  // 5. summarize [Name] group/chat
  const summGroupMatch = clean.match(/(?:summarize|summarise|summary|overview|recap)\s+(?:the\s+)?([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)?)\s+(?:group|channel|chat)\b/i);
  if (summGroupMatch) {
    const rawVal = summGroupMatch[1].replace(/^(the|my|our)\s+/i, "").trim();
    if (rawVal && !/^(group|chat|channel|whatsapp|recent|today|yesterday)$/i.test(rawVal)) {
      return { kind: "chat_or_topic", value: rawVal };
    }
  }

  // 6. what did [Person] say/send/discuss
  const sayMatch = clean.match(/what\s+did\s+([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)?)\s+(?:say|tell|send|post|write|discuss)/i);
  if (sayMatch) {
    return { kind: "person", value: sayMatch[1].trim() };
  }

  // 7. what happened in [Topic/Group]
  const inMatch = clean.match(/(?:what\s+happened\s+in|what's\s+new\s+in|updates?\s+(?:in|on|for))\s+(?:the\s+)?([A-Za-z0-9_\-]+(?:\s+[A-Za-z0-9_\-]+)?)/i);
  if (inMatch) {
    const rawVal = inMatch[1].replace(/^(the|my|our)\s+/i, "").replace(/\s+(group|chat|channel)$/i, "").trim();
    if (rawVal && !/^(group|groups|chat|chats|channel|channels|whatsapp|recent|today|yesterday|this)$/i.test(rawVal)) {
      return { kind: "topic", value: rawVal };
    }
  }

  // 8. Capitalized word (excluding common question/sentence starters)
  const capMatch = clean.match(/\b([A-Z][a-z0-9_\-]{2,})\b/);
  if (capMatch && !/^(What|Where|When|Who|Why|How|Which|Does|Did|Can|Could|Should|Would|Any|Show|Tell|Give|Find|List|Summarize|Summarise|Summerise|Explain)$/i.test(capMatch[1])) {
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

  // ── TIER 0.5: Important / Attention Messages (0 Gemini) ──────────────────
  if (intent === "ATTENTION") {
    const allMessages = await readCollection("messages");
    const isToday = /\btoday\b/i.test(query);

    let importantMessages = allMessages.filter((m) => {
      if (userId && m.userId && m.userId !== userId) return false;
      if (!eligibleChatIds.has(m.chatId)) return false;
      const score = m.importanceAnalysis?.finalScore ?? 0;
      const isHigh = m.importanceAnalysis?.level === "high";
      return score >= 50 || isHigh;
    });

    if (isToday) {
      const now = new Date(referenceDate);
      const todayYMD = now.toISOString().slice(0, 10);
      const todayFiltered = importantMessages.filter((m) => {
        const iso = m.createdAt?.iso || m.receivedAt || (m.createdAt ? new Date(m.createdAt).toISOString() : "");
        return iso.startsWith(todayYMD);
      });
      if (todayFiltered.length > 0) {
        importantMessages = todayFiltered;
      }
    }

    // Sort by importance score descending, then by date descending
    importantMessages.sort((a, b) => {
      const sa = a.importanceAnalysis?.finalScore ?? 0;
      const sb = b.importanceAnalysis?.finalScore ?? 0;
      if (sb !== sa) return sb - sa;
      const ta = new Date(a.createdAt?.iso || a.receivedAt || 0).getTime();
      const tb = new Date(b.createdAt?.iso || b.receivedAt || 0).getTime();
      return tb - ta;
    });

    if (importantMessages.length > 0) {
      retrievalMetrics.attentionHits++;
      retrievalMetrics.geminiCallsAvoided++;
      items = importantMessages.slice(0, 10);

      const lines = await Promise.all(
        importantMessages.slice(0, 6).map(async (m) => {
          const chatName = await resolveDisplayName(m.chatName || m.chatId);
          const sender = await resolveDisplayName(m.sender || m.senderJid);
          const score = m.importanceAnalysis?.finalScore ?? "N/A";
          const level = m.importanceAnalysis?.level || "important";
          const reasons = (m.importanceAnalysis?.reasons || []).slice(0, 2).join("; ");
          const textExcerpt = (m.text || "").replace(/\n+/g, " ").slice(0, 140);
          return `• [${chatName}] ${sender}: "${textExcerpt}" (Priority: ${level}, Score: ${score}/100${reasons ? ` — ${reasons}` : ""})`;
        })
      );

      answer = `Here are the important messages needing your attention${isToday ? " for today" : ""}:\n\n` + lines.join("\n\n");
      sources.push("important_messages");

      if (!forceGemini) {
        return await buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
      }
    } else {
      answer = `No urgent or high-importance messages found${isToday ? " for today" : ""}. You are all caught up!`;
      sources.push("important_messages");
      return await buildResult({ query, intent, answer, items: [], sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
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
      return await buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
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
        return await buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
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
    const topicFilter = topicHint?.value || person || "";
    const topicFolded = foldUnicodeName(topicFilter);

    const topicSummaries = topicFilter
      ? filteredSummaries.filter((s) => {
          const cName = (s.chatName || "").toLowerCase();
          const summ = (s.summary || "").toLowerCase();
          const curTop = (s.currentTopic || "").toLowerCase();
          const targetLower = topicFilter.toLowerCase();
          return (
            cName.includes(targetLower) ||
            foldUnicodeName(s.chatName).includes(topicFolded) ||
            summ.includes(targetLower) ||
            curTop.includes(targetLower) ||
            (s.importantEvents || []).some((e) => e.toLowerCase().includes(targetLower))
          );
        })
      : filteredSummaries;

    if (topicSummaries.length > 0 || (filteredChunks.length > 0 && !topicFilter)) {
      retrievalMetrics.summaryHits++;
      retrievalMetrics.geminiCallsAvoided++;

      const summaryLines = await Promise.all(
        topicSummaries.slice(0, 8).map(async (s) => {
          const resolvedName = await resolveDisplayName(s.chatName || s.chatId);
          return `[${resolvedName}]: ${s.summary || "No summary"}`;
        })
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
        return await buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
      }
    }
  }

  // ── TIER 4: Semantic Summaries & Messages (0 Gemini / Semantic Synthesis) ─
  if (!answer && (chatId || topicHint || intent === "SUMMARY" || intent === "MESSAGES" || person)) {
    const allMessages = await readCollection("messages");
    const target = topicHint?.value || person || "";
    const targetFolded = foldUnicodeName(target);
    const targetLower = target.toLowerCase();

    const isGroupSummary =
      /\b(?:my\s+|our\s+)?groups?\b/i.test(query) ||
      targetLower === "groups" ||
      (intent === "SUMMARY" && !target && !chatId);

    let matchedMessages = [];

    if (isGroupSummary) {
      const allConversations = await readCollection("conversations");
      const groupChatIds = new Set(
        allConversations
          .filter((c) => c.chatType === "group" || c.chatId?.endsWith("@g.us"))
          .map((c) => c.chatId)
      );

      matchedMessages = allMessages
        .filter((m) => {
          if (userId && m.userId && m.userId !== userId) return false;
          if (!eligibleChatIds.has(m.chatId)) return false;
          return groupChatIds.has(m.chatId) || m.chatId?.endsWith("@g.us");
        })
        .slice(-50);
    } else {
      matchedMessages = allMessages
        .filter((m) => {
          if (userId && m.userId && m.userId !== userId) return false;
          if (!eligibleChatIds.has(m.chatId)) return false;
          if (chatId && m.chatId !== chatId) return false;
          if (target) {
            const matchChat = (m.chatName || "").toLowerCase().includes(targetLower) || foldUnicodeName(m.chatName).includes(targetFolded);
            const matchSender = (m.sender || "").toLowerCase().includes(targetLower) || foldUnicodeName(m.sender).includes(targetFolded);
            const matchText = String(m.text || "").toLowerCase().includes(targetLower) || foldUnicodeName(m.text).includes(targetFolded);
            if (!matchChat && !matchSender && !matchText) return false;
          }
          return true;
        })
        .slice(-40);
    }

    if (matchedMessages.length > 0) {
      if (intent === "SUMMARY") {
        const targetType = isGroupSummary
          ? "groups"
          : (person || topicHint?.kind === "person" ? "person" : "chat");
        const targetName = isGroupSummary ? "groups" : target;

        const { summary: semanticSummary, geminiCalled } = await synthesizeSemanticSummary({
          query,
          messages: matchedMessages,
          targetType,
          targetName,
        });

        answer = semanticSummary;
        items = matchedMessages;
        sources.push(isGroupSummary ? "group_intelligence" : "chat_intelligence");

        if (geminiCalled) {
          retrievalMetrics.geminiCallsMade++;
        } else {
          retrievalMetrics.geminiCallsAvoided++;
        }

        return await buildResult({
          query,
          intent,
          answer,
          items,
          sources,
          geminiCalled,
          eligibleChatsCount: eligibleChats.length,
        });
      }

      // Non-summary intent (e.g. MESSAGES): format raw lines
      retrievalMetrics.rawMessageHits++;
      retrievalMetrics.geminiCallsAvoided++;

      const formattedLines = await Promise.all(
        matchedMessages.slice(-10).map(async (m) => {
          const sender = await resolveDisplayName(m.sender || m.senderJid);
          const chatName = await resolveDisplayName(m.chatName || m.chatId);
          return `[${chatName} | ${sender}]: ${m.text || ""}`;
        })
      );

      answer = formattedLines.join("\n");
      items = matchedMessages;
      sources.push("raw_messages");

      if (!forceGemini) {
        return await buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
      }
    }
  }

  // ── TIER 5: Gemini synthesis (only when required) ─────────────────────────
  if (!answer || forceGemini) {
    if (getCooldownStatus().inCooldown) {
      answer = answer || "No structured data found. Gemini is in cooldown — unable to synthesize.";
      return await buildResult({ query, intent, answer, items, sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
    }

    retrievalMetrics.geminiCallsMade++;

    const sanitizedItems = await Promise.all(items.slice(0, 10).map(sanitizeItemSource));
    const contextBlob = sanitizedItems.map((i) => JSON.stringify(i)).join("\n");
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

    return await buildResult({ query, intent, answer, items, sources, geminiCalled: true, eligibleChatsCount: eligibleChats.length });
  }

  return await buildResult({ query, intent, answer: "No information found.", items: [], sources, geminiCalled: false, eligibleChatsCount: eligibleChats.length });
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
  const topicFilter = topicHint?.value || person || "";
  const topicFolded = foldUnicodeName(topicFilter);
  const topicLower = topicFilter.toLowerCase();

  if (projectId) {
    filteredActions = filteredActions.filter((a) => a.projectId === projectId || (a.projectName || "").toLowerCase().includes(projectId.toLowerCase()));
  } else if (topicFilter) {
    // Check if it's a project
    const matchedProject = projects.find(
      (p) =>
        p.name.toLowerCase().includes(topicLower) ||
        (p.aliases || []).some((a) => a.toLowerCase().includes(topicLower))
    );
    if (matchedProject) {
      filteredActions = filteredActions.filter(
        (a) => a.projectId === matchedProject.projectId ||
          String(a.text || "").toLowerCase().includes(topicLower)
      );
    } else if (person || topicHint?.kind === "person") {
      filteredActions = filteredActions.filter(
        (a) =>
          String(a.person || "").toLowerCase().includes(topicLower) ||
          foldUnicodeName(a.person).includes(topicFolded) ||
          String(a.waitingFor || "").toLowerCase().includes(topicLower) ||
          String(a.waitingOnUser || "").toLowerCase().includes(topicLower)
      );
    } else {
      filteredActions = filteredActions.filter((a) =>
        String(a.text || "").toLowerCase().includes(topicLower)
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
    case "ATTENTION":
      items = filteredActions.filter((a) => a.priority === "high" || a.status === "blocked");
      summary = items.length > 0 ? `Found ${items.length} urgent/high-priority item(s).` : "No urgent items.";
      break;
    case "PROJECT":
      if (topicHint) {
        const proj = projects.find(
          (p) => p.name.toLowerCase().includes(topicLower) ||
                 (p.aliases || []).some((a) => a.toLowerCase().includes(topicLower))
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

async function buildResult({ query, intent, answer, items, sources, geminiCalled, eligibleChatsCount }) {
  const sanitizedItems = await Promise.all((items || []).map(sanitizeItemSource));
  return {
    query,
    intent,
    answer,
    itemsCount: sanitizedItems.length,
    items: sanitizedItems,
    sources,
    geminiCalled,
    eligibleChatsCount,
    retrievedAt: new Date().toISOString(),
    metrics: getRetrievalMetrics(),
  };
}
