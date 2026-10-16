/*
==============================================================================
WAAA - Post-Cutover Reverse Rollback & Data Export Utility
==============================================================================
Safeguard: If a rollback from MySQL back to JSON is ever required after
production cutover, this script dumps all records from MySQL back into
/data/*.json, ensuring any new WhatsApp messages or intelligence created
while on MySQL are preserved with ZERO data loss.
==============================================================================
*/

import "dotenv/config";
import fs from "fs";
import path from "path";
import { getPool, closePool } from "../../src/db/mysqlClient.js";

const DATA_DIR = path.resolve("data");

export async function exportMysqlToJson() {
  console.log("==================================================");
  console.log("🔄 WAAA Reverse Sync: Exporting MySQL Data to JSON");
  console.log("==================================================");

  const pool = getPool();

  try {
    // 1. Export Messages (joined with message_analysis)
    console.log("  → Exporting messages with joined analysis...");
    const [messages] = await pool.query(`
      SELECT 
        m.id, m.chat_id AS chatId, m.whatsapp_message_id AS messageId,
        m.sender_name AS sender, m.sender_jid AS senderJid,
        m.is_from_me AS fromMe, m.message_text AS text,
        m.received_at AS receivedAt, m.chat_priority AS chatPriority,
        m.created_at AS createdAt,
        c.chat_name AS chatName, c.chat_type AS chatType,
        c.is_community AS isCommunity, c.participant_count AS participantCount,
        c.linked_parent AS linkedParent,
        ma.fraud_rule_score AS fa_ruleScore, ma.fraud_ml_score AS fa_mlScore,
        ma.fraud_final_score AS fa_finalScore, ma.fraud_risk_level AS fa_riskLevel,
        ma.fraud_phase AS fa_phase, ma.fraud_reasons AS fa_reasons,
        ma.importance_rule_score AS ia_ruleScore, ma.importance_ml_score AS ia_mlScore,
        ma.importance_final_score AS ia_finalScore, ma.importance_level AS ia_level,
        ma.importance_reasons AS ia_reasons
      FROM messages m
      LEFT JOIN chats c ON m.chat_id = c.chat_id
      LEFT JOIN message_analysis ma ON m.id = ma.message_id
      ORDER BY m.received_at ASC
    `);

    const formattedMessages = messages.map(m => ({
      id: m.id,
      chatId: m.chatId,
      chatType: m.chatType || "personal",
      chatName: m.chatName || m.chatId,
      isCommunity: Boolean(m.isCommunity),
      participantCount: m.participantCount,
      linkedParent: m.linkedParent,
      sender: m.sender,
      senderJid: m.senderJid,
      text: m.text,
      messageId: m.messageId,
      receivedAt: m.receivedAt ? new Date(m.receivedAt).toISOString() : null,
      fraudAnalysis: {
        ruleScore: m.fa_ruleScore || 0,
        mlScore: Number(m.fa_mlScore || 0),
        finalScore: m.fa_finalScore || 0,
        riskLevel: m.fa_riskLevel || "low",
        phase: m.fa_phase || "NORMAL",
        reasons: typeof m.fa_reasons === "string" ? JSON.parse(m.fa_reasons) : (m.fa_reasons || []),
        mlPrediction: 0,
        mlProbability: Number(m.fa_mlScore || 0),
      },
      importanceAnalysis: {
        ruleScore: m.ia_ruleScore || 0,
        mlScore: Number(m.ia_mlScore || 0),
        finalScore: m.ia_finalScore || 0,
        level: m.ia_level || "normal",
        reasons: typeof m.ia_reasons === "string" ? JSON.parse(m.ia_reasons) : (m.ia_reasons || []),
        mlPrediction: 0,
        mlProbability: Number(m.ia_mlScore || 0),
      },
      chatPriority: Boolean(m.chatPriority),
      createdAt: {
        __waaaDate: true,
        iso: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
      },
    }));

    fs.writeFileSync(path.join(DATA_DIR, "messages.json"), JSON.stringify(formattedMessages, null, 2), "utf-8");
    console.log(`    ✅ Exported ${formattedMessages.length} messages.`);

    // 2. Export Chats (conversations.json)
    console.log("  → Exporting conversations...");
    const [chats] = await pool.query("SELECT * FROM chats ORDER BY last_message_at DESC");
    const formattedChats = chats.map(c => ({
      id: c.chat_id,
      chatId: c.chat_id,
      chatType: c.chat_type,
      chatName: c.chat_name,
      isCommunity: Boolean(c.is_community),
      participantCount: c.participant_count,
      linkedParent: c.linked_parent,
      lastMessage: c.last_message_text,
      lastMessageAt: c.last_message_at ? { __waaaDate: true, iso: new Date(c.last_message_at).toISOString() } : null,
      updatedAt: { __waaaDate: true, iso: new Date(c.updated_at).toISOString() },
    }));
    fs.writeFileSync(path.join(DATA_DIR, "conversations.json"), JSON.stringify(formattedChats, null, 2), "utf-8");
    console.log(`    ✅ Exported ${formattedChats.length} conversations.`);

    // 3. Export People (people.json)
    console.log("  → Exporting people...");
    const [people] = await pool.query("SELECT * FROM contacts");
    const formattedPeople = people.map(p => ({
      personId: p.contact_id,
      primaryJid: p.primary_jid,
      jids: typeof p.jids === "string" ? JSON.parse(p.jids) : (p.jids || []),
      names: typeof p.names === "string" ? JSON.parse(p.names) : (p.names || []),
      primaryName: p.primary_name,
      personalChatId: p.primary_jid,
      groupChats: [],
      resolutionMethod: p.resolution_method,
      confidence: Number(p.confidence),
      identityCandidates: typeof p.identity_candidates === "string" ? JSON.parse(p.identity_candidates) : (p.identity_candidates || []),
      manualAliases: typeof p.manual_aliases === "string" ? JSON.parse(p.manual_aliases) : (p.manual_aliases || []),
      isMe: Boolean(p.is_me),
      createdAt: new Date(p.created_at).toISOString(),
      updatedAt: new Date(p.updated_at).toISOString(),
    }));
    fs.writeFileSync(path.join(DATA_DIR, "people.json"), JSON.stringify(formattedPeople, null, 2), "utf-8");
    console.log(`    ✅ Exported ${formattedPeople.length} contacts.`);

    console.log("\n🎉 Full reverse export completed cleanly. All data written back to JSON.");
  } catch (err) {
    console.error("❌ Reverse export failed:", err.message);
    throw err;
  } finally {
    await closePool();
  }
}

if (process.argv[1] && process.argv[1].endsWith("export_mysql_to_json.js")) {
  exportMysqlToJson().catch(console.error);
}
