-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - DBMS ASSIGNMENT 1
-- Topic: DDL, DML, Primary Key, Foreign Key & Check Constraints
-- Database: MySQL 8.0+ (waaa_db)
-- ==============================================================================

USE waaa_db;

-- ------------------------------------------------------------------------------
-- 1. DDL: Create parent table 'chats' with Primary Key
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
    chat_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL DEFAULT 'default_user',
    chat_name VARCHAR(255) NOT NULL,
    chat_type ENUM('personal', 'group', 'broadcast', 'community') NOT NULL DEFAULT 'personal',
    tier ENUM('starred', 'important', 'normal', 'low', 'ignored') NOT NULL DEFAULT 'normal',
    participant_count INT NULL DEFAULT 2,
    is_community BOOLEAN NOT NULL DEFAULT FALSE,
    is_synthetic TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_chats_tier (tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. DDL: Create child table 'messages' with Foreign Key and Check Constraints
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL DEFAULT 'default_user',
    chat_id VARCHAR(128) NOT NULL,
    whatsapp_message_id VARCHAR(128) NOT NULL DEFAULT '',
    sender_name VARCHAR(128) NOT NULL,
    sender_jid VARCHAR(128) NOT NULL DEFAULT '',
    is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
    message_text TEXT NOT NULL,
    importance_score INT NOT NULL DEFAULT 0,
    priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    fraud_score INT NOT NULL DEFAULT 0,
    fraud_risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
    is_synthetic TINYINT(1) NOT NULL DEFAULT 0,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messages_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_importance_score CHECK (importance_score BETWEEN 0 AND 100),
    INDEX idx_messages_chat (chat_id),
    INDEX idx_messages_sender (sender_name),
    INDEX idx_messages_imp (importance_score),
    INDEX idx_messages_recv (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. DML: Display records from parent table 'chats'
-- ------------------------------------------------------------------------------
SELECT chat_id, chat_name, chat_type, tier, participant_count, is_synthetic
FROM chats
ORDER BY created_at DESC
LIMIT 5;

-- ------------------------------------------------------------------------------
-- 4. DML: Display child records from 'messages' linked via chat_id
-- ------------------------------------------------------------------------------
SELECT id, chat_id, sender_name, message_text, importance_score, priority, received_at
FROM messages
ORDER BY received_at DESC
LIMIT 5;

-- ------------------------------------------------------------------------------
-- 5. DML INSERT: Add a new message referencing an existing parent chat
-- ------------------------------------------------------------------------------
INSERT INTO messages (
    id, user_id, chat_id, sender_name, message_text, importance_score, priority, is_synthetic
) VALUES (
    'demo_msg_001', 'default_user', 'syn_chat_001@g.us', 'Demo Presenter', 
    'Live demonstration of Foreign Key integrity in WAAA', 85, 'high', 1
);

SELECT id, chat_id, sender_name, message_text, importance_score, priority
FROM messages
WHERE id = 'demo_msg_001';

-- ------------------------------------------------------------------------------
-- 6. DML UPDATE: Safely update message importance score
-- ------------------------------------------------------------------------------
UPDATE messages
SET importance_score = 92, priority = 'urgent'
WHERE id = 'demo_msg_001';

SELECT id, sender_name, importance_score, priority
FROM messages
WHERE id = 'demo_msg_001';

-- ------------------------------------------------------------------------------
-- 7. CONSTRAINT VIOLATION TESTS (Controlled Demonstrations):
-- ------------------------------------------------------------------------------
-- A. Foreign Key Violation: Inserting message for non-existent chat_id
-- Expected: ERROR 1452 (23000): Cannot add or update a child row (fk_messages_chat)
-- INSERT INTO messages (id, user_id, chat_id, sender_name, message_text)
-- VALUES ('demo_err_fk', 'default_user', 'invalid_nonexistent_chat@g.us', 'Attacker', 'Will fail');

-- B. Check Constraint Violation: Inserting importance_score > 100
-- Expected: ERROR 3819 (HY000): Check constraint 'chk_importance_score' is violated.
-- INSERT INTO messages (id, user_id, chat_id, sender_name, message_text, importance_score)
-- VALUES ('demo_err_chk', 'default_user', 'syn_chat_001@g.us', 'Tester', 'Will fail', 150);

-- ------------------------------------------------------------------------------
-- 8. DML DELETE: Cleanup temporary demo message
-- ------------------------------------------------------------------------------
DELETE FROM messages WHERE id = 'demo_msg_001';
