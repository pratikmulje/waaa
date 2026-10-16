-- ============================================================
-- DBMS ASSIGNMENT 5: SELECT QUERIES, OPERATORS & SQL FUNCTIONS
-- Project: WAAA (WhatsApp AI Assistant)
-- ============================================================

-- 1. WHERE clause with LIKE and Comparison Operators
SELECT id, sender, text, importance_score
FROM messages
WHERE LENGTH(text) > 3 OR importance_score >= 50;

-- 2. Aggregate Functions (COUNT, AVG, MAX, MIN)
SELECT 
    COUNT(*) AS total_messages,
    ROUND(AVG(importance_score), 1) AS avg_importance,
    MAX(importance_score) AS max_score,
    MIN(importance_score) AS min_score
FROM messages;

-- 3. GROUP BY and HAVING: Message statistics grouped by sender
SELECT sender, COUNT(*) AS message_count, ROUND(AVG(importance_score), 1) AS avg_score
FROM messages
GROUP BY sender
HAVING COUNT(*) >= 1
ORDER BY message_count DESC;

-- 4. Single-Row Functions (String and Formatting)
SELECT 
    id,
    UPPER(sender) AS upper_sender,
    LENGTH(text) AS text_len,
    SUBSTRING(text, 1, 20) AS preview
FROM messages;
