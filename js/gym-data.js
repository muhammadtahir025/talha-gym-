import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { deleteObject, getBlob, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
import { auth, db, firebaseReady, functions, storage } from "./firebase.js";
import { getUserAccess } from "./auth-service.js";

const invoke = async (name, payload) => {
  if (!firebaseReady) throw new Error("Firebase is not configured.");
  const result = await httpsCallable(functions, name)(payload);
  return result.data;
};

const asList = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

export function subscribeAdminCollections(onUpdate, onError, role, uid) {
  const collections = role === "TRAINER"
    ? [
      ["members", query(collection(db, "members"), where("trainerUid", "==", uid), orderBy("createdAt", "desc"), limit(500))],
      ["notifications", query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(200))]
    ]
    : [
      ["members", query(collection(db, "members"), orderBy("createdAt", "desc"), limit(500))],
      ["plans", query(collection(db, "membership_plans"), orderBy("planName"), limit(200))],
      ["payments", query(collection(db, "payments"), orderBy("paymentDate", "desc"), limit(500))],
      ["trainers", query(collection(db, "trainers"), orderBy("name"), limit(200))],
      ["timeSlots", query(collection(db, "time_slots"), orderBy("name"), limit(200))],
      ["notifications", query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(300))]
    ];
  if (["SUPER_ADMIN", "MANAGER"].includes(role)) collections.push(["activityLogs", query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(200))]);
  const state = { members: [], plans: [], payments: [], trainers: [], timeSlots: [], activityLogs: [], notifications: [], loaded: new Set() };
  const stops = collections.map(([key, collectionQuery]) => onSnapshot(collectionQuery, (snapshot) => {
    state[key] = asList(snapshot);
    state.loaded.add(key);
    onUpdate({ ...state, loaded: new Set(state.loaded) });
  }, (error) => onError(error, key)));
  if (role === "TRAINER") {
    state.loaded.add("plans");
    state.loaded.add("payments");
    state.loaded.add("activityLogs");
  }
  if (!["SUPER_ADMIN", "MANAGER"].includes(role)) state.loaded.add("activityLogs");
  onUpdate({ ...state, loaded: new Set(state.loaded) });
  return () => stops.forEach((stop) => stop());
}

export function subscribeMemberNotifications(memberId, onUpdate, onError) {
  const notifQuery = query(
    collection(db, "notifications"),
    where("recipientMemberId", "==", memberId),
    orderBy("createdAt", "desc"),
    limit(100)
  );
  return onSnapshot(notifQuery, (snapshot) => {
    onUpdate(asList(snapshot));
  }, onError);
}

export async function createMember(data, photo) {
  const result = await invoke("createMember", data);
  if (photo) {
    try {
      await saveMemberPhoto(result.memberId, photo);
    } catch (error) {
      return { ...result, photoError: error.message };
    }
  }
  return result;
}

export async function updateMember(data) {
  return invoke("updateMember", data);
}

export async function deactivateMember(memberId) {
  return invoke("deactivateMember", { memberId });
}

export async function saveMemberPhoto(memberId, file, replacing = false) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Profile images must be 5 MB or smaller.");
  const path = `members/${memberId}/profile.jpg`;
  const storageRef = ref(storage, path);
  try {
    await uploadBytes(storageRef, file, { contentType: file.type, cacheControl: "private,max-age=3600" });
    const profilePhotoURL = `gs://${storage.app.options.storageBucket}/${path}`;
    await invoke("setMemberPhoto", { memberId, profilePhotoURL, profilePhotoPath: path });
    return { profilePhotoURL, profilePhotoPath: path };
  } catch (error) {
    if (!replacing) await deleteObject(storageRef).catch(() => {});
    throw error;
  }
}

export async function getMemberPhotoObjectUrl(path) {
  const blob = await getBlob(ref(storage, path), 5 * 1024 * 1024);
  return URL.createObjectURL(blob);
}

export function removeMemberPhoto(memberId) {
  return invoke("removeMemberPhoto", { memberId });
}

export function createMembershipPlan(data) {
  return invoke("createMembershipPlan", data);
}

export function updateMembershipPlan(data) {
  return invoke("updateMembershipPlan", data);
}

export function deleteMembershipPlan(planId) {
  return invoke("deleteMembershipPlan", { planId });
}

export function createTrainer(data) {
  return invoke("createTrainer", data);
}

export function updateTrainer(data) {
  return invoke("updateTrainer", data);
}

export function deactivateTrainer(trainerId) {
  return invoke("deactivateTrainer", { trainerId });
}

export function renewMembership(data) {
  return invoke("renewMembership", data);
}

export function createPayment(data) {
  return invoke("createPayment", data);
}

export function updatePayment(data) {
  return invoke("updatePayment", data);
}

export function refundPayment(paymentId) {
  return invoke("refundPayment", { paymentId });
}

export async function searchMembers(search) {
  return invoke("searchMembers", { search });
}

export async function getAdminDashboardSummary() {
  return invoke("getAdminDashboardSummary", {});
}

export async function createExpense(data, receiptFile = null) {
  const result = await invoke("createExpense", data);
  if (!receiptFile) return result;
  try {
    await uploadExpenseReceipt(result.expenseId, receiptFile);
  } catch (error) {
    return { ...result, receiptError: error.message };
  }
  return result;
}

export function updateExpense(data) {
  return invoke("updateExpense", data);
}

export function deleteExpense(expenseId) {
  return invoke("deleteExpense", { expenseId });
}

export async function uploadExpenseReceipt(expenseId, file) {
  if (!(file instanceof File) || !(file.type.startsWith("image/") || file.type === "application/pdf")) throw new Error("Choose an image or PDF receipt.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Expense receipts must be 10 MB or smaller.");
  const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "";
  if (!extension) throw new Error("Supported receipts are PDF, JPG, PNG, or WebP.");
  const path = `expenses/${expenseId}/receipt.${extension}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type, cacheControl: "private,max-age=3600" });
  const receiptURL = `gs://${storage.app.options.storageBucket}/${path}`;
  try {
    await invoke("attachExpenseReceipt", { expenseId, receiptURL, receiptPath: path });
  } catch (error) {
    await deleteObject(storageRef).catch(() => {});
    throw error;
  }
  return { receiptURL, receiptPath: path };
}

export function removeExpenseReceipt(expenseId) {
  return invoke("removeExpenseReceipt", { expenseId });
}

export async function getExpenseReceiptObjectUrl(path) {
  const blob = await getBlob(ref(storage, path), 10 * 1024 * 1024);
  return URL.createObjectURL(blob);
}

export function getFinancialDashboard(filters) {
  return invoke("getFinancialDashboard", filters);
}

export function getFinancialReportPage(report, filters, cursor = null, pageSize = 50) {
  return invoke("getFinancialReportPage", { report, filters, cursor, pageSize });
}

export function recordReportExport(report) {
  return invoke("recordReportExport", { report });
}

export async function getMemberDetails(memberId) {
  const access = await getUserAccess(auth.currentUser, true);
  const memberSnapshot = await getDoc(doc(db, "members", memberId));
  if (!memberSnapshot.exists()) throw new Error("Member not found.");
  if (access.role === "TRAINER") {
    if (memberSnapshot.get("trainerUid") !== auth.currentUser.uid) throw new Error("This member is not assigned to your trainer account.");
    return { member: { id: memberSnapshot.id, ...memberSnapshot.data() }, history: [], payments: [] };
  }
  const [history, payments] = await Promise.all([
    getDocs(query(collection(db, "membership_history"), where("memberId", "==", memberId), orderBy("createdAt", "desc"))),
    getDocs(query(collection(db, "payments"), where("memberId", "==", memberId), orderBy("paymentDate", "desc")))
  ]);
  return {
    member: { id: memberSnapshot.id, ...memberSnapshot.data() },
    history: asList(history),
    payments: asList(payments)
  };
}

export async function getReceipt(receiptId) {
  const snapshot = await getDoc(doc(db, "payment_receipts", receiptId));
  if (!snapshot.exists()) throw new Error("Receipt not found.");
  return { id: snapshot.id, ...snapshot.data() };
}

export async function loadMemberPortal() {
  if (!auth.currentUser) throw new Error("Sign in to view your member profile.");
  const { role, profile } = await getUserAccess(auth.currentUser, true);
  if (role !== "MEMBER" || !profile.memberId) throw new Error("This account is not linked to a member profile.");

  const memberSnapshot = await getDoc(doc(db, "members", profile.memberId));
  if (!memberSnapshot.exists() || memberSnapshot.get("authUid") !== auth.currentUser.uid) {
    throw new Error("Your member profile link could not be verified.");
  }
  const member = { id: memberSnapshot.id, ...memberSnapshot.data() };
  const [paymentSnapshot, historySnapshot, receiptSnapshot, attendanceSnapshot] = await Promise.all([
    getDocs(query(collection(db, "payments"), where("memberId", "==", member.id), orderBy("paymentDate", "desc"))),
    getDocs(query(collection(db, "membership_history"), where("memberId", "==", member.id), orderBy("createdAt", "desc"))),
    getDocs(query(collection(db, "payment_receipts"), where("memberId", "==", member.id), orderBy("paymentDate", "desc"))),
    getDocs(query(collection(db, "attendance"), where("memberId", "==", member.id), orderBy("date", "desc"), limit(100)))
  ]);
  return {
    member,
    payments: asList(paymentSnapshot),
    history: asList(historySnapshot),
    receipts: asList(receiptSnapshot),
    attendance: asList(attendanceSnapshot)
  };
}

export function createNotification(data) {
  return invoke("createNotification", data);
}

export function markNotificationRead(notificationId) {
  return invoke("markNotificationRead", { notificationId });
}

export function markNotificationUnread(notificationId) {
  return invoke("markNotificationUnread", { notificationId });
}

export function markAllNotificationsRead() {
  return invoke("markAllNotificationsRead", {});
}

export function deleteNotification(notificationId) {
  return invoke("deleteNotification", { notificationId });
}

export function checkMembershipExpiryNotifications() {
  return invoke("checkMembershipExpiryNotifications", {});
}

export function getNotificationSettings() {
  return invoke("getNotificationSettings", {});
}

export function updateNotificationSettings(settings) {
  return invoke("updateNotificationSettings", settings);
}

export function logWhatsAppActivity(details) {
  return invoke("logWhatsAppActivity", details);
}

export function markAttendance(data) {
  return invoke("markAttendance", data);
}

export function saveWorkoutPlan(data) {
  return invoke("saveWorkoutPlan", data);
}

export function saveDietPlan(data) {
  return invoke("saveDietPlan", data);
}

export function saveProgressRecord(data) {
  return invoke("saveProgressRecord", data);
}

