import { Router } from "express";
import { getChatSettings, setChatPriorityLevel, PRIORITY_LEVELS } from "../../chat/chatSettings.js";

const router = Router();

router.get("/:chatId/settings", async (req, res) => {
  try {
    const settings = await getChatSettings(req.params.chatId);
    res.json(settings);
  } catch (error) {
    console.error("[API] /chats/:chatId/settings error:", error);
    res.status(500).json({ error: "Failed to load chat settings" });
  }
});

router.post("/:chatId/priority", async (req, res) => {
  try {
    const { priorityLevel } = req.body;

    if (!PRIORITY_LEVELS.includes(priorityLevel)) {
      return res.status(400).json({
        error: `priorityLevel must be one of: ${PRIORITY_LEVELS.join(", ")}`,
      });
    }

    const ok = await setChatPriorityLevel(req.params.chatId, priorityLevel);

    if (!ok) {
      return res.status(500).json({ error: "Failed to update priority" });
    }

    res.json({ chatId: req.params.chatId, priorityLevel, priority: priorityLevel !== "normal" });
  } catch (error) {
    console.error("[API] POST /chats/:chatId/priority error:", error);
    res.status(500).json({ error: "Failed to update priority" });
  }
});

export default router;