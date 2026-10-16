-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - DBMS ASSIGNMENT 3
-- Topic: SQL Joins (INNER, LEFT OUTER, RIGHT OUTER, SELF JOIN)
-- Database: MySQL 8.0+ (waaa_db)
-- ==============================================================================

USE waaa_db;

-- ------------------------------------------------------------------------------
-- 1. INNER JOIN (Equi-join): Messages with their Parent Chat Details
-- ------------------------------------------------------------------------------
SELECT 
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
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 2. LEFT OUTER JOIN: All Chats, showing Actionable Tasks (even if chat has NO tasks)
-- Demonstrates matching vs non-matching records:
-- ------------------------------------------------------------------------------
SELECT 
    c.chat_id,
    c.chat_name,
    c.tier,
    t.task_id,
    COALESCE(t.task_text, '(No pending tasks)') AS task_description,
    COALESCE(t.status, 'N/A') AS task_status
FROM chats c
LEFT JOIN tasks t ON c.chat_id = t.chat_id
ORDER BY t.task_id DESC, c.chat_name ASC
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 3. RIGHT OUTER JOIN: Match All Tasks with their Associated Chat Information
-- ------------------------------------------------------------------------------
SELECT 
    t.task_id,
    t.task_text,
    t.status,
    t.due_date,
    c.chat_name,
    c.chat_type
FROM chats c
RIGHT JOIN tasks t ON c.chat_id = t.chat_id
ORDER BY t.created_at DESC;

-- ------------------------------------------------------------------------------
-- 4. SELF JOIN: Comparing Two Messages Sent Within the Same Chat
-- Identifies conversational pairs / replies within conversations:
-- ------------------------------------------------------------------------------
SELECT 
    m1.chat_id,
    m1.sender_name AS first_sender,
    m1.message_text AS first_message,
    m2.sender_name AS reply_sender,
    m2.message_text AS reply_message
FROM messages m1
JOIN messages m2 
  ON m1.chat_id = m2.chat_id 
 AND m1.id <> m2.id 
 AND m1.received_at < m2.received_at
WHERE m1.importance_score >= 60 AND m2.importance_score >= 60
LIMIT 5;

-- ------------------------------------------------------------------------------
-- 5. MULTI-TABLE JOIN: Messages + Chats + Users
-- ------------------------------------------------------------------------------
SELECT 
    m.id AS message_id,
    u.display_name AS system_user,
    c.chat_name,
    m.sender_name AS message_sender,
    m.message_text,
    m.importance_score
FROM messages m
JOIN chats c ON m.chat_id = c.chat_id
JOIN users u ON m.user_id = u.user_id
WHERE m.importance_score >= 75
ORDER BY m.importance_score DESC
LIMIT 10;
