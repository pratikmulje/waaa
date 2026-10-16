-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - Sandbox Practice Schema
-- Target: MySQL 8.0+ | Database: waaa_practice_db
-- Purpose: Dedicated isolated sandbox for demonstrating destructive DDL
--          (ALTER, DROP, TRUNCATE) and constraint rejections for Assignment 1
--          without endangering real production WhatsApp data.
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS waaa_practice_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE waaa_practice_db;

-- Disposable clone of users for practice operations
CREATE TABLE IF NOT EXISTS practice_users (
    user_id VARCHAR(64) PRIMARY KEY,
    display_name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NULL UNIQUE,
    role ENUM('admin', 'user', 'viewer') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Disposable clone of chats for practice operations
CREATE TABLE IF NOT EXISTS practice_chats (
    chat_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    chat_name VARCHAR(255) NOT NULL,
    tier ENUM('starred', 'important', 'normal', 'low', 'ignored') NOT NULL DEFAULT 'normal',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_practice_chats_user FOREIGN KEY (user_id) REFERENCES practice_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Disposable clone of messages for practice operations
CREATE TABLE IF NOT EXISTS practice_messages (
    id VARCHAR(64) PRIMARY KEY,
    chat_id VARCHAR(128) NOT NULL,
    whatsapp_message_id VARCHAR(128) NOT NULL UNIQUE,
    sender_name VARCHAR(128) NOT NULL,
    message_text TEXT NOT NULL,
    urgency_level INT NOT NULL DEFAULT 0 CHECK (urgency_level BETWEEN 0 AND 100),
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_practice_messages_chat FOREIGN KEY (chat_id) REFERENCES practice_chats(chat_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
