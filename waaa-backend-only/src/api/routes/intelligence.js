import { Router } from "express";
import {
  TIERS,
  TIER_LABELS,
  TIER_GATES,
  VALID_TIERS,
  autoDetectTier,
  getIntelligenceTier,
  setIntelligenceTier,
  clearIntelligenceTierOverride,
  classifyAllChats,
} from "../../intelligence/chatRelevance.js";
import { db } from "../../firebase.js";
import { isValidSafeId, sanitizeInputString } from "../../intelligence/securityUtils.js";

const router = Router();

// Validate ID parameters across all intelligence endpoints
router.param("chatId", (req, res, next, val) => {
  if (!isValidSafeId(val)) {
    return res.status(400).json({ error: "Invalid chatId format." });
  }
  next();
});

router.param("watchId", (req, res, next, val) => {
  if (!isValidSafeId(val)) {
    return res.status(400).json({ error: "Invalid watchId format." });
  }
  next();
});

router.param("alertId", (req, res, next, val) => {
  if (!isValidSafeId(val)) {
    return res.status(400).json({ error: "Invalid alertId format." });
  }
  next();
});

router.param("messageId", (req, res, next, val) => {
  if (!isValidSafeId(val)) {
    return res.status(400).json({ error: "Invalid messageId format." });
  }
  next();
});

// ── GET /api/intelligence/chats ──────────────────────────────────────────────
// Returns all conversations classified by intelligence tier.
// Query params:
//   ?tier=starred|important|normal|low|ignored   filter by tier
//   ?source=user_override|auto_detected           filter by source
router.get("/chats", async (req, res) => {
  try {
    let chats = await classifyAllChats();

    if (req.query.tier && VALID_TIERS.includes(req.query.tier)) {
      chats = chats.filter((c) => c.tier === req.query.tier);
    }

    if (req.query.source) {
      chats = chats.filter((c) => c.source === req.query.source);
    }

    res.json({
      total: chats.length,
      tiers: Object.fromEntries(
        VALID_TIERS.map((t) => [t, chats.filter((c) => c.tier === t).length])
      ),
      chats,
    });
  } catch (err) {
    console.error("[API] /intelligence/chats error:", err);
    res.status(500).json({ error: "Failed to classify chats." });
  }
});

// ── GET /api/intelligence/chats/:chatId ──────────────────────────────────────
// Returns the tier for a single chat.
router.get("/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;

  try {
    const convDoc = await db.collection("conversations").doc(chatId).get();
    const chatMeta = convDoc.exists ? convDoc.data() : null;

    const result = await getIntelligenceTier(chatId, chatMeta);

    res.json({
      chatId,
      chatName: chatMeta?.chatName || chatId,
      ...result,
      tierLabel: TIER_LABELS[result.tier] ?? result.tier,
    });
  } catch (err) {
    console.error("[API] /intelligence/chats/:chatId error:", err);
    res.status(500).json({ error: "Failed to get chat tier." });
  }
});

// ── POST /api/intelligence/chats/:chatId/tier ────────────────────────────────
// Sets the intelligence tier for a chat (user override).
// Body: { tier: "starred"|"important"|"normal"|"low"|"ignored" }
//
// Does NOT affect priority/priorityLevel - those remain unchanged.
router.post("/chats/:chatId/tier", async (req, res) => {
  const { chatId } = req.params;
  const { tier } = req.body;

  if (!tier || !VALID_TIERS.includes(tier)) {
    return res.status(400).json({
      error: `tier must be one of: ${VALID_TIERS.join(", ")}`,
    });
  }

  try {
    const ok = await setIntelligenceTier(chatId, tier);
    if (!ok) {
      return res.status(500).json({ error: "Failed to set intelligence tier." });
    }

    // Return updated state
    const convDoc = await db.collection("conversations").doc(chatId).get();
    const chatMeta = convDoc.exists ? convDoc.data() : null;

    res.json({
      chatId,
      chatName: chatMeta?.chatName || chatId,
      tier,
      tierLabel: TIER_LABELS[tier],
      source: "user_override",
    });
  } catch (err) {
    console.error("[API] POST /intelligence/chats/:chatId/tier error:", err);
    res.status(500).json({ error: "Failed to set intelligence tier." });
  }
});

// ── DELETE /api/intelligence/chats/:chatId/tier ──────────────────────────────
// Removes the user override, reverting the chat to auto-detected tier.
router.delete("/chats/:chatId/tier", async (req, res) => {
  const { chatId } = req.params;

  try {
    const ok = await clearIntelligenceTierOverride(chatId);
    if (!ok) {
      return res.status(500).json({ error: "Failed to clear tier override." });
    }

    const convDoc = await db.collection("conversations").doc(chatId).get();
    const chatMeta = convDoc.exists ? convDoc.data() : null;

    const result = await getIntelligenceTier(chatId, chatMeta);

    res.json({
      chatId,
      message: "Tier override cleared. Reverted to auto-detected tier.",
      ...result,
      tierLabel: TIER_LABELS[result.tier] ?? result.tier,
    });
  } catch (err) {
    console.error("[API] DELETE /intelligence/chats/:chatId/tier error:", err);
    res.status(500).json({ error: "Failed to clear tier override." });
  }
});

// ── GET /api/intelligence/tiers ──────────────────────────────────────────────
// Returns tier definitions and gate configuration (useful for frontend dropdowns).
router.get("/tiers", (_req, res) => {
  res.json({
    tiers: VALID_TIERS.map((t) => ({
      value: t,
      label: TIER_LABELS[t],
    })),
    gates: TIER_GATES,
  });
});

// ── POST /api/intelligence/chunks/build ──────────────────────────────────────
// Builds chunks for all eligible chats. Idempotent. Does NOT trigger Gemini.
router.post("/chunks/build", async (req, res) => {
  try {
    const { buildAllPendingChunks } = await import("../../intelligence/chunkSummarizer.js");
    const result = await buildAllPendingChunks();
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/chunks/build error:", err);
    res.status(500).json({ error: "Failed to build chunks." });
  }
});

// ── POST /api/intelligence/chunks/summarize ──────────────────────────────────
// Summarizes unsummarized chunks using Gemini. Obeys cooldowns/quotas.
// Body (optional): { limit: 5 }
router.post("/chunks/summarize", async (req, res) => {
  const limit = req.body.limit || 5;
  try {
    const { summarizePendingChunks } = await import("../../intelligence/chunkSummarizer.js");
    const result = await summarizePendingChunks(limit);
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/chunks/summarize error:", err);
    res.status(500).json({ error: "Failed to summarize chunks." });
  }
});

// ── GET /api/intelligence/chunks/:chatId ─────────────────────────────────────
// Returns all chunks for a specific chat.
router.get("/chunks/:chatId", async (req, res) => {
  try {
    const { loadChunks } = await import("../../intelligence/chunkSummarizer.js");
    const chunks = await loadChunks();
    const chatChunks = chunks.filter((c) => c.chatId === req.params.chatId);

    res.json({ total: chatChunks.length, chunks: chatChunks });
  } catch (err) {
    console.error("[API] GET /intelligence/chunks/:chatId error:", err);
    res.status(500).json({ error: "Failed to get chunks for chat." });
  }
});

// ── GET /api/intelligence/summaries ──────────────────────────────────────────
// Returns all persistent per-chat summaries.
router.get("/summaries", async (_req, res) => {
  try {
    const { loadChatSummaries } = await import("../../intelligence/chatSummarizer.js");
    const summaries = await loadChatSummaries();
    res.json({ total: summaries.length, summaries });
  } catch (err) {
    console.error("[API] GET /intelligence/summaries error:", err);
    res.status(500).json({ error: "Failed to load chat summaries." });
  }
});

// ── GET /api/intelligence/summaries/:chatId ──────────────────────────────────
// Returns the persistent summary for a single chat.
router.get("/summaries/:chatId", async (req, res) => {
  try {
    const { getChatSummary } = await import("../../intelligence/chatSummarizer.js");
    const summary = await getChatSummary(req.params.chatId);
    if (!summary) {
      return res.status(404).json({ error: "No summary found for this chat." });
    }
    res.json(summary);
  } catch (err) {
    console.error("[API] GET /intelligence/summaries/:chatId error:", err);
    res.status(500).json({ error: "Failed to get chat summary." });
  }
});

// ── POST /api/intelligence/summaries/build ───────────────────────────────────
// Automatically updates summaries for all eligible (STARRED & IMPORTANT) chats.
// Idempotent: 0 new completed chunks = 0 Gemini calls.
router.post("/summaries/build", async (_req, res) => {
  try {
    const { updateAllEligibleChatSummaries } = await import("../../intelligence/chatSummarizer.js");
    const result = await updateAllEligibleChatSummaries();
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/summaries/build error:", err);
    res.status(500).json({ error: "Failed to build chat summaries." });
  }
});

// ── POST /api/intelligence/summaries/:chatId ─────────────────────────────────
// Incremental update for a specific chat summary from its completed chunks.
// Body (optional): { ignoreTierGate: false, force: false, ignoreRateLimit: false }
router.post("/summaries/:chatId", async (req, res) => {
  const { ignoreTierGate = false, force = false, ignoreRateLimit = false } = req.body || {};
  try {
    const { updateChatSummary } = await import("../../intelligence/chatSummarizer.js");
    const result = await updateChatSummary(req.params.chatId, { ignoreTierGate, force, ignoreRateLimit });
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/summaries/:chatId error:", err);
    res.status(500).json({ error: err.message || "Failed to update chat summary." });
  }
});

// ── GET /api/intelligence/jobs ───────────────────────────────────────────────
// Returns all persistent jobs.
router.get("/jobs", async (_req, res) => {
  try {
    const { loadJobs } = await import("../../intelligence/jobManager.js");
    const jobs = await loadJobs();
    res.json({ total: jobs.length, jobs });
  } catch (err) {
    console.error("[API] GET /intelligence/jobs error:", err);
    res.status(500).json({ error: "Failed to load jobs." });
  }
});

// ── GET /api/intelligence/jobs/:jobId ────────────────────────────────────────
// Returns a single job with progress and unit states.
router.get("/jobs/:jobId", async (req, res) => {
  try {
    const { getJob } = await import("../../intelligence/jobManager.js");
    const job = await getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    res.json(job);
  } catch (err) {
    console.error("[API] GET /intelligence/jobs/:jobId error:", err);
    res.status(500).json({ error: "Failed to get job." });
  }
});

// ── POST /api/intelligence/jobs/create ───────────────────────────────────────
// Creates a new persistent job.
// Body: { type: string, units: Array<object>, metadata?: object }
router.post("/jobs/create", async (req, res) => {
  const { type, units = [], metadata = {} } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: "type is required." });
  }
  try {
    const { createJob } = await import("../../intelligence/jobManager.js");
    const job = await createJob({ type, units, metadata });
    res.json({ ok: true, job });
  } catch (err) {
    console.error("[API] POST /intelligence/jobs/create error:", err);
    res.status(500).json({ error: "Failed to create job." });
  }
});

// ── POST /api/intelligence/jobs/:jobId/resume ────────────────────────────────
// Runs or resumes a job from its exact persisted checkpoint.
router.post("/jobs/:jobId/resume", async (req, res) => {
  try {
    const { runJob } = await import("../../intelligence/jobManager.js");
    const job = await runJob(req.params.jobId);
    res.json({ ok: true, job });
  } catch (err) {
    console.error("[API] POST /intelligence/jobs/:jobId/resume error:", err);
    res.status(500).json({ error: err.message || "Failed to resume job." });
  }
});

// ── POST /api/intelligence/jobs/:jobId/pause ─────────────────────────────────
// Pauses a running job.
router.post("/jobs/:jobId/pause", async (req, res) => {
  const { reason = "Paused by user" } = req.body || {};
  try {
    const { pauseJob } = await import("../../intelligence/jobManager.js");
    const result = await pauseJob(req.params.jobId, reason);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/jobs/:jobId/pause error:", err);
    res.status(500).json({ error: "Failed to pause job." });
  }
});

// ── Phase 7: Range Summaries, Global Intelligence & Range Cache ────────────────

// POST /api/intelligence/range-summary
router.post("/range-summary", async (req, res) => {
  const { chatId, range, startAt, endAt, topic, force } = req.body || {};
  if (!chatId) {
    return res.status(400).json({ error: "chatId is required." });
  }
  try {
    const { summarizeChatRange } = await import("../../intelligence/rangeSummarizer.js");
    const result = await summarizeChatRange(chatId, { range, startAt, endAt, topic }, { force: force === true });
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/range-summary error:", err);
    res.status(500).json({ error: err.message || "Failed to generate range summary." });
  }
});

// POST /api/intelligence/global
router.post("/global", async (req, res) => {
  try {
    const { queryGlobalIntelligence } = await import("../../intelligence/globalIntelligence.js");
    const result = await queryGlobalIntelligence(req.body || {});
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/global error:", err);
    res.status(500).json({ error: err.message || "Failed to query global intelligence." });
  }
});

// GET /api/intelligence/global
router.get("/global", async (req, res) => {
  const { query, range, intent, topic, force } = req.query;
  try {
    const { queryGlobalIntelligence } = await import("../../intelligence/globalIntelligence.js");
    const result = await queryGlobalIntelligence({ query, range, intent, topic, force: force === "true" });
    res.json(result);
  } catch (err) {
    console.error("[API] GET /intelligence/global error:", err);
    res.status(500).json({ error: err.message || "Failed to query global intelligence." });
  }
});

// GET /api/intelligence/range-cache
router.get("/range-cache", async (_req, res) => {
  try {
    const { loadRangeCache } = await import("../../intelligence/rangeCache.js");
    const cache = await loadRangeCache();
    res.json({ total: cache.length, cache });
  } catch (err) {
    console.error("[API] GET /intelligence/range-cache error:", err);
    res.status(500).json({ error: "Failed to load range cache." });
  }
});

// DELETE /api/intelligence/range-cache
router.delete("/range-cache", async (_req, res) => {
  try {
    const { clearRangeCache } = await import("../../intelligence/rangeCache.js");
    await clearRangeCache();
    res.json({ ok: true, message: "Range summary cache cleared." });
  } catch (err) {
    console.error("[API] DELETE /intelligence/range-cache error:", err);
    res.status(500).json({ error: "Failed to clear range cache." });
  }
});

// GET /api/intelligence/metrics
router.get("/metrics", async (_req, res) => {
  try {
    const { getPhase7Metrics } = await import("../../intelligence/rangeSummarizer.js");
    const { getActionMetrics } = await import("../../intelligence/actionExtractor.js");
    res.json({
      ok: true,
      rangeMetrics: getPhase7Metrics(),
      actionMetrics: getActionMetrics(),
    });
  } catch (err) {
    console.error("[API] GET /intelligence/metrics error:", err);
    res.status(500).json({ error: "Failed to load metrics." });
  }
});

// ── Phase 8: Actions, Tasks, Commitments, Deadlines & Projects ─────────────────

// GET /api/intelligence/actions
router.get("/actions", async (req, res) => {
  try {
    const { getFilteredActions } = await import("../../intelligence/actionExtractor.js");
    const actions = await getFilteredActions(req.query);
    res.json({ total: actions.length, actions });
  } catch (err) {
    console.error("[API] GET /intelligence/actions error:", err);
    res.status(500).json({ error: "Failed to load actions." });
  }
});

// GET /api/intelligence/commitments
router.get("/commitments", async (req, res) => {
  try {
    const { getFilteredActions } = await import("../../intelligence/actionExtractor.js");
    const commitments = await getFilteredActions({ ...req.query, type: "commitment" });
    res.json({ total: commitments.length, commitments });
  } catch (err) {
    console.error("[API] GET /intelligence/commitments error:", err);
    res.status(500).json({ error: "Failed to load commitments." });
  }
});

// GET /api/intelligence/tasks
router.get("/tasks", async (req, res) => {
  try {
    const { getFilteredActions } = await import("../../intelligence/actionExtractor.js");
    const tasks = await getFilteredActions({ ...req.query, type: "task" });
    res.json({ total: tasks.length, tasks });
  } catch (err) {
    console.error("[API] GET /intelligence/tasks error:", err);
    res.status(500).json({ error: "Failed to load tasks." });
  }
});

// GET /api/intelligence/deadlines
router.get("/deadlines", async (req, res) => {
  try {
    const { getFilteredActions } = await import("../../intelligence/actionExtractor.js");
    const deadlines = await getFilteredActions({ ...req.query, type: "deadline" });
    res.json({ total: deadlines.length, deadlines });
  } catch (err) {
    console.error("[API] GET /intelligence/deadlines error:", err);
    res.status(500).json({ error: "Failed to load deadlines." });
  }
});

// GET /api/intelligence/blockers
router.get("/blockers", async (req, res) => {
  try {
    const { getFilteredActions } = await import("../../intelligence/actionExtractor.js");
    const blockers = await getFilteredActions({ ...req.query, type: "blocker" });
    res.json({ total: blockers.length, blockers });
  } catch (err) {
    console.error("[API] GET /intelligence/blockers error:", err);
    res.status(500).json({ error: "Failed to load blockers." });
  }
});

// GET /api/intelligence/decisions
router.get("/decisions", async (req, res) => {
  try {
    const { getFilteredActions } = await import("../../intelligence/actionExtractor.js");
    const decisions = await getFilteredActions({ ...req.query, type: "decision" });
    res.json({ total: decisions.length, decisions });
  } catch (err) {
    console.error("[API] GET /intelligence/decisions error:", err);
    res.status(500).json({ error: "Failed to load decisions." });
  }
});

// POST /api/intelligence/actions/extract
router.post("/actions/extract", async (req, res) => {
  const { chatId } = req.body || {};
  try {
    const { extractActionIntelligence } = await import("../../intelligence/actionExtractor.js");
    const result = await extractActionIntelligence({ chatId });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[API] POST /intelligence/actions/extract error:", err);
    res.status(500).json({ error: "Failed to extract actions." });
  }
});

// PATCH /api/intelligence/actions/:actionId
router.patch("/actions/:actionId", async (req, res) => {
  const { status } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: "status is required." });
  }
  try {
    const { updateActionStatus } = await import("../../intelligence/actionExtractor.js");
    const updated = await updateActionStatus(req.params.actionId, status);
    if (!updated) {
      return res.status(404).json({ error: "Action not found." });
    }
    res.json({ ok: true, action: updated });
  } catch (err) {
    console.error("[API] PATCH /intelligence/actions/:actionId error:", err);
    res.status(500).json({ error: "Failed to update action status." });
  }
});

// GET /api/intelligence/projects
router.get("/projects", async (_req, res) => {
  try {
    const { loadProjects, syncProjects } = await import("../../intelligence/projectIntelligence.js");
    let projects = await loadProjects();
    if (projects.length === 0) {
      const syncRes = await syncProjects();
      projects = syncRes.projects;
    }
    res.json({ total: projects.length, projects });
  } catch (err) {
    console.error("[API] GET /intelligence/projects error:", err);
    res.status(500).json({ error: "Failed to load projects." });
  }
});

// GET /api/intelligence/projects/:projectId
router.get("/projects/:projectId", async (req, res) => {
  const { query } = req.query;
  try {
    const { getProject, queryProjectIntelligence } = await import("../../intelligence/projectIntelligence.js");
    if (query) {
      const result = await queryProjectIntelligence(req.params.projectId, query);
      return res.json(result);
    }
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }
    res.json(project);
  } catch (err) {
    console.error("[API] GET /intelligence/projects/:projectId error:", err);
    res.status(500).json({ error: "Failed to get project." });
  }
});

// POST /api/intelligence/projects/sync
router.post("/projects/sync", async (_req, res) => {
  try {
    const { syncProjects } = await import("../../intelligence/projectIntelligence.js");
    const result = await syncProjects();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[API] POST /intelligence/projects/sync error:", err);
    res.status(500).json({ error: "Failed to sync projects." });
  }
});

// ── Phase 9: Watches ──────────────────────────────────────────────────────────

// GET /api/intelligence/watches
// Query: ?enabled=true|false &type=... &person=X &project=Y &chat=Z
router.get("/watches", async (req, res) => {
  try {
    const { getFilteredWatches } = await import("../../intelligence/watchManager.js");
    const watches = await getFilteredWatches(req.query);
    res.json({ total: watches.length, watches });
  } catch (err) {
    console.error("[API] GET /intelligence/watches error:", err);
    res.status(500).json({ error: "Failed to load watches." });
  }
});

// POST /api/intelligence/watches
// Body: { type, target, chatId?, projectId?, person?, topic?, conditions?, priority?, tiers? }
router.post("/watches", async (req, res) => {
  const { type } = req.body || {};
  if (!type) {
    return res.status(400).json({ error: "type is required. Valid: person, chat, project, topic, action, deadline, blocker, important" });
  }
  try {
    const { createWatch } = await import("../../intelligence/watchManager.js");
    const watch = await createWatch(req.body);
    res.json({ ok: true, watch });
  } catch (err) {
    console.error("[API] POST /intelligence/watches error:", err);
    res.status(500).json({ error: "Failed to create watch." });
  }
});

// PATCH /api/intelligence/watches/:watchId
router.patch("/watches/:watchId", async (req, res) => {
  try {
    const { updateWatch } = await import("../../intelligence/watchManager.js");
    const updated = await updateWatch(req.params.watchId, req.body || {});
    if (!updated) return res.status(404).json({ error: "Watch not found." });
    res.json({ ok: true, watch: updated });
  } catch (err) {
    console.error("[API] PATCH /intelligence/watches/:watchId error:", err);
    res.status(500).json({ error: "Failed to update watch." });
  }
});

// DELETE /api/intelligence/watches/:watchId
router.delete("/watches/:watchId", async (req, res) => {
  try {
    const { deleteWatch } = await import("../../intelligence/watchManager.js");
    const deleted = await deleteWatch(req.params.watchId);
    if (!deleted) return res.status(404).json({ error: "Watch not found." });
    res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error("[API] DELETE /intelligence/watches/:watchId error:", err);
    res.status(500).json({ error: "Failed to delete watch." });
  }
});

// POST /api/intelligence/watches/parse
// NL watch command: { text, knownProjects?, knownPeople? }
router.post("/watches/parse", async (req, res) => {
  const { text, knownProjects, knownPeople } = req.body || {};
  if (!text) return res.status(400).json({ error: "text is required." });
  try {
    const { parseWatchCommand, createWatch, getFilteredWatches, loadWatches, deleteWatch } = await import("../../intelligence/watchManager.js");
    const parsed = parseWatchCommand(text, { knownProjects, knownPeople });

    let executed = null;
    if (parsed.action === "create" && parsed.type) {
      executed = await createWatch({ type: parsed.type, target: parsed.target, ...parsed });
    } else if (parsed.action === "list") {
      const watches = await getFilteredWatches({});
      executed = { watches };
    } else if (parsed.action === "alerts") {
      const { getFilteredAlerts } = await import("../../intelligence/alertEngine.js");
      executed = { alerts: await getFilteredAlerts({ unread: true }) };
    } else if (parsed.action === "stop" && parsed.target) {
      const watches = await loadWatches();
      const match = watches.find(
        (w) =>
          (w.target || "").toLowerCase().includes(parsed.target.toLowerCase()) ||
          (w.person || "").toLowerCase().includes(parsed.target.toLowerCase()) ||
          (w.topic || "").toLowerCase().includes(parsed.target.toLowerCase())
      );
      if (match) {
        await deleteWatch(match.watchId);
        executed = { deleted: true, watchId: match.watchId, target: parsed.target };
      } else {
        executed = { deleted: false, reason: "No matching watch found." };
      }
    }

    res.json({ ok: true, parsed, executed });
  } catch (err) {
    console.error("[API] POST /intelligence/watches/parse error:", err);
    res.status(500).json({ error: "Failed to parse watch command." });
  }
});

// POST /api/intelligence/watches/evaluate
// Manually fire a watch evaluation event. Body: { type, data }
router.post("/watches/evaluate", async (req, res) => {
  const { type, data } = req.body || {};
  if (!type || !data) return res.status(400).json({ error: "type and data are required." });
  try {
    const { evaluateWatches } = await import("../../intelligence/watchManager.js");
    const { processWatchMatches } = await import("../../intelligence/alertEngine.js");
    const matches = await evaluateWatches({ type, data });
    const result = await processWatchMatches(matches);
    res.json({ ok: true, matches: matches.length, ...result });
  } catch (err) {
    console.error("[API] POST /intelligence/watches/evaluate error:", err);
    res.status(500).json({ error: "Failed to evaluate watches." });
  }
});

// ── Phase 9: Alerts ───────────────────────────────────────────────────────────

// GET /api/intelligence/alerts
// Query: ?unread=true|false &severity=info|warning|critical &type=X &watchId=X &project=X &chat=X &limit=100
router.get("/alerts", async (req, res) => {
  try {
    const { getFilteredAlerts } = await import("../../intelligence/alertEngine.js");
    const alerts = await getFilteredAlerts(req.query);
    res.json({ total: alerts.length, alerts });
  } catch (err) {
    console.error("[API] GET /intelligence/alerts error:", err);
    res.status(500).json({ error: "Failed to load alerts." });
  }
});

// PATCH /api/intelligence/alerts/:alertId  { read: true|false }
router.patch("/alerts/:alertId", async (req, res) => {
  const { read } = req.body || {};
  if (read === undefined) return res.status(400).json({ error: "read (boolean) is required." });
  try {
    const { markAlertRead } = await import("../../intelligence/alertEngine.js");
    const updated = await markAlertRead(req.params.alertId, read);
    if (!updated) return res.status(404).json({ error: "Alert not found." });
    res.json({ ok: true, alert: updated });
  } catch (err) {
    console.error("[API] PATCH /intelligence/alerts/:alertId error:", err);
    res.status(500).json({ error: "Failed to update alert." });
  }
});

// POST /api/intelligence/alerts/read-all
router.post("/alerts/read-all", async (req, res) => {
  try {
    const { markAllAlertsRead } = await import("../../intelligence/alertEngine.js");
    const result = await markAllAlertsRead();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[API] POST /intelligence/alerts/read-all error:", err);
    res.status(500).json({ error: "Failed to mark alerts as read." });
  }
});

// ── Phase 9: Smart Retrieval ──────────────────────────────────────────────────

// POST /api/intelligence/retrieve
// Body: { query, range?, chatId?, projectId?, person?, forceGemini? }
router.post("/retrieve", async (req, res) => {
  const { query, chatId, projectId, person } = req.body || {};
  if (!query) return res.status(400).json({ error: "query is required." });

  if (chatId && !isValidSafeId(chatId)) {
    return res.status(400).json({ error: "Invalid chatId format." });
  }
  if (projectId && !isValidSafeId(projectId)) {
    return res.status(400).json({ error: "Invalid projectId format." });
  }

  const sanitizedQuery = sanitizeInputString(query, 1000);
  try {
    const { smartRetrieve } = await import("../../intelligence/smartRetrieval.js");
    const result = await smartRetrieve({
      ...req.body,
      query: sanitizedQuery,
      person: person ? sanitizeInputString(person, 100) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("[API] POST /intelligence/retrieve error:", err);
    res.status(500).json({ error: "Failed to execute smart retrieval." });
  }
});

// GET /api/intelligence/retrieve?query=...
router.get("/retrieve", async (req, res) => {
  const { query, chatId, projectId, person } = req.query;
  if (!query) return res.status(400).json({ error: "query is required." });

  if (chatId && !isValidSafeId(chatId)) {
    return res.status(400).json({ error: "Invalid chatId format." });
  }
  if (projectId && !isValidSafeId(projectId)) {
    return res.status(400).json({ error: "Invalid projectId format." });
  }

  const sanitizedQuery = sanitizeInputString(query, 1000);
  try {
    const { smartRetrieve } = await import("../../intelligence/smartRetrieval.js");
    const result = await smartRetrieve({
      ...req.query,
      query: sanitizedQuery,
      person: person ? sanitizeInputString(person, 100) : undefined,
      forceGemini: req.query.forceGemini === "true",
    });
    res.json(result);
  } catch (err) {
    console.error("[API] GET /intelligence/retrieve error:", err);
    res.status(500).json({ error: "Failed to execute smart retrieval." });
  }
});

// POST /api/intelligence/deadlines/check  -- manual trigger
router.post("/deadlines/check", async (req, res) => {
  try {
    const { checkDeadlines } = await import("../../intelligence/deadlineMonitor.js");
    const result = await checkDeadlines();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[API] POST /intelligence/deadlines/check error:", err);
    res.status(500).json({ error: "Failed to run deadline check." });
  }
});
// ── Phase 10: Media Intelligence ──────────────────────────────────────────────

// GET /api/intelligence/media
// Query: ?mediaType=image|pdf &chatId=X &sender=X &topic=X &projectName=X &startAt=ISO &endAt=ISO &limit=50
// Returns structured media analysis records.
router.get("/media", async (req, res) => {
  try {
    const { getFilteredMediaAnalysis } = await import("../../intelligence/mediaStore.js");
    const records = await getFilteredMediaAnalysis(req.query);
    res.json({ total: records.length, records });
  } catch (err) {
    console.error("[API] GET /intelligence/media error:", err);
    res.status(500).json({ error: "Failed to load media analysis." });
  }
});

// GET /api/intelligence/media/:messageId
// Returns the media analysis for a specific message.
router.get("/media/:messageId", async (req, res) => {
  try {
    const { getMediaAnalysisByMessageId } = await import("../../intelligence/mediaStore.js");
    const record = await getMediaAnalysisByMessageId(req.params.messageId);
    if (!record) return res.status(404).json({ error: "No media analysis found for this message." });
    res.json(record);
  } catch (err) {
    console.error("[API] GET /intelligence/media/:messageId error:", err);
    res.status(500).json({ error: "Failed to load media analysis." });
  }
});

// POST /api/intelligence/media/process
// Manually trigger media processing for a WhatsApp message.
// Body: { messageId, chatId, chatName?, sender?, senderJid?, receivedAt?,
//         mimeType, fileSizeBytes, tier, bufferBase64? }
// Use bufferBase64 to pass the media bytes (base64-encoded).
// Omit bufferBase64 to do a dry-run (deterministic checks only, no Gemini).
router.post("/media/process", async (req, res) => {
  const { messageId, mimeType } = req.body || {};
  if (!messageId || !mimeType) {
    return res.status(400).json({ error: "messageId and mimeType are required." });
  }
  try {
    const { processMedia, detectMediaType } = await import("../../intelligence/mediaProcessor.js");
    const buffer = req.body.bufferBase64
      ? Buffer.from(req.body.bufferBase64, "base64")
      : null;

    const result = await processMedia({
      messageId:     req.body.messageId,
      chatId:        req.body.chatId,
      chatName:      req.body.chatName,
      sender:        req.body.sender,
      senderJid:     req.body.senderJid,
      receivedAt:    req.body.receivedAt || new Date().toISOString(),
      mimeType:      req.body.mimeType,
      fileSizeBytes: req.body.fileSizeBytes || (buffer ? buffer.length : 0),
      tier:          req.body.tier || "normal",
      buffer,
      force:         req.body.force === true || req.body.force === "true",
    });
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[API] POST /intelligence/media/process error:", err);
    res.status(500).json({ error: "Failed to process media." });
  }
});

// GET /api/intelligence/media/metrics
// Returns Phase 10 processing metrics.
router.get("/media/metrics", async (req, res) => {
  try {
    const { getMediaMetrics } = await import("../../intelligence/mediaProcessor.js");
    res.json(getMediaMetrics());
  } catch (err) {
    console.error("[API] GET /intelligence/media/metrics error:", err);
    res.status(500).json({ error: "Failed to get media metrics." });
  }
});

export default router;
