-- ============================================================
-- DBMS ASSIGNMENT 6: STORED PROCEDURES
-- Project: WAAA (WhatsApp AI Assistant)
-- ============================================================

DELIMITER //

-- Procedure to retrieve paginated messages for a given chat
CREATE PROCEDURE sp_get_chat_messages (
    IN p_chat_id VARCHAR(128)
)
BEGIN
    SELECT id, sender, text, importance_score, received_at
    FROM messages
    WHERE chat_id = p_chat_id
    ORDER BY received_at DESC;
END //

-- Procedure with OUT parameter to calculate message statistics
CREATE PROCEDURE sp_get_chat_stats (
    IN p_chat_id VARCHAR(128),
    OUT p_total_messages INT,
    OUT p_avg_importance DECIMAL(5,2)
)
BEGIN
    SELECT COUNT(*), COALESCE(AVG(importance_score), 0)
    INTO p_total_messages, p_avg_importance
    FROM messages
    WHERE chat_id = p_chat_id;
END //

DELIMITER ;

-- CALL Demonstration:
CALL sp_get_chat_messages('120363426662545775@g.us');
CALL sp_get_chat_stats('120363426662545775@g.us', @total, @avg);
SELECT @total AS total_messages, @avg AS avg_importance_score;
