import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

async function syncLiveData() {
  console.log("🔄 Syncing latest WhatsApp conversations & messages to MySQL...");

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    port: parseInt(process.env.MYSQL_PORT || "3306", 10),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "waaa_db",
  });

  // 1. Read conversations.json
  const convsRaw = fs.readFileSync("data/conversations.json", "utf-8");
  const convs = JSON.parse(convsRaw);

  console.log(`Found ${convs.length} chats in data/conversations.json`);

  for (const c of convs) {
    const rawDate = c.lastMessageAt?.iso || (typeof c.lastMessageAt === "string" ? c.lastMessageAt : null);
    const dateVal = rawDate ? new Date(rawDate) : null;
    const lastTxt = c.lastMessage || c.lastMessageText || null;
    const chatId = c.chatId || c.id;
    const chatName = c.chatName || chatId;

    await conn.query(
      `
      INSERT INTO chats (
        chat_id, user_id, chat_name, chat_type, is_community, participant_count,
        linked_parent, last_message_text, last_message_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        chat_name = VALUES(chat_name),
        chat_type = VALUES(chat_type),
        last_message_text = VALUES(last_message_text),
        last_message_at = VALUES(last_message_at),
        updated_at = CURRENT_TIMESTAMP
    `,
      [
        chatId,
        "default_user",
        chatName,
        c.chatType || "personal",
        Boolean(c.isCommunity),
        c.participantCount || null,
        c.linkedParent || null,
        lastTxt,
        dateVal,
      ]
    );
  }

  // 2. Read messages.json
  const msgsRaw = fs.readFileSync("data/messages.json", "utf-8");
  const msgs = JSON.parse(msgsRaw);
  console.log(`Found ${msgs.length} messages in data/messages.json`);

  let newInserted = 0;
  let updated = 0;

  for (const m of msgs) {
    const rawRecv = m.receivedAt || m.createdAt?.iso || m.createdAt;
    const recvAt = rawRecv ? new Date(rawRecv) : new Date();
    const createdAt = m.createdAt?.iso ? new Date(m.createdAt.iso) : recvAt;

    // Ensure chat exists
    await conn.query(
      `
      INSERT INTO chats (chat_id, user_id, chat_name, chat_type, last_message_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE chat_id = chat_id
    `,
      [
        m.chatId,
        "default_user",
        m.chatName || m.chatId,
        m.chatType || "personal",
        recvAt,
      ]
    );

    const [res] = await conn.query(
      `
      INSERT INTO messages (
        id, user_id, chat_id, whatsapp_message_id, sender_name, sender_jid,
        is_from_me, message_text, received_at, chat_priority, created_at, is_synthetic
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE
        sender_name = VALUES(sender_name),
        message_text = VALUES(message_text),
        received_at = VALUES(received_at)
    `,
      [
        m.id,
        "default_user",
        m.chatId,
        m.messageId || m.id,
        m.sender || "Unknown",
        m.senderJid || m.sender || null,
        Boolean(m.fromMe),
        m.text || "",
        recvAt,
        Boolean(m.chatPriority),
        createdAt,
      ]
    );

    if (res.affectedRows === 1) newInserted++;
    else if (res.affectedRows === 2) updated++;
  }

  console.log(`✅ Messages sync complete: ${newInserted} new, ${updated} updated.`);

  // 3. Query top 5 recent chats to verify
  const [recentRows] = await conn.query(`
    SELECT chat_name, chat_type, last_message_at, LEFT(last_message_text, 30) AS last_msg
    FROM chats
    ORDER BY last_message_at DESC
    LIMIT 5
  `);

  console.log("\n📊 Top 5 Most Recent Chats in MySQL:");
  console.table(recentRows);

  await conn.end();
}

syncLiveData().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
