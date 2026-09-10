import fs from "fs";
import path from "path";
import { getBaseAuthDir, getBaseBackupDir } from "../intelligence/storageConfig.js";

export function getUserAuthDir(userId = "default_user") {
  const base = getBaseAuthDir();
  if (userId === "default_user") return base;
  return path.join(base, `user_${userId}`);
}

export function getUserBackupDir(userId = "default_user") {
  const base = getBaseBackupDir();
  if (userId === "default_user") return base;
  return path.join(base, `user_${userId}`);
}

const BACKUP_AFTER_STABLE_MS = 2 * 60 * 1000;
const CORRUPTION_WINDOW_MS = 20 * 1000;
const CORRUPTION_THRESHOLD = 5;
const RECOVERY_COOLDOWN_MS = 60 * 1000;

// If we recover but Bad MAC keeps firing, the backup is also stale.
// After this many failed recovery attempts, wipe everything for a fresh QR.
const MAX_RECOVERY_ATTEMPTS = 2;

let pendingBackupTimers = new Map(); // userId -> timer
let badMacTimestamps = [];
let lastRecoveryAt = 0;
let recoveryAttempts = 0;
let isRecovering = false;

export function isRecoveryInProgress() {
  return isRecovering;
}

export function setRecoveryInProgress(val) {
  isRecovering = Boolean(val);
}

export function resetRecoveryAttempts() {
  recoveryAttempts = 0;
}

export function getRecoveryAttempts() {
  return recoveryAttempts;
}

export function hasValidAuth(userId = "default_user") {
  try {
    const authDir = getUserAuthDir(userId);
    const credsPath = path.join(authDir, "creds.json");
    return fs.existsSync(credsPath) && fs.statSync(credsPath).size > 10;
  } catch {
    return false;
  }
}

export function hasValidBackup(userId = "default_user") {
  try {
    const backupDir = getUserBackupDir(userId);
    const credsPath = path.join(backupDir, "creds.json");
    return fs.existsSync(credsPath) && fs.statSync(credsPath).size > 10;
  } catch {
    return false;
  }
}

export function backupAuthInfo(userId = "default_user") {
  try {
    if (isRecovering) {
      console.log(`[Session Guard] Skipping backup for ${userId} — recovery is currently in progress.`);
      return false;
    }

    if (!hasValidAuth(userId)) {
      return false; // don't backup empty or invalid auth
    }

    const authDir = getUserAuthDir(userId);
    const backupDir = getUserBackupDir(userId);

    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }

    fs.cpSync(authDir, backupDir, { recursive: true });
    console.log(`[Session Guard] Backed up ${authDir} -> ${backupDir}`);
    recoveryAttempts = 0; // good session — reset counter
    return true;
  } catch (error) {
    console.error(`[Session Guard] Backup failed for ${userId}:`, error.message);
    return false;
  }
}

export function restoreAuthInfoFromBackup(userId = "default_user") {
  try {
    if (!hasValidBackup(userId)) {
      console.log(
        `[Session Guard] No valid backup available for ${userId} — wiping auth_info for a fresh QR scan.`
      );
      wipeBothAndReset(userId);
      return false;
    }

    const authDir = getUserAuthDir(userId);
    const backupDir = getUserBackupDir(userId);

    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    fs.cpSync(backupDir, authDir, { recursive: true });
    console.log(`[Session Guard] Restored auth_info from ${backupDir} -> ${authDir}`);
    return true;
  } catch (error) {
    console.error(`[Session Guard] Restore failed for ${userId}:`, error.message);
    return false;
  }
}

export function wipeBothAndReset(userId = "default_user") {
  try {
    const authDir = getUserAuthDir(userId);
    const backupDir = getUserBackupDir(userId);
    if (fs.existsSync(authDir))
      fs.rmSync(authDir, { recursive: true, force: true });
    if (fs.existsSync(backupDir))
      fs.rmSync(backupDir, { recursive: true, force: true });
    console.log(
      `[Session Guard] ⚠️  Both auth_info and backup wiped for ${userId} — please rescan the QR code to re-link WhatsApp.`
    );
  } catch (err) {
    console.error(`[Session Guard] Wipe failed for ${userId}:`, err.message);
  }
}

export function scheduleBackup(userId = "default_user") {
  if (pendingBackupTimers.has(userId)) {
    clearTimeout(pendingBackupTimers.get(userId));
  }

  const timer = setTimeout(() => {
    backupAuthInfo(userId);
    pendingBackupTimers.delete(userId);
  }, BACKUP_AFTER_STABLE_MS);

  pendingBackupTimers.set(userId, timer);
}

export function cancelScheduledBackup(userId = "default_user") {
  if (pendingBackupTimers.has(userId)) {
    clearTimeout(pendingBackupTimers.get(userId));
    pendingBackupTimers.delete(userId);
  }
}

let patched = false;

export function watchForCorruption(onCorrupted) {
  if (patched) return;
  patched = true;

  const originalError = console.error.bind(console);

  console.error = (...args) => {
    originalError(...args);

    // If recovery is already actively running, ignore new errors to prevent duplicate recovery runs
    if (isRecovering) return;

    const text = args
      .map((a) => (a && a.message) || String(a))
      .join(" ");

    if (/\bbad mac\b/i.test(text)) {
      const now = Date.now();
      badMacTimestamps.push(now);
      badMacTimestamps = badMacTimestamps.filter(
        (t) => now - t <= CORRUPTION_WINDOW_MS
      );

      if (
        badMacTimestamps.length >= CORRUPTION_THRESHOLD &&
        now - lastRecoveryAt >= RECOVERY_COOLDOWN_MS
      ) {
        lastRecoveryAt = now;
        badMacTimestamps = [];
        recoveryAttempts += 1;

        if (recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
          // Backup is also stale — wipe everything, Baileys will show a fresh QR
          console.log(
            `[Session Guard] Recovery failed ${recoveryAttempts} times — backup is also corrupted. Wiping all session data.`
          );
          wipeBothAndReset();
          recoveryAttempts = 0;
          onCorrupted(); // triggers reconnect → Baileys sees no auth_info → shows QR
        } else {
          console.log(
            `[Session Guard] ${CORRUPTION_THRESHOLD}+ "Bad MAC" errors within ${CORRUPTION_WINDOW_MS / 1000}s — session looks corrupted (attempt ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}).`
          );
          onCorrupted();
        }
      }
    }
  };
}