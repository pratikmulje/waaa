/*
==============================================================================
WAAA - Multi-User Device & Account Switch Guard                        Phase 17
==============================================================================

Guarantees data isolation across multiple WhatsApp accounts on the same machine:
  1. Fresh Git Clone -> Always starts with a 100% clean UI and fresh QR prompt.
  2. Same Account Reconnect / Rescan -> Preserves all chats, messages & history.
  3. Different Account Scans QR -> Detects phone number switch:
     - Safely archives previous user's chats to data/user_profiles/<phone>/
     - Restores existing profile if this user connected previously, OR
     - Initializes a clean, empty workspace (0 chats, 0 messages) for new user.
==============================================================================
*/

import fs from "fs";
import path from "path";
import { getBaseDataDir } from "../intelligence/storageConfig.js";

// Collections that belong to a user's chat workspace
export const WORKSPACE_COLLECTIONS = [
  "messages",
  "conversations",
  "chatMemory",
  "behaviorMessages",
  "behaviorPatterns",
  "chatSettings",
  "chatSummaries",
  "chunkSummaries",
  "rangeSummaries",
  "people",
  "jobs",
  "projects",
  "actions",
  "mediaAnalysis",
];

const SESSION_META_FILE = "active_session.json";

/**
 * Extracts a normalized, clean WhatsApp account phone number from Baileys sock.user
 * e.g. "919325996918:8@s.whatsapp.net" -> "919325996918"
 */
export function extractAccountId(sock) {
  if (!sock?.user) return null;
  const rawId = sock.user.id || sock.user.lid || "";
  if (!rawId) return null;
  const cleanId = rawId.split(":")[0].split("@")[0].trim();
  return cleanId || null;
}

/**
 * Gets the currently active session record from disk.
 */
export function getActiveSession() {
  try {
    const dataDir = getBaseDataDir();
    const filePath = path.join(dataDir, SESSION_META_FILE);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("[AccountGuard] Failed to read active session:", err.message);
    return null;
  }
}

/**
 * Saves the active session record to disk.
 */
export function saveActiveSession(sessionData) {
  try {
    const dataDir = getBaseDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, SESSION_META_FILE);
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), "utf-8");
  } catch (err) {
    console.error("[AccountGuard] Failed to save active session:", err.message);
  }
}

/**
 * Archives current active data collections into data/user_profiles/<phone>/
 */
export function archiveUserProfile(phone) {
  if (!phone) return;
  try {
    const dataDir = getBaseDataDir();
    const profileDir = path.join(dataDir, "user_profiles", phone);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    let archivedCount = 0;
    for (const name of WORKSPACE_COLLECTIONS) {
      const srcFile = path.join(dataDir, `${name}.json`);
      if (fs.existsSync(srcFile)) {
        const destFile = path.join(profileDir, `${name}.json`);
        fs.copyFileSync(srcFile, destFile);
        archivedCount++;
      }
    }

    console.log(
      `[AccountGuard] 📦 Archived ${archivedCount} collections for user "${phone}" -> ${profileDir}`
    );
  } catch (err) {
    console.error(`[AccountGuard] Failed to archive profile for ${phone}:`, err.message);
  }
}

/**
 * Restores a saved user profile from data/user_profiles/<phone>/ into data/
 */
export function restoreUserProfile(phone) {
  if (!phone) return false;
  try {
    const dataDir = getBaseDataDir();
    const profileDir = path.join(dataDir, "user_profiles", phone);
    if (!fs.existsSync(profileDir)) return false;

    let restoredCount = 0;
    for (const name of WORKSPACE_COLLECTIONS) {
      const srcFile = path.join(profileDir, `${name}.json`);
      const destFile = path.join(dataDir, `${name}.json`);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
        restoredCount++;
      } else {
        // Initialize empty if missing in saved profile
        fs.writeFileSync(destFile, "[]", "utf-8");
      }
    }

    console.log(
      `[AccountGuard] 📂 Restored ${restoredCount} collections for user "${phone}" from ${profileDir}`
    );
    return true;
  } catch (err) {
    console.error(`[AccountGuard] Failed to restore profile for ${phone}:`, err.message);
    return false;
  }
}

/**
 * Initializes a clean, empty workspace in data/ (for a brand new user).
 */
export function initFreshWorkspace() {
  try {
    const dataDir = getBaseDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    for (const name of WORKSPACE_COLLECTIONS) {
      const filePath = path.join(dataDir, `${name}.json`);
      fs.writeFileSync(filePath, "[]", "utf-8");
    }

    // Clean up temporary lock or tmp files
    try {
      const files = fs.readdirSync(dataDir);
      for (const f of files) {
        if (f.endsWith(".lock") || f.includes(".tmp.")) {
          try {
            fs.unlinkSync(path.join(dataDir, f));
          } catch {}
        }
      }
    } catch {}

    console.log("[AccountGuard] ✨ Fresh, clean workspace initialized (0 chats, 0 messages).");
  } catch (err) {
    console.error("[AccountGuard] Failed to initialize fresh workspace:", err.message);
  }
}

/**
 * Main guard function called when Baileys connection.update receives connection === "open"
 *
 * @param {object} sock - Baileys socket
 * @returns {Promise<{ phone: string, name: string, switched: boolean }>}
 */
export async function handleAccountConnection(sock) {
  const phone = extractAccountId(sock);
  const name = sock?.user?.name || "WhatsApp User";

  if (!phone) {
    console.warn("[AccountGuard] Connection opened but account phone number could not be determined.");
    return { phone: null, name, switched: false };
  }

  const activeSession = getActiveSession();
  const previousPhone = activeSession?.activeUserId || null;

  // CASE 1: Initial connection on this clone / machine
  if (!previousPhone) {
    console.log(`[AccountGuard] 🔑 Initial active user bound: ${phone} (${name})`);
    saveActiveSession({
      activeUserId: phone,
      userName: name,
      firstConnectedAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString(),
    });
    return { phone, name, switched: false };
  }

  // CASE 2: Same account reconnected (or rescanned after session corruption/disconnect)
  if (previousPhone === phone) {
    console.log(
      `[AccountGuard] ✅ Welcome back, ${name} (${phone})! All existing chats & messages are preserved.`
    );
    saveActiveSession({
      ...activeSession,
      userName: name,
      lastConnectedAt: new Date().toISOString(),
    });
    return { phone, name, switched: false };
  }

  // CASE 3: DIFFERENT account scanned QR code on the same machine!
  console.log(
    `[AccountGuard] ⚠️ Account switch detected! Previous: ${previousPhone} -> New: ${phone}`
  );

  // 1. Archive the previous user's data so it is never lost
  archiveUserProfile(previousPhone);

  // 2. Check if the incoming user already has a saved profile on this device
  const dataDir = getBaseDataDir();
  const incomingProfileDir = path.join(dataDir, "user_profiles", phone);
  if (fs.existsSync(incomingProfileDir)) {
    console.log(`[AccountGuard] Existing profile found for ${phone}. Restoring their saved chats...`);
    restoreUserProfile(phone);
  } else {
    console.log(`[AccountGuard] First time login for ${phone}. Creating 100% fresh clean UI...`);
    initFreshWorkspace();
  }

  // 3. Invalidate query caches so API endpoints immediately return fresh data
  try {
    const { queryCache } = await import("../db/dataScaling.js");
    queryCache.invalidate();
  } catch {}

  // 4. Update the active session metadata
  saveActiveSession({
    activeUserId: phone,
    userName: name,
    firstConnectedAt: activeSession?.firstConnectedAt || new Date().toISOString(),
    lastConnectedAt: new Date().toISOString(),
    switchedFrom: previousPhone,
  });

  // 5. Notify any connected SSE clients (frontend UI) of the user switch
  try {
    const { hub } = await import("../api/sseHub.js");
    hub.publish("account_switched", {
      activeUserId: phone,
      userName: name,
      previousUserId: previousPhone,
      timestamp: new Date().toISOString(),
    });
  } catch {}

  return { phone, name, switched: true, previousPhone };
}
