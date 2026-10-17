/*
==============================================================================
WAAA - Real-Time MySQL Streaming Ingestion Hook
==============================================================================
Streams incoming and outgoing WhatsApp messages and chats into MySQL in real time:
- Directly writes to `messages`
- Directly writes to `chats`
- Directly writes to `general_messages` master table
- Non-blocking: gracefully catches connection delays without impacting Baileys
==============================================================================
*/

import { query } from "./mysqlClient.js";

/**
 * Normalizes Date input safely.
 */
function toValidDate(raw) {
  if (!raw) return new Date();
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw === "object" && raw.iso) {
    const d = new Date(raw.iso);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  return !isNaN(d.getTime()) ? d : new Date();
}

/**
 * Writes or updates a message into both `messages` and `general_messages` tables in MySQL.
 */
export async function syncMessageToMySQL(entry, docId) {
  if (!entry) return;
  try {
    const id = docId || entry.id;
    if (!id) return;

    const recvAt = toValidDate(entry.receivedAt || entry.createdAt);
    const createdAt = toValidDate(entry.createdAt || recvAt);

    const chatId = entry.chatId || "unknown_chat";
    const chatName = entry.chatName || chatId;
    const chatType = entry.chatType || "personal";
    const sender = entry.sender || entry.sender_name || "Unknown";
    const text = entry.text || entry.message_text || "";
    const isFromMe = Boolean(entry.fromMe || entry.is_from_me);
    const chatPriority = Boolean(entry.chatPriority || entry.chat_priority);
    const importanceScore = Math.round(Number(entry.importanceAnalysis?.finalScore ?? entry.importance_score ?? 0));
    const fraudScore = Math.round(Number(entry.fraudAnalysis?.finalScore ?? entry.fraud_score ?? 0));
    const priority = entry.importanceAnalysis?.level || entry.priority || "normal";
    const fraudRiskLevel = entry.fraudAnalysis?.riskLevel || entry.fraud_risk_level || "low";
    const isSynthetic = Boolean(entry.isSynthetic || entry.is_synthetic);

    // 1. Ensure chat exists & update last message
    await query(`
      INSERT INTO chats (chat_id, user_id, chat_name, chat_type, last_message_text, last_message_at)
      VALUES (?, 'default_user', ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        chat_name = IF(chat_name IS NULL OR chat_name = chat_id, VALUES(chat_name), chat_name),
        last_message_text = VALUES(last_message_text),
        last_message_at = VALUES(last_message_at)
    `, [chatId, chatName, chatType, text, recvAt]);

    // 2. Insert into messages table
    await query(`
      INSERT INTO messages (
        id, user_id, chat_id, whatsapp_message_id, sender_name, sender_jid,
        is_from_me, message_text, received_at, chat_priority, created_at,
        is_synthetic, importance_score, fraud_score, priority, fraud_risk_level
      ) VALUES (?, 'default_user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        sender_name = VALUES(sender_name),
        message_text = VALUES(message_text),
        received_at = VALUES(received_at),
        importance_score = VALUES(importance_score),
        fraud_score = VALUES(fraud_score),
        priority = VALUES(priority),
        fraud_risk_level = VALUES(fraud_risk_level)
    `, [
      id,
      chatId,
      entry.messageId || id,
      sender,
      entry.senderJid || null,
      isFromMe,
      text,
      recvAt,
      chatPriority,
      createdAt,
      isSynthetic,
      importanceScore,
      fraudScore,
      priority,
      fraudRiskLevel,
    ]);

    // 3. Insert into general_messages master table
    await query(`
      INSERT INTO general_messages (
        message_id, chat_name, chat_type, sender, message_text,
        msg_date, msg_time, received_at, importance_score, priority,
        fraud_score, fraud_risk_level, is_synthetic
      ) VALUES (?, ?, ?, ?, ?, DATE(?), TIME(?), ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        chat_name = VALUES(chat_name),
        sender = VALUES(sender),
        message_text = VALUES(message_text),
        msg_date = VALUES(msg_date),
        msg_time = VALUES(msg_time),
        received_at = VALUES(received_at),
        importance_score = VALUES(importance_score),
        priority = VALUES(priority),
        fraud_score = VALUES(fraud_score),
        fraud_risk_level = VALUES(fraud_risk_level)
    `, [
      id,
      chatName,
      chatType,
      sender,
      text,
      recvAt,
      recvAt,
      recvAt,
      importanceScore,
      priority,
      fraudScore,
      fraudRiskLevel,
      isSynthetic,
    ]);

  } catch (err) {
    console.warn(`[MySQL LiveSync] Warning: Failed to stream message to MySQL: ${err.message}`);
  }
}

/**
 * Updates chat metadata in MySQL `chats`.
 */
export async function syncChatToMySQL(chatId, chatInfo, messageData = {}) {
  if (!chatId) return;
  try {
    const chatName = chatInfo.chatName || chatId;
    const chatType = chatInfo.chatType || "personal";
    const lastText = messageData?.text || "";
    const lastAt = new Date();

    await query(`
      INSERT INTO chats (
        chat_id, user_id, chat_name, chat_type, is_community,
        participant_count, linked_parent, last_message_text, last_message_at
      ) VALUES (?, 'default_user', ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        chat_name = VALUES(chat_name),
        chat_type = VALUES(chat_type),
        last_message_text = VALUES(last_message_text),
        last_message_at = VALUES(last_message_at)
    `, [
      chatId,
      chatName,
      chatType,
      Boolean(chatInfo.isCommunity),
      chatInfo.participantCount || null,
      chatInfo.linkedParent || null,
      lastText,
      lastAt,
    ]);
  } catch (err) {
    console.warn(`[MySQL LiveSync] Warning: Failed to stream chat to MySQL: ${err.message}`);
  }
}

import fs from "fs";
import path from "path";
import { getBaseDataDir } from "../intelligence/storageConfig.js";

/**
 * Syncs the latest N messages from disk into MySQL.
 */
export async function syncLatestFromDisk(count = 50) {
  try {
    const dataDir = getBaseDataDir();
    const msgPath = path.join(dataDir, "messages.json");
    if (!fs.existsSync(msgPath)) return;
    const raw = fs.readFileSync(msgPath, "utf-8").trim();
    if (!raw) return;
    const msgs = JSON.parse(raw);
    const slice = msgs.slice(-count);
    for (const m of slice) {
      await syncMessageToMySQL(m, m.id);
    }
  } catch (err) {
    // ignore
  }
}
