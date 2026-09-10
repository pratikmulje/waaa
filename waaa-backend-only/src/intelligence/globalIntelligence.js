/*
==============================================================================
WAAA - Global Intelligence & Cross-Chat Queries                       Phase 7
==============================================================================

Supports cross-chat questions and multi-chat range intelligence across all
eligible conversations.

Tier Gating:
- Default eligible tiers: STARRED, IMPORTANT, NORMAL
- Excluded tiers: LOW, IGNORED

Cost Control:
- Intent-specific questions (decisions, tasks, pending, urgent, blockers)
  extract directly from structured summary fields with ZERO Gemini calls.
- Natural language cross-chat rollups synthesize only existing structured
  summaries without re-reading raw message histories.
==============================================================================
*/

import { readCollection } from "../db/localStore.js";
import { loadChunks } from "./chunkSummarizer.js";
import { loadChatSummaries } from "./chatSummarizer.js";
import { classifyAllChats, TIERS } from "./chatRelevance.js";
import { resolveRange } from "./rangeResolver.js";
import { getCachedRangeSummary, setCachedRangeSummary } from "./rangeCache.js";
import { askAI } from "../ai/geminiClient.js";
import { getCooldownStatus } from "../ai/geminiCooldown.js";
import { getPhase7Metrics } from "./rangeSummarizer.js";

const EXCLUDED_TIERS = new Set([TIERS.LOW, TIERS.IGNORED]);

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Filter conversations by eligible intelligence tiers (STARRED, IMPORTANT, NORMAL).
 */
export async function getEligibleChats() {
  const classified = await classifyAllChats();
  return classified.filter((c) => !EXCLUDED_TIERS.has(c.tier));
}

/**
 * Executes a global cross-chat intelligence query.
 *
 * @param {object} params
 * @param {string} [params.query] - Natural query (e.g. "What happened today?", "What is urgent?")
 * @param {string} [params.range] - Preset or date range (e.g. "today", "last_7_days")
 * @param {string} [params.intent] - "SUMMARY" | "URGENT" | "PENDING" | "DECISIONS" | "TASKS" | "CHANGES"
 * @param {string} [params.topic] - Topic keyword filter (e.g. "SIH")
 * @param {boolean} [params.force] - Bypass cache
 * @param {Date} [params.referenceDate] - Reference date for time calculations
 * @returns {Promise<object>}
 */
export async function queryGlobalIntelligence(params = {}) {
  const { query = "", range, intent: forcedIntent, topic: forcedTopic, force = false, referenceDate = new Date() } = params;

  // 1. Resolve Range & Query Intent
  const resolved = resolveRange(query || range || "all", { referenceDate, topic: forcedTopic, intent: forcedIntent });
  const { startAt, endAt, label: rangeLabel, topic, intent } = resolved;
  const startTimeMs = startAt ? new Date(startAt).getTime() : 0;
  const endTimeMs = endAt ? new Date(endAt).getTime() : Infinity;

  // 2. Check Global Range Cache
  const targetId = topic ? `topic_${topic}` : "global";
  if (!force && intent === "SUMMARY") {
    const cached = await getCachedRangeSummary({
      scope: topic ? "topic" : "global",
      targetId,
      startAt,
      endAt,
      topic,
    });
    if (cached) {
      const metrics = getPhase7Metrics();
      metrics.cacheHits++;
      metrics.geminiCallsAvoided++;
      return {
        ...cached,
        fromCache: true,
        source: "range_cache",
      };
    }
  }

  // 3. Load Eligible Chats, Summaries, and Chunks
  const [eligibleChats, chatSummaries, chunks] = await Promise.all([
    getEligibleChats(),
    loadChatSummaries(),
    loadChunks(),
  ]);

  const eligibleChatIds = new Set(eligibleChats.map((c) => c.chatId));
  const chatNameMap = Object.fromEntries(eligibleChats.map((c) => [c.chatId, c.chatName || c.chatId]));

  // Filter chat summaries & chunks for eligible chats only
  const activeChatSummaries = chatSummaries.filter((s) => eligibleChatIds.has(s.chatId));
  const activeChunks = chunks.filter((c) => eligibleChatIds.has(c.chatId) && c.summary);

  // Filter by Time Range if specified
  const rangeChunks = activeChunks.filter((c) => {
    const cStart = new Date(c.firstMessageTime).getTime();
    const cEnd = new Date(c.lastMessageTime).getTime();
    return cEnd >= startTimeMs && cStart <= endTimeMs;
  });

  // Filter by Topic if specified
  const topicRegex = topic ? new RegExp(topic, "i") : null;
  const topicFilteredSummaries = topicRegex
    ? activeChatSummaries.filter(
        (s) =>
          topicRegex.test(s.currentTopic || "") ||
          topicRegex.test(s.summary || "") ||
          (s.importantEvents || []).some((e) => topicRegex.test(e))
      )
    : activeChatSummaries;

  const topicFilteredChunks = topicRegex
    ? rangeChunks.filter(
        (c) =>
          topicRegex.test(c.summary || "") ||
          (c.topics || []).some((t) => topicRegex.test(t)) ||
          (c.entities || []).some((e) => topicRegex.test(e))
      )
    : rangeChunks;

  // 4. Intent-Specific Structured Aggregation (GEMINI COST CONTROL: 0 Gemini Calls)
  if (
    intent === "DECISIONS" ||
    intent === "TASKS" ||
    intent === "USER_ACTIONS" ||
    intent === "WAITING_FOR" ||
    intent === "WAITING_ON_ME" ||
    intent === "DEADLINES" ||
    intent === "BLOCKERS" ||
    intent === "PENDING" ||
    intent === "URGENT" ||
    intent === "CHANGES"
  ) {
    const metrics = getPhase7Metrics();
    metrics.geminiCallsAvoided++;

    // Load structured actions from action store
    const { loadActions, extractActionIntelligence } = await import("./actionExtractor.js");
    let allActions = await loadActions();
    if (allActions.length === 0) {
      await extractActionIntelligence({ referenceDate });
      allActions = await loadActions();
    }

    // Filter by topic / project if specified
    if (topic) {
      const normTopic = topic.toLowerCase();
      allActions = allActions.filter(
        (a) =>
          (a.projectName && a.projectName.toLowerCase().includes(normTopic)) ||
          (a.projectId && a.projectId.toLowerCase().includes(normTopic)) ||
          (a.text && a.text.toLowerCase().includes(normTopic))
      );
    }

    let resultItems = [];
    let summaryText = "";

    if (intent === "USER_ACTIONS") {
      resultItems = allActions.filter((a) => a.responsibility === "user" && a.status !== "completed");
      summaryText = resultItems.length > 0
        ? `You have ${resultItems.length} active action(s)/task(s) to do.`
        : "You have no pending personal action items.";
    } else if (intent === "WAITING_FOR") {
      resultItems = allActions.filter((a) => a.responsibility === "waiting_for_person" && a.status !== "completed");
      summaryText = resultItems.length > 0
        ? `You are waiting for ${resultItems.length} item(s) from other people.`
        : "You are not waiting on any pending items from others.";
    } else if (intent === "WAITING_ON_ME") {
      resultItems = allActions.filter((a) => a.responsibility === "someone_waiting_for_user" && a.status !== "completed");
      summaryText = resultItems.length > 0
        ? `There are ${resultItems.length} item(s) where someone is waiting for you.`
        : "No one is currently waiting for your input.";
    } else if (intent === "DEADLINES") {
      resultItems = allActions.filter((a) => a.type === "deadline" || a.dueAt);
      summaryText = resultItems.length > 0
        ? `Found ${resultItems.length} tracked deadline(s).`
        : "No active deadlines recorded.";
    } else if (intent === "BLOCKERS") {
      resultItems = allActions.filter((a) => a.type === "blocker" || a.status === "blocked");
      summaryText = resultItems.length > 0
        ? `Found ${resultItems.length} active blocker(s).`
        : "No active blockers found.";
    } else if (intent === "DECISIONS") {
      resultItems = allActions.filter((a) => a.type === "decision");
      summaryText = resultItems.length > 0
        ? `Found ${resultItems.length} recorded decision(s).`
        : "No recorded decisions found.";
    } else if (intent === "TASKS") {
      resultItems = allActions.filter((a) => a.type === "task" && a.status !== "completed");
      summaryText = resultItems.length > 0
        ? `Found ${resultItems.length} active task(s).`
        : "No active tasks found.";
    } else if (intent === "PENDING" || intent === "URGENT") {
      resultItems = allActions.filter((a) => a.status === "pending" || a.status === "waiting" || a.priority === "high");
      summaryText = resultItems.length > 0
        ? `Found ${resultItems.length} pending or urgent item(s).`
        : "No pending or urgent items found.";
    } else if (intent === "CHANGES") {
      summaryText = "Checked recent conversation state changes.";
    }

    return {
      scope: topic ? "topic" : "global",
      targetId,
      intent,
      topic: topic || null,
      rangeLabel,
      timeRange: { startAt, endAt },
      summary: summaryText,
      itemsCount: resultItems.length,
      items: resultItems,
      eligibleChatsCount: eligibleChats.length,
      sourceChats: Array.from(new Set(resultItems.map((i) => i.chatId).filter(Boolean))),
      sourceChunks: Array.from(new Set(resultItems.map((i) => i.sourceChunkId).filter(Boolean))),
      geminiCalled: false,
      fromCache: false,
    };
  }

  // 5. Global Range Synthesis (Cross-chat summary)
  const summariesToRollup = topicFilteredSummaries.map((s) => ({
    chatId: s.chatId,
    chatName: chatNameMap[s.chatId] || s.chatId,
    topic: s.currentTopic,
    summary: s.summary,
    events: s.importantEvents || [],
    decisions: s.decisions || [],
    tasks: s.tasks || [],
  }));

  const chunksToRollup = topicFilteredChunks.map((c) => ({
    chunkId: c.chunkId,
    chatId: c.chatId,
    chatName: chatNameMap[c.chatId] || c.chatId,
    summary: c.summary,
    topics: c.topics || [],
    events: c.importantEvents || [],
  }));

  const metrics = getPhase7Metrics();
  metrics.existingSummaryReuse += summariesToRollup.length + chunksToRollup.length;

  if (summariesToRollup.length === 0 && chunksToRollup.length === 0) {
    metrics.geminiCallsAvoided++;
    return {
      scope: topic ? "topic" : "global",
      targetId,
      intent: "SUMMARY",
      topic: topic || null,
      rangeLabel,
      timeRange: { startAt, endAt },
      summary: "No relevant conversations or summaries found for the specified scope and range.",
      keyTopics: [],
      decisions: [],
      tasks: [],
      pendingItems: [],
      blockers: [],
      peopleInvolved: [],
      deadlines: [],
      sourceChats: [],
      sourceChunks: [],
      eligibleChatsCount: eligibleChats.length,
      fromCache: false,
    };
  }

  // Synthesize Global / Multi-Chat Summary using Gemini
  let synthesized;
  if (getCooldownStatus().inCooldown) {
    // Cooldown fallback without Gemini
    synthesized = {
      summary: summariesToRollup.map((s) => `[${s.chatName}]: ${s.summary}`).join("\n"),
      keyTopics: Array.from(new Set(summariesToRollup.map((s) => s.topic).filter(Boolean))),
      decisions: summariesToRollup.flatMap((s) => s.decisions),
      tasks: summariesToRollup.flatMap((s) => s.tasks),
      pendingItems: [],
      blockers: [],
      peopleInvolved: [],
      deadlines: [],
    };
  } else {
    metrics.geminiCallsMade++;

    const prompt = `You are WAAA's Global WhatsApp Intelligence Assistant.
Synthesize the following conversation summaries across all eligible chats for the requested time range (${startAt || "earliest"} to ${endAt || "latest"}).
${topic ? `Focus specifically on discussions related to the topic: "${topic}".` : ""}

CHAT SUMMARIES:
${summariesToRollup
  .slice(0, 15)
  .map(
    (s) =>
      `[Chat: ${s.chatName} (${s.chatId})]\n- Topic: ${s.topic || "General"}\n- Summary: ${s.summary}\n- Events: ${(s.events || []).join(", ") || "None"}`
  )
  .join("\n\n")}

${chunksToRollup.length > 0 ? `\nRELEVANT RECENT CHUNKS:\n` + chunksToRollup.slice(0, 10).map((c) => `[${c.chatName}]: ${c.summary}`).join("\n") : ""}

Respond with strictly valid JSON only:
{
  "summary": "High-level executive cross-chat summary answering what happened...",
  "keyTopics": ["topic1", "..."],
  "decisions": ["decision1", "..."],
  "tasks": ["task1", "..."],
  "pendingItems": ["pending1", "..."],
  "blockers": ["blocker1", "..."],
  "peopleInvolved": ["person1", "..."],
  "deadlines": ["deadline1", "..."],
  "recentChanges": "Cross-chat progression overview"
}`;

    const raw = await askAI({
      system: "You generate global WhatsApp intelligence rollups across multiple chat summaries into structured JSON. Always output valid JSON.",
      prompt,
      maxTokens: 1400,
    });

    synthesized = safeParseJSON(raw) || {
      summary: summariesToRollup.map((s) => s.summary).join(" "),
      keyTopics: [],
      decisions: [],
      tasks: [],
      pendingItems: [],
      blockers: [],
      peopleInvolved: [],
      deadlines: [],
    };
  }

  const result = {
    scope: topic ? "topic" : "global",
    targetId,
    intent: "SUMMARY",
    topic: topic || null,
    rangeLabel,
    timeRange: { startAt, endAt },
    summary: synthesized.summary || "",
    keyTopics: synthesized.keyTopics || [],
    decisions: synthesized.decisions || [],
    tasks: synthesized.tasks || [],
    pendingItems: synthesized.pendingItems || [],
    blockers: synthesized.blockers || [],
    peopleInvolved: synthesized.peopleInvolved || [],
    deadlines: synthesized.deadlines || [],
    recentChanges: synthesized.recentChanges || null,
    sourceChats: Array.from(new Set([...summariesToRollup.map((s) => s.chatId), ...chunksToRollup.map((c) => c.chatId)])),
    sourceChunks: chunksToRollup.map((c) => c.chunkId),
    eligibleChatsCount: eligibleChats.length,
    fromCache: false,
  };

  // Cache global summary
  await setCachedRangeSummary({
    scope: topic ? "topic" : "global",
    targetId,
    startAt,
    endAt,
    topic,
    ...result,
  });

  return result;
}
