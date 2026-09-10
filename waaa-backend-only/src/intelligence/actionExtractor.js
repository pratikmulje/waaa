/*
==============================================================================
WAAA - Action, Task & Commitment Intelligence                          Phase 8
==============================================================================

Extracts, normalizes, and manages structured:
- Actions
- Tasks
- Commitments (user, waiting_for_person, someone_waiting_for_user, team)
- Deadlines
- Blockers
- Decisions

Stored in data/actions.json.

Design Principles:
1. Deterministic First: Extracts directly from existing chatSummaries and
   chunkSummaries before considering Gemini.
2. Responsibility Distinctions:
   - "user": user needs to do
   - "waiting_for_person": user is waiting for someone
   - "someone_waiting_for_user": someone is waiting for user
   - "team": team / shared task
   - "unassigned": third party / general task
3. Deadline Resolution: Resolves relative deadlines to ISO dates via rangeResolver.
4. Idempotent & Incremental: Updates existing records when completion/cancellation
   evidence appears without re-creating duplicates.
==============================================================================
*/

import { readCollection, writeCollection, genId } from "../db/localStore.js";
import { resolveRange } from "./rangeResolver.js";
import { loadChatSummaries } from "./chatSummarizer.js";
import { loadChunks } from "./chunkSummarizer.js";
import { askAI } from "../ai/geminiClient.js";
import { getCooldownStatus } from "../ai/geminiCooldown.js";

const COLLECTION = "actions";

// Metrics for Phase 8
const actionMetrics = {
  geminiCallsMade: 0,
  geminiCallsAvoided: 0,
  itemsExtracted: 0,
  itemsUpdated: 0,
};

export function getActionMetrics() {
  return { ...actionMetrics };
}

export function resetActionMetrics() {
  actionMetrics.geminiCallsMade = 0;
  actionMetrics.geminiCallsAvoided = 0;
  actionMetrics.itemsExtracted = 0;
  actionMetrics.itemsUpdated = 0;
}

export async function loadActions() {
  return readCollection(COLLECTION);
}

export async function saveActions(actions) {
  return writeCollection(COLLECTION, actions);
}

function normalizeKey(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Deterministically analyzes responsibility from task text.
 * @param {string} text
 * @param {string} [sender]
 * @returns {{ responsibility: string, waitingFor: string|null, waitingOnUser: string|null }}
 */
export function detectResponsibility(text, sender = "") {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();

  // 1. Someone waiting on user: "Aman is waiting for your confirmation", "Waiting for your approval"
  const waitingOnUserMatch = t.match(/([A-Za-z0-9_-]+)\s+is\s+waiting\s+for\s+(?:your|my|user|confirmation)/i);
  if (waitingOnUserMatch) {
    return { responsibility: "someone_waiting_for_user", waitingFor: null, waitingOnUser: waitingOnUserMatch[1] };
  }
  if (/(?:waiting for (?:your|my)\s+(?:confirmation|approval|reply|response|input)|please confirm|send me your)/i.test(lower)) {
    return { responsibility: "someone_waiting_for_user", waitingFor: null, waitingOnUser: sender || "Recipient" };
  }

  // 2. Waiting for someone: "Waiting for Rahul to send dataset", "Need Rahul to approve"
  const waitingForMatch = t.match(/(?:waiting for|pending from|need\s+([A-Za-z0-9_-]+)\s+to|expecting\s+from)\s+([A-Za-z0-9_-]+)/i);
  if (waitingForMatch) {
    const person = waitingForMatch[2] || waitingForMatch[1];
    if (person && !/^(you|your|me|my|us|our|it|this|the|confirmation|approval|a|an)$/i.test(person)) {
      return { responsibility: "waiting_for_person", waitingFor: person, waitingOnUser: null };
    }
  }

  // 3. User commitment: "I need to submit...", "I will send...", "I'll create..."
  if (/\b(i need to|i will|i'll|i have to|i must|my task|i'm going to|i should|assigned to me)\b/i.test(lower)) {
    return { responsibility: "user", waitingFor: null, waitingOnUser: null };
  }

  // 4. Team task: "We need to...", "Let's finish...", "Our team must..."
  if (/\b(we need to|we will|we'll|we have to|we must|let's|let us|our team)\b/i.test(lower)) {
    return { responsibility: "team", waitingFor: null, waitingOnUser: null };
  }

  return { responsibility: "unassigned", waitingFor: null, waitingOnUser: null };
}

/**
 * Extracts and resolves deadline from text.
 * @param {string} text
 * @param {Date} [refDate]
 * @returns {{ deadlineText: string|null, dueAt: string|null }}
 */
export function extractDeadline(text, refDate = new Date()) {
  const t = String(text || "");
  const lower = t.toLowerCase();

  const deadlinePatterns = [
    /\b(today)\b/i,
    /\b(tomorrow)\b/i,
    /\b(tonight)\b/i,
    /\b(?:by|before|on|due)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(?:by|before|on|due)\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)\b/i,
    /\b(?:in\s+(\d+)\s+days?)\b/i,
    /\b(this week|next week|end of week)\b/i,
    /\b(before submission|prior to meeting|deadline\s*:\s*[^\n,]+)/i,
  ];

  for (const pattern of deadlinePatterns) {
    const match = t.match(pattern);
    if (match) {
      const rawDeadline = match[0];
      const matchTerm = match[1] || match[0];
      try {
        const resolved = resolveRange(matchTerm, { referenceDate: refDate });
        return {
          deadlineText: rawDeadline,
          dueAt: resolved.endAt || resolved.startAt || null,
        };
      } catch {
        return { deadlineText: rawDeadline, dueAt: null };
      }
    }
  }

  return { deadlineText: null, dueAt: null };
}

/**
 * Detects status from text (pending, completed, cancelled, blocked, waiting).
 * @param {string} text
 * @param {string} defaultStatus
 * @returns {"pending" | "completed" | "cancelled" | "blocked" | "waiting"}
 */
export function detectStatus(text, defaultStatus = "pending") {
  const lower = String(text || "").toLowerCase();
  if (/\b(done|completed|finished|resolved|submitted|closed|verified)\b/i.test(lower)) {
    return "completed";
  }
  if (/\b(cancelled|canceled|dropped|abandoned|no longer needed|discarded)\b/i.test(lower)) {
    return "cancelled";
  }
  if (/\b(blocked|stuck|blocker|impediment|cannot proceed)\b/i.test(lower)) {
    return "blocked";
  }
  if (/\b(waiting|pending|awaiting|hold)\b/i.test(lower)) {
    return "waiting";
  }
  return defaultStatus;
}

/**
 * Detects project reference from text.
 * @param {string} text
 * @param {Array<string>} [knownProjects]
 * @returns {string|null}
 */
export function detectProjectName(text, knownProjects = ["SIH", "VIERP", "WAAA", "Feedback"]) {
  const t = String(text || "");
  for (const proj of knownProjects) {
    const regex = new RegExp(`\\b${proj}\\b`, "i");
    if (regex.test(t)) {
      return proj.toUpperCase();
    }
  }
  const match = t.match(/\b(?:project|initiative|hackathon)\s+([A-Za-z0-9_-]+)/i);
  if (match && !/^(the|a|this|that|an|meeting)$/i.test(match[1])) {
    return match[1].toUpperCase();
  }
  return null;
}

/**
 * Extracts and upserts action items from chat summaries and chunk summaries.
 *
 * @param {object} [options]
 * @param {string} [options.chatId] - specific chat or all
 * @param {boolean} [options.force] - re-extract
 * @param {Date} [options.referenceDate]
 * @returns {Promise<{ extracted: number, updated: number, total: number }>}
 */
export async function extractActionIntelligence(options = {}) {
  const { chatId, referenceDate = new Date() } = options;

  const [chatSummaries, chunks, existingActions] = await Promise.all([
    loadChatSummaries(),
    loadChunks(),
    loadActions(),
  ]);

  const targetSummaries = chatId ? chatSummaries.filter((s) => s.chatId === chatId) : chatSummaries;
  const targetChunks = chatId ? chunks.filter((c) => c.chatId === chatId) : chunks;

  const actionMap = new Map();
  for (const act of existingActions) {
    const key = `${act.chatId}:${act.type}:${normalizeKey(act.text)}`;
    actionMap.set(key, act);
  }

  let extractedCount = 0;
  let updatedCount = 0;
  const now = new Date().toISOString();

  // Helper to upsert an item
  function upsertItem(item) {
    const key = `${item.chatId}:${item.type}:${normalizeKey(item.text)}`;
    const existing = actionMap.get(key);

    if (existing) {
      let changed = false;
      // Update status if changed (e.g. from pending to completed)
      if (item.status && item.status !== existing.status) {
        existing.status = item.status;
        if (item.status === "completed") existing.completedAt = now;
        changed = true;
      }
      if (item.dueAt && item.dueAt !== existing.dueAt) {
        existing.dueAt = item.dueAt;
        existing.deadlineText = item.deadlineText || existing.deadlineText;
        changed = true;
      }
      if (item.projectName && !existing.projectName) {
        existing.projectName = item.projectName;
        existing.projectId = `proj_${normalizeKey(item.projectName)}`;
        changed = true;
      }
      if (changed) {
        existing.updatedAt = now;
        actionMap.set(key, existing);
        updatedCount++;
      }
    } else {
      const newItem = {
        id: `act_${genId()}`,
        type: item.type, // "task" | "action" | "commitment" | "deadline" | "blocker" | "decision"
        chatId: item.chatId,
        chatName: item.chatName || item.chatId,
        personId: item.personId || null,
        person: item.person || null,
        text: item.text,
        responsibility: item.responsibility || "unassigned",
        waitingFor: item.waitingFor || null,
        waitingOnUser: item.waitingOnUser || null,
        status: item.status || "pending",
        priority: item.priority || "normal",
        dueAt: item.dueAt || null,
        deadlineText: item.deadlineText || null,
        projectId: item.projectName ? `proj_${normalizeKey(item.projectName)}` : null,
        projectName: item.projectName || null,
        sourceMessageId: item.sourceMessageId || null,
        sourceChunkId: item.sourceChunkId || null,
        sourceSummaryId: item.sourceSummaryId || null,
        confidence: item.confidence || 0.95,
        createdAt: now,
        updatedAt: now,
        completedAt: item.status === "completed" ? now : null,
      };
      actionMap.set(key, newItem);
      extractedCount++;
    }
  }

  // 1. Extract from Chat Summaries (DETERMINISTIC - 0 Gemini Calls)
  for (const s of targetSummaries) {
    const cId = s.chatId;
    const cName = s.chatName || s.chatId;
    actionMetrics.geminiCallsAvoided++;

    // Extract Tasks
    if (Array.isArray(s.tasks)) {
      for (const t of s.tasks) {
        const resp = detectResponsibility(t);
        const dead = extractDeadline(t, referenceDate);
        const proj = detectProjectName(t);
        const stat = detectStatus(t, resp.responsibility.startsWith("waiting") ? "waiting" : "pending");

        upsertItem({
          type: "task",
          chatId: cId,
          chatName: cName,
          text: t,
          ...resp,
          ...dead,
          projectName: proj,
          status: stat,
          priority: stat === "blocked" ? "high" : "normal",
          sourceSummaryId: s.chatId,
        });
      }
    }

    // Extract Decisions
    if (Array.isArray(s.decisions)) {
      for (const d of s.decisions) {
        const proj = detectProjectName(d);
        upsertItem({
          type: "decision",
          chatId: cId,
          chatName: cName,
          text: d,
          responsibility: "team",
          projectName: proj,
          status: "completed",
          sourceSummaryId: s.chatId,
        });
      }
    }

    // Extract Blockers
    if (Array.isArray(s.blockers)) {
      for (const b of s.blockers) {
        const proj = detectProjectName(b);
        upsertItem({
          type: "blocker",
          chatId: cId,
          chatName: cName,
          text: b,
          responsibility: "unassigned",
          status: "blocked",
          priority: "high",
          projectName: proj,
          sourceSummaryId: s.chatId,
        });
      }
    }

    // Extract Pending Items
    if (Array.isArray(s.pendingItems)) {
      for (const p of s.pendingItems) {
        const resp = detectResponsibility(p);
        const dead = extractDeadline(p, referenceDate);
        const proj = detectProjectName(p);
        upsertItem({
          type: "commitment",
          chatId: cId,
          chatName: cName,
          text: p,
          ...resp,
          ...dead,
          projectName: proj,
          status: "waiting",
          sourceSummaryId: s.chatId,
        });
      }
    }

    // Extract Deadlines
    if (Array.isArray(s.deadlines)) {
      for (const dl of s.deadlines) {
        const dead = extractDeadline(dl, referenceDate);
        const proj = detectProjectName(dl);
        upsertItem({
          type: "deadline",
          chatId: cId,
          chatName: cName,
          text: dl,
          responsibility: "unassigned",
          ...dead,
          projectName: proj,
          status: "pending",
          priority: "high",
          sourceSummaryId: s.chatId,
        });
      }
    }
  }

  // 2. Extract from Chunk Summaries (Important events & topics)
  for (const chunk of targetChunks) {
    if (Array.isArray(chunk.importantEvents)) {
      for (const ev of chunk.importantEvents) {
        if (/meeting|deadline|submit|task|action|send|prepare|approve/i.test(ev)) {
          const resp = detectResponsibility(ev);
          const dead = extractDeadline(ev, referenceDate);
          const proj = detectProjectName(ev);
          const stat = detectStatus(ev, "pending");

          upsertItem({
            type: /decision/i.test(ev) ? "decision" : /deadline/i.test(ev) ? "deadline" : "action",
            chatId: chunk.chatId,
            chatName: chunk.chatId,
            text: ev,
            ...resp,
            ...dead,
            projectName: proj,
            status: stat,
            sourceChunkId: chunk.chunkId,
          });
        }
      }
    }
  }

  const allUpdated = Array.from(actionMap.values());
  await saveActions(allUpdated);

  actionMetrics.itemsExtracted += extractedCount;
  actionMetrics.itemsUpdated += updatedCount;

  return {
    extracted: extractedCount,
    updated: updatedCount,
    total: allUpdated.length,
  };
}

/**
 * Filter action items by various query parameters.
 */
export async function getFilteredActions(filters = {}) {
  const actions = await loadActions();
  let result = actions;

  if (filters.type) {
    result = result.filter((a) => a.type === filters.type);
  }
  if (filters.chatId) {
    result = result.filter((a) => a.chatId === filters.chatId);
  }
  if (filters.projectId) {
    result = result.filter((a) => a.projectId === filters.projectId || a.projectName === filters.projectId);
  }
  if (filters.status) {
    result = result.filter((a) => a.status === filters.status);
  }
  if (filters.responsibility) {
    result = result.filter((a) => a.responsibility === filters.responsibility);
  }
  if (filters.priority) {
    result = result.filter((a) => a.priority === filters.priority);
  }
  if (filters.person) {
    const p = String(filters.person).toLowerCase();
    result = result.filter(
      (a) =>
        (a.person && a.person.toLowerCase().includes(p)) ||
        (a.waitingFor && a.waitingFor.toLowerCase().includes(p)) ||
        (a.waitingOnUser && a.waitingOnUser.toLowerCase().includes(p))
    );
  }

  return result;
}

/**
 * Updates an action item's status (e.g. mark completed).
 */
export async function updateActionStatus(actionId, status) {
  const actions = await loadActions();
  const act = actions.find((a) => a.id === actionId);
  if (!act) return null;

  act.status = status;
  act.updatedAt = new Date().toISOString();
  if (status === "completed") {
    act.completedAt = act.updatedAt;
  }
  await saveActions(actions);
  return act;
}
