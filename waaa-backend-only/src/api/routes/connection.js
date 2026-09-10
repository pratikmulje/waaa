import { Router } from "express";
import { getSyncedConnectionState } from "../connectionSync.js";
import { hub } from "../sseHub.js";

const router = Router();

import { getUserSession, connectUserSession, disconnectUserSession } from "../../session/sessionManager.js";

// GET /api/connection/status (supports ?userId= or header)
router.get("/status", (req, res) => {
  const userId = req.headers["x-user-id"] || req.query.userId;
  if (userId) {
    try {
      return res.json(getUserSession(userId));
    } catch {
      // Fallback
    }
  }
  res.json(getSyncedConnectionState());
});

// POST /api/connection/connect (body: { userId? })
router.post("/connect", async (req, res) => {
  const userId = req.headers["x-user-id"] || req.body?.userId || "default_user";
  try {
    const { connectUserSession } = await import("../../session/sessionManager.js");
    const session = await connectUserSession(userId);
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to initiate session." });
  }
});

// GET /api/connection/qr (query: ?userId=)
router.get("/qr", async (req, res) => {
  const userId = req.headers["x-user-id"] || req.query.userId || "default_user";
  try {
    const { getUserSession } = await import("../../session/sessionManager.js");
    const session = getUserSession(userId);
    res.json({ userId, qr: session.qr, qrGeneratedAt: session.qrGeneratedAt, status: session.status });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to retrieve QR." });
  }
});

// POST /api/connection/disconnect (body: { userId? })
router.post("/disconnect", async (req, res) => {
  const userId = req.headers["x-user-id"] || req.body?.userId || "default_user";
  try {
    const { disconnectUserSession } = await import("../../session/sessionManager.js");
    const result = await disconnectUserSession(userId);
    res.json({ ok: true, session: result });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to disconnect session." });
  }
});

// GET /api/connection/stream  (SSE: live connection + QR updates)
router.get("/stream", (req, res) => {
  hub.subscribe(res, ["connection"]);
  res.write(`event: connection\ndata: ${JSON.stringify(getSyncedConnectionState())}\n\n`);
});

export default router;
