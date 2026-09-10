import { Router } from "express";
import { db } from "../../firebase.js";
import { getChatSettings } from "../../chat/chatSettings.js";

const router = Router();

/*
Read-volume notes (this file previously caused a Firestore quota
exhaustion — RESOURCE_EXHAUSTED — because GET / did one extra
getChatSettings() read PER conversation on EVERY poll):

- GET / now reads `priority`/`priorityLevel` straight off each
  conversation doc (mirrored there by setChatPriority — see
  src/chat/chatSettings.js) instead of a second read per chat.
  NOTE: conversations marked priority BEFORE this change won't show
  as priority until toggled once more, since the mirror only starts
  writing going forward.
- No composite Firestore indexes anywhere in this file: every query
  is a single `.orderBy()` or a single `.where()`, never both.
  Filtering/sorting beyond that happens in JS after the fetch.
*/

// GET /api/conversations?type=&priorityOnly=&search=&limit=
router.get("/", async (req, res) => {
  try {
    const { type, priorityOnly, search, limit } = req.query;
    const userId = req.userId || "default_user";
    const cacheKey = `convs_${userId}_${type || "all"}_${priorityOnly || "false"}_${search || ""}_${limit || "300"}`;

    const { queryCache } = await import("../../db/dataScaling.js");
    const cached = queryCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const maxLimit = Math.min(Number(limit) > 0 ? Number(limit) : 300, 500);

    const snapshot = await db
      .collection("conversations")
      .orderBy("lastMessageAt", "desc")
      .limit(maxLimit)
      .get();

    let conversations = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        lastMessageAt: d.lastMessageAt?.toDate?.().toISOString() ?? null,
        updatedAt: d.updatedAt?.toDate?.().toISOString() ?? null,
        priority: d.priority === true,
        priorityLevel: d.priorityLevel || "normal",
      };
    });

    if (type && type !== "all") {
      conversations = conversations.filter((c) => c.chatType === type);
    }

    if (priorityOnly === "true") {
      conversations = conversations.filter((c) => c.priority);
    }

    if (search) {
      const q = String(search).toLowerCase();
      conversations = conversations.filter((c) =>
        (c.chatName || "").toLowerCase().includes(q)
      );
    }

    const capped = conversations.slice(0, Number(limit) > 0 ? Number(limit) : 200);
    const responsePayload = { conversations: capped };
    queryCache.set(cacheKey, responsePayload);

    res.json(responsePayload);
  } catch (error) {
    console.error("[API] /conversations error:", error);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

// GET /api/conversations/:chatId
router.get("/:chatId", async (req, res) => {
  try {
    const doc = await db.collection("conversations").doc(req.params.chatId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const settings = await getChatSettings(req.params.chatId);

    res.json({
      id: doc.id,
      ...doc.data(),
      lastMessageAt: doc.data().lastMessageAt?.toDate?.().toISOString() ?? null,
      updatedAt: doc.data().updatedAt?.toDate?.().toISOString() ?? null,
      priority: settings.priority,
      priorityLevel: settings.priorityLevel,
    });
  } catch (error) {
    console.error("[API] /conversations/:chatId error:", error);
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

// GET /api/conversations/:chatId/messages?limit=
router.get("/:chatId/messages", async (req, res) => {
  try {
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 100;

    // Equality-only query (no orderBy alongside it) — needs no composite
    // index. Capped at 300 reads (was 1000 — that alone, polled every
    // 10s while a chat was open, was the single biggest contributor to
    // the quota being exhausted). Sort + trim happens here in JS.
    const snapshot = await db
      .collection("messages")
      .where("chatId", "==", req.params.chatId)
      .limit(300)
      .get();

    const messages = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.().toISOString() ?? null,
      }))
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .slice(-limit);

    res.json({ messages });
  } catch (error) {
    console.error("[API] /conversations/:chatId/messages error:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

export default router;
