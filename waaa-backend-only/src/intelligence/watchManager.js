/*
==============================================================================
WAAA - Watch System                                                    Phase 9
==============================================================================

Manages persistent "watches" -- user-defined interests in:
  - person
  - chat
  - project
  - topic/keyword
  - action/task
  - deadline
  - blocker
  - important/high-priority events

Stored in data/watches.json.
==============================================================================
*/

import { readCollection, writeCollection, genId } from "../db/localStore.js";
import { resolveCanonicalProjectId } from "./projectIntelligence.js";

const COLLECTION = "watches";

export const WATCH_TYPES = {
  PERSON: "person",
  CHAT: "chat",
  PROJECT: "project",
  TOPIC: "topic",
  ACTION: "action",
  DEADLINE: "deadline",
  BLOCKER: "blocker",
  IMPORTANT: "important",
};

const watchMetrics = {
  geminiCallsMade: 0,
  geminiCallsAvoided: 0,
  watchMatches: 0,
  alertsGenerated: 0,
  duplicateAlertsSuppressed: 0,
};

export function getWatchMetrics() { return { ...watchMetrics }; }
export function resetWatchMetrics() {
  Object.assign(watchMetrics, {
    geminiCallsMade: 0, geminiCallsAvoided: 0,
    watchMatches: 0, alertsGenerated: 0, duplicateAlertsSuppressed: 0,
  });
}

// ── Storage ─────────────────────────────────────────────────────────────────

export async function loadWatches() { return readCollection(COLLECTION); }
export async function saveWatches(watches) { return writeCollection(COLLECTION, watches); }

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function createWatch(params) {
  const watches = await loadWatches();
  const now = new Date().toISOString();

  let resolvedProjectId = params.projectId;
  if (params.type === WATCH_TYPES.PROJECT && params.target && !resolvedProjectId) {
    resolvedProjectId = resolveCanonicalProjectId(params.target);
  }

  const newWatch = {
    watchId: "watch_" + genId(),
    type: params.type || WATCH_TYPES.TOPIC,
    target: params.target || "",
    chatId: params.chatId || null,
    projectId: resolvedProjectId || null,
    person: params.person || null,
    topic: params.topic || (params.type === WATCH_TYPES.TOPIC ? params.target : null),
    conditions: params.conditions || {},
    priority: params.priority || "normal",
    tiers: params.tiers || ["starred", "important", "normal"],
    enabled: true,
    createdAt: now,
    updatedAt: now,
    lastTriggeredAt: null,
    triggerCount: 0,
  };

  watches.push(newWatch);
  await saveWatches(watches);
  return newWatch;
}

export async function updateWatch(watchId, updates) {
  const watches = await loadWatches();
  const watch = watches.find((w) => w.watchId === watchId);
  if (!watch) return null;

  const allowed = ["enabled", "conditions", "priority", "tiers", "topic", "person", "chatId", "projectId"];
  for (const key of allowed) {
    if (key in updates) watch[key] = updates[key];
  }
  watch.updatedAt = new Date().toISOString();
  await saveWatches(watches);
  return watch;
}

export async function deleteWatch(watchId) {
  const watches = await loadWatches();
  const idx = watches.findIndex((w) => w.watchId === watchId);
  if (idx === -1) return false;
  watches.splice(idx, 1);
  await saveWatches(watches);
  return true;
}

export async function getFilteredWatches(filters = {}) {
  const watches = await loadWatches();
  let result = watches;

  if (filters.enabled !== undefined) {
    const enabledBool = filters.enabled === "true" || filters.enabled === true;
    result = result.filter((w) => w.enabled === enabledBool);
  }
  if (filters.type) result = result.filter((w) => w.type === filters.type);
  if (filters.project) {
    const normProject = resolveCanonicalProjectId(filters.project);
    result = result.filter((w) => w.projectId === normProject ||
      (w.target && w.target.toLowerCase() === filters.project.toLowerCase()));
  }
  if (filters.person) {
    const lc = String(filters.person).toLowerCase();
    result = result.filter((w) => w.person && w.person.toLowerCase().includes(lc));
  }
  if (filters.chat) result = result.filter((w) => w.chatId === filters.chat);

  return result;
}

// ── Natural Language Watch Parsing ──────────────────────────────────────────

export function parseWatchCommand(text, context = {}) {
  const t = String(text || "").trim();
  const { knownProjects = ["SIH", "VIERP", "WAAA", "Feedback"], knownPeople = [] } = context;

  if (/^(?:show|list|what am i watching|my watches|show.*watches)/i.test(t)) {
    return { action: "list" };
  }
  if (/^(?:show\s+(?:my\s+)?alerts?|any\s+alerts?\??|unread\s+alerts?|show\s+unread|^alerts?\??$)/i.test(t)) {
    return { action: "alerts" };
  }

  const stopMatch = t.match(/^(?:stop watching|unwatch|remove watch(?:ing)?(?:\s+for)?)\s+(.+)/i);
  if (stopMatch) {
    const rawTarget = stopMatch[1].trim();
    return { action: "stop", target: rawTarget, params: resolveWatchTarget(rawTarget, knownProjects, knownPeople) };
  }

  const watchMatch = t.match(/^(?:watch|alert me (?:about|when|for)|notify me (?:about|when|for)|follow)\s+(.+)/i);
  if (watchMatch) {
    const rawTarget = watchMatch[1].trim();
    const params = resolveWatchTarget(rawTarget, knownProjects, knownPeople);
    return { action: "create", ...params, target: rawTarget };
  }

  return { action: "unknown", target: t };
}

function resolveWatchTarget(rawTarget, knownProjects, knownPeople) {
  const lower = rawTarget.toLowerCase();

  if (/\b(my deadlines?|deadlines?|due dates?)\b/i.test(lower)) return { type: WATCH_TYPES.DEADLINE };
  if (/\b(blockers?|stuck|impediments?)\b/i.test(lower)) return { type: WATCH_TYPES.BLOCKER };
  if (/\b(important|high.?priority|urgent)\b/i.test(lower)) return { type: WATCH_TYPES.IMPORTANT };

  const topicMatch = rawTarget.match(/(?:messages? about|discussion about|topic)\s+(.+)/i);
  if (topicMatch) return { type: WATCH_TYPES.TOPIC, topic: topicMatch[1].trim() };

  for (const proj of knownProjects) {
    if (new RegExp(`\\b${proj}\\b`, "i").test(rawTarget)) {
      return { type: WATCH_TYPES.PROJECT, projectId: resolveCanonicalProjectId(proj), person: null };
    }
  }
  for (const person of knownPeople) {
    if (new RegExp(`\\b${person}\\b`, "i").test(rawTarget)) {
      return { type: WATCH_TYPES.PERSON, person };
    }
  }
  if (/^[A-Z][a-z]+$/.test(rawTarget)) return { type: WATCH_TYPES.PERSON, person: rawTarget };
  if (/^[A-Z]{2,}$/.test(rawTarget)) return { type: WATCH_TYPES.PROJECT, projectId: resolveCanonicalProjectId(rawTarget) };

  return { type: WATCH_TYPES.TOPIC, topic: rawTarget };
}

// ── Watch Event Evaluation ───────────────────────────────────────────────────

export async function evaluateWatches(event) {
  watchMetrics.geminiCallsAvoided++;

  const watches = await loadWatches();
  const enabledWatches = watches.filter((w) => w.enabled);
  const matches = [];

  for (const watch of enabledWatches) {
    const matched = matchWatchToEvent(watch, event);
    if (matched) {
      watchMetrics.watchMatches++;
      matches.push({ watch, event, matchReason: matched });
    }
  }

  if (matches.length > 0) {
    const now = new Date().toISOString();
    const watchMap = new Map(watches.map((w) => [w.watchId, w]));
    for (const { watch } of matches) {
      const w = watchMap.get(watch.watchId);
      if (w) { w.lastTriggeredAt = now; w.triggerCount = (w.triggerCount || 0) + 1; }
    }
    await saveWatches(Array.from(watchMap.values()));
  }

  return matches;
}

function matchWatchToEvent(watch, event) {
  const { type: eventType, data } = event;
  switch (watch.type) {
    case WATCH_TYPES.PERSON:    return matchPersonWatch(watch, eventType, data);
    case WATCH_TYPES.CHAT:      return matchChatWatch(watch, eventType, data);
    case WATCH_TYPES.PROJECT:   return matchProjectWatch(watch, eventType, data);
    case WATCH_TYPES.TOPIC:     return matchTopicWatch(watch, eventType, data);
    case WATCH_TYPES.ACTION:    return matchActionWatch(watch, eventType, data);
    case WATCH_TYPES.DEADLINE:  return matchDeadlineWatch(watch, eventType, data);
    case WATCH_TYPES.BLOCKER:   return matchBlockerWatch(watch, eventType, data);
    case WATCH_TYPES.IMPORTANT: return matchImportantWatch(watch, eventType, data);
    default: return null;
  }
}

function matchPersonWatch(watch, eventType, data) {
  const personLower = String(watch.person || watch.target || "").toLowerCase();
  if (!personLower) return null;
  if (eventType === "message") {
    const sender = String(data.sender || data.senderName || "").toLowerCase();
    const text = String(data.text || "").toLowerCase();
    if (sender.includes(personLower)) return `Message from watched person: ${watch.person || watch.target}`;
    if (text.includes(personLower)) return `Watched person mentioned: ${watch.person || watch.target}`;
  }
  if (eventType === "action_update") {
    const text = String(data.text || "").toLowerCase();
    if (text.includes(personLower) ||
        String(data.person || "").toLowerCase().includes(personLower) ||
        String(data.waitingFor || "").toLowerCase().includes(personLower) ||
        String(data.waitingOnUser || "").toLowerCase().includes(personLower)) {
      return `Watched person involved in action: ${watch.person || watch.target}`;
    }
  }
  return null;
}

function matchChatWatch(watch, eventType, data) {
  if (!watch.chatId) return null;
  if (eventType === "message" && data.chatId === watch.chatId) return `New message in watched chat`;
  if (eventType === "action_update" && data.chatId === watch.chatId) return `Action update in watched chat`;
  return null;
}

function matchProjectWatch(watch, eventType, data) {
  const projectId = watch.projectId;
  const projectTarget = String(watch.target || "").toLowerCase();
  if (!projectId && !projectTarget) return null;

  const dataProjectId = data.projectId || (data.projectName ? resolveCanonicalProjectId(data.projectName) : null);
  const dataProjectText = String(data.projectName || data.text || "").toLowerCase();
  const isMatch = (dataProjectId && dataProjectId === projectId) ||
    (dataProjectText && projectTarget && dataProjectText.includes(projectTarget.toLowerCase()));

  if (!isMatch) return null;

  if (eventType === "action_update") {
    if (data.type === "blocker") return `New blocker in project ${watch.target}`;
    if (data.type === "deadline") return `New deadline in project ${watch.target}`;
    if (data.type === "decision") return `New decision in project ${watch.target}`;
    if (data.type === "task") return `New task in project ${watch.target}`;
    return `Project ${watch.target} changed`;
  }
  if (eventType === "project_change") return `Project ${watch.target} state changed: ${data.changeType || "update"}`;
  if (eventType === "message" && dataProjectText) return `New message about project ${watch.target}`;
  return null;
}

function matchTopicWatch(watch, eventType, data) {
  const topicLower = String(watch.topic || watch.target || "").toLowerCase();
  if (!topicLower) return null;
  const textToSearch = [data.text, data.summary, data.title, data.description]
    .filter(Boolean).join(" ").toLowerCase();
  if (textToSearch.includes(topicLower)) return `Watched topic "${watch.topic || watch.target}" mentioned`;
  return null;
}

function matchActionWatch(watch, eventType, data) {
  if (eventType !== "action_update") return null;
  const target = String(watch.target || "").toLowerCase();
  const actionText = String(data.text || "").toLowerCase();
  if (!target || !actionText) return null;
  if (actionText.includes(target)) return `Watched action updated: ${data.status}`;
  return null;
}

function matchDeadlineWatch(watch, eventType, data) {
  if (eventType === "deadline_check") {
    if (data.type === "approaching" || data.type === "overdue") {
      const projectFilter = watch.projectId;
      if (!projectFilter) return `Deadline ${data.type}: ${data.text}`;
      if (data.projectId === projectFilter) return `Deadline ${data.type} in ${watch.target}: ${data.text}`;
    }
  }
  if (eventType === "action_update" && (data.type === "deadline" || data.dueAt)) {
    return `New deadline detected: ${data.text}`;
  }
  return null;
}

function matchBlockerWatch(watch, eventType, data) {
  if (eventType === "action_update" && (data.type === "blocker" || data.status === "blocked")) {
    const projectFilter = watch.projectId;
    if (!projectFilter) return `New blocker detected: ${data.text}`;
    if (data.projectId === projectFilter) return `Blocker in watched project ${watch.target}: ${data.text}`;
    return `New blocker detected: ${data.text}`;
  }
  return null;
}

function matchImportantWatch(watch, eventType, data) {
  if (eventType === "message") {
    const tier = data.tier || data.intelligenceTier;
    const importance = data.importance || data.priority;
    if (tier === "starred" || tier === "important" || importance === "high" || data.isImportant) {
      return `Important event in ${data.chatName || data.chatId || "a chat"}`;
    }
  }
  return null;
}
