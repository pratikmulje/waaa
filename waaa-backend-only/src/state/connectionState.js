/*
==================================================
WAAA CONNECTION STATE
==================================================
The bot (`npm start`) and the API server (`npm run api`)
run as two SEPARATE Node processes, so plain in-memory
state can't be shared between them — each process only
sees its own copy. Firestore is the one thing both
processes already talk to, so connection/QR state is
persisted to a single small doc there instead:
  system/connection

index.js (the bot) writes to this doc whenever the
Baileys connection.update event fires. The API server
(src/api/connectionSync.js) watches that same doc with
onSnapshot and re-publishes changes to its own local SSE
hub for the frontend. No WhatsApp/Baileys logic changes —
this only changes WHERE the status gets stored.
==================================================
*/

import { db } from "../firebase.js";

const DOC_PATH = ["system", "connection"];
let localCache = {
  status: "disconnected",
  qr: null,
  qrGeneratedAt: null,
  lastError: null,
  connectedAt: null,
  updatedAt: new Date().toISOString(),
};

function docRef() {
  return db.collection(DOC_PATH[0]).doc(DOC_PATH[1]);
}

async function persist(partial) {
  localCache = { ...localCache, ...partial, updatedAt: new Date().toISOString() };

  try {
    await docRef().set(localCache, { merge: true });
  } catch (error) {
    console.error("[connectionState] Failed to persist to Firestore:", error.message);
  }
}

export function getConnectionState() {
  return { ...localCache };
}

export async function setConnectionState(partial) {
  await persist(partial);
}

export async function setQR(qr) {
  await persist({ status: "waiting_qr", qr, qrGeneratedAt: new Date().toISOString() });
}

export async function setConnected() {
  await persist({ status: "connected", qr: null, connectedAt: new Date().toISOString() });
}
