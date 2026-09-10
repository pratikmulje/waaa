import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hub } from "./sseHub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");

function watchFile(filename, eventName) {
  const fp = path.join(DATA_DIR, filename);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, "[]", "utf-8");

  let debounceTimer = null;

  fs.watch(DATA_DIR, { persistent: true }, (eventType, changedFile) => {
    if (changedFile && changedFile !== filename) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      hub.publish(eventName, { changed: true, at: new Date().toISOString() });
    }, 150);
  });
}

export function startDataSync() {
  watchFile("messages.json", "message");
  watchFile("conversations.json", "conversation");
}