import { db } from "../firebase.js";

export const PRIORITY_LEVELS = ["normal", "low", "medium", "high", "critical"];

export async function getChatSettings(chatId) {
  try {
    const doc = await db.collection("chatSettings").doc(chatId).get();

    if (!doc.exists) {
      return { priority: false, priorityLevel: "normal", intelligenceTier: null };
    }

    const data = doc.data();

    return {
      priority:         data.priority === true,
      priorityLevel:    data.priorityLevel || "normal",
      // Phase 2 addition — null means "use auto-detection"
      intelligenceTier: data.intelligenceTier || null,
    };
  } catch (error) {
    console.error("[Chat Settings] Failed to get settings:", error.message);
    return { priority: false, priorityLevel: "normal", intelligenceTier: null };
  }
}

export async function setChatPriorityLevel(chatId, priorityLevel) {
  if (!PRIORITY_LEVELS.includes(priorityLevel)) {
    console.error(
      `[Chat Settings] Invalid priority level "${priorityLevel}" — must be one of ${PRIORITY_LEVELS.join(", ")}`
    );
    return false;
  }

  const priority = priorityLevel !== "normal";

  try {
    await db.collection("chatSettings").doc(chatId).set(
      { chatId, priority, priorityLevel, updatedAt: new Date() },
      { merge: true }
    );

    try {
      await db.collection("conversations").doc(chatId).set(
        { priority, priorityLevel },
        { merge: true }
      );
    } catch (mirrorError) {
      console.error("[Chat Settings] Failed to mirror priority onto conversation doc:", mirrorError.message);
    }

    console.log(`[Chat Settings] ${chatId} priorityLevel = ${priorityLevel}`);
    return true;
  } catch (error) {
    console.error("[Chat Settings] Failed to update:", error.message);
    return false;
  }
}