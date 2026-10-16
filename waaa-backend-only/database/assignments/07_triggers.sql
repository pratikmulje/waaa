-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - DBMS ASSIGNMENT 7
-- Topic: Database Triggers & Automated Audit Logging
-- Database: MySQL 8.0+ (waaa_db)
-- ==============================================================================

USE waaa_db;

-- ------------------------------------------------------------------------------
-- 1. Ensure Audit Log Table Exists
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action_type ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    table_name VARCHAR(64) NOT NULL,
    record_id VARCHAR(64) NOT NULL,
    details TEXT NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    changed_by VARCHAR(64) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_table (table_name),
    INDEX idx_audit_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER //

-- ------------------------------------------------------------------------------
-- 2. Trigger: Automatically log an entry AFTER INSERT on messages
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_after_message_insert //
CREATE TRIGGER trg_after_message_insert
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (action_type, table_name, record_id, details, new_values)
    VALUES (
        'INSERT', 
        'messages', 
        NEW.id, 
        CONCAT('Sender: ', NEW.sender_name, ' | Chat: ', NEW.chat_id, ' | Score: ', NEW.importance_score),
        JSON_OBJECT(
            'sender', NEW.sender_name, 
            'chat_id', NEW.chat_id, 
            'importance_score', NEW.importance_score,
            'priority', NEW.priority
        )
    );
END //

-- ------------------------------------------------------------------------------
-- 3. Trigger: Automatically capture snapshot BEFORE DELETE on messages
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_before_message_delete //
CREATE TRIGGER trg_before_message_delete
BEFORE DELETE ON messages
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (action_type, table_name, record_id, details, old_values)
    VALUES (
        'DELETE', 
        'messages', 
        OLD.id, 
        CONCAT('Deleted message from: ', OLD.sender_name, ' | Chat: ', OLD.chat_id),
        JSON_OBJECT(
            'sender', OLD.sender_name, 
            'chat_id', OLD.chat_id, 
            'importance_score', OLD.importance_score
        )
    );
END //

-- ------------------------------------------------------------------------------
-- 4. Trigger: Track status transitions AFTER UPDATE on tasks
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_after_task_update //
CREATE TRIGGER trg_after_task_update
AFTER UPDATE ON tasks
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO audit_logs (action_type, table_name, record_id, details, old_values, new_values)
        VALUES (
            'UPDATE', 
            'tasks', 
            NEW.task_id, 
            CONCAT('Status changed from ', OLD.status, ' to ', NEW.status),
            JSON_OBJECT('status', OLD.status),
            JSON_OBJECT('status', NEW.status)
        );
    END IF;
END //

DELIMITER ;

-- ------------------------------------------------------------------------------
-- 5. Trigger Execution Demonstration:
-- ------------------------------------------------------------------------------
-- Step A: Insert a message to trigger AFTER INSERT event
INSERT INTO messages (
    id, user_id, chat_id, sender_name, message_text, importance_score, priority, is_synthetic
) VALUES (
    'demo_trg_event', 'default_user', 'syn_chat_001@g.us', 'Trigger Demo User', 
    'This message automatically generates an audit log row!', 88, 'high', 1
);

-- Step B: Inspect audit_logs to verify trigger fired automatically
SELECT log_id, action_type, table_name, record_id, details, new_values, created_at
FROM audit_logs
WHERE record_id = 'demo_trg_event';

-- Step C: Delete the message to trigger BEFORE DELETE event
DELETE FROM messages WHERE id = 'demo_trg_event';

-- Step D: Verify both INSERT and DELETE events are recorded in audit_logs
SELECT log_id, action_type, table_name, record_id, details, old_values, new_values, created_at
FROM audit_logs
WHERE record_id = 'demo_trg_event'
ORDER BY log_id ASC;
