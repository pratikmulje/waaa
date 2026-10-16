/*
==============================================================================
WAAA - Ensure MySQL Daemon is Running
==============================================================================
Verifies MySQL connectivity on port 3306. If the service is not currently
running, attempts to automatically launch the installed mysqld daemon so that
migrations and assignment demonstrations execute seamlessly without errors.
==============================================================================
*/

import net from "net";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const MYSQL_PATHS = [
  "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe",
  "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe",
  "C:\\Program Files\\MariaDB 10.11\\bin\\mysqld.exe",
];

const DATA_DIR = path.resolve("database/mysql_data");

export function isPortOpen(port = 3306, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1200);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function ensureMysqlRunning() {
  const isOpen = await isPortOpen(3306);
  if (isOpen) {
    return true;
  }

  console.log("ℹ️  MySQL server is not listening on port 3306. Attempting to start daemon...");

  // Find mysqld binary
  let mysqldBin = null;
  for (const p of MYSQL_PATHS) {
    if (fs.existsSync(p)) {
      mysqldBin = p;
      break;
    }
  }

  if (!mysqldBin) {
    throw new Error(
      "MySQL server binary not found at default installation paths. Please start MySQL manually."
    );
  }

  // Ensure datadir exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const child = spawn(mysqldBin, [
    `--datadir=${DATA_DIR}`,
    "--port=3306",
    "--console",
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();

  // Wait up to 10 seconds for port to open
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isPortOpen(3306)) {
      console.log("✅ MySQL daemon started and listening on port 3306.");
      return true;
    }
  }

  throw new Error("Timed out waiting for MySQL server to start on port 3306.");
}

if (process.argv[1] && process.argv[1].endsWith("ensure_mysql_running.js")) {
  ensureMysqlRunning()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌", err.message);
      process.exit(1);
    });
}
