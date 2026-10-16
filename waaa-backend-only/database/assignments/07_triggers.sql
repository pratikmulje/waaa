-- ============================================================
-- DBMS ASSIGNMENT 7: DATABASE TRIGGERS
-- Project: WAAA (WhatsApp AI Assistant)
-- ============================================================

-- Create an audit table to capture trigger events
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(16) NOT NULL,
    table_name VARCHAR(64) NOT NULL,
    record_id VARCHAR(64) NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DELIMITER //

-- Trigger: Fires AFTER INSERT on messages to record an audit log entry
CREATE TRIGGER trg_after_message_insert
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (action_type, table_name, record_id)
    VALUES ('INSERT', 'messages', NEW.id);
END //

-- Trigger: Fires BEFORE DELETE on messages to log deletion metadata
CREATE TRIGGER trg_before_message_delete
BEFORE DELETE ON messages
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (action_type, table_name, record_id)
    VALUES ('DELETE', 'messages', OLD.id);
END //

DELIMITER ;

-- Verification Demonstration:
-- 1. Insert a message (Trigger fires automatically)
INSERT INTO messages (id, chat_id, sender, message_text, importance_score)
VALUES ('m_test_trg', 'c_101', 'SystemBot', 'Testing trigger execution', 60);

-- 2. Verify that audit_logs contains the auto-created record
SELECT * FROM audit_logs ORDER BY log_id DESC LIMIT 5;
