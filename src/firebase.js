// import { initializeApp, cert } from "firebase-admin/app";
// import { getFirestore } from "firebase-admin/firestore";
// import fs from "fs";
// import path from "path";

// const serviceAccountPath = path.resolve(
//   "firebase/serviceAccountKey.json"
// );

// console.log("Loading Firebase key from:");
// console.log(serviceAccountPath);

// const serviceAccount = JSON.parse(
//   fs.readFileSync(serviceAccountPath, "utf8")
// );

// console.log("Firebase project:", serviceAccount.project_id);
// console.log("Firebase client:", serviceAccount.client_email);

// const app = initializeApp({
//   credential: cert(serviceAccount),
// });

// export const db = getFirestore(app);

// console.log("🔥 Firebase initialized");

// try {
//   await db.collection("test").doc("connection").set({
//     message: "Firebase is working",
//     timestamp: new Date().toISOString(),
//   });

//   console.log("✅ Firestore WRITE successful");
// } catch (error) {
//   console.error("❌ Firestore WRITE failed");
//   console.error(error);
// }

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const serviceAccountPath = path.resolve(
  "firebase/serviceAccountKey.json"
);

console.log("Loading Firebase key from:");
console.log(serviceAccountPath);

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

console.log("Firebase project:", serviceAccount.project_id);
console.log("Firebase client:", serviceAccount.client_email);

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

export const db = getFirestore(app, "(default)");

console.log("🔥 Firebase initialized");

try {
  await db.collection("test").doc("connection").set({
    message: "Firebase is working",
    timestamp: new Date().toISOString(),
  });

  console.log("✅ Firestore WRITE successful");
} catch (error) {
  console.error("❌ Firestore WRITE failed");
  console.error(error);
}