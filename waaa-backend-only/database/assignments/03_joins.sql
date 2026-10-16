-- ============================================================
-- DBMS ASSIGNMENT 3: SQL JOINS
-- Project: WAAA (WhatsApp AI Assistant)
-- ============================================================

-- 1. INNER JOIN (Equi-join): Messages with their respective Chat names
SELECT m.id AS msg_id, c.chat_name, c.chat_type, m.sender, m.text
FROM messages m
INNER JOIN chats c ON m.chat_id = c.chat_id;

-- 2. LEFT OUTER JOIN: All chats, showing messages if any exist
SELECT c.chat_id, c.chat_name, m.sender, m.text
FROM chats c
LEFT JOIN messages m ON c.chat_id = m.chat_id;

-- 3. RIGHT OUTER JOIN: All messages matched against chats
SELECT c.chat_name, m.id, m.sender, m.text
FROM chats c
RIGHT JOIN messages m ON c.chat_id = m.chat_id;

-- 4. SELF JOIN: Comparing two messages sent within the same chat
SELECT m1.sender, m1.text AS msg_1, m2.text AS msg_2
FROM messages m1
JOIN messages m2 ON m1.chat_id = m2.chat_id AND m1.id != m2.id;
