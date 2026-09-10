/*
==================================================
WAAA API SERVER
==================================================
Thin REST/SSE layer over the EXISTING backend logic
(Firestore schema, chatSettings, behaviorEngine).
It does not reimplement WhatsApp connection logic —
that still lives entirely in src/index.js.

Run alongside the existing bot:
  Terminal 1: npm start        (WhatsApp connection — src/index.js)
  Terminal 2: npm run api      (this file)
==================================================
*/

import "dotenv/config";
import express from "express";
import cors from "cors";
import { startDataSync } from "./dataSync.js";


import connectionRoutes from "./routes/connection.js";
import conversationRoutes from "./routes/conversations.js";
import messageRoutes from "./routes/messages.js";
import chatRoutes from "./routes/chats.js";
import behaviorRoutes from "./routes/behavior.js";
import statsRoutes from "./routes/stats.js";
import aiRoutes from "./routes/ai.js";
import fraudRoutes from "./routes/fraud.js";
import intelligenceRoutes from "./routes/intelligence.js";
import peopleRoutes from "./routes/people.js";
import blockchainRoutes from "./routes/blockchain.js";
import { startConnectionSync } from "./connectionSync.js";
import { isConfigured as isAiConfigured } from "../ai/geminiClient.js";
import { recoverInterruptedJobs } from "../intelligence/jobManager.js";
import { startDeadlineMonitor } from "../intelligence/deadlineMonitor.js";
import { userContextMiddleware } from "../intelligence/userContext.js";

// ── Startup Hooks ─────────────────────────────────────────────────────────────
startConnectionSync();
startDataSync();
recoverInterruptedJobs().catch((err) => console.error("[api] Failed to recover interrupted jobs:", err));
startDeadlineMonitor();

const app = express();
const PORT = process.env.PORT || process.env.WAAA_API_PORT || 4000;

startConnectionSync();

app.use(cors());
app.use(express.json({ limit: "25mb" })); // allows base64 media uploads within configured limits
app.use(userContextMiddleware); // attaches req.userId to all incoming requests

// Global parameter & path traversal protection
app.use((req, res, next) => {
  // Check for path traversal attempts in URL or params
  if (/(\.\.[\/\\]|[\/\\]\.\.|\0)/.test(req.url)) {
    return res.status(400).json({ error: "Invalid request path." });
  }
  next();
});

app.use("/api/connection", connectionRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/behavior", behaviorRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/fraud", fraudRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/intelligence/people", peopleRoutes);
app.use("/api/blockchain", blockchainRoutes);

const START_TIME = Date.now();

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "waaa-api",
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

app.get("/ready", (req, res) => {
  res.json({
    ready: true,
    status: "ready",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "waaa-api" });
});

app.get("/api/ready", (req, res) => {
  res.json({ ok: true, ready: true });
});

app.get("/api/stats/data-metrics", async (req, res) => {
  try {
    const { getDataMetrics } = await import("../db/dataScaling.js");
    res.json(getDataMetrics());
  } catch (err) {
    res.status(500).json({ error: "Failed to load data metrics." });
  }
});

// Centralized safe error handler: never leak internal stack traces, paths, or secrets
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({ error: "Payload too large. Exceeds allowed limit." });
  }
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Malformed JSON payload." });
  }
  console.error("[api] Unhandled error:", err.message);
  res.status(err.status || 500).json({ error: "An internal server error occurred." });
});

const HOST = "0.0.0.0";
app.listen(Number(PORT), HOST, () => {
  console.log(`\n[api] WAAA API listening on http://${HOST}:${PORT}`);
  console.log(
    isAiConfigured()
      ? "[api] AI (Gemini) is configured — summarize/draft endpoints active.\n"
      : "[api] AI (Gemini) is NOT configured — set GEMINI_API_KEY in .env to enable summarize/draft.\n"
  );
});
