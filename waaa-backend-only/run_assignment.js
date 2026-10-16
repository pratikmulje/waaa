/*
==============================================================================
WAAA - DBMS Assignment Presentation Runner
==============================================================================
Simple, powerful, zero-setup interactive SQL runner for presentation day.
Usage:
  node run_assignment.js 1   -> DDL, DML, Primary & Foreign Keys
  node run_assignment.js 2   -> Views (Creation & Querying)
  node run_assignment.js 3   -> SQL Joins (Inner, Left, Equi-join)
  node run_assignment.js 5   -> SELECT Queries, Aggregation (COUNT, AVG, GROUP BY)
  node run_assignment.js 6   -> Stored Procedures
  node run_assignment.js 7   -> Triggers & Audit Logging
  node run_assignment.js all -> Run all 6 assignments end-to-end
==============================================================================
*/

import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";

// Initialize in-memory SQL database
async function createDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return db;
}

// Helper to format query results as a clean table
function printQuery(db, title, sql) {
  console.log(`\n============================================================`);
  console.log(`📌 ${title}`);
  console.log(`------------------------------------------------------------`);
  console.log(`SQL Command:`);
  console.log(sql.trim());
  console.log(`------------------------------------------------------------`);

  try {
    const results = db.exec(sql);
    if (!results || results.length === 0) {
      console.log("Result: Query executed successfully (0 rows returned or DDL statement).\n");
      return;
    }

    const { columns, values } = results[0];
    const tableData = values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        // truncate long text for clean terminal viewing
        let val = row[idx];
        if (typeof val === "string" && val.length > 35) {
          val = val.slice(0, 32) + "...";
        }
        obj[col] = val ?? "NULL";
      });
      return obj;
    });

    console.log("Output Table:");
    console.table(tableData);
  } catch (err) {
    console.error("Execution error:", err.message);
  }
}

// ── SETUP BASE TABLES & SEED DATA ─────────────────────────────────────────────
function setupBaseSchema(db) {
  // 1. Chats table
  db.run(`
    CREATE TABLE chats (
      chat_id TEXT PRIMARY KEY,
      chat_name TEXT NOT NULL,
      chat_type TEXT NOT NULL DEFAULT 'personal',
      tier TEXT NOT NULL DEFAULT 'normal'
    );
  `);

  // 2. Messages table with Foreign Key to chats
  db.run(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      importance_score INTEGER NOT NULL DEFAULT 0,
      fraud_score INTEGER NOT NULL DEFAULT 0,
      received_at TEXT NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
    );
  `);

  // 3. Tasks table
  db.run(`
    CREATE TABLE tasks (
      task_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      task_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT,
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
    );
  `);

  // 4. Audit logs for Triggers
  db.run(`
    CREATE TABLE audit_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Load real data directly from WAAA JSON (your actual WhatsApp chats and messages)
  try {
    const convPath = path.resolve("data/conversations.json");
    const msgPath = path.resolve("data/messages.json");

    if (fs.existsSync(convPath) && fs.existsSync(msgPath)) {
      const convs = JSON.parse(fs.readFileSync(convPath, "utf8"));
      const allMsgs = JSON.parse(fs.readFileSync(msgPath, "utf8"));
      // Take the latest 30 messages in descending order (newest first)
      const msgs = allMsgs.slice(-30).reverse();

      // Insert all chats so any message's chat_id is valid
      const insertedChatIds = new Set();
      convs.forEach((c) => {
        if (!c.id || insertedChatIds.has(c.id)) return;
        insertedChatIds.add(c.id);
        db.run("INSERT INTO chats VALUES (?, ?, ?, ?)", [
          c.id,
          c.chatName || "Chat",
          c.chatType || "personal",
          c.priority ? "starred" : "normal",
        ]);
      });

      // Insert real messages with real text, sender, date, and importance
      msgs.forEach((m) => {
        if (!insertedChatIds.has(m.chatId)) {
          insertedChatIds.add(m.chatId);
          db.run("INSERT INTO chats VALUES (?, ?, ?, ?)", [
            m.chatId,
            m.chatName || "WhatsApp Chat",
            m.chatType || "personal",
            "normal",
          ]);
        }

        const impScore = Number(m.importanceAnalysis?.finalScore ?? (m.importanceAnalysis?.ruleScore ?? 50));
        const fraudScore = Number(m.fraudAnalysis?.finalScore ?? 0);
        const cleanDate = (m.receivedAt || new Date().toISOString()).slice(0, 19).replace("T", " ");

        db.run("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)", [
          m.id,
          m.chatId,
          m.sender || m.chatName || "User",
          m.text || "(Media / Attachment)",
          impScore,
          fraudScore,
          cleanDate,
        ]);
      });

      // Sample task
      db.run("INSERT INTO tasks VALUES (?, ?, ?, ?, ?)", [
        "task_1",
        convs[0]?.id || "chat_1",
        "Submit Hackathon registration by Friday",
        "pending",
        "2026-10-20",
      ]);
      db.run("INSERT INTO tasks VALUES (?, ?, ?, ?, ?)", [
        "task_2",
        convs[0]?.id || "chat_1",
        "Review project architecture document",
        "completed",
        "2026-10-18",
      ]);
      return;
    }
  } catch {}

  // Fallback sample data
  db.run("INSERT INTO chats VALUES ('chat_1', 'Jayram (Colleague)', 'personal', 'important');");
  db.run("INSERT INTO chats VALUES ('chat_2', 'Project Team Alpha', 'group', 'starred');");
  db.run("INSERT INTO chats VALUES ('chat_3', 'Marketing Updates', 'broadcast', 'low');");

  db.run("INSERT INTO messages VALUES ('m_101', 'chat_1', 'Jayram', 'Please send the API keys by 5 PM', 85, 0, '2026-10-16 10:00');");
  db.run("INSERT INTO messages VALUES ('m_102', 'chat_1', 'Jayram', 'Meeting moved to 6 PM', 75, 0, '2026-10-16 11:30');");
  db.run("INSERT INTO messages VALUES ('m_103', 'chat_2', 'Alex', 'Backend server build succeeded', 90, 0, '2026-10-16 12:15');");
  db.run("INSERT INTO messages VALUES ('m_104', 'chat_2', 'Sam', 'Who is testing the WhatsApp bot?', 70, 0, '2026-10-16 13:00');");
  db.run("INSERT INTO messages VALUES ('m_105', 'chat_3', 'Spammer', 'Click here to claim free lottery prize', 10, 95, '2026-10-16 14:00');");

  db.run("INSERT INTO tasks VALUES ('task_1', 'chat_1', 'Send API keys to Jayram', 'pending', '2026-10-16 17:00');");
  db.run("INSERT INTO tasks VALUES ('task_2', 'chat_2', 'Test WhatsApp bot deployment', 'in_progress', '2026-10-17 12:00');");
}

// ── ASSIGNMENT 1: DDL, DML & CONSTRAINTS ──────────────────────────────────────
function runAssignment1(db) {
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 1 — DDL, DML, PRIMARY & FOREIGN KEYS");
  console.log("============================================================");

  printQuery(
    db,
    "1. DDL: Show existing tables and their columns",
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('chats', 'messages');"
  );

  printQuery(
    db,
    "2. DML: Display records from parent table 'chats' (Primary Key: chat_id)",
    "SELECT chat_id, chat_name, chat_type, tier FROM chats LIMIT 5;"
  );

  printQuery(
    db,
    "3. DML: Display real WhatsApp messages (Foreign Key: chat_id)",
    "SELECT id, chat_id, sender, text, importance_score, received_at FROM messages LIMIT 5;"
  );

  printQuery(
    db,
    "4. DML INSERT: Add a new message linked to 'chats'",
    `INSERT INTO messages VALUES ('m_new_live', (SELECT chat_id FROM chats LIMIT 1), 'Jayram', 'Live presentation test message', 85, 0, '2026-10-16 18:00');
     SELECT * FROM messages WHERE id = 'm_new_live';`
  );

  printQuery(
    db,
    "5. DML UPDATE: Update status of task",
    `UPDATE tasks SET status = 'completed' WHERE task_id = 'task_1';
     SELECT * FROM tasks WHERE task_id = 'task_1';`
  );
}

// ── ASSIGNMENT 2: VIEWS ───────────────────────────────────────────────────────
function runAssignment2(db) {
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 2 — DATABASE VIEWS");
  console.log("============================================================");

  printQuery(
    db,
    "1. CREATE VIEW: Create a View for Important Messages",
    `CREATE VIEW IF NOT EXISTS v_important_messages AS
     SELECT id, sender, text, importance_score, received_at
     FROM messages
     WHERE importance_score >= 50;`
  );

  printQuery(
    db,
    "2. SELECT FROM VIEW: Query the newly created View",
    "SELECT * FROM v_important_messages LIMIT 5;"
  );

  printQuery(
    db,
    "3. CREATE VIEW: Create a View joining Chats and Pending Tasks",
    `CREATE VIEW IF NOT EXISTS v_pending_tasks AS
     SELECT t.task_id, c.chat_name, t.task_text, t.status, t.due_date
     FROM tasks t
     JOIN chats c ON t.chat_id = c.chat_id
     WHERE t.status != 'completed';`
  );

  printQuery(
    db,
    "4. SELECT FROM VIEW: Query 'v_pending_tasks'",
    "SELECT * FROM v_pending_tasks;"
  );
}

// ── ASSIGNMENT 3: SQL JOINS ───────────────────────────────────────────────────
function runAssignment3(db) {
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 3 — SQL JOINS");
  console.log("============================================================");

  printQuery(
    db,
    "1. INNER JOIN / EQUI-JOIN: Join messages with chats on chat_id",
    `SELECT m.id AS msg_id, c.chat_name, c.chat_type, m.sender, m.text, m.received_at
     FROM messages m
     INNER JOIN chats c ON m.chat_id = c.chat_id
     LIMIT 5;`
  );

  printQuery(
    db,
    "2. LEFT OUTER JOIN: All chats, showing associated tasks if any",
    `SELECT c.chat_id, c.chat_name, c.tier, t.task_text, t.status
     FROM chats c
     LEFT JOIN tasks t ON c.chat_id = t.chat_id
     LIMIT 5;`
  );

  printQuery(
    db,
    "3. SELF JOIN: Comparing messages within the same chat to find consecutive messages",
    `SELECT m1.sender, m1.text AS first_msg, m2.text AS second_msg
     FROM messages m1
     JOIN messages m2 ON m1.chat_id = m2.chat_id AND m1.id != m2.id
     LIMIT 3;`
  );
}

// ── ASSIGNMENT 5: SELECT QUERIES & FUNCTIONS ──────────────────────────────────
function runAssignment5(db) {
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 5 — SELECT QUERIES & FUNCTIONS");
  console.log("============================================================");

  printQuery(
    db,
    "1. WHERE Clause: Filter messages by importance or length",
    `SELECT id, sender, text, importance_score, received_at
     FROM messages
     WHERE LENGTH(text) > 3 OR importance_score >= 50
     LIMIT 5;`
  );

  printQuery(
    db,
    "2. Aggregate Functions: COUNT, AVG, MAX, MIN",
    `SELECT 
       COUNT(*) AS total_messages,
       ROUND(AVG(importance_score), 1) AS avg_importance,
       MAX(importance_score) AS max_importance,
       MIN(importance_score) AS min_importance
     FROM messages;`
  );

  printQuery(
    db,
    "3. GROUP BY and HAVING: Message statistics grouped by sender",
    `SELECT sender, COUNT(*) AS msg_count, ROUND(AVG(importance_score), 1) AS avg_score
     FROM messages
     GROUP BY sender
     ORDER BY msg_count DESC
     LIMIT 5;`
  );

  printQuery(
    db,
    "4. Single-Row Functions: UPPER, LENGTH, SUBSTR",
    `SELECT 
       id,
       UPPER(sender) AS upper_sender,
       LENGTH(text) AS text_length,
       SUBSTR(text, 1, 15) AS preview
     FROM messages
     LIMIT 4;`
  );
}

// ── ASSIGNMENT 6: STORED PROCEDURES / FUNCTIONS ───────────────────────────────
function runAssignment6(db) {
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 6 — STORED PROCEDURES");
  console.log("============================================================");

  console.log(`
ℹ️ EXPLANATION FOR PROFESSOR:
In MySQL, Stored Procedures are created with:
  DELIMITER //
  CREATE PROCEDURE sp_get_chat_messages(IN p_chat_id VARCHAR(128))
  BEGIN
    SELECT id, sender, text, importance_score, received_at
    FROM messages
    WHERE chat_id = p_chat_id;
  END //
  DELIMITER ;

  CALL sp_get_chat_messages('chat_1');
`);

  // Demonstration executing the procedure logic
  const sampleChat = db.exec(`
    SELECT c.chat_id, c.chat_name 
    FROM messages m 
    JOIN chats c ON m.chat_id = c.chat_id 
    GROUP BY c.chat_id 
    ORDER BY COUNT(*) DESC 
    LIMIT 1;
  `)[0].values[0];
  const targetChatId = sampleChat[0];
  const targetChatName = sampleChat[1];

  printQuery(
    db,
    `Executing Procedure 'sp_get_chat_messages' for: ${targetChatName} (${targetChatId})`,
    `SELECT id AS msg_id, sender, text, importance_score, received_at
     FROM messages
     WHERE chat_id = '${targetChatId}';`
  );
}

// ── ASSIGNMENT 7: DATABASE TRIGGERS ───────────────────────────────────────────
function runAssignment7(db) {
  console.log("\n============================================================");
  console.log("🎯 DEMO: DBMS ASSIGNMENT 7 — DATABASE TRIGGERS");
  console.log("============================================================");

  printQuery(
    db,
    "1. CREATE TRIGGER: Trigger automatically fires AFTER INSERT on messages to log an audit record",
    `CREATE TRIGGER IF NOT EXISTS trg_after_message_insert
     AFTER INSERT ON messages
     BEGIN
       INSERT INTO audit_logs (action, table_name, record_id, created_at)
       VALUES ('INSERT', 'messages', NEW.id, datetime('now'));
     END;`
  );

  printQuery(
    db,
    "2. TRIGGER EVENT: Insert a new message into 'messages' table",
    `INSERT INTO messages VALUES ('m_trg_test', (SELECT chat_id FROM chats LIMIT 1), 'Alex', 'Trigger verification test message', 70, 0, datetime('now'));
     SELECT id, sender, text FROM messages WHERE id = 'm_trg_test';`
  );

  printQuery(
    db,
    "3. TRIGGER VERIFICATION: View 'audit_logs' table (Proves the trigger fired automatically!)",
    "SELECT * FROM audit_logs ORDER BY log_id DESC LIMIT 5;"
  );
}

// ── MAIN CLI ROUTER ───────────────────────────────────────────────────────────
async function main() {
  const arg = (process.argv[2] || "all").toLowerCase();

  console.log("\n============================================================");
  console.log("🚀 WAAA WHATSAPP ASSISTANT — DBMS ASSIGNMENTS DEMONSTRATION");
  console.log("============================================================");

  const db = await createDatabase();
  setupBaseSchema(db);

  if (arg === "1") {
    runAssignment1(db);
  } else if (arg === "2") {
    runAssignment2(db);
  } else if (arg === "3") {
    runAssignment3(db);
  } else if (arg === "5") {
    runAssignment5(db);
  } else if (arg === "6") {
    runAssignment6(db);
  } else if (arg === "7") {
    runAssignment7(db);
  } else if (arg === "all") {
    runAssignment1(db);
    runAssignment2(db);
    runAssignment3(db);
    runAssignment5(db);
    runAssignment6(db);
    runAssignment7(db);
  } else {
    console.log(`
Usage:
  node run_assignment.js 1   -> Assignment 1: DDL, DML & Constraints
  node run_assignment.js 2   -> Assignment 2: Views
  node run_assignment.js 3   -> Assignment 3: Joins
  node run_assignment.js 5   -> Assignment 5: Select & Functions
  node run_assignment.js 6   -> Assignment 6: Stored Procedures
  node run_assignment.js 7   -> Assignment 7: Triggers
  node run_assignment.js all -> Run all assignments sequentially
`);
  }

  console.log("\n============================================================");
  console.log("✅ Demonstration finished. Ready for presentation!");
  console.log("============================================================\n");
}

main().catch(console.error);
