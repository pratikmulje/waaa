import { Router } from "express";
import { analyzeRules } from "../../fraud/fraudRules.js";
import { analyzeProgression } from "../../fraud/fraudProgressionEngine.js";
import { readCollection } from "../../db/localStore.js";

const router = Router();

// ── GET /api/fraud/progression/:chatId ───────────────────────────────────────
// Full conversation-arc fraud analysis.
// Tracks the scam lifecycle: NORMAL → GROOMING → PRIMING → CRITICAL_ASK → PRESSURE
//
// Response includes:
//   currentPhase, phaseHistory, progressionScore, riskLevel,
//   escalationSpeed, signals, summary, alert, recommendation, timeline
router.get("/progression/:chatId", async (req, res) => {
  const { chatId } = req.params;

  if (!chatId) {
    return res.status(400).json({ error: "chatId is required." });
  }

  try {
    const result = await analyzeProgression(chatId);
    res.json(result);
  } catch (err) {
    console.error("[API] /fraud/progression error:", err);
    res.status(500).json({ error: "Failed to analyse fraud progression." });
  }
});

// ── GET /api/fraud/scan/:chatId ──────────────────────────────────────────────
// Quick per-message rule scan for all messages in a chat.
// Returns each message annotated with its individual fraud score + reasons.
// Useful for showing message-level highlights in the Fraud Center UI.
router.get("/scan/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  try {
    const allMessages = await readCollection("messages");
    const chatMessages = allMessages
      .filter((m) => m.chatId === chatId)
      .slice(-limit);

    const results = chatMessages.map((msg) => {
      const text = msg.text || msg.body || msg.message || "";
      const { score, reasons } = analyzeRules(text);
      return {
        id:        msg.id,
        text:      text.slice(0, 200),
        timestamp: msg.createdAt?.iso ?? msg.createdAt ?? null,
        fraudScore: score,
        reasons,
        riskLevel: score >= 75 ? "critical"
                 : score >= 50 ? "high"
                 : score >= 25 ? "medium"
                 : "low",
      };
    });

    // Sort by score descending so the most suspicious messages are first
    results.sort((a, b) => b.fraudScore - a.fraudScore);

    res.json({
      chatId,
      messageCount: results.length,
      messages: results,
    });
  } catch (err) {
    console.error("[API] /fraud/scan error:", err);
    res.status(500).json({ error: "Failed to scan messages." });
  }
});

// ── GET /api/fraud/overview ──────────────────────────────────────────────────
// High-level fraud overview across ALL chats.
// Returns top suspicious chats sorted by progression score.
// Useful for the Fraud Center dashboard summary card.
router.get("/overview", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  try {
    const allMessages = await readCollection("messages");

    // Get unique chatIds
    const chatIds = [...new Set(allMessages.map((m) => m.chatId).filter(Boolean))];

    // Run progression analysis on each chat (parallel)
    const analyses = await Promise.all(
      chatIds.map((cid) => {
        const chatMsgs = allMessages.filter((m) => m.chatId === cid);
        return analyzeProgression(cid, chatMsgs).catch(() => null);
      })
    );

    // Filter out nulls, sort by progressionScore desc, take top N
    const ranked = analyses
      .filter(Boolean)
      .filter((a) => a.progressionScore > 0)
      .sort((a, b) => b.progressionScore - a.progressionScore)
      .slice(0, limit);

    res.json({
      totalChatsScanned: chatIds.length,
      suspiciousChats: ranked.length,
      chats: ranked.map((a) => ({
        chatId:           a.chatId,
        currentPhase:     a.currentPhase,
        progressionScore: a.progressionScore,
        riskLevel:        a.riskLevel,
        escalationSpeed:  a.escalationSpeed,
        alert:            a.alert,
        messageCount:     a.messageCount,
      })),
    });
  } catch (err) {
    console.error("[API] /fraud/overview error:", err);
    res.status(500).json({ error: "Failed to generate fraud overview." });
  }
});

export default router;
