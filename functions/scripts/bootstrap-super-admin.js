const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

async function bootstrapSuperAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const uid = process.env.TGG_SUPER_ADMIN_UID;
  if (!projectId || !uid || process.env.TGG_BOOTSTRAP_CONFIRM !== "YES") {
    throw new Error("Set FIREBASE_PROJECT_ID, TGG_SUPER_ADMIN_UID, and TGG_BOOTSTRAP_CONFIRM=YES.");
  }

  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role: "SUPER_ADMIN" });

  const ref = getFirestore().collection("users").doc(uid);
  const existing = await ref.get();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    uid,
    name: existing.get("name") || user.displayName || "",
    email: user.email || "",
    phone: existing.get("phone") || user.phoneNumber || "",
    role: "SUPER_ADMIN",
    photoURL: existing.get("photoURL") || user.photoURL || "",
    status: "ACTIVE",
    updatedAt: now,
    ...(existing.exists ? {} : { createdAt: now })
  }, { merge: true });

  console.log(`Granted SUPER_ADMIN to ${uid} in ${projectId}.`);
}

bootstrapSuperAdmin().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
