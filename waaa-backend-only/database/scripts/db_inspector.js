/*
==============================================================================
WAAA - Database Inspector & Query Utility
==============================================================================
Provides safe, comprehensive MySQL schema inspection and dynamic table
exploration for WAAA DBMS Demonstrations:
  - Whitelist validation on table and column identifiers (SQL injection prevention)
  - Full schema metadata: columns, types, nullability, keys, foreign keys, indexes
  - Configurable query engine: projection (cols), pagination (limit/offset), sorting, filtering, searching
  - Database overview stats with real vs. synthetic data breakdown
==============================================================================
*/

import mysql from "mysql2/promise";
import { getPoolConfig } from "../../src/db/mysqlClient.js";

/**
 * Returns a connection pool to waaa_db.
 */
function getPool() {
  return mysql.createPool(getPoolConfig());
}

/**
 * Lists all tables and views in waaa_db.
 */
export async function getAllTables() {
  const pool = getPool();
  try {
    const [rows] = await pool.query(`
      SELECT 
        TABLE_NAME AS name, 
        TABLE_TYPE AS type, 
        COALESCE(TABLE_ROWS, 0) AS estimated_rows,
        ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 1) AS size_kb
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_TYPE ASC, TABLE_NAME ASC;
    `);
    return rows;
  } finally {
    await pool.end();
  }
}

/**
 * Retrieves comprehensive schema information for a given table or view.
 * @param {string} tableName
 */
export async function getTableSchema(tableName) {
  const pool = getPool();
  try {
    // 1. Verify table exists
    const [tables] = await pool.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );

    if (!tables.length) {
      throw new Error(`Table or View '${tableName}' not found in database.`);
    }

    const tableType = tables[0].TABLE_TYPE;

    // 2. Fetch Columns
    const [columns] = await pool.query(
      `SELECT 
        COLUMN_NAME AS name,
        COLUMN_TYPE AS type,
        DATA_TYPE AS data_type,
        IS_NULLABLE AS nullable,
        COLUMN_KEY AS \`key\`,
        COLUMN_DEFAULT AS \`default\`,
        EXTRA AS extra
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION ASC`,
      [tableName]
    );

    // 3. Fetch Foreign Keys
    const [foreignKeys] = await pool.query(
      `SELECT 
        k.CONSTRAINT_NAME AS constraint_name,
        k.COLUMN_NAME AS column_name,
        k.REFERENCED_TABLE_NAME AS referenced_table,
        k.REFERENCED_COLUMN_NAME AS referenced_column,
        r.UPDATE_RULE AS update_rule,
        r.DELETE_RULE AS delete_rule
      FROM information_schema.KEY_COLUMN_USAGE k
      LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r 
        ON k.CONSTRAINT_NAME = r.CONSTRAINT_NAME AND k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
      WHERE k.TABLE_SCHEMA = DATABASE() 
        AND k.TABLE_NAME = ? 
        AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
      [tableName]
    );

    // 4. Fetch Indexes
    let indexes = [];
    if (tableType === "BASE TABLE") {
      const [idxRows] = await pool.query(`SHOW INDEX FROM \`${tableName.replace(/`/g, "")}\``);
      const indexMap = new Map();
      for (const row of idxRows) {
        if (!indexMap.has(row.Key_name)) {
          indexMap.set(row.Key_name, {
            name: row.Key_name,
            unique: row.Non_unique === 0,
            columns: [],
          });
        }
        indexMap.get(row.Key_name).columns.push(row.Column_name);
      }
      indexes = Array.from(indexMap.values());
    }

    // 5. Total Row Count
    const [[{ total_count }]] = await pool.query(`SELECT COUNT(*) AS total_count FROM \`${tableName.replace(/`/g, "")}\``);

    return {
      tableName,
      tableType,
      rowCount: Number(total_count),
      columns,
      foreignKeys,
      indexes,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Safely queries a table with configurable projection, pagination, sorting, filtering, and search.
 * @param {object} options
 * @param {string} options.table - Target table name
 * @param {string|string[]} [options.cols] - Specific columns to select
 * @param {number} [options.limit=20] - Number of records to return
 * @param {number} [options.offset=0] - Offset / starting position
 * @param {string} [options.sort] - Column and direction, e.g. "importance_score DESC"
 * @param {string} [options.filter] - Custom SQL WHERE condition e.g. "importance_score >= 50"
 * @param {string} [options.search] - Substring to search in textual columns
 */
export async function queryTable(options = {}) {
  const pool = getPool();
  try {
    const rawTable = options.table;
    if (!rawTable) {
      throw new Error("Target table name is required for query.");
    }

    // 1. Validate Table exists (whitelist check)
    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [rawTable]
    );
    if (!tables.length) {
      throw new Error(`Table '${rawTable}' does not exist.`);
    }
    const safeTable = `\`${rawTable.replace(/`/g, "")}\``;

    // 2. Fetch valid column names for projection validation
    const [validCols] = await pool.query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [rawTable]
    );
    const validColNames = new Set(validCols.map((c) => c.COLUMN_NAME));
    const textCols = validCols
      .filter((c) => ["varchar", "text", "char", "enum"].includes(c.DATA_TYPE.toLowerCase()))
      .map((c) => c.COLUMN_NAME);

    // 3. Resolve Selected Columns
    let selectClause = "*";
    let selectedColList = Array.from(validColNames);
    if (options.cols) {
      const requested = Array.isArray(options.cols)
        ? options.cols
        : options.cols.split(",").map((s) => s.trim()).filter(Boolean);

      const approved = requested.filter((c) => validColNames.has(c));
      if (approved.length > 0) {
        selectClause = approved.map((c) => `\`${c}\``).join(", ");
        selectedColList = approved;
      }
    }

    // 4. Build WHERE conditions
    const whereConditions = [];
    const queryParams = [];

    // Custom filter expression (safe check)
    if (options.filter && typeof options.filter === "string") {
      const trimmedFilter = options.filter.trim();
      // Basic sanity check to avoid obvious malicious injection
      if (!/;/.test(trimmedFilter) && !/--/.test(trimmedFilter)) {
        whereConditions.push(`(${trimmedFilter})`);
      }
    }

    // Substring Search across textual columns
    if (options.search && typeof options.search === "string" && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      const searchClauses = textCols.map((col) => `\`${col}\` LIKE ?`);
      if (searchClauses.length > 0) {
        whereConditions.push(`(${searchClauses.join(" OR ")})`);
        textCols.forEach(() => queryParams.push(term));
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // 5. Total Count query for the filter
    const countSql = `SELECT COUNT(*) AS total FROM ${safeTable} ${whereClause}`;
    const [[{ total: totalMatching }]] = await pool.query(countSql, queryParams);

    // 6. Resolve Sorting
    let orderClause = "";
    if (options.sort && typeof options.sort === "string") {
      const parts = options.sort.trim().split(/\s+/);
      const sortCol = parts[0];
      const sortDir = (parts[1] || "ASC").toUpperCase();
      if (validColNames.has(sortCol) && (sortDir === "ASC" || sortDir === "DESC")) {
        orderClause = `ORDER BY \`${sortCol}\` ${sortDir}`;
      }
    }

    // 7. Resolve Pagination
    const limit = Math.min(Math.max(Number(options.limit || options.rows || 20), 1), 500);
    const offset = Math.max(Number(options.offset || 0), 0);

    const finalSql = `SELECT ${selectClause} FROM ${safeTable} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const finalParams = [...queryParams, limit, offset];

    const startTime = Date.now();
    const [rows] = await pool.query(finalSql, finalParams);
    const executionTimeMs = Date.now() - startTime;

    return {
      table: rawTable,
      columns: selectedColList,
      totalCount: Number(totalMatching),
      returnedCount: rows.length,
      limit,
      offset,
      executionTimeMs,
      sql: pool.format(finalSql, finalParams),
      rows,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Returns a high-level summary of the database: total tables, message breakdown, etc.
 */
export async function getDatabaseStats() {
  const pool = getPool();
  try {
    const [tables] = await pool.query(`
      SELECT 
        TABLE_TYPE, 
        COUNT(*) AS count 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      GROUP BY TABLE_TYPE
    `);

    const baseTableCount = tables.find((t) => t.TABLE_TYPE === "BASE TABLE")?.count || 0;
    const viewCount = tables.find((t) => t.TABLE_TYPE === "VIEW")?.count || 0;

    // Routine counts
    const [procs] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE'`
    );
    const [triggers] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`
    );

    // Messages breakdown
    const [[msgStats]] = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN is_synthetic = 0 THEN 1 END) AS real_count,
        COUNT(CASE WHEN is_synthetic = 1 THEN 1 END) AS synthetic_count,
        ROUND(AVG(importance_score), 1) AS avg_importance,
        COUNT(CASE WHEN importance_score >= 70 THEN 1 END) AS high_importance_count
      FROM messages
    `);

    // Chats breakdown
    const [[chatStats]] = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN is_synthetic = 0 THEN 1 END) AS real_count,
        COUNT(CASE WHEN is_synthetic = 1 THEN 1 END) AS synthetic_count
      FROM chats
    `);

    // Other counts
    const [[{ taskCount }]] = await pool.query("SELECT COUNT(*) AS taskCount FROM tasks");
    const [[{ userCount }]] = await pool.query("SELECT COUNT(*) AS userCount FROM users");
    const [[{ auditCount }]] = await pool.query("SELECT COUNT(*) AS auditCount FROM audit_logs");

    return {
      databaseName: "waaa_db",
      baseTables: baseTableCount,
      views: viewCount,
      procedures: procs[0]?.c || 0,
      triggers: triggers[0]?.c || 0,
      messages: {
        total: Number(msgStats.total),
        real: Number(msgStats.real_count),
        synthetic: Number(msgStats.synthetic_count),
        avgImportance: Number(msgStats.avg_importance),
        highImportance: Number(msgStats.high_importance_count),
      },
      chats: {
        total: Number(chatStats.total),
        real: Number(chatStats.real_count),
        synthetic: Number(chatStats.synthetic_count),
      },
      users: Number(userCount),
      tasks: Number(taskCount),
      auditLogs: Number(auditCount),
    };
  } finally {
    await pool.end();
  }
}
