# 🎓 WAAA DBMS Assignment Demonstration & Viva Guide

This document outlines the complete database architecture, dataset structure, commands, and viva presentation talking points for the **WAAA (WhatsApp AI Assistant)** DBMS project demonstration.

---

## 🏗️ 1. Architecture Overview

- **RDBMS Engine:** Oracle MySQL 8.4 Server (InnoDB engine, UTF-8 `utf8mb4_unicode_ci`)
- **Host / Port:** `localhost:3306`
- **Database Name:** `waaa_db`
- **Connection Client:** Node.js `mysql2/promise` with connection pooling (`src/db/mysqlClient.js`)
- **Total Tables:** 21 relational tables + 3 views + 3 stored procedures + 3 triggers

### 📊 Dataset Breakdown

| Metric | Real WhatsApp Data | Synthetic Demo Data | Total in Database |
| :--- | :--- | :--- | :--- |
| **Messages** | **1,212** | **5,000** | **6,212** |
| **Chats** | **40** | **20** | **60** |
| **Users / Senders** | 1 (System Admin) | 16 (Faculty & Students) | **17** |
| **Contacts** | **109** | - | **109** |
| **Actionable Tasks** | 4 (Real Commitments) | 7 (Synthetic Deadlines) | **11** |

> **Key Design Integrity:** Real WhatsApp messages and synthetic records are stored side-by-side in the same persistent MySQL database without collision. Synthetic records are tagged with `is_synthetic = 1`, and real messages are tagged with `is_synthetic = 0`.

---

## ⚡ 2. Presentation Command Quick Reference

Run these commands in the terminal during your presentation:

```bash
# 🎯 ASSIGNMENT DEMONSTRATIONS
npm run demo 1          # Assignment 1: DDL, DML, Primary Key & Foreign Key Constraints
npm run demo 2          # Assignment 2: Database Views (Creation, Multi-table & Dynamic Querying)
npm run demo 3          # Assignment 3: SQL Joins (INNER, LEFT, RIGHT, SELF JOIN & 3-Way JOIN)
npm run demo 5          # Assignment 5: SELECT Queries, Operators & Aggregate Functions
npm run demo 6          # Assignment 6: Stored Procedures (IN/OUT params & Session Variables)
npm run demo 7          # Assignment 7: Database Triggers & Automated Audit Logging
npm run demo all        # Run all 6 assignments end-to-end with summary

# 🔍 INTERACTIVE TABLE EXPLORATION
npm run demo table messages --limit 10
npm run demo table messages --cols id,sender_name,message_text,importance_score --limit 5
npm run demo table messages --filter "importance_score >= 80" --sort "importance_score DESC" --limit 5
npm run demo table messages --search "exam" --limit 5

# 📋 SCHEMA INSPECTION & STATS
npm run demo schema           # List all 21 tables & views with row counts
npm run demo schema messages  # Full column types, nullable, keys, foreign keys & indexes
npm run demo schema chats     # Inspect chats table schema
npm run demo stats            # Display database stats & real vs synthetic distribution
```

---

## 📖 3. Detailed Walkthrough of Each Assignment

### Assignment 1: DDL, DML & Constraints (`01_ddl_dml_constraints.sql`)
- **DDL Execution:** Inspects `chats` (Parent Table with Primary Key `chat_id`) and `messages` (Child Table with Primary Key `id` and Foreign Key `fk_messages_chat` referencing `chats.chat_id`).
- **Check Constraint:** `chk_importance_score` ensures `importance_score BETWEEN 0 AND 100`.
- **DML Operations:** Demonstrates safe `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- **Controlled Constraint Violation Tests:**
  1. **Foreign Key Violation:** Attempts to insert a message with non-existent `chat_id = 'invalid_chat_99999'`. MySQL rejects the insertion with error `ER_NO_REFERENCED_ROW_2` (Error 1452).
  2. **Check Constraint Violation:** Attempts to insert a message with `importance_score = 150`. MySQL rejects it with error `ER_CHECK_CONSTRAINT_VIOLATED` (Error 3819).

---

### Assignment 2: Database Views (`02_views.sql`)
- **View 1 (`v_important_messages`):** Filters messages where `importance_score >= 50`.
- **View 2 (`v_chat_activity_summary`):** Multi-table aggregation view joining `chats` and `messages`, calculating `total_messages`, `avg_importance`, and `last_message_at` per conversation.
- **View 3 (`v_pending_tasks`):** Joins `tasks` with `chats` to surface uncompleted commitments with due dates.
- **Dynamic View Behavior:** Demonstrates that inserting a new high-importance message instantly appears in `v_important_messages` without manual recomputation or caching.

---

### Assignment 3: SQL Joins (`03_joins.sql`)
- **INNER JOIN (Equi-join):** Pairs messages with parent chat names and conversation categories.
- **LEFT OUTER JOIN:** Displays all chats and matches them with assigned tasks. Chats without tasks display `NULL` / `(No pending task)`, demonstrating matching vs non-matching preservation.
- **RIGHT OUTER JOIN:** Displays all actionable tasks and matches them against source chats.
- **SELF JOIN:** Joins `messages m1` with `messages m2` on `m1.chat_id = m2.chat_id AND m1.id <> m2.id` to discover related message pairs / conversation threads.
- **Three-Table JOIN:** Normalized navigation joining `messages` + `chats` + `users`.

---

### Assignment 5: SELECT Queries, Operators & Functions (`05_select_functions.sql`)
- **Relational Algebra Selection:** `WHERE importance_score BETWEEN 50 AND 95 AND priority IN ('normal', 'high', 'urgent')`.
- **Pattern Matching:** `LIKE '%exam%' OR LIKE '%project%' OR LIKE '%submission%'`.
- **Aggregate Functions:** `COUNT(*)`, `COUNT(DISTINCT sender_name)`, `AVG()`, `MAX()`, `MIN()`, `SUM()`.
- **GROUP BY & HAVING:** Groups messages by `sender_name`, filtering groups where `COUNT(*) >= 10 AND AVG(importance_score) >= 45`.
- **Scalar Functions:**
  - String manipulation: `UPPER()`, `LENGTH()`, `CONCAT()`, `SUBSTRING()`.
  - Date & Time: `DATE()`, `TIME()`, `DAYNAME()`.
- **Pagination:** Comparing `LIMIT 3 OFFSET 0` with `LIMIT 3 OFFSET 3`.

---

### Assignment 6: Stored Procedures (`06_stored_procedures.sql`)
- **`sp_get_chat_messages(p_chat_id, p_limit, p_offset)`:** Stored procedure accepting `IN` parameters to return paginated chat messages directly from MySQL.
- **`sp_get_chat_stats(p_chat_id, OUT p_total, OUT p_avg, OUT p_high)`:** Procedure utilizing `OUT` parameters to compute aggregate metrics into MySQL session variables (`@total`, `@avg`, `@high`).
- **`sp_search_messages(p_search_term, p_min_importance, p_limit)`:** Search procedure encapsulating multi-attribute pattern matching and threshold filtering.
- **Catalog Verification:** Queries `information_schema.routines` to prove procedures are compiled and stored inside MySQL's data dictionary.

---

### Assignment 7: Database Triggers & Audit Logging (`07_triggers.sql`)
- **`trg_after_message_insert`:** An `AFTER INSERT` trigger on `messages` that automatically logs an audit row in `audit_logs` capturing `record_id`, `details`, and a `new_values` JSON object.
- **`trg_before_message_delete`:** A `BEFORE DELETE` trigger on `messages` that records an audit row preserving `old_values` JSON snapshot before deletion.
- **`trg_after_task_update`:** An `AFTER UPDATE` trigger on `tasks` capturing status transitions (`OLD.status` to `NEW.status`).
- **Verification Walkthrough:**
  1. Inserts a test record.
  2. Demonstrates the auto-generated row in `audit_logs`.
  3. Deletes the test record.
  4. Demonstrates the delete audit entry in `audit_logs`.
  5. Reviews the complete lifecycle audit trail.

---

## 💡 4. Top Viva / Exam Questions & Answers

**Q1: What is the advantage of using Foreign Key constraints with ON UPDATE CASCADE ON DELETE RESTRICT?**  
*Answer:* `ON UPDATE CASCADE` ensures that if a parent primary key (`chat_id`) changes, all child messages automatically update to maintain consistency. `ON DELETE RESTRICT` prevents accidental deletion of a chat while child messages still reference it, protecting against orphaned records.

**Q2: What is the difference between a Database View and a Base Table?**  
*Answer:* A base table physically stores data on disk (in MySQL InnoDB `.ibd` tablespace). A view is a stored query in the data dictionary (`information_schema.views`) that does not store independent data. When queried, MySQL dynamically executes the underlying SELECT statement against the base tables.

**Q3: When should you use a Stored Procedure instead of writing queries in Node.js?**  
*Answer:* Stored procedures reduce network round-trips by executing complex multi-step logic directly inside the database server. They are pre-compiled by the MySQL query optimizer and provide centralized business logic and access control independent of the client language.

**Q4: How do Triggers guarantee audit logging integrity?**  
*Answer:* Triggers are event-driven hooks executed atomically within the same database transaction as the triggering DML statement. Because they run within MySQL itself, no client application or user query can bypass the audit log generation when inserting or deleting records.
