import { getChatMessages } from "./chatContext.js";
import { analyzeChat } from "./nlpEngine.js";
import { db } from "../firebase.js";


export async function analyzeSingleChat(
  chatId
) {

  console.log(
    `[NLP] Analyzing chat: ${chatId}`
  );


  // ---------------------------------------------
  // Get messages ONLY from this chat
  // ---------------------------------------------

  const messages =
    await getChatMessages(
      chatId,
      100
    );


  if (messages.length === 0) {

    return {
      chatId,
      messageCount: 0,
      topics: [],
      deadlines: [],
      tasks: [],
      keywords: []
    };
  }


  // ---------------------------------------------
  // NLP
  // ---------------------------------------------

  const analysis =
    await analyzeChat(
      messages.map((message) => ({
        text: message.text || "",
        sender: message.sender || "",
        receivedAt:
          message.receivedAt || null
      }))
    );


  // ---------------------------------------------
  // Save analysis
  // ---------------------------------------------

  await db
    .collection("conversations")
    .doc(chatId)
    .set(
      {
        nlpAnalysis: {
          ...analysis,

          analyzedAt:
            new Date()
        }
      },
      {
        merge: true
      }
    );


  console.log(
    `[NLP] Analysis saved for ${chatId}`
  );


  return {
    chatId,
    ...analysis
  };
}