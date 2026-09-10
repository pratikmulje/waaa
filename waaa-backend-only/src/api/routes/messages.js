import { Router } from "express";
import { db } from "../../firebase.js";
import { hub } from "../sseHub.js";

const router = Router();

// GET /api/messages?limit=&riskLevel=&importanceLevel=&search=
router.get("/", async (req, res) => {
  try {
    const { riskLevel, importanceLevel, search, limit } = req.query;
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
      .filter((m) => !m.userId || m.userId === userId);

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

// GET /api/messages/stream  (SSE: fires whenever index.js processes a new message)
router.get("/stream", (req, res) => {
  hub.subscribe(res, ["message"]);
});

export default router;
