/*
==============================================================================
WAAA - Large Deterministic Dataset Generator & Seeder
==============================================================================
Generates a realistic, large-scale dataset for WAAA DBMS Demonstrations:
  - Preserves all real imported WhatsApp chats & messages (is_synthetic = 0)
  - Adds realistic synthetic records (is_synthetic = 1) up to configurable count
  - Deterministic PRNG ensures identical data generation on repeated runs
  - Idempotent: safe to re-run without creating duplicate records
  - Generates varied importance scores, fraud scores, dates, and chat relations
==============================================================================
*/

import "dotenv/config";
import mysql from "mysql2/promise";
import { getPoolConfig } from "../../src/db/mysqlClient.js";

// Deterministic Mulberry32 PRNG
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Realistic Synthetic Entities
const SYNTHETIC_SENDERS = [
  { name: "Dr. Ramesh Kulkarni", role: "Faculty Mentor" },
  { name: "Prof. Sunita Deshmukh", role: "HOD CSE-AIML" },
  { name: "Aarav Sharma", role: "Team Lead" },
  { name: "Ananya Patil", role: "Database Designer" },
  { name: "Rohan Joshi", role: "Backend Developer" },
  { name: "Neha Verma", role: "Frontend Developer" },
  { name: "Siddharth More", role: "ML Engineer" },
  { name: "Pooja Kadam", role: "QA Engineer" },
  { name: "Aditya Shinde", role: "DevOps Engineer" },
  { name: "Sneha Iyer", role: "Student Member" },
  { name: "Karan Malhotra", role: "Student Member" },
  { name: "Ritu Nair", role: "Documentation Lead" },
  { name: "Vikram Rathore", role: "Security Auditor" },
  { name: "Priya Bhatt", role: "UI Designer" },
  { name: "Mayur Pawar", role: "Lab Coordinator" },
  { name: "Swati Sawant", role: "Exam Cell Officer" },
];

const SYNTHETIC_CHATS = [
  { name: "DBMS Mini Project & Viva Prep", type: "group", tier: "starred" },
  { name: "SE B.Tech AIML - Official", type: "group", tier: "important" },
  { name: "Smart India Hackathon 2026", type: "group", tier: "starred" },
  { name: "Final Year Capstone Project", type: "group", tier: "important" },
  { name: "Campus Placement Cell - 2026", type: "broadcast", tier: "important" },
  { name: "Algorithm Design & Analysis", type: "group", tier: "normal" },
  { name: "Operating Systems Lab Batch B", type: "group", tier: "normal" },
  { name: "College Sports & Cultural Committee", type: "group", tier: "low" },
  { name: "AI Research & Paper Study Group", type: "group", tier: "normal" },
  { name: "Web Development Team WAAA", type: "group", tier: "starred" },
  { name: "Cloud Infrastructure & DevOps", type: "group", tier: "normal" },
  { name: "Project Mentors & Review Guides", type: "group", tier: "important" },
  { name: "Examination & Timetable Notices", type: "broadcast", tier: "important" },
  { name: "Student Council VIT 2026", type: "group", tier: "normal" },
  { name: "Competitive Coding Practice", type: "group", tier: "normal" },
  { name: "Library & Digital Resources", type: "broadcast", tier: "low" },
  { name: "Aarav Sharma (Direct)", type: "personal", tier: "normal" },
  { name: "Dr. Ramesh Kulkarni (Direct)", type: "personal", tier: "important" },
  { name: "Ananya Patil (Direct)", type: "personal", tier: "normal" },
  { name: "Prof. Sunita Deshmukh (Direct)", type: "personal", tier: "important" },
];

const MESSAGE_TEMPLATES = {
  highImportance: [
    "Submission deadline for DBMS mini project report is Friday 5 PM on Google Classroom.",
    "Final year project viva schedule has been declared: Batch A starts 9:30 AM in Lab 3.",
    "Urgent: Complete your exam registration form verification at Student Section today.",
    "Hackathon Round 2 shortlist is out! Our team has been selected for the offline round.",
    "Please submit your signed IEEE paper copyright form before midnight.",
    "Campus placement drive by Tata Consultancy Services: Reporting time 8:30 AM in Auditorium.",
    "Emergency server restart scheduled at 11 PM tonight. Save all ongoing transactions.",
    "Mid-semester examination timetable has been updated on the college ERP portal.",
    "Internal assessment test marks uploaded on portal. Check for any discrepancy before Monday.",
    "Project review committee meeting link: https://meet.google.com/waaa-dbms-review",
    "Please review the database schema migration script before pushing to the production branch.",
    "System security audit identified an exposed port. Firewall rule update required immediately.",
  ],
  normalImportance: [
    "Has anyone solved question 4 of DBMS Assignment on Views and Triggers?",
    "Sharing the lecture slides and notes for Chapter 5 Relational Algebra and Normalization.",
    "Can someone share the GitHub repository link for the backend service?",
    "Let us meet near the library after the 2 PM lab session to discuss the project architecture.",
    "Please review the pull request for the authentication service when you are free.",
    "Which library are we using for database migrations: Prisma or Knex or MySQL2?",
    "Attendance for today's AI/ML lecture has been posted on the department board.",
    "Reminder: Tomorrow's lecture will be held in Classroom 402 instead of 401.",
    "Don't forget to push your code branches to origin before the team demo tomorrow.",
    "Can you send the sample dataset CSV for testing the aggregate queries?",
    "Has the professor approved the ER diagram and 3NF normalization document?",
    "All test cases in the test suite are passing cleanly on the local build.",
  ],
  lowImportance: [
    "Hello everyone, good morning!",
    "Okay understood, thanks for the update.",
    "Thanks for sharing!",
    "Great job team!",
    "Will join in 5 minutes.",
    "Yes, sounds good to me.",
    "Cool, see you all tomorrow.",
    "Haha true!",
    "Noted, thank you.",
    "Let's check during the lunch break.",
    "Sounds great!",
    "Received, will review soon.",
  ],
  fraudSpam: [
    "Dear customer, your bank account will be blocked within 24 hours. Click here to verify OTP immediately: http://bit.ly/bank-verify",
    "Congratulations! You have won a cash prize of Rs 50,000 in the campus survey lucky draw. Send details to claim.",
    "Work from home part-time opportunity: Earn Rs 3000 daily by liking YouTube videos. Contact on WhatsApp now.",
    "Urgent loan approved without collateral! Call back within 1 hour to disburse the amount.",
    "Your package could not be delivered due to incorrect address. Pay Rs 25 redelivery fee here: http://bit.ly/courier-pay",
  ],
};

/**
 * Seeds synthetic chats, messages, and tasks deterministically.
 * @param {object} options
 * @param {number} options.targetMessages - Total synthetic messages to ensure in DB
 * @param {number} options.targetChats - Total synthetic chats to create
 * @param {number} options.seed - PRNG seed for deterministic output
 */
export async function seedLargeDataset(options = {}) {
  const targetMessages = Number(options.messages || options.targetMessages || 5000);
  const targetChats = Number(options.chats || options.targetChats || 20);
  const prngSeed = Number(options.seed || 42);

  console.log("==================================================");
  console.log("🌱 WAAA DETERMINISTIC LARGE DATASET SEEDER");
  console.log("==================================================");
  console.log(`Target Synthetic Messages: ${targetMessages}`);
  console.log(`Target Synthetic Chats:    ${targetChats}`);
  console.log(`Deterministic Seed:        ${prngSeed}`);

  const rand = mulberry32(prngSeed);
  const pool = mysql.createPool(getPoolConfig());

  try {
    // 1. Ensure tables exist
    console.log("\n📦 Step 1: Checking and preparing tables...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(64) PRIMARY KEY,
        display_name VARCHAR(128) NOT NULL,
        phone_number VARCHAR(32) NULL,
        role ENUM('admin', 'user', 'viewer') NOT NULL DEFAULT 'user',
        is_synthetic TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        chat_id VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        chat_name VARCHAR(255) NOT NULL,
        chat_type ENUM('personal', 'group', 'broadcast', 'community') NOT NULL DEFAULT 'personal',
        tier ENUM('starred', 'important', 'normal', 'low', 'ignored') NOT NULL DEFAULT 'normal',
        participant_count INT NULL,
        is_community BOOLEAN NOT NULL DEFAULT FALSE,
        is_synthetic TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_chats_tier (tier),
        INDEX idx_chats_synthetic (is_synthetic)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        chat_id VARCHAR(128) NOT NULL,
        whatsapp_message_id VARCHAR(128) NOT NULL,
        sender_name VARCHAR(128) NOT NULL,
        sender_jid VARCHAR(128) NOT NULL,
        is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
        message_text TEXT NOT NULL,
        importance_score INT NOT NULL DEFAULT 0,
        priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
        fraud_score INT NOT NULL DEFAULT 0,
        fraud_risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
        is_synthetic TINYINT(1) NOT NULL DEFAULT 0,
        received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_messages_chat (chat_id),
        INDEX idx_messages_sender (sender_name),
        INDEX idx_messages_imp (importance_score),
        INDEX idx_messages_recv (received_at),
        INDEX idx_messages_synthetic (is_synthetic)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id VARCHAR(64) PRIMARY KEY,
        chat_id VARCHAR(128) NOT NULL,
        task_text TEXT NOT NULL,
        status ENUM('pending', 'waiting', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
        due_date DATE NULL,
        is_synthetic TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tasks_chat (chat_id),
        INDEX idx_tasks_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

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

    // 2. Ensure default system user
    await pool.query(`
      INSERT INTO users (user_id, display_name, role, is_synthetic)
      VALUES ('default_user', 'WAAA System User', 'admin', 0)
      ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);
    `);

    // 3. Seed Synthetic Users
    console.log("👥 Step 2: Seeding synthetic users...");
    const userValues = SYNTHETIC_SENDERS.map((s, idx) => [
      `syn_user_${String(idx + 1).padStart(3, "0")}`,
      s.name,
      `+9198000${String(idx + 1).padStart(5, "0")}`,
      "user",
      1,
    ]);
    await pool.query(
      `INSERT INTO users (user_id, display_name, phone_number, role, is_synthetic)
       VALUES ?
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
      [userValues]
    );

    // 4. Seed Synthetic Chats
    console.log(`💬 Step 3: Seeding up to ${targetChats} synthetic chats...`);
    const numChats = Math.min(targetChats, SYNTHETIC_CHATS.length);
    const chatValues = [];
    const chatIds = [];
    for (let i = 0; i < numChats; i++) {
      const c = SYNTHETIC_CHATS[i];
      const chatId = `syn_chat_${String(i + 1).padStart(3, "0")}@g.us`;
      chatIds.push(chatId);
      chatValues.push([
        chatId,
        "default_user",
        c.name,
        c.type,
        c.tier,
        Math.floor(rand() * 45) + 5,
        false,
        1,
      ]);
    }
    await pool.query(
      `INSERT INTO chats (chat_id, user_id, chat_name, chat_type, tier, participant_count, is_community, is_synthetic)
       VALUES ?
       ON DUPLICATE KEY UPDATE chat_name = VALUES(chat_name), tier = VALUES(tier)`,
      [chatValues]
    );

    // 5. Check existing synthetic messages count
    const [[{ count: existingCount }]] = await pool.query(
      "SELECT COUNT(*) AS count FROM messages WHERE is_synthetic = 1"
    );
    console.log(`📊 Current synthetic messages in DB: ${existingCount}`);

    // If target already satisfied, verify without duplicating
    if (existingCount >= targetMessages) {
      console.log(`✅ Target message count (${targetMessages}) already satisfied. No duplicate insertion needed.`);
    } else {
      const needed = targetMessages - existingCount;
      console.log(`🚀 Step 4: Generating ${needed} deterministic synthetic messages...`);

      const BATCH_SIZE = 500;
      const baseTimestamp = Date.now() - 90 * 24 * 60 * 60 * 1000; // Past 90 days
      const totalSpanMs = 90 * 24 * 60 * 60 * 1000;

      let currentBatch = [];
      let inserted = 0;

      for (let i = existingCount; i < targetMessages; i++) {
        const id = `syn_msg_${String(i + 1).padStart(6, "0")}`;
        const chatId = chatIds[Math.floor(rand() * chatIds.length)];
        const sender = SYNTHETIC_SENDERS[Math.floor(rand() * SYNTHETIC_SENDERS.length)];
        const isFromMe = rand() < 0.2;

        // Choose category based on realistic distribution
        const catRand = rand();
        let text, importanceScore, priority, fraudScore, fraudRisk;

        if (catRand < 0.20) {
          // 20% High Importance
          const tpls = MESSAGE_TEMPLATES.highImportance;
          text = tpls[Math.floor(rand() * tpls.length)];
          importanceScore = Math.floor(75 + rand() * 25);
          priority = importanceScore >= 90 ? "urgent" : "high";
          fraudScore = Math.floor(rand() * 15);
          fraudRisk = "low";
        } else if (catRand < 0.85) {
          // 65% Normal Importance
          const tpls = MESSAGE_TEMPLATES.normalImportance;
          text = tpls[Math.floor(rand() * tpls.length)];
          importanceScore = Math.floor(40 + rand() * 35);
          priority = "normal";
          fraudScore = Math.floor(rand() * 15);
          fraudRisk = "low";
        } else if (catRand < 0.96) {
          // 11% Low Importance / Casual
          const tpls = MESSAGE_TEMPLATES.lowImportance;
          text = tpls[Math.floor(rand() * tpls.length)];
          importanceScore = Math.floor(5 + rand() * 35);
          priority = "low";
          fraudScore = 0;
          fraudRisk = "low";
        } else {
          // 4% Potential Fraud / Security Alert
          const tpls = MESSAGE_TEMPLATES.fraudSpam;
          text = tpls[Math.floor(rand() * tpls.length)];
          importanceScore = Math.floor(20 + rand() * 40);
          priority = "high";
          fraudScore = Math.floor(70 + rand() * 28);
          fraudRisk = fraudScore >= 85 ? "critical" : "high";
        }

        const msgTime = new Date(baseTimestamp + Math.floor(rand() * totalSpanMs));
        const cleanDate = msgTime.toISOString().slice(0, 19).replace("T", " ");

        currentBatch.push([
          id,
          "default_user",
          chatId,
          `WAMSG_${id.toUpperCase()}`,
          sender.name,
          `${sender.name.toLowerCase().replace(/[^a-z]/g, "")}@s.whatsapp.net`,
          isFromMe,
          text,
          importanceScore,
          priority,
          fraudScore,
          fraudRisk,
          1, // is_synthetic
          cleanDate,
          cleanDate,
        ]);

        if (currentBatch.length >= BATCH_SIZE || i === targetMessages - 1) {
          await pool.query(
            `INSERT INTO messages (
              id, user_id, chat_id, whatsapp_message_id, sender_name, sender_jid,
              is_from_me, message_text, importance_score, priority, fraud_score,
              fraud_risk_level, is_synthetic, received_at, created_at
            ) VALUES ?
            ON DUPLICATE KEY UPDATE
              importance_score = VALUES(importance_score),
              fraud_score = VALUES(fraud_score)`,
            [currentBatch]
          );
          inserted += currentBatch.length;
          process.stdout.write(`  → Inserted ${inserted} / ${needed} messages...\r`);
          currentBatch = [];
        }
      }
      console.log(`\n  ✅ Successfully seeded ${inserted} synthetic messages.`);
    }

    // 6. Seed Sample Synthetic Tasks
    console.log("📋 Step 5: Seeding synthetic tasks linked to chats...");
    const sampleTasks = [
      ["syn_task_001", chatIds[0], "Submit Hackathon abstract by Friday 5 PM", "in_progress", "2026-10-25"],
      ["syn_task_002", chatIds[0], "Review project architecture and ER diagram", "completed", "2026-10-18"],
      ["syn_task_003", chatIds[1], "Collect lab experiment signatures from faculty", "pending", "2026-10-22"],
      ["syn_task_004", chatIds[2], "Deploy backend container on cloud staging server", "in_progress", "2026-10-24"],
      ["syn_task_005", chatIds[3], "Finalize IEEE conference paper formatting", "pending", "2026-10-30"],
      ["syn_task_006", chatIds[4], "Submit resume for campus placement shortlisting", "completed", "2026-10-15"],
      ["syn_task_007", chatIds[9], "Run database migration and verify row counts", "in_progress", "2026-10-20"],
    ];
    const taskRows = sampleTasks.map(([id, cId, txt, stat, due]) => [id, "default_user", cId, txt, stat, due, 1]);
    await pool.query(
      `INSERT INTO tasks (task_id, user_id, chat_id, task_text, status, due_date, is_synthetic)
       VALUES ?
       ON DUPLICATE KEY UPDATE task_text = VALUES(task_text), status = VALUES(status)`,
      [taskRows]
    );

    // 7. Summary
    const [[{ totalMsgs }]] = await pool.query("SELECT COUNT(*) AS totalMsgs FROM messages");
    const [[{ realMsgs }]] = await pool.query("SELECT COUNT(*) AS realMsgs FROM messages WHERE is_synthetic = 0");
    const [[{ synMsgs }]] = await pool.query("SELECT COUNT(*) AS synMsgs FROM messages WHERE is_synthetic = 1");
    const [[{ totalChats }]] = await pool.query("SELECT COUNT(*) AS totalChats FROM chats");

    console.log("\n==================================================");
    console.log("🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY");
    console.log("==================================================");
    console.log(`Total Chats:              ${totalChats}`);
    console.log(`Total Messages:           ${totalMsgs}`);
    console.log(`  - Real WhatsApp Data:   ${realMsgs}`);
    console.log(`  - Synthetic Demo Data:  ${synMsgs}`);
    console.log("==================================================\n");

    return { totalChats, totalMsgs, realMsgs, synMsgs };
  } finally {
    await pool.end();
  }
}

// Allow direct CLI invocation: node database/scripts/seed_large_dataset.js [--messages 5000]
if (process.argv[1] && process.argv[1].endsWith("seed_large_dataset.js")) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--messages" || args[i] === "--count") options.messages = args[++i];
    if (args[i] === "--chats") options.chats = args[++i];
    if (args[i] === "--seed") options.seed = args[++i];
  }
  seedLargeDataset(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Seeding failed:", err.message);
      process.exit(1);
    });
}
