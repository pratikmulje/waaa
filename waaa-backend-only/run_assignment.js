/*
==============================================================================
WAAA - DBMS Assignment Demonstration Runner & Interactive Table Explorer
==============================================================================
Production-grade interactive CLI for demonstrating DBMS assignments directly
against live MySQL 8.0+ (waaa_db):
  - Assignment 1: DDL, DML, Primary Key, Foreign Key & Check Constraints
  - Assignment 2: Database Views (Creation, Multi-table, Dynamic Querying)
  - Assignment 3: SQL Joins (INNER, LEFT OUTER, RIGHT OUTER, SELF JOIN)
  - Assignment 5: SELECT Queries, Operators, Aggregate & Single-row Functions
  - Assignment 6: Stored Procedures & Parameters (IN, OUT, Session Variables)
  - Assignment 7: Database Triggers & Automated Audit Logging (AFTER INSERT, BEFORE DELETE)
  - npm run demo table <name>  -> Interactive table explorer with projection, filter, sort, search
  - npm run demo schema <name> -> Deep schema inspection (types, keys, foreign keys, indexes)
  - npm run demo stats         -> Database overview with real vs. synthetic data breakdown
  - npm run demo seed          -> Scale synthetic dataset deterministically
==============================================================================
*/

import "dotenv/config";
import mysql from "mysql2/promise";
import { getPoolConfig } from "./src/db/mysqlClient.js";
import { ensureMysqlRunning } from "./database/scripts/ensure_mysql_running.js";
import {
  getAllTables,
  getTableSchema,
  queryTable,
  getDatabaseStats,
} from "./database/scripts/db_inspector.js";
import { seedLargeDataset } from "./database/scripts/seed_large_dataset.js";
import { setupMysqlRoutines } from "./database/scripts/setup_mysql_routines.js";

/**
 * Returns a connection pool to waaa_db.
 */
function getPool() {
  return mysql.createPool(getPoolConfig());
}

/**
 * Truncates long strings for readable terminal table output.
 */
function formatTableRows(rows, maxLen = 36) {
  if (!rows || rows.length === 0) return [];
  return rows.map((row) => {
    const formatted = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) {
        formatted[k] = "NULL";
      } else if (typeof v === "object") {
        const str = JSON.stringify(v);
        formatted[k] = str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
      } else if (typeof v === "string" && v.length > maxLen) {
        formatted[k] = v.slice(0, maxLen - 3) + "...";
      } else if (v instanceof Date) {
        formatted[k] = v.toISOString().slice(0, 19).replace("T", " ");
      } else {
        formatted[k] = v;
      }
    }
    return formatted;
  });
}

/**
 * Prints a titled query execution block with timing and row count.
 */
async function printQuery(pool, title, sql, params = [], explanation = null) {
  console.log(`\n============================================================`);
  console.log(`📌 ${title}`);
  if (explanation) {
    console.log(`💡 Concept: ${explanation}`);
  }
  console.log(`------------------------------------------------------------`);
  console.log(`SQL Command:`);
  console.log(sql.trim());
  console.log(`------------------------------------------------------------`);

  const startTime = Date.now();
  try {
    const [result] = await pool.query(sql, params);
    const elapsed = Date.now() - startTime;

    if (Array.isArray(result)) {
      console.log(`Output: (${result.length} rows returned in ${elapsed} ms)`);
      if (result.length > 0) {
        console.table(formatTableRows(result));
      } else {
        console.log("  (Empty result set)\n");
      }
      return result;
    } else {
      console.log(`Result: Query executed successfully in ${elapsed} ms.`);
      if (result.affectedRows !== undefined) {
        console.log(`  Affected rows: ${result.affectedRows}, InsertId: ${result.insertId || 0}`);
      }
      return result;
    }
  } catch (err) {
    console.error(`❌ Execution error (${err.code || "ERR"}): ${err.message}`);
    return null;
  }
}

// ==============================================================================
// ASSIGNMENT 1: DDL, DML & CONSTRAINTS
// ==============================================================================
async function runAssignment1(pool, options = {}) {
  const limit = options.limit || 5;
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 1 — DDL, DML & CONSTRAINTS");
  console.log("============================================================");

  // 1. Schema & Constraints Inspection
  console.log("\n1. DDL: Inspecting Primary Keys and Foreign Keys on 'messages' table:");
  const schema = await getTableSchema("messages");
  console.log(`   Table: ${schema.tableName} (${schema.tableType}), Total Records: ${schema.rowCount}`);
  console.log("   Foreign Keys:");
  console.table(schema.foreignKeys);

  // 2. DML SELECT on Parent Table
  await printQuery(
    pool,
    "2. DML SELECT: Parent Table 'chats' (Primary Key: chat_id)",
    `SELECT chat_id, chat_name, chat_type, tier, participant_count, is_synthetic 
     FROM chats 
     ORDER BY created_at DESC 
     LIMIT ?;`,
    [limit],
    "Demonstrates querying the parent entity which provides chat_id referenced by messages."
  );

  // 3. DML SELECT on Child Table
  await printQuery(
    pool,
    "3. DML SELECT: Child Table 'messages' (Foreign Key: chat_id -> chats.chat_id)",
    `SELECT id, chat_id, sender_name, message_text, importance_score, priority, received_at 
     FROM messages 
     ORDER BY received_at DESC 
     LIMIT ?;`,
    [limit],
    "Child records maintain referential integrity with parent chats."
  );

  // 4. DML INSERT Valid Record
  const [[firstChat]] = await pool.query("SELECT chat_id, chat_name FROM chats LIMIT 1");
  const testMsgId = "demo_msg_assign1";

  // Clean up previous test record if exists
  await pool.query("DELETE FROM messages WHERE id = ?", [testMsgId]);

  await printQuery(
    pool,
    `4. DML INSERT: Add a new message referencing valid parent chat '${firstChat.chat_name}'`,
    `INSERT INTO messages (id, user_id, chat_id, sender_name, message_text, importance_score, priority, is_synthetic)
     VALUES (?, 'default_user', ?, 'Viva Examiner', 'Live presentation test message demonstrating valid FK', 85, 'high', 1);`,
    [testMsgId, firstChat.chat_id],
    "Insert succeeds because referenced chat_id exists in parent 'chats' table."
  );

  await printQuery(
    pool,
    "5. DML SELECT: Verify the newly inserted message",
    `SELECT id, chat_id, sender_name, message_text, importance_score, priority 
     FROM messages 
     WHERE id = ?;`,
    [testMsgId]
  );

  // 6. DML UPDATE
  await printQuery(
    pool,
    "6. DML UPDATE: Safely update importance score and priority",
    `UPDATE messages 
     SET importance_score = 95, priority = 'urgent' 
     WHERE id = ?;`,
    [testMsgId],
    "Modifies existing attributes while preserving primary key and relationships."
  );

  await printQuery(
    pool,
    "7. DML SELECT: Verify the updated message state",
    `SELECT id, sender_name, message_text, importance_score, priority 
     FROM messages 
     WHERE id = ?;`,
    [testMsgId]
  );

  // 8. Controlled Constraint Violation Tests
  console.log("\n------------------------------------------------------------");
  console.log("📌 8. CONSTRAINT ENFORCEMENT DEMONSTRATION (Controlled Negative Tests)");
  console.log("------------------------------------------------------------");

  // Test A: Foreign Key Violation
  console.log("A. Foreign Key Violation Test:");
  console.log("   Attempting to insert a message with non-existent chat_id = 'invalid_chat_99999'...");
  try {
    await pool.query(`
      INSERT INTO messages (id, user_id, chat_id, sender_name, message_text, importance_score)
      VALUES ('demo_err_fk', 'default_user', 'invalid_chat_99999', 'Hacker', 'Will fail', 50);
    `);
    console.log("   ⚠️ Unexpected: Insert succeeded!");
  } catch (err) {
    console.log(`   ✅ Foreign Key Constraint Enforced!`);
    console.log(`      MySQL Error Code: ${err.errno} (${err.code})`);
    console.log(`      Message: ${err.message}`);
    console.log(`      -> Explanation: MySQL rejected child row because 'invalid_chat_99999' does not exist in 'chats'.`);
  }

  // Test B: Check Constraint Violation
  console.log("\nB. Check Constraint Violation Test (chk_importance_score):");
  console.log("   Attempting to insert a message with importance_score = 150 (valid range is 0 to 100)...");
  try {
    await pool.query(`
      INSERT INTO messages (id, user_id, chat_id, sender_name, message_text, importance_score)
      VALUES ('demo_err_chk', 'default_user', ?, 'Tester', 'Will fail', 150);
    `, [firstChat.chat_id]);
    console.log("   ⚠️ Unexpected: Insert succeeded!");
  } catch (err) {
    console.log(`   ✅ Check Constraint Enforced!`);
    console.log(`      MySQL Error Code: ${err.errno} (${err.code})`);
    console.log(`      Message: ${err.message}`);
    console.log(`      -> Explanation: MySQL rejected row because 150 violates CHECK (importance_score BETWEEN 0 AND 100).`);
  }

  // 9. DML DELETE Cleanup
  await printQuery(
    pool,
    "9. DML DELETE: Clean up temporary test message",
    "DELETE FROM messages WHERE id = ?;",
    [testMsgId],
    "Deletes test message to ensure idempotency and prevent database pollution."
  );
}

// ==============================================================================
// ASSIGNMENT 2: DATABASE VIEWS
// ==============================================================================
async function runAssignment2(pool, options = {}) {
  const limit = options.limit || 8;
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 2 — DATABASE VIEWS");
  console.log("============================================================");

  // 1. Create or Replace View: High-Importance Messages
  await printQuery(
    pool,
    "1. CREATE VIEW: 'v_important_messages' (Filtered View for Score >= 50)",
    `CREATE OR REPLACE VIEW v_important_messages AS
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
     WHERE m.importance_score >= 50;`,
    [],
    "Virtual table exposing only high-priority communications across all chats."
  );

  // 2. Query View 1
  await printQuery(
    pool,
    "2. SELECT FROM VIEW: Top Important Messages",
    `SELECT message_id, chat_name, sender_name, message_text, importance_score, priority, received_at 
     FROM v_important_messages 
     ORDER BY importance_score DESC, received_at DESC 
     LIMIT ?;`,
    [limit],
    "Queries virtual view directly as if it were a physical table."
  );

  // 3. Multi-Table Aggregation View
  await printQuery(
    pool,
    "3. CREATE VIEW: 'v_chat_activity_summary' (Multi-table Aggregation View)",
    `CREATE OR REPLACE VIEW v_chat_activity_summary AS
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
     GROUP BY c.chat_id, c.chat_name, c.chat_type, c.tier;`,
    [],
    "Aggregates chat metadata with message volume and average importance."
  );

  // 4. Query View 2
  await printQuery(
    pool,
    "4. SELECT FROM VIEW: Chat Activity Summary",
    `SELECT chat_name, chat_type, tier, total_messages, avg_importance, last_message_at 
     FROM v_chat_activity_summary 
     WHERE total_messages > 0 
     ORDER BY total_messages DESC 
     LIMIT ?;`,
    [limit],
    "Demonstrates complex join + group-by encapsulated within a simple SELECT."
  );

  // 5. Pending Tasks View
  await printQuery(
    pool,
    "5. CREATE VIEW: 'v_pending_tasks' (Joined Actionable Tasks View)",
    `CREATE OR REPLACE VIEW v_pending_tasks AS
     SELECT 
       t.task_id,
       c.chat_name,
       c.tier AS chat_tier,
       t.task_text,
       t.status,
       t.due_date,
       t.is_synthetic
     FROM tasks t
     JOIN chats c ON t.chat_id = c.chat_id
     WHERE t.status != 'completed' AND t.status != 'cancelled';`,
    [],
    "Filters actionable commitments joined with source chat metadata."
  );

  // 6. Query View 3
  await printQuery(
    pool,
    "6. SELECT FROM VIEW: Pending Tasks Requiring Action",
    `SELECT task_id, chat_name, task_text, status, due_date 
     FROM v_pending_tasks 
     ORDER BY due_date ASC 
     LIMIT ?;`,
    [limit]
  );

  // 7. Dynamic View Demonstration
  console.log("\n------------------------------------------------------------");
  console.log("📌 7. DYNAMIC VIEW BEHAVIOR DEMONSTRATION");
  console.log("------------------------------------------------------------");
  console.log("Inserting a new message with importance_score = 99...");
  const tempMsgId = "demo_view_dynamic_test";
  await pool.query("DELETE FROM messages WHERE id = ?", [tempMsgId]);
  await pool.query(`
    INSERT INTO messages (id, user_id, chat_id, sender_name, message_text, importance_score, priority, is_synthetic)
    VALUES (?, 'default_user', 'syn_chat_001@g.us', 'Dean Academics', 'Urgent Viva Notification: Report to Hall A', 99, 'urgent', 1);
  `, [tempMsgId]);

  await printQuery(
    pool,
    "View Instantly Reflects Underlying Table Change (Zero Caching / Dynamic Computation)",
    `SELECT message_id, sender_name, message_text, importance_score 
     FROM v_important_messages 
     WHERE message_id = ?;`,
    [tempMsgId],
    "Views in MySQL do not store data; they dynamically execute the underlying SELECT query."
  );

  await pool.query("DELETE FROM messages WHERE id = ?", [tempMsgId]);
}

// ==============================================================================
// ASSIGNMENT 3: SQL JOINS
// ==============================================================================
async function runAssignment3(pool, options = {}) {
  const limit = options.limit || 6;
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 3 — SQL JOINS");
  console.log("============================================================");

  // 1. INNER JOIN (Equi-join)
  await printQuery(
    pool,
    "1. INNER JOIN (Equi-Join): Messages matched with Parent Chat Details",
    `SELECT 
       m.id AS msg_id,
       c.chat_name,
       c.chat_type,
       m.sender_name,
       m.message_text,
       m.importance_score,
       m.received_at
     FROM messages m
     INNER JOIN chats c ON m.chat_id = c.chat_id
     ORDER BY m.received_at DESC
     LIMIT ?;`,
    [limit],
    "Returns rows where there is a match in both messages and chats tables."
  );

  // 2. LEFT OUTER JOIN
  await printQuery(
    pool,
    "2. LEFT OUTER JOIN: All Chats, showing Tasks if assigned (or NULL if none)",
    `SELECT 
       c.chat_id,
       c.chat_name,
       c.tier,
       t.task_id,
       COALESCE(t.task_text, '(No pending task)') AS task_description,
       COALESCE(t.status, 'N/A') AS task_status
     FROM chats c
     LEFT JOIN tasks t ON c.chat_id = t.chat_id
     ORDER BY t.task_id DESC, c.chat_name ASC
     LIMIT ?;`,
    [limit],
    "Preserves all records from the left table 'chats', filling non-matching tasks with NULL."
  );

  // 3. RIGHT OUTER JOIN
  await printQuery(
    pool,
    "3. RIGHT OUTER JOIN: All Tasks matched with Chat Details",
    `SELECT 
       t.task_id,
       t.task_text,
       t.status,
       t.due_date,
       c.chat_name,
       c.chat_type
     FROM chats c
     RIGHT JOIN tasks t ON c.chat_id = t.chat_id
     ORDER BY t.created_at DESC
     LIMIT ?;`,
    [limit],
    "Preserves all records from the right table 'tasks' matched against chats."
  );

  // 4. SELF JOIN
  await printQuery(
    pool,
    "4. SELF JOIN: Comparing Two Messages within the Same Chat (Consecutive / Threading)",
    `SELECT 
       m1.chat_id,
       m1.sender_name AS first_sender,
       m1.message_text AS first_msg,
       m2.sender_name AS reply_sender,
       m2.message_text AS reply_msg
     FROM messages m1
     JOIN messages m2 
       ON m1.chat_id = m2.chat_id 
      AND m1.id <> m2.id 
      AND m1.received_at < m2.received_at
     WHERE m1.importance_score >= 60 AND m2.importance_score >= 60
     LIMIT 4;`,
    [],
    "Joins the messages table with itself on chat_id to discover related conversation pairs."
  );

  // 5. Multi-Table 3-Way JOIN
  await printQuery(
    pool,
    "5. THREE-TABLE JOIN: Messages + Chats + Users",
    `SELECT 
       m.id AS message_id,
       u.display_name AS system_user,
       c.chat_name,
       m.sender_name AS author,
       m.message_text,
       m.importance_score
     FROM messages m
     JOIN chats c ON m.chat_id = c.chat_id
     JOIN users u ON m.user_id = u.user_id
     WHERE m.importance_score >= 80
     ORDER BY m.importance_score DESC
     LIMIT ?;`,
    [limit],
    "Demonstrates normalized relational navigation across three related tables."
  );
}

// ==============================================================================
// ASSIGNMENT 5: SELECT QUERIES, OPERATORS & FUNCTIONS
// ==============================================================================
async function runAssignment5(pool, options = {}) {
  const limit = options.limit || 6;
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 5 — SELECT QUERIES & FUNCTIONS");
  console.log("============================================================");

  // 1. WHERE with Comparison & Logical Operators
  await printQuery(
    pool,
    "1. WHERE Clause: Comparison, Range (BETWEEN) & List (IN) Operators",
    `SELECT 
       id, sender_name, message_text, importance_score, priority, received_at
     FROM messages
     WHERE importance_score BETWEEN 50 AND 95
       AND priority IN ('normal', 'high', 'urgent')
     ORDER BY importance_score DESC
     LIMIT ?;`,
    [limit],
    "Demonstrates complex filtering logic using relational algebra selection."
  );

  // 2. Pattern Matching with LIKE
  await printQuery(
    pool,
    "2. Pattern Matching: LIKE with Wildcards (%exam%, %project%, %deadline%)",
    `SELECT 
       id, sender_name, message_text, importance_score
     FROM messages
     WHERE message_text LIKE '%exam%' 
        OR message_text LIKE '%project%' 
        OR message_text LIKE '%deadline%'
     ORDER BY importance_score DESC
     LIMIT ?;`,
    [limit],
    "Searches string values using SQL pattern matching wildcard '%'"
  );

  // 3. Aggregate Functions
  await printQuery(
    pool,
    "3. Aggregate Functions: COUNT, AVG, MAX, MIN across entire dataset",
    `SELECT 
       COUNT(*) AS total_messages,
       COUNT(DISTINCT sender_name) AS unique_senders,
       ROUND(AVG(importance_score), 2) AS avg_importance,
       MAX(importance_score) AS max_importance,
       MIN(importance_score) AS min_importance,
       ROUND(AVG(fraud_score), 2) AS avg_fraud_score
     FROM messages;`,
    [],
    "Calculates statistical summary values aggregated across 6,000+ database records."
  );

  // 4. GROUP BY and HAVING
  await printQuery(
    pool,
    "4. GROUP BY & HAVING: Senders with Message Count >= 10 and Avg Score >= 45",
    `SELECT 
       sender_name,
       COUNT(*) AS total_messages_sent,
       ROUND(AVG(importance_score), 1) AS avg_importance_score,
       MAX(importance_score) AS peak_importance
     FROM messages
     GROUP BY sender_name
     HAVING COUNT(*) >= 10 AND AVG(importance_score) >= 45
     ORDER BY total_messages_sent DESC
     LIMIT ?;`,
    [limit],
    "Groups rows by sender, then filters grouped partitions using HAVING."
  );

  // 5. Single-Row Functions
  await printQuery(
    pool,
    "5. Single-Row Functions: UPPER, LENGTH, SUBSTRING, DATE, TIME, DAYNAME",
    `SELECT 
       id,
       UPPER(sender_name) AS upper_sender,
       LENGTH(message_text) AS char_count,
       CONCAT(SUBSTRING(message_text, 1, 28), '...') AS preview,
       DATE(received_at) AS received_date,
       TIME(received_at) AS received_time,
       DAYNAME(received_at) AS weekday
     FROM messages
     ORDER BY received_at DESC
     LIMIT ?;`,
    [limit],
    "Demonstrates SQL scalar functions operating on individual column values."
  );

  // 6. Pagination with LIMIT & OFFSET
  await printQuery(
    pool,
    "6. Pagination: Page 1 (LIMIT 3 OFFSET 0) vs Page 2 (LIMIT 3 OFFSET 3)",
    `SELECT id, sender_name, message_text, received_at 
     FROM messages 
     ORDER BY received_at DESC 
     LIMIT 3 OFFSET 3;`,
    [],
    "Demonstrates database-level pagination using LIMIT and OFFSET."
  );
}

// ==============================================================================
// ASSIGNMENT 6: STORED PROCEDURES
// ==============================================================================
async function runAssignment6(pool, options = {}) {
  const limit = options.limit || 5;
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 6 — STORED PROCEDURES");
  console.log("============================================================");

  // 1. Show Procedure Definitions in MySQL Catalog
  console.log("\n1. MySQL System Catalog: Stored Procedures in 'waaa_db':");
  const [procs] = await pool.query(`
    SELECT ROUTINE_NAME, ROUTINE_TYPE, DEFINER, CREATED, SECURITY_TYPE
    FROM information_schema.ROUTINES
    WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE';
  `);
  console.table(procs);

  // Select target chat for demonstration
  const [[topChat]] = await pool.query(`
    SELECT c.chat_id, c.chat_name, COUNT(m.id) AS msg_count
    FROM chats c
    JOIN messages m ON c.chat_id = m.chat_id
    GROUP BY c.chat_id, c.chat_name
    ORDER BY msg_count DESC
    LIMIT 1;
  `);

  const targetChatId = topChat ? topChat.chat_id : "syn_chat_001@g.us";
  const targetChatName = topChat ? topChat.chat_name : "Demo Chat";

  // 2. Call Procedure 1: IN Parameters (p_chat_id, p_limit, p_offset)
  console.log(`\n------------------------------------------------------------`);
  console.log(`📌 2. CALL sp_get_chat_messages('${targetChatId}', ${limit}, 0)`);
  console.log(`💡 Concept: Procedure with IN parameters executing parameterized query`);
  console.log(`------------------------------------------------------------`);
  const [proc1Result] = await pool.query("CALL sp_get_chat_messages(?, ?, ?)", [targetChatId, limit, 0]);
  console.log(`Output for Chat: '${targetChatName}':`);
  console.table(formatTableRows(proc1Result[0]));

  // 3. Call Procedure 2: OUT Parameters (p_total, p_avg, p_high)
  console.log(`\n------------------------------------------------------------`);
  console.log(`📌 3. CALL sp_get_chat_stats('${targetChatId}', @total, @avg, @high)`);
  console.log(`💡 Concept: Procedure with OUT parameters populating MySQL session variables`);
  console.log(`------------------------------------------------------------`);
  await pool.query("CALL sp_get_chat_stats(?, @total, @avg, @high)", [targetChatId]);
  const [[sessionVars]] = await pool.query(`
    SELECT 
      ? AS chat_id,
      ? AS chat_name,
      @total AS total_messages, 
      @avg AS avg_importance, 
      @high AS high_priority_count;
  `, [targetChatId, targetChatName]);
  console.log("Retrieved Session Variables from Procedure OUT params:");
  console.table([sessionVars]);

  // 4. Call Procedure 3: Full-Text Search Procedure
  console.log(`\n------------------------------------------------------------`);
  console.log(`📌 4. CALL sp_search_messages('project', 50, 4)`);
  console.log(`💡 Concept: Search procedure encapsulating LIKE matching and threshold filtering`);
  console.log(`------------------------------------------------------------`);
  const [proc3Result] = await pool.query("CALL sp_search_messages(?, ?, ?)", ["project", 50, 4]);
  console.log("Search Results:");
  console.table(formatTableRows(proc3Result[0]));
}

// ==============================================================================
// ASSIGNMENT 7: DATABASE TRIGGERS
// ==============================================================================
async function runAssignment7(pool, options = {}) {
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 7 — DATABASE TRIGGERS");
  console.log("============================================================");

  // 1. Inspect MySQL Triggers Catalog
  console.log("\n1. MySQL System Catalog: Triggers Registered in 'waaa_db':");
  const [triggers] = await pool.query(`
    SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING
    FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE();
  `);
  console.table(triggers);

  const testRecordId = "trg_live_demo_msg";
  const [[sampleChat]] = await pool.query("SELECT chat_id FROM chats LIMIT 1");
  const sampleChatId = sampleChat ? sampleChat.chat_id : "syn_chat_001@g.us";

  // Clean up any stale records from previous runs
  await pool.query("DELETE FROM messages WHERE id = ?", [testRecordId]);
  await pool.query("DELETE FROM audit_logs WHERE record_id = ?", [testRecordId]);

  // Initial audit count
  const [[{ countBefore }]] = await pool.query("SELECT COUNT(*) AS countBefore FROM audit_logs");
  console.log(`\nInitial audit_logs row count: ${countBefore}`);

  // 2. Trigger Event: INSERT
  console.log("\n------------------------------------------------------------");
  console.log(`📌 2. TRIGGER EVENT: INSERT INTO messages (Fires 'trg_after_message_insert')`);
  console.log(`------------------------------------------------------------`);
  console.log(`Executing INSERT statement for record '${testRecordId}'...`);
  await pool.query(`
    INSERT INTO messages (id, user_id, chat_id, sender_name, message_text, importance_score, priority, is_synthetic)
    VALUES (?, 'default_user', ?, 'Trigger Test User', 'Demonstration message for database trigger viva', 92, 'urgent', 1);
  `, [testRecordId, sampleChatId]);

  // 3. Verify Trigger Fired (INSERT)
  console.log("\n------------------------------------------------------------");
  console.log(`📌 3. TRIGGER VERIFICATION: Inspecting 'audit_logs'`);
  console.log(`💡 Concept: Proves MySQL automatically executed the trigger logic on INSERT`);
  console.log(`------------------------------------------------------------`);
  const [insertAudit] = await pool.query(`
    SELECT log_id, action_type, table_name, record_id, details, new_values, created_at
    FROM audit_logs
    WHERE record_id = ? AND action_type = 'INSERT';
  `, [testRecordId]);
  console.table(formatTableRows(insertAudit));

  // 4. Trigger Event: DELETE
  console.log("\n------------------------------------------------------------");
  console.log(`📌 4. TRIGGER EVENT: DELETE FROM messages (Fires 'trg_before_message_delete')`);
  console.log(`------------------------------------------------------------`);
  console.log(`Executing DELETE statement for record '${testRecordId}'...`);
  await pool.query("DELETE FROM messages WHERE id = ?", [testRecordId]);

  // 5. Verify Delete Trigger Fired
  console.log("\n------------------------------------------------------------");
  console.log(`📌 5. TRIGGER VERIFICATION: Inspecting 'audit_logs' for DELETE event`);
  console.log(`------------------------------------------------------------`);
  const [deleteAudit] = await pool.query(`
    SELECT log_id, action_type, table_name, record_id, details, old_values, created_at
    FROM audit_logs
    WHERE record_id = ? AND action_type = 'DELETE';
  `, [testRecordId]);
  console.table(formatTableRows(deleteAudit));

  // 6. Complete Audit Trail for Record
  console.log("\nComplete Lifecycle Audit Trail for the Test Record:");
  const [fullTrail] = await pool.query(`
    SELECT log_id, action_type, table_name, record_id, details, created_at
    FROM audit_logs
    WHERE record_id = ?
    ORDER BY log_id ASC;
  `, [testRecordId]);
  console.table(formatTableRows(fullTrail));

  // Clean up audit entry
  await pool.query("DELETE FROM audit_logs WHERE record_id = ?", [testRecordId]);
  console.log("✅ Trigger demonstration completed successfully.");
}

// ==============================================================================
// INTERACTIVE TABLE EXPLORER CLI
// ==============================================================================
async function runTableExplorer(tableName, options = {}) {
  console.log("\n============================================================");
  console.log(`🔍 INTERACTIVE TABLE EXPLORER: [${tableName}]`);
  console.log("============================================================");

  try {
    const result = await queryTable({
      table: tableName,
      cols: options.cols,
      limit: options.limit,
      offset: options.offset,
      sort: options.sort,
      filter: options.filter,
      search: options.search,
    });

    console.log(`Table:            ${result.table}`);
    console.log(`Total in DB:      ${result.totalCount} matching records`);
    console.log(`Displaying:       ${result.returnedCount} rows (Limit: ${result.limit}, Offset: ${result.offset})`);
    console.log(`Execution Time:   ${result.executionTimeMs} ms`);
    console.log(`Executed SQL:     ${result.sql}`);
    console.log("------------------------------------------------------------");

    if (result.rows.length > 0) {
      console.table(formatTableRows(result.rows));
    } else {
      console.log("(No records match the given criteria)");
    }
  } catch (err) {
    console.error(`❌ Table exploration error: ${err.message}`);
  }
}

// ==============================================================================
// SCHEMA INSPECTOR CLI
// ==============================================================================
async function runSchemaInspector(tableName = null) {
  if (!tableName) {
    console.log("\n============================================================");
    console.log("📋 DATABASE TABLES & VIEWS OVERVIEW (waaa_db)");
    console.log("============================================================");
    const tables = await getAllTables();
    console.table(tables);
    console.log("\nTip: Run 'npm run demo schema <tableName>' for column-level details.");
    return;
  }

  console.log("\n============================================================");
  console.log(`📋 SCHEMA INSPECTOR: [${tableName}]`);
  console.log("============================================================");

  try {
    const schema = await getTableSchema(tableName);
    console.log(`Table Name:  ${schema.tableName}`);
    console.log(`Table Type:  ${schema.tableType}`);
    console.log(`Total Rows:  ${schema.rowCount}`);

    console.log("\nColumns:");
    console.table(schema.columns);

    if (schema.foreignKeys && schema.foreignKeys.length > 0) {
      console.log("\nForeign Key Constraints:");
      console.table(schema.foreignKeys);
    } else {
      console.log("\nForeign Key Constraints: None defined on this table.");
    }

    if (schema.indexes && schema.indexes.length > 0) {
      console.log("\nIndexes:");
      console.table(schema.indexes.map((idx) => ({
        name: idx.name,
        unique: idx.unique ? "YES" : "NO",
        columns: idx.columns.join(", "),
      })));
    }
  } catch (err) {
    console.error(`❌ Schema inspection error: ${err.message}`);
  }
}

// ==============================================================================
// DATABASE STATISTICS OVERVIEW
// ==============================================================================
async function runStatsOverview() {
  console.log("\n============================================================");
  console.log("📊 WAAA DATABASE STATISTICS & HEALTH OVERVIEW");
  console.log("============================================================");

  const stats = await getDatabaseStats();
  console.log(`Database Name:          ${stats.databaseName}`);
  console.log(`Base Tables:            ${stats.baseTables}`);
  console.log(`Views:                  ${stats.views}`);
  console.log(`Stored Procedures:      ${stats.procedures}`);
  console.log(`Database Triggers:      ${stats.triggers}`);
  console.log("------------------------------------------------------------");
  console.log(`Total Messages:         ${stats.messages.total}`);
  console.log(`  - Real WhatsApp Data: ${stats.messages.real} (${((stats.messages.real / (stats.messages.total || 1)) * 100).toFixed(1)}%)`);
  console.log(`  - Synthetic Demo Data:${stats.messages.synthetic} (${((stats.messages.synthetic / (stats.messages.total || 1)) * 100).toFixed(1)}%)`);
  console.log(`  - Avg Importance:     ${stats.messages.avgImportance} / 100`);
  console.log(`  - High Priority:      ${stats.messages.highImportance} messages`);
  console.log("------------------------------------------------------------");
  console.log(`Total Chats:            ${stats.chats.total}`);
  console.log(`  - Real Chats:         ${stats.chats.real}`);
  console.log(`  - Synthetic Chats:    ${stats.chats.synthetic}`);
  console.log(`Total Users:            ${stats.users}`);
  console.log(`Total Tasks:            ${stats.tasks}`);
  console.log(`Audit Log Entries:      ${stats.auditLogs}`);
  console.log("============================================================\n");
}

// ==============================================================================
// CLI HELP & USAGE
// ==============================================================================
function printHelp() {
  console.log(`
==============================================================================
🚀 WAAA WHATSAPP AI ASSISTANT — DBMS ASSIGNMENT DEMO RUNNER
==============================================================================

ASSIGNMENT DEMONSTRATIONS:
  npm run demo 1          Assignment 1: DDL, DML, Primary Key & Foreign Key Constraints
  npm run demo 2          Assignment 2: Database Views (Creation, Multi-table, Dynamic)
  npm run demo 3          Assignment 3: SQL Joins (INNER, LEFT, RIGHT, SELF JOIN)
  npm run demo 5          Assignment 5: SELECT Queries, Operators & Aggregate Functions
  npm run demo 6          Assignment 6: Stored Procedures (IN/OUT parameters, Search)
  npm run demo 7          Assignment 7: Database Triggers & Automated Audit Logging
  npm run demo all        Run all 6 DBMS assignments end-to-end sequentially

INTERACTIVE TABLE EXPLORATION:
  npm run demo table <name> [options]
    --cols <c1,c2>        Select specific columns (e.g. --cols id,sender_name,message_text)
    --limit <N>           Rows to display (default: 20)
    --offset <N>          Starting row offset (default: 0)
    --sort "<col> <DIR>"  Sort by column (e.g. --sort "importance_score DESC")
    --filter "<WHERE>"    SQL filter condition (e.g. --filter "importance_score >= 70")
    --search "<term>"     Search text across all varchar/text columns

SCHEMA INSPECTION & UTILITIES:
  npm run demo schema           List all 21 tables & views in waaa_db with row counts
  npm run demo schema <table >  Deep inspect column types, keys, foreign keys & indexes
  npm run demo stats            Display database statistics (real vs synthetic breakdown)
  npm run demo seed             Scale synthetic dataset deterministically (--messages 5000)
  npm run demo setup            Ensure views, stored procedures & triggers are created
  npm run demo help             Display this command reference guide
==============================================================================
`);
}

// ==============================================================================
// MAIN CLI ENTRYPOINT
// ==============================================================================
async function main() {
  const args = process.argv.slice(2);
  const command = (args[0] || "help").toLowerCase();

  // Parse command-line flags (--limit 20, --cols id,text, etc.)
  const options = {};
  for (let i = 1; i < args.length; i++) {
    const key = args[i];
    if (key === "--limit" || key === "--rows") options.limit = Number(args[++i]);
    else if (key === "--offset") options.offset = Number(args[++i]);
    else if (key === "--cols" || key === "--columns") options.cols = args[++i];
    else if (key === "--sort" || key === "--order") options.sort = args[++i];
    else if (key === "--filter" || key === "--where") options.filter = args[++i];
    else if (key === "--search" || key === "-s") options.search = args[++i];
    else if (key === "--messages" || key === "--count") options.messages = Number(args[++i]);
    else if (key === "--chats") options.chats = Number(args[++i]);
    else if (key === "--seed") options.seed = Number(args[++i]);
    else if (!options.targetName && !key.startsWith("--")) options.targetName = key;
  }

  // Ensure MySQL daemon is running before proceeding
  await ensureMysqlRunning();
  const pool = getPool();

  try {
    switch (command) {
      case "1":
        await runAssignment1(pool, options);
        break;
      case "2":
        await runAssignment2(pool, options);
        break;
      case "3":
        await runAssignment3(pool, options);
        break;
      case "5":
        await runAssignment5(pool, options);
        break;
      case "6":
        await runAssignment6(pool, options);
        break;
      case "7":
        await runAssignment7(pool, options);
        break;
      case "all":
        await runAssignment1(pool, options);
        await runAssignment2(pool, options);
        await runAssignment3(pool, options);
        await runAssignment5(pool, options);
        await runAssignment6(pool, options);
        await runAssignment7(pool, options);
        console.log("\n============================================================");
        console.log("🎉 ALL 6 DBMS ASSIGNMENTS DEMONSTRATED SUCCESSFULLY ON MYSQL!");
        console.log("============================================================\n");
        break;
      case "table": {
        const table = options.targetName || args[1] || "messages";
        await runTableExplorer(table, options);
        break;
      }
      case "schema": {
        const table = options.targetName || args[1] || null;
        await runSchemaInspector(table);
        break;
      }
      case "stats":
        await runStatsOverview();
        break;
      case "seed":
        await seedLargeDataset(options);
        break;
      case "setup":
        await setupMysqlRoutines();
        break;
      case "help":
      case "--help":
      case "-h":
      default:
        printHelp();
        break;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Demonstration Runner Error:", err.message);
  process.exit(1);
});
