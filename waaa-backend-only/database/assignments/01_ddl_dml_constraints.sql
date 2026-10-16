-- ============================================================
-- DBMS ASSIGNMENT 1: DDL, DML, PRIMARY KEY & FOREIGN KEY CONSTRAINTS
-- Project: WAAA (WhatsApp AI Assistant)
-- ============================================================

-- 1. DDL: Create parent table 'chats'
CREATE TABLE chats (
    chat_id VARCHAR(128) PRIMARY KEY,
    chat_name VARCHAR(255) NOT NULL,
    chat_type ENUM('personal', 'group') NOT NULL DEFAULT 'personal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. DDL: Create child table 'messages' with Foreign Key & Check Constraint
CREATE TABLE messages (
    id VARCHAR(64) PRIMARY KEY,
    chat_id VARCHAR(128) NOT NULL,
    sender VARCHAR(128) NOT NULL,
    text TEXT NOT NULL,
    importance_score INT NOT NULL DEFAULT 0 CHECK (importance_score BETWEEN 0 AND 100),
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messages_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE RESTRICT
);

-- 3. DML: Insert records into 'chats'
INSERT INTO chats (chat_id, chat_name, chat_type) 
VALUES ('c_101', 'Jayram (Colleague)', 'personal'),
       ('c_102', 'Project Alpha Group', 'group');

-- 4. DML: Insert records into 'messages' (linked via Foreign Key)
INSERT INTO messages (id, chat_id, sender, text, importance_score)
VALUES ('m_1', 'c_101', 'Jayram', 'Important meeting tomorrow at 10 AM', 85),
       ('m_2', 'c_102', 'Alex', 'Backend server build succeeded', 90);

-- 5. DML: Update a record
UPDATE messages SET importance_score = 95 WHERE id = 'm_1';

-- 6. DML: Query data
SELECT * FROM chats;
SELECT * FROM messages;
