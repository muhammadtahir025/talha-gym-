const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { AggregateField, FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

initializeApp();

const db = getFirestore();
const allowedRoles = new Set(["SUPER_ADMIN", "MANAGER", "RECEPTIONIST", "TRAINER", "MEMBER"]);
const memberStaff = ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST"];
const planStaff = ["SUPER_ADMIN", "MANAGER"];
const paymentStaff = ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST"];
const financialStaff = ["SUPER_ADMIN", "MANAGER"];
const methods = new Set(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"]);
const paymentStatuses = new Set(["SUCCESS", "PENDING", "FAILED", "REFUNDED"]);
const expenseCategories = new Set(["Rent", "Electricity", "Water", "Equipment", "Equipment Repair", "Maintenance", "Salaries", "Trainer Payments", "Cleaning", "Marketing", "Internet", "Supplies", "Other"]);
const expenseMethods = new Set(["Cash", "Bank", "Easypaisa", "JazzCash", "Other"]);
const notificationTypes = new Set(["MEMBERSHIP_EXPIRY", "MEMBERSHIP_EXPIRED", "PAYMENT_SUCCESS", "PAYMENT_PENDING", "PAYMENT_REMINDER", "ATTENDANCE", "WORKOUT", "DIET", "PROGRESS"]);
const notificationPriorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

function fail(code, message) {
  throw new HttpsError(code, message);
}

async function requireRole(request, roles) {
  if (!request.auth) fail("unauthenticated", "Sign in to continue.");
  const profileSnapshot = await db.collection("users").doc(request.auth.uid).get();
  const profile = profileSnapshot.data();
  const role = request.auth.token.role;
  if (!profileSnapshot.exists || profile?.status !== "ACTIVE" || profile.role !== role || !roles.includes(role)) {
    fail("permission-denied", "Your account does not have permission to perform this action.");
  }
  return { uid: request.auth.uid, name: profile.name || request.auth.token.email || "", role };
}

function requiredText(value, label, maxLength = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    fail("invalid-argument", `${label} is required and must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

function parseDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail("invalid-argument", `${label} must be a valid date.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail("invalid-argument", `${label} must be a valid date.`);
  }
  return date;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function addCalendarMonths(date, months) {
  const targetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const finalDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(date.getUTCDate(), finalDay));
  return targetMonth;
}

function statusForExpiry(expiryDate, currentStatus = "ACTIVE") {
  if (currentStatus === "INACTIVE") return "INACTIVE";
  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return expiryDate.getTime() < dayStart.getTime() ? "EXPIRED" : "ACTIVE";
}

function validPhone(phone) {
  return /^\+?[0-9\s()-]{7,20}$/.test(phone);
}

function validCnic(cnic) {
  return /^\d{5}-?\d{7}-?\d$/.test(cnic);
}

function amountValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) fail("invalid-argument", "Amount must be a positive number.");
  return Math.round(amount * 100) / 100;
}

function addActivity(transaction, actor, action, module, recordId, details = {}) {
  const ref = db.collection("activity_logs").doc();
  transaction.create(ref, {
    userId: actor.uid,
    userName: actor.name,
    role: actor.role,
    action,
    module,
    recordId,
    targetId: recordId,
    timestamp: FieldValue.serverTimestamp(),
    details
  });
}

function dateWindow(data = {}, defaultDays = 30) {
  const today = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
  const endDate = parseDate(data.to || todayKey, "End date");
  const defaultFrom = new Date(endDate.getTime() - (defaultDays - 1) * 86400000);
  const startDate = parseDate(data.from || toDateString(defaultFrom), "Start date");
  if (startDate.getTime() > endDate.getTime()) fail("invalid-argument", "Start date must not be after end date.");
  if (endDate.getTime() - startDate.getTime() > 3660 * 86400000) fail("invalid-argument", "Date range cannot exceed ten years.");
  const endExclusive = new Date(endDate.getTime() + 86400000);
  return { startDate, endDate, start: Timestamp.fromDate(startDate), end: Timestamp.fromDate(endExclusive), startKey: toDateString(startDate), endKey: toDateString(endDate) };
}

function eventLog(actor, action, module, targetId = "", details = {}) {
  return db.collection("activity_logs").add({
    userId: actor.uid,
    userName: actor.name,
    role: actor.role,
    action,
    module,
    recordId: targetId,
    targetId,
    timestamp: FieldValue.serverTimestamp(),
    details
  });
}

function notificationRef(type, memberId, relatedId) {
  return db.collection("notifications").doc(`${type}_${memberId}_${relatedId}`.replace(/[^A-Za-z0-9_-]/g, "_"));
}

function notificationData({ id, member, type, title, message, relatedId = "", relatedType = "", priority = "NORMAL", createdBy = "SYSTEM" }) {
  return {
    notificationId: id,
    recipientUserId: member.authUid || "",
    recipientMemberId: member.memberId || member.id,
    type,
    title,
    message,
    relatedId,
    relatedType,
    status: "UNREAD",
    priority,
    createdAt: FieldValue.serverTimestamp(),
    readAt: null,
    createdBy
  };
}

exports.createNotification = onCall(async (request) => {
  const actor = await requireRole(request, paymentStaff);
  const data = request.data || {};
  const recipientMemberId = requiredText(data.recipientMemberId, "Recipient member", 32);
  const type = requiredText(data.type, "Notification type", 40);
  const title = requiredText(data.title, "Notification title", 120);
  const message = requiredText(data.message, "Notification message", 1200);
  const priority = typeof data.priority === "string" ? data.priority : "NORMAL";
  if (!notificationTypes.has(type)) fail("invalid-argument", "Select a supported notification type.");
  if (!notificationPriorities.has(priority)) fail("invalid-argument", "Select a supported notification priority.");
  const memberSnapshot = await db.collection("members").doc(recipientMemberId).get();
  if (!memberSnapshot.exists) fail("not-found", "The selected recipient member does not exist.");
  const member = memberSnapshot.data();
  const notificationRef = db.collection("notifications").doc();
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    transaction.create(notificationRef, {
      ...notificationData({
        id: notificationRef.id,
        member,
        type,
        title,
        message,
        relatedId: typeof data.relatedId === "string" ? data.relatedId.slice(0, 128) : "",
        relatedType: typeof data.relatedType === "string" ? data.relatedType.slice(0, 64) : "",
        priority,
        createdBy: actor.uid
      })
    });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "NOTIFICATION_CREATED", module: "notifications", recordId: notificationRef.id, targetId: notificationRef.id,
      timestamp: FieldValue.serverTimestamp(), details: { type, recipientMemberId }
    });
  });
  return { notificationId: notificationRef.id };
});

exports.markNotificationRead = onCall(async (request) => {
  const actor = await requireRole(request, allowedRoles ? [...allowedRoles] : []);
  const notificationId = requiredText(request.data?.notificationId, "Notification ID", 128);
  const userSnapshot = await db.collection("users").doc(actor.uid).get();
  const profile = userSnapshot.data() || {};
  const notificationRef = db.collection("notifications").doc(notificationId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(notificationRef);
    if (!snapshot.exists) fail("not-found", "Notification not found.");
    const notification = snapshot.data();
    const isStaff = ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST"].includes(actor.role);
    const isRecipient = notification.recipientUserId === actor.uid || (profile.memberId && notification.recipientMemberId === profile.memberId);
    if (!isStaff && !isRecipient) fail("permission-denied", "You cannot update this notification.");
    if (notification.status !== "READ") transaction.update(notificationRef, { status: "READ", readAt: FieldValue.serverTimestamp() });
  });
  return { notificationId, status: "READ" };
});

exports.markAllNotificationsRead = onCall(async (request) => {
  const actor = await requireRole(request, allowedRoles ? [...allowedRoles] : []);
  const userSnapshot = await db.collection("users").doc(actor.uid).get();
  const profile = userSnapshot.data() || {};
  const staff = ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST"].includes(actor.role);
  let notificationsQuery = db.collection("notifications").where("status", "==", "UNREAD");
  if (!staff) {
    notificationsQuery = profile.memberId
      ? notificationsQuery.where("recipientMemberId", "==", profile.memberId)
      : notificationsQuery.where("recipientUserId", "==", actor.uid);
  }
  const snapshot = await notificationsQuery.limit(400).get();
  const batch = db.batch();
  snapshot.docs.forEach((item) => {
    const notification = item.data();
    const isRecipient = notification.recipientUserId === actor.uid || (profile.memberId && notification.recipientMemberId === profile.memberId);
    if (staff || isRecipient) batch.update(item.ref, { status: "READ", readAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();
  return { updated: snapshot.size };
});

async function getPlan(planId, transaction, requireActive = true) {
  const snapshot = await transaction.get(db.collection("membership_plans").doc(planId));
  if (!snapshot.exists) fail("not-found", "The selected membership plan does not exist.");
  const plan = snapshot.data();
  if (requireActive && plan.status !== "ACTIVE") fail("failed-precondition", "The selected membership plan is inactive.");
  if (!Number.isInteger(plan.durationMonths) || plan.durationMonths < 1 || !Number.isFinite(plan.price) || plan.price < 0) {
    fail("failed-precondition", "The selected membership plan is not configured correctly.");
  }
  return { ref: snapshot.ref, data: plan };
}

function memberInput(data) {
  const fullName = requiredText(data.fullName, "Full name", 120);
  const fatherName = requiredText(data.fatherName, "Father name", 120);
  const phone = requiredText(data.phone, "Phone", 20);
  const cnic = requiredText(data.cnic, "CNIC", 15).replace(/-/g, "");
  if (!validPhone(phone)) fail("invalid-argument", "Enter a valid phone number.");
  if (!validCnic(cnic)) fail("invalid-argument", "Enter a valid CNIC number.");
  if (!["Male", "Female"].includes(data.gender)) fail("invalid-argument", "Select Male or Female.");

  const dateOfBirth = parseDate(data.dateOfBirth, "Date of birth");
  const joinDate = parseDate(data.joinDate, "Join date");
  if (dateOfBirth.getTime() >= Date.now()) fail("invalid-argument", "Date of birth must be in the past.");
  if (joinDate.getTime() > Date.now() + 86400000) fail("invalid-argument", "Join date cannot be in the future.");

  return {
    fullName,
    fullNameSearch: fullName.toLocaleLowerCase(),
    fatherName,
    phone,
    phoneSearch: phone.replace(/\D/g, ""),
    cnic,
    gender: data.gender,
    dateOfBirth: Timestamp.fromDate(dateOfBirth),
    address: requiredText(data.address, "Address", 500),
    joinDate: Timestamp.fromDate(joinDate),
    trainerId: typeof data.trainerId === "string" ? data.trainerId.trim() : "",
    trainerName: "",
    trainerUid: "",
    timeSlotId: typeof data.timeSlotId === "string" ? data.timeSlotId.trim() : "",
    timeSlotName: ""
  };
}

function formatMemberId(gender, sequence) {
  return `TGG-${gender === "Female" ? "F" : "M"}-${String(sequence).padStart(5, "0")}`;
}

function formatReceiptId(sequence) {
  return `TGG-${String(sequence).padStart(6, "0")}`;
}

async function updateMembershipFeeState(transaction, payment, paymentRef, nextStatus) {
  if (!payment.membershipId) return;
  const historyRef = db.collection("membership_history").doc(payment.membershipId);
  const historySnapshot = await transaction.get(historyRef);
  if (!historySnapshot.exists) return;
  const history = historySnapshot.data();
  const memberRef = db.collection("members").doc(payment.memberId);
  const memberSnapshot = await transaction.get(memberRef);
  if (!memberSnapshot.exists) return;

  let hasSuccessfulPayment = nextStatus === "SUCCESS";
  if (!hasSuccessfulPayment) {
    const successfulPayments = await transaction.get(db.collection("payments")
      .where("membershipId", "==", payment.membershipId)
      .where("status", "==", "SUCCESS"));
    hasSuccessfulPayment = successfulPayments.docs.some((doc) => doc.id !== paymentRef.id);
  }

  if (nextStatus === "SUCCESS") transaction.update(historyRef, { paymentId: paymentRef.id, feeStatus: "PAID" });
  else if (history.paymentId === paymentRef.id) transaction.update(historyRef, { paymentId: null, feeStatus: hasSuccessfulPayment ? "PAID" : "DUE" });
  if (memberSnapshot.get("currentMembershipId") === payment.membershipId) {
    transaction.update(memberRef, { feeStatus: hasSuccessfulPayment ? "PAID" : "DUE", updatedAt: FieldValue.serverTimestamp() });
  }
}

exports.assignUserRole = onCall(async (request) => {
  const actor = await requireRole(request, ["SUPER_ADMIN"]);
  const { uid, role, memberId, trainerId } = request.data || {};
  if (typeof uid !== "string" || !uid || !allowedRoles.has(role)) fail("invalid-argument", "Provide a valid user ID and supported role.");
  if (uid === actor.uid && role !== "SUPER_ADMIN") fail("failed-precondition", "A super administrator cannot change their own role.");
  if (role === "MEMBER" && typeof memberId !== "string") fail("invalid-argument", "A member ID is required for a member account.");
  if (role === "TRAINER" && typeof trainerId !== "string") fail("invalid-argument", "A trainer profile is required for a trainer account.");

  let target;
  try { target = await getAuth().getUser(uid); }
  catch { fail("not-found", "The Firebase Authentication user does not exist."); }

  const userRef = db.collection("users").doc(uid);
  const profileSnapshot = await userRef.get();
  const profile = profileSnapshot.data() || {};
  const batch = db.batch();
  const profileData = {
    uid,
    name: profile.name || target.displayName || "",
    email: target.email || "",
    phone: profile.phone || target.phoneNumber || "",
    role,
    photoURL: profile.photoURL || target.photoURL || "",
    status: profile.status || "ACTIVE",
    updatedAt: FieldValue.serverTimestamp()
  };
  if (!profileSnapshot.exists) profileData.createdAt = FieldValue.serverTimestamp();

  if (profile.role === "MEMBER" && profile.memberId && (role !== "MEMBER" || memberId !== profile.memberId)) {
    const previousMemberRef = db.collection("members").doc(profile.memberId);
    const previousMember = await previousMemberRef.get();
    if (previousMember.exists && previousMember.get("authUid") === uid) batch.update(previousMemberRef, { authUid: "", updatedAt: FieldValue.serverTimestamp() });
    profileData.memberId = FieldValue.delete();
  }
  if (profile.role === "TRAINER" && profile.trainerId && (role !== "TRAINER" || trainerId !== profile.trainerId)) {
    const previousTrainerRef = db.collection("trainers").doc(profile.trainerId);
    const previousTrainer = await previousTrainerRef.get();
    if (previousTrainer.exists && previousTrainer.get("authUid") === uid) batch.update(previousTrainerRef, { authUid: "", updatedAt: FieldValue.serverTimestamp() });
    profileData.trainerId = FieldValue.delete();
  }

  if (role === "MEMBER") {
    const memberRef = db.collection("members").doc(memberId);
    const memberSnapshot = await memberRef.get();
    if (!memberSnapshot.exists) fail("not-found", "The selected member record does not exist.");
    if (memberSnapshot.get("authUid") && memberSnapshot.get("authUid") !== uid) fail("already-exists", "This member is already linked to an account.");
    profileData.memberId = memberId;
    batch.update(memberRef, { authUid: uid, updatedAt: FieldValue.serverTimestamp() });
  }
  if (role === "TRAINER") {
    const trainerRef = db.collection("trainers").doc(trainerId);
    const trainer = await trainerRef.get();
    if (!trainer.exists || trainer.get("status") !== "ACTIVE") fail("not-found", "The selected active trainer profile does not exist.");
    if (trainer.get("authUid") && trainer.get("authUid") !== uid) fail("already-exists", "This trainer profile is already linked to an account.");
    profileData.trainerId = trainerId;
    batch.update(trainerRef, { authUid: uid, updatedAt: FieldValue.serverTimestamp() });
  }

  batch.set(userRef, profileData, { merge: true });
  await batch.commit();
  if (role === "TRAINER") {
    const assignedMembers = await db.collection("members").where("trainerId", "==", trainerId).get();
    for (let offset = 0; offset < assignedMembers.docs.length; offset += 450) {
      const memberBatch = db.batch();
      assignedMembers.docs.slice(offset, offset + 450).forEach((member) => {
        memberBatch.update(member.ref, { trainerUid: uid, updatedAt: FieldValue.serverTimestamp() });
      });
      await memberBatch.commit();
    }
  }
  await getAuth().setCustomUserClaims(uid, { ...(target.customClaims || {}), role });
  return { uid, role, status: profileData.status };
});

exports.createMember = onCall(async (request) => {
  const actor = await requireRole(request, memberStaff);
  const data = request.data || {};
  const input = memberInput(data);
  const planId = requiredText(data.planId, "Membership plan", 128);
  const counterRef = db.collection("system_counters").doc(`member_${input.gender === "Female" ? "F" : "M"}`);
  const historyRef = db.collection("membership_history").doc();
  const activityRef = db.collection("activity_logs").doc();
  const result = await db.runTransaction(async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const { data: plan } = await getPlan(planId, transaction);
    const trainerRef = input.trainerId ? db.collection("trainers").doc(input.trainerId) : null;
    const trainerSnapshot = trainerRef ? await transaction.get(trainerRef) : null;
    if (trainerSnapshot && !trainerSnapshot.exists) fail("not-found", "The selected trainer does not exist.");
    if (trainerSnapshot) {
      input.trainerName = trainerSnapshot.get("name") || "";
      input.trainerUid = trainerSnapshot.get("authUid") || "";
    }
    if (trainerSnapshot && trainerSnapshot.get("status") !== "ACTIVE") fail("failed-precondition", "The selected trainer profile is inactive.");
    const timeSlotRef = input.timeSlotId ? db.collection("time_slots").doc(input.timeSlotId) : null;
    const timeSlotSnapshot = timeSlotRef ? await transaction.get(timeSlotRef) : null;
    if (timeSlotSnapshot && !timeSlotSnapshot.exists) fail("not-found", "The selected time slot does not exist.");
    if (timeSlotSnapshot) input.timeSlotName = timeSlotSnapshot.get("name") || "";
    const cnicQuery = db.collection("members").where("cnic", "==", input.cnic).limit(1);
    const duplicateCnic = await transaction.get(cnicQuery);
    if (!duplicateCnic.empty) fail("already-exists", "A member with this CNIC is already registered.");
    let sequence = (counterSnapshot.exists ? counterSnapshot.get("value") : 0) + 1;
    let memberId;
    let memberRef;
    for (let attempts = 0; attempts < 100; attempts += 1) {
      memberId = formatMemberId(input.gender, sequence);
      memberRef = db.collection("members").doc(memberId);
      const existingMember = await transaction.get(memberRef);
      if (!existingMember.exists) break;
      sequence += 1;
      memberRef = null;
    }
    if (!memberRef) fail("resource-exhausted", "Unable to allocate a unique member ID. Contact support.");

    const startDate = input.joinDate.toDate();
    const expiryDate = addCalendarMonths(startDate, plan.durationMonths);
    const member = {
      ...input,
      memberId,
      membershipPlanId: planId,
      membershipPlanName: plan.planName,
      monthlyFee: plan.price,
      membershipStartDate: Timestamp.fromDate(startDate),
      membershipExpiryDate: Timestamp.fromDate(expiryDate),
      profilePhotoURL: "",
      profilePhotoPath: "",
      currentMembershipId: historyRef.id,
      feeStatus: "DUE",
      status: statusForExpiry(expiryDate),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    };

    transaction.create(memberRef, member);
    transaction.set(counterRef, { value: sequence, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.create(historyRef, {
      membershipId: historyRef.id,
      memberId,
      planId,
      planName: plan.planName,
      startDate: Timestamp.fromDate(startDate),
      expiryDate: Timestamp.fromDate(expiryDate),
      price: plan.price,
      paymentId: null,
      feeStatus: "DUE",
      status: statusForExpiry(expiryDate),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBER_CREATED", module: "members", recordId: memberId,
      timestamp: FieldValue.serverTimestamp(), details: { planId }
    });
    return { memberId, membershipId: historyRef.id };
  });
  return result;
});

exports.updateMember = onCall(async (request) => {
  const actor = await requireRole(request, memberStaff);
  const { memberId, ...data } = request.data || {};
  const id = requiredText(memberId, "Member ID", 32);
  const editable = {};
  for (const key of ["fullName", "fatherName", "phone", "cnic", "gender", "dateOfBirth", "address", "trainerId", "timeSlotId", "timeSlotName"]) {
    if (Object.hasOwn(data, key)) editable[key] = data[key];
  }
  if (Object.hasOwn(editable, "fullName")) {
    editable.fullName = requiredText(editable.fullName, "Full name", 120);
    editable.fullNameSearch = editable.fullName.toLocaleLowerCase();
  }
  if (Object.hasOwn(editable, "fatherName")) editable.fatherName = requiredText(editable.fatherName, "Father name", 120);
  if (Object.hasOwn(editable, "phone")) {
    editable.phone = requiredText(editable.phone, "Phone", 20);
    if (!validPhone(editable.phone)) fail("invalid-argument", "Enter a valid phone number.");
    editable.phoneSearch = editable.phone.replace(/\D/g, "");
  }
  if (Object.hasOwn(editable, "cnic")) {
    editable.cnic = requiredText(editable.cnic, "CNIC", 15).replace(/-/g, "");
    if (!validCnic(editable.cnic)) fail("invalid-argument", "Enter a valid CNIC number.");
  }
  if (Object.hasOwn(editable, "gender") && !["Male", "Female"].includes(editable.gender)) fail("invalid-argument", "Select Male or Female.");
  if (Object.hasOwn(editable, "dateOfBirth")) {
    const birth = parseDate(editable.dateOfBirth, "Date of birth");
    if (birth.getTime() >= Date.now()) fail("invalid-argument", "Date of birth must be in the past.");
    editable.dateOfBirth = Timestamp.fromDate(birth);
  }
  if (Object.hasOwn(editable, "address")) editable.address = requiredText(editable.address, "Address", 500);
  for (const key of ["trainerId", "timeSlotId", "timeSlotName"]) {
    if (Object.hasOwn(editable, key) && typeof editable[key] !== "string") fail("invalid-argument", `${key} must be text.`);
  }
  if (!Object.keys(editable).length) fail("invalid-argument", "No editable member fields were provided.");

  const memberRef = db.collection("members").doc(id);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(memberRef);
    if (!snapshot.exists) fail("not-found", "Member not found.");
    if (Object.hasOwn(editable, "cnic")) {
      const duplicate = await transaction.get(db.collection("members").where("cnic", "==", editable.cnic).limit(2));
      if (duplicate.docs.some((item) => item.id !== id)) fail("already-exists", "A member with this CNIC is already registered.");
    }
    if (Object.hasOwn(editable, "trainerId")) {
      if (editable.trainerId) {
        const trainer = await transaction.get(db.collection("trainers").doc(editable.trainerId));
        if (!trainer.exists || trainer.get("status") !== "ACTIVE") fail("failed-precondition", "The selected trainer profile is inactive.");
        editable.trainerName = trainer.get("name") || "";
        editable.trainerUid = trainer.get("authUid") || "";
      } else {
        editable.trainerName = "";
        editable.trainerUid = "";
      }
    }
    if (Object.hasOwn(editable, "timeSlotId")) {
      if (editable.timeSlotId) {
        const timeSlot = await transaction.get(db.collection("time_slots").doc(editable.timeSlotId));
        if (!timeSlot.exists) fail("not-found", "The selected time slot does not exist.");
        editable.timeSlotName = timeSlot.get("name") || "";
      } else {
        editable.timeSlotName = "";
      }
    }
    transaction.update(memberRef, { ...editable, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBER_UPDATED", module: "members", recordId: id,
      timestamp: FieldValue.serverTimestamp(), details: { fields: Object.keys(editable) }
    });
  });
  return { memberId: id };
});

exports.searchMembers = onCall(async (request) => {
  const actor = await requireRole(request, [...memberStaff, "TRAINER"]);
  const search = requiredText(request.data?.search, "Search term", 100).trim();
  const normalized = search.toLocaleLowerCase();
  const digits = search.replace(/\D/g, "");
  const results = new Map();
  const addSnapshots = (snapshot) => snapshot.docs.forEach((item) => results.set(item.id, { id: item.id, ...item.data() }));
  let members = db.collection("members");
  if (actor.role === "TRAINER") members = members.where("trainerUid", "==", actor.uid);
  const tasks = [members.orderBy("fullNameSearch").startAt(normalized).endAt(`${normalized}\uf8ff`).limit(50).get()];
  if (digits.length >= 3) {
    tasks.push(members.orderBy("phoneSearch").startAt(digits).endAt(`${digits}\uf8ff`).limit(50).get());
    tasks.push(members.orderBy("cnic").startAt(digits).endAt(`${digits}\uf8ff`).limit(50).get());
  }
  if (/^TGG-[MF]-\d{5}$/i.test(search)) {
    if (actor.role === "TRAINER") tasks.push(members.where("trainerUid", "==", actor.uid).get().then((snapshot) => snapshot.docs.find((item) => item.id === search.toUpperCase()) || null));
    else tasks.push(members.doc(search.toUpperCase()).get());
  }
  const snapshots = await Promise.all(tasks);
  snapshots.forEach((snapshot) => {
    if (snapshot.docs) addSnapshots(snapshot);
    else if (snapshot?.exists) results.set(snapshot.id, { id: snapshot.id, ...snapshot.data() });
  });
  return Array.from(results.values()).slice(0, 100);
});

exports.getAdminDashboardSummary = onCall(async (request) => {
  await requireRole(request, memberStaff);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const dayStart = new Date(Date.UTC(year, month - 1, day));
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const expiringUntil = new Date(dayStart.getTime() + 31 * 86400000);
  const [memberSnapshot, monthPaymentSnapshot, monthExpenseSummary, pendingPaymentSummary, attendanceCount, expiringCount] = await Promise.all([
    db.collection("members").select("status", "membershipExpiryDate", "monthlyFee", "feeStatus").get(),
    db.collection("payments")
      .where("status", "==", "SUCCESS")
      .where("paymentDate", ">=", Timestamp.fromDate(monthStart))
      .where("paymentDate", "<", Timestamp.fromDate(nextMonth))
      .select("amount", "paymentDate")
      .get(),
    db.collection("expenses").where("expenseDate", ">=", Timestamp.fromDate(monthStart)).where("expenseDate", "<", Timestamp.fromDate(nextMonth)).aggregate({ amount: AggregateField.sum("amount"), count: AggregateField.count() }).get(),
    db.collection("payments").where("status", "==", "PENDING").aggregate({ amount: AggregateField.sum("amount"), count: AggregateField.count() }).get(),
    db.collection("attendance").where("date", ">=", Timestamp.fromDate(dayStart)).where("date", "<", Timestamp.fromDate(nextDay)).count().get(),
    db.collection("members").where("status", "==", "ACTIVE").where("membershipExpiryDate", ">=", Timestamp.fromDate(dayStart)).where("membershipExpiryDate", "<", Timestamp.fromDate(expiringUntil)).count().get()
  ]);

  let activeMembers = 0;
  let expiredMembers = 0;
  let pendingFees = 0;
  memberSnapshot.docs.forEach((snapshot) => {
    const member = snapshot.data();
    if (member.status === "INACTIVE") return;
    const expiry = member.membershipExpiryDate?.toDate();
    const isExpired = expiry ? expiry.getTime() < dayStart.getTime() : member.status === "EXPIRED";
    if (isExpired) expiredMembers += 1;
    else activeMembers += 1;
    if (isExpired || member.feeStatus !== "PAID") pendingFees += Number(member.monthlyFee || 0);
  });

  let todayRevenue = 0;
  let monthlyRevenue = 0;
  monthPaymentSnapshot.docs.forEach((snapshot) => {
    const payment = snapshot.data();
    const amount = Number(payment.amount) || 0;
    monthlyRevenue += amount;
    if (payment.paymentDate?.toDate().getTime() >= dayStart.getTime()
      && payment.paymentDate.toDate().getTime() < nextDay.getTime()) todayRevenue += amount;
  });

  const summary = {
    totalMembers: memberSnapshot.size,
    activeMembers,
    expiredMembers,
    todayRevenue,
    monthlyRevenue,
    pendingFees,
    pendingPayments: Number(pendingPaymentSummary.data().amount || 0),
    pendingPaymentCount: Number(pendingPaymentSummary.data().count || 0),
    expiringMemberships: expiringCount.data().count,
    todayAttendance: attendanceCount.data().count
  };
  if (["SUPER_ADMIN", "MANAGER"].includes(request.auth.token.role)) {
    summary.monthlyExpenses = Number(monthExpenseSummary.data().amount || 0);
    summary.monthlyNetProfit = summary.monthlyRevenue - summary.monthlyExpenses;
  }
  return summary;
});

exports.deactivateMember = onCall(async (request) => {
  const actor = await requireRole(request, ["SUPER_ADMIN", "MANAGER"]);
  const memberId = requiredText(request.data?.memberId, "Member ID", 32);
  const memberRef = db.collection("members").doc(memberId);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(memberRef);
    if (!snapshot.exists) fail("not-found", "Member not found.");
    transaction.update(memberRef, { status: "INACTIVE", updatedAt: FieldValue.serverTimestamp() });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBER_DEACTIVATED", module: "members", recordId: memberId,
      timestamp: FieldValue.serverTimestamp(), details: { permanentDelete: false }
    });
  });
  return { memberId, status: "INACTIVE" };
});

exports.setMemberPhoto = onCall(async (request) => {
  const actor = await requireRole(request, memberStaff);
  const memberId = requiredText(request.data?.memberId, "Member ID", 32);
  const profilePhotoURL = requiredText(request.data?.profilePhotoURL, "Profile photo URL", 2048);
  const profilePhotoPath = requiredText(request.data?.profilePhotoPath, "Profile photo path", 256);
  if (profilePhotoPath !== `members/${memberId}/profile.jpg`) fail("invalid-argument", "Invalid member photo path.");
  if (profilePhotoURL !== `gs://${getStorage().bucket().name}/${profilePhotoPath}`) fail("invalid-argument", "Profile photo reference must match its private Storage path.");
  const [metadata] = await getStorage().bucket().file(profilePhotoPath).getMetadata().catch(() => fail("not-found", "Upload the profile image before saving it."));
  if (!metadata.contentType?.startsWith("image/")) fail("invalid-argument", "The profile file must be an image.");
  if (Number(metadata.size) > 5 * 1024 * 1024) fail("invalid-argument", "Profile images must be 5 MB or smaller.");

  const memberRef = db.collection("members").doc(memberId);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const member = await transaction.get(memberRef);
    if (!member.exists) fail("not-found", "Member not found.");
    transaction.update(memberRef, { profilePhotoURL, profilePhotoPath, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBER_PHOTO_UPDATED", module: "members", recordId: memberId,
      timestamp: FieldValue.serverTimestamp(), details: {}
    });
  });
  return { memberId, profilePhotoURL, profilePhotoPath };
});

exports.removeMemberPhoto = onCall(async (request) => {
  const actor = await requireRole(request, memberStaff);
  const memberId = requiredText(request.data?.memberId, "Member ID", 32);
  const memberRef = db.collection("members").doc(memberId);
  const memberSnapshot = await memberRef.get();
  if (!memberSnapshot.exists) fail("not-found", "Member not found.");
  const path = memberSnapshot.get("profilePhotoPath");
  if (path) await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(memberRef);
    if (!latest.exists) fail("not-found", "Member not found.");
    transaction.update(memberRef, { profilePhotoURL: "", profilePhotoPath: "", updatedAt: FieldValue.serverTimestamp() });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBER_PHOTO_REMOVED", module: "members", recordId: memberId,
      timestamp: FieldValue.serverTimestamp(), details: {}
    });
  });
  return { memberId };
});

exports.createMembershipPlan = onCall(async (request) => {
  const actor = await requireRole(request, planStaff);
  const data = request.data || {};
  const planName = requiredText(data.planName, "Plan name", 80);
  const durationMonths = Number(data.durationMonths);
  const price = Number(data.price);
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 60) fail("invalid-argument", "Duration must be 1 to 60 calendar months.");
  if (!Number.isFinite(price) || price < 0) fail("invalid-argument", "Plan price must be zero or greater.");
  const features = Array.isArray(data.features) ? data.features.map((item) => requiredText(item, "Feature", 120)).slice(0, 20) : [];
  const planRef = db.collection("membership_plans").doc();
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    transaction.create(planRef, {
      planId: planRef.id,
      planName,
      durationMonths,
      price: Math.round(price * 100) / 100,
      description: typeof data.description === "string" ? data.description.slice(0, 1000) : "",
      features,
      status: data.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBERSHIP_PLAN_CREATED", module: "membership_plans", recordId: planRef.id,
      timestamp: FieldValue.serverTimestamp(), details: { planName }
    });
  });
  return { planId: planRef.id };
});

exports.updateMembershipPlan = onCall(async (request) => {
  const actor = await requireRole(request, planStaff);
  const { planId, ...data } = request.data || {};
  const id = requiredText(planId, "Plan ID", 128);
  const update = { updatedAt: FieldValue.serverTimestamp() };
  if (Object.hasOwn(data, "planName")) update.planName = requiredText(data.planName, "Plan name", 80);
  if (Object.hasOwn(data, "durationMonths")) {
    const months = Number(data.durationMonths);
    if (!Number.isInteger(months) || months < 1 || months > 60) fail("invalid-argument", "Duration must be 1 to 60 calendar months.");
    update.durationMonths = months;
  }
  if (Object.hasOwn(data, "price")) {
    const price = Number(data.price);
    if (!Number.isFinite(price) || price < 0) fail("invalid-argument", "Plan price must be zero or greater.");
    update.price = Math.round(price * 100) / 100;
  }
  if (Object.hasOwn(data, "description")) update.description = String(data.description).slice(0, 1000);
  if (Object.hasOwn(data, "features")) {
    if (!Array.isArray(data.features)) fail("invalid-argument", "Features must be a list.");
    update.features = data.features.map((item) => requiredText(item, "Feature", 120)).slice(0, 20);
  }
  if (Object.hasOwn(data, "status")) {
    if (!["ACTIVE", "INACTIVE"].includes(data.status)) fail("invalid-argument", "Invalid plan status.");
    update.status = data.status;
  }
  const planRef = db.collection("membership_plans").doc(id);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(planRef);
    if (!snapshot.exists) fail("not-found", "Membership plan not found.");
    transaction.update(planRef, update);
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBERSHIP_PLAN_UPDATED", module: "membership_plans", recordId: id,
      timestamp: FieldValue.serverTimestamp(), details: { fields: Object.keys(update).filter((key) => key !== "updatedAt") }
    });
  });
  return { planId: id };
});

exports.deleteMembershipPlan = onCall(async (request) => {
  const actor = await requireRole(request, ["SUPER_ADMIN", "MANAGER"]);
  const planId = requiredText(request.data?.planId, "Plan ID", 128);
  const planRef = db.collection("membership_plans").doc(planId);
  const membersQuery = db.collection("members").where("membershipPlanId", "==", planId).limit(1);
  const historyQuery = db.collection("membership_history").where("planId", "==", planId).limit(1);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const [plan, members, history] = await Promise.all([transaction.get(planRef), transaction.get(membersQuery), transaction.get(historyQuery)]);
    if (!plan.exists) fail("not-found", "Membership plan not found.");
    if (!members.empty || !history.empty) fail("failed-precondition", "This plan is linked to member or membership history records. Deactivate it instead.");
    transaction.delete(planRef);
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBERSHIP_PLAN_DELETED", module: "membership_plans", recordId: planId,
      timestamp: FieldValue.serverTimestamp(), details: {}
    });
  });
  return { planId };
});

exports.renewMembership = onCall(async (request) => {
  const actor = await requireRole(request, memberStaff);
  const memberId = requiredText(request.data?.memberId, "Member ID", 32);
  const planId = requiredText(request.data?.planId, "Plan ID", 128);
  const historyRef = db.collection("membership_history").doc();
  const activityRef = db.collection("activity_logs").doc();
  const memberRef = db.collection("members").doc(memberId);
  const result = await db.runTransaction(async (transaction) => {
    const memberSnapshot = await transaction.get(memberRef);
    if (!memberSnapshot.exists) fail("not-found", "Member not found.");
    const { ref: planRef, data: plan } = await getPlan(planId, transaction);
    const member = memberSnapshot.data();
    if (member.status === "INACTIVE") fail("failed-precondition", "Inactive members cannot renew until reactivated.");
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const currentExpiry = member.membershipExpiryDate?.toDate();
    const startDate = currentExpiry && currentExpiry.getTime() >= todayStart.getTime() ? currentExpiry : todayStart;
    const expiryDate = addCalendarMonths(startDate, plan.durationMonths);
    const status = statusForExpiry(expiryDate, member.status);
    const reminderRef = notificationRef("PAYMENT_REMINDER", memberId, historyRef.id);
    const existingReminder = await transaction.get(reminderRef);

    transaction.create(historyRef, {
      membershipId: historyRef.id,
      memberId,
      planId,
      planName: plan.planName,
      startDate: Timestamp.fromDate(startDate),
      expiryDate: Timestamp.fromDate(expiryDate),
      price: plan.price,
      paymentId: null,
      feeStatus: "DUE",
      status,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    });
    transaction.update(memberRef, {
      membershipPlanId: planId,
      membershipPlanName: plan.planName,
      monthlyFee: plan.price,
      membershipStartDate: Timestamp.fromDate(startDate),
      membershipExpiryDate: Timestamp.fromDate(expiryDate),
      currentMembershipId: historyRef.id,
      feeStatus: "DUE",
      status,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "MEMBERSHIP_RENEWED", module: "membership_history", recordId: historyRef.id,
      timestamp: FieldValue.serverTimestamp(), details: { memberId, planId }
    });
    if (!existingReminder.exists) transaction.create(reminderRef, notificationData({
      id: reminderRef.id,
      member,
      type: "PAYMENT_REMINDER",
      title: "Membership payment due",
      message: `Your ${plan.planName} membership renewal is ready. Please contact the gym to complete payment.`,
      relatedId: historyRef.id,
      relatedType: "membership_history",
      priority: "HIGH",
      createdBy: actor.uid
    }));
    return { membershipId: historyRef.id, startDate: toDateString(startDate), expiryDate: toDateString(expiryDate), price: plan.price };
  });
  return result;
});

exports.createPayment = onCall(async (request) => {
  const actor = await requireRole(request, paymentStaff);
  const data = request.data || {};
  const memberId = requiredText(data.memberId, "Member", 32);
  const planId = requiredText(data.planId, "Plan", 128);
  const amount = amountValue(data.amount);
  const paymentMethod = requiredText(data.paymentMethod, "Payment method", 24);
  const status = requiredText(data.status, "Status", 16);
  if (!methods.has(paymentMethod)) fail("invalid-argument", "Select a supported payment method.");
  if (!paymentStatuses.has(status)) fail("invalid-argument", "Select a supported payment status.");
  if (status === "REFUNDED") fail("failed-precondition", "Create the payment first, then use the refund action.");
  if (paymentMethod !== "CASH" && ["BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD"].includes(paymentMethod) && !String(data.transactionId || "").trim()) {
    fail("invalid-argument", "A transaction ID is required for this payment method.");
  }
  const paymentDate = parseDate(data.paymentDate, "Payment date");
  const transactionId = typeof data.transactionId === "string" ? data.transactionId.trim().slice(0, 120) : "";
  const paymentRef = db.collection("payments").doc();
  const activityRef = db.collection("activity_logs").doc();
  const counterRef = db.collection("system_counters").doc("payment_receipt");
  const memberRef = db.collection("members").doc(memberId);
  const result = await db.runTransaction(async (transaction) => {
    const [memberSnapshot, planSnapshot, counterSnapshot] = await Promise.all([
      transaction.get(memberRef), transaction.get(db.collection("membership_plans").doc(planId)), transaction.get(counterRef)
    ]);
    if (!memberSnapshot.exists) fail("not-found", "The selected member does not exist.");
    if (!planSnapshot.exists) fail("not-found", "The selected plan does not exist.");
    const member = memberSnapshot.data();
    const plan = planSnapshot.data();
    if (member.membershipPlanId !== planId) fail("failed-precondition", "Payment plan must match the member's current membership. Renew the membership first.");
    const membershipId = member.currentMembershipId || null;
    const historyRef = membershipId ? db.collection("membership_history").doc(membershipId) : null;
    const historySnapshot = historyRef ? await transaction.get(historyRef) : null;
    let sequence = (counterSnapshot.exists ? counterSnapshot.get("value") : 0) + 1;
    let receiptId;
    let receiptRef;
    for (let attempts = 0; attempts < 100; attempts += 1) {
      receiptId = formatReceiptId(sequence);
      receiptRef = db.collection("payment_receipts").doc(receiptId);
      const existingReceipt = await transaction.get(receiptRef);
      if (!existingReceipt.exists) break;
      sequence += 1;
      receiptRef = null;
    }
    if (!receiptRef) fail("resource-exhausted", "Unable to allocate a unique receipt number. Contact support.");
    const paymentNotificationType = status === "SUCCESS" ? "PAYMENT_SUCCESS" : status === "PENDING" ? "PAYMENT_PENDING" : "";
    const paymentNotificationRef = paymentNotificationType ? notificationRef(paymentNotificationType, memberId, paymentRef.id) : null;
    const existingPaymentNotification = paymentNotificationRef ? await transaction.get(paymentNotificationRef) : null;
    const payment = {
      paymentId: paymentRef.id,
      receiptId,
      memberId,
      memberName: member.fullName,
      trainerId: member.trainerId || "",
      trainerName: member.trainerName || "",
      amount,
      paymentDate: Timestamp.fromDate(paymentDate),
      paymentMethod,
      planId,
      planName: plan.planName,
      membershipId,
      transactionId,
      status,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    };
    transaction.create(paymentRef, payment);
    transaction.create(receiptRef, {
      receiptId,
      paymentId: paymentRef.id,
      memberId,
      memberName: member.fullName,
      phone: member.phone,
      amount,
      paymentDate: Timestamp.fromDate(paymentDate),
      paymentMethod,
      planName: plan.planName,
      transactionId,
      status,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    });
    transaction.set(counterRef, { value: sequence, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (status === "SUCCESS" && historyRef && historySnapshot?.exists) {
      transaction.update(historyRef, { paymentId: paymentRef.id, feeStatus: "PAID" });
      transaction.update(memberRef, { feeStatus: "PAID", updatedAt: FieldValue.serverTimestamp() });
    }
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "PAYMENT_CREATED", module: "payments", recordId: paymentRef.id,
      timestamp: FieldValue.serverTimestamp(), details: { receiptId, memberId, status }
    });
    if (paymentNotificationRef && !existingPaymentNotification?.exists) transaction.create(paymentNotificationRef, notificationData({
      id: paymentNotificationRef.id,
      member,
      type: paymentNotificationType,
      title: paymentNotificationType === "PAYMENT_SUCCESS" ? "Payment received" : "Payment pending",
      message: paymentNotificationType === "PAYMENT_SUCCESS"
        ? `Your payment of PKR ${amount.toLocaleString("en-PK")} was recorded successfully. Receipt ${receiptId}.`
        : `Your payment of PKR ${amount.toLocaleString("en-PK")} is pending confirmation. Receipt ${receiptId}.`,
      relatedId: paymentRef.id,
      relatedType: "payments",
      priority: paymentNotificationType === "PAYMENT_SUCCESS" ? "NORMAL" : "HIGH",
      createdBy: actor.uid
    }));
    transaction.create(db.collection("activity_logs").doc(), {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "RECEIPT_GENERATED", module: "payment_receipts", recordId: receiptId,
      timestamp: FieldValue.serverTimestamp(), details: { paymentId: paymentRef.id }
    });
    return { paymentId: paymentRef.id, receiptId };
  });
  return result;
});

exports.updatePayment = onCall(async (request) => {
  const actor = await requireRole(request, planStaff);
  const { paymentId, ...data } = request.data || {};
  const id = requiredText(paymentId, "Payment ID", 128);
  const update = { updatedAt: FieldValue.serverTimestamp() };
  if (Object.hasOwn(data, "amount")) update.amount = amountValue(data.amount);
  if (Object.hasOwn(data, "paymentDate")) update.paymentDate = Timestamp.fromDate(parseDate(data.paymentDate, "Payment date"));
  if (Object.hasOwn(data, "paymentMethod")) {
    if (!methods.has(data.paymentMethod)) fail("invalid-argument", "Select a supported payment method.");
    update.paymentMethod = data.paymentMethod;
  }
  if (Object.hasOwn(data, "transactionId")) update.transactionId = String(data.transactionId).trim().slice(0, 120);
  if (Object.hasOwn(data, "status")) {
    if (!paymentStatuses.has(data.status)) fail("invalid-argument", "Select a supported payment status.");
    if (data.status === "REFUNDED") fail("failed-precondition", "Use the refund action to preserve refund confirmation and audit history.");
    update.status = data.status;
  }
  const paymentRef = db.collection("payments").doc(id);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(paymentRef);
    if (!snapshot.exists) fail("not-found", "Payment not found.");
    const payment = snapshot.data();
    if (payment.status === "REFUNDED") fail("failed-precondition", "Refunded payments are immutable.");
    const next = { ...payment, ...update };
    if (next.paymentMethod !== "CASH" && ["BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD"].includes(next.paymentMethod) && !next.transactionId) {
      fail("invalid-argument", "A transaction ID is required for this payment method.");
    }
    const receiptRef = db.collection("payment_receipts").doc(payment.receiptId);
    const receipt = await transaction.get(receiptRef);
    const memberRef = db.collection("members").doc(payment.memberId);
    const memberSnapshot = await transaction.get(memberRef);
    if (!memberSnapshot.exists) fail("not-found", "The payment member record no longer exists.");
    const notificationType = payment.status === next.status ? "" : next.status === "SUCCESS" ? "PAYMENT_SUCCESS" : next.status === "PENDING" ? "PAYMENT_PENDING" : "";
    const paymentNotificationRef = notificationType ? notificationRef(notificationType, payment.memberId, id) : null;
    const existingPaymentNotification = paymentNotificationRef ? await transaction.get(paymentNotificationRef) : null;
    if (Object.hasOwn(update, "status")) await updateMembershipFeeState(transaction, payment, paymentRef, next.status);
    transaction.update(paymentRef, update);
    if (receipt.exists) transaction.update(receiptRef, {
      amount: next.amount,
      paymentDate: next.paymentDate,
      paymentMethod: next.paymentMethod,
      transactionId: next.transactionId,
      status: next.status
    });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "PAYMENT_UPDATED", module: "payments", recordId: id,
      timestamp: FieldValue.serverTimestamp(), details: { fields: Object.keys(update).filter((key) => key !== "updatedAt"), status: next.status }
    });
    if (paymentNotificationRef && !existingPaymentNotification?.exists) transaction.create(paymentNotificationRef, notificationData({
      id: paymentNotificationRef.id,
      member: memberSnapshot.data(),
      type: notificationType,
      title: notificationType === "PAYMENT_SUCCESS" ? "Payment received" : "Payment pending",
      message: notificationType === "PAYMENT_SUCCESS"
        ? `Your payment of PKR ${Number(next.amount).toLocaleString("en-PK")} was recorded successfully. Receipt ${payment.receiptId}.`
        : `Your payment of PKR ${Number(next.amount).toLocaleString("en-PK")} is pending confirmation. Receipt ${payment.receiptId}.`,
      relatedId: id,
      relatedType: "payments",
      priority: notificationType === "PAYMENT_SUCCESS" ? "NORMAL" : "HIGH",
      createdBy: actor.uid
    }));
    if (payment.status === "SUCCESS" && next.status === "REFUNDED") {
      transaction.create(db.collection("activity_logs").doc(), {
        userId: actor.uid, userName: actor.name, role: actor.role,
        action: "PAYMENT_REFUNDED", module: "payments", recordId: id,
        timestamp: FieldValue.serverTimestamp(), details: { receiptId: payment.receiptId, amount: payment.amount }
      });
    }
  });
  return { paymentId: id };
});

exports.refundPayment = onCall(async (request) => {
  const actor = await requireRole(request, planStaff);
  const paymentId = requiredText(request.data?.paymentId, "Payment ID", 128);
  const paymentRef = db.collection("payments").doc(paymentId);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(paymentRef);
    if (!snapshot.exists) fail("not-found", "Payment not found.");
    const payment = snapshot.data();
    if (payment.status !== "SUCCESS") fail("failed-precondition", "Only successful payments can be refunded.");
    const receiptRef = db.collection("payment_receipts").doc(payment.receiptId);
    const receipt = await transaction.get(receiptRef);
    await updateMembershipFeeState(transaction, payment, paymentRef, "REFUNDED");
    transaction.update(paymentRef, { status: "REFUNDED", updatedAt: FieldValue.serverTimestamp(), refundedAt: FieldValue.serverTimestamp(), refundedBy: actor.uid });
    if (receipt.exists) transaction.update(receiptRef, { status: "REFUNDED" });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "PAYMENT_REFUNDED", module: "payments", recordId: paymentId,
      timestamp: FieldValue.serverTimestamp(), details: { receiptId: payment.receiptId, amount: payment.amount }
    });
  });
  return { paymentId, status: "REFUNDED" };
});

exports.refreshExpiredMembershipStatuses = onSchedule({ schedule: "5 0 * * *", timeZone: "Asia/Karachi" }, async () => {
  const now = new Date();
  const expiryCutoff = Timestamp.fromDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  let changed = 0;
  let cursor = null;

  while (true) {
    let expiredQuery = db.collection("members")
      .where("status", "==", "ACTIVE")
      .where("membershipExpiryDate", "<", expiryCutoff)
      .orderBy("membershipExpiryDate")
      .limit(400);
    if (cursor) expiredQuery = expiredQuery.startAfter(cursor);
    const snapshot = await expiredQuery.get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((member) => {
      batch.update(member.ref, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
    changed += snapshot.size;
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 400) break;
  }

  return { changed };
});

exports.createTrainer = onCall(async (request) => {
  const actor = await requireRole(request, planStaff);
  const data = request.data || {};
  const name = requiredText(data.name, "Trainer name", 120);
  const phone = typeof data.phone === "string" ? data.phone.trim() : "";
  if (phone && !validPhone(phone)) fail("invalid-argument", "Enter a valid phone number.");
  const trainerRef = db.collection("trainers").doc();
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    transaction.create(trainerRef, {
      trainerId: trainerRef.id,
      name,
      phone,
      email: typeof data.email === "string" ? data.email.trim().slice(0, 254) : "",
      specialization: typeof data.specialization === "string" ? data.specialization.trim().slice(0, 120) : "",
      experience: typeof data.experience === "string" ? data.experience.trim().slice(0, 80) : "",
      biography: typeof data.biography === "string" ? data.biography.trim().slice(0, 2000) : "",
      authUid: "",
      status: "ACTIVE",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid
    });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "TRAINER_CREATED", module: "trainers", recordId: trainerRef.id,
      timestamp: FieldValue.serverTimestamp(), details: {}
    });
  });
  return { trainerId: trainerRef.id };
});

exports.updateTrainer = onCall(async (request) => {
  const actor = await requireRole(request, planStaff);
  const { trainerId, ...data } = request.data || {};
  const id = requiredText(trainerId, "Trainer ID", 128);
  const update = { updatedAt: FieldValue.serverTimestamp() };
  if (Object.hasOwn(data, "name")) update.name = requiredText(data.name, "Trainer name", 120);
  if (Object.hasOwn(data, "phone")) {
    update.phone = typeof data.phone === "string" ? data.phone.trim() : "";
    if (update.phone && !validPhone(update.phone)) fail("invalid-argument", "Enter a valid phone number.");
  }
  for (const key of ["email", "specialization", "experience", "biography"]) {
    if (Object.hasOwn(data, key)) update[key] = typeof data[key] === "string" ? data[key].trim().slice(0, key === "biography" ? 2000 : 254) : "";
  }
  const trainerRef = db.collection("trainers").doc(id);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const trainer = await transaction.get(trainerRef);
    if (!trainer.exists) fail("not-found", "Trainer not found.");
    transaction.update(trainerRef, update);
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "TRAINER_UPDATED", module: "trainers", recordId: id,
      timestamp: FieldValue.serverTimestamp(), details: { fields: Object.keys(update).filter((key) => key !== "updatedAt") }
    });
  });
  return { trainerId: id };
});

exports.deactivateTrainer = onCall(async (request) => {
  const actor = await requireRole(request, planStaff);
  const trainerId = requiredText(request.data?.trainerId, "Trainer ID", 128);
  const trainerRef = db.collection("trainers").doc(trainerId);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const trainer = await transaction.get(trainerRef);
    if (!trainer.exists) fail("not-found", "Trainer not found.");
    transaction.update(trainerRef, { status: "INACTIVE", updatedAt: FieldValue.serverTimestamp() });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "TRAINER_DEACTIVATED", module: "trainers", recordId: trainerId,
      timestamp: FieldValue.serverTimestamp(), details: {}
    });
  });
  return { trainerId, status: "INACTIVE" };
});

function validateExpense(data) {
  const title = requiredText(data.title, "Title", 160);
  const category = requiredText(data.category, "Category", 64);
  const amount = amountValue(data.amount);
  const expenseDate = Timestamp.fromDate(parseDate(data.expenseDate, "Expense date"));
  const paymentMethod = requiredText(data.paymentMethod, "Payment method", 32);
  if (!expenseCategories.has(category)) fail("invalid-argument", "Select a supported expense category.");
  if (!expenseMethods.has(paymentMethod)) fail("invalid-argument", "Select a supported expense payment method.");
  return {
    title,
    titleSearch: title.toLocaleLowerCase(),
    category,
    amount,
    expenseDate,
    paymentMethod,
    description: typeof data.description === "string" ? data.description.trim().slice(0, 1200) : ""
  };
}

exports.createExpense = onCall(async (request) => {
  const actor = await requireRole(request, financialStaff);
  const expense = validateExpense(request.data || {});
  const expenseRef = db.collection("expenses").doc();
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    transaction.create(expenseRef, {
      ...expense,
      expenseId: expenseRef.id,
      receiptURL: "",
      receiptPath: "",
      addedBy: actor.uid,
      addedByName: actor.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "EXPENSE_CREATED", module: "expenses", recordId: expenseRef.id, targetId: expenseRef.id,
      timestamp: FieldValue.serverTimestamp(), details: { category: expense.category, amount: expense.amount }
    });
  });
  return { expenseId: expenseRef.id };
});

exports.updateExpense = onCall(async (request) => {
  const actor = await requireRole(request, financialStaff);
  const { expenseId, ...data } = request.data || {};
  const id = requiredText(expenseId, "Expense ID", 128);
  const fields = validateExpense(data);
  const expenseRef = db.collection("expenses").doc(id);
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(expenseRef);
    if (!snapshot.exists) fail("not-found", "Expense not found.");
    transaction.update(expenseRef, { ...fields, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "EXPENSE_UPDATED", module: "expenses", recordId: id, targetId: id,
      timestamp: FieldValue.serverTimestamp(), details: { fields: Object.keys(fields) }
    });
  });
  return { expenseId: id };
});

exports.attachExpenseReceipt = onCall(async (request) => {
  const actor = await requireRole(request, financialStaff);
  const expenseId = requiredText(request.data?.expenseId, "Expense ID", 128);
  const receiptURL = requiredText(request.data?.receiptURL, "Receipt URL", 2048);
  const receiptPath = requiredText(request.data?.receiptPath, "Receipt path", 256);
  if (!receiptPath.startsWith(`expenses/${expenseId}/receipt.`)) fail("invalid-argument", "Invalid expense receipt path.");
  const file = getStorage().bucket().file(receiptPath);
  const [metadata] = await file.getMetadata().catch(() => fail("not-found", "Upload the receipt file before saving it."));
  if (!(metadata.contentType?.startsWith("image/") || metadata.contentType === "application/pdf")) fail("invalid-argument", "Expense receipts must be an image or PDF.");
  if (Number(metadata.size) > 10 * 1024 * 1024) fail("invalid-argument", "Expense receipts must be 10 MB or smaller.");
  if (receiptURL !== `gs://${getStorage().bucket().name}/${receiptPath}`) fail("invalid-argument", "Receipt reference must match its private Storage path.");

  const expenseRef = db.collection("expenses").doc(expenseId);
  const activityRef = db.collection("activity_logs").doc();
  let previousReceiptPath = "";
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(expenseRef);
    if (!snapshot.exists) fail("not-found", "Expense not found.");
    previousReceiptPath = snapshot.get("receiptPath") || "";
    transaction.update(expenseRef, { receiptURL, receiptPath, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "EXPENSE_UPDATED", module: "expenses", recordId: expenseId, targetId: expenseId,
      timestamp: FieldValue.serverTimestamp(), details: { receiptAttached: true }
    });
  });
  if (previousReceiptPath && previousReceiptPath !== receiptPath) await getStorage().bucket().file(previousReceiptPath).delete({ ignoreNotFound: true });
  return { expenseId, receiptURL, receiptPath };
});

exports.deleteExpense = onCall(async (request) => {
  const actor = await requireRole(request, ["SUPER_ADMIN"]);
  const expenseId = requiredText(request.data?.expenseId, "Expense ID", 128);
  const expenseRef = db.collection("expenses").doc(expenseId);
  const snapshot = await expenseRef.get();
  if (!snapshot.exists) fail("not-found", "Expense not found.");
  const expense = snapshot.data();
  if (expense.receiptPath) await getStorage().bucket().file(expense.receiptPath).delete({ ignoreNotFound: true });
  const activityRef = db.collection("activity_logs").doc();
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(expenseRef);
    if (!current.exists) fail("not-found", "Expense not found.");
    transaction.delete(expenseRef);
    transaction.create(activityRef, {
      userId: actor.uid, userName: actor.name, role: actor.role,
      action: "EXPENSE_DELETED", module: "expenses", recordId: expenseId, targetId: expenseId,
      timestamp: FieldValue.serverTimestamp(), details: { category: expense.category, amount: expense.amount }
    });
  });
  return { expenseId };
});

exports.removeExpenseReceipt = onCall(async (request) => {
  const actor = await requireRole(request, financialStaff);
  const expenseId = requiredText(request.data?.expenseId, "Expense ID", 128);
  const expenseRef = db.collection("expenses").doc(expenseId);
  const snapshot = await expenseRef.get();
  if (!snapshot.exists) fail("not-found", "Expense not found.");
  const path = snapshot.get("receiptPath");
  if (path) await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  await expenseRef.update({ receiptURL: "", receiptPath: "", updatedAt: FieldValue.serverTimestamp() });
  await eventLog(actor, "EXPENSE_UPDATED", "expenses", expenseId, { receiptRemoved: true });
  return { expenseId };
});

async function aggregateAmount(queryRef) {
  const snapshot = await queryRef.aggregate({ amount: AggregateField.sum("amount"), count: AggregateField.count() }).get();
  const data = snapshot.data();
  return { amount: Number(data.amount || 0), count: Number(data.count || 0) };
}

exports.getFinancialDashboard = onCall(async (request) => {
  const actor = await requireRole(request, financialStaff);
  const range = dateWindow(request.data || {}, 30);
  if (range.endDate.getTime() - range.startDate.getTime() > 366 * 86400000) fail("invalid-argument", "Financial dashboard ranges are limited to one year.");
  const paymentBase = db.collection("payments").where("paymentDate", ">=", range.start).where("paymentDate", "<", range.end);
  const expenseBase = db.collection("expenses").where("expenseDate", ">=", range.start).where("expenseDate", "<", range.end);
  const [revenue, pending, refunded, expenses] = await Promise.all([
    aggregateAmount(paymentBase.where("status", "==", "SUCCESS")),
    aggregateAmount(paymentBase.where("status", "==", "PENDING")),
    aggregateAmount(paymentBase.where("status", "==", "REFUNDED")),
    aggregateAmount(expenseBase)
  ]);

  const startMonth = new Date(Date.UTC(range.startDate.getUTCFullYear(), range.startDate.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(range.endDate.getUTCFullYear(), range.endDate.getUTCMonth(), 1));
  const months = [];
  for (let month = new Date(startMonth); month <= endMonth; month.setUTCMonth(month.getUTCMonth() + 1)) {
    const monthStart = new Date(Math.max(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1), range.startDate.getTime()));
    const monthEnd = new Date(Math.min(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1), range.end.toDate().getTime()));
    const from = Timestamp.fromDate(monthStart);
    const to = Timestamp.fromDate(monthEnd);
    const [monthRevenue, monthExpenses] = await Promise.all([
      aggregateAmount(db.collection("payments").where("status", "==", "SUCCESS").where("paymentDate", ">=", from).where("paymentDate", "<", to)),
      aggregateAmount(db.collection("expenses").where("expenseDate", ">=", from).where("expenseDate", "<", to))
    ]);
    months.push({ month: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`, revenue: monthRevenue.amount, expenses: monthExpenses.amount, netProfit: monthRevenue.amount - monthExpenses.amount });
  }

  const categoryTotals = await Promise.all([...expenseCategories].map(async (category) => ({
    category,
    ...(await aggregateAmount(expenseBase.where("category", "==", category)))
  })));
  const netProfit = revenue.amount - expenses.amount;
  await eventLog(actor, "FINANCIAL_REPORT_VIEWED", "financials", "", { from: range.startKey, to: range.endKey });
  return {
    from: range.startKey,
    to: range.endKey,
    totalRevenue: revenue.amount,
    totalExpenses: expenses.amount,
    successfulPaymentCount: revenue.count,
    expenseCount: expenses.count,
    dataAvailable: revenue.count > 0 || expenses.count > 0 || pending.count > 0 || refunded.count > 0,
    netProfit,
    profitMargin: revenue.amount === 0 ? 0 : (netProfit / revenue.amount) * 100,
    pendingPayments: pending.amount,
    pendingPaymentCount: pending.count,
    refundedPayments: refunded.amount,
    refundedPaymentCount: refunded.count,
    monthly: months,
    expenseCategories: categoryTotals.filter((item) => item.amount > 0)
  };
});

exports.getFinancialReportPage = onCall(async (request) => {
  const data = request.data || {};
  const report = requiredText(data.report, "Report type", 32);
  const roles = report === "revenue" ? paymentStaff
    : report === "expenses" ? financialStaff
    : report === "attendance" ? ["SUPER_ADMIN", "MANAGER", "TRAINER"]
      : report === "trainers" ? financialStaff : memberStaff;
  const actor = await requireRole(request, roles);
  const pageSize = Math.min(Math.max(Number(data.pageSize) || 50, 1), 100);
  const filters = data.filters || {};
  let source;
  let timestampField;
  let range;

  if (report === "expenses" || report === "revenue" || report === "attendance") {
    range = dateWindow(filters, 30);
    if (report === "attendance" && range.endDate.getTime() - range.startDate.getTime() > 366 * 86400000) fail("invalid-argument", "Attendance report ranges are limited to one year.");
    timestampField = report === "expenses" ? "expenseDate" : report === "revenue" ? "paymentDate" : "date";
    source = db.collection(report === "expenses" ? "expenses" : report === "revenue" ? "payments" : "attendance")
      .where(timestampField, ">=", range.start)
      .where(timestampField, "<", range.end);
  } else if (report === "expiring") {
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const from = Timestamp.fromDate(parseDate(todayKey, "Today"));
    if (filters.status === "EXPIRED") {
      source = db.collection("members").where("status", "==", "EXPIRED").where("membershipExpiryDate", "<", from);
    } else {
      const until = Timestamp.fromDate(new Date(from.toDate().getTime() + 31 * 86400000));
      source = db.collection("members").where("status", "==", "ACTIVE").where("membershipExpiryDate", ">=", from).where("membershipExpiryDate", "<", until);
    }
    timestampField = "membershipExpiryDate";
  } else if (report === "membership-fees") {
    source = db.collection("members");
    timestampField = "createdAt";
  } else if (report === "trainers") {
    source = db.collection("trainers");
    timestampField = "name";
  } else {
    fail("invalid-argument", "Unsupported report type.");
  }

  if (report === "expenses") {
    if (filters.category) source = source.where("category", "==", filters.category);
    if (filters.paymentMethod) source = source.where("paymentMethod", "==", filters.paymentMethod);
    if (filters.addedBy) source = source.where("addedBy", "==", filters.addedBy);
  }
  if (report === "revenue") {
    if (filters.status) source = source.where("status", "==", filters.status);
    if (filters.planId) source = source.where("planId", "==", filters.planId);
    if (filters.paymentMethod) source = source.where("paymentMethod", "==", filters.paymentMethod);
    if (filters.memberId) source = source.where("memberId", "==", filters.memberId);
    if (filters.trainerId) source = source.where("trainerId", "==", filters.trainerId);
    if (actor.role === "TRAINER") source = source.where("trainerId", "==", actor.uid);
  }
  if (report === "attendance") {
    if (filters.gender) source = source.where("gender", "==", filters.gender);
    if (filters.timeSlotId) source = source.where("timeSlotId", "==", filters.timeSlotId);
    if (filters.memberId) source = source.where("memberId", "==", filters.memberId);
    if (filters.trainerId) source = source.where("trainerId", "==", filters.trainerId);
    if (actor.role === "TRAINER") source = source.where("trainerUid", "==", actor.uid);
    if (actor.role === "MEMBER") source = source.where("memberId", "==", (await db.collection("users").doc(actor.uid).get()).get("memberId"));
  }
  if (report === "membership-fees" && actor.role === "TRAINER") source = source.where("trainerUid", "==", actor.uid);
  if (report === "membership-fees" && ["ACTIVE", "EXPIRED"].includes(filters.status)) source = source.where("status", "==", filters.status);
  if (report === "membership-fees" && filters.status === "PAID") source = source.where("feeStatus", "==", "PAID").where("status", "==", "ACTIVE");
  if (report === "membership-fees" && filters.status === "PENDING") source = source.where("feeStatus", "==", "DUE");
  if (report === "membership-fees" && filters.status === "EXPIRING SOON") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const start = Timestamp.fromDate(parseDate(today, "Today"));
    const end = Timestamp.fromDate(new Date(start.toDate().getTime() + 8 * 86400000));
    source = source.where("status", "==", "ACTIVE").where("membershipExpiryDate", ">=", start).where("membershipExpiryDate", "<", end);
  }

  const isSearch = typeof filters.search === "string" && filters.search.trim();
  const baseQuery = source;
  source = source.orderBy(timestampField, report === "trainers" ? "asc" : "desc");
  if (data.cursor && report !== "attendance") {
    const cursor = await db.collection(report === "expenses" ? "expenses" : report === "revenue" ? "payments" : report === "attendance" ? "attendance" : report === "trainers" ? "trainers" : "members").doc(String(data.cursor)).get();
    if (cursor.exists) source = source.startAfter(cursor);
  }

  let docs = [];
  let rows = [];
  let hasMore = false;
  let nextCursor = null;
  if (report === "attendance") {
    const attendanceSnapshot = await baseQuery.select("memberId", "memberName", "fullName", "gender", "status").limit(10001).get();
    if (attendanceSnapshot.size > 10000) fail("resource-exhausted", "Attendance summary exceeds 10,000 records. Narrow the date range.");
    const grouped = new Map();
    attendanceSnapshot.docs.forEach((snapshot) => {
      const attendance = snapshot.data();
      if (!attendance.memberId) return;
      const item = grouped.get(attendance.memberId) || { id: attendance.memberId, memberId: attendance.memberId, memberName: attendance.memberName || attendance.fullName || attendance.memberId, gender: attendance.gender || "", totalDays: 0, present: 0, absent: 0 };
      item.totalDays += 1;
      if (attendance.status === "PRESENT") item.present += 1;
      if (attendance.status === "ABSENT") item.absent += 1;
      grouped.set(attendance.memberId, item);
    });
    let groupedRows = Array.from(grouped.values()).map((item) => ({ ...item, attendancePercentage: item.totalDays ? (item.present / item.totalDays) * 100 : 0 }));
    groupedRows.sort((a, b) => a.memberName.localeCompare(b.memberName));
    if (isSearch) {
      const search = filters.search.trim().toLocaleLowerCase();
      groupedRows = groupedRows.filter((item) => `${item.memberId} ${item.memberName}`.toLocaleLowerCase().includes(search));
    }
    let startIndex = 0;
    if (data.cursor) {
      const cursorIndex = groupedRows.findIndex((item) => item.id === data.cursor);
      if (cursorIndex >= 0) startIndex = cursorIndex + 1;
    }
    rows = groupedRows.slice(startIndex, startIndex + pageSize);
    hasMore = startIndex + rows.length < groupedRows.length;
    nextCursor = hasMore ? rows[rows.length - 1]?.id || null : null;
  } else {
    const querySnapshot = await source.limit(pageSize + 1).get();
    docs = querySnapshot.docs;
    hasMore = docs.length > pageSize;
    if (hasMore) docs = docs.slice(0, pageSize);
    rows = docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
    nextCursor = hasMore ? docs[docs.length - 1].id : null;
  }
  if (isSearch) {
    const search = filters.search.trim().toLocaleLowerCase();
    rows = rows.filter((item) => [item.id, item.title, item.memberId, item.memberName, item.fullName, item.name, item.cnic, item.phone]
      .some((value) => String(value || "").toLocaleLowerCase().includes(search)));
  }

  let totals = {};
  if (report === "expenses") {
    if (isSearch) {
      const matching = await baseQuery.select("amount", "titleSearch", "title").limit(10001).get();
      if (matching.size > 10000) fail("resource-exhausted", "Search range contains more than 10,000 expense records. Narrow the date range.");
      const needle = filters.search.trim().toLocaleLowerCase();
      const matched = matching.docs.filter((item) => String(item.get("titleSearch") || item.get("title") || "").toLocaleLowerCase().includes(needle));
      totals = { totalAmount: matched.reduce((sum, item) => sum + Number(item.get("amount") || 0), 0), totalRecords: matched.length };
    } else {
      const aggregate = await baseQuery.aggregate({ amount: AggregateField.sum("amount"), count: AggregateField.count() }).get();
      totals = { totalAmount: Number(aggregate.data().amount || 0), totalRecords: Number(aggregate.data().count || 0) };
    }
  } else if (report === "revenue") {
    const successQuery = filters.status && filters.status !== "SUCCESS" ? null : filters.status === "SUCCESS" ? baseQuery : baseQuery.where("status", "==", "SUCCESS");
    if (successQuery && isSearch) {
      const matching = await baseQuery.select("amount", "status", "receiptId", "memberId", "memberName").limit(10001).get();
      if (matching.size > 10000) fail("resource-exhausted", "Search range contains more than 10,000 payments. Narrow the date range.");
      const needle = filters.search.trim().toLocaleLowerCase();
      const matched = matching.docs.filter((item) => [item.id, item.get("receiptId"), item.get("memberId"), item.get("memberName")].some((value) => String(value || "").toLocaleLowerCase().includes(needle)) && item.get("status") === "SUCCESS");
      totals = { totalRevenue: matched.reduce((sum, item) => sum + Number(item.get("amount") || 0), 0), successfulPayments: matched.length };
    } else if (successQuery) {
      const aggregate = await successQuery.aggregate({ amount: AggregateField.sum("amount"), count: AggregateField.count() }).get();
      totals = { totalRevenue: Number(aggregate.data().amount || 0), successfulPayments: Number(aggregate.data().count || 0) };
    } else totals = { totalRevenue: 0, successfulPayments: 0 };
  } else if (report === "membership-fees") {
    const todayStart = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00:00.000Z`);
    const todayTs = Timestamp.fromDate(todayStart);
    const soonTs = Timestamp.fromDate(new Date(todayStart.getTime() + 8 * 86400000));
    let memberBase = db.collection("members");
    if (actor.role === "TRAINER") memberBase = memberBase.where("trainerUid", "==", actor.uid);
    const [totalResult, activeResult, expiredResult, expiringResult, paidResult] = await Promise.all([
      memberBase.count().get(),
      memberBase.where("status", "==", "ACTIVE").count().get(),
      memberBase.where("status", "==", "EXPIRED").count().get(),
      memberBase.where("status", "==", "ACTIVE").where("membershipExpiryDate", ">=", todayTs).where("membershipExpiryDate", "<", soonTs).count().get(),
      memberBase.where("feeStatus", "==", "PAID").where("status", "==", "ACTIVE").count().get()
    ]);
    const active = activeResult.data().count;
    const expired = expiredResult.data().count;
    const paid = paidResult.data().count;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    void todayDate;
    const expiringSoon = expiringResult.data().count;
    totals = { totalMembers: totalResult.data().count, activeMembers: active, expiredMembers: expired, expiringSoon, paidMembers: paid, pendingMembers: Math.max(0, active + expired - paid) };
  } else if (report === "attendance") {
    const [totalResult, presentResult, absentResult] = await Promise.all([
      baseQuery.count().get(),
      baseQuery.where("status", "==", "PRESENT").count().get(),
      baseQuery.where("status", "==", "ABSENT").count().get()
    ]);
    const totalAttendance = totalResult.data().count;
    const present = presentResult.data().count;
    const absent = absentResult.data().count;
    totals = { totalAttendance, present, absent, attendancePercentage: totalAttendance ? (present / totalAttendance) * 100 : 0 };
  } else if (report === "trainers") {
    const trainerRows = docs;
    const trainerCount = await db.collection("trainers").count().get();
    rows = await Promise.all(trainerRows.map(async (trainerSnapshot) => {
      const trainer = { id: trainerSnapshot.id, ...trainerSnapshot.data() };
      const [assigned, active, workouts, diets, attendance] = await Promise.all([
        db.collection("members").where("trainerId", "==", trainer.id).count().get(),
        db.collection("members").where("trainerId", "==", trainer.id).where("status", "==", "ACTIVE").count().get(),
        db.collection("workout_plans").where("trainerId", "==", trainer.id).count().get(),
        db.collection("diet_plans").where("trainerId", "==", trainer.id).count().get(),
        db.collection("attendance").where("trainerId", "==", trainer.id).count().get()
      ]);
      return {
        ...trainer,
        assignedMembers: assigned.data().count,
        activeMembers: active.data().count,
        workoutPlans: workouts.data().count,
        dietPlans: diets.data().count,
        attendanceActivity: attendance.data().count
      };
    }));
    totals = { totalTrainers: trainerCount.data().count };
  }

  const moduleName = report === "revenue" ? "payments" : report;
  await eventLog(actor, report === "revenue" ? "PAYMENT_REPORT_GENERATED" : "FINANCIAL_REPORT_VIEWED", moduleName, "", { from: range?.startKey || "", to: range?.endKey || "", report });
  return { rows, totals, hasMore, nextCursor };
});

exports.recordReportExport = onCall(async (request) => {
  const actor = await requireRole(request, ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST", "TRAINER"]);
  const report = requiredText(request.data?.report, "Report type", 32);
  const allowed = actor.role === "TRAINER"
    ? ["attendance"]
    : actor.role === "RECEPTIONIST"
      ? ["revenue", "membership-fees", "expiring"]
      : ["revenue", "expenses", "profit-loss", "membership-fees", "expiring", "attendance", "trainers"];
  if (!allowed.includes(report)) fail("permission-denied", "You cannot export this report.");
  await eventLog(actor, "REPORT_EXPORTED", report === "revenue" ? "payments" : report, "", { report });
  return { recorded: true };
});