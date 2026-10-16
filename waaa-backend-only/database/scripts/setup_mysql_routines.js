/*
==============================================================================
WAAA - Setup MySQL Views, Stored Procedures, and Triggers
==============================================================================
Ensures production-grade Views, Stored Procedures, and Triggers are deployed
directly to MySQL 8.0+ for live DBMS assignment demonstrations:
  - Views: v_important_messages, v_chat_activity_summary, v_pending_tasks
  - Procedures: sp_get_chat_messages, sp_get_chat_stats, sp_search_messages
  - Triggers: trg_after_message_insert, trg_before_message_delete, trg_after_task_update
==============================================================================
*/

import "dotenv/config";
import mysql from "mysql2/promise";
import { getPoolConfig } from "../../src/db/mysqlClient.js";
import { ensureMysqlRunning } from "./ensure_mysql_running.js";

export async function setupMysqlRoutines() {
  await ensureMysqlRunning();
  const pool = mysql.createPool(getPoolConfig());

  console.log("==================================================");
  console.log("⚙️  WAAA DATABASE ROUTINES & OBJECTS SETUP");
  console.log("==================================================");

  try {
    // 0. Ensure friendly column defaults on messages
    try {
      await pool.query(`
        ALTER TABLE messages 
          MODIFY COLUMN received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          MODIFY COLUMN whatsapp_message_id VARCHAR(128) NOT NULL DEFAULT '',
          MODIFY COLUMN sender_jid VARCHAR(128) NOT NULL DEFAULT '',
          MODIFY COLUMN user_id VARCHAR(64) NOT NULL DEFAULT 'default_user'
      `);
    } catch (e) {
      // Ignore if columns already modified
    }

    // 1. Ensure audit_logs table exists
    console.log("📋 Step 1: Ensuring audit_logs table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
        action_type VARCHAR(32) NOT NULL,
        table_name VARCHAR(64) NOT NULL,
        record_id VARCHAR(64) NOT NULL,
        details TEXT NULL,
        logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_table (table_name),
        INDEX idx_audit_time (logged_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Setup Views
    console.log("👁️  Step 2: Creating / Updating Database Views...");

    await pool.query(`
      CREATE OR REPLACE VIEW v_important_messages AS
      SELECT 
        m.id AS message_id,
        c.chat_name,
        c.chat_type,
        m.sender_name,
        m.message_text,
        m.importance_score,
        m.priority,
        m.is_synthetic,
        m.received_at
      FROM messages m
      LEFT JOIN chats c ON m.chat_id = c.chat_id
      WHERE m.importance_score >= 50;
    `);
    console.log("  ✓ View 'v_important_messages' ready");

    await pool.query(`
      CREATE OR REPLACE VIEW v_chat_activity_summary AS
      SELECT 
        c.chat_id,
        c.chat_name,
        c.chat_type,
        c.tier,
        COUNT(m.id) AS total_messages,
        ROUND(AVG(m.importance_score), 1) AS avg_importance,
        MAX(m.received_at) AS last_message_at
      FROM chats c
      LEFT JOIN messages m ON c.chat_id = m.chat_id
      GROUP BY c.chat_id, c.chat_name, c.chat_type, c.tier;
    `);
    console.log("  ✓ View 'v_chat_activity_summary' ready");

    await pool.query(`
      CREATE OR REPLACE VIEW v_pending_tasks AS
      SELECT 
        t.task_id,
        c.chat_name,
        t.task_text,
        t.status,
        t.due_date,
        t.is_synthetic
      FROM tasks t
      JOIN chats c ON t.chat_id = c.chat_id
      WHERE t.status != 'completed' AND t.status != 'cancelled';
    `);
    console.log("  ✓ View 'v_pending_tasks' ready");

    // 3. Setup Stored Procedures
    console.log("📦 Step 3: Creating / Updating Stored Procedures...");

    await pool.query("DROP PROCEDURE IF EXISTS sp_get_chat_messages;");
    await pool.query(`
      CREATE PROCEDURE sp_get_chat_messages (
        IN p_chat_id VARCHAR(128),
        IN p_limit INT,
        IN p_offset INT
      )
      BEGIN
        SET p_limit = COALESCE(p_limit, 20);
        SET p_offset = COALESCE(p_offset, 0);
        SELECT 
          id, 
          sender_name, 
          message_text, 
          importance_score, 
          priority, 
          is_synthetic, 
          received_at
        FROM messages
        WHERE chat_id = p_chat_id
        ORDER BY received_at DESC
        LIMIT p_limit OFFSET p_offset;
      END
    `);
    console.log("  ✓ Stored Procedure 'sp_get_chat_messages' ready");

    await pool.query("DROP PROCEDURE IF EXISTS sp_get_chat_stats;");
    await pool.query(`
      CREATE PROCEDURE sp_get_chat_stats (
        IN p_chat_id VARCHAR(128),
        OUT p_total_messages INT,
        OUT p_avg_importance DECIMAL(5,2),
        OUT p_high_priority_count INT
      )
      BEGIN
        SELECT 
          COUNT(*), 
          COALESCE(AVG(importance_score), 0),
          COUNT(CASE WHEN importance_score >= 70 THEN 1 END)
        INTO 
          p_total_messages, 
          p_avg_importance,
          p_high_priority_count
        FROM messages
        WHERE chat_id = p_chat_id;
      END
    `);
    console.log("  ✓ Stored Procedure 'sp_get_chat_stats' ready");

    await pool.query("DROP PROCEDURE IF EXISTS sp_search_messages;");
    await pool.query(`
      CREATE PROCEDURE sp_search_messages (
        IN p_search_term VARCHAR(255),
        IN p_min_importance INT,
        IN p_limit INT
      )
      BEGIN
        SET p_min_importance = COALESCE(p_min_importance, 0);
        SET p_limit = COALESCE(p_limit, 20);
        SELECT 
          m.id,
          c.chat_name,
          m.sender_name,
          m.message_text,
          m.importance_score,
          m.received_at
        FROM messages m
        LEFT JOIN chats c ON m.chat_id = c.chat_id
        WHERE (m.message_text LIKE CONCAT('%', p_search_term, '%') OR m.sender_name LIKE CONCAT('%', p_search_term, '%'))
          AND m.importance_score >= p_min_importance
        ORDER BY m.importance_score DESC, m.received_at DESC
        LIMIT p_limit;
      END
    `);
    console.log("  ✓ Stored Procedure 'sp_search_messages' ready");

    // 4. Setup Triggers
    console.log("⚡ Step 4: Creating / Updating Triggers...");

    await pool.query("DROP TRIGGER IF EXISTS trg_after_message_insert;");
    await pool.query(`
      CREATE TRIGGER trg_after_message_insert
      AFTER INSERT ON messages
      FOR EACH ROW
      BEGIN
        INSERT INTO audit_logs (action_type, table_name, record_id, details, new_values)
        VALUES (
          'INSERT', 
          'messages', 
          NEW.id, 
          CONCAT('Sender: ', NEW.sender_name, ' | Chat: ', NEW.chat_id, ' | Score: ', NEW.importance_score),
          JSON_OBJECT('sender', NEW.sender_name, 'chat_id', NEW.chat_id, 'importance_score', NEW.importance_score)
        );
      END
    `);
    console.log("  ✓ Trigger 'trg_after_message_insert' ready");

    await pool.query("DROP TRIGGER IF EXISTS trg_before_message_delete;");
    await pool.query(`
      CREATE TRIGGER trg_before_message_delete
      BEFORE DELETE ON messages
      FOR EACH ROW
      BEGIN
        INSERT INTO audit_logs (action_type, table_name, record_id, details, old_values)
        VALUES (
          'DELETE', 
          'messages', 
          OLD.id, 
          CONCAT('Deleted message from: ', OLD.sender_name, ' | Chat: ', OLD.chat_id),
          JSON_OBJECT('sender', OLD.sender_name, 'chat_id', OLD.chat_id, 'importance_score', OLD.importance_score)
        );
      END
    `);
    console.log("  ✓ Trigger 'trg_before_message_delete' ready");

    await pool.query("DROP TRIGGER IF EXISTS trg_after_task_update;");
    await pool.query(`
      CREATE TRIGGER trg_after_task_update
      AFTER UPDATE ON tasks
      FOR EACH ROW
      BEGIN
        IF OLD.status <> NEW.status THEN
          INSERT INTO audit_logs (action_type, table_name, record_id, details, old_values, new_values)
          VALUES (
            'UPDATE', 
            'tasks', 
            NEW.task_id, 
            CONCAT('Status changed from ', OLD.status, ' to ', NEW.status),
            JSON_OBJECT('status', OLD.status),
            JSON_OBJECT('status', NEW.status)
          );
        END IF;
      END
    `);
    console.log("  ✓ Trigger 'trg_after_task_update' ready");

    console.log("\n==================================================");
    console.log("✅ All Views, Stored Procedures, and Triggers are ready!");
    console.log("==================================================\n");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("setup_mysql_routines.js")) {
  setupMysqlRoutines()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Routine setup failed:", err.message);
      process.exit(1);
    });
}
