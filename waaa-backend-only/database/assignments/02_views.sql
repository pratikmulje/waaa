-- ============================================================
-- DBMS ASSIGNMENT 2: VIEWS
-- Project: WAAA (WhatsApp AI Assistant)
-- ============================================================

-- 1. Create a View for High-Priority / Important Messages
CREATE VIEW v_important_messages AS
SELECT id, sender, message_text, importance_score, received_at
FROM messages
WHERE importance_score >= 75;

-- 2. Create a View joining Chats and Messages (Multi-table View)
CREATE VIEW v_message_details AS
SELECT m.id AS message_id, c.chat_name, c.chat_type, m.sender, m.message_text, m.received_at
FROM messages m
JOIN chats c ON m.chat_id = c.chat_id;

-- 3. Query the Views
SELECT * FROM v_important_messages;
SELECT * FROM v_message_details;

-- 4. Updatable View demonstration with WITH CHECK OPTION
CREATE VIEW v_urgent_messages AS
SELECT id, chat_id, sender, message_text, importance_score
FROM messages
WHERE importance_score >= 80
WITH CHECK OPTION;
