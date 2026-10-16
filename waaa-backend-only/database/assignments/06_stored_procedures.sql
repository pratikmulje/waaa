-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - DBMS ASSIGNMENT 6
-- Topic: Stored Procedures & Parameters (IN, OUT)
-- Database: MySQL 8.0+ (waaa_db)
-- ==============================================================================

USE waaa_db;

DELIMITER //

-- ------------------------------------------------------------------------------
-- 1. Procedure with IN Parameters: Retrieve Paginated Messages for a Given Chat
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_get_chat_messages //
CREATE PROCEDURE sp_get_chat_messages (
    IN p_chat_id VARCHAR(128),
    IN p_limit INT,
    IN p_offset INT
)
BEGIN
    SET p_limit = COALESCE(p_limit, 20);
    SET p_offset = COALESCE(p_offset, 0);

    SELECT 
        id, 
        sender_name, 
        message_text, 
        importance_score, 
        priority, 
        is_synthetic, 
        received_at
    FROM messages
    WHERE chat_id = p_chat_id
    ORDER BY received_at DESC
    LIMIT p_limit OFFSET p_offset;
END //

-- ------------------------------------------------------------------------------
-- 2. Procedure with OUT Parameters: Compute Chat Statistics via Session Variables
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_get_chat_stats //
CREATE PROCEDURE sp_get_chat_stats (
    IN p_chat_id VARCHAR(128),
    OUT p_total_messages INT,
    OUT p_avg_importance DECIMAL(5,2),
    OUT p_high_priority_count INT
)
BEGIN
    SELECT 
        COUNT(*), 
        COALESCE(AVG(importance_score), 0),
        COUNT(CASE WHEN importance_score >= 70 THEN 1 END)
    INTO 
        p_total_messages, 
        p_avg_importance,
        p_high_priority_count
    FROM messages
    WHERE chat_id = p_chat_id;
END //

-- ------------------------------------------------------------------------------
-- 3. Procedure: Filtered Pattern Search with Minimum Importance Threshold
-- ------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_search_messages //
CREATE PROCEDURE sp_search_messages (
    IN p_search_term VARCHAR(255),
    IN p_min_importance INT,
    IN p_limit INT
)
BEGIN
    SET p_min_importance = COALESCE(p_min_importance, 0);
    SET p_limit = COALESCE(p_limit, 20);

    SELECT 
        m.id,
        c.chat_name,
        m.sender_name,
        m.message_text,
        m.importance_score,
        m.received_at
    FROM messages m
    LEFT JOIN chats c ON m.chat_id = c.chat_id
    WHERE (m.message_text LIKE CONCAT('%', p_search_term, '%') OR m.sender_name LIKE CONCAT('%', p_search_term, '%'))
      AND m.importance_score >= p_min_importance
    ORDER BY m.importance_score DESC, m.received_at DESC
    LIMIT p_limit;
END //

DELIMITER ;

-- ------------------------------------------------------------------------------
-- 4. Demonstration Calls:
-- ------------------------------------------------------------------------------
-- Call Procedure 1: Fetch latest 5 messages from a designated chat
CALL sp_get_chat_messages('syn_chat_001@g.us', 5, 0);

-- Call Procedure 2: Extract statistics into OUT parameters and display
CALL sp_get_chat_stats('syn_chat_001@g.us', @total, @avg, @high);
SELECT 
    'syn_chat_001@g.us' AS target_chat,
    @total AS total_messages, 
    @avg AS avg_importance_score, 
    @high AS high_priority_messages;

-- Call Procedure 3: Search for messages containing 'project' with importance >= 50
CALL sp_search_messages('project', 50, 5);
