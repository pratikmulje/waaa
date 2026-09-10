/*
==============================================================================
WAAA - Cloud & Runtime Storage Paths Configuration                   Phase 16
==============================================================================

Provides unified persistent filesystem path resolution for:
  - Local JSON database (data/)
  - Baileys WhatsApp authentication credentials (auth_info/)
  - WhatsApp session backups (auth_info_backup/)
  - Temporary files and media scratch

Supports Render Persistent Disks via WAAA_STORAGE_DIR / RENDER_DISK_PATH:
  If WAAA_STORAGE_DIR (or RENDER_DISK_PATH) is set (e.g. /var/data/waaa),
  all persistent storage lives inside that mount point:
    <mount>/data/
    <mount>/auth_info/
    <mount>/auth_info_backup/

If unset, seamlessly falls back to the current local project directories:
    ./data/
    ./auth_info/
    ./auth_info_backup/
==============================================================================
*/

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../");

function getRootStorageMount() {
  return process.env.WAAA_STORAGE_DIR || process.env.RENDER_DISK_PATH || null;
}

export function getBaseDataDir() {
  const mount = getRootStorageMount();
  const dir = mount
    ? path.resolve(mount, "data")
    : path.resolve(PROJECT_ROOT, "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getBaseAuthDir() {
  const mount = getRootStorageMount();
  const dir = mount
    ? path.resolve(mount, "auth_info")
    : path.resolve(PROJECT_ROOT, "auth_info");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getBaseBackupDir() {
  const mount = getRootStorageMount();
  const dir = mount
    ? path.resolve(mount, "auth_info_backup")
    : path.resolve(PROJECT_ROOT, "auth_info_backup");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getStorageInfo() {
  const mount = getRootStorageMount();
  return {
    persistentMountConfigured: Boolean(mount),
    rootStorageMount: mount,
    dataDir: getBaseDataDir(),
    authDir: getBaseAuthDir(),
    backupDir: getBaseBackupDir(),
  };
}
