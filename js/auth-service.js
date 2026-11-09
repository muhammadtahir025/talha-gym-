import { getIdTokenResult } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, firebaseReady } from "./firebase.js";

export const USER_ROLES = Object.freeze([
  "SUPER_ADMIN",
  "MANAGER",
  "RECEPTIONIST",
  "TRAINER",
  "MEMBER"
]);

export const ADMIN_ROLES = Object.freeze([
  "SUPER_ADMIN",
  "MANAGER",
  "RECEPTIONIST",
  "TRAINER"
]);

export async function getUserAccess(user, forceRefresh = false) {
  if (!firebaseReady || !user) throw new Error("Authentication is not available.");

  const [tokenResult, profileSnapshot] = await Promise.all([
    getIdTokenResult(user, forceRefresh),
    getDoc(doc(db, "users", user.uid))
  ]);

  if (!profileSnapshot.exists()) throw new Error("Your account profile has not been provisioned.");

  const profile = profileSnapshot.data();
  const role = tokenResult.claims.role;
  if (!USER_ROLES.includes(role) || profile.role !== role) {
    throw new Error("Your account role is not provisioned correctly. Contact the gym administrator.");
  }
  if (profile.status !== "ACTIVE") throw new Error("This account is not active.");

  return { role, profile };
}

export { auth, db, firebaseReady };
