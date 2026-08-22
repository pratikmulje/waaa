import { db } from "../firebase.js";


/*
==================================================
WAAA BEHAVIOR ENGINE
==================================================

Purpose:
- Observe repeated outgoing messages
- Detect repeated recipients
- Detect approximate sending time
- Create pattern suggestions
- DO NOT automatically send messages
==================================================
*/


// ==================================================
// Normalize message
// ==================================================

function normalizeMessage(text) {
  if (!text) return "";

  return text
    .toLowerCase()
    .replace(/\b\d{1,2}[:.]\d{2}\s*(am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "")
    .replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, "")
    .replace(/\b(today|tomorrow|yesterday)\b/gi, "")
    .replace(/[0-9]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


// ==================================================
// Extract approximate time bucket
// ==================================================

function getTimeBucket(date) {
  const hour = date.getHours();

  return hour;
}


// ==================================================
// Get weekday
// ==================================================

function getWeekday(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
  });
}


// ==================================================
// Save outgoing behavior
// ==================================================

export async function recordOutgoingMessage({
  chatId,
  chatName,
  text,
  messageId,
  timestamp = new Date(),
}) {

  try {

    if (!chatId || !text) {
      return;
    }

    const normalizedText =
      normalizeMessage(text);

    if (!normalizedText) {
      return;
    }

    await db
      .collection("behaviorMessages")
      .add({

        chatId,

        chatName:
          chatName || chatId,

        text,

        normalizedText,

        messageId:
          messageId || null,

        hour:
          getTimeBucket(timestamp),

        weekday:
          getWeekday(timestamp),

        timestamp,

        createdAt:
          new Date(),
      });


    console.log(
      `[Behavior] Outgoing message recorded: ${chatName || chatId}`
    );

  } catch (error) {

    console.error(
      "[Behavior] Failed to record outgoing message:",
      error
    );
  }
}


// ==================================================
// Find repeated behavior
// ==================================================

export async function detectBehaviorPatterns() {

  try {

    /*
    Get recent outgoing messages.

    We don't need the entire WhatsApp history
    every time. Start with recent messages.
    */

    const snapshot =
      await db
        .collection("behaviorMessages")
        .orderBy("timestamp", "desc")
        .limit(200)
        .get();


    const messages =
      snapshot.docs.map(
        (doc) => ({
          id: doc.id,
          ...doc.data(),
        })
      );


    if (messages.length < 5) {

      console.log(
        "[Behavior] Not enough messages to detect patterns."
      );

      return [];
    }


    // ================================================
    // Group by normalized message
    // ================================================

    const groups = new Map();


    for (const message of messages) {

      const key =
        `${message.normalizedText}|${message.hour}`;


      if (!groups.has(key)) {

        groups.set(
          key,
          []
        );
      }


      groups
        .get(key)
        .push(message);
    }


    const patterns = [];


    // ================================================
    // Analyze groups
    // ================================================

    for (
      const [
        key,
        group,
      ] of groups
    ) {

      if (group.length < 3) {
        continue;
      }


      const [
        normalizedText,
        hour,
      ] =
        key.split("|");


      // ----------------------------------------------
      // Unique recipients
      // ----------------------------------------------

      const recipients =
        [
          ...new Set(
            group.map(
              (message) =>
                message.chatId
            )
          ),
        ];


      // ----------------------------------------------
      // Weekdays
      // ----------------------------------------------

      const weekdays =
        [
          ...new Set(
            group.map(
              (message) =>
                message.weekday
            )
          ),
        ];


      // ----------------------------------------------
      // Calculate frequency
      // ----------------------------------------------

      const frequency =
        group.length;


      // ----------------------------------------------
      // Pattern confidence
      // ----------------------------------------------

      let confidence =
        0;


      if (frequency >= 3) {
        confidence += 30;
      }

      if (frequency >= 5) {
        confidence += 20;
      }

      if (recipients.length >= 2) {
        confidence += 20;
      }

      if (recipients.length >= 5) {
        confidence += 15;
      }

      if (weekdays.length >= 3) {
        confidence += 15;
      }


      confidence =
        Math.min(
          confidence,
          100
        );


      // ----------------------------------------------
      // Example original message
      // ----------------------------------------------

      const exampleMessage =
        group[0]?.text ||
        normalizedText;


      // ----------------------------------------------
      // Pattern
      // ----------------------------------------------

      patterns.push({

        type:
          "repeated_message",

        template:
          normalizedText,

        exampleMessage,

        hour:
          Number(hour),

        recipients,

        recipientCount:
          recipients.length,

        frequency,

        weekdays,

        confidence,

        suggested:
          confidence >= 60,

        createdAt:
          new Date(),
      });
    }


    // ================================================
    // Save detected patterns
    // ================================================

    for (
      const pattern of patterns
    ) {

      if (
        !pattern.suggested
      ) {
        continue;
      }


      /*
      Create deterministic-ish ID based on
      normalized text + hour.
      */

      const patternId =
        Buffer
          .from(
            `${pattern.template}-${pattern.hour}`
          )
          .toString("base64")
          .replace(/[/+=]/g, "")
          .slice(0, 80);


      await db
        .collection("behaviorPatterns")
        .doc(patternId)
        .set(
          {
            ...pattern,

            status:
              "suggested",

            updatedAt:
              new Date(),
          },
          {
            merge: true,
          }
        );
    }


    console.log(
      `[Behavior] Detected ${patterns.length} potential patterns.`
    );


    return patterns;

  } catch (error) {

    console.error(
      "[Behavior] Pattern detection failed:",
      error
    );

    return [];
  }
}


// ==================================================
// Get pattern suggestions
// ==================================================

export async function getBehaviorSuggestions() {

  try {

    const snapshot =
      await db
        .collection("behaviorPatterns")
        .where(
          "status",
          "==",
          "suggested"
        )
        .orderBy(
          "confidence",
          "desc"
        )
        .limit(20)
        .get();


    return snapshot.docs.map(
      (doc) => ({
        id: doc.id,
        ...doc.data(),
      })
    );

  } catch (error) {

    console.error(
      "[Behavior] Could not load suggestions:",
      error
    );

    return [];
  }
}