import { db } from "../firebase.js";

export async function getChatMessages(chatId, limit = 100) {
  // Order by receivedAt in Firestore itself, THEN limit — this guarantees you
  // get the most recent `limit` messages, not an arbitrary subset that
  // happens to get sorted afterward.
  //
  // Note: Firestore may ask you to create a composite index the first time
  // this query runs (since it combines a "where" filter with an "orderBy"
  // on a different field). If that happens, the error message includes a
  // direct link to auto-create the index — just click it, takes ~1 minute.
  const snapshot = await db
    .collection("messages")
    .where("chatId", "==", chatId)
    .orderBy("receivedAt", "desc")
    .limit(limit)
    .get();

  const messages = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Firestore gave us newest-first (desc) for the limit to work correctly.
  // Reverse here so downstream code (NLP analysis, etc.) sees them in
  // natural chronological order (oldest -> newest), matching what it expects.
  messages.reverse();

  return messages;
}