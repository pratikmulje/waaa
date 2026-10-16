-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - MASTER SQL DEMO SCRIPT FOR PRESENTATION
-- Covers: DDL, DML, Primary & Foreign Keys, Views, Joins, Aggregation, Procedures, Triggers
-- ==============================================================================

-- 1. DATABASE CREATION
CREATE DATABASE IF NOT EXISTS waaa_db;
USE waaa_db;

-- ==============================================================================
-- 2. ASSIGNMENT 1: TABLE CREATION (DDL) WITH PRIMARY & FOREIGN KEY CONSTRAINTS
-- ==============================================================================

-- Parent Table: chats (Primary Key: chat_id)
CREATE TABLE IF NOT EXISTS chats (
    chat_id VARCHAR(128) PRIMARY KEY,
    chat_name VARCHAR(255) NOT NULL,
    chat_type VARCHAR(32) NOT NULL DEFAULT 'personal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Child Table: messages (Foreign Key: chat_id references chats)
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    chat_id VARCHAR(128) NOT NULL,
    sender VARCHAR(128) NOT NULL,
    message_text TEXT NOT NULL,
    importance_score INT NOT NULL DEFAULT 0 CHECK (importance_score BETWEEN 0 AND 100),
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messages_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE RESTRICT
);

-- Audit Table (For Trigger Demonstration)
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(16) NOT NULL,
    table_name VARCHAR(64) NOT NULL DEFAULT 'messages',
    record_id VARCHAR(64) NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 3. ASSIGNMENT 1: DATA INSERTION (DML)
-- ==============================================================================

INSERT INTO chats (chat_id, chat_name, chat_type) VALUES
('c_101', 'Jayram (Colleague)', 'personal'),
('c_102', 'Project Alpha Group', 'group'),
('c_103', 'Study Circle', 'group');

INSERT INTO messages (id, chat_id, sender, message_text, importance_score) VALUES
('m_1', 'c_101', 'Jayram', 'Important meeting tomorrow at 10 AM', 90),
('m_2', 'c_101', 'Jayram', 'Please review the database schema before the meeting', 80),
('m_3', 'c_102', 'Alex', 'Backend build succeeded and deployed', 75),
('m_4', 'c_102', 'Sam', 'Who is testing the WhatsApp bot connection?', 50),
('m_5', 'c_103', 'Tanushka', 'Notes uploaded for tomorrow discussion', 65);

-- Display table contents:
SELECT * FROM chats;
SELECT * FROM messages;

-- ==============================================================================
-- 4. ASSIGNMENT 2: VIEWS
-- ==============================================================================

-- View 1: Filter high-priority messages (score >= 75)
CREATE OR REPLACE VIEW v_important_messages AS
SELECT id, sender, message_text, importance_score, received_at
FROM messages
WHERE importance_score >= 75;

-- View 2: Multi-table View joining chats and messages
CREATE OR REPLACE VIEW v_message_details AS
SELECT m.id AS msg_id, c.chat_name, c.chat_type, m.sender, m.message_text
FROM messages m
JOIN chats c ON m.chat_id = c.chat_id;

-- Query the Views:
SELECT * FROM v_important_messages;
SELECT * FROM v_message_details;

-- ==============================================================================
-- 5. ASSIGNMENT 3: SQL JOINS
-- ==============================================================================

-- 1. INNER JOIN (Equi-Join): Messages with chat details
SELECT m.id AS msg_id, c.chat_name, c.chat_type, m.sender, m.message_text, m.importance_score
FROM messages m
INNER JOIN chats c ON m.chat_id = c.chat_id;

-- 2. LEFT OUTER JOIN: All chats, matching messages if any
SELECT c.chat_id, c.chat_name, m.sender, m.message_text
FROM chats c
LEFT JOIN messages m ON c.chat_id = m.chat_id;

-- 3. SELF JOIN: Comparing messages sent within the same chat
SELECT m1.sender, m1.message_text AS first_msg, m2.message_text AS second_msg
FROM messages m1
JOIN messages m2 ON m1.chat_id = m2.chat_id AND m1.id != m2.id;

-- ==============================================================================
-- 6. ASSIGNMENT 5: SELECT QUERIES, OPERATORS & AGGREGATE FUNCTIONS
-- ==============================================================================

-- 1. WHERE with LIKE operator:
SELECT id, sender, message_text, importance_score
FROM messages
WHERE message_text LIKE '%meeting%' OR importance_score >= 80;

-- 2. Aggregate Functions (COUNT, AVG, MAX, MIN):
SELECT 
    COUNT(*) AS total_messages,
    AVG(importance_score) AS avg_importance,
    MAX(importance_score) AS max_importance,
    MIN(importance_score) AS min_importance
FROM messages;

-- 3. GROUP BY and HAVING:
SELECT sender, COUNT(*) AS message_count, AVG(importance_score) AS avg_score
FROM messages
GROUP BY sender
HAVING COUNT(*) >= 1
ORDER BY message_count DESC;

-- 4. Single-Row Functions:
SELECT 
    id,
    UPPER(sender) AS upper_sender,
    LENGTH(message_text) AS text_length,
    SUBSTRING(message_text, 1, 15) AS preview
FROM messages;

-- ==============================================================================
-- 7. ASSIGNMENT 6: STORED PROCEDURES
-- ==============================================================================

DELIMITER //

CREATE PROCEDURE sp_get_chat_messages(IN p_chat_id VARCHAR(128))
BEGIN
    SELECT id, sender, message_text, importance_score, received_at
    FROM messages
    WHERE chat_id = p_chat_id;
END //

DELIMITER ;

-- CALL Procedure:
CALL sp_get_chat_messages('c_101');

-- ==============================================================================
-- 8. ASSIGNMENT 7: DATABASE TRIGGERS
-- ==============================================================================

DELIMITER //

-- Trigger: Automatically fires AFTER INSERT on messages to log into audit_logs
CREATE TRIGGER trg_after_message_insert
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (action_type, table_name, record_id)
    VALUES ('INSERT', 'messages', NEW.id);
END //

DELIMITER ;

-- 1. Insert a new message (Trigger fires automatically):
INSERT INTO messages (id, chat_id, sender, message_text, importance_score)
VALUES ('m_test_trg', 'c_101', 'Alex', 'Live trigger test message', 70);

-- 2. View audit_logs table (Proves the trigger fired!):
SELECT * FROM audit_logs;
