/*
==================================================
WAAA CONNECTION SYNC (API process only)
==================================================
Watches the system/connection Firestore doc (written by
the bot process — see src/state/connectionState.js) with
a live onSnapshot listener, keeps a local cache for
GET /api/connection/status, and re-publishes every change
to this process's SSE hub so /api/connection/stream pushes
it to the browser in real time.
==================================================
*/

import { db } from "../firebase.js";
import { hub } from "./sseHub.js";

let cache = {
  status: "disconnected",
  qr: null,
  qrGeneratedAt: null,
  lastError: null,
  connectedAt: null,
  updatedAt: null,
};

export function getSyncedConnectionState() {
  return { ...cache };
}

export function startConnectionSync() {
  db.collection("system")
    .doc("connection")
    .onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        cache = { ...cache, ...snap.data() };
        hub.publish("connection", getSyncedConnectionState());
      },
      (error) => {
        console.error("[connectionSync] Firestore listener error:", error.message);
      }
    );
}
