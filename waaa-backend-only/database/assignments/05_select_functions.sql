-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - DBMS ASSIGNMENT 5
-- Topic: SELECT Queries, Operators, Aggregate & Single-Row SQL Functions
-- Database: MySQL 8.0+ (waaa_db)
-- ==============================================================================

USE waaa_db;

-- ------------------------------------------------------------------------------
-- 1. WHERE Clause with Comparison, Logical & Range Operators (AND, OR, BETWEEN, IN)
-- ------------------------------------------------------------------------------
SELECT 
    id, sender_name, message_text, importance_score, priority, received_at
FROM messages
WHERE importance_score BETWEEN 50 AND 95
  AND priority IN ('normal', 'high', 'urgent')
ORDER BY importance_score DESC
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 2. Pattern Matching with LIKE Operator (Academic / Exam / Project Keywords)
-- ------------------------------------------------------------------------------
SELECT 
    id, sender_name, message_text, importance_score
FROM messages
WHERE message_text LIKE '%exam%' 
   OR message_text LIKE '%project%' 
   OR message_text LIKE '%submission%'
ORDER BY importance_score DESC
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 3. Aggregate Functions across the entire Dataset (COUNT, AVG, MAX, MIN, SUM)
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_messages,
    COUNT(DISTINCT sender_name) AS unique_senders,
    ROUND(AVG(importance_score), 2) AS avg_importance_score,
    MAX(importance_score) AS max_importance_score,
    MIN(importance_score) AS min_importance_score,
    ROUND(AVG(fraud_score), 2) AS avg_fraud_score
FROM messages;

-- ------------------------------------------------------------------------------
-- 4. GROUP BY and HAVING Clause: Senders with High Volume & Above-Average Importance
-- ------------------------------------------------------------------------------
SELECT 
    sender_name,
    COUNT(*) AS total_sent,
    ROUND(AVG(importance_score), 1) AS avg_score,
    MAX(importance_score) AS peak_score
FROM messages
GROUP BY sender_name
HAVING COUNT(*) >= 10 AND AVG(importance_score) >= 45
ORDER BY total_sent DESC
LIMIT 10;

-- ------------------------------------------------------------------------------
-- 5. Single-Row Functions (String Manipulation & Date Formatting)
-- ------------------------------------------------------------------------------
SELECT 
    id,
    UPPER(sender_name) AS upper_sender,
    LENGTH(message_text) AS char_length,
    CONCAT(SUBSTRING(message_text, 1, 30), '...') AS snippet,
    DATE(received_at) AS msg_date,
    TIME(received_at) AS msg_time,
    DAYNAME(received_at) AS day_of_week
FROM messages
ORDER BY received_at DESC
LIMIT 8;
