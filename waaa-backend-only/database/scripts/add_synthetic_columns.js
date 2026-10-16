import { getPool } from "../../src/db/mysqlClient.js";

async function main() {
  const pool = getPool("waaa_db");
  for (const tbl of ["users", "chats", "messages", "tasks"]) {
    try {
      await pool.query(`ALTER TABLE ${tbl} ADD COLUMN is_synthetic TINYINT(1) NOT NULL DEFAULT 0;`);
      console.log(`Added is_synthetic to ${tbl}`);
    } catch (e) {
      if (e.code === "ER_DUP_FIELDNAME") {
        console.log(`is_synthetic already exists on ${tbl}`);
      } else {
        console.error(`Error on ${tbl}:`, e.message);
      }
    }
  }

  // Also check if messages table has importance_score and fraud_score columns directly
  // Note: in 001_initial_schema, message_analysis held scores, but in demonstration it's helpful to also mirror importance_score on messages!
  for (const colDef of [
    "importance_score INT NOT NULL DEFAULT 0",
    "fraud_score INT NOT NULL DEFAULT 0",
    "priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal'",
    "fraud_risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low'"
  ]) {
    try {
      await pool.query(`ALTER TABLE messages ADD COLUMN ${colDef};`);
      console.log(`Added column to messages: ${colDef.split(" ")[0]}`);
    } catch (e) {
      if (e.code !== "ER_DUP_FIELDNAME") console.error("Error adding column:", e.message);
    }
  }

  // Backfill existing real messages importance_score & fraud_score from message_analysis!
  console.log("Backfilling importance_score and fraud_score onto messages from message_analysis...");
  await pool.query(`
    UPDATE messages m
    JOIN message_analysis ma ON m.id = ma.message_id
    SET m.importance_score = ma.importance_final_score,
        m.fraud_score = ma.fraud_final_score,
        m.priority = CASE 
          WHEN ma.importance_level = 'urgent' THEN 'urgent'
          WHEN ma.importance_level IN ('high', 'critical') THEN 'high'
          WHEN ma.importance_level = 'low' THEN 'low'
          ELSE 'normal'
        END,
        m.fraud_risk_level = ma.fraud_risk_level,
        m.is_synthetic = 0;
  `);
  console.log("Backfilled real messages successfully!");
  process.exit(0);
}

main().catch(console.error);
