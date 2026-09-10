/*
==============================================================================
WAAA - Unified Production Runtime Server                              Phase 16
==============================================================================

Consolidates WAAA into a single persistent production Node.js process:
  1. Express REST/SSE API Server (0.0.0.0, PORT or 10000)
  2. Persistent Multi-User WhatsApp Session Manager & WhatsApp Baileys Bot
  3. Background Intelligence Pipelines & Message Ingestion
  4. Phase 6 Resumable Job Runner & Checkpoint Recovery
  5. Phase 9 Continuous Deadline & Watch Monitors
  6. Phase 15 Cryptographic Proof & Blockchain Trust Layer
  7. Lightweight /health and /ready Production Probes
  8. Clean, Graceful Shutdown (SIGTERM / SIGINT) without session corruption
==============================================================================
*/

import "dotenv/config";
import express from "express";
import cors from "cors";

import { getStorageInfo } from "./intelligence/storageConfig.js";
import { startDataSync } from "./api/dataSync.js";
import { startConnectionSync } from "./api/connectionSync.js";
import { isConfigured as isAiConfigured } from "./ai/geminiClient.js";
import { recoverInterruptedJobs } from "./intelligence/jobManager.js";
import { startDeadlineMonitor, stopDeadlineMonitor } from "./intelligence/deadlineMonitor.js";
import { userContextMiddleware } from "./intelligence/userContext.js";
import { listUserSessions, disconnectUserSession } from "./session/sessionManager.js";

// Routes
import connectionRoutes from "./api/routes/connection.js";
import conversationRoutes from "./api/routes/conversations.js";
import messageRoutes from "./api/routes/messages.js";
import chatRoutes from "./api/routes/chats.js";
import behaviorRoutes from "./api/routes/behavior.js";
import statsRoutes from "./api/routes/stats.js";
import aiRoutes from "./api/routes/ai.js";
import fraudRoutes from "./api/routes/fraud.js";
import intelligenceRoutes from "./api/routes/intelligence.js";
import peopleRoutes from "./api/routes/people.js";
import blockchainRoutes from "./api/routes/blockchain.js";
import { start as startWhatsAppBot } from "./index.js";

const app = express();
const PORT = process.env.PORT || process.env.WAAA_API_PORT || 10000;
const HOST = "0.0.0.0";
const START_TIME = Date.now();

let isReady = false;
let isShuttingDown = false;

// ── Startup & Initialization ──────────────────────────────────────────────────
console.log("==================================================");
console.log("🚀 STARTING WAAA PERSISTENT CLOUD PRODUCTION RUNTIME");
console.log("==================================================");

const storageInfo = getStorageInfo();
console.log(`[Runtime] Storage Config:`);
console.log(`  Persistent Mount: ${storageInfo.persistentMountConfigured ? storageInfo.rootStorageMount : "Local Filesystem"}`);
console.log(`  Data Directory:   ${storageInfo.dataDir}`);
console.log(`  Auth Directory:   ${storageInfo.authDir}`);
console.log(`  Backup Directory: ${storageInfo.backupDir}`);

// Initialize startup hooks
startConnectionSync();
startDataSync();
recoverInterruptedJobs().catch((err) => console.error("[Runtime] Failed to recover interrupted jobs:", err.message));
startDeadlineMonitor();

// Start persistent WhatsApp bot (Baileys session)
startWhatsAppBot().catch((err) => console.error("[Runtime] WhatsApp bot start failed:", err.message));


// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "25mb" })); // allows base64 media within safe limits
app.use(userContextMiddleware); // attaches req.userId (Phase 13)

// Path traversal and dangerous character check (Phase 12)
app.use((req, res, next) => {
  if (/(\.\.[\/\\]|[\/\\]\.\.|\0)/.test(req.url)) {
    return res.status(400).json({ error: "Invalid request path." });
  }
  next();
});

// ── Health & Readiness Probes (Zero Secrets Leaked) ───────────────────────────

/**
 * GET /health and GET /api/health
 * Lightweight health check endpoint for Render / load balancers.
 */
function handleHealthCheck(req, res) {
  res.json({
    status: isShuttingDown ? "shutting_down" : "ok",
    service: "waaa-cloud-backend",
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
}

app.get("/health", handleHealthCheck);
app.get("/api/health", handleHealthCheck);

/**
 * GET /ready and GET /api/ready
 * Readiness check indicating whether services have fully initialized.
 */
function handleReadyCheck(req, res) {
  if (isShuttingDown) {
    return res.status(503).json({ ready: false, status: "shutting_down" });
  }
  res.json({
    ready: isReady,
    status: isReady ? "ready" : "initializing",
    timestamp: new Date().toISOString(),
    activeUserSessions: listUserSessions().length,
  });
}

app.get("/ready", handleReadyCheck);
app.get("/api/ready", handleReadyCheck);

// ── REST API Routes ───────────────────────────────────────────────────────────
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

app.get("/api/stats/data-metrics", async (req, res) => {
  try {
    const { getDataMetrics } = await import("./db/dataScaling.js");
    res.json(getDataMetrics());
  } catch {
    res.status(500).json({ error: "Failed to load data metrics." });
  }
});

// Centralized safe error handler (Phase 12)
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({ error: "Payload too large. Exceeds allowed limit." });
  }
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Malformed JSON payload." });
  }
  console.error("[Runtime] Request error:", err.message);
  res.status(err.status || 500).json({ error: "An internal server error occurred." });
});

// ── Server Listen ─────────────────────────────────────────────────────────────
const server = app.listen(Number(PORT), HOST, () => {
  isReady = true;
  console.log(`\n[Runtime] WAAA Persistent Server listening on http://${HOST}:${PORT}`);
  console.log(
    isAiConfigured()
      ? "[Runtime] AI (Gemini) is configured — summarize/draft/smart-retrieval active.\n"
      : "[Runtime] AI (Gemini) is NOT configured — deterministic rules and retrieval active.\n"
  );
});

// ── Graceful Shutdown Handler ─────────────────────────────────────────────────
export async function gracefulShutdown(signal = "SIGTERM") {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Runtime] Received ${signal}. Commencing graceful shutdown...`);

  try {
    // 1. Stop background loops
    stopDeadlineMonitor();

    // 2. Disconnect active WhatsApp sessions cleanly
    const sessions = listUserSessions();
    console.log(`[Runtime] Closing ${sessions.length} active WhatsApp session(s)...`);
    for (const session of sessions) {
      await disconnectUserSession(session.userId);
    }

    // 3. Close HTTP server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log("[Runtime] HTTP server closed.");
    }

    console.log("[Runtime] Graceful shutdown completed cleanly.");
  } catch (err) {
    console.error("[Runtime] Error during graceful shutdown:", err.message);
  } finally {
    if (process.env.NODE_ENV !== "test") {
      process.exit(0);
    }
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
