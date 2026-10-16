-- ==============================================================================
-- WAAA (WhatsApp AI Assistant) - Initial Production Relational Schema
-- Target: MySQL 8.0+ | Engine: InnoDB | Charset: utf8mb4_unicode_ci
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS waaa_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE waaa_db;

-- 1. USERS: User contexts and application accounts
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NULL,
    role ENUM('admin', 'user', 'viewer') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. CONTACTS: Resolved WhatsApp identities and people
CREATE TABLE IF NOT EXISTS contacts (
    contact_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    primary_jid VARCHAR(128) NOT NULL,
    primary_name VARCHAR(128) NOT NULL,
    phone_number VARCHAR(32) NULL,
    resolution_method VARCHAR(64) NOT NULL DEFAULT 'PERSONAL_CHAT_JID',
    confidence DECIMAL(4,3) NOT NULL DEFAULT 1.000,
    is_me BOOLEAN NOT NULL DEFAULT FALSE,
    jids JSON NULL,
    names JSON NULL,
    identity_candidates JSON NULL,
    manual_aliases JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (contact_id),
    UNIQUE KEY uk_contacts_jid (primary_jid),
    CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_contacts_confidence CHECK (confidence BETWEEN 0.000 AND 1.000),
    INDEX idx_contacts_user (user_id),
    INDEX idx_contacts_name (primary_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. CHATS: WhatsApp conversations (personal, group, broadcast, community)
CREATE TABLE IF NOT EXISTS chats (
    chat_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    chat_name VARCHAR(255) NOT NULL,
    chat_type ENUM('personal', 'group', 'broadcast', 'community') NOT NULL DEFAULT 'personal',
    tier ENUM('starred', 'important', 'normal', 'low', 'ignored') NOT NULL DEFAULT 'normal',
    tier_source ENUM('auto_detected', 'user_override') NOT NULL DEFAULT 'auto_detected',
    is_community BOOLEAN NOT NULL DEFAULT FALSE,
    participant_count INT NULL,
    linked_parent VARCHAR(128) NULL,
    last_message_text TEXT NULL,
    last_message_at TIMESTAMP NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id),
    CONSTRAINT fk_chats_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_chats_user_tier (user_id, tier),
    INDEX idx_chats_type (chat_type),
    INDEX idx_chats_last_msg (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. MESSAGES: Inbound and outbound message telemetry
-- NOTE: Primary key is the internal 'id'. 'whatsapp_message_id' is indexed without unique constraint
-- to ensure historical duplicate notify emissions are preserved safely.
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    whatsapp_message_id VARCHAR(128) NOT NULL,
    sender_name VARCHAR(128) NOT NULL,
    sender_jid VARCHAR(128) NOT NULL,
    is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
    message_text TEXT NOT NULL,
    received_at TIMESTAMP NOT NULL,
    chat_priority BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_messages_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_messages_wa_msg_id (whatsapp_message_id),
    INDEX idx_messages_chat_recv (chat_id, received_at),
    INDEX idx_messages_user_recv (user_id, received_at),
    INDEX idx_messages_sender (sender_jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. MESSAGE_ANALYSIS: AI/ML telemetry (1:1 with messages, 3NF normalization)
CREATE TABLE IF NOT EXISTS message_analysis (
    analysis_id VARCHAR(64) NOT NULL,
    message_id VARCHAR(64) NOT NULL,
    fraud_rule_score INT NOT NULL DEFAULT 0,
    fraud_ml_score DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    fraud_final_score INT NOT NULL DEFAULT 0,
    fraud_risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
    fraud_phase ENUM('NORMAL', 'GROOMING', 'PRIMING', 'CRITICAL_ASK', 'PRESSURE') NOT NULL DEFAULT 'NORMAL',
    fraud_reasons JSON NULL,
    importance_rule_score INT NOT NULL DEFAULT 0,
    importance_ml_score DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    importance_final_score INT NOT NULL DEFAULT 0,
    importance_level ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    importance_reasons JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (analysis_id),
    UNIQUE KEY uk_analysis_message (message_id),
    CONSTRAINT fk_analysis_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_analysis_fraud (fraud_risk_level, fraud_final_score),
    INDEX idx_analysis_importance (importance_level, importance_final_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. PROJECTS: Cross-chat project contexts
CREATE TABLE IF NOT EXISTS projects (
    project_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT NULL,
    aliases JSON NULL,
    people JSON NULL,
    status ENUM('active', 'paused', 'completed', 'archived') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id),
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_projects_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. TASKS: Extracted commitments, tasks, blockers, and decisions
CREATE TABLE IF NOT EXISTS tasks (
    task_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    contact_id VARCHAR(64) NULL,
    project_id VARCHAR(64) NULL,
    source_message_id VARCHAR(64) NULL,
    task_type ENUM('action', 'task', 'commitment', 'blocker', 'decision') NOT NULL DEFAULT 'task',
    task_text TEXT NOT NULL,
    responsibility ENUM('user', 'waiting_for_person', 'someone_waiting_for_user', 'team', 'unassigned') NOT NULL DEFAULT 'unassigned',
    waiting_for_name VARCHAR(128) NULL,
    waiting_on_user_name VARCHAR(128) NULL,
    status ENUM('pending', 'waiting', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    confidence DECIMAL(4,3) NOT NULL DEFAULT 0.900,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    PRIMARY KEY (task_id),
    CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_tasks_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_tasks_contact FOREIGN KEY (contact_id) REFERENCES contacts(contact_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_tasks_message FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_tasks_confidence CHECK (confidence BETWEEN 0.000 AND 1.000),
    INDEX idx_tasks_status (user_id, status),
    INDEX idx_tasks_chat (chat_id),
    INDEX idx_tasks_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. DEADLINES: Due dates and urgency score tracking
CREATE TABLE IF NOT EXISTS deadlines (
    deadline_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    due_at DATETIME NOT NULL,
    deadline_text VARCHAR(255) NULL,
    urgency_score INT NOT NULL DEFAULT 0,
    reminders_sent INT NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (deadline_id),
    CONSTRAINT fk_deadlines_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_deadlines_urgency CHECK (urgency_score BETWEEN 0 AND 100),
    INDEX idx_deadlines_due (due_at, is_completed),
    INDEX idx_deadlines_urgency (urgency_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. SUMMARIES: Rolling chunk, chat, and date range window summaries
CREATE TABLE IF NOT EXISTS summaries (
    summary_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    summary_type ENUM('chunk', 'chat', 'range') NOT NULL DEFAULT 'chunk',
    cache_key VARCHAR(128) NULL,
    summary_text TEXT NOT NULL,
    current_topic VARCHAR(255) NULL,
    key_points JSON NULL,
    decisions JSON NULL,
    action_items JSON NULL,
    token_count INT NOT NULL DEFAULT 0,
    start_at TIMESTAMP NULL,
    end_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (summary_id),
    CONSTRAINT fk_summaries_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_summaries_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_summaries_chat_type (chat_id, summary_type, created_at),
    INDEX idx_summaries_cache_key (cache_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. JOBS: Background resumable queue and checkpoint execution states
-- NOTE: current_chat_id is NOT foreign-key constrained to chats to preserve unit-test records (chat_a, chat_b).
CREATE TABLE IF NOT EXISTS jobs (
    job_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    job_type VARCHAR(64) NOT NULL,
    status ENUM('pending', 'running', 'paused', 'done', 'failed') NOT NULL DEFAULT 'pending',
    current_chat_id VARCHAR(128) NULL,
    total_units INT NOT NULL DEFAULT 0,
    processed_units INT NOT NULL DEFAULT 0,
    current_key_index INT NOT NULL DEFAULT 0,
    checkpoint_data JSON NULL,
    units JSON NULL,
    last_error TEXT NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id),
    CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_jobs_status (status, job_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. DRAFTS: AI-generated smart draft replies
CREATE TABLE IF NOT EXISTS drafts (
    draft_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    in_reply_to_message_id VARCHAR(64) NULL,
    draft_text TEXT NOT NULL,
    tone ENUM('professional', 'friendly', 'concise', 'urgent') NOT NULL DEFAULT 'professional',
    status ENUM('generated', 'accepted', 'rejected', 'sent') NOT NULL DEFAULT 'generated',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (draft_id),
    CONSTRAINT fk_drafts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_drafts_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_drafts_message FOREIGN KEY (in_reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. ALERTS: Watches, keyword monitors, and risk warnings
CREATE TABLE IF NOT EXISTS alerts (
    alert_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    chat_id VARCHAR(128) NULL,
    alert_type ENUM('fraud_progression', 'deadline_approaching', 'deadline_overdue', 'watch_keyword', 'quota_warning') NOT NULL,
    severity ENUM('info', 'warning', 'high', 'critical') NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (alert_id),
    CONSTRAINT fk_alerts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_alerts_chat FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_alerts_user (user_id, is_acknowledged, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. PROOFS: Cryptographic SHA-256 hashes and blockchain audit records
CREATE TABLE IF NOT EXISTS proofs (
    proof_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    record_type VARCHAR(64) NOT NULL,
    record_id VARCHAR(64) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    blockchain_status ENUM('LOCAL_VERIFIED', 'ON_CHAIN_CONFIRMED', 'PENDING_SUBMISSION', 'FAILED') NOT NULL DEFAULT 'LOCAL_VERIFIED',
    transaction_id VARCHAR(128) NULL,
    block_number BIGINT NULL,
    network VARCHAR(64) NOT NULL DEFAULT 'local_proof_registry',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (proof_id),
    CONSTRAINT fk_proofs_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_proofs_hash (content_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. AUDIT_LOGS: System audit trail populated by application events & database triggers
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id BIGINT AUTO_INCREMENT NOT NULL,
    table_name VARCHAR(64) NOT NULL,
    action_type ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    record_id VARCHAR(64) NOT NULL,
    changed_by VARCHAR(64) NOT NULL DEFAULT 'system',
    old_values JSON NULL,
    new_values JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id),
    INDEX idx_audit_table_rec (table_name, record_id),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. BEHAVIOR_MESSAGES: Outgoing message history for behavioral learning (from behaviorMessages.json)
CREATE TABLE IF NOT EXISTS behavior_messages (
    id VARCHAR(64) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    chat_name VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    whatsapp_message_id VARCHAR(128) NOT NULL,
    hour INT NOT NULL,
    weekday VARCHAR(16) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_behav_chat (chat_id),
    INDEX idx_behav_hour_day (hour, weekday)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. BEHAVIOR_PATTERNS: Detected repetitive communication patterns (from behaviorPatterns.json)
CREATE TABLE IF NOT EXISTS behavior_patterns (
    id VARCHAR(64) NOT NULL,
    pattern_type VARCHAR(64) NOT NULL,
    template TEXT NOT NULL,
    example_message TEXT NOT NULL,
    hour INT NOT NULL,
    recipients JSON NOT NULL,
    recipient_count INT NOT NULL,
    frequency INT NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. CHAT_MEMORY: Per-chat semantic topics and word frequencies (from chatMemory.json)
CREATE TABLE IF NOT EXISTS chat_memory (
    id VARCHAR(128) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    active_topics JSON NULL,
    entities JSON NULL,
    pending JSON NULL,
    recent_summary TEXT NULL,
    word_freq JSON NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_chat_memory_chat (chat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. CHAT_SETTINGS: Per-chat priority settings and manual overrides (from chatSettings.json)
CREATE TABLE IF NOT EXISTS chat_settings (
    id VARCHAR(128) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    priority BOOLEAN NOT NULL DEFAULT FALSE,
    priority_level ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_chat_settings_chat (chat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. MEDIA_ANALYSIS: Multimodal OCR and image analysis records (from mediaAnalysis.json)
CREATE TABLE IF NOT EXISTS media_analysis (
    analysis_id VARCHAR(64) NOT NULL,
    message_id VARCHAR(64) NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    chat_name VARCHAR(255) NULL,
    sender VARCHAR(128) NULL,
    sender_jid VARCHAR(128) NULL,
    mime_type VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    sha256 CHAR(64) NULL,
    caption TEXT NULL,
    extracted_text TEXT NULL,
    analysis TEXT NULL,
    tags JSON NULL,
    is_doc BOOLEAN NOT NULL DEFAULT FALSE,
    is_image BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (analysis_id),
    INDEX idx_media_chat (chat_id),
    INDEX idx_media_msg (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. SYSTEM_METADATA: WhatsApp connection state and system checkpoints (from system.json)
CREATE TABLE IF NOT EXISTS system_metadata (
    id VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    qr TEXT NULL,
    qr_generated_at TIMESTAMP NULL,
    last_error TEXT NULL,
    connected_at TIMESTAMP NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. USER_TEST_FIXTURES: Preserves user test directory fixtures (data/users/*)
CREATE TABLE IF NOT EXISTS user_test_fixtures (
    fixture_id INT AUTO_INCREMENT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    fixture_name VARCHAR(64) NOT NULL,
    record_id VARCHAR(64) NOT NULL,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fixture_id),
    INDEX idx_test_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
