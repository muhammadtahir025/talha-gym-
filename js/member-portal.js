import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, firebaseReady, getUserAccess } from "./auth-service.js";
import {
  getMemberPhotoObjectUrl,
  getReceipt,
  loadMemberPortal,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeMemberNotifications
} from "./gym-data.js";
import { downloadReceiptPdf, openReceiptPrint, receiptMarkup, shareReceiptOnWhatsApp } from "./receipt-tools.js";

const gate = document.querySelector("#member-gate");
const gateMessage = document.querySelector("#member-gate-message");
const app = document.querySelector("#member-app");
const dialog = document.querySelector("#member-dialog");
const dialogBody = document.querySelector("#member-dialog-body");
const unreadBadge = document.querySelector("#member-unread-badge");
const notifList = document.querySelector("#member-notifications-list");
let currentReceipt = null;
let currentMember = null;
let memberNotifications = [];
let notifFilter = "all";
let notifUnsubscribe = null;

const date = (value) => {
  const source = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return source && !Number.isNaN(source.getTime()) ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(source) : "—";
};
const dateTime = (value) => {
  const source = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return source && !Number.isNaN(source.getTime()) ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(source) : "—";
};
const text = (value) => String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const money = (value) => `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
const memberStatus = (member) => {
  if (member.status === "INACTIVE") return "INACTIVE";
  const expiry = member.membershipExpiryDate?.toDate ? member.membershipExpiryDate.toDate() : new Date(member.membershipExpiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isNaN(expiry.getTime()) || expiry < today ? "EXPIRED" : "ACTIVE";
};
const feeStatus = (member) => memberStatus(member) === "EXPIRED" ? "OVERDUE" : member.feeStatus === "PAID" ? "PAID" : "DUE";

function showReceipt(receipt) {
  currentReceipt = receipt;
  dialogBody.innerHTML = `${receiptMarkup(receipt)}<div class="member-receipt-actions"><button type="button" data-receipt="print">PRINT</button><button type="button" data-receipt="pdf">PDF</button><button type="button" data-receipt="whatsapp">WHATSAPP</button></div>`;
  dialog.showModal();
}

function renderNotifications() {
  if (!notifList) return;
  const unreadCount = memberNotifications.filter((n) => n.status !== "READ").length;
  if (unreadBadge) {
    unreadBadge.textContent = String(unreadCount);
    unreadBadge.hidden = unreadCount === 0;
  }

  const filtered = memberNotifications.filter((n) => {
    if (notifFilter === "unread") return n.status !== "READ";
    if (notifFilter === "read") return n.status === "READ";
    return true;
  });

  if (!filtered.length) {
    const emptyMsg = notifFilter === "unread" ? "No unread notifications." : "No notifications yet.";
    notifList.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }

  notifList.innerHTML = filtered.map((item) => {
    const isUnread = item.status !== "READ";
    const priority = item.priority || "NORMAL";
    const typeLabel = (item.type || "GENERAL").replace(/_/g, " ");
    return `
      <article class="member-notif-card ${isUnread ? "unread" : "read"}" data-notif-id="${text(item.id || item.notificationId)}">
        <div class="notif-card-header">
          <div class="notif-tags">
            <span class="notif-type-tag">${text(typeLabel)}</span>
            <span class="notif-priority-pill priority-${text(priority.toLowerCase())}">${text(priority)}</span>
          </div>
          <span class="notif-time">${dateTime(item.createdAt)}</span>
        </div>
        <h3 class="notif-card-title">${text(item.title)}</h3>
        <p class="notif-card-message">${text(item.message)}</p>
        <div class="notif-card-actions">
          ${isUnread ? `<button type="button" class="member-action-btn small" data-mark-read="${text(item.id || item.notificationId)}">MARK AS READ</button>` : `<span class="notif-read-check">✓ READ</span>`}
        </div>
      </article>
    `;
  }).join("");
}

function renderPortal({ member, payments, history, attendance }) {
  currentMember = member;
  document.querySelector("#member-name").textContent = member.fullName || "MEMBER PROFILE";
  document.querySelector("#member-id").textContent = member.id;
  document.querySelector("#member-status").textContent = memberStatus(member);
  const overview = document.querySelector("#member-overview");
  overview.innerHTML = `<div class="member-profile"><div class="member-photo" id="member-photo">${text((member.fullName || "M").slice(0, 1))}</div><div><h2>${text(member.fullName)}</h2><p>${text(member.membershipPlanName)} · ${text(member.id)}</p></div></div><div class="member-info-grid"><div><span>Phone</span><strong>${text(member.phone)}</strong></div><div><span>Gender</span><strong>${text(member.gender)}</strong></div><div><span>Trainer</span><strong>${text(member.trainerName || "—")}</strong></div><div><span>Time Slot</span><strong>${text(member.timeSlotName || "—")}</strong></div><div><span>Join Date</span><strong>${date(member.joinDate)}</strong></div><div><span>Fee Status</span><strong>${feeStatus(member)}</strong></div></div>`;
  if (member.profilePhotoPath) {
    getMemberPhotoObjectUrl(member.profilePhotoPath).then((url) => {
      const image = document.createElement("img"); image.src = url; image.alt = `${member.fullName} profile photo`; image.onload = () => URL.revokeObjectURL(url); image.onerror = () => URL.revokeObjectURL(url);
      document.querySelector("#member-photo")?.replaceChildren(image);
    }).catch(() => {});
  }
  document.querySelector("#member-membership").innerHTML = [
    ["Plan", member.membershipPlanName], ["Start Date", date(member.membershipStartDate)],
    ["Expiry Date", date(member.membershipExpiryDate)], ["Monthly Fee", money(member.monthlyFee)],
    ["Current Status", memberStatus(member)], ["Payment Status", feeStatus(member)]
  ].map(([label, value]) => `<div class="membership-cell"><span>${text(label)}</span><strong>${text(value)}</strong></div>`).join("");

  const paymentRows = payments.map((payment) => `<tr><td>${text(payment.receiptId)}</td><td>${date(payment.paymentDate)}</td><td>${text(payment.planName)}</td><td>${money(payment.amount)}</td><td>${text(payment.paymentMethod)}</td><td>${text(payment.transactionId || "—")}</td><td>${text(payment.status)}</td><td><button class="member-action" type="button" data-view-receipt="${text(payment.receiptId)}">VIEW RECEIPT</button></td></tr>`).join("");
  document.querySelector("#member-payments").innerHTML = paymentRows ? `<table class="member-table"><thead><tr><th>RECEIPT ID</th><th>DATE</th><th>PLAN</th><th>AMOUNT</th><th>METHOD</th><th>TRANSACTION ID</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${paymentRows}</tbody></table>` : `<div class="empty-state">No payments found.</div>`;

  const historyRows = history.map((item) => `<tr><td>${text(item.planName)}</td><td>${date(item.startDate)}</td><td>${date(item.expiryDate)}</td><td>${money(item.price)}</td><td>${text(item.feeStatus || "DUE")}</td></tr>`).join("");
  document.querySelector("#member-history").innerHTML = historyRows ? `<table class="member-table"><thead><tr><th>PLAN</th><th>START DATE</th><th>EXPIRY DATE</th><th>PRICE</th><th>PAYMENT</th></tr></thead><tbody>${historyRows}</tbody></table>` : `<div class="empty-state">No membership history available.</div>`;

  const attendanceRows = attendance.map((record) => `<tr><td>${date(record.date)}</td><td>${text(record.timeSlotName || record.timeSlotId || "—")}</td><td>${text(record.status)}</td></tr>`).join("");
  document.querySelector("#member-attendance").innerHTML = attendanceRows ? `<table class="member-table"><thead><tr><th>DATE</th><th>TIME SLOT</th><th>STATUS</th></tr></thead><tbody>${attendanceRows}</tbody></table>` : `<div class="empty-state">No attendance records found.</div>`;

  // Start live notifications listener for member
  if (notifUnsubscribe) notifUnsubscribe();
  notifUnsubscribe = subscribeMemberNotifications(member.id, (notifications) => {
    memberNotifications = notifications;
    renderNotifications();
  }, (err) => {
    console.warn("Notifications subscription warning:", err);
  });
}

if (!firebaseReady) {
  gateMessage.textContent = "Firebase is not configured. Complete js/firebase-config.js first.";
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.replace("login.html?next=member"); return; }
    try {
      const access = await getUserAccess(user, true);
      if (access.role !== "MEMBER") { window.location.replace("admin.html"); return; }
      const data = await loadMemberPortal();
      renderPortal(data);
      gate.hidden = true;
      app.hidden = false;
    } catch (error) {
      gateMessage.textContent = error.message || "Unable to load your member account.";
    }
  });
}

document.querySelector("#member-signout").addEventListener("click", async () => {
  if (notifUnsubscribe) notifUnsubscribe();
  await signOut(auth);
  window.location.replace("login.html");
});

document.querySelector("#member-notification-toggle")?.addEventListener("click", () => {
  const section = document.querySelector("#member-notifications-section");
  if (section) {
    section.scrollIntoView({ behavior: "smooth" });
  }
});

document.querySelector("#member-notifications-section")?.addEventListener("click", async (event) => {
  const filterBtn = event.target.closest("[data-notif-filter]");
  if (filterBtn) {
    document.querySelectorAll("[data-notif-filter]").forEach((b) => b.classList.remove("active"));
    filterBtn.classList.add("active");
    notifFilter = filterBtn.dataset.notifFilter;
    renderNotifications();
    return;
  }

  const markBtn = event.target.closest("[data-mark-read]");
  if (markBtn) {
    const id = markBtn.dataset.markRead;
    try {
      markBtn.disabled = true;
      await markNotificationRead(id);
      const target = memberNotifications.find((n) => (n.id || n.notificationId) === id);
      if (target) target.status = "READ";
      renderNotifications();
    } catch (err) {
      alert("Could not mark as read: " + err.message);
    } finally {
      markBtn.disabled = false;
    }
    return;
  }

  const markAllBtn = event.target.closest("#member-mark-all-read");
  if (markAllBtn) {
    try {
      markAllBtn.disabled = true;
      await markAllNotificationsRead();
      memberNotifications.forEach((n) => { n.status = "READ"; });
      renderNotifications();
    } catch (err) {
      alert("Could not mark all as read: " + err.message);
    } finally {
      markAllBtn.disabled = false;
    }
  }
});

document.querySelector("#member-payments").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-view-receipt]");
  if (!button || !currentMember) return;
  try {
    const receipt = await getReceipt(button.dataset.viewReceipt);
    if (receipt.memberId !== currentMember.id) throw new Error("Receipt access denied.");
    showReceipt(receipt);
  } catch (error) { gateMessage.textContent = error.message; }
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog || event.target.closest("#member-dialog-close")) dialog.close();
  const action = event.target.closest("[data-receipt]")?.dataset.receipt;
  if (!action || !currentReceipt) return;
  if (action === "print") openReceiptPrint(currentReceipt);
  if (action === "pdf") {
    try { downloadReceiptPdf(currentReceipt); }
    catch (error) { gateMessage.textContent = error.message; }
  }
  if (action === "whatsapp") shareReceiptOnWhatsApp(currentReceipt);
});

