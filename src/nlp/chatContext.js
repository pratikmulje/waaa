import { db } from "../firebase.js";

export async function getChatMessages(chatId, limit = 100) {
  const snapshot = await db
    .collection("messages")
    .where("chatId", "==", chatId)
    .limit(limit)
    .get();

  const messages = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data()
    }))
    .sort((a, b) => {
      const timeA = new Date(a.receivedAt || 0).getTime();
      const timeB = new Date(b.receivedAt || 0).getTime();

      return timeA - timeB;
    });

  return messages;
}