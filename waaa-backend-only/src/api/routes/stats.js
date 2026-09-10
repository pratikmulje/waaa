import { Router } from "express";
import { db } from "../../firebase.js";

const router = Router();

// GET /api/stats/summary
// Real counts only. Score-based counts (fraud/important) are computed
// client-side over a recent window instead of relying on composite
// Firestore indexes that may not exist on this project yet.
router.get("/summary", async (req, res) => {
  try {
    const [messagesCountSnap, conversationsCountSnap] = await Promise.all([
      db.collection("messages").count().get(),
      db.collection("conversations").count().get(),
    ]);

    const recentSnap = await db
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    let fraudAlerts = 0;
    let importantMessages = 0;
    let priorityChatMessages = 0;

    recentSnap.docs.forEach((doc) => {
      const data = doc.data();

      if ((data.fraudAnalysis?.finalScore ?? 0) >= 60) fraudAlerts += 1;
      if ((data.importanceAnalysis?.finalScore ?? 0) >= 75) importantMessages += 1;
      if (data.chatPriority) priorityChatMessages += 1;
    });

    res.json({
      totalMessages: messagesCountSnap.data().count,
      totalConversations: conversationsCountSnap.data().count,
      fraudAlerts,
      importantMessages,
      priorityChatMessages,
      windowSize: recentSnap.size,
    });
  } catch (error) {
    console.error("[API] /stats/summary error:", error);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

export default router;
