import { Router } from "express";
import { detectBehaviorPatterns } from "../../behavior/behaviorEngine.js";

const router = Router();

// GET /api/behavior/patterns
// Wraps the existing detectBehaviorPatterns() from behaviorEngine.js —
// same function the backend already runs on its 5-minute timer.
router.get("/patterns", async (req, res) => {
  try {
    const patterns = await detectBehaviorPatterns();
    res.json({ patterns });
  } catch (error) {
    console.error("[API] /behavior/patterns error:", error);
    res.status(500).json({ error: "Failed to load behavior patterns" });
  }
});

export default router;
