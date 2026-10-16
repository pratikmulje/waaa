# 🎓 WAAA — DBMS Presentation & Viva Cheat Sheet

Use this guide for your presentation tomorrow. You do not need to memorize complicated code. Just run the simple commands below in your PowerShell terminal and use the 1-line answers if the teacher asks questions!

---

## ⚡ 1. How to Run the Presentation in PowerShell

Open your terminal in `c:\WAAA\waaa-backend-only` and run:

| To Show in Presentation | Type this Command in PowerShell | What It Shows to the Teacher |
| :--- | :--- | :--- |
| **Assignment 1 (Tables & Keys)** | `node run_assignment.js 1` | Creates `chats` and `messages`, shows Primary Key, Foreign Key, and displays table data. |
| **Assignment 2 (Views)** | `node run_assignment.js 2` | Creates and queries `v_important_messages` and `v_pending_tasks`. |
| **Assignment 3 (Joins)** | `node run_assignment.js 3` | Performs Inner Join, Left Join, and Self Join between messages and chats. |
| **Assignment 5 (SELECT & Functions)** | `node run_assignment.js 5` | Runs `WHERE`, `LIKE`, `COUNT()`, `AVG()`, `GROUP BY`, `UPPER()`. |
| **Assignment 6 (Stored Procedures)** | `node run_assignment.js 6` | Demonstrates the stored procedure `sp_get_chat_messages`. |
| **Assignment 7 (Triggers)** | `node run_assignment.js 7` | Inserts a message, trigger fires automatically, and creates an audit record in `audit_logs`! |
| **RUN EVERYTHING AT ONCE** | `node run_assignment.js all` | Runs all assignments sequentially in one smooth 5-second demo! |

---

## 🗣️ 2. What to Say in the Viva (1-Line Answers)

### Assignment 1: DDL, DML & Constraints
- **What is DDL?**: *"DDL is Data Definition Language (like `CREATE TABLE`). It defines the structure of the database."*
- **What is DML?**: *"DML is Data Manipulation Language (like `INSERT`, `UPDATE`, `SELECT`). It modifies the data inside the tables."*
- **What is a Primary Key?**: *"A Primary Key (like `chat_id` or `id`) uniquely identifies each row in a table. It cannot be NULL and cannot be duplicate."*
- **What is a Foreign Key?**: *"A Foreign Key links two tables together. In our project, `messages.chat_id` references `chats.chat_id` so every message belongs to a valid chat."*
- **What is a Check Constraint?**: *"It restricts allowed values. In our project, `importance_score` is checked to be between 0 and 100."*

### Assignment 2: Views
- **What is a View?**: *"A View is a virtual table based on the result-set of an SQL statement. We created `v_important_messages` so users can see high-priority WhatsApp messages without writing long queries every time."*
- **Can a View be updated?**: *"Yes, simple single-table views without `GROUP BY` or aggregates are updatable. Views using `WITH CHECK OPTION` ensure only valid rows are inserted."*

### Assignment 3: SQL Joins
- **What is an Inner Join (Equi-Join)?**: *"It returns records that have matching values in both tables. It combines `messages` with their `chat_name`."*
- **What is a Left Join?**: *"It returns all records from the left table (`chats`), and matched records from the right table (`tasks`)."*
- **What is a Self Join?**: *"A table joined with itself. We use it to compare consecutive messages sent within the same chat."*

### Assignment 5: SELECT Queries & Functions
- **What aggregate functions did you use?**: *"We used `COUNT()` to count messages, `AVG()` for average importance score, and `MAX()` / `MIN()`."*
- **What is GROUP BY?**: *"It groups rows sharing the same value. We grouped messages by `sender` to see how many messages each person sent."*

### Assignment 6: Stored Procedures
- **What is a Stored Procedure?**: *"It is a pre-compiled set of SQL statements stored in the database. Instead of sending raw SQL from the backend, we `CALL sp_get_chat_messages('chat_id')` to retrieve messages faster."*
- **What parameters did you use?**: *"We used `IN` parameters to pass the chat ID, and `OUT` parameters to return computed statistics."*

### Assignment 7: Database Triggers
- **What is a Trigger?**: *"A Trigger is a special stored program that automatically executes when an event (`INSERT`, `UPDATE`, or `DELETE`) occurs on a table."*
- **How does your trigger work?**: *"When a new message is inserted into `messages`, our `AFTER INSERT` trigger automatically writes a record into `audit_logs` tracking who, what, and when."*

---

## 📂 3. Where Are the Clean SQL Files Located?

If the professor asks: *"Show me your SQL files"*, open this folder:
`c:\WAAA\waaa-backend-only\database\assignments\`

1. `01_ddl_dml_constraints.sql` (Tables & Foreign Keys)
2. `02_views.sql` (Views)
3. `03_joins.sql` (Joins)
4. `05_select_functions.sql` (Queries & Aggregate Functions)
5. `06_stored_procedures.sql` (Stored Procedures)
6. `07_triggers.sql` (Triggers & Audit Logging)

Every file is **under 35 lines**, clean, and easy to read. Good luck with your presentation tomorrow!
