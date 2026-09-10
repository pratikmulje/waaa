/*
==================================================
WAAA LOCAL STORE
==================================================
Low-level JSON-file storage engine. One file per
"collection" under /data at the project root.

Safety:
- Writes are atomic (write to a temp file, then
  rename over the target) — a crash mid-write can
  never leave a collection file half-written/corrupt.
- A simple lockfile (create-exclusive + retry, with
  stale-lock recovery after 10s) serializes reads/
  writes to the same collection ACROSS PROCESSES —
  needed because the bot (`npm start`) and the API
  server (`npm run api`) both read/write these files.

This file has no Firestore-specific concepts in it —
see db.js for the Firestore-API-shaped wrapper that
everything else in the app actually imports.
==================================================
*/

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { trackDataRead, trackDataWrite, withTransientRetry } from "./dataScaling.js";

import { getBaseDataDir } from "../intelligence/storageConfig.js";

function ensureDataDir(subDir = "") {
  const base = getBaseDataDir();
  const dir = subDir ? path.join(base, subDir) : base;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseCollectionScope(name, userId = null) {
  // If explicitly passed or encoded as "users/<userId>/<collection>"
  if (name.startsWith("users/")) {
    const parts = name.split("/");
    if (parts.length === 3 && parts[0] === "users") {
      const uId = parts[1];
      const coll = parts[2];
      validateCollectionName(coll);
      return { dir: path.join("users", uId), file: coll, lockName: `user_${uId}_${coll}` };
    }
  }

  if (userId && userId !== "default_user") {
    validateCollectionName(name);
    return { dir: path.join("users", userId), file: name, lockName: `user_${userId}_${name}` };
  }

  validateCollectionName(name);
  return { dir: "", file: name, lockName: name };
}

function validateCollectionName(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9_\-]+$/.test(name)) {
    throw new Error(`[localStore] Invalid or unsafe collection name: "${name}"`);
  }
}

function filePath(name, userId = null) {
  const scope = parseCollectionScope(name, userId);
  ensureDataDir(scope.dir);
  return path.join(getBaseDataDir(), scope.dir, `${scope.file}.json`);
}

function lockPath(name, userId = null) {
  const scope = parseCollectionScope(name, userId);
  return path.join(getBaseDataDir(), `${scope.lockName}.lock`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(name, timeoutMs = 8000, userId = null) {
  const scope = parseCollectionScope(name, userId);
  ensureDataDir(scope.dir);
  const lp = lockPath(name, userId);
  const start = Date.now();

  while (true) {
    try {
      fs.writeFileSync(lp, String(process.pid), { flag: "wx" });
      return;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;

      try {
        const stat = fs.statSync(lp);
        if (Date.now() - stat.mtimeMs > 10000) {
          fs.unlinkSync(lp);
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`[localStore] Timed out waiting for lock on "${name}"`);
      }

      await sleep(25 + Math.random() * 40);
    }
  }
}

function releaseLock(name, userId = null) {
  try {
    fs.unlinkSync(lockPath(name, userId));
  } catch {
    // already gone — fine
  }
}

function readRaw(name, userId = null) {
  const fp = filePath(name, userId);
  if (!fs.existsSync(fp)) return [];

  const raw = fs.readFileSync(fp, "utf-8").trim();
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[localStore] Corrupt JSON in ${fp}, treating as empty:`, err.message);
    return [];
  }
}

function writeRawAtomic(name, docs, userId = null) {
  const fp = filePath(name, userId);
  const tmp = `${fp}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(docs, null, 2), "utf-8");
  fs.renameSync(tmp, fp); // atomic on the same volume, both POSIX and Windows
}

export async function withCollectionLock(name, fn, userId = null) {
  await acquireLock(name, 8000, userId);
  try {
    return await fn();
  } finally {
    releaseLock(name, userId);
  }
}

export async function readCollection(name, userId = null) {
  trackDataRead(1);
  return withTransientRetry(
    () => withCollectionLock(name, () => readRaw(name, userId), userId),
    { maxAttempts: 3 }
  );
}

export async function writeCollection(name, docs, userId = null) {
  trackDataWrite(1);
  return withTransientRetry(
    () => withCollectionLock(name, () => writeRawAtomic(name, docs, userId), userId),
    { maxAttempts: 3 }
  );
}

export function collectionFilePath(name, userId = null) {
  return filePath(name, userId);
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
