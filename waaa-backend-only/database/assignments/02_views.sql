-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - DBMS ASSIGNMENT 2
-- Topic: Database Views (Creation, Multi-table Views & Dynamic Querying)
-- Database: MySQL 8.0+ (waaa_db)
-- ==============================================================================

USE waaa_db;

-- ------------------------------------------------------------------------------
-- 1. Create a View for High-Importance Messages (Score >= 50)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 2. Create a Multi-Table Aggregation View for Chat Activity Summary
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. Create a View for Actionable Pending Tasks Joined with Chat Metadata
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pending_tasks AS
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
WHERE t.status != 'completed' AND t.status != 'cancelled';

-- ------------------------------------------------------------------------------
-- 4. Query the Views with Filtering, Ordering and Limits
-- ------------------------------------------------------------------------------
-- Top 10 Most Important Messages from the View
SELECT message_id, sender_name, message_text, importance_score, priority, received_at
FROM v_important_messages
ORDER BY importance_score DESC, received_at DESC
LIMIT 10;

-- Chat Activity Summary sorted by most active conversations
SELECT chat_name, chat_type, tier, total_messages, avg_importance, last_message_at
FROM v_chat_activity_summary
WHERE total_messages > 0
ORDER BY total_messages DESC
LIMIT 10;

-- Pending Tasks requiring immediate action
SELECT task_id, chat_name, task_text, status, due_date
FROM v_pending_tasks
ORDER BY due_date ASC
LIMIT 10;
