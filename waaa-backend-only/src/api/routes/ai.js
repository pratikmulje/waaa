import { Router } from "express";
import { isConfigured } from "../../ai/geminiClient.js";
import { summarizeChat } from "../../ai/summarize.js";
import { generateDraftReplies } from "../../ai/draftReply.js";
import { isValidSafeId, sanitizeInputString, sanitizeErrorMessage } from "../../intelligence/securityUtils.js";

const router = Router();

router.get("/status", (req, res) => {
  res.json({ configured: isConfigured() });
});

// POST /api/ai/summarize/:chatId (supports optional ?range=today|yesterday|last7days or body: { range, startAt, endAt, force })
router.post("/summarize/:chatId", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: "AI isn't configured — add GEMINI_API_KEY to a .env file and restart the API server.",
    });
  }

  const { chatId } = req.params;
  const range = req.query.range || req.body?.range;
  const startAt = req.query.startAt || req.body?.startAt;
  const endAt = req.query.endAt || req.body?.endAt;
  const force = req.body?.force === true;

  try {
    if (range || startAt || endAt) {
      const { summarizeChatRange } = await import("../../intelligence/rangeSummarizer.js");
      const result = await summarizeChatRange(chatId, { range, startAt, endAt }, { force });
      return res.json(result);
    }

    const result = await summarizeChat(chatId);
    if (result.messageCount === 0) {
      return res.status(404).json({ error: "No messages found for this chat." });
    }
    res.json(result);
  } catch (error) {
    console.error("[API] /ai/summarize error:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary." });
  }
});

// GET /api/ai/summarize/:chatId (convenience GET endpoint with query params)
router.get("/summarize/:chatId", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: "AI isn't configured — add GEMINI_API_KEY to a .env file and restart the API server.",
    });
  }

  const { chatId } = req.params;
  const { range, startAt, endAt, force } = req.query;

  try {
    if (range || startAt || endAt) {
      const { summarizeChatRange } = await import("../../intelligence/rangeSummarizer.js");
      const result = await summarizeChatRange(chatId, { range, startAt, endAt }, { force: force === "true" });
      return res.json(result);
    }

    const result = await summarizeChat(chatId);
    if (result.messageCount === 0) {
      return res.status(404).json({ error: "No messages found for this chat." });
    }
    res.json(result);
  } catch (error) {
    console.error("[API] GET /ai/summarize error:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary." });
  }
});

// POST /api/ai/draft   body: { messageId, mode }
router.post("/draft", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: "AI isn't configured — add GEMINI_API_KEY to a .env file and restart the API server.",
    });
  }

  const { messageId, mode } = req.body || {};
  if (!messageId || !isValidSafeId(messageId)) {
    return res.status(400).json({ error: "Valid messageId is required." });
  }

  try {
    const result = await generateDraftReplies(messageId, { mode });
    if (!result) {
      return res.status(404).json({ error: "Message not found." });
    }
    res.json(result);
  } catch (error) {
    console.error("[API] /ai/draft error:", error);
    res.status(500).json({ error: sanitizeErrorMessage(error, "Failed to generate draft replies.") });
  }
});

// POST /api/ai/ask (JARVIS intent router & mixed AI)
// Body: { query, mode: "SMART_AUTO" | "NORMAL_AI" | "MY_CONTEXT", sessionId, chatId, forceGemini }
router.post("/ask", async (req, res) => {
  const { query, mode, sessionId, chatId, forceGemini } = req.body || {};
  if (!query) {
    return res.status(400).json({ error: "query is required." });
  }

  if (chatId && !isValidSafeId(chatId)) {
    return res.status(400).json({ error: "Invalid chatId format." });
  }
  if (sessionId && !isValidSafeId(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId format." });
  }

  const sanitizedQuery = sanitizeInputString(query, 2000);

  try {
    const { routeAndExecute } = await import("../../intelligence/jarvisRouter.js");
    const result = await routeAndExecute({
      query: sanitizedQuery,
      mode,
      sessionId: sessionId || "default",
      chatId,
      forceGemini: forceGemini === true || forceGemini === "true",
    });
    res.json(result);
  } catch (error) {
    console.error("[API] /ai/ask error:", error);
    res.status(500).json({ error: sanitizeErrorMessage(error, "JARVIS failed to process query.") });
  }
});

// GET /api/ai/ask?query=...&mode=...
router.get("/ask", async (req, res) => {
  const { query, mode, sessionId, chatId, forceGemini } = req.query;
  if (!query) {
    return res.status(400).json({ error: "query is required." });
  }

  if (chatId && !isValidSafeId(chatId)) {
    return res.status(400).json({ error: "Invalid chatId format." });
  }
  if (sessionId && !isValidSafeId(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId format." });
  }

  const sanitizedQuery = sanitizeInputString(query, 2000);

  try {
    const { routeAndExecute } = await import("../../intelligence/jarvisRouter.js");
    const result = await routeAndExecute({
      query: sanitizedQuery,
      mode,
      sessionId: sessionId || "default",
      chatId,
      forceGemini: forceGemini === "true",
    });
    res.json(result);
  } catch (error) {
    console.error("[API] GET /ai/ask error:", error);
    res.status(500).json({ error: sanitizeErrorMessage(error, "JARVIS failed to process query.") });
  }
});

// GET /api/ai/router/metrics
router.get("/router/metrics", async (req, res) => {
  try {
    const { getRouterMetrics } = await import("../../intelligence/jarvisRouter.js");
    res.json(getRouterMetrics());
  } catch (error) {
    console.error("[API] /ai/router/metrics error:", error);
    res.status(500).json({ error: "Failed to load router metrics." });
  }
});

export default router;
