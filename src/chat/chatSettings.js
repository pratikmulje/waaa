import { db } from "../firebase.js";

// Get settings for a specific chat
export async function getChatSettings(chatId) {
  try {
    const doc = await db
      .collection("chatSettings")
      .doc(chatId)
      .get();

    if (!doc.exists) {
      return {
        priority: false,
        priorityLevel: "normal",
      };
    }

    const data = doc.data();

    return {
      priority: data.priority === true,
      priorityLevel: data.priorityLevel || "normal",
    };

  } catch (error) {
    console.error(
      "[Chat Settings] Failed to get settings:",
      error.message
    );

    return {
      priority: false,
      priorityLevel: "normal",
    };
  }
}


// Manually mark a chat as priority
export async function setChatPriority(
  chatId,
  priority = true
) {
  try {
    await db
      .collection("chatSettings")
      .doc(chatId)
      .set(
        {
          chatId,
          priority,
          priorityLevel: priority
            ? "high"
            : "normal",
          updatedAt: new Date(),
        },
        {
          merge: true,
        }
      );

    console.log(
      `[Chat Settings] ${chatId} priority = ${priority}`
    );

    return true;

  } catch (error) {
    console.error(
      "[Chat Settings] Failed to update:",
      error.message
    );

    return false;
  }
}