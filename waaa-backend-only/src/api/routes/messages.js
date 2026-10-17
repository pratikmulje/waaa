import { Router } from "express";
import { db } from "../../firebase.js";
import { hub } from "../sseHub.js";

const router = Router();

// GET /api/messages?limit=&riskLevel=&importanceLevel=&search=
router.get("/", async (req, res) => {
  try {
    const { riskLevel, importanceLevel, search, limit, days } = req.query;
    const userId = req.userId || "default_user";

    let query = db.collection("messages").orderBy("createdAt", "desc");

    const maxLimit = Math.min(Number(limit) > 0 ? Number(limit) : 250, 500);
    query = query.limit(maxLimit);

    const snapshot = await query.get();

    let messages = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.().toISOString() ?? null,
      }))
      .filter((m) => !m.userId || m.userId === userId || userId === "default_user");

    if (days && Number(days) > 0) {
      const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
      messages = messages.filter((m) => {
        const raw = m.createdAt || m.receivedAt;
        if (!raw) return false;
        const t = new Date(raw).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }

    if (riskLevel && riskLevel !== "all") {
      messages = messages.filter((m) => m.fraudAnalysis?.riskLevel === riskLevel);
    }

    if (importanceLevel && importanceLevel !== "all") {
      messages = messages.filter((m) => m.importanceAnalysis?.level === importanceLevel);
    }

    if (search) {
      const q = String(search).toLowerCase();
      messages = messages.filter(
        (m) =>
          (m.text || "").toLowerCase().includes(q) ||
          (m.sender || "").toLowerCase().includes(q) ||
          (m.chatName || "").toLowerCase().includes(q)
      );
    }

    res.json({ messages });
  } catch (error) {
    console.error("[API] /messages error:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// PATCH /api/messages/:messageId { read, done }
router.patch("/:messageId", async (req, res) => {
  const { messageId } = req.params;
  const { read, done } = req.body || {};
  try {
    const docRef = db.collection("messages").doc(messageId);
    const updates = {};
    if (read !== undefined) updates.read = !!read;
    if (done !== undefined) updates.done = !!done;
    updates.updatedAt = new Date().toISOString();
    await docRef.set(updates, { merge: true });
    res.json({ ok: true, messageId, updates });
  } catch (err) {
    console.error("[API] PATCH /messages/:messageId error:", err);
    res.status(500).json({ error: "Failed to update message" });
  }
});

// GET /api/messages/stream  (SSE: fires whenever index.js processes a new message)
router.get("/stream", (req, res) => {
  hub.subscribe(res, ["message"]);
});

// POST /api/messages/send  { chatId, text }
router.post("/send", async (req, res) => {
  const { chatId, text } = req.body || {};

  if (!chatId || !text?.trim()) {
    return res.status(400).json({ error: "chatId and text are required" });
  }

  // Lazy-import to avoid circular deps at module load time
  let getSock;
  try {
    ({ getSock } = await import("../../index.js"));
  } catch (err) {
    console.error("[API] /messages/send – import failed:", err.message);
    return res.status(503).json({ error: "Bot module unavailable" });
  }

  if (typeof getSock !== "function") {
    console.error("[API] /messages/send – getSock is not a function (export missing?)");
    return res.status(503).json({ error: "Bot module unavailable" });
  }

  const sock = getSock();
  if (!sock) {
    return res.status(503).json({ error: "WhatsApp is not connected yet" });
  }

  try {
    await sock.sendMessage(chatId, { text: text.trim() });
    res.json({ ok: true });
  } catch (err) {
    console.error("[API] /messages/send error:", err.message);
    res.status(500).json({ error: err.message || "Failed to send message" });
  }
});

export default router;
