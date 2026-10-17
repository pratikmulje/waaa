/*
==============================================================================
WAAA - Fix Corrupted Chat Names (Restore Tanushka Patil)
==============================================================================
Restores the true contact name 'Tanushka Patil' for chat '132178306445322@lid'
in both local JSON database and MySQL, fixing the bug where outgoing messages
from the user ('LUCKY') overwrote the recipient's chat name.
==============================================================================
*/

import fs from "fs";
import path from "path";
import { getPool } from "../../src/db/mysqlClient.js";

async function fixChatNames() {
  console.log("==================================================");
  console.log("🔧 FIXING CHAT NAMES IN DATA & MYSQL");
  console.log("==================================================");

  // 1. Fix data/conversations.json
  const convPath = path.resolve("data/conversations.json");
  if (fs.existsSync(convPath)) {
    const convs = JSON.parse(fs.readFileSync(convPath, "utf8"));
    let updatedConvs = 0;
    for (const c of convs) {
      if (c.id === "132178306445322@lid" || c.chatId === "132178306445322@lid") {
        console.log(`  Fixing conversation ${c.id}: "${c.chatName}" -> "Tanushka Patil"`);
        c.chatName = "Tanushka Patil";
        updatedConvs++;
      } else if (c.chatName === "LUCKY🙃" || c.chatName === "LUCKY 🙃" || c.chatName === "LUCKY??") {
        // If chat name was wrongly set to user's own name, fall back to phone/identifier
        const fallbackName = c.id.split("@")[0];
        console.log(`  Resetting self-name for conversation ${c.id}: "${c.chatName}" -> "+${fallbackName}"`);
        c.chatName = `+${fallbackName}`;
        updatedConvs++;
      }
    }
    fs.writeFileSync(convPath, JSON.stringify(convs, null, 2), "utf8");
    console.log(`✅ Updated ${updatedConvs} conversation(s) in data/conversations.json`);
  }

  // 2. Fix data/messages.json
  const msgPath = path.resolve("data/messages.json");
  if (fs.existsSync(msgPath)) {
    const msgs = JSON.parse(fs.readFileSync(msgPath, "utf8"));
    let updatedMsgs = 0;
    for (const m of msgs) {
      if (m.chatId === "132178306445322@lid") {
        if (m.chatName !== "Tanushka Patil") {
          m.chatName = "Tanushka Patil";
          updatedMsgs++;
        }
      }
    }
    fs.writeFileSync(msgPath, JSON.stringify(msgs, null, 2), "utf8");
    console.log(`✅ Updated ${updatedMsgs} message(s) in data/messages.json`);
  }

  // 3. Fix MySQL waaa_db
  try {
    const pool = getPool();
    await pool.query(
      "UPDATE chats SET chat_name = 'Tanushka Patil' WHERE chat_id = '132178306445322@lid'"
    );
    console.log("✅ Updated chats table in MySQL for 132178306445322@lid -> 'Tanushka Patil'");

    // Reset other self-named chats in MySQL if any
    await pool.query(`
      UPDATE chats 
      SET chat_name = CONCAT('+', SUBSTRING_INDEX(chat_id, '@', 1))
      WHERE chat_name LIKE 'LUCKY%' AND chat_id != '132178306445322@lid'
    `);
    console.log("✅ Cleared any erroneous 'LUCKY' chat names in MySQL");
  } catch (err) {
    console.error("⚠️ MySQL update error:", err.message);
  }

  console.log("==================================================");
  console.log("🎉 Chat name correction complete!");
  console.log("==================================================\n");
}

fixChatNames().catch(console.error);
