import {
  checkMembershipExpiryNotifications,
  createExpense,
  createMember,
  createMembershipPlan,
  createNotification,
  createPayment,
  createTrainer,
  deactivateMember,
  deactivateTrainer,
  deleteExpense,
  deleteMembershipPlan,
  deleteNotification,
  getAdminDashboardSummary,
  getExpenseReceiptObjectUrl,
  getFinancialDashboard,
  getFinancialReportPage,
  getMemberDetails,
  getMemberPhotoObjectUrl,
  getNotificationSettings,
  getReceipt,
  logWhatsAppActivity,
  markAllNotificationsRead,
  markAttendance,
  markNotificationRead,
  markNotificationUnread,
  recordReportExport,
  refundPayment,
  removeExpenseReceipt,
  removeMemberPhoto,
  renewMembership,
  saveDietPlan,
  saveMemberPhoto,
  saveProgressRecord,
  saveWorkoutPlan,
  searchMembers,
  subscribeAdminCollections,
  updateExpense,
  updateMember,
  updateMembershipPlan,
  updateNotificationSettings,
  updatePayment,
  updateTrainer,
  uploadExpenseReceipt
} from "./gym-data.js";
import { downloadReceiptPdf, openReceiptPrint, receiptMarkup, shareReceiptOnWhatsApp } from "./receipt-tools.js";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  getWhatsAppUrl,
  normalizePhoneNumber,
  openWhatsAppMessage,
  renderWhatsAppMessage
} from "./whatsapp-tools.js";

const nav = document.querySelector("#sidebar-nav");
const content = document.querySelector("#admin-content");
const sidebar = document.querySelector("#admin-sidebar");
const scrim = document.querySelector("#sidebar-scrim");
const dialog = document.querySelector("#admin-dialog");
const dialogBody = document.querySelector("#dialog-body");
const toastRegion = document.querySelector("#toast-region");
const pageTitle = document.querySelector("#topbar-title");
const groups = [
  { label: "OVERVIEW", items: [["dashboard", "DASHBOARD", "▦"]] },
  { label: "MEMBERSHIP", items: [["members", "MEMBERS", "M"], ["membership-plans", "MEMBERSHIP PLANS", "P"], ["payments", "PAYMENTS", "$"], ["attendance", "ATTENDANCE", "A"], ["time-slots", "TIME SLOTS", "T"]] },
  { label: "TRAINING", items: [["workout-plans", "WORKOUT PLANS", "W"], ["diet-plans", "DIET PLANS", "D"], ["progress", "PROGRESS", "↗"], ["trainers", "TRAINERS", "TR"]] },
  { label: "FINANCE", items: [["expenses", "EXPENSES", "−"], ["financials", "FINANCIALS", "F"], ["reports", "REPORTS", "R"]] },
  { label: "COMMUNICATION", items: [["notifications", "NOTIFICATIONS", "N"], ["whatsapp", "WHATSAPP", "💬"], ["gallery", "GALLERY", "G"], ["hero-media", "HERO MEDIA", "HM"], ["contact-inquiries", "CONTACT INQUIRIES", "CI"]] },
  { label: "SYSTEM", items: [["website-settings", "WEBSITE SETTINGS", "S"], ["activity-logs", "ACTIVITY LOGS", "L"], ["backups", "BACKUPS", "B"]] }
];
const viewNames = Object.fromEntries(groups.flatMap((group) => group.items.map(([id, label]) => [id, label])));
const genericViews = {
  "time-slots": ["Manage scheduled training and member access windows.", "No time slots configured."],
  "workout-plans": ["Create and manage member workout programs.", "No workout plans available."],
  "diet-plans": ["Manage nutrition guidance and meal plan templates.", "No diet plans available."],
  progress: ["Review member progress records and fitness measurements.", "No progress records available."],
  trainers: ["Manage coaching profiles and trainer assignments.", "No trainers registered."],
  expenses: ["Record and review gym operating expenses.", "No expenses recorded."],
  financials: ["Review revenue, expenses, outstanding fees, and net profit.", "No financial data available."],
  reports: ["Prepare operational and financial reporting views.", "No reports available."],
  gallery: ["Manage public website gallery media. Existing gym media remains untouched.", "No gallery changes available."],
  "hero-media": ["Manage the public homepage hero video and fallback media references.", "No hero media changes configured."],
  "contact-inquiries": ["Review public contact messages.", "No contact inquiries found."],
  "website-settings": ["Manage public website contact details and presentation settings.", "No settings configured."],
  "activity-logs": ["Review administrative actions and system activity.", "No activity logs available."],
  backups: ["Prepare backup management for a future connected data store.", "No backups available."]
};
const state = { members: [], plans: [], payments: [], trainers: [], timeSlots: [], activityLogs: [], notifications: [], notificationSettings: null, dashboardSummary: null, loaded: new Set(), errors: [] };
let actor = null;
let currentView = "dashboard";
let memberSearch = "";
let memberFilters = { gender: "", status: "", plan: "", trainer: "", timeSlot: "" };
let paymentFilters = { date: "", status: "", method: "" };
let notificationFilter = "all";
let whatsappFilter = "expiring";
let whatsappSearch = "";
let memberSearchResults = null;
let searchTimer;
let activeObjectUrl = "";
let stopCollections = null;
let activeReceipt = null;
let financialSummary = null;
let financialSummaryKey = "";
let financialSummaryLoading = false;
let financialSummaryPromise = null;
let financeRange = { preset: "month", from: "", to: "" };
let currentReport = "revenue";
let reportFilters = {};
let reportRows = [];
let reportTotals = {};
let reportCursor = null;
let reportHasMore = false;
let reportLoading = false;
let reportError = "";
let expenseRows = [];
let expenseTotals = { totalAmount: 0, totalRecords: 0 };
let expenseCursor = null;
let expenseHasMore = false;
let expenseLoading = false;
let expenseError = "";
let financeRequestId = 0;
let reportRequestId = 0;
let expenseRequestId = 0;

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const toDate = (value) => value?.toDate ? value.toDate() : value instanceof Date ? value : value ? new Date(value) : null;
const dateKey = (value) => {
  const date = toDate(value);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "";
};
const dateText = (value) => {
  const key = dateKey(value);
  if (!key) return "—";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
};
const dateTimeText = (value) => {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
};
const inputDate = (value) => dateKey(value);
const money = (value) => `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
const dayStartKey = () => dateKey(new Date());
const statusForMember = (member) => {
  if (member.status === "INACTIVE") return "INACTIVE";
  const expiry = dateKey(member.membershipExpiryDate);
  return expiry && expiry < dayStartKey() ? "EXPIRED" : "ACTIVE";
};
const expiryLabel = (member) => {
  const status = statusForMember(member);
  if (status !== "ACTIVE") return status;
  const expiry = dateKey(member.membershipExpiryDate);
  const today = dayStartKey();
  const days = Math.floor((new Date(`${expiry}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
  return days >= 0 && days <= 7 ? "EXPIRING SOON" : "ACTIVE";
};
const feeStatusForMember = (member) => statusForMember(member) === "EXPIRED" ? "OVERDUE" : member.feeStatus === "PAID" ? "PAID" : "DUE";
const toast = (message, error = false) => {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  if (error) item.style.borderColor = "rgba(199,108,100,.7)";
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 4200);
};
const callButton = (label, action, primary = false, value = "") => `<button class="admin-button${primary ? " primary" : ""}" type="button" data-action="${action}"${value ? ` data-id="${escapeHTML(value)}"` : ""}>${label}</button>`;
const pageHeader = (title, description = "", actions = "") => `<div class="page-heading-row"><div><span class="page-kicker">TALHA GOLD GYM / MANAGEMENT</span><h1 class="page-heading">${title}</h1><p class="page-description">${description}</p></div><div class="heading-actions">${actions}</div></div>`;
const tableEmpty = (headers, message) => `<div class="table-wrap"><table class="admin-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${headers.length}" class="table-empty">${message}</td></tr></tbody></table></div>`;
const statusMarkup = (status) => `<span class="status-label ${status === "SUCCESS" || status === "ACTIVE" || status === "PAID" || status === "8-30 DAYS" ? "success" : status === "PENDING" || status === "EXPIRING SOON" || status === "1-7 DAYS" || status === "DUE" ? "pending" : "failed"}">${escapeHTML(status)}</span>`;
const isManager = () => ["SUPER_ADMIN", "MANAGER"].includes(actor?.role);
const canManage = () => ["SUPER_ADMIN", "MANAGER", "RECEPTIONIST"].includes(actor?.role);

function renderNavigation() {
  const blocked = actor.role === "TRAINER"
    ? new Set(["dashboard", "membership-plans", "payments", "time-slots", "expenses", "financials", "whatsapp", "gallery", "hero-media", "contact-inquiries", "website-settings", "activity-logs", "backups"])
    : actor.role === "RECEPTIONIST"
      ? new Set(["expenses", "financials", "gallery", "hero-media", "contact-inquiries", "website-settings", "activity-logs", "backups"])
      : actor.role === "MANAGER"
        ? new Set(["website-settings", "backups"])
        : new Set();
  nav.innerHTML = groups.map((group) => {
    const items = group.items.filter(([id]) => !blocked.has(id));
    return items.length ? `<div class="nav-group"><span class="nav-group-label">${group.label}</span>${items.map(([id, label, glyph]) => `<button type="button" class="nav-item" data-view="${id}" aria-current="false"><span class="nav-symbol" aria-hidden="true">${glyph}</span><span>${label}</span></button>`).join("")}</div>` : "";
  }).join("") + `<a class="nav-logout" href="login.html" data-admin-logout><span class="nav-symbol" aria-hidden="true">↗</span><span>LOGOUT</span></a>`;
}

function renderDashboard() {
  const summary = state.dashboardSummary;
  const members = state.members;
  const paymentRecords = state.payments;
  const successfulPayments = paymentRecords.filter((payment) => payment.status === "SUCCESS");
  const metrics = [
    ["TOTAL MEMBERS", summary ? String(summary.totalMembers) : "LOADING"],
    ["ACTIVE MEMBERS", summary ? String(summary.activeMembers) : "LOADING"],
    ["EXPIRED MEMBERS", summary ? String(summary.expiredMembers) : "LOADING"],
    ["TODAY'S REVENUE", summary ? money(summary.todayRevenue) : "LOADING"],
    ["MONTHLY REVENUE", summary ? money(summary.monthlyRevenue) : "LOADING"],
    ["PENDING FEES", summary ? money(summary.pendingFees) : "LOADING"],
    ["PENDING PAYMENTS", summary ? money(summary.pendingPayments) : "LOADING"],
    ["EXPIRING MEMBERSHIPS", summary ? String(summary.expiringMemberships) : "LOADING"],
    ["TODAY'S ATTENDANCE", summary ? String(summary.todayAttendance) : "LOADING"]
  ];
  if (isManager()) {
    metrics.push(["THIS MONTH EXPENSES", summary ? money(summary.monthlyExpenses) : "LOADING"]);
    metrics.push(["THIS MONTH NET PROFIT", summary ? money(summary.monthlyNetProfit) : "LOADING"]);
  }
  const recentPaymentRows = successfulPayments.slice(0, 5).map((payment) => `<tr><td>${escapeHTML(payment.receiptId)}</td><td>${escapeHTML(payment.memberName)}</td><td>${money(payment.amount)}</td><td>${dateText(payment.paymentDate)}</td><td>${escapeHTML(payment.paymentMethod)}</td><td>${statusMarkup(payment.status)}</td></tr>`).join("");
  const recentMemberRows = members.slice(0, 5).map((member) => `<tr><td>${escapeHTML(member.id)}</td><td>${escapeHTML(member.fullName)}</td><td>${escapeHTML(member.gender)}</td><td>${escapeHTML(member.membershipPlanName)}</td><td>${dateText(member.joinDate)}</td><td>${statusMarkup(statusForMember(member))}</td></tr>`).join("");
  const paymentTable = recentPaymentRows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>RECEIPT ID</th><th>MEMBER</th><th>AMOUNT</th><th>DATE</th><th>METHOD</th><th>STATUS</th></tr></thead><tbody>${recentPaymentRows}</tbody></table></div>` : tableEmpty(["RECEIPT ID", "MEMBER", "AMOUNT", "DATE", "METHOD", "STATUS"], "No payments found.");
  const memberTable = recentMemberRows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>MEMBER ID</th><th>NAME</th><th>GENDER</th><th>PLAN</th><th>JOIN DATE</th><th>STATUS</th></tr></thead><tbody>${recentMemberRows}</tbody></table></div>` : tableEmpty(["MEMBER ID", "NAME", "GENDER", "PLAN", "JOIN DATE", "STATUS"], "No members registered yet.");
  return `${pageHeader("DASHBOARD", "Live totals from Firestore. Revenue includes SUCCESS payments only.")}
    <section class="metric-grid" aria-label="Live dashboard metrics">${metrics.map(([label, value]) => `<div class="metric"><span class="metric-label">${label}</span><strong class="metric-value${summary ? "" : " no-data"}">${escapeHTML(value)}</strong></div>`).join("")}</section>
    <section class="section-block dashboard-grid"><article class="panel"><div class="panel-head"><h2>REVENUE OVERVIEW</h2><span class="section-caption">SUCCESS payments only</span></div><div class="chart-empty">${summary ? `Today ${money(summary.todayRevenue)} &nbsp; | &nbsp; This month ${money(summary.monthlyRevenue)}` : "Loading financial data..."}</div><div class="chart-legend"><span class="legend-key" style="--key-color:#d4af37">Revenue</span><span class="section-caption">Refunded, pending, and failed payments excluded</span></div></article><article class="panel"><div class="panel-head"><h2>MEMBERSHIP STATUS</h2><button type="button" class="admin-button small" data-view="members">VIEW MEMBERS</button></div><div class="panel-body"><div class="attendance-counts"><div class="attendance-count"><span>ACTIVE</span><strong>${summary ? summary.activeMembers : "—"}</strong></div><div class="attendance-count"><span>EXPIRED</span><strong>${summary ? summary.expiredMembers : "—"}</strong></div></div><div class="empty-note">Status is derived from membership expiry dates.</div></div></article></section>
    <section class="quick-panel"><div class="section-title-row"><h2 class="section-title">QUICK ACTIONS</h2><span class="section-caption">Writes are verified by Firebase callable functions</span></div><div class="quick-actions">${callButton("ADD MEMBER", "add-member", true)}${callButton("RECORD PAYMENT", "add-payment")}${callButton("RENEW MEMBERSHIP", "renew-membership")}</div></section>
    <section class="section-block dashboard-grid"><article class="panel"><div class="panel-head"><h2>RECENT PAYMENTS</h2><button type="button" class="admin-button small" data-view="payments">VIEW ALL</button></div>${paymentTable}</article><article class="panel"><div class="panel-head"><h2>RECENT MEMBERS</h2><button type="button" class="admin-button small" data-view="members">VIEW ALL</button></div>${memberTable}</article></section>`;
}

function filteredMembers() {
  let rows = memberSearchResults ?? state.members;
  const needle = memberSearch.trim().toLocaleLowerCase();
  if (needle && memberSearchResults === null) rows = rows.filter((member) => [member.id, member.fullName, member.phone, member.cnic].some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
  if (memberFilters.gender) rows = rows.filter((member) => member.gender === memberFilters.gender);
  if (memberFilters.status) rows = rows.filter((member) => statusForMember(member) === memberFilters.status);
  if (memberFilters.plan) rows = rows.filter((member) => member.membershipPlanId === memberFilters.plan);
  if (memberFilters.trainer) rows = rows.filter((member) => member.trainerId === memberFilters.trainer);
  if (memberFilters.timeSlot) rows = rows.filter((member) => member.timeSlotId === memberFilters.timeSlot);
  return rows;
}

function renderMembers() {
  const rows = filteredMembers();
  const rowMarkup = rows.map((member) => `<tr>
    <td>${escapeHTML(member.id)}</td><td><span class="member-avatar" data-photo-path="${escapeHTML(member.profilePhotoPath || "")}">${escapeHTML((member.fullName || "?").slice(0, 1).toUpperCase())}</span></td>
    <td>${escapeHTML(member.fullName)}</td><td>${escapeHTML(member.gender)}</td><td>${escapeHTML(member.phone)}</td><td>${escapeHTML(member.membershipPlanName)}</td>
    <td>${dateText(member.joinDate)}</td><td>${dateText(member.membershipExpiryDate)}</td><td>${statusMarkup(expiryLabel(member))}</td>
    <td><div class="table-actions"><button class="admin-button small" data-action="view-member" data-id="${escapeHTML(member.id)}">VIEW</button>${canManage() ? `<button class="admin-button small" data-action="edit-member" data-id="${escapeHTML(member.id)}">EDIT</button>` : ""}${isManager() && statusForMember(member) !== "INACTIVE" ? `<button class="admin-button small danger" data-action="deactivate-member" data-id="${escapeHTML(member.id)}">DEACTIVATE</button>` : ""}${actor.role !== "TRAINER" ? `<button class="admin-button small" data-action="renew-member" data-id="${escapeHTML(member.id)}">RENEW</button>` : ""}</div></td>
  </tr>`).join("");
  const body = rowMarkup ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>MEMBER ID</th><th>PHOTO</th><th>FULL NAME</th><th>GENDER</th><th>PHONE</th><th>MEMBERSHIP</th><th>JOIN DATE</th><th>EXPIRY</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${rowMarkup}</tbody></table></div>` : tableEmpty(["MEMBER ID", "PHOTO", "FULL NAME", "GENDER", "PHONE", "MEMBERSHIP", "JOIN DATE", "EXPIRY", "STATUS", "ACTIONS"], state.loaded.has("members") ? (memberSearch ? "No members match this search." : "No members registered yet.") : "Loading members...");
  const options = (list, valueKey, nameKey, selected = "") => `<option value="">All</option>${list.map((item) => `<option value="${escapeHTML(item[valueKey] || item.id)}"${selected === (item[valueKey] || item.id) ? " selected" : ""}>${escapeHTML(item[nameKey] || item[valueKey] || item.id)}</option>`).join("")}`;
  return `${pageHeader("MEMBERS", "Manage member profiles, membership terms, and payment history.", `${callButton("EXPORT", "export-members")}${callButton("FILTER", "toggle-filters")}${canManage() ? callButton("ADD MEMBER", "add-member", true) : ""}`)}
    <div class="table-toolbar"><label class="search-field"><span class="search-mark" aria-hidden="true">⌕</span><input id="member-search" type="search" placeholder="Search members..." value="${escapeHTML(memberSearch)}" aria-label="Search by member ID, name, phone, or CNIC" /></label><span class="section-caption">${rows.length} shown</span></div>
    <div class="filter-row" id="member-filters"${memberFilters.open ? "" : " hidden"}><select data-member-filter="gender" aria-label="Gender"><option value="">All genders</option><option${memberFilters.gender === "Male" ? " selected" : ""}>Male</option><option${memberFilters.gender === "Female" ? " selected" : ""}>Female</option></select><select data-member-filter="status" aria-label="Status"><option value="">All statuses</option>${["ACTIVE", "EXPIRED", "INACTIVE"].map((value) => `<option${memberFilters.status === value ? " selected" : ""}>${value}</option>`).join("")}</select><select data-member-filter="plan" aria-label="Membership plan">${options(state.plans, "planId", "planName", memberFilters.plan)}</select><select data-member-filter="trainer" aria-label="Trainer">${options(state.trainers, "id", "name", memberFilters.trainer)}</select><select data-member-filter="timeSlot" aria-label="Time slot">${options(state.timeSlots, "id", "name", memberFilters.timeSlot)}</select></div>${body}`;
}

function renderPlans() {
  const rows = state.plans.map((plan) => `<tr><td>${escapeHTML(plan.planName)}</td><td>${plan.durationMonths} months</td><td>${money(plan.price)}</td><td>${statusMarkup(plan.status)}</td><td><div class="table-actions">${isManager() ? `<button class="admin-button small" data-action="edit-plan" data-id="${escapeHTML(plan.id)}">EDIT</button><button class="admin-button small" data-action="toggle-plan" data-id="${escapeHTML(plan.id)}" data-status="${plan.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}">${plan.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE"}</button><button class="admin-button small danger" data-action="delete-plan" data-id="${escapeHTML(plan.id)}">DELETE</button>` : "VIEW"}</div></td></tr>`).join("");
  const table = rows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>PLAN</th><th>DURATION</th><th>PRICE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${rows}</tbody></table></div>` : tableEmpty(["PLAN", "DURATION", "PRICE", "STATUS", "ACTIONS"], state.loaded.has("plans") ? "No membership plans configured." : "Loading membership plans...");
  return `${pageHeader("MEMBERSHIP PLANS", "Prices and durations are loaded from Firestore.", isManager() ? callButton("ADD PLAN", "add-plan", true) : "")}${table}`;
}

function renderTrainers() {
  const rows = state.trainers.map((trainer) => `<tr><td>${escapeHTML(trainer.name)}</td><td>${escapeHTML(trainer.specialization || "—")}</td><td>${escapeHTML(trainer.experience || "—")}</td><td>${escapeHTML(trainer.phone || "—")}</td><td>${statusMarkup(trainer.status || "ACTIVE")}</td><td>${trainer.authUid ? "ACCOUNT LINKED" : "NO ACCOUNT"}</td><td><div class="table-actions"><button class="admin-button small" data-action="edit-trainer" data-id="${escapeHTML(trainer.id)}">EDIT</button>${trainer.status === "INACTIVE" ? "" : `<button class="admin-button small danger" data-action="deactivate-trainer" data-id="${escapeHTML(trainer.id)}">DEACTIVATE</button>`}</div></td></tr>`).join("");
  const table = rows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>NAME</th><th>SPECIALIZATION</th><th>EXPERIENCE</th><th>PHONE</th><th>STATUS</th><th>ACCOUNT</th><th>ACTIONS</th></tr></thead><tbody>${rows}</tbody></table></div>` : tableEmpty(["NAME", "SPECIALIZATION", "EXPERIENCE", "PHONE", "STATUS", "ACCOUNT", "ACTIONS"], state.loaded.has("trainers") ? "No trainers registered." : "Loading trainers...");
  return `${pageHeader("TRAINERS", "Manage trainer profiles. User accounts and role claims remain SUPER_ADMIN controlled.", isManager() ? callButton("ADD TRAINER", "add-trainer", true) : "")}${table}`;
}

function renderPayments() {
  const filteredPayments = state.payments.filter((payment) => (!paymentFilters.date || dateKey(payment.paymentDate) === paymentFilters.date) && (!paymentFilters.status || payment.status === paymentFilters.status) && (!paymentFilters.method || payment.paymentMethod === paymentFilters.method));
  const rows = filteredPayments.map((payment) => `<tr><td>${escapeHTML(payment.receiptId)}</td><td>${escapeHTML(payment.memberName)}</td><td>${money(payment.amount)}</td><td>${dateText(payment.paymentDate)}</td><td>${escapeHTML(payment.paymentMethod)}</td><td>${escapeHTML(payment.planName)}</td><td>${escapeHTML(payment.transactionId || "—")}</td><td>${statusMarkup(payment.status)}</td><td><div class="table-actions"><button class="admin-button small" data-action="view-receipt" data-id="${escapeHTML(payment.receiptId)}">RECEIPT</button>${isManager() && payment.status !== "REFUNDED" ? `<button class="admin-button small" data-action="edit-payment" data-id="${escapeHTML(payment.id)}">EDIT</button>${payment.status === "SUCCESS" ? `<button class="admin-button small danger" data-action="refund-payment" data-id="${escapeHTML(payment.id)}">REFUND</button>` : ""}` : ""}</div></td></tr>`).join("");
  const table = rows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>RECEIPT ID</th><th>MEMBER</th><th>AMOUNT</th><th>PAYMENT DATE</th><th>METHOD</th><th>PLAN</th><th>TRANSACTION ID</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${rows}</tbody></table></div>` : tableEmpty(["RECEIPT ID", "MEMBER", "AMOUNT", "PAYMENT DATE", "METHOD", "PLAN", "TRANSACTION ID", "STATUS", "ACTIONS"], state.loaded.has("payments") ? "No payments found." : "Loading payments...");
  return `${pageHeader("PAYMENTS", "Receipts are generated transactionally. Only SUCCESS payments count toward revenue.", canManage() ? callButton("ADD PAYMENT", "add-payment", true) : "")}<div class="filter-row"><input type="date" data-payment-date aria-label="Filter by date" value="${escapeHTML(paymentFilters.date)}" /><select data-payment-status aria-label="Filter by status"><option value="">All statuses</option>${["SUCCESS", "PENDING", "FAILED", "REFUNDED"].map((item) => `<option${paymentFilters.status === item ? " selected" : ""}>${item}</option>`).join("")}</select><select data-payment-method aria-label="Filter by method"><option value="">All methods</option>${["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((item) => `<option${paymentFilters.method === item ? " selected" : ""}>${item}</option>`).join("")}</select></div>${table}`;
}

const expenseCategories = ["Rent", "Electricity", "Water", "Equipment", "Equipment Repair", "Maintenance", "Salaries", "Trainer Payments", "Cleaning", "Marketing", "Internet", "Supplies", "Other"];
const expensePaymentMethods = ["Cash", "Bank", "Easypaisa", "JazzCash", "Other"];
const reportTabs = ["revenue", "expenses", "profit-loss", "membership-fees", "expiring", "attendance", "trainers"];
const visibleReportTabs = () => actor.role === "TRAINER" ? ["attendance"] : actor.role === "RECEPTIONIST" ? ["revenue", "membership-fees", "expiring"] : reportTabs;
const reportLabels = { revenue: "REVENUE", expenses: "EXPENSES", "profit-loss": "PROFIT & LOSS", "membership-fees": "MEMBERSHIP FEES", expiring: "EXPIRING MEMBERSHIPS", attendance: "ATTENDANCE", trainers: "TRAINER SUMMARY" };

function financeRangeForm() {
  return `<div class="finance-toolbar"><div class="segmented-control">${[["today", "TODAY"], ["week", "THIS WEEK"], ["month", "THIS MONTH"], ["year", "THIS YEAR"], ["custom", "CUSTOM"]].map(([key, label]) => `<button type="button" class="${financeRange.preset === key ? "active" : ""}" data-finance-preset="${key}">${label}</button>`).join("")}</div><form id="finance-range-form" class="date-range-form"${financeRange.preset === "custom" ? "" : " hidden"}><input type="date" name="from" value="${escapeHTML(financeRange.from)}" required aria-label="Start date" /><span>TO</span><input type="date" name="to" value="${escapeHTML(financeRange.to)}" required aria-label="End date" /><button class="admin-button small" type="submit">APPLY</button></form></div>`;
}

function reportFilterForm(report) {
  const from = reportFilters.from || defaultFinanceRange().from;
  const to = reportFilters.to || dayStartKey();
  const staff = [...new Map(state.activityLogs.map((entry) => [entry.userId, { id: entry.userId, name: entry.userName }])).values()];
  const search = `<input name="search" type="search" value="${escapeHTML(reportFilters.search || "")}" placeholder="Search current results..." aria-label="Search report" />`;
  if (report === "revenue") return `<form id="report-filter-form" class="filter-row"><input type="date" name="from" value="${escapeHTML(from)}" aria-label="Date from" /><input type="date" name="to" value="${escapeHTML(to)}" aria-label="Date to" /><select name="status"><option value="">All statuses</option>${["SUCCESS", "PENDING", "FAILED", "REFUNDED"].map((item) => `<option${reportFilters.status === item ? " selected" : ""}>${item}</option>`).join("")}</select><select name="planId"><option value="">All plans</option>${state.plans.map((plan) => `<option value="${escapeHTML(plan.id)}"${reportFilters.planId === plan.id ? " selected" : ""}>${escapeHTML(plan.planName)}</option>`).join("")}</select><select name="paymentMethod"><option value="">All methods</option>${["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((item) => `<option${reportFilters.paymentMethod === item ? " selected" : ""}>${item}</option>`).join("")}</select><select name="memberId"><option value="">All members</option>${state.members.map((member) => `<option value="${escapeHTML(member.id)}"${reportFilters.memberId === member.id ? " selected" : ""}>${escapeHTML(member.fullName)} (${escapeHTML(member.id)})</option>`).join("")}</select><select name="trainerId"><option value="">All trainers</option>${state.trainers.map((trainer) => `<option value="${escapeHTML(trainer.id)}"${reportFilters.trainerId === trainer.id ? " selected" : ""}>${escapeHTML(trainer.name)}</option>`).join("")}</select><select name="sort" aria-label="Sort revenue report"><option value="DATE_DESC"${(reportFilters.sort || "DATE_DESC") === "DATE_DESC" ? " selected" : ""}>Date: Newest</option><option value="DATE_ASC"${reportFilters.sort === "DATE_ASC" ? " selected" : ""}>Date: Oldest</option><option value="AMOUNT_DESC"${reportFilters.sort === "AMOUNT_DESC" ? " selected" : ""}>Amount: High to low</option><option value="AMOUNT_ASC"${reportFilters.sort === "AMOUNT_ASC" ? " selected" : ""}>Amount: Low to high</option><option value="MEMBER_ASC"${reportFilters.sort === "MEMBER_ASC" ? " selected" : ""}>Member: A to Z</option></select>${search}<button class="admin-button small" type="submit">FILTER</button></form>`;
  if (report === "expenses") return `<form id="report-filter-form" class="filter-row"><input type="date" name="from" value="${escapeHTML(from)}" aria-label="Date from" /><input type="date" name="to" value="${escapeHTML(to)}" aria-label="Date to" /><select name="category"><option value="">All categories</option>${expenseCategories.map((item) => `<option${reportFilters.category === item ? " selected" : ""}>${item}</option>`).join("")}</select><select name="paymentMethod"><option value="">All methods</option>${expensePaymentMethods.map((item) => `<option${reportFilters.paymentMethod === item ? " selected" : ""}>${item}</option>`).join("")}</select><select name="addedBy"><option value="">All staff</option>${staff.map((item) => `<option value="${escapeHTML(item.id)}"${reportFilters.addedBy === item.id ? " selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select>${search}<button class="admin-button small" type="submit">FILTER</button></form>`;
  if (report === "membership-fees") return `<form id="report-filter-form" class="filter-row"><select name="status"><option value="">All members</option>${["ACTIVE", "EXPIRED", "EXPIRING SOON", "PENDING", "PAID"].map((item) => `<option${reportFilters.status === item ? " selected" : ""}>${item}</option>`).join("")}</select>${search}<button class="admin-button small" type="submit">FILTER</button></form>`;
  if (report === "expiring") return `<form id="report-filter-form" class="filter-row"><select name="status"><option value=""${!reportFilters.status ? " selected" : ""}>Expiring in next 30 days</option><option value="EXPIRED"${reportFilters.status === "EXPIRED" ? " selected" : ""}>Expired memberships</option></select><button class="admin-button small" type="submit">FILTER</button></form>`;
  if (report === "attendance") return `<form id="report-filter-form" class="filter-row"><input type="date" name="from" value="${escapeHTML(from)}" aria-label="Date from" /><input type="date" name="to" value="${escapeHTML(to)}" aria-label="Date to" /><select name="gender"><option value="">All genders</option>${["Male", "Female"].map((item) => `<option${reportFilters.gender === item ? " selected" : ""}>${item}</option>`).join("")}</select><select name="timeSlotId"><option value="">All time slots</option>${state.timeSlots.map((item) => `<option value="${escapeHTML(item.id)}"${reportFilters.timeSlotId === item.id ? " selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select><select name="memberId"><option value="">All members</option>${state.members.map((item) => `<option value="${escapeHTML(item.id)}"${reportFilters.memberId === item.id ? " selected" : ""}>${escapeHTML(item.fullName)} (${escapeHTML(item.id)})</option>`).join("")}</select><select name="trainerId"><option value="">All trainers</option>${state.trainers.map((item) => `<option value="${escapeHTML(item.id)}"${reportFilters.trainerId === item.id ? " selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select>${search}<button class="admin-button small" type="submit">FILTER</button></form>`;
  return "";
}

function defaultFinanceRange() {
  const today = dayStartKey();
  const [year] = today.split("-").map(Number);
  return { preset: "year", from: `${year}-01-01`, to: today };
}

function datePresetRange(preset) {
  const today = dayStartKey();
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  let from = today;
  if (preset === "week") {
    const weekday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - weekday);
    from = date.toISOString().slice(0, 10);
  } else if (preset === "month") from = `${year}-${String(month).padStart(2, "0")}-01`;
  else if (preset === "year") from = `${year}-01-01`;
  return { preset, from, to: today };
}

function ensureFinancialData(force = false) {
  if (!financeRange.from || !financeRange.to) financeRange = defaultFinanceRange();
  const key = `${financeRange.from}:${financeRange.to}`;
  if (!force && financialSummaryKey === key && !financialSummaryLoading && financialSummary) return Promise.resolve(financialSummary);
  if (!force && financialSummaryLoading) return financialSummaryPromise;
  const requestId = ++financeRequestId;
  financialSummaryKey = key;
  financialSummary = null;
  financialSummaryLoading = true;
  financialSummaryPromise = getFinancialDashboard({ from: financeRange.from, to: financeRange.to }).then((data) => {
    if (requestId !== financeRequestId) return;
    financialSummary = data;
    financialSummaryLoading = false;
    if (currentView === "financials" || currentReport === "profit-loss") render();
    return data;
  }).catch((error) => {
    if (requestId !== financeRequestId) return;
    financialSummary = { error: error.message };
    financialSummaryLoading = false;
    toast(error.message || "Financial summary could not be loaded.", true);
    if (currentView === "financials" || currentReport === "profit-loss") render();
    return financialSummary;
  });
  return financialSummaryPromise;
}

function chartBars(items, keys, labelKey, colorKey) {
  if (!items?.length || !items.some((item) => keys.some((key) => Number(item[key]) !== 0))) return `<div class="chart-empty">No financial data available.</div>`;
  const maximum = Math.max(1, ...items.flatMap((item) => keys.map((key) => Math.abs(Number(item[key]) || 0))));
  return `<div class="report-bars">${items.map((item) => `<div class="report-bar-group"><span class="report-bar-label">${escapeHTML(item[labelKey])}</span><div class="report-bar-stack">${keys.map((key, index) => { const amount = Number(item[key]) || 0; return `<span class="report-bar" data-negative="${amount < 0}" style="--bar-color:${colorKey[index]};--bar-size:${Math.abs(amount) / maximum * 100}%" title="${escapeHTML(key)} ${money(amount)}"></span>`; }).join("")}</div></div>`).join("")}</div>`;
}

function renderFinancials() {
  ensureFinancialData();
  const data = financialSummary;
  const failed = data?.error;
  const totals = data && !failed ? [
    ["TOTAL REVENUE", money(data.totalRevenue)], ["TOTAL EXPENSES", money(data.totalExpenses)], ["NET PROFIT", money(data.netProfit)],
    ["PENDING PAYMENTS", money(data.pendingPayments)], ["REFUNDED PAYMENTS", money(data.refundedPayments)]
  ] : [["TOTAL REVENUE", failed ? "UNAVAILABLE" : "LOADING"], ["TOTAL EXPENSES", failed ? "UNAVAILABLE" : "LOADING"], ["NET PROFIT", failed ? "UNAVAILABLE" : "LOADING"], ["PENDING PAYMENTS", failed ? "UNAVAILABLE" : "LOADING"], ["REFUNDED PAYMENTS", failed ? "UNAVAILABLE" : "LOADING"]];
  const monthly = data && !failed ? data.monthly : [];
  return `${pageHeader("FINANCIAL DASHBOARD", "Revenue includes successful payments only; expenses come from recorded Firestore entries.")}${financeRangeForm()}
    <section class="metric-grid finance-metrics">${totals.map(([label, value]) => `<div class="metric"><span class="metric-label">${label}</span><strong class="metric-value${data && !failed ? "" : " no-data"}">${escapeHTML(value)}</strong></div>`).join("")}</section>
    ${data?.dataAvailable ? `<div class="financial-summary-line"><span>PROFIT MARGIN</span><strong>${Number(data.profitMargin).toFixed(1)}%</strong><span>NET PROFIT / REVENUE</span></div>` : `<div class="empty-note">${failed ? "Financial data could not be loaded." : financialSummaryLoading ? "Loading financial data..." : "No financial data available."}</div>`}
    <section class="section-block split-grid"><article class="panel"><div class="panel-head"><h2>MONTHLY REVENUE / EXPENSES / NET</h2></div><div class="panel-body">${chartBars(monthly, ["revenue", "expenses", "netProfit"], "month", ["#d4af37", "#969696", "#f5c542"])}</div><div class="chart-legend"><span class="legend-key" style="--key-color:#d4af37">Revenue</span><span class="legend-key" style="--key-color:#969696">Expenses</span><span class="legend-key" style="--key-color:#f5c542">Net Profit</span></div></article><article class="panel"><div class="panel-head"><h2>EXPENSE CATEGORIES</h2></div><div class="panel-body">${data?.expenseCategories?.length ? chartBars(data.expenseCategories, ["amount"], "category", ["#d4af37"]) : `<div class="chart-empty">No expenses recorded.</div>`}</div></article></section>`;
}

function renderExpenses() {
  const rows = expenseRows.map((expense) => `<tr><td>${escapeHTML(expense.id)}</td><td>${escapeHTML(expense.title)}</td><td>${escapeHTML(expense.category)}</td><td>${money(expense.amount)}</td><td>${dateText(expense.expenseDate)}</td><td>${escapeHTML(expense.paymentMethod)}</td><td>${escapeHTML(expense.addedByName || expense.addedBy)}</td><td><div class="table-actions"><button class="admin-button small" data-action="view-expense" data-id="${escapeHTML(expense.id)}">VIEW</button><button class="admin-button small" data-action="edit-expense" data-id="${escapeHTML(expense.id)}">EDIT</button>${actor.role === "SUPER_ADMIN" ? `<button class="admin-button small danger" data-action="delete-expense" data-id="${escapeHTML(expense.id)}">DELETE</button>` : ""}</div></td></tr>`).join("");
  const table = rows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>EXPENSE ID</th><th>TITLE</th><th>CATEGORY</th><th>AMOUNT</th><th>DATE</th><th>METHOD</th><th>ADDED BY</th><th>ACTIONS</th></tr></thead><tbody>${rows}</tbody></table></div>` : tableEmpty(["EXPENSE ID", "TITLE", "CATEGORY", "AMOUNT", "DATE", "METHOD", "ADDED BY", "ACTIONS"], expenseError || (expenseLoading ? "Loading expenses..." : "No expenses recorded yet."));
  const filterForm = `<form id="expense-filter-form" class="filter-row"><input type="date" name="from" value="${escapeHTML(reportFilters.from || "")}" aria-label="Date from" /><input type="date" name="to" value="${escapeHTML(reportFilters.to || "")}" aria-label="Date to" /><select name="category"><option value="">All categories</option>${expenseCategories.map((item) => `<option${reportFilters.category === item ? " selected" : ""}>${item}</option>`).join("")}</select><select name="paymentMethod"><option value="">All methods</option>${expensePaymentMethods.map((item) => `<option${reportFilters.paymentMethod === item ? " selected" : ""}>${item}</option>`).join("")}</select><input name="search" type="search" value="${escapeHTML(reportFilters.search || "")}" placeholder="Search expenses..." aria-label="Search expenses" /><button class="admin-button small" type="submit">FILTER</button></form>`;
  return `${pageHeader("EXPENSES", "Record and review verified operating expenses.", callButton("ADD EXPENSE", "add-expense", true))}<div class="expense-total"><span>TOTAL EXPENSES</span><strong>${money(expenseTotals.totalAmount)}</strong></div>${filterForm}${table}${expenseHasMore ? `<div class="pagination-row"><button class="admin-button" type="button" data-action="more-expenses">LOAD MORE</button></div>` : ""}`;
}

function renderReportTable(report) {
  const rows = report === "revenue" ? sortReportRows(reportRows, reportFilters.sort) : reportRows;
  if (report === "revenue") return rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>RECEIPT ID</th><th>MEMBER ID</th><th>MEMBER NAME</th><th>PLAN</th><th>AMOUNT</th><th>METHOD</th><th>DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHTML(item.receiptId)}</td><td>${escapeHTML(item.memberId)}</td><td>${escapeHTML(item.memberName)}</td><td>${escapeHTML(item.planName)}</td><td>${money(item.amount)}</td><td>${escapeHTML(item.paymentMethod)}</td><td>${dateText(item.paymentDate)}</td><td>${statusMarkup(item.status)}</td><td><button class="admin-button small" data-action="view-receipt" data-id="${escapeHTML(item.receiptId)}">RECEIPT</button></td></tr>`).join("")}</tbody></table></div>` : tableEmpty(["RECEIPT ID", "MEMBER ID", "MEMBER NAME", "PLAN", "AMOUNT", "METHOD", "DATE", "STATUS", "ACTIONS"], reportError || (reportLoading ? "Loading revenue report..." : "No successful payments found."));
  if (report === "expenses") return rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>EXPENSE ID</th><th>TITLE</th><th>CATEGORY</th><th>AMOUNT</th><th>DATE</th><th>METHOD</th><th>ADDED BY</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHTML(item.id)}</td><td>${escapeHTML(item.title)}</td><td>${escapeHTML(item.category)}</td><td>${money(item.amount)}</td><td>${dateText(item.expenseDate)}</td><td>${escapeHTML(item.paymentMethod)}</td><td>${escapeHTML(item.addedByName || item.addedBy)}</td></tr>`).join("")}</tbody></table></div>` : tableEmpty(["EXPENSE ID", "TITLE", "CATEGORY", "AMOUNT", "DATE", "METHOD", "ADDED BY"], reportError || (reportLoading ? "Loading expense report..." : "No expenses recorded yet."));
  if (report === "membership-fees") return rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>MEMBER ID</th><th>NAME</th><th>PLAN</th><th>START</th><th>EXPIRY</th><th>FEE</th><th>PAYMENT</th><th>TRAINER</th><th>TIME SLOT</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHTML(item.id)}</td><td>${escapeHTML(item.fullName)}</td><td>${escapeHTML(item.membershipPlanName)}</td><td>${dateText(item.membershipStartDate)}</td><td>${dateText(item.membershipExpiryDate)}</td><td>${money(item.monthlyFee)}</td><td>${statusMarkup(feeStatusForMember(item))}</td><td>${escapeHTML(item.trainerName || "—")}</td><td>${escapeHTML(item.timeSlotName || "—")}</td></tr>`).join("")}</tbody></table></div>` : tableEmpty(["MEMBER ID", "NAME", "PLAN", "START", "EXPIRY", "FEE", "PAYMENT", "TRAINER", "TIME SLOT"], reportError || (reportLoading ? "Loading membership report..." : "No members registered yet."));
  if (report === "expiring") return rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>MEMBER ID</th><th>MEMBER NAME</th><th>PHONE</th><th>PLAN</th><th>EXPIRY DATE</th><th>DAYS REMAINING</th><th>TRAINER</th><th>STATUS</th></tr></thead><tbody>${rows.map((item) => { const days = Math.ceil((new Date(`${dateKey(item.membershipExpiryDate)}T00:00:00Z`) - new Date(`${dayStartKey()}T00:00:00Z`)) / 86400000); return `<tr><td>${escapeHTML(item.id)}</td><td>${escapeHTML(item.fullName)}</td><td>${escapeHTML(item.phone)}</td><td>${escapeHTML(item.membershipPlanName)}</td><td>${dateText(item.membershipExpiryDate)}</td><td>${days}</td><td>${escapeHTML(item.trainerName || "—")}</td><td>${statusMarkup(days <= 7 ? "EXPIRING SOON" : "ACTIVE")}</td></tr>`; }).join("")}</tbody></table></div>` : tableEmpty(["MEMBER ID", "MEMBER NAME", "PHONE", "PLAN", "EXPIRY DATE", "DAYS REMAINING", "TRAINER", "STATUS"], reportError || (reportLoading ? "Loading expiring memberships..." : "No memberships are expiring soon."));
  if (report === "attendance") return rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>MEMBER ID</th><th>NAME</th><th>TOTAL DAYS</th><th>PRESENT</th><th>ABSENT</th><th>ATTENDANCE %</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHTML(item.memberId)}</td><td>${escapeHTML(item.memberName)}</td><td>${item.totalDays}</td><td>${item.present}</td><td>${item.absent}</td><td>${Number(item.attendancePercentage || 0).toFixed(1)}%</td></tr>`).join("")}</tbody></table></div>` : tableEmpty(["MEMBER ID", "NAME", "TOTAL DAYS", "PRESENT", "ABSENT", "ATTENDANCE %"], reportError || (reportLoading ? "Loading attendance report..." : "No attendance records found."));
  if (report === "trainers") return rows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>TRAINER</th><th>ASSIGNED MEMBERS</th><th>ACTIVE MEMBERS</th><th>WORKOUT PLANS</th><th>DIET PLANS</th><th>ATTENDANCE ACTIVITY</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHTML(item.name)}</td><td>${item.assignedMembers}</td><td>${item.activeMembers}</td><td>${item.workoutPlans}</td><td>${item.dietPlans}</td><td>${item.attendanceActivity}</td></tr>`).join("")}</tbody></table></div>` : tableEmpty(["TRAINER", "ASSIGNED MEMBERS", "ACTIVE MEMBERS", "WORKOUT PLANS", "DIET PLANS", "ATTENDANCE ACTIVITY"], reportError || (reportLoading ? "Loading trainer report..." : "No trainer records available."));
  return "";
}

function renderReports() {
  const tabs = visibleReportTabs();
  if (!tabs.includes(currentReport)) currentReport = tabs[0];
  const tabsMarkup = `<div class="subnav" role="tablist" aria-label="Report type">${tabs.map((tab) => `<button type="button" role="tab" data-report-tab="${tab}" class="${currentReport === tab ? "active" : ""}" aria-selected="${currentReport === tab}">${reportLabels[tab]}</button>`).join("")}</div>`;
  if (currentReport === "profit-loss") {
    ensureFinancialData();
    const data = financialSummary;
    const pAndL = data && !data.error;
    const breakdown = data?.dataAvailable ? `<section class="section-block split-grid"><article class="panel"><div class="panel-head"><h2>REVENUE</h2></div><div class="panel-body"><div class="receipt-line"><span>Successful Payments</span><strong>${money(data.totalRevenue)}</strong></div><p class="section-caption">Only SUCCESS payments are included.</p></div></article><article class="panel"><div class="panel-head"><h2>EXPENSES</h2></div><div class="panel-body">${data.expenseCategories?.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>CATEGORY</th><th>AMOUNT</th></tr></thead><tbody>${data.expenseCategories.map((item) => `<tr><td>${escapeHTML(item.category)}</td><td>${money(item.amount)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-note">No expenses recorded.</div>`}</div></article></section>` : "";
    return `${pageHeader("REPORTS", "Real Firestore reports with role-scoped access.")}${tabsMarkup}${financeRangeForm()}${pAndL ? `<div class="metric-grid finance-metrics"><div class="metric"><span class="metric-label">TOTAL REVENUE</span><strong class="metric-value">${money(data.totalRevenue)}</strong></div><div class="metric"><span class="metric-label">TOTAL EXPENSES</span><strong class="metric-value">${money(data.totalExpenses)}</strong></div><div class="metric"><span class="metric-label">NET PROFIT</span><strong class="metric-value">${money(data.netProfit)}</strong></div></div>${breakdown || `<div class="empty-note">No financial data available.</div>`}` : `<div class="empty-note">${data?.error ? "Financial data could not be loaded." : financialSummaryLoading ? "Loading financial report..." : "No financial data available."}</div>`}<div class="report-actions">${callButton("PRINT", "print-report")}${callButton("EXPORT CSV", "export-report", true)}</div>`;
  }
  const filters = reportFilterForm(currentReport);
  const summary = currentReport === "revenue" ? `<div class="expense-total"><span>SUCCESSFUL REVENUE</span><strong>${money(reportTotals.totalRevenue)}</strong></div>` : currentReport === "expenses" ? `<div class="expense-total"><span>TOTAL EXPENSES</span><strong>${money(reportTotals.totalAmount)}</strong></div>` : currentReport === "membership-fees" ? `<div class="metric-grid finance-metrics">${[["TOTAL MEMBERS", reportTotals.totalMembers], ["ACTIVE MEMBERS", reportTotals.activeMembers], ["EXPIRED MEMBERS", reportTotals.expiredMembers], ["EXPIRING SOON", reportTotals.expiringSoon], ["PAID MEMBERS", reportTotals.paidMembers], ["PENDING MEMBERS", reportTotals.pendingMembers]].map(([label, value]) => `<div class="metric"><span class="metric-label">${label}</span><strong class="metric-value">${reportTotals.totalMembers === undefined ? "—" : value}</strong></div>`).join("")}</div>${reportTotals.totalMembers ? `<div class="panel section-block"><div class="panel-head"><h2>MEMBERSHIP STATUS</h2></div><div class="panel-body">${chartBars([{ status: "Active", amount: reportTotals.activeMembers }, { status: "Expired", amount: reportTotals.expiredMembers }, { status: "Expiring Soon", amount: reportTotals.expiringSoon }], ["amount"], "status", ["#d4af37"])}</div></div>` : ""}` : currentReport === "attendance" ? `<div class="metric-grid finance-metrics">${[["TOTAL ATTENDANCE", reportTotals.totalAttendance], ["PRESENT", reportTotals.present], ["ABSENT", reportTotals.absent], ["ATTENDANCE %", `${Number(reportTotals.attendancePercentage || 0).toFixed(1)}%`]].map(([label, value]) => `<div class="metric"><span class="metric-label">${label}</span><strong class="metric-value">${reportTotals.totalAttendance === undefined ? "—" : value}</strong></div>`).join("")}</div>${reportTotals.totalAttendance ? `<div class="panel section-block"><div class="panel-head"><h2>ATTENDANCE OVERVIEW</h2></div><div class="panel-body">${chartBars([{ status: "Present", amount: reportTotals.present }, { status: "Absent", amount: reportTotals.absent }], ["amount"], "status", ["#d4af37"])}</div></div>` : ""}` : "";
  return `${pageHeader("REPORTS", "Real Firestore reports with role-scoped access.")}${tabsMarkup}${filters}${summary}${renderReportTable(currentReport)}<div class="report-actions">${callButton("PRINT", "print-report")}${callButton("EXPORT CSV", "export-report", true)}${reportHasMore ? callButton("LOAD MORE", "more-report") : ""}</div>`;
}

async function loadExpensePage(reset = true) {
  const requestId = ++expenseRequestId;
  const filters = { from: reportFilters.from || defaultFinanceRange().from, to: reportFilters.to || dayStartKey(), category: reportFilters.category || "", paymentMethod: reportFilters.paymentMethod || "", addedBy: reportFilters.addedBy || "", search: reportFilters.search || "" };
  if (reset) {
    expenseRows = [];
    expenseCursor = null;
    expenseHasMore = false;
    expenseTotals = { totalAmount: 0, totalRecords: 0 };
    expenseError = "";
  }
  expenseLoading = true;
  if (currentView === "expenses") render();
  try {
    const result = await getFinancialReportPage("expenses", filters, reset ? null : expenseCursor, 50);
    if (requestId !== expenseRequestId) return;
    expenseRows = reset ? result.rows : expenseRows.concat(result.rows);
    expenseCursor = result.nextCursor;
    expenseHasMore = result.hasMore;
    expenseTotals = result.totals;
  } catch (error) {
    if (requestId !== expenseRequestId) return;
    expenseError = error.message || "Unable to load expenses.";
  } finally {
    if (requestId === expenseRequestId) {
      expenseLoading = false;
      if (currentView === "expenses") render();
    }
  }
}

async function loadReportPage(reset = true) {
  const requestId = ++reportRequestId;
  const report = currentReport;
  if (report === "profit-loss") { reportLoading = false; ensureFinancialData(); return; }
  if (reset) {
    reportRows = [];
    reportCursor = null;
    reportHasMore = false;
    reportTotals = {};
    reportError = "";
  }
  reportLoading = true;
  if (currentView === "reports") render();
  try {
    const filters = { ...reportFilters };
    if (["revenue", "expenses", "attendance"].includes(report)) {
      filters.from ||= defaultFinanceRange().from;
      filters.to ||= dayStartKey();
    }
    const result = await getFinancialReportPage(report, filters, reset ? null : reportCursor, 50);
    if (requestId !== reportRequestId) return;
    reportRows = reset ? result.rows : reportRows.concat(result.rows);
    reportCursor = result.nextCursor;
    reportHasMore = result.hasMore;
    reportTotals = result.totals || {};
  } catch (error) {
    if (requestId !== reportRequestId) return;
    reportError = error.message || "Unable to load this report.";
  } finally {
    if (requestId === reportRequestId) {
      reportLoading = false;
      if (currentView === "reports") render();
    }
  }
}

function refreshViewData() {
  if (currentView === "expenses") loadExpensePage(true);
  if (currentView === "financials") ensureFinancialData(true);
  if (currentView === "reports") loadReportPage(true);
}

function openExpenseForm(expense = null) {
  const fields = [
    field("title", "Title", "text", { required: true, value: expense?.title }),
    field("category", "Category", "select", { required: true, html: `<option value="">Select category</option>${expenseCategories.map((item) => `<option${expense?.category === item ? " selected" : ""}>${escapeHTML(item)}</option>`).join("")}` }),
    field("amount", "Amount (PKR)", "number", { required: true, min: "0.01", step: "0.01", value: expense?.amount ?? "" }),
    field("expenseDate", "Expense Date", "date", { required: true, value: inputDate(expense?.expenseDate) || dayStartKey() }),
    field("paymentMethod", "Payment Method", "select", { required: true, html: `<option value="">Select method</option>${expensePaymentMethods.map((item) => `<option${expense?.paymentMethod === item ? " selected" : ""}>${escapeHTML(item)}</option>`).join("")}` }),
    field("description", "Description", "textarea", { full: true, value: expense?.description }),
    `<div class="form-field full"><label for="expense-receipt">Receipt image or PDF</label><input id="expense-receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /><span class="form-hint">Maximum file size: 10 MB.</span>${expense?.receiptPath ? `<button class="admin-button small" type="button" data-action="remove-expense-receipt" data-id="${escapeHTML(expense.id)}">REMOVE CURRENT RECEIPT</button>` : ""}</div>`
  ].join("");
  showDialog(expense ? "EDIT EXPENSE" : "ADD EXPENSE", "Expenses are stored in Firestore. Receipt files remain private in Firebase Storage.", fields, expense ? "SAVE EXPENSE" : "ADD EXPENSE", { kind: expense ? "edit-expense" : "create-expense", id: expense?.id || "" });
}

function confirmExpenseDelete(expense) {
  const fields = `<div class="form-field full"><p>Are you sure you want to permanently delete <strong>${escapeHTML(expense.title)}</strong>? Its receipt file will also be deleted and financial totals will be recalculated.</p></div>`;
  showDialog("DELETE EXPENSE", "This action cannot be undone.", fields, "DELETE EXPENSE", { kind: "delete-expense", id: expense.id });
}

async function openExpenseReceipt(expense) {
  if (!expense.receiptPath) { toast("No receipt is attached to this expense."); return; }
  try {
    const url = await getExpenseReceiptObjectUrl(expense.receiptPath);
    const pdf = expense.receiptPath.toLowerCase().endsWith(".pdf");
    const body = pdf ? `<iframe class="expense-receipt-frame" title="Expense receipt" src="${url}"></iframe>` : `<img class="expense-receipt-image" src="${url}" alt="Expense receipt for ${escapeHTML(expense.title)}" />`;
    showDialog("EXPENSE RECEIPT", escapeHTML(expense.title), `<div class="expense-receipt-preview">${body}</div><a class="admin-button" href="${url}" target="_blank" rel="noopener" download>OPEN / DOWNLOAD RECEIPT</a>`, "CLOSE", { kind: "close-dialog" });
    activeObjectUrl = url;
  } catch (error) { toast(error.message || "Could not load the receipt.", true); }
}

function openExpenseDetails(expense) {
  const fields = [["Expense ID", expense.id], ["Title", expense.title], ["Category", expense.category], ["Amount", money(expense.amount)], ["Date", dateText(expense.expenseDate)], ["Payment Method", expense.paymentMethod], ["Added By", expense.addedByName || expense.addedBy], ["Description", expense.description || "—"]];
  const content = `<div class="profile-detail-grid">${fields.map(([label, value]) => `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join("")}</div>${expense.receiptPath ? `<button class="admin-button" type="button" data-action="view-expense-receipt" data-id="${escapeHTML(expense.id)}">VIEW RECEIPT</button>` : `<p class="empty-note">No receipt attached.</p>`}`;
  showDialog("EXPENSE DETAILS", "Verified Firestore expense record.", content, "CLOSE", { kind: "close-dialog" });
}

function renderNotifications() {
  const tabs = [
    ["all", "ALL"],
    ["unread", "UNREAD"],
    ["read", "READ"],
    ["high_priority", "HIGH PRIORITY"],
    ["membership", "MEMBERSHIP"],
    ["payment", "PAYMENTS"],
    ["attendance", "ATTENDANCE"],
    ["training", "TRAINING & PROGRESS"],
    ["system", "SYSTEM"]
  ];

  const subnav = `<div class="subnav">${tabs.map(([id, label]) => `<button type="button" class="${notificationFilter === id ? "active" : ""}" data-notif-tab="${id}">${label}</button>`).join("")}</div>`;

  const actions = `
    <button class="admin-button" type="button" data-action="run-expiry-check">⚡ RUN NOTIFICATION CHECK</button>
    <button class="admin-button" type="button" data-action="open-notification-settings">⚙️ SETTINGS</button>
    <button class="admin-button" type="button" data-action="mark-all-read">MARK ALL READ</button>
    <button class="admin-button primary" type="button" data-action="create-notification">+ CREATE NOTIFICATION</button>
  `;

  const filtered = state.notifications.filter((n) => {
    if (notificationFilter === "unread") return n.status !== "READ";
    if (notificationFilter === "read") return n.status === "READ";
    if (notificationFilter === "high_priority") return n.priority === "HIGH" || n.priority === "URGENT";
    if (notificationFilter === "membership") return n.type === "MEMBERSHIP_EXPIRY" || n.type === "MEMBERSHIP_EXPIRED";
    if (notificationFilter === "payment") return ["PAYMENT_SUCCESS", "PAYMENT_PENDING", "PAYMENT_REMINDER", "PAYMENT_REFUNDED"].includes(n.type);
    if (notificationFilter === "attendance") return n.type === "ATTENDANCE";
    if (notificationFilter === "training") return ["WORKOUT", "DIET", "PROGRESS"].includes(n.type);
    if (notificationFilter === "system") return n.type === "SYSTEM" || n.type === "GENERAL";
    return true;
  });

  const cards = filtered.length ? `
    <div class="notification-admin-grid">
      ${filtered.map((item) => {
        const isUnread = item.status !== "READ";
        const priority = item.priority || "NORMAL";
        const typeLabel = (item.type || "GENERAL").replace(/_/g, " ");
        const member = state.members.find((m) => m.id === item.recipientMemberId);
        return `
          <article class="notification-admin-card ${isUnread ? "unread" : "read"}" data-notif-id="${escapeHTML(item.id || item.notificationId)}">
            <div class="notif-header-row">
              <div class="notif-badges">
                <span class="type-pill">${escapeHTML(typeLabel)}</span>
                <span class="priority-pill priority-${escapeHTML(priority.toLowerCase())}">${escapeHTML(priority)}</span>
                ${isUnread ? `<span class="unread-dot-badge">● UNREAD</span>` : `<span class="read-dot-badge">✓ READ</span>`}
              </div>
              <span class="notif-timestamp">${dateTimeText(item.createdAt)}</span>
            </div>
            <h3 class="notif-title">${escapeHTML(item.title)}</h3>
            <p class="notif-message">${escapeHTML(item.message)}</p>
            <div class="notif-meta-row">
              <span>Recipient: <strong>${escapeHTML(item.recipientMemberId || "—")}${member ? ` (${escapeHTML(member.fullName)})` : ""}</strong></span>
              <span>Created by: <strong>${escapeHTML(item.createdBy || "SYSTEM")}</strong></span>
            </div>
            <div class="notif-actions-row">
              <button class="admin-button small" type="button" data-action="${isUnread ? "mark-read" : "mark-unread"}" data-id="${escapeHTML(item.id || item.notificationId)}">${isUnread ? "MARK READ" : "MARK UNREAD"}</button>
              ${item.recipientMemberId && member ? `<button class="admin-button small whatsapp" type="button" data-action="open-whatsapp-modal" data-member-id="${escapeHTML(item.recipientMemberId)}" data-template="${escapeHTML(item.type)}">💬 WHATSAPP</button>` : ""}
              ${canManage() ? `<button class="admin-button small danger" type="button" data-action="delete-notification" data-id="${escapeHTML(item.id || item.notificationId)}">DELETE</button>` : ""}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  ` : `<div class="placeholder-panel"><h2>${notificationFilter === "unread" ? "No unread notifications." : "No notifications yet."}</h2><p>All real notifications received from member expiry checks, payments, attendance, or staff dispatches will appear here.</p></div>`;

  return `${pageHeader("NOTIFICATIONS", "Review and manage real-time member, payment, training, and system notifications.", actions)}${subnav}${cards}`;
}

function renderWhatsApp() {
  const tabs = [
    ["expiring", "EXPIRING SOON (30 DAYS)"],
    ["expired", "EXPIRED MEMBERS"],
    ["pending", "PENDING PAYMENTS"],
    ["recent_payments", "RECENT PAYMENTS"],
    ["all", "ACTIVE MEMBERS"]
  ];

  const subnav = `<div class="subnav">${tabs.map(([id, label]) => `<button type="button" class="${whatsappFilter === id ? "active" : ""}" data-whatsapp-tab="${id}">${label}</button>`).join("")}</div>`;

  const today = dayStartKey();
  let rows = [];

  if (whatsappFilter === "expiring") {
    rows = state.members.filter((m) => {
      if (statusForMember(m) !== "ACTIVE") return false;
      const expiry = dateKey(m.membershipExpiryDate);
      if (!expiry) return false;
      const diff = Math.floor((new Date(`${expiry}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
      return diff >= 0 && diff <= 30;
    }).map((m) => {
      const expiry = dateKey(m.membershipExpiryDate);
      const diff = Math.floor((new Date(`${expiry}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
      return {
        member: m,
        phone: m.phone,
        status: diff <= 7 ? "EXPIRING SOON" : "8-30 DAYS",
        detailLabel: "Plan",
        detailValue: m.membershipPlanName || "Standard",
        subDetailLabel: "Expires In",
        subDetailValue: `${diff} day${diff === 1 ? "" : "s"} (${dateText(m.membershipExpiryDate)})`,
        defaultTemplate: "MEMBERSHIP_EXPIRY"
      };
    });
  } else if (whatsappFilter === "expired") {
    rows = state.members.filter((m) => statusForMember(m) === "EXPIRED").map((m) => ({
      member: m,
      phone: m.phone,
      status: "EXPIRED",
      detailLabel: "Plan",
      detailValue: m.membershipPlanName || "Standard",
      subDetailLabel: "Expired On",
      subDetailValue: dateText(m.membershipExpiryDate),
      defaultTemplate: "MEMBERSHIP_EXPIRED"
    }));
  } else if (whatsappFilter === "pending") {
    rows = state.members.filter((m) => m.feeStatus !== "PAID" && statusForMember(m) !== "INACTIVE").map((m) => ({
      member: m,
      phone: m.phone,
      status: statusForMember(m) === "EXPIRED" ? "OVERDUE" : "DUE",
      detailLabel: "Monthly Fee",
      detailValue: money(m.monthlyFee),
      subDetailLabel: "Plan",
      subDetailValue: m.membershipPlanName || "Standard",
      defaultTemplate: "PAYMENT_REMINDER"
    }));
  } else if (whatsappFilter === "recent_payments") {
    rows = state.payments.slice(0, 50).map((p) => {
      const member = state.members.find((m) => m.id === p.memberId);
      return {
        member: member || { id: p.memberId, fullName: p.memberName, phone: "" },
        phone: member?.phone || "",
        status: p.status,
        detailLabel: "Receipt / Amount",
        detailValue: `${p.receiptId} · ${money(p.amount)}`,
        subDetailLabel: "Payment Date",
        subDetailValue: dateText(p.paymentDate),
        defaultTemplate: "PAYMENT_SUCCESS",
        extraContext: { receiptId: p.receiptId, amount: money(p.amount), paymentDate: dateText(p.paymentDate), planName: p.planName }
      };
    });
  } else {
    rows = state.members.filter((m) => statusForMember(m) === "ACTIVE").map((m) => ({
      member: m,
      phone: m.phone,
      status: "ACTIVE",
      detailLabel: "Plan",
      detailValue: m.membershipPlanName || "Standard",
      subDetailLabel: "Expiry",
      subDetailValue: dateText(m.membershipExpiryDate),
      defaultTemplate: "GENERAL"
    }));
  }

  if (whatsappSearch.trim()) {
    const q = whatsappSearch.toLowerCase().trim();
    rows = rows.filter((r) =>
      r.member.fullName?.toLowerCase().includes(q) ||
      r.member.id?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q)
    );
  }

  const searchBar = `
    <div class="table-toolbar">
      <div class="search-field">
        <span class="search-mark">🔍</span>
        <input type="search" id="whatsapp-search" placeholder="Search member, ID, or phone..." value="${escapeHTML(whatsappSearch)}" />
      </div>
      <div class="toolbar-stats">
        <span>Showing <strong>${rows.length}</strong> recipients</span>
      </div>
    </div>
  `;

  const table = rows.length ? `
    <div class="table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>MEMBER</th>
            <th>PHONE</th>
            <th>STATUS</th>
            <th>DETAILS</th>
            <th>ADDITIONAL INFO</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const norm = normalizePhoneNumber(row.phone);
            return `
              <tr>
                <td>
                  <div class="member-cell">
                    <span class="member-avatar">${escapeHTML((row.member.fullName || "M").slice(0, 1))}</span>
                    <div>
                      <strong>${escapeHTML(row.member.fullName)}</strong>
                      <small>${escapeHTML(row.member.id)}</small>
                    </div>
                  </div>
                </td>
                <td>
                  ${norm.valid
                    ? `<span class="phone-valid">📞 ${escapeHTML(norm.display)}</span>`
                    : `<span class="phone-invalid">⚠️ No Valid Number</span>`}
                </td>
                <td>${statusMarkup(row.status)}</td>
                <td><small>${escapeHTML(row.detailLabel)}:</small> <strong>${escapeHTML(row.detailValue)}</strong></td>
                <td><small>${escapeHTML(row.subDetailLabel)}:</small> ${escapeHTML(row.subDetailValue)}</td>
                <td>
                  <button class="admin-button small whatsapp" type="button" data-action="open-whatsapp-modal" data-member-id="${escapeHTML(row.member.id)}" data-template="${escapeHTML(row.defaultTemplate)}">
                    💬 WHATSAPP
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  ` : tableEmpty(["MEMBER", "PHONE", "STATUS", "DETAILS", "ADDITIONAL INFO", "ACTIONS"], "No members found for this category.");

  return `${pageHeader("WHATSAPP COMMUNICATION", "Send pre-filled WhatsApp messages to expiring, expired, or pending members safely.", "")}${subnav}${searchBar}${table}`;
}

function renderGeneric(id) {
  const [description, empty] = genericViews[id] || ["", "No data available."];
  if (id === "activity-logs") {
    const rows = state.activityLogs.map((log) => `<tr><td>${dateText(log.timestamp)}</td><td>${escapeHTML(log.userName)}</td><td>${escapeHTML(log.role)}</td><td>${escapeHTML(log.action)}</td><td>${escapeHTML(log.module)}</td><td>${escapeHTML(log.recordId)}</td></tr>`).join("");
    const table = rows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>DATE</th><th>USER</th><th>ROLE</th><th>ACTION</th><th>MODULE</th><th>RECORD</th></tr></thead><tbody>${rows}</tbody></table></div>` : tableEmpty(["DATE", "USER", "ROLE", "ACTION", "MODULE", "RECORD"], state.loaded.has("activityLogs") ? empty : "Loading activity...");
    return `${pageHeader(viewNames[id], description)}${table}`;
  }
  return `${pageHeader(viewNames[id], description)}<div class="placeholder-panel"><h2>${viewNames[id]}</h2><p>${empty}</p></div>`;
}

function render() {
  const id = currentView;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.view === id;
    item.classList.toggle("active", active);
    item.setAttribute("aria-current", active ? "page" : "false");
  });
  pageTitle.textContent = viewNames[id] || "DASHBOARD";
  updateTopBarNotifications();
  content.innerHTML = id === "dashboard" ? renderDashboard()
    : id === "members" ? renderMembers()
    : id === "membership-plans" ? renderPlans()
    : id === "payments" ? renderPayments()
    : id === "expenses" ? renderExpenses()
    : id === "financials" ? renderFinancials()
    : id === "reports" ? renderReports()
    : id === "trainers" ? renderTrainers()
    : id === "notifications" ? renderNotifications()
    : id === "whatsapp" ? renderWhatsApp()
    : id === "attendance" ? `${pageHeader("ATTENDANCE", "Attendance integration is scheduled for the next data module.")}${tableEmpty(["MEMBER ID", "MEMBER", "GENDER", "TIME SLOT", "DATE", "STATUS"], "No attendance records available.")}`
    : renderGeneric(id);
}

function goToView(id, updateHash = true) {
  if (!viewNames[id] || !nav.querySelector(`[data-view="${id}"]`)) id = actor.role === "TRAINER" ? "members" : "dashboard";
  currentView = id;
  if (updateHash && window.location.hash !== `#${id}`) history.pushState({ view: id }, "", `#${id}`);
  render();
  refreshViewData();
  sidebar.classList.remove("is-open");
  scrim.classList.remove("is-visible");
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
}

function selectOptions(list, idKey, labelKey, selected = "", includeInactive = false) {
  const usable = includeInactive ? list : list.filter((item) => item.status === "ACTIVE");
  return `<option value="">Select...</option>${usable.map((item) => `<option value="${escapeHTML(item[idKey] || item.id)}"${selected === (item[idKey] || item.id) ? " selected" : ""}>${escapeHTML(item[labelKey] || item.fullName || item.name || item.id)}</option>`).join("")}`;
}

function field(name, label, type = "text", options = {}) {
  const id = `dialog-${name}`;
  const required = options.required ? "required" : "";
  const common = `${required} ${options.pattern ? `pattern="${options.pattern}"` : ""} ${options.placeholder ? `placeholder="${escapeHTML(options.placeholder)}"` : ""}`;
  let input;
  if (type === "select") input = `<select id="${id}" name="${name}" ${required}>${options.html || "<option value=''>Select...</option>"}</select>`;
  else if (type === "textarea") input = `<textarea id="${id}" name="${name}" ${required} ${options.placeholder ? `placeholder="${escapeHTML(options.placeholder)}"` : ""}>${escapeHTML(options.value || "")}</textarea>`;
  else input = `<input id="${id}" name="${name}" type="${type}" value="${escapeHTML(options.value || "")}" ${common} ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max ? `max="${options.max}"` : ""} ${options.step ? `step="${options.step}"` : ""} ${options.accept ? `accept="${options.accept}"` : ""} ${options.readonly ? "readonly" : ""} />`;
  return `<div class="form-field${options.full ? " full" : ""}"><label for="${id}">${label}${options.required ? " *" : ""}</label>${input}${options.hint ? `<span class="form-hint">${options.hint}</span>` : ""}</div>`;
}

function showDialog(title, intro, fields, submitLabel, data = {}) {
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = "";
  dialogBody.innerHTML = `<h2 id="dialog-title">${escapeHTML(title)}</h2><p class="dialog-intro">${escapeHTML(intro)}</p><form class="form-grid" id="data-form" data-kind="${escapeHTML(data.kind || "")}" data-id="${escapeHTML(data.id || "")}">${fields}<div class="form-error" id="form-error" aria-live="polite"></div><div class="form-actions"><button class="admin-button" type="button" data-close-dialog>CANCEL</button><button class="admin-button primary" type="submit">${escapeHTML(submitLabel)}</button></div></form>`;
  dialog.showModal();
}

function openMemberForm(member = null) {
  const edit = Boolean(member);
  const activePlans = state.plans.filter((plan) => plan.status === "ACTIVE");
  const planId = member?.membershipPlanId || "";
  const selectedPlan = state.plans.find((plan) => plan.id === planId);
  const fields = [
    field("fullName", "Full Name", "text", { required: true, value: member?.fullName }),
    field("fatherName", "Father Name", "text", { required: true, value: member?.fatherName }),
    field("phone", "Phone", "tel", { required: true, value: member?.phone, placeholder: "+92..." }),
    field("cnic", "CNIC", "text", { required: true, value: member?.cnic, pattern: "[0-9]{5}-?[0-9]{7}-?[0-9]", placeholder: "12345-1234567-1" }),
    field("gender", "Gender", "select", { required: true, html: `<option value="">Select gender</option>${["Male", "Female"].map((v) => `<option${member?.gender === v ? " selected" : ""}>${v}</option>`).join("")}` }),
    field("dateOfBirth", "Date of Birth", "date", { required: true, value: inputDate(member?.dateOfBirth) }),
    field("address", "Address", "textarea", { required: true, full: true, value: member?.address }),
    edit ? "" : field("joinDate", "Join Date", "date", { required: true, value: dayStartKey() }),
    edit ? "" : field("planId", "Membership Plan", "select", { required: true, html: selectOptions(activePlans, "planId", "planName") }),
    edit ? "" : field("monthlyFee", "Plan Price", "text", { value: selectedPlan ? money(selectedPlan.price) : "Select a plan", readonly: true, hint: "Price is read from the selected Firestore plan." }),
    field("trainerId", "Trainer", "select", { html: selectOptions(state.trainers, "id", "name", member?.trainerId || "", true) }),
    field("timeSlotId", "Time Slot", "select", { html: selectOptions(state.timeSlots, "id", "name", member?.timeSlotId || "", true) }),
    `<div class="form-field full"><label for="dialog-photo">Profile Photo</label><input id="dialog-photo" name="photo" type="file" accept="image/*" capture="environment" /><span class="form-hint">Images only, up to 5 MB. Uploaded to private member storage.</span><div class="photo-preview-wrap"><img id="photo-preview" alt="Selected profile photo preview"${member?.profilePhotoPath ? ` data-photo-path="${escapeHTML(member.profilePhotoPath)}"` : " hidden"} /><button type="button" class="admin-button small" id="remove-photo"${member?.profilePhotoPath ? "" : " hidden"}>DELETE PHOTO</button></div></div>`
  ].filter(Boolean).join("");
  showDialog(edit ? "EDIT MEMBER" : "ADD MEMBER", edit ? "Member ID and current membership are read-only. Use renewal to change membership." : "Member ID is generated transactionally by Firebase.", fields, edit ? "SAVE CHANGES" : "SAVE MEMBER", { kind: edit ? "edit-member" : "create-member", id: member?.id || "" });
  const imageInput = dialog.querySelector("#dialog-photo");
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      imageInput.value = "";
      toast("Choose an image up to 5 MB.", true);
      return;
    }
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = URL.createObjectURL(file);
    const preview = dialog.querySelector("#photo-preview");
    preview.src = activeObjectUrl;
    preview.hidden = false;
  });
  if (member?.profilePhotoPath) {
    getMemberPhotoObjectUrl(member.profilePhotoPath).then((url) => {
      if (!dialog.open) { URL.revokeObjectURL(url); return; }
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = url;
      const preview = dialog.querySelector("#photo-preview");
      preview.src = url;
      preview.hidden = false;
    }).catch(() => {});
  }
  dialog.querySelector("#remove-photo").addEventListener("click", async () => {
    if (!member?.profilePhotoPath) { imageInput.value = ""; dialog.querySelector("#photo-preview").hidden = true; return; }
    if (!window.confirm("Delete this member profile photo?")) return;
    try { await removeMemberPhoto(member.id); toast("Profile photo deleted."); dialog.close(); }
    catch (error) { toast(error.message, true); }
  });
  const planSelect = dialog.querySelector("[name='planId']");
  planSelect?.addEventListener("change", () => {
    const selected = state.plans.find((plan) => plan.id === planSelect.value);
    dialog.querySelector("[name='monthlyFee']").value = selected ? money(selected.price) : "Select a plan";
  });
}

function openPlanForm(plan = null) {
  const fields = [
    field("planName", "Plan Name", "text", { required: true, value: plan?.planName }),
    field("durationMonths", "Duration (calendar months)", "number", { required: true, min: "1", max: "60", step: "1", value: plan?.durationMonths || "" }),
    field("price", "Price (PKR)", "number", { required: true, min: "0", step: "0.01", value: plan?.price ?? "" }),
    field("status", "Status", "select", { html: ["ACTIVE", "INACTIVE"].map((value) => `<option${(plan?.status || "ACTIVE") === value ? " selected" : ""}>${value}</option>`).join("") }),
    field("description", "Description", "textarea", { full: true, value: plan?.description }),
    field("features", "Features (one per line)", "textarea", { full: true, value: (plan?.features || []).join("\n") })
  ].join("");
  showDialog(plan ? "EDIT MEMBERSHIP PLAN" : "ADD MEMBERSHIP PLAN", "Prices and plan lengths are stored in Firestore and used by membership operations.", fields, plan ? "SAVE PLAN" : "ADD PLAN", { kind: plan ? "edit-plan" : "create-plan", id: plan?.id || "" });
}

function openTrainerForm(trainer = null) {
  const fields = [
    field("name", "Full Name", "text", { required: true, value: trainer?.name }),
    field("phone", "Phone", "tel", { value: trainer?.phone }),
    field("email", "Email", "email", { value: trainer?.email }),
    field("specialization", "Specialization", "text", { value: trainer?.specialization }),
    field("experience", "Experience", "text", { value: trainer?.experience }),
    field("biography", "Biography", "textarea", { full: true, value: trainer?.biography })
  ].join("");
  showDialog(trainer ? "EDIT TRAINER" : "ADD TRAINER", "Trainer login and role assignment are provisioned separately by a SUPER_ADMIN.", fields, trainer ? "SAVE TRAINER" : "ADD TRAINER", { kind: trainer ? "edit-trainer" : "create-trainer", id: trainer?.id || "" });
}

function openPaymentForm(payment = null) {
  const activePlans = state.plans.filter((plan) => plan.status === "ACTIVE");
  const fields = [
    field("memberId", "Member", "select", { required: true, html: selectOptions(payment ? state.members : state.members.filter((member) => statusForMember(member) !== "INACTIVE"), "id", "fullName", payment?.memberId || "", true) }),
    field("amount", "Amount (PKR)", "number", { required: true, min: "0.01", step: "0.01", value: payment?.amount ?? "" }),
    field("paymentDate", "Payment Date", "date", { required: true, value: inputDate(payment?.paymentDate) || dayStartKey() }),
    field("paymentMethod", "Payment Method", "select", { required: true, html: ["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CARD", "OTHER"].map((value) => `<option${payment?.paymentMethod === value ? " selected" : ""}>${value}</option>`).join("") }),
    payment ? field("planName", "Plan", "text", { value: payment.planName, readonly: true }) : field("planId", "Plan", "select", { required: true, html: selectOptions(activePlans, "planId", "planName") }),
    field("transactionId", "Transaction ID", "text", { value: payment?.transactionId, hint: "Required for bank transfer, JazzCash, Easypaisa, and card." }),
    field("status", "Status", "select", { required: true, html: ["SUCCESS", "PENDING", "FAILED"].map((value) => `<option${(payment?.status || "SUCCESS") === value ? " selected" : ""}>${value}</option>`).join("") })
  ].join("");
  showDialog(payment ? "EDIT PAYMENT" : "RECORD PAYMENT", "A receipt number is assigned transactionally. Existing payment identity and receipt are preserved.", fields, payment ? "SAVE PAYMENT" : "RECORD PAYMENT", { kind: payment ? "edit-payment" : "create-payment", id: payment?.id || "" });
  dialog.querySelector("[name='planId']")?.addEventListener("change", () => {
    const plan = state.plans.find((item) => item.id === dialog.querySelector("[name='planId']").value);
    if (plan && !dialog.querySelector("[name='amount']").value) dialog.querySelector("[name='amount']").value = plan.price;
  });
}

function addCalendarMonths(date, months) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

function openRenewForm(member = null) {
  const fields = [
    field("memberId", "Member", "select", { required: true, html: selectOptions(state.members, "id", "fullName", member?.id || "", true) }),
    field("planId", "Plan", "select", { required: true, html: selectOptions(state.plans, "planId", "planName") }),
    field("price", "Plan Price", "text", { readonly: true, value: "Select a plan" }),
    `<div class="form-field full renewal-preview" id="renewal-preview"><span class="form-hint">Select a member and plan to preview the new membership dates.</span></div>`
  ].join("");
  showDialog("RENEW MEMBERSHIP", "Renewal extends from the current expiry while active, otherwise from today. Duration uses calendar months.", fields, "RENEW MEMBERSHIP", { kind: "renew-membership" });
  const memberSelect = dialog.querySelector("[name='memberId']");
  const planSelect = dialog.querySelector("[name='planId']");
  const updatePreview = () => {
    const selectedMember = state.members.find((item) => item.id === memberSelect.value);
    const selectedPlan = state.plans.find((item) => item.id === planSelect.value);
    dialog.querySelector("[name='price']").value = selectedPlan ? money(selectedPlan.price) : "Select a plan";
    if (!selectedMember || !selectedPlan) return;
    const expiry = toDate(selectedMember.membershipExpiryDate);
    const today = new Date(`${dayStartKey()}T00:00:00Z`);
    const start = expiry && dateKey(expiry) >= dayStartKey() ? expiry : today;
    const nextExpiry = addCalendarMonths(start, selectedPlan.durationMonths);
    dialog.querySelector("#renewal-preview").innerHTML = `<span>Current expiry: <strong>${dateText(selectedMember.membershipExpiryDate)}</strong></span><span>New start: <strong>${dateText(start)}</strong></span><span>New expiry: <strong>${dateText(nextExpiry)}</strong></span>`;
  };
  memberSelect.addEventListener("change", updatePreview);
  planSelect.addEventListener("change", updatePreview);
  updatePreview();
}

function updateTopBarNotifications() {
  const unreadCount = state.notifications.filter((n) => n.status !== "READ").length;
  const badge = document.querySelector("#admin-unread-badge");
  const countLabel = document.querySelector("#notif-dropdown-count");
  const dropdownList = document.querySelector("#notif-dropdown-list");

  if (badge) {
    badge.textContent = String(unreadCount);
    badge.hidden = unreadCount === 0;
  }
  if (countLabel) {
    countLabel.textContent = `${unreadCount} UNREAD`;
  }

  if (dropdownList) {
    const recents = state.notifications.slice(0, 5);
    if (!recents.length) {
      dropdownList.innerHTML = `<p class="empty-note">No notifications yet.</p>`;
    } else {
      dropdownList.innerHTML = recents.map((notif) => {
        const isUnread = notif.status !== "READ";
        const priority = notif.priority || "NORMAL";
        return `
          <div class="dropdown-notif-item ${isUnread ? "unread" : "read"}" data-notif-id="${escapeHTML(notif.id || notif.notificationId)}">
            <div class="dropdown-notif-top">
              <span class="dropdown-notif-title">${escapeHTML(notif.title)}</span>
              <span class="priority-pill small priority-${escapeHTML(priority.toLowerCase())}">${escapeHTML(priority)}</span>
            </div>
            <p class="dropdown-notif-msg">${escapeHTML(notif.message)}</p>
            <span class="dropdown-notif-time">${dateTimeText(notif.createdAt)}</span>
          </div>
        `;
      }).join("");
    }
  }
}

function openReceipt(receipt) {
  activeReceipt = receipt;
  dialogBody.innerHTML = `${receiptMarkup(receipt)}<div class="receipt-actions"><button class="admin-button" type="button" data-receipt-action="print">PRINT</button><button class="admin-button" type="button" data-receipt-action="pdf">PDF</button><button class="admin-button primary whatsapp" type="button" data-receipt-action="whatsapp">💬 SEND ON WHATSAPP</button></div>`;
  dialog.showModal();
  dialog.dataset.receiptId = receipt.receiptId;
}

function openProfile(memberId) {
  dialogBody.innerHTML = `<h2 id="dialog-title">MEMBER PROFILE</h2><p class="dialog-intro">Loading member record...</p>`;
  dialog.showModal();
  getMemberDetails(memberId).then(({ member, payments }) => {
    const details = [
      ["Member ID", member.id], ["Full Name", member.fullName], ["Father Name", member.fatherName], ["Phone", member.phone],
      ["CNIC", member.cnic], ["Gender", member.gender], ["Date of Birth", dateText(member.dateOfBirth)], ["Address", member.address],
      ["Join Date", dateText(member.joinDate)], ["Plan", member.membershipPlanName], ["Membership Start", dateText(member.membershipStartDate)],
      ["Membership Expiry", dateText(member.membershipExpiryDate)], ["Monthly Fee", money(member.monthlyFee)], ["Trainer", member.trainerName],
      ["Time Slot", member.timeSlotName], ["Status", expiryLabel(member)], ["Payment Status", feeStatusForMember(member)]
    ];
    dialogBody.innerHTML = `
      <h2 id="dialog-title">${escapeHTML(member.fullName)}</h2>
      <p class="dialog-intro">${escapeHTML(member.id)}</p>
      <div class="profile-detail-grid">
        ${details.map(([label, value]) => `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || "—")}</strong></div>`).join("")}
      </div>
      <div class="section-title-row" style="margin-top:22px"><h3 class="section-title">PAYMENT HISTORY</h3></div>
      ${payments.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>RECEIPT ID</th><th>DATE</th><th>PLAN</th><th>AMOUNT</th><th>METHOD</th><th>TRANSACTION ID</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${payments.map((payment) => `<tr><td>${escapeHTML(payment.receiptId)}</td><td>${dateText(payment.paymentDate)}</td><td>${escapeHTML(payment.planName)}</td><td>${money(payment.amount)}</td><td>${escapeHTML(payment.paymentMethod)}</td><td>${escapeHTML(payment.transactionId || "—")}</td><td>${statusMarkup(payment.status)}</td><td><button class="admin-button small" data-action="view-receipt" data-id="${escapeHTML(payment.receiptId)}">VIEW RECEIPT</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-note">No payments found.</div>`}
      <div class="form-actions" style="margin-top:16px">
        <button class="admin-button whatsapp" data-action="open-whatsapp-modal" data-member-id="${escapeHTML(member.id)}" type="button">💬 WHATSAPP MEMBER</button>
        <button class="admin-button" data-close-dialog type="button">CLOSE</button>
      </div>
    `;
    if (member.profilePhotoPath) getMemberPhotoObjectUrl(member.profilePhotoPath).then((url) => {
      const image = document.createElement("img"); image.className = "profile-photo-large"; image.alt = `${member.fullName} profile photo`; image.src = url; image.onload = () => URL.revokeObjectURL(url); image.onerror = () => URL.revokeObjectURL(url); dialogBody.prepend(image);
    }).catch(() => {});
  }).catch((error) => { dialogBody.innerHTML = `<h2 id="dialog-title">MEMBER PROFILE</h2><p class="dialog-intro">${escapeHTML(error.message)}</p>`; });
}

function openCreateNotificationForm() {
  const fields = [
    field("recipientMemberId", "Recipient Member", "select", { required: true, html: selectOptions(state.members, "id", "fullName") }),
    field("type", "Notification Type", "select", {
      required: true,
      html: [
        ["GENERAL", "General Message"],
        ["MEMBERSHIP_EXPIRY", "Membership Expiry Reminder"],
        ["MEMBERSHIP_EXPIRED", "Membership Expired Notice"],
        ["PAYMENT_REMINDER", "Payment Reminder"],
        ["PAYMENT_SUCCESS", "Payment Successful"],
        ["ATTENDANCE", "Attendance Update"],
        ["WORKOUT", "Workout Plan Update"],
        ["DIET", "Diet Plan Update"],
        ["PROGRESS", "Progress Update"],
        ["SYSTEM", "System Alert"]
      ].map(([val, label]) => `<option value="${val}">${label}</option>`).join("")
    }),
    field("priority", "Priority", "select", {
      required: true,
      html: ["NORMAL", "LOW", "HIGH", "URGENT"].map((p) => `<option value="${p}">${p}</option>`).join("")
    }),
    field("title", "Notification Title", "text", { required: true, placeholder: "e.g. Membership renewal notice" }),
    field("message", "Message Body", "textarea", { required: true, full: true, placeholder: "Enter notification text for the member..." })
  ].join("");

  showDialog("CREATE NOTIFICATION", "Compose a real Firestore notification delivered to the member's portal and administrative logs.", fields, "SEND NOTIFICATION", { kind: "create-notification" });
}

async function openNotificationSettingsForm() {
  let settings = state.notificationSettings;
  if (!settings) {
    try {
      settings = await getNotificationSettings();
      state.notificationSettings = settings;
    } catch {
      settings = { reminderDays: [30, 15, 7, 3, 1, 0], enabledTypes: { membership: true, payment: true, attendance: true, workout: true, diet: true, progress: true, system: true } };
    }
  }

  const days = settings.reminderDays || [30, 15, 7, 3, 1, 0];
  const types = settings.enabledTypes || {};

  const allReminderDays = [30, 15, 7, 3, 1, 0];
  const allTypes = [
    ["membership", "Membership Expiry Reminders (30, 15, 7, 3, 1, 0 days)"],
    ["payment", "Payment Received, Due & Refund Notifications"],
    ["attendance", "Daily Attendance Check-in Notifications"],
    ["workout", "Workout Plan Assignments & Updates"],
    ["diet", "Diet & Nutrition Plan Updates"],
    ["progress", "Fitness Progress Updates"],
    ["system", "System & Administrative Alerts"]
  ];

  const fields = `
    <div class="form-field full">
      <label>Membership Expiry Reminder Thresholds</label>
      <div class="checkbox-group">
        ${allReminderDays.map((d) => `
          <label class="checkbox-label">
            <input type="checkbox" name="reminderDay_${d}" value="${d}" ${days.includes(d) ? "checked" : ""} />
            <span>${d === 0 ? "On Expiry Day (0 days)" : `${d} days before expiry`}</span>
          </label>
        `).join("")}
      </div>
      <span class="form-hint">Evaluated when running automated or scheduled membership expiry checks.</span>
    </div>
    <div class="form-field full" style="margin-top:14px;">
      <label>Enabled Notification Channels</label>
      <div class="checkbox-group">
        ${allTypes.map(([key, label]) => `
          <label class="checkbox-label">
            <input type="checkbox" name="enabledType_${key}" value="true" ${types[key] !== false ? "checked" : ""} />
            <span>${escapeHTML(label)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;

  showDialog("NOTIFICATION SETTINGS", "Configure membership reminder intervals and active notification categories.", fields, "SAVE SETTINGS", { kind: "notification-settings" });
}

function openWhatsAppComposer(member, defaultTemplateKey = "GENERAL", extraContext = {}) {
  const norm = normalizePhoneNumber(member?.phone);
  const templates = DEFAULT_WHATSAPP_TEMPLATES;

  const variables = {
    memberName: member.fullName || "Member",
    memberId: member.id || "—",
    planName: member.membershipPlanName || "Standard Plan",
    expiryDate: dateText(member.membershipExpiryDate),
    amount: money(member.monthlyFee || 0),
    receiptId: extraContext.receiptId || "—",
    trainerName: member.trainerName || "Gym Trainer",
    timeSlot: member.timeSlotName || "General Slot",
    date: dateText(new Date()),
    paymentDate: extraContext.paymentDate || dateText(new Date()),
    attendanceStatus: extraContext.attendanceStatus || "Present",
    workoutPlanName: extraContext.workoutPlanName || "Workout Program",
    dietPlanName: extraContext.dietPlanName || "Nutrition Plan",
    startDate: extraContext.startDate || dateText(new Date()),
    endDate: extraContext.endDate || dateText(member.membershipExpiryDate),
    customMessage: "",
    ...extraContext
  };

  const initialTemplate = templates[defaultTemplateKey] ? defaultTemplateKey : "GENERAL";
  const initialMessage = renderWhatsAppMessage(templates[initialTemplate]?.template || "", variables);

  const fields = `
    <div class="form-field full">
      <label>Recipient Member</label>
      <div class="whatsapp-recipient-box">
        <strong>${escapeHTML(member.fullName)} (${escapeHTML(member.id)})</strong>
        ${norm.valid
          ? `<span class="phone-badge success">WhatsApp: ${escapeHTML(norm.display)}</span>`
          : `<span class="phone-badge danger">⚠️ WhatsApp number is not available</span>`}
      </div>
    </div>
    <div class="form-field full">
      <label for="dialog-template">Message Template</label>
      <select id="dialog-template" name="template">
        ${Object.values(templates).map((t) => `<option value="${escapeHTML(t.id)}"${t.id === initialTemplate ? " selected" : ""}>[${escapeHTML(t.category)}] ${escapeHTML(t.title)}</option>`).join("")}
      </select>
    </div>
    <div class="form-field full">
      <label for="dialog-message">Message Content (Editable)</label>
      <textarea id="dialog-message" name="message" rows="9" required>${escapeHTML(initialMessage)}</textarea>
      <span class="form-hint">TALHA GOLD GYM signature and address are included. Clicking 'Open in WhatsApp' launches WhatsApp chat. You must manually press Send.</span>
    </div>
  `;

  showDialog("SEND WHATSAPP MESSAGE", "Clicking 'Open in WhatsApp' opens WhatsApp with the message pre-filled. No fake auto-sending.", fields, "OPEN IN WHATSAPP", {
    kind: "send-whatsapp",
    id: member.id,
    phone: member.phone || ""
  });

  const templateSelect = dialog.querySelector("#dialog-template");
  const messageArea = dialog.querySelector("#dialog-message");

  templateSelect?.addEventListener("change", () => {
    const chosen = templateSelect.value;
    const tpl = templates[chosen];
    if (tpl) {
      messageArea.value = renderWhatsAppMessage(tpl.template, variables);
    }
  });
}

function valuesFromForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function submitDataForm(form) {
  if (!form.reportValidity()) return;
  const kind = form.dataset.kind;
  const values = valuesFromForm(form);
  const errorNode = form.querySelector("#form-error");
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  errorNode.textContent = "";
  try {
    if (kind === "create-member") {
      const photo = form.querySelector("[name='photo']").files[0] || null;
      const trainer = state.trainers.find((item) => item.id === values.trainerId);
      const timeSlot = state.timeSlots.find((item) => item.id === values.timeSlotId);
      const result = await createMember({
        fullName: values.fullName, fatherName: values.fatherName, phone: values.phone, cnic: values.cnic,
        gender: values.gender, dateOfBirth: values.dateOfBirth, address: values.address, joinDate: values.joinDate,
        planId: values.planId, trainerId: values.trainerId || "", trainerName: trainer?.name || "",
        trainerUid: trainer?.authUid || "", timeSlotId: values.timeSlotId || "", timeSlotName: timeSlot?.name || ""
      }, photo);
      toast(result.photoError ? `Member ${result.memberId} created, but photo upload failed: ${result.photoError}` : `Member ${result.memberId} created.` , Boolean(result.photoError));
    } else if (kind === "edit-member") {
      const trainer = state.trainers.find((item) => item.id === values.trainerId);
      const timeSlot = state.timeSlots.find((item) => item.id === values.timeSlotId);
      await updateMember({ memberId: form.dataset.id, fullName: values.fullName, fatherName: values.fatherName, phone: values.phone, cnic: values.cnic, gender: values.gender, dateOfBirth: values.dateOfBirth, address: values.address, trainerId: values.trainerId || "", trainerName: trainer?.name || "", trainerUid: trainer?.authUid || "", timeSlotId: values.timeSlotId || "", timeSlotName: timeSlot?.name || "" });
      const photo = form.querySelector("[name='photo']").files[0];
      if (photo) await saveMemberPhoto(form.dataset.id, photo, true);
      toast("Member profile updated.");
    } else if (kind === "create-plan") {
      await createMembershipPlan({ planName: values.planName, durationMonths: values.durationMonths, price: values.price, status: values.status, description: values.description, features: values.features.split("\n").map((item) => item.trim()).filter(Boolean) });
      toast("Membership plan added.");
    } else if (kind === "edit-plan") {
      await updateMembershipPlan({ planId: form.dataset.id, planName: values.planName, durationMonths: values.durationMonths, price: values.price, status: values.status, description: values.description, features: values.features.split("\n").map((item) => item.trim()).filter(Boolean) });
      toast("Membership plan updated.");
    } else if (kind === "create-trainer") {
      await createTrainer({ name: values.name, phone: values.phone, email: values.email, specialization: values.specialization, experience: values.experience, biography: values.biography });
      toast("Trainer profile added.");
    } else if (kind === "edit-trainer") {
      await updateTrainer({ trainerId: form.dataset.id, name: values.name, phone: values.phone, email: values.email, specialization: values.specialization, experience: values.experience, biography: values.biography });
      toast("Trainer profile updated.");
    } else if (kind === "create-expense") {
      const receipt = form.querySelector("[name='receipt']").files[0] || null;
      const result = await createExpense({ title: values.title, category: values.category, amount: values.amount, expenseDate: values.expenseDate, paymentMethod: values.paymentMethod, description: values.description }, receipt);
      toast(result.receiptError ? `Expense ${result.expenseId} saved; receipt upload failed: ${result.receiptError}` : "Expense recorded.", Boolean(result.receiptError));
      loadExpensePage(true);
    } else if (kind === "edit-expense") {
      await updateExpense({ expenseId: form.dataset.id, title: values.title, category: values.category, amount: values.amount, expenseDate: values.expenseDate, paymentMethod: values.paymentMethod, description: values.description });
      const receipt = form.querySelector("[name='receipt']").files[0];
      if (receipt) await uploadExpenseReceipt(form.dataset.id, receipt);
      toast("Expense updated.");
      loadExpensePage(true);
    } else if (kind === "delete-expense") {
      await deleteExpense(form.dataset.id);
      toast("Expense and attached receipt deleted. Totals will refresh.");
      loadExpensePage(true);
    } else if (kind === "create-payment") {
      const result = await createPayment({ memberId: values.memberId, amount: values.amount, paymentDate: values.paymentDate, paymentMethod: values.paymentMethod, planId: values.planId, transactionId: values.transactionId, status: values.status });
      toast(`Payment recorded. Receipt ${result.receiptId} generated.`);
    } else if (kind === "edit-payment") {
      await updatePayment({ paymentId: form.dataset.id, amount: values.amount, paymentDate: values.paymentDate, paymentMethod: values.paymentMethod, transactionId: values.transactionId, status: values.status });
      toast("Payment updated and activity logged.");
    } else if (kind === "renew-membership") {
      const result = await renewMembership({ memberId: values.memberId, planId: values.planId });
      toast(`Membership renewed through ${result.expiryDate}. Record marked ${"DUE"} until a successful payment is recorded.`);
    } else if (kind === "create-notification") {
      await createNotification({
        recipientMemberId: values.recipientMemberId,
        type: values.type,
        priority: values.priority,
        title: values.title,
        message: values.message
      });
      toast("Notification sent to member and logged.");
    } else if (kind === "notification-settings") {
      const reminderDays = [30, 15, 7, 3, 1, 0].filter((d) => form.querySelector(`[name='reminderDay_${d}']`)?.checked);
      const enabledTypes = {
        membership: Boolean(form.querySelector("[name='enabledType_membership']")?.checked),
        payment: Boolean(form.querySelector("[name='enabledType_payment']")?.checked),
        attendance: Boolean(form.querySelector("[name='enabledType_attendance']")?.checked),
        workout: Boolean(form.querySelector("[name='enabledType_workout']")?.checked),
        diet: Boolean(form.querySelector("[name='enabledType_diet']")?.checked),
        progress: Boolean(form.querySelector("[name='enabledType_progress']")?.checked),
        system: Boolean(form.querySelector("[name='enabledType_system']")?.checked)
      };
      await updateNotificationSettings({ reminderDays, enabledTypes });
      state.notificationSettings = { reminderDays, enabledTypes };
      toast("Notification settings updated.");
    } else if (kind === "send-whatsapp") {
      const member = state.members.find((m) => m.id === form.dataset.id) || { id: form.dataset.id, phone: form.dataset.phone || "" };
      const message = values.message;
      const success = openWhatsAppMessage(member.phone, message);
      if (success) {
        logWhatsAppActivity({ memberId: member.id, templateId: values.template || "CUSTOM", phone: member.phone }).catch(() => {});
        toast("WhatsApp chat opened with pre-filled message.");
      }
    }
    dialog.close();
  } catch (error) {
    errorNode.textContent = error.message || "The operation could not be completed.";
  } finally {
    submitButton.disabled = false;
  }
}

function downloadCsv() {
  const rows = filteredMembers();
  if (!rows.length) { toast("No members to export."); return; }
  const columns = ["id", "fullName", "gender", "phone", "cnic", "membershipPlanName", "joinDate", "membershipExpiryDate", "status"];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [columns.join(","), ...rows.map((member) => columns.map((key) => quote(["joinDate", "membershipExpiryDate"].includes(key) ? dateText(member[key]) : key === "status" ? statusForMember(member) : member[key])).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "talha-gold-gym-members.csv"; link.click(); URL.revokeObjectURL(url);
}

function printOrPdf(action, receipt) {
  if (action === "print") openReceiptPrint(receipt);
  if (action === "pdf") {
    try { downloadReceiptPdf(receipt); }
    catch (error) { toast(error.message, true); }
  }
  if (action === "whatsapp") shareReceiptOnWhatsApp(receipt);
}

async function fetchAllReportRows(report, filters) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 500; page += 1) {
    const result = await getFinancialReportPage(report, filters, cursor, 100);
    rows.push(...result.rows);
    if (!result.hasMore) return report === "revenue" ? sortReportRows(rows, filters.sort) : rows;
    cursor = result.nextCursor;
  }
  throw new Error("Export exceeded 50,000 rows. Narrow the date range and try again.");
}

function sortReportRows(rows, sort = "DATE_DESC") {
  return [...rows].sort((left, right) => {
    if (sort === "DATE_ASC" || sort === "DATE_DESC") {
      const delta = (toDate(left.paymentDate)?.getTime() || 0) - (toDate(right.paymentDate)?.getTime() || 0);
      return sort === "DATE_ASC" ? delta : -delta;
    }
    if (sort === "AMOUNT_ASC") return Number(left.amount) - Number(right.amount);
    if (sort === "AMOUNT_DESC") return Number(right.amount) - Number(left.amount);
    if (sort === "MEMBER_ASC") return String(left.memberName || "").localeCompare(String(right.memberName || ""));
    return 0;
  });
}

function exportColumns(report, rows) {
  if (report === "revenue") return [
    ["Receipt ID", (row) => row.receiptId], ["Member ID", (row) => row.memberId], ["Member Name", (row) => row.memberName],
    ["Plan", (row) => row.planName], ["Amount (PKR)", (row) => row.amount], ["Payment Method", (row) => row.paymentMethod],
    ["Payment Date", (row) => dateText(row.paymentDate)], ["Status", (row) => row.status]
  ];
  if (report === "expenses") return [
    ["Expense ID", (row) => row.id], ["Title", (row) => row.title], ["Category", (row) => row.category],
    ["Amount (PKR)", (row) => row.amount], ["Date", (row) => dateText(row.expenseDate)],
    ["Payment Method", (row) => row.paymentMethod], ["Added By", (row) => row.addedByName || row.addedBy]
  ];
  if (report === "attendance") return [
    ["Member ID", (row) => row.memberId], ["Name", (row) => row.memberName], ["Total Days", (row) => row.totalDays],
    ["Present", (row) => row.present], ["Absent", (row) => row.absent], ["Attendance %", (row) => Number(row.attendancePercentage || 0).toFixed(1)]
  ];
  if (report === "membership-fees" || report === "expiring") return [
    ["Member ID", (row) => row.id], ["Name", (row) => row.fullName], ["Plan", (row) => row.membershipPlanName],
    ["Start Date", (row) => dateText(row.membershipStartDate)], ["Expiry Date", (row) => dateText(row.membershipExpiryDate)],
    ["Fee (PKR)", (row) => row.monthlyFee], ["Status", (row) => statusForMember(row)], ["Trainer", (row) => row.trainerName], ["Time Slot", (row) => row.timeSlotName]
  ];
  if (report === "trainers") return [
    ["Trainer", (row) => row.name], ["Assigned Members", (row) => row.assignedMembers], ["Active Members", (row) => row.activeMembers],
    ["Workout Plans", (row) => row.workoutPlans], ["Diet Plans", (row) => row.dietPlans], ["Attendance Activity", (row) => row.attendanceActivity]
  ];
  return [["Metric", (row) => row.metric], ["Amount (PKR)", (row) => row.amount]];
}

async function exportReport() {
  const report = currentReport;
  try {
    let rows;
    if (report === "profit-loss") {
      await ensureFinancialData();
      if (!financialSummary || financialSummary.error) throw new Error("Financial data is not available to export.");
      rows = [
        { metric: "Successful Payments", amount: financialSummary.totalRevenue },
        ...(financialSummary.expenseCategories || []).map((item) => ({ metric: `Expense: ${item.category}`, amount: item.amount })),
        { metric: "Total Expenses", amount: financialSummary.totalExpenses },
        { metric: "Net Profit", amount: financialSummary.netProfit },
        { metric: "Profit Margin (%)", amount: financialSummary.profitMargin }
      ];
    } else rows = await fetchAllReportRows(report, reportFilters);
    if (!rows.length) { toast("No filtered records to export."); return; }
    const columns = exportColumns(report, rows);
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [columns.map(([label]) => quote(label)).join(","), ...rows.map((row) => columns.map(([, value]) => quote(value(row))).join(","))].join("\r\n");
    await recordReportExport(report);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `talha-gold-gym-${report}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Filtered report exported as CSV.");
  } catch (error) { toast(error.message || "Could not export report.", true); }
}

async function printReport() {
  try {
    let rows;
    let columns;
    if (currentReport === "profit-loss") {
      await ensureFinancialData();
      if (!financialSummary || financialSummary.error) throw new Error("Financial data is not available to print.");
      rows = [
        { metric: "Successful Payments", amount: money(financialSummary.totalRevenue) },
        ...(financialSummary.expenseCategories || []).map((item) => ({ metric: `Expense: ${item.category}`, amount: money(item.amount) })),
        { metric: "Total Expenses", amount: money(financialSummary.totalExpenses) },
        { metric: "Net Profit", amount: money(financialSummary.netProfit) },
        { metric: "Profit Margin", amount: `${Number(financialSummary.profitMargin).toFixed(1)}%` }
      ];
      columns = [["Metric", (row) => row.metric], ["Value", (row) => row.amount]];
    } else {
      rows = await fetchAllReportRows(currentReport, reportFilters);
      columns = exportColumns(currentReport, rows);
    }
    if (!rows.length) { toast("No filtered records to print."); return; }
    await recordReportExport(currentReport);
    const esc = (value) => escapeHTML(value);
    const table = `<table><thead><tr>${columns.map(([label]) => `<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map(([, value]) => `<td>${esc(value(row))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const printWindow = window.open("", "_blank");
    if (!printWindow) throw new Error("Allow pop-ups to print this report.");
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(reportLabels[currentReport])}</title><style>body{font:12px Arial,sans-serif;color:#111;padding:24px}h1{font-size:20px;border-bottom:2px solid #d4af37;padding-bottom:10px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ccc;text-align:left}th{background:#eee}@media print{body{padding:0}}</style></head><body><h1>TALHA GOLD GYM · ${escapeHTML(reportLabels[currentReport])}</h1><p>Generated ${escapeHTML(dateText(new Date()))}</p>${table}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => printWindow.print();
  } catch (error) { toast(error.message || "Could not print report.", true); }
}

content.addEventListener("click", async (event) => {
  const reportTab = event.target.closest("[data-report-tab]");
  if (reportTab) {
    currentReport = reportTab.dataset.reportTab;
    reportFilters = {};
    reportRows = [];
    reportCursor = null;
    reportTotals = {};
    reportError = "";
    render();
    if (currentReport === "profit-loss") ensureFinancialData();
    else loadReportPage(true);
    return;
  }
  const notifTab = event.target.closest("[data-notif-tab]");
  if (notifTab) {
    notificationFilter = notifTab.dataset.notifTab;
    render();
    return;
  }
  const whatsappTab = event.target.closest("[data-whatsapp-tab]");
  if (whatsappTab) {
    whatsappFilter = whatsappTab.dataset.whatsappTab;
    render();
    return;
  }
  const preset = event.target.closest("[data-finance-preset]");
  if (preset) {
    financeRange = preset.dataset.financePreset === "custom" ? { ...financeRange, preset: "custom" } : datePresetRange(preset.dataset.financePreset);
    financialSummaryKey = "";
    render();
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { goToView(viewButton.dataset.view); return; }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  const id = actionButton.dataset.id;
  try {
    if (action === "add-member") openMemberForm();
    else if (action === "add-expense") openExpenseForm();
    else if (action === "view-expense") { const expense = expenseRows.find((item) => item.id === id); if (expense) openExpenseDetails(expense); }
    else if (action === "view-expense-receipt") { const expense = expenseRows.find((item) => item.id === id); if (expense) await openExpenseReceipt(expense); }
    else if (action === "edit-expense") { const expense = expenseRows.find((item) => item.id === id); if (expense) openExpenseForm(expense); }
    else if (action === "delete-expense") { const expense = expenseRows.find((item) => item.id === id); if (expense) confirmExpenseDelete(expense); }
    else if (action === "remove-expense-receipt") {
      await removeExpenseReceipt(id);
      toast("Expense receipt removed.");
      dialog.close();
      loadExpensePage(true);
    }
    else if (action === "more-expenses") loadExpensePage(false);
    else if (action === "more-report") loadReportPage(false);
    else if (action === "export-report") await exportReport();
    else if (action === "print-report") await printReport();
    else if (action === "add-payment") openPaymentForm();
    else if (action === "add-plan") openPlanForm();
    else if (action === "add-trainer") openTrainerForm();
    else if (action === "renew-membership") openRenewForm();
    else if (action === "toggle-filters") { memberFilters.open = !memberFilters.open; render(); }
    else if (action === "export-members") downloadCsv();
    else if (action === "view-member") openProfile(id);
    else if (action === "edit-member") { const member = state.members.find((item) => item.id === id); if (member) openMemberForm(member); }
    else if (action === "renew-member") { const member = state.members.find((item) => item.id === id); openRenewForm(member); }
    else if (action === "deactivate-member" && window.confirm("ARE YOU SURE? This member will be marked INACTIVE. Payment and membership history will be retained.")) {
      await deactivateMember(id); toast("Member deactivated. Financial history retained.");
    } else if (action === "edit-plan") { const plan = state.plans.find((item) => item.id === id); if (plan) openPlanForm(plan); }
    else if (action === "edit-trainer") { const trainer = state.trainers.find((item) => item.id === id); if (trainer) openTrainerForm(trainer); }
    else if (action === "deactivate-trainer" && window.confirm("DEACTIVATE TRAINER? Existing member and financial history will be retained.")) { await deactivateTrainer(id); toast("Trainer profile deactivated."); }
    else if (action === "toggle-plan") { await updateMembershipPlan({ planId: id, status: actionButton.dataset.status }); toast(`Plan ${actionButton.dataset.status.toLowerCase()}.`); }
    else if (action === "delete-plan" && window.confirm("ARE YOU SURE? This permanently deletes the plan if no membership history refers to it.")) { await deleteMembershipPlan(id); toast("Membership plan deleted."); }
    else if (action === "edit-payment") { const payment = state.payments.find((item) => item.id === id); if (payment) openPaymentForm(payment); }
    else if (action === "refund-payment" && window.confirm("REFUND PAYMENT? The original payment will be retained and marked REFUNDED. Revenue and fee status will be recalculated.")) { await refundPayment(id); toast("Payment refunded. Original transaction and receipt retained."); }
    else if (action === "view-receipt") { const receipt = await getReceipt(id); openReceipt(receipt); }
    else if (action === "run-expiry-check") {
      actionButton.disabled = true;
      try {
        const res = await checkMembershipExpiryNotifications();
        toast(res.createdCount > 0 ? `Notification check complete: ${res.createdCount} reminder(s) generated.` : "Notification check complete. All member statuses up to date.");
        render();
      } finally {
        actionButton.disabled = false;
      }
    }
    else if (action === "open-notification-settings") await openNotificationSettingsForm();
    else if (action === "create-notification") openCreateNotificationForm();
    else if (action === "mark-all-read") {
      await markAllNotificationsRead();
      state.notifications.forEach((n) => { n.status = "READ"; });
      updateTopBarNotifications();
      render();
      toast("All notifications marked as read.");
    }
    else if (action === "mark-read") {
      await markNotificationRead(id);
      const target = state.notifications.find((n) => (n.id || n.notificationId) === id);
      if (target) target.status = "READ";
      updateTopBarNotifications();
      render();
      toast("Notification marked as read.");
    }
    else if (action === "mark-unread") {
      await markNotificationUnread(id);
      const target = state.notifications.find((n) => (n.id || n.notificationId) === id);
      if (target) target.status = "UNREAD";
      updateTopBarNotifications();
      render();
      toast("Notification marked as unread.");
    }
    else if (action === "delete-notification" && window.confirm("DELETE NOTIFICATION? This notification will be removed permanently.")) {
      await deleteNotification(id);
      state.notifications = state.notifications.filter((n) => (n.id || n.notificationId) !== id);
      updateTopBarNotifications();
      render();
      toast("Notification deleted.");
    }
    else if (action === "open-whatsapp-modal") {
      const memberId = actionButton.dataset.memberId;
      const tpl = actionButton.dataset.template || "GENERAL";
      let member = state.members.find((m) => m.id === memberId);
      if (!member && memberId) {
        try {
          const res = await getMemberDetails(memberId);
          member = res.member;
        } catch { }
      }
      if (member) openWhatsAppComposer(member, tpl);
      else toast("Member details could not be found.", true);
    }
  } catch (error) { toast(error.message || "Could not complete the action.", true); }
});

content.addEventListener("submit", (event) => {
  if (event.target.id === "finance-range-form") {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    financeRange = { preset: "custom", from: values.from, to: values.to };
    financialSummaryKey = "";
    render();
    return;
  }
  if (event.target.id === "report-filter-form") {
    event.preventDefault();
    reportFilters = Object.fromEntries(new FormData(event.target).entries());
    reportRows = [];
    reportCursor = null;
    reportTotals = {};
    loadReportPage(true);
    return;
  }
  if (event.target.id === "expense-filter-form") {
    event.preventDefault();
    reportFilters = Object.fromEntries(new FormData(event.target).entries());
    loadExpensePage(true);
  }
});

content.addEventListener("input", (event) => {
  if (event.target.id === "whatsapp-search") {
    whatsappSearch = event.target.value;
    const caret = event.target.selectionStart;
    render();
    const input = content.querySelector("#whatsapp-search");
    input?.focus();
    input?.setSelectionRange(caret, caret);
    return;
  }
  if (event.target.id !== "member-search") return;
  memberSearch = event.target.value;
  memberSearchResults = null;
  window.clearTimeout(searchTimer);
  const caret = event.target.selectionStart;
  searchTimer = window.setTimeout(async () => {
    if (memberSearch.trim()) {
      try {
        const result = await searchMembers(memberSearch.trim());
        memberSearchResults = result;
      } catch (error) { toast(error.message, true); }
    }
    render();
    const input = content.querySelector("#member-search");
    input?.focus();
    input?.setSelectionRange(caret, caret);
  }, 350);
});

content.addEventListener("change", (event) => {
  const filter = event.target.dataset.memberFilter;
  if (filter) { memberFilters[filter] = event.target.value; render(); }
  if (event.target.matches("[data-payment-status], [data-payment-method], [data-payment-date]")) {
    paymentFilters = {
      date: content.querySelector("[data-payment-date]").value,
      status: content.querySelector("[data-payment-status]").value,
      method: content.querySelector("[data-payment-method]").value
    };
    render();
  }
});

dialog.addEventListener("submit", (event) => {
  if (!event.target.matches("#data-form")) return;
  event.preventDefault();
  submitDataForm(event.target);
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog || event.target.closest("[data-close-dialog]")) dialog.close();
  const expenseAction = event.target.closest("[data-action='view-expense-receipt'], [data-action='remove-expense-receipt']");
  if (expenseAction) {
    const expense = expenseRows.find((item) => item.id === expenseAction.dataset.id);
    if (!expense) return;
    if (expenseAction.dataset.action === "view-expense-receipt") openExpenseReceipt(expense);
    else if (window.confirm("Remove the receipt attachment from this expense?")) {
      removeExpenseReceipt(expense.id).then(() => { toast("Expense receipt removed."); dialog.close(); loadExpensePage(true); }).catch((error) => toast(error.message, true));
    }
    return;
  }
  const whatsappAction = event.target.closest("[data-action='open-whatsapp-modal']");
  if (whatsappAction) {
    const memberId = whatsappAction.dataset.memberId;
    const tpl = whatsappAction.dataset.template || "GENERAL";
    let member = state.members.find((m) => m.id === memberId);
    if (member) openWhatsAppComposer(member, tpl);
    return;
  }
  const receiptAction = event.target.closest("[data-receipt-action]");
  if (receiptAction) {
    if (activeReceipt) printOrPdf(receiptAction.dataset.receiptAction, activeReceipt);
    return;
  }
  const receiptLink = event.target.closest("[data-action='view-receipt']");
  if (receiptLink) {
    getReceipt(receiptLink.dataset.id).then(openReceipt).catch((error) => toast(error.message, true));
  }
});
dialog.addEventListener("close", () => { if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = ""; });

document.querySelector("#menu-toggle").addEventListener("click", () => {
  const open = sidebar.classList.toggle("is-open");
  scrim.classList.toggle("is-visible", open);
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", String(open));
});
document.querySelector("#sidebar-close").addEventListener("click", () => { sidebar.classList.remove("is-open"); scrim.classList.remove("is-visible"); });
scrim.addEventListener("click", () => { sidebar.classList.remove("is-open"); scrim.classList.remove("is-visible"); });
nav.addEventListener("click", (event) => { const item = event.target.closest("[data-view]"); if (item) goToView(item.dataset.view); });
window.addEventListener("popstate", () => goToView(window.location.hash.slice(1) || "dashboard", false));
window.addEventListener("tgg-admin-authorized", (event) => {
  actor = event.detail;
  renderNavigation();
  const initialView = window.location.hash.slice(1);
  currentView = viewNames[initialView] && nav.querySelector(`[data-view="${initialView}"]`)
    ? initialView
    : actor.role === "TRAINER" ? "members" : "dashboard";
  render();
  refreshViewData();
  stopCollections?.();
  if (actor.role !== "TRAINER") {
    getAdminDashboardSummary().then((summary) => {
      state.dashboardSummary = summary;
      render();
    }).catch((error) => toast(error.message || "Dashboard summary is unavailable.", true));
  }
  stopCollections = subscribeAdminCollections((updates) => {
    Object.assign(state, updates);
    render();
    if (currentView === "members") hydrateVisibleMemberPhotos();
  }, (error) => { state.errors.push(error.message); toast(error.message || "A Firebase collection could not be read.", true); }, actor.role, actor.user.uid);
});

async function hydrateVisibleMemberPhotos() {
  content.querySelectorAll("[data-photo-path]:not([data-loaded])").forEach(async (imageWrap) => {
    const path = imageWrap.dataset.photoPath;
    imageWrap.dataset.loaded = "true";
    if (!path) return;
    try {
      const url = await getMemberPhotoObjectUrl(path);
      const image = document.createElement("img");
      image.src = url; image.alt = "Member"; image.onload = () => URL.revokeObjectURL(url); image.onerror = () => URL.revokeObjectURL(url);
      imageWrap.textContent = ""; imageWrap.append(image);
    } catch { }
  });
}

document.querySelector("#notification-toggle").addEventListener("click", () => {
  const menu = document.querySelector("#notification-dropdown");
  menu.hidden = !menu.hidden;
});
document.querySelector("#notif-mark-all-read-btn")?.addEventListener("click", async () => {
  try {
    await markAllNotificationsRead();
    state.notifications.forEach((n) => { n.status = "READ"; });
    updateTopBarNotifications();
    if (currentView === "notifications") render();
    toast("All notifications marked as read.");
  } catch (error) { toast(error.message, true); }
});
document.querySelector("#notif-view-all-btn")?.addEventListener("click", () => {
  document.querySelector("#notification-dropdown").hidden = true;
  goToView("notifications");
});
const profileToggle = document.querySelector("#profile-toggle");
profileToggle.addEventListener("click", () => {
  const menu = document.querySelector("#profile-dropdown");
  menu.hidden = !menu.hidden;
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".dropdown-wrap")) document.querySelectorAll(".dropdown").forEach((menu) => { menu.hidden = true; });
  const profileAction = event.target.closest("[data-action='profile'], [data-action='settings']");
  if (profileAction) toast("Profile settings are managed by the account administrator.");
});
