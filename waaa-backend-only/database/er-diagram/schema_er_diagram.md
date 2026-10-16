# WAAA Relational Database — Entity-Relationship (ER) Diagram & Normalization Analysis

## 1. Complete Mermaid ER Diagram

```mermaid
erDiagram
    USERS ||--o{ CHATS : "manages"
    USERS ||--o{ CONTACTS : "resolves"
    USERS ||--o{ PROJECTS : "creates"
    USERS ||--o{ TASKS : "owns"
    USERS ||--o{ SUMMARIES : "generates"
    USERS ||--o{ JOBS : "runs"
    USERS ||--o{ DRAFTS : "requests"
    USERS ||--o{ ALERTS : "receives"
    USERS ||--o{ PROOFS : "signs"

    CHATS ||--o{ MESSAGES : "contains"
    CHATS ||--o{ TASKS : "originates"
    CHATS ||--o{ SUMMARIES : "summarizes"
    CHATS ||--o{ DRAFTS : "context for"
    CHATS ||--o{ ALERTS : "monitors"
    CHATS ||--o| CHAT_SETTINGS : "configured by"
    CHATS ||--o| CHAT_MEMORY : "tracked in"

    MESSAGES ||--|| MESSAGE_ANALYSIS : "analyzed by (1:1)"
    MESSAGES ||--o{ TASKS : "extracts"
    MESSAGES ||--o{ DRAFTS : "replies to"

    TASKS ||--o{ DEADLINES : "specifies"
    PROJECTS ||--o{ TASKS : "groups"
    CONTACTS ||--o{ TASKS : "assigned to"

    USERS {
        varchar user_id PK
        varchar display_name
        varchar email UK
        enum role
        timestamp created_at
        timestamp updated_at
    }

    CONTACTS {
        varchar contact_id PK
        varchar user_id FK
        varchar primary_jid UK
        varchar primary_name
        varchar phone_number
        varchar resolution_method
        decimal confidence
        boolean is_me
        json jids
        json names
        timestamp created_at
    }

    CHATS {
        varchar chat_id PK
        varchar user_id FK
        varchar chat_name
        enum chat_type
        enum tier
        enum tier_source
        boolean is_community
        int participant_count
        text last_message_text
        timestamp last_message_at
        boolean is_archived
    }

    MESSAGES {
        varchar id PK
        varchar user_id FK
        varchar chat_id FK
        varchar whatsapp_message_id
        varchar sender_name
        varchar sender_jid
        boolean is_from_me
        text message_text
        timestamp received_at
        boolean chat_priority
        timestamp created_at
    }

    MESSAGE_ANALYSIS {
        varchar analysis_id PK
        varchar message_id FK, UK
        int fraud_rule_score
        decimal fraud_ml_score
        int fraud_final_score
        enum fraud_risk_level
        enum fraud_phase
        json fraud_reasons
        int importance_rule_score
        decimal importance_ml_score
        int importance_final_score
        enum importance_level
        json importance_reasons
        timestamp created_at
    }

    PROJECTS {
        varchar project_id PK
        varchar user_id FK
        varchar name
        text description
        json aliases
        json people
        enum status
        timestamp created_at
    }

    TASKS {
        varchar task_id PK
        varchar user_id FK
        varchar chat_id FK
        varchar contact_id FK
        varchar project_id FK
        varchar source_message_id FK
        enum task_type
        text task_text
        enum responsibility
        varchar waiting_for_name
        varchar waiting_on_user_name
        enum status
        enum priority
        decimal confidence
        timestamp created_at
        timestamp completed_at
    }

    DEADLINES {
        varchar deadline_id PK
        varchar task_id FK
        datetime due_at
        varchar deadline_text
        int urgency_score
        int reminders_sent
        boolean is_completed
        timestamp completed_at
    }

    SUMMARIES {
        varchar summary_id PK
        varchar user_id FK
        varchar chat_id FK
        enum summary_type
        varchar cache_key
        text summary_text
        varchar current_topic
        json key_points
        json decisions
        json action_items
        int token_count
        timestamp created_at
    }

    JOBS {
        varchar job_id PK
        varchar user_id FK
        varchar job_type
        enum status
        varchar current_chat_id
        int total_units
        int processed_units
        int current_key_index
        json checkpoint_data
        json units
        text last_error
        timestamp created_at
    }

    DRAFTS {
        varchar draft_id PK
        varchar user_id FK
        varchar chat_id FK
        varchar in_reply_to_message_id FK
        text draft_text
        enum tone
        enum status
        timestamp created_at
    }

    ALERTS {
        varchar alert_id PK
        varchar user_id FK
        varchar chat_id FK
        enum alert_type
        enum severity
        varchar title
        text message
        boolean is_acknowledged
        timestamp created_at
    }

    PROOFS {
        varchar proof_id PK
        varchar user_id FK
        varchar record_type
        varchar record_id
        char content_hash
        enum blockchain_status
        varchar transaction_id
        bigint block_number
        varchar network
        timestamp created_at
    }

    AUDIT_LOGS {
        bigint log_id PK
        varchar table_name
        enum action_type
        varchar record_id
        varchar changed_by
        json old_values
        json new_values
        timestamp created_at
    }

    BEHAVIOR_MESSAGES {
        varchar id PK
        varchar chat_id
        varchar chat_name
        text text
        text normalized_text
        varchar whatsapp_message_id
        int hour
        varchar weekday
        timestamp timestamp
    }

    BEHAVIOR_PATTERNS {
        varchar id PK
        varchar pattern_type
        text template
        text example_message
        int hour
        json recipients
        int recipient_count
        int frequency
    }

    CHAT_MEMORY {
        varchar id PK
        varchar chat_id UK
        json active_topics
        json entities
        json pending
        text recent_summary
        json word_freq
        timestamp updated_at
    }

    CHAT_SETTINGS {
        varchar id PK
        varchar chat_id UK
        boolean priority
        enum priority_level
        timestamp updated_at
    }

    MEDIA_ANALYSIS {
        varchar analysis_id PK
        varchar message_id
        varchar chat_id
        varchar chat_name
        varchar sender
        varchar sender_jid
        varchar mime_type
        bigint file_size_bytes
        char sha256
        text caption
        text extracted_text
        text analysis
        json tags
        boolean is_doc
        boolean is_image
        timestamp received_at
    }

    SYSTEM_METADATA {
        varchar id PK
        varchar status
        text qr
        timestamp qr_generated_at
        text last_error
        timestamp connected_at
        timestamp updated_at
    }

    USER_TEST_FIXTURES {
        int fixture_id PK
        varchar user_id
        varchar fixture_name
        varchar record_id
        json payload
        timestamp created_at
    }
```

---

## 2. Relational Cardinalities & Business Rules

1. **Users $\longleftrightarrow$ Chats ($1 : N$)**: A user owns multiple chats. `ON DELETE RESTRICT` ensures an account cannot be deleted if active conversations are attached.
2. **Chats $\longleftrightarrow$ Messages ($1 : N$)**: A conversation contains many sequential messages. `ON DELETE RESTRICT` guarantees that no WhatsApp communication history can ever be accidentally purged. Chats are instead marked with `is_archived = TRUE`.
3. **Messages $\longleftrightarrow$ Message_Analysis ($1 : 1$)**: Strict 3NF satellite table. Isolates mutable NLP and machine learning scores from immutable WhatsApp message bytes. If a message is explicitly purged, its analysis cascades (`CASCADE`).
4. **Chats/Projects/Contacts $\longleftrightarrow$ Tasks ($1 : N$)**: Tasks originate from conversations, link to an optional project, and are assigned to an optional contact. If a project or contact is deleted, the task remains intact with foreign keys set to `NULL` (`ON DELETE SET NULL`).
5. **Tasks $\longleftrightarrow$ Deadlines ($1 : N$)**: Tasks have deadline reminders and urgency escalation scores ($0$ to $100$). Deleting a task cascades to its deadline records.
6. **Messages $\longleftrightarrow$ Drafts ($1 : N$)**: Multiple draft replies with varying tones (professional, concise, friendly) can be generated for a single message.
7. **Intelligence Records $\longleftrightarrow$ Proofs ($1 : 1$)**: Canonical SHA-256 hashes generated for actions, summaries, and audit checkpoints to detect data tampering.

---

## 3. Database Normalization Decisions (3NF Compliance)

### First Normal Form (1NF):
- Every table has a primary key (`id`, `task_id`, `chat_id`, etc.).
- Attributes contain atomic values. Repeated multi-value collections (such as arbitrary metadata) are stored in validated JSON columns rather than unparsed comma-delimited strings.

### Second Normal Form (2NF):
- All non-key attributes are fully functionally dependent on the entire primary key (no composite primary key partial dependencies).
- For example, `chat_name` and `chat_type` are stored in `chats`, not repeated across `messages`.

### Third Normal Form (3NF):
- Transitive dependencies are removed.
- In the legacy JSON store, each message document embedded `fraudAnalysis` and `importanceAnalysis` sub-objects. These have been normalized into a dedicated `message_analysis` table, ensuring that analysis scores depend directly on the primary key `analysis_id` and the foreign key `message_id`.

---

## 4. Constraint Enforcement Matrix

| Table | Constraint Name | Type | Target / Rule |
| :--- | :--- | :---: | :--- |
| `contacts` | `chk_contacts_confidence` | `CHECK` | `confidence BETWEEN 0.000 AND 1.000` |
| `contacts` | `uk_contacts_jid` | `UNIQUE` | `primary_jid` |
| `messages` | `idx_messages_wa_msg_id` | `INDEX` | `whatsapp_message_id` (indexed for rapid lookups without dropping historical duplicate notify emissions) |
| `message_analysis`| `uk_analysis_message` | `UNIQUE` | `message_id` (enforces exact 1:1 relationship) |
| `deadlines` | `chk_deadlines_urgency` | `CHECK` | `urgency_score BETWEEN 0 AND 100` |
| `tasks` | `chk_tasks_confidence` | `CHECK` | `confidence BETWEEN 0.000 AND 1.000` |
| `chat_memory` | `uk_chat_memory_chat` | `UNIQUE` | `chat_id` |
| `chat_settings`| `uk_chat_settings_chat` | `UNIQUE` | `chat_id` |
| `users` | `uk_users_email` | `UNIQUE` | `email` |
