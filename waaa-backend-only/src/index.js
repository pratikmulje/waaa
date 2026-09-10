// import "dotenv/config";

// import {
//   default as makeWASocket,
//   useMultiFileAuthState,
//   DisconnectReason,
//   fetchLatestBaileysVersion,
// } from "@whiskeysockets/baileys";

// import {
//   scheduleBackup,
//   cancelScheduledBackup,
//   watchForCorruption,
//   restoreAuthInfoFromBackup,
// } from "./session/sessionGuard.js";

// import { Boom } from "@hapi/boom";
// import qrcode from "qrcode-terminal";
// import pino from "pino";

// import { db } from "./firebase.js";

// import { analyzeRules } from "./fraud/fraudRules.js";
// import { analyzeImportanceRules } from "./importance/importanceRules.js";

// import {
//   predictFraud,
//   predictImportance,
// } from "./ml.js";

// import {
//   recordOutgoingMessage,
//   detectBehaviorPatterns,
// } from "./behavior/behaviorEngine.js";

// import { getChatSettings } from "./chat/chatSettings.js";

// import { analyzeSingleChat } from "./nlp/chatAnalyzer.js";

// import {
//   setConnectionState,
//   setQR,
//   setConnected,
// } from "./state/connectionState.js";

// import { hub } from "./api/sseHub.js";

// import { getChatMemory } from "./ai/chatMemory.js";

// import {
//   shouldCallGemini,
//   analyzeWithContext,
// } from "./ai/contextIntelligence.js";

// // ==================================================
// // LOGGER
// // ==================================================

// let currentSock = null;


// const logger = pino({
//   level: "silent",
// });


// // ==================================================
// // GLOBAL STATE
// // ==================================================

// let reconnecting = false;
// let behaviorTimerStarted = false;


// // ==================================================
// // SAFE NUMBER
// // ==================================================

// function safeNumber(value, fallback = 0) {

//   const number = Number(value);

//   if (!Number.isFinite(number)) {
//     return fallback;
//   }

//   return number;
// }


// // ==================================================
// // NORMALIZE ML RESULT
// // ==================================================

// function normalizeMLResult(result) {

//   if (!result || typeof result !== "object") {

//     return {
//       prediction: 0,
//       probability: 0,
//     };
//   }

//   const prediction =
//     result.prediction ??
//     result.label ??
//     result.class ??
//     0;

//   const probability =
//     result.probability ??
//     result.confidence ??
//     result.score ??
//     0;

//   return {

//     prediction:
//       prediction ?? 0,

//     probability:
//       safeNumber(
//         probability,
//         0
//       ),
//   };
// }


// // ==================================================
// // CHAT TYPE
// // ==================================================

// function getChatType(chatId) {

//   if (!chatId) {
//     return "unknown";
//   }


//   // Personal chat

//   if (
//     chatId.endsWith("@s.whatsapp.net") ||
//     chatId.endsWith("@lid")
//   ) {

//     return "personal";
//   }


//   // Group

//   if (
//     chatId.endsWith("@g.us")
//   ) {

//     return "group";
//   }


//   // Channel

//   if (
//     chatId.endsWith("@newsletter")
//   ) {

//     return "channel";
//   }


//   return "unknown";
// }


// // ==================================================
// // GROUP CACHE
// // ==================================================

// const groupCache = new Map();
// const channelCache = new Map();
// const contactsCache = new Map();

// // ==================================================
// // GET CHAT INFORMATION
// // ==================================================

// async function getChatInfo(
//   sock,
//   chatId,
//   pushName

// ) {

//   const basicType =
//     getChatType(chatId);


//   // -----------------------------------------------
//   // PERSONAL
//   // -----------------------------------------------

//   if (
//     basicType === "personal"
//   ) {

//     return {

//       chatType: "personal",

//       chatName:
//         contactsCache.get(chatId) ||
//         pushName ||
//         chatId.split("@")[0],

//       isCommunity: false,

//       participantCount: null,

//       linkedParent: null,
//     };
//   }


//   // -----------------------------------------------
//   // CHANNEL
//   // -----------------------------------------------

//   if (
//     basicType === "channel"
//   ) {

//     if (
//       channelCache.has(chatId)
//     ) {

//       return channelCache.get(chatId);
//     }

//     try {

//       const metadata =
//         await sock.newsletterMetadata(
//           "jid",
//           chatId
//         );

//       const info = {

//         chatType: "channel",

//         chatName:
//           metadata?.name ||
//           metadata?.subject ||
//           chatId,

//         isCommunity: false,

//         participantCount:
//           metadata?.subscribers ??
//           null,

//         linkedParent: null,
//       };

//       channelCache.set(
//         chatId,
//         info
//       );

//       return info;

//     } catch (error) {

//       console.log(
//         `[chat] Could not fetch channel metadata for ${chatId}:`,
//         error.message
//       );

//       return {

//         chatType: "channel",

//         chatName: chatId,

//         isCommunity: false,

//         participantCount: null,

//         linkedParent: null,
//       };
//     }
//   }


//   // -----------------------------------------------
//   // UNKNOWN
//   // -----------------------------------------------

//   if (
//     basicType !== "group"
//   ) {

//     return {

//       chatType: "unknown",

//       chatName: chatId,

//       isCommunity: false,

//       participantCount: null,

//       linkedParent: null,
//     };
//   }


//   // -----------------------------------------------
//   // CACHE
//   // -----------------------------------------------

//   if (
//     groupCache.has(chatId)
//   ) {

//     return groupCache.get(chatId);
//   }


//   // -----------------------------------------------
//   // GROUP METADATA
//   // -----------------------------------------------

//   try {

//     const metadata =
//       await sock.groupMetadata(
//         chatId
//       );


//     let chatType =
//       "group";


//     if (
//       metadata.isCommunity ||
//       metadata.isCommunityAnnounce
//     ) {

//       chatType =
//         "community";
//     }


//     const info = {

//       chatType,

//       chatName:
//         metadata.subject ||
//         chatId,

//       isCommunity:
//         Boolean(
//           metadata.isCommunity ||
//           metadata.isCommunityAnnounce
//         ),

//       participantCount:
//         metadata.participants?.length ||
//         0,

//       linkedParent:
//         metadata.linkedParent ||
//         null,
//     };


//     groupCache.set(
//       chatId,
//       info
//     );


//     return info;

//   } catch (error) {

//     console.log(
//       `[chat] Could not fetch metadata for ${chatId}:`,
//       error.message
//     );


//     return {

//       chatType: "group",

//       chatName: chatId,

//       isCommunity: false,

//       participantCount: null,

//       linkedParent: null,
//     };
//   }
// }


// // ==================================================
// // EXTRACT MESSAGE TEXT
// // ==================================================

// function extractMessageText(
//   message
// ) {

//   if (!message) {
//     return null;
//   }


//   return (

//     message.conversation ||

//     message.extendedTextMessage?.text ||

//     message.imageMessage?.caption ||

//     message.videoMessage?.caption ||

//     message.documentMessage?.caption ||

//     message.buttonsResponseMessage
//       ?.selectedDisplayText ||

//     message.listResponseMessage
//       ?.title ||

//     message.templateButtonReplyMessage
//       ?.selectedDisplayText ||

//     null
//   );
// }


// // ==================================================
// // SAVE MESSAGE
// // ==================================================

// async function saveMessage(
//   entry
// ) {

//   try {

//     /*
//       Remove undefined recursively
//       before sending data to Firestore.
//     */

//     const cleanEntry =
//       JSON.parse(
//         JSON.stringify(
//           entry,
//           (_, value) =>
//             value === undefined
//               ? null
//               : value
//         )
//       );


//     const docRef =
//       await db
//         .collection("messages")
//         .add({

//           ...cleanEntry,

//           createdAt:
//             new Date(),
//         });


//     console.log(
//       `[Storage] Message saved: ${docRef.id}`
//     );


//     return docRef.id;

//   } catch (error) {

//     console.error(
//       "[Storage] Failed to save message:",
//       error
//     );


//     return null;
//   }
// }


// // ==================================================
// // SAVE CONVERSATION
// // ==================================================

// async function saveConversation(
//   chatId,
//   chatInfo,
//   messageData
// ) {

//   try {

//     await db
//       .collection("conversations")
//       .doc(chatId)
//       .set(

//         {

//           chatId,

//           chatType:
//             chatInfo.chatType,

//           chatName:
//             chatInfo.chatName,

//           isCommunity:
//             Boolean(
//               chatInfo.isCommunity
//             ),

//           participantCount:
//             chatInfo.participantCount ??
//             null,

//           linkedParent:
//             chatInfo.linkedParent ??
//             null,

//           lastMessage:
//             messageData.text ??
//             "",

//           lastMessageAt:
//             new Date(),

//           updatedAt:
//             new Date(),
//         },

//         {
//           merge: true,
//         }
//       );


//     console.log(
//       `[Storage] Conversation updated: ${chatInfo.chatName} (${chatInfo.chatType})`
//     );

//   } catch (error) {

//     console.error(
//       "[Storage] Failed to save conversation:",
//       error
//     );
//   }
// }


// // ==================================================
// // FRAUD ANALYSIS
// // ==================================================

// async function analyzeFraud(
//   text
// ) {

//   // -----------------------------------------------
//   // RULES
//   // -----------------------------------------------

//   let ruleResult = {

//     score: 0,

//     reasons: [],
//   };


//   try {

//     const result =
//       analyzeRules(
//         text
//       );


//     if (result) {

//       ruleResult = {

//         score:
//           safeNumber(
//             result.score
//           ),

//         reasons:
//           Array.isArray(
//             result.reasons
//           )
//             ? result.reasons
//             : [],
//       };
//     }

//   } catch (error) {

//     console.error(
//       "[Fraud Rules] Error:",
//       error.message
//     );
//   }


//   // -----------------------------------------------
//   // ML
//   // -----------------------------------------------

//   let mlResult = {

//     prediction: 0,

//     probability: 0,
//   };


//   try {

//     const result =
//       await predictFraud(
//         text
//       );


//     mlResult =
//       normalizeMLResult(
//         result
//       );

//   } catch (error) {

//     console.error(
//       "[Fraud ML] Error:",
//       error.message
//     );
//   }


//   // -----------------------------------------------
//   // ML PROBABILITY
//   // -----------------------------------------------

//   let mlScore =
//     mlResult.probability;


//   if (
//     mlScore <= 1
//   ) {

//     mlScore *= 100;
//   }


//   mlScore =
//     Math.round(
//       Math.min(
//         Math.max(
//           mlScore,
//           0
//         ),
//         100
//       )
//     );


//   const ruleScore =
//     Math.min(
//       ruleResult.score,
//       100
//     );


//   // -----------------------------------------------
//   // FINAL SCORE
//   //
//   // Previously weighted 40% rules / 60% ML — if the ML model
//   // is untrained/unavailable and returns 0, that dragged an
//   // obvious rule-based match (e.g. a phishing message) down to
//   // "low risk". Rules are now weighted higher, plus a floor so
//   // a strong rule match is never fully erased by a weak ML score.
//   // -----------------------------------------------

//   const weightedScore =
//     ruleScore * 0.7 +

//     mlScore * 0.3;

//   const finalScore =
//     Math.round(
//       Math.max(
//         weightedScore,
//         ruleScore * 0.6 // floor: rules alone still carry through
//       )
//     );


//   // -----------------------------------------------
//   // RISK
//   // -----------------------------------------------

//   let riskLevel =
//     "low";


//   if (
//     finalScore >= 80
//   ) {

//     riskLevel =
//       "critical";

//   } else if (
//     finalScore >= 60
//   ) {

//     riskLevel =
//       "high";

//   } else if (
//     finalScore >= 30
//   ) {

//     riskLevel =
//       "medium";
//   }


//   return {

//     ruleScore,

//     mlScore,

//     finalScore,

//     riskLevel,

//     reasons:
//       ruleResult.reasons,

//     mlPrediction:
//       mlResult.prediction ?? 0,

//     mlProbability:
//       safeNumber(
//         mlResult.probability
//       ),
//   };
// }


// // ==================================================
// // IMPORTANCE ANALYSIS
// // ==================================================

// async function analyzeImportance(
//   text
// ) {

//   // -----------------------------------------------
//   // RULES
//   // -----------------------------------------------

//   let ruleResult = {

//     score: 0,

//     reasons: [],
//   };


//   try {

//     const result =
//       analyzeImportanceRules(
//         text
//       );


//     if (result) {

//       ruleResult = {

//         score:
//           safeNumber(
//             result.score
//           ),

//         reasons:
//           Array.isArray(
//             result.reasons
//           )
//             ? result.reasons
//             : [],
//       };
//     }

//   } catch (error) {

//     console.error(
//       "[Importance Rules] Error:",
//       error.message
//     );
//   }


//   // -----------------------------------------------
//   // ML
//   // -----------------------------------------------

//   let mlResult = {

//     prediction: 0,

//     probability: 0,
//   };


//   try {

//     const result =
//       await predictImportance(
//         text
//       );


//     mlResult =
//       normalizeMLResult(
//         result
//       );

//   } catch (error) {

//     console.error(
//       "[Importance ML] Error:",
//       error.message
//     );
//   }


//   // -----------------------------------------------
//   // ML SCORE
//   // -----------------------------------------------

//   let mlScore =
//     mlResult.probability;


//   if (
//     mlScore <= 1
//   ) {

//     mlScore *= 100;
//   }


//   mlScore =
//     Math.round(
//       Math.min(
//         Math.max(
//           mlScore,
//           0
//         ),
//         100
//       )
//     );


//   const ruleScore =
//     Math.min(
//       ruleResult.score,
//       100
//     );


//   // -----------------------------------------------
//   // FINAL SCORE
//   // -----------------------------------------------

//   const finalScore =
//     Math.round(

//       ruleScore * 0.4 +

//       mlScore * 0.6
//     );


//   // -----------------------------------------------
//   // LEVEL
//   // -----------------------------------------------

//   let level =
//     "normal";


//   if (
//     finalScore >= 75
//   ) {

//     level =
//       "high";

//   } else if (
//     finalScore >= 50
//   ) {

//     level =
//       "medium";
//   }


//   return {

//     ruleScore,

//     mlScore,

//     finalScore,

//     level,

//     reasons:
//       ruleResult.reasons,

//     mlPrediction:
//       mlResult.prediction ?? 0,

//     mlProbability:
//       safeNumber(
//         mlResult.probability
//       ),
//   };
// }


// // ==================================================
// // BEHAVIOR TIMER
// // ==================================================

// function startBehaviorTimer() {

//   if (
//     behaviorTimerStarted
//   ) {

//     return;
//   }


//   behaviorTimerStarted =
//     true;


//   setInterval(

//     async () => {

//       console.log(
//         "\n🔄 Running behavioral pattern analysis..."
//       );


//       try {

//         const patterns =
//           await detectBehaviorPatterns();


//         const suggestions =
//           patterns.filter(
//             (pattern) =>
//               pattern.suggested === true
//           );


//         if (
//           suggestions.length > 0
//         ) {

//           console.log(
//             `🔄 ${suggestions.length} behavioral pattern suggestion(s) found.`
//           );


//           for (
//             const pattern
//             of suggestions
//           ) {

//             console.log(
//               "\n📌 BEHAVIOR PATTERN"
//             );

//             console.log(
//               `Template: ${pattern.template}`
//             );

//             console.log(
//               `Time: Around ${pattern.hour}:00`
//             );

//             console.log(
//               `Recipients: ${pattern.recipientCount}`
//             );

//             console.log(
//               `Frequency: ${pattern.frequency}`
//             );

//             console.log(
//               `Confidence: ${pattern.confidence}%`
//             );

//             console.log(
//               "Status: SUGGESTED — waiting for user approval"
//             );
//           }

//         } else {

//           console.log(
//             "[Behavior] No strong repeated patterns detected."
//           );
//         }

//       } catch (error) {

//         console.error(
//           "[Behavior] Analysis error:",
//           error
//         );
//       }

//     },

//     5 * 60 * 1000
//   );
// }


// // ==================================================
// // NLP TEST
// // ==================================================

// function startNLPTest() {

//   setTimeout(
//     async () => {

//       try {

//         const testChatId =
//           "120363406373101038@g.us";


//         console.log(
//           `\n[NLP] Analyzing chat: ${testChatId}`
//         );


//         const result =
//           await analyzeSingleChat(
//             testChatId
//           );


//         console.log(
//           "\n🧠 NLP RESULT"
//         );


//         console.log(
//           JSON.stringify(
//             result,
//             null,
//             2
//           )
//         );

//       } catch (error) {

//         console.error(
//           "[NLP] Error:",
//           error
//         );
//       }

//     },

//     5000
//   );
// }


// // ==================================================
// // PROCESS INCOMING MESSAGE
// // ==================================================

// async function processIncomingMessage(
//   sock,
//   msg
// ) {

//   try {

//     if (
//       !msg.message
//     ) {

//       console.log(
//         "[skip] Message has no message content"
//       );

//       return;
//     }


//     const chatId =
//       msg.key.remoteJid;


//     if (!chatId) {

//       console.log(
//         "[skip] No remoteJid"
//       );

//       return;
//     }


//     // =================================================
//     // CHAT INFORMATION
//     // =================================================


//     const chatInfo =
//       await getChatInfo(
//         sock,
//         chatId,
//         msg.pushName
//       );


//     // =================================================
//     // CHAT PRIORITY
//     // =================================================

//     let chatSettings = {

//       priority: false,
//     };


//     try {

//       chatSettings =
//         await getChatSettings(
//           chatId
//         );

//     } catch (error) {

//       console.error(
//         "[Chat Settings] Error:",
//         error.message
//       );
//     }


//     const isPriorityChat =
//       chatSettings?.priority === true;


//     if (
//       isPriorityChat
//     ) {

//       importanceAnalysis.reasons.push(
//         `Chat priority: ${chatSettings?.priorityLevel || "normal"}`
//       );
//     }


//     // =================================================
//     // SENDER
//     // =================================================

//     const sender =
//       msg.pushName ||

//       msg.key.participant ||

//       chatId;


//     // =================================================
//     // TEXT
//     // =================================================

//     const text =
//       extractMessageText(
//         msg.message
//       );


//     if (!text) {

//       console.log(
//         `[skip] Unsupported message type from ${sender}`
//       );

//       return;
//     }


//     // =================================================
//     // DISPLAY
//     // =================================================

//     console.log(
//       "\n--------------------------------"
//     );

//     console.log(
//       "📩 New message"
//     );

//     console.log(
//       `Chat: ${chatInfo.chatName}`
//     );

//     console.log(
//       `Type: ${chatInfo.chatType}`
//     );

//     console.log(
//       `Chat ID: ${chatId}`
//     );

//     console.log(
//       `Sender: ${sender}`
//     );

//     console.log(
//       `Message: ${text}`
//     );

//     console.log(
//       "--------------------------------"
//     );


//     // =================================================
//     // FRAUD
//     // =================================================

//     const fraudAnalysis =
//       await analyzeFraud(
//         text
//       );


//     // =================================================
//     // IMPORTANCE
//     // =================================================

//     const importanceAnalysis =
//       await analyzeImportance(
//         text
//       );
//     // =================================================
//     // CONTEXT INTELLIGENCE (Gemini) — only called for
//     // ambiguous or context-relevant messages, never every
//     // message. Falls back silently to the local score above
//     // on any failure (missing key, quota, timeout, bad JSON).
//     // =================================================

//     // =================================================
//     // LOCAL CONTEXT SCORING (memory-aware, ALWAYS runs, never
//     // calls Gemini directly — replaces the old per-message live
//     // Gemini call). Uncertain messages get queued for periodic
//     // BATCHED memory review instead of an immediate API call.
//     // =================================================

//     try {

//       const memory =
//         await getChatMemory(
//           chatId
//         );

//       const localResult =
//         scoreWithLocalContext(
//           importanceAnalysis,
//           text,
//           memory
//         );

//       importanceAnalysis.finalScore =
//         localResult.score;

//       importanceAnalysis.level =
//         localResult.level;

//       importanceAnalysis.reasons =
//         localResult.reasons;

//       importanceAnalysis.confidence =
//         localResult.confidence;

//       if (
//         needsGeminiForImportance(
//           localResult,
//           text
//         )
//       ) {

//         queueForMemoryReview(
//           chatId,
//           sender,
//           text
//         );
//       }

//     } catch (error) {

//       console.error(
//         "[Context Scoring] Error (importance stays as locally computed):",
//         error.message
//       );
//     }


//     // =================================================
//     // PRIORITY CHAT OVERRIDE
//     // =================================================

//     if (
//       isPriorityChat
//     ) {

//       importanceAnalysis.finalScore =
//         100;

//       importanceAnalysis.level =
//         "high";


//       if (
//         !importanceAnalysis.reasons.includes(
//           "User marked this chat as priority"
//         )
//       ) {

//         importanceAnalysis.reasons.push(
//           "User marked this chat as priority"
//         );
//       }
//     }


//     // =================================================
//     // FRAUD OUTPUT
//     // =================================================

//     console.log(
//       "\n🛡️ FRAUD ANALYSIS"
//     );

//     console.log(
//       `Rule Score: ${fraudAnalysis.ruleScore}/100`
//     );

//     console.log(
//       `ML Score: ${fraudAnalysis.mlScore}/100`
//     );

//     console.log(
//       `Final Score: ${fraudAnalysis.finalScore}/100`
//     );

//     console.log(
//       `Risk: ${fraudAnalysis.riskLevel}`
//     );

//     console.log(
//       `ML Prediction: ${fraudAnalysis.mlPrediction}`
//     );

//     console.log(
//       `ML Probability: ${fraudAnalysis.mlProbability}`
//     );


//     if (
//       fraudAnalysis.reasons.length > 0
//     ) {

//       console.log(
//         "Reasons:"
//       );


//       fraudAnalysis.reasons.forEach(
//         (reason) => {

//           console.log(
//             `  ⚠ ${reason}`
//           );
//         }
//       );

//     } else {

//       console.log(
//         "No rule-based suspicious indicators detected."
//       );
//     }


//     // =================================================
//     // IMPORTANCE OUTPUT
//     // =================================================

//     console.log(
//       "\n🔥 IMPORTANCE ANALYSIS"
//     );

//     console.log(
//       `Rule Score: ${importanceAnalysis.ruleScore}/100`
//     );

//     console.log(
//       `ML Score: ${importanceAnalysis.mlScore}/100`
//     );

//     console.log(
//       `Final Score: ${importanceAnalysis.finalScore}/100`
//     );

//     console.log(
//       `Level: ${importanceAnalysis.level}`
//     );

//     console.log(
//       `ML Prediction: ${importanceAnalysis.mlPrediction}`
//     );

//     console.log(
//       `ML Probability: ${importanceAnalysis.mlProbability}`
//     );


//     if (
//       importanceAnalysis.reasons.length > 0
//     ) {

//       console.log(
//         "Reasons:"
//       );


//       importanceAnalysis.reasons.forEach(
//         (reason) => {

//           console.log(
//             `  📌 ${reason}`
//           );
//         }
//       );

//     } else {

//       console.log(
//         "No rule-based important indicators detected."
//       );
//     }


//     // =================================================
//     // MESSAGE DATA
//     // =================================================

//     const messageData = {

//       // Chat

//       chatId,

//       chatType:
//         chatInfo.chatType,

//       chatName:
//         chatInfo.chatName,

//       isCommunity:
//         Boolean(
//           chatInfo.isCommunity
//         ),

//       participantCount:
//         chatInfo.participantCount ??
//         null,

//       linkedParent:
//         chatInfo.linkedParent ??
//         null,


//       // Sender

//       sender,

//       senderJid:
//         msg.key.participant ||
//         chatId,


//       // Message

//       text,

//       messageId:
//         msg.key.id ??
//         null,

//       receivedAt:
//         new Date().toISOString(),


//       // Fraud

//       fraudAnalysis: {

//         ruleScore:
//           fraudAnalysis.ruleScore,

//         mlScore:
//           fraudAnalysis.mlScore,

//         finalScore:
//           fraudAnalysis.finalScore,

//         riskLevel:
//           fraudAnalysis.riskLevel,

//         reasons:
//           fraudAnalysis.reasons,

//         mlPrediction:
//           fraudAnalysis.mlPrediction ??
//           0,

//         mlProbability:
//           safeNumber(
//             fraudAnalysis.mlProbability
//           ),
//       },


//       // Importance

//       importanceAnalysis: {

//         ruleScore:
//           importanceAnalysis.ruleScore,

//         mlScore:
//           importanceAnalysis.mlScore,

//         finalScore:
//           importanceAnalysis.finalScore,

//         level:
//           importanceAnalysis.level,

//         reasons:
//           importanceAnalysis.reasons,

//         mlPrediction:
//           importanceAnalysis.mlPrediction ??
//           0,

//         mlProbability:
//           safeNumber(
//             importanceAnalysis.mlProbability
//           ),
//       },


//       // Chat priority

//       chatPriority:
//         isPriorityChat,
//     };


//     // =================================================
//     // FIREBASE
//     // =================================================

//     await saveMessage(
//       messageData
//     );


//     await saveConversation(
//       chatId,
//       chatInfo,
//       messageData
//     );


//     // Feed the frontend's live SSE stream (/api/messages/stream).
//     // Does not change any existing WhatsApp/Firestore behavior above.
//     hub.publish("message", messageData);


//     console.log(
//       "\n================================\n"
//     );

//   } catch (error) {

//     console.error(
//       "[Message Processing] Error:",
//       error
//     );
//   }
// }


// // ==================================================
// // START WHATSAPP
// // ==================================================

// async function start() {

//   if (
//     reconnecting
//   ) {

//     return;
//   }


//   reconnecting =
//     true;

//   setConnectionState({ status: "connecting" });


//   try {

//     // -----------------------------------------------
//     // AUTH
//     // -----------------------------------------------

//     const {
//       state,
//       saveCreds,
//     } =
//       await useMultiFileAuthState(
//         "auth_info"
//       );


//     // -----------------------------------------------
//     // VERSION
//     // -----------------------------------------------

//     const {
//       version,
//     } =
//       await fetchLatestBaileysVersion();


//     console.log(
//       `[WhatsApp] Using Baileys version: ${version.join(".")}`
//     );


//     // -----------------------------------------------
//     // SOCKET
//     // -----------------------------------------------

//     const sock =
//       makeWASocket({

//         version,

//         auth: state,

//         logger,

//         printQRInTerminal: false,
//       });


//     currentSock = sock;


//     reconnecting =
//       false;


//     // =================================================
//     // CONNECTION
//     // =================================================

//     function absorbContacts(contacts) {

//       for (
//         const contact of
//         contacts || []
//       ) {

//         const jid =
//           contact.id;

//         const name =
//           contact.name ||
//           contact.verifiedName ||
//           contact.notify;

//         if (
//           jid &&
//           name
//         ) {

//           contactsCache.set(
//             jid,
//             name
//           );
//         }
//       }
//     }

//     sock.ev.on(
//       "contacts.upsert",
//       absorbContacts
//     );

//     sock.ev.on(
//       "contacts.update",
//       absorbContacts
//     );

//     sock.ev.on(
//       "connection.update",

//       async (update) => {

//         const {

//           connection,

//           lastDisconnect,

//           qr,

//         } = update;


//         // ---------------------------------------------
//         // QR
//         // ---------------------------------------------

//         if (qr) {

//           console.log(
//             "\nScan this QR code with WhatsApp:"
//           );

//           console.log(
//             "WhatsApp → Settings → Linked Devices → Link a Device\n"
//           );


//           qrcode.generate(
//             qr,
//             {
//               small: true,
//             }
//           );

//           // Same raw QR string, exposed to the frontend via /api/connection.
//           setQR(qr);
//         }


//         // ---------------------------------------------
//         // OPEN
//         // ---------------------------------------------

//         if (
//           connection === "open"
//         ) {

//           console.log(
//             "[connection] connected to WhatsApp ✅"
//           );


//           console.log(
//             "[connection] Message listener is active ✅"
//           );

//           setConnected();


//           startBehaviorTimer();
//           startMemoryRefreshTimer();

//           startNLPTest();
//         }


//         // ---------------------------------------------
//         // CLOSE
//         // ---------------------------------------------

//         if (
//           connection === "close"
//         ) {

//           const statusCode =
//             new Boom(
//               lastDisconnect?.error
//             )?.output?.statusCode;


//           const shouldReconnect =
//             statusCode !==
//             DisconnectReason.loggedOut;


//           console.log(
//             `[connection] closed — statusCode: ${statusCode}, shouldReconnect: ${shouldReconnect}`
//           );


//           if (
//             shouldReconnect
//           ) {

//             console.log(
//               "[connection] Reconnecting in 3 seconds..."
//             );

//             setConnectionState({
//               status: "reconnecting",
//               lastError: lastDisconnect?.error?.message ?? null,
//             });


//             setTimeout(
//               () => {

//                 start().catch(
//                   (error) => {

//                     console.error(
//                       "[reconnect] Failed:",
//                       error
//                     );
//                   }
//                 );

//               },

//               3000
//             );

//           } else {

//             console.log(
//               "[connection] logged out."
//             );

//             console.log(
//               "Delete auth_info and restart to re-link."
//             );

//             setConnectionState({
//               status: "disconnected",
//               lastError: "logged_out",
//             });
//           }
//         }
//       }
//     );


//     // =================================================
//     // CREDENTIALS
//     // =================================================

//     sock.ev.on(
//       "creds.update",
//       saveCreds
//     );


//     // =================================================
//     // MESSAGE EVENTS
//     // =================================================

//     sock.ev.on(
//       "messages.upsert",

//       async ({
//         messages,
//         type,
//       }) => {

//         console.log(
//           `[event] messages.upsert — type: ${type}, count: ${messages.length}`
//         );


//         /*
//           WhatsApp can send:

//           append
//           notify
//           prepend
//           etc.

//           For normal real-time incoming messages,
//           notify is the important event.

//           We deliberately ignore append/prepend
//           because those are usually history/sync.
//         */

//         if (
//           type !== "notify"
//         ) {

//           console.log(
//             `[event] Ignoring ${type} event`
//           );

//           return;
//         }


//         for (
//           const msg
//           of messages
//         ) {

//           if (
//             !msg.message
//           ) {

//             console.log(
//               "[skip] No message content"
//             );

//             continue;
//           }


//           const chatId =
//             msg.key.remoteJid;


//           if (!chatId) {

//             console.log(
//               "[skip] No chat ID"
//             );

//             continue;
//           }


//           // -------------------------------------------
//           // OUTGOING
//           // -------------------------------------------

//           if (
//             msg.key.fromMe
//           ) {

//             const text =
//               extractMessageText(
//                 msg.message
//               );


//             if (text) {

//               try {

//                 await recordOutgoingMessage({

//                   chatId,

//                   text,

//                   messageId:
//                     msg.key.id ??
//                     null,

//                   timestamp:
//                     new Date(),
//                 });


//                 console.log(
//                   `📤 Outgoing message recorded: ${text}`
//                 );

//               } catch (error) {

//                 console.error(
//                   "[Behavior] Failed to record outgoing message:",
//                   error
//                 );
//               }
//             }


//             continue;
//           }


//           // -------------------------------------------
//           // INCOMING
//           // -------------------------------------------

//           await processIncomingMessage(
//             sock,
//             msg
//           );
//         }
//       }
//     );


//   } catch (error) {

//     reconnecting =
//       false;


//     console.error(
//       "[WhatsApp] Start error:",
//       error
//     );


//     setTimeout(
//       () => {

//         start().catch(
//           console.error
//         );

//       },

//       5000
//     );
//   }
// }


// // ==================================================
// // START APPLICATION
// // ==================================================

// console.log(
//   "\n=========================================="
// );

// console.log(
//   "🚀 WAAA BACKEND STARTING"
// );

// console.log(
//   "==========================================\n"
// );


// start().catch(
//   (error) => {

//     console.error(
//       "[fatal] failed to start:",
//       error
//     );
//   }
// );

import "dotenv/config";

import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

import {
  scheduleBackup,
  cancelScheduledBackup,
  watchForCorruption,
  restoreAuthInfoFromBackup,
  isRecoveryInProgress,
  setRecoveryInProgress,
  backupAuthInfo,
} from "./session/sessionGuard.js";

import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";

import { db } from "./firebase.js";

import { analyzeRules } from "./fraud/fraudRules.js";
import { analyzeImportanceRules } from "./importance/importanceRules.js";

import {
  predictFraud,
  predictImportance,
} from "./ml.js";

import {
  recordOutgoingMessage,
  detectBehaviorPatterns,
} from "./behavior/behaviorEngine.js";

import { getChatSettings } from "./chat/chatSettings.js";

import { analyzeSingleChat } from "./nlp/chatAnalyzer.js";

import {
  setConnectionState,
  setQR,
  setConnected,
} from "./state/connectionState.js";

import { hub } from "./api/sseHub.js";

import { getChatMemory, updateWordFreq } from "./ai/chatMemory.js";


import {
  scoreWithLocalContext,
  needsGeminiForImportance,
  shouldQueueForBatch,
} from "./ai/localContextScoring.js";

import {
  queueForMemoryReview,
  startMemoryRefreshTimer,
} from "./ai/memoryRefresh.js";

import { analyzeWithContext } from "./ai/contextIntelligence.js";
import { isInCooldown, isQuotaError, triggerCooldown, recordPerChatCall } from "./ai/geminiCooldown.js";

// ==================================================
// LOGGER & RECOVERY STATE
// ==================================================

let currentSock = null;
let reconnectTimer = null;

function cancelScheduledReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(delayMs = 3000) {
  cancelScheduledReconnect();
  if (isRecoveryInProgress()) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    start().catch((error) => {
      console.error("[reconnect] Failed:", error?.message || error);
    });
  }, delayMs);
}

function safeShutdownSocket(sock, reason = "Socket closed") {
  if (!sock) return;
  try {
    if (typeof sock._cleanup === "function") {
      sock._cleanup();
    }
    sock.ev?.removeAllListeners();
    sock.end(new Error(reason));
    sock.ws?.close();
  } catch (err) {
    console.error("[Socket] Teardown error:", err.message);
  }
}

async function performSessionRecovery(reason = "Bad MAC corruption detected") {
  if (isRecoveryInProgress()) {
    console.log("[Session Guard] Recovery already in progress — skipping duplicate trigger.");
    return;
  }

  setRecoveryInProgress(true);
  cancelScheduledReconnect();
  cancelScheduledBackup();

  console.log(`[Session Guard] Starting session recovery — Reason: ${reason}`);

  try {
    // 1. Completely shut down & detach old socket BEFORE touching auth files
    if (currentSock) {
      console.log("[Session Guard] Shutting down active socket and detaching listeners...");
      safeShutdownSocket(currentSock, "Session recovery in progress");
      currentSock = null;
    }

    // Give pending I/O 200ms to settle cleanly
    await new Promise((r) => setTimeout(r, 200));

    // 2. Safely restore auth_info from backup
    const restored = restoreAuthInfoFromBackup();
    if (!restored) {
      console.log("[Session Guard] No valid backup available — wiped for fresh QR scan.");
    }

    // 3. Start exactly ONE new socket
    console.log("[Session Guard] Starting new connection with restored credentials...");
    await start();
  } catch (err) {
    console.error("[Session Guard] Recovery start failed:", err?.message || err);
    scheduleReconnect(5000);
  }
}

watchForCorruption(() => {
  performSessionRecovery("Multiple Bad MAC errors detected");
});

const logger = pino({
  level: "silent",
});


// ==================================================
// GLOBAL STATE
// ==================================================

let reconnecting = false;
let behaviorTimerStarted = false;


// ==================================================
// SAFE NUMBER
// ==================================================

function safeNumber(value, fallback = 0) {

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}


// ==================================================
// NORMALIZE ML RESULT
// ==================================================

function normalizeMLResult(result) {

  if (!result || typeof result !== "object") {

    return {
      prediction: 0,
      probability: 0,
    };
  }

  const prediction =
    result.prediction ??
    result.label ??
    result.class ??
    0;

  const probability =
    result.probability ??
    result.confidence ??
    result.score ??
    0;

  return {

    prediction:
      prediction ?? 0,

    probability:
      safeNumber(
        probability,
        0
      ),
  };
}


// ==================================================
// CHAT TYPE
// ==================================================

function getChatType(chatId) {

  if (!chatId) {
    return "unknown";
  }


  // Personal chat

  if (
    chatId.endsWith("@s.whatsapp.net") ||
    chatId.endsWith("@lid")
  ) {

    return "personal";
  }


  // Group

  if (
    chatId.endsWith("@g.us")
  ) {

    return "group";
  }


  // Channel

  if (
    chatId.endsWith("@newsletter")
  ) {

    return "channel";
  }


  return "unknown";
}


// ==================================================
// GROUP CACHE
// ==================================================

const groupCache = new Map();
const channelCache = new Map();
const contactsCache = new Map();

// ==================================================
// GET CHAT INFORMATION
// ==================================================

async function getChatInfo(
  sock,
  chatId,
  pushName

) {

  const basicType =
    getChatType(chatId);


  // -----------------------------------------------
  // PERSONAL
  // -----------------------------------------------

  if (
    basicType === "personal"
  ) {

    return {

      chatType: "personal",

      chatName:
        contactsCache.get(chatId) ||
        pushName ||
        chatId.split("@")[0],

      isCommunity: false,

      participantCount: null,

      linkedParent: null,
    };
  }


  // -----------------------------------------------
  // CHANNEL
  // -----------------------------------------------

  if (
    basicType === "channel"
  ) {

    if (
      channelCache.has(chatId)
    ) {

      return channelCache.get(chatId);
    }

    try {

      const metadata =
        await sock.newsletterMetadata(
          "jid",
          chatId
        );

      const info = {

        chatType: "channel",

        chatName:
          metadata?.name ||
          metadata?.subject ||
          chatId,

        isCommunity: false,

        participantCount:
          metadata?.subscribers ??
          null,

        linkedParent: null,
      };

      channelCache.set(
        chatId,
        info
      );

      return info;

    } catch (error) {

      console.log(
        `[chat] Could not fetch channel metadata for ${chatId}:`,
        error.message
      );

      return {

        chatType: "channel",

        chatName: chatId,

        isCommunity: false,

        participantCount: null,

        linkedParent: null,
      };
    }
  }


  // -----------------------------------------------
  // UNKNOWN
  // -----------------------------------------------

  if (
    basicType !== "group"
  ) {

    return {

      chatType: "unknown",

      chatName: chatId,

      isCommunity: false,

      participantCount: null,

      linkedParent: null,
    };
  }


  // -----------------------------------------------
  // CACHE
  // -----------------------------------------------

  if (
    groupCache.has(chatId)
  ) {

    return groupCache.get(chatId);
  }


  // -----------------------------------------------
  // GROUP METADATA
  // -----------------------------------------------

  try {

    const metadata =
      await sock.groupMetadata(
        chatId
      );


    let chatType =
      "group";


    if (
      metadata.isCommunity ||
      metadata.isCommunityAnnounce
    ) {

      chatType =
        "community";
    }


    const info = {

      chatType,

      chatName:
        metadata.subject ||
        chatId,

      isCommunity:
        Boolean(
          metadata.isCommunity ||
          metadata.isCommunityAnnounce
        ),

      participantCount:
        metadata.participants?.length ||
        0,

      linkedParent:
        metadata.linkedParent ||
        null,
    };


    groupCache.set(
      chatId,
      info
    );


    return info;

  } catch (error) {

    console.log(
      `[chat] Could not fetch metadata for ${chatId}:`,
      error.message
    );


    return {

      chatType: "group",

      chatName: chatId,

      isCommunity: false,

      participantCount: null,

      linkedParent: null,
    };
  }
}


// ==================================================
// EXTRACT MESSAGE TEXT
// ==================================================

function extractMessageText(
  message
) {

  if (!message) {
    return null;
  }


  return (

    message.conversation ||

    message.extendedTextMessage?.text ||

    message.imageMessage?.caption ||

    message.videoMessage?.caption ||

    message.documentMessage?.caption ||

    message.buttonsResponseMessage
      ?.selectedDisplayText ||

    message.listResponseMessage
      ?.title ||

    message.templateButtonReplyMessage
      ?.selectedDisplayText ||

    null
  );
}


// ==================================================
// SAVE MESSAGE
// ==================================================

async function saveMessage(
  entry
) {

  try {

    const cleanEntry =
      JSON.parse(
        JSON.stringify(
          entry,
          (_, value) =>
            value === undefined
              ? null
              : value
        )
      );


    const docRef =
      await db
        .collection("messages")
        .add({

          ...cleanEntry,

          createdAt:
            new Date(),
        });


    console.log(
      `[Storage] Message saved: ${docRef.id}`
    );

    // Invalidate overlapping range caches
    if (cleanEntry?.chatId) {
      import("./intelligence/rangeCache.js")
        .then(({ invalidateRangeCache }) =>
          invalidateRangeCache({
            chatId: cleanEntry.chatId,
            timestamp: cleanEntry.receivedAt || new Date(),
          })
        )
        .catch(() => {});
    }

    return docRef.id;

  } catch (error) {

    console.error(
      "[Storage] Failed to save message:",
      error
    );


    return null;
  }
}


// ==================================================
// SAVE CONVERSATION
// ==================================================

async function saveConversation(
  chatId,
  chatInfo,
  messageData
) {

  try {

    await db
      .collection("conversations")
      .doc(chatId)
      .set(

        {

          chatId,

          chatType:
            chatInfo.chatType,

          chatName:
            chatInfo.chatName,

          isCommunity:
            Boolean(
              chatInfo.isCommunity
            ),

          participantCount:
            chatInfo.participantCount ??
            null,

          linkedParent:
            chatInfo.linkedParent ??
            null,

          lastMessage:
            messageData.text ??
            "",

          lastMessageAt:
            new Date(),

          updatedAt:
            new Date(),
        },

        {
          merge: true,
        }
      );


    console.log(
      `[Storage] Conversation updated: ${chatInfo.chatName} (${chatInfo.chatType})`
    );

  } catch (error) {

    console.error(
      "[Storage] Failed to save conversation:",
      error
    );
  }
}


// ==================================================
// FRAUD ANALYSIS
// ==================================================

async function analyzeFraud(
  text
) {

  let ruleResult = {

    score: 0,

    reasons: [],
  };


  try {

    const result =
      analyzeRules(
        text
      );


    if (result) {

      ruleResult = {

        score:
          safeNumber(
            result.score
          ),

        reasons:
          Array.isArray(
            result.reasons
          )
            ? result.reasons
            : [],
      };
    }

  } catch (error) {

    console.error(
      "[Fraud Rules] Error:",
      error.message
    );
  }


  let mlResult = {

    prediction: 0,

    probability: 0,
  };


  try {

    const result =
      await predictFraud(
        text
      );


    mlResult =
      normalizeMLResult(
        result
      );

  } catch (error) {

    console.error(
      "[Fraud ML] Error:",
      error.message
    );
  }


  let mlScore =
    mlResult.probability;


  if (
    mlScore <= 1
  ) {

    mlScore *= 100;
  }


  mlScore =
    Math.round(
      Math.min(
        Math.max(
          mlScore,
          0
        ),
        100
      )
    );


  const ruleScore =
    Math.min(
      ruleResult.score,
      100
    );


  const weightedScore =
    ruleScore * 0.7 +

    mlScore * 0.3;

  const finalScore =
    Math.round(
      Math.max(
        weightedScore,
        ruleScore * 0.6
      )
    );


  let riskLevel =
    "low";


  if (
    finalScore >= 80
  ) {

    riskLevel =
      "critical";

  } else if (
    finalScore >= 60
  ) {

    riskLevel =
      "high";

  } else if (
    finalScore >= 30
  ) {

    riskLevel =
      "medium";
  }


  return {

    ruleScore,

    mlScore,

    finalScore,

    riskLevel,

    reasons:
      ruleResult.reasons,

    mlPrediction:
      mlResult.prediction ?? 0,

    mlProbability:
      safeNumber(
        mlResult.probability
      ),
  };
}


// ==================================================
// IMPORTANCE ANALYSIS
// ==================================================

async function analyzeImportance(
  text
) {

  let ruleResult = {

    score: 0,

    reasons: [],
  };


  try {

    const result =
      analyzeImportanceRules(
        text
      );


    if (result) {

      ruleResult = {

        score:
          safeNumber(
            result.score
          ),

        reasons:
          Array.isArray(
            result.reasons
          )
            ? result.reasons
            : [],
      };
    }

  } catch (error) {

    console.error(
      "[Importance Rules] Error:",
      error.message
    );
  }


  let mlResult = {

    prediction: 0,

    probability: 0,
  };


  try {

    const result =
      await predictImportance(
        text
      );


    mlResult =
      normalizeMLResult(
        result
      );

  } catch (error) {

    console.error(
      "[Importance ML] Error:",
      error.message
    );
  }


  let mlScore =
    mlResult.probability;


  if (
    mlScore <= 1
  ) {

    mlScore *= 100;
  }


  mlScore =
    Math.round(
      Math.min(
        Math.max(
          mlScore,
          0
        ),
        100
      )
    );


  const ruleScore =
    Math.min(
      ruleResult.score,
      100
    );


  const finalScore =
    ruleScore >= 30
      ? (mlScore > 0 ? Math.max(ruleScore, Math.round(ruleScore * 0.5 + mlScore * 0.5)) : ruleScore)
      : (mlScore > 0 ? Math.round(ruleScore * 0.4 + mlScore * 0.6) : ruleScore);

  let level = "normal";

  if (finalScore >= 75) {
    level = "critical";
  } else if (finalScore >= 50) {
    level = "high";
  } else if (finalScore >= 30) {
    level = "medium";
  }


  return {

    ruleScore,

    mlScore,

    finalScore,

    level,

    reasons:
      ruleResult.reasons,

    mlPrediction:
      mlResult.prediction ?? 0,

    mlProbability:
      safeNumber(
        mlResult.probability
      ),
  };
}


// ==================================================
// BEHAVIOR TIMER
// ==================================================

function startBehaviorTimer() {

  if (
    behaviorTimerStarted
  ) {

    return;
  }


  behaviorTimerStarted =
    true;


  setInterval(

    async () => {

      console.log(
        "\n🔄 Running behavioral pattern analysis..."
      );


      try {

        const patterns =
          await detectBehaviorPatterns();


        const suggestions =
          patterns.filter(
            (pattern) =>
              pattern.suggested === true
          );


        if (
          suggestions.length > 0
        ) {

          console.log(
            `🔄 ${suggestions.length} behavioral pattern suggestion(s) found.`
          );


          for (
            const pattern
            of suggestions
          ) {

            console.log(
              "\n📌 BEHAVIOR PATTERN"
            );

            console.log(
              `Template: ${pattern.template}`
            );

            console.log(
              `Time: Around ${pattern.hour}:00`
            );

            console.log(
              `Recipients: ${pattern.recipientCount}`
            );

            console.log(
              `Frequency: ${pattern.frequency}`
            );

            console.log(
              `Confidence: ${pattern.confidence}%`
            );

            console.log(
              "Status: SUGGESTED — waiting for user approval"
            );
          }

        } else {

          console.log(
            "[Behavior] No strong repeated patterns detected."
          );
        }

      } catch (error) {

        console.error(
          "[Behavior] Analysis error:",
          error
        );
      }

    },

    5 * 60 * 1000
  );
}


// ==================================================
// NLP TEST
// ==================================================

function startNLPTest() {

  setTimeout(
    async () => {

      try {

        const testChatId =
          "120363406373101038@g.us";


        console.log(
          `\n[NLP] Analyzing chat: ${testChatId}`
        );


        const result =
          await analyzeSingleChat(
            testChatId
          );


        console.log(
          "\n🧠 NLP RESULT"
        );


        console.log(
          JSON.stringify(
            result,
            null,
            2
          )
        );

      } catch (error) {

        console.error(
          "[NLP] Error:",
          error
        );
      }

    },

    5000
  );
}


// ==================================================
// PROCESS INCOMING MESSAGE
// ==================================================

async function processIncomingMessage(
  sock,
  msg
) {

  try {

    if (
      !msg.message
    ) {

      console.log(
        "[skip] Message has no message content"
      );

      return;
    }


    const chatId =
      msg.key.remoteJid;


    if (!chatId) {

      console.log(
        "[skip] No remoteJid"
      );

      return;
    }


    // =================================================
    // CHAT INFORMATION
    // =================================================


    const chatInfo =
      await getChatInfo(
        sock,
        chatId,
        msg.pushName
      );


    // =================================================
    // CHAT PRIORITY
    // =================================================

    let chatSettings = {

      priority: false,

      priorityLevel: "normal",
    };


    try {

      chatSettings =
        await getChatSettings(
          chatId
        );

    } catch (error) {

      console.error(
        "[Chat Settings] Error:",
        error.message
      );
    }


    const isPriorityChat =
      chatSettings?.priority === true;


    // =================================================
    // SENDER
    // =================================================

    const sender =
      msg.pushName ||

      msg.key.participant ||

      chatId;


    // =================================================
    // TEXT
    // =================================================

    const text =
      extractMessageText(
        msg.message
      );


    if (!text) {

      console.log(
        `[skip] Unsupported message type from ${sender}`
      );

      return;
    }


    // =================================================
    // DISPLAY
    // =================================================

    console.log(
      "\n--------------------------------"
    );

    console.log(
      "📩 New message"
    );

    console.log(
      `Chat: ${chatInfo.chatName}`
    );

    console.log(
      `Type: ${chatInfo.chatType}`
    );

    console.log(
      `Chat ID: ${chatId}`
    );

    console.log(
      `Sender: ${sender}`
    );

    console.log(
      `Message: ${text}`
    );

    console.log(
      "--------------------------------"
    );


    // =================================================
    // FRAUD
    // =================================================

    const fraudAnalysis =
      await analyzeFraud(
        text
      );


    // =================================================
    // IMPORTANCE
    // =================================================

    const importanceAnalysis =
      await analyzeImportance(
        text
      );


    // =================================================
    // LOCAL CONTEXT SCORING (memory-aware, ALWAYS runs, never
    // calls Gemini directly). Uncertain messages get queued
    // for periodic BATCHED memory review instead of an
    // immediate API call.
    // =================================================

    try {

      const memory =
        await getChatMemory(
          chatId
        );

      const localResult =
        scoreWithLocalContext(
          importanceAnalysis,
          text,
          memory
        );

      importanceAnalysis.finalScore =
        localResult.score;

      importanceAnalysis.level =
        localResult.level;

      importanceAnalysis.reasons =
        localResult.reasons;

      importanceAnalysis.confidence =
        localResult.confidence;

      // ── HYBRID TIER 2: Medium confidence — conditional real-time Gemini ────
      // needsGeminiForImportance now accepts chatId for the per-chat rate gate.
      // It returns true only for medium confidence (0.4–0.85) messages that
      // have a "worth-knowing" signal AND haven't been rate-limited recently.
      if (
        needsGeminiForImportance(
          localResult,
          text,
          memory,
          chatId        // ← new: enables per-chat 5-min rate gate
        )
      ) {

        if (
          isInCooldown()
        ) {

          // Global cooldown active — queue for later batch review
          queueForMemoryReview(
            chatId,
            sender,
            text
          );

        } else {

          // Call Gemini directly for real-time importance scoring
          try {

            const {
              gemini: geminiResult,
              memory: updatedMemory,
            } = await analyzeWithContext(
              chatId,
              text,
              memory
            );

            // Record this call for the per-chat rate gate
            recordPerChatCall(chatId);

            // Merge Gemini's verdict into importanceAnalysis
            importanceAnalysis.finalScore =
              geminiResult.importanceScore ?? localResult.score;

            importanceAnalysis.level =
              geminiResult.importanceLevel ?? localResult.level;

            if (
              geminiResult.reason &&
              !importanceAnalysis.reasons.includes(geminiResult.reason)
            ) {
              importanceAnalysis.reasons.push(
                `gemini: ${geminiResult.reason}`
              );
            }

            importanceAnalysis.confidence =
              geminiResult.confidence ?? localResult.confidence;

            importanceAnalysis.gemini =
              geminiResult;

            console.log(
              "[Context Intelligence] Gemini scored this message:",
              geminiResult.importanceLevel,
              `(${geminiResult.importanceScore}/100) —`,
              geminiResult.reason
            );

          } catch (geminiError) {

            console.error(
              "[Context Intelligence] Gemini call failed, falling back to local score:",
              geminiError.message
            );

            if (
              isQuotaError(
                geminiError
              )
            ) {
              triggerCooldown(
                `context intelligence: ${geminiError.message}`
              );
            }

            // Queue so the batch picks it up when quota recovers
            queueForMemoryReview(
              chatId,
              sender,
              text
            );
          }
        }

      } else if (
        // ── HYBRID TIER 3: Low confidence — queue for batch, never real-time ─
        shouldQueueForBatch(localResult, text)
      ) {

        queueForMemoryReview(chatId, sender, text);

      }


    } catch (error) {

      console.error(
        "[Context Scoring] Error (importance stays as locally computed):",
        error.message
      );
    }


    // Update word-frequency map for this chat (fire-and-forget — never blocks)
    updateWordFreq(chatId, text).catch((err) =>
      console.error("[WordFreq] Update failed:", err.message)
    );


    // =================================================
    // PRIORITY CHAT (informational only)
    //
    // Manually marking a chat as priority does NOT force
    // message importance anymore — that conflated two
    // different things (a manual "keep an eye on this chat"
    // signal vs. actual message-content importance). Priority
    // only drives the Priority Chats page; importance stays
    // entirely determined by local rules + Gemini above.
    // =================================================

    if (
      isPriorityChat
    ) {

      importanceAnalysis.reasons.push(
        `Chat priority: ${chatSettings?.priorityLevel || "normal"}`
      );
    }


    // =================================================
    // FRAUD OUTPUT
    // =================================================

    console.log(
      "\n🛡️ FRAUD ANALYSIS"
    );

    console.log(
      `Rule Score: ${fraudAnalysis.ruleScore}/100`
    );

    console.log(
      `ML Score: ${fraudAnalysis.mlScore}/100`
    );

    console.log(
      `Final Score: ${fraudAnalysis.finalScore}/100`
    );

    console.log(
      `Risk: ${fraudAnalysis.riskLevel}`
    );

    console.log(
      `ML Prediction: ${fraudAnalysis.mlPrediction}`
    );

    console.log(
      `ML Probability: ${fraudAnalysis.mlProbability}`
    );


    if (
      fraudAnalysis.reasons.length > 0
    ) {

      console.log(
        "Reasons:"
      );


      fraudAnalysis.reasons.forEach(
        (reason) => {

          console.log(
            `  ⚠ ${reason}`
          );
        }
      );

    } else {

      console.log(
        "No rule-based suspicious indicators detected."
      );
    }


    // =================================================
    // IMPORTANCE OUTPUT
    // =================================================

    console.log(
      "\n🔥 IMPORTANCE ANALYSIS"
    );

    console.log(
      `Rule Score: ${importanceAnalysis.ruleScore}/100`
    );

    console.log(
      `ML Score: ${importanceAnalysis.mlScore}/100`
    );

    console.log(
      `Final Score: ${importanceAnalysis.finalScore}/100`
    );

    console.log(
      `Level: ${importanceAnalysis.level}`
    );

    console.log(
      `ML Prediction: ${importanceAnalysis.mlPrediction}`
    );

    console.log(
      `ML Probability: ${importanceAnalysis.mlProbability}`
    );


    if (
      importanceAnalysis.reasons.length > 0
    ) {

      console.log(
        "Reasons:"
      );


      importanceAnalysis.reasons.forEach(
        (reason) => {

          console.log(
            `  📌 ${reason}`
          );
        }
      );

    } else {

      console.log(
        "No rule-based important indicators detected."
      );
    }


    // =================================================
    // MESSAGE DATA
    // =================================================

    const messageData = {

      // Chat

      chatId,

      chatType:
        chatInfo.chatType,

      chatName:
        chatInfo.chatName,

      isCommunity:
        Boolean(
          chatInfo.isCommunity
        ),

      participantCount:
        chatInfo.participantCount ??
        null,

      linkedParent:
        chatInfo.linkedParent ??
        null,


      // Sender

      sender,

      senderJid:
        msg.key.participant ||
        chatId,


      // Message

      text,

      messageId:
        msg.key.id ??
        null,

      receivedAt:
        new Date().toISOString(),


      // Fraud

      fraudAnalysis: {

        ruleScore:
          fraudAnalysis.ruleScore,

        mlScore:
          fraudAnalysis.mlScore,

        finalScore:
          fraudAnalysis.finalScore,

        riskLevel:
          fraudAnalysis.riskLevel,

        reasons:
          fraudAnalysis.reasons,

        mlPrediction:
          fraudAnalysis.mlPrediction ??
          0,

        mlProbability:
          safeNumber(
            fraudAnalysis.mlProbability
          ),
      },


      // Importance

      importanceAnalysis: {

        ruleScore:
          importanceAnalysis.ruleScore,

        mlScore:
          importanceAnalysis.mlScore,

        finalScore:
          importanceAnalysis.finalScore,

        level:
          importanceAnalysis.level,

        reasons:
          importanceAnalysis.reasons,

        confidence:
          importanceAnalysis.confidence ??
          null,

        mlPrediction:
          importanceAnalysis.mlPrediction ??
          0,

        mlProbability:
          safeNumber(
            importanceAnalysis.mlProbability
          ),
      },


      // Chat priority

      chatPriority:
        isPriorityChat,
    };


    // =================================================
    // FIREBASE
    // =================================================

    await saveMessage(
      messageData
    );


    await saveConversation(
      chatId,
      chatInfo,
      messageData
    );


    hub.publish("message", messageData);


    console.log(
      "\n================================\n"
    );

  } catch (error) {

    console.error(
      "[Message Processing] Error:",
      error
    );
  }
}


// ==================================================
// START WHATSAPP
// ==================================================

async function start() {
  if (reconnecting) {
    console.log("[WhatsApp] Reconnection / startup already in progress — skipping duplicate start.");
    return;
  }

  cancelScheduledReconnect();
  reconnecting = true;
  setConnectionState({ status: "connecting" });

  try {
    // Ensure any previously existing socket is completely torn down first
    if (currentSock) {
      safeShutdownSocket(currentSock, "Replacing with fresh socket");
      currentSock = null;
    }

    const {
      state,
      saveCreds,
    } =
      await useMultiFileAuthState(
        "auth_info"
      );

    const {
      version,
    } =
      await fetchLatestBaileysVersion();

    console.log(
      `[WhatsApp] Using Baileys version: ${version.join(".")}`
    );

    const sock =
      makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
      });

    // Guard creds writes: if this socket is superseded or recovering, ignore creds.update
    let isSocketActive = true;
    sock._cleanup = () => {
      isSocketActive = false;
    };

    const guardedSaveCreds = async (...args) => {
      if (!isSocketActive || isRecoveryInProgress()) {
        return; // Prevent old auth writes or writes during recovery
      }
      return saveCreds(...args);
    };

    currentSock = sock;


    function absorbContacts(contacts) {

      for (
        const contact of
        contacts || []
      ) {

        const jid =
          contact.id;

        const name =
          contact.name ||
          contact.verifiedName ||
          contact.notify;

        if (
          jid &&
          name
        ) {

          contactsCache.set(
            jid,
            name
          );
        }
      }
    }

    sock.ev.on(
      "contacts.upsert",
      absorbContacts
    );

    sock.ev.on(
      "contacts.update",
      absorbContacts
    );

    sock.ev.on(
      "connection.update",

      async (update) => {

        const {

          connection,

          lastDisconnect,

          qr,

        } = update;


        if (qr) {

          console.log(
            "\nScan this QR code with WhatsApp:"
          );

          console.log(
            "WhatsApp → Settings → Linked Devices → Link a Device\n"
          );


          qrcode.generate(
            qr,
            {
              small: true,
            }
          );

          setQR(qr);
        }


        if (
          connection === "open"
        ) {
          reconnecting = false;
          setRecoveryInProgress(false);

          console.log(
            "[connection] connected to WhatsApp ✅"
          );


          console.log(
            "[connection] Message listener is active ✅"
          );

          setConnected();

          scheduleBackup();

          startBehaviorTimer();
          startMemoryRefreshTimer();

          startNLPTest();
        }


        if (
          connection === "close"
        ) {
          reconnecting = false;
          cancelScheduledBackup();

          // If session recovery is currently in progress, do NOT trigger normal reconnect
          if (isRecoveryInProgress()) {
            console.log(
              "[connection] closed during session recovery — socket restart handled by recovery pipeline."
            );
            return;
          }

          const statusCode =
            new Boom(
              lastDisconnect?.error
            )?.output?.statusCode;


          const shouldReconnect =
            statusCode !==
            DisconnectReason.loggedOut;


          console.log(
            `[connection] closed — statusCode: ${statusCode}, shouldReconnect: ${shouldReconnect}`
          );


          if (
            shouldReconnect
          ) {
            console.log(
              "[connection] Reconnecting in 3 seconds..."
            );

            setConnectionState({
              status: "reconnecting",
              lastError: lastDisconnect?.error?.message ?? null,
            });

            scheduleReconnect(3000);

          } else {

            console.log(
              "[connection] logged out."
            );

            console.log(
              "Delete auth_info and restart to re-link."
            );

            setConnectionState({
              status: "disconnected",
              lastError: "logged_out",
            });
          }
        }
      }
    );


    sock.ev.on(
      "creds.update",
      guardedSaveCreds
    );


    sock.ev.on(
      "messages.upsert",

      async ({
        messages,
        type,
      }) => {

        console.log(
          `[event] messages.upsert — type: ${type}, count: ${messages.length}`
        );


        if (
          type !== "notify"
        ) {

          console.log(
            `[event] Ignoring ${type} event`
          );

          return;
        }


        for (
          const msg
          of messages
        ) {

          if (
            !msg.message
          ) {

            console.log(
              "[skip] No message content"
            );

            continue;
          }


          const chatId =
            msg.key.remoteJid;


          if (!chatId) {

            console.log(
              "[skip] No chat ID"
            );

            continue;
          }


          if (
            msg.key.fromMe
          ) {

            const text =
              extractMessageText(
                msg.message
              );


            if (text) {

              try {

                await recordOutgoingMessage({

                  chatId,

                  text,

                  messageId:
                    msg.key.id ??
                    null,

                  timestamp:
                    new Date(),
                });


                console.log(
                  `📤 Outgoing message recorded: ${text}`
                );

              } catch (error) {

                console.error(
                  "[Behavior] Failed to record outgoing message:",
                  error
                );
              }
            }


            continue;
          }


          await processIncomingMessage(
            sock,
            msg
          );
        }
      }
    );


  } catch (error) {
    reconnecting = false;
    setRecoveryInProgress(false);

    console.error(
      "[WhatsApp] Start error:",
      error?.message || error
    );

    scheduleReconnect(5000);
  }
}


// ==================================================
// START APPLICATION
// ==================================================

console.log(
  "\n=========================================="
);

console.log(
  "🚀 WAAA BACKEND STARTING"
);

console.log(
  "==========================================\n"
);


export { start };

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/index.js")) {
  start().catch((error) => {
    console.error("[fatal] failed to start:", error);
  });
}