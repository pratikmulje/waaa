/*
==============================================================================
WAAA - MySQL Database Client & Connection Pool Manager
==============================================================================
Provides high-performance, resilient MySQL 8.0+ access for WAAA:
  - Uses mysql2/promise connection pooling
  - Parameterized SQL execution preventing SQL injection
  - ACID transaction wrapper with automatic ROLLBACK on error
  - Health check and graceful shutdown integration
==============================================================================
*/

import "dotenv/config";
import mysql from "mysql2/promise";

let pool = null;

export function getPoolConfig(overrideDatabase = null) {
  return {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: overrideDatabase || process.env.MYSQL_DATABASE || "waaa_db",
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 10,
    waitForConnections: true,
    queueLimit: 0,
    timezone: "Z",
    charset: "utf8mb4",
    multipleStatements: true, // Needed for schema migrations and assignment scripts
  };
}

/**
 * Returns the singleton connection pool. Initializes on first invocation.
 */
export function getPool(overrideDatabase = null) {
  if (overrideDatabase) {
    return mysql.createPool(getPoolConfig(overrideDatabase));
  }
  if (!pool) {
    pool = mysql.createPool(getPoolConfig());
  }
  return pool;
}

/**
 * Executes a parameterized SQL query using the connection pool.
 * @param {string} sql - Parameterized SQL string with ? placeholders
 * @param {Array} [params] - Values to bind
 * @returns {Promise<[Array, Array]>} [rows, fields]
 */
export async function query(sql, params = []) {
  const p = getPool();
  return p.query(sql, params);
}

/**
 * Executes a parameterized statement using prepared statements.
 * @param {string} sql - Prepared SQL statement
 * @param {Array} [params] - Bound parameters
 * @returns {Promise<[Array, Array]>} [rows, fields]
 */
export async function execute(sql, params = []) {
  const p = getPool();
  return p.execute(sql, params);
}

/**
 * Executes an asynchronous function within an ACID transaction.
 * Automatically commits on completion or rolls back if an error is thrown.
 *
 * @param {Function} callback - async (connection) => { ... }
 * @returns {Promise<any>} The result of the callback
 */
export async function withTransaction(callback) {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch (rbErr) {
      console.error("[MySQL] Rollback failed:", rbErr.message);
    }
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Tests connection to MySQL server and retrieves version and status.
 * @param {string} [databaseName] - Optional specific database to test
 * @returns {Promise<{ ok: boolean, version?: string, currentDatabase?: string, error?: string }>}
 */
export async function testConnection(databaseName = null) {
  let tempConn = null;
  try {
    const config = getPoolConfig(databaseName);
    // Connect without database first if database might not exist yet
    const connectConfig = { ...config };
    if (!databaseName) {
      delete connectConfig.database;
    }
    tempConn = await mysql.createConnection(connectConfig);
    const [rows] = await tempConn.query("SELECT VERSION() AS version, CURRENT_USER() AS user, DATABASE() AS db");
    const info = rows[0] || {};
    return {
      ok: true,
      version: info.version || "unknown",
      user: info.user,
      currentDatabase: info.db || null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      code: err.code,
    };
  } finally {
    if (tempConn) {
      await tempConn.end().catch(() => {});
    }
  }
}

/**
 * Gracefully shuts down the connection pool.
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[MySQL] Connection pool closed.");
  }
}
