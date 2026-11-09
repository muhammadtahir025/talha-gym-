document.addEventListener("DOMContentLoaded", () => {
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
    { label: "COMMUNICATION", items: [["notifications", "NOTIFICATIONS", "N"], ["gallery", "GALLERY", "G"], ["hero-media", "HERO MEDIA", "HM"], ["contact-inquiries", "CONTACT INQUIRIES", "CI"]] },
    { label: "SYSTEM", items: [["website-settings", "WEBSITE SETTINGS", "S"], ["activity-logs", "ACTIVITY LOGS", "L"], ["backups", "BACKUPS", "B"]] }
  ];

  const viewNames = Object.fromEntries(groups.flatMap((group) => group.items.map(([id, label]) => [id, label])));
  const genericViews = {
    "time-slots": { title: "TIME SLOTS", description: "Manage scheduled training and member access windows.", empty: "No time slots configured.", action: "ADD TIME SLOT", form: "slot" },
    "workout-plans": { title: "WORKOUT PLANS", description: "Create and manage member workout programs.", empty: "No workout plans available.", action: "CREATE WORKOUT", form: "workout" },
    "diet-plans": { title: "DIET PLANS", description: "Manage nutrition guidance and meal plan templates.", empty: "No diet plans available.", action: "CREATE DIET PLAN", form: "diet" },
    progress: { title: "PROGRESS", description: "Review member progress records and fitness measurements.", empty: "No progress records available." },
    trainers: { title: "TRAINERS", description: "Manage coaching profiles and trainer assignments.", empty: "No trainers registered.", action: "ADD TRAINER", form: "trainer" },
    expenses: { title: "EXPENSES", description: "Record and review gym operating expenses.", empty: "No expenses recorded.", action: "ADD EXPENSE", form: "expense" },
    financials: { title: "FINANCIALS", description: "Review revenue, expenses, outstanding fees, and net profit.", empty: "No financial data available." },
    reports: { title: "REPORTS", description: "Prepare operational and financial reporting views.", empty: "No reports available.", action: "GENERATE REPORT", form: "report" },
    notifications: { title: "NOTIFICATIONS", description: "Review and manage member and staff notifications.", empty: "No notifications available.", action: "CREATE NOTIFICATION", form: "notification" },
    gallery: { title: "GALLERY", description: "Manage public website gallery media. Existing gym media remains in the website asset folders.", empty: "No gallery changes available in this frontend preview.", action: "ADD MEDIA", form: "media" },
    "hero-media": { title: "HERO MEDIA", description: "Manage the public homepage hero video and fallback media references.", empty: "No hero media changes configured.", action: "UPDATE HERO MEDIA", form: "hero" },
    "contact-inquiries": { title: "CONTACT INQUIRIES", description: "Review messages submitted through the public contact form.", empty: "No contact inquiries found." },
    "website-settings": { title: "WEBSITE SETTINGS", description: "Manage public website contact details and presentation settings.", empty: "No settings have been connected to storage.", action: "EDIT SETTINGS", form: "settings" },
    "activity-logs": { title: "ACTIVITY LOGS", description: "Review administrative actions and system activity.", empty: "No activity logs available." },
    backups: { title: "BACKUPS", description: "Prepare backup management for a future connected data store.", empty: "No backups available." }
  };

  const tableDefinitions = {
    members: ["Member ID", "Photo", "Full Name", "Gender", "Phone", "Membership", "Join Date", "Expiry", "Status", "Actions"],
    plans: ["Plan", "Duration", "Price", "Status", "Actions"],
    payments: ["Receipt ID", "Member", "Amount", "Payment Date", "Method", "Plan", "Transaction ID", "Status", "Actions"],
    attendance: ["Member ID", "Member", "Gender", "Time Slot", "Date", "Status"]
  };

  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);

  const formatMemberId = (gender, sequence) => `TGG-${gender === "Female" ? "F" : "M"}-${String(sequence).padStart(5, "0")}`;
  const formatReceiptId = (sequence) => `TGG-${String(sequence).padStart(6, "0")}`;
  window.TGGAdmin = Object.freeze({ formatMemberId, formatReceiptId });

  const showToast = (message) => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), 3600);
  };

  const renderNavigation = () => {
    nav.innerHTML = groups.map((group) => `
      <div class="nav-group">
        <span class="nav-group-label">${group.label}</span>
        ${group.items.map(([id, label, symbol]) => `
          <button class="nav-item" type="button" data-view="${id}" aria-current="false">
            <span class="nav-symbol" aria-hidden="true">${symbol}</span><span>${label}</span>
          </button>
        `).join("")}
      </div>
    `).join("") + `<a class="nav-logout" href="login.html" data-admin-logout><span class="nav-symbol" aria-hidden="true">↗</span><span>LOGOUT</span></a>`;
  };

  const pageHeader = (title, description = "", actions = "") => `
    <div class="page-heading-row">
      <div><span class="page-kicker">TALHA GOLD GYM / MANAGEMENT</span><h1 class="page-heading">${title}</h1>${description ? `<p class="page-description">${description}</p>` : ""}</div>
      ${actions ? `<div class="heading-actions">${actions}</div>` : ""}
    </div>
  `;

  const button = (label, action, primary = false, icon = "") => `<button type="button" class="admin-button${primary ? " primary" : ""}" data-action="${action}">${icon ? `<span class="button-icon" aria-hidden="true">${icon}</span>` : ""}${label}</button>`;

  const emptyTable = (columns, message) => `
    <div class="table-wrap"><table class="admin-table"><thead><tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead>
      <tbody><tr><td class="table-empty" colspan="${columns.length}">${message}</td></tr></tbody>
    </table></div>
  `;

  const dashboardView = () => {
    const metrics = ["TOTAL MEMBERS", "ACTIVE MEMBERS", "EXPIRED MEMBERS", "TODAY'S ATTENDANCE", "TODAY'S REVENUE", "MONTHLY REVENUE", "PENDING FEES", "MONTHLY EXPENSES", "NET PROFIT"];
    return `${pageHeader("DASHBOARD", "A clear view of gym operations. Live figures will appear when a data source is connected.")}
      <section class="metric-grid" aria-label="Dashboard metrics">${metrics.map((metric) => `<div class="metric"><span class="metric-label">${metric}</span><strong class="metric-value no-data">NO DATA</strong></div>`).join("")}</section>
      <section class="section-block dashboard-grid">
        <article class="panel">
          <div class="panel-head"><h2>REVENUE / EXPENSE OVERVIEW</h2><div class="chart-tabs" role="group" aria-label="Financial chart series"><button type="button" class="chart-tab active">Overview</button></div></div>
          <div class="chart-empty">No financial data available.</div>
          <div class="chart-legend"><span class="legend-key" style="--key-color:#d4af37">Revenue</span><span class="legend-key" style="--key-color:#969696">Expenses</span><span class="legend-key" style="--key-color:#f5c542">Net Profit</span></div>
        </article>
        <article class="panel">
          <div class="panel-head"><h2>TODAY'S ATTENDANCE</h2><button class="admin-button small" type="button" data-view="attendance">VIEW</button></div>
          <div class="panel-body"><div class="attendance-counts"><div class="attendance-count"><span>PRESENT</span><strong>0</strong></div><div class="attendance-count"><span>ABSENT</span><strong>0</strong></div></div><div class="empty-note">No attendance records available.</div></div>
        </article>
      </section>
      <section class="quick-panel"><div class="section-title-row"><h2 class="section-title">QUICK ACTIONS</h2><span class="section-caption">Frontend preview only</span></div><div class="quick-actions">${button("ADD MEMBER", "member", true, "+")}${button("RECORD PAYMENT", "payment", false, "+")}${button("MARK ATTENDANCE", "attendance", false, "+")}${button("ADD EXPENSE", "expense", false, "+")}${button("CREATE WORKOUT", "workout", false, "+")}${button("CREATE DIET PLAN", "diet", false, "+")}</div></section>
      <section class="section-block dashboard-grid">
        <article class="panel"><div class="panel-head"><h2>RECENT PAYMENTS</h2><button class="admin-button small" type="button" data-view="payments">VIEW ALL</button></div>${emptyTable(["Receipt ID", "Member", "Amount", "Date", "Method", "Status"], "No payments found.")}</article>
        <article class="panel"><div class="panel-head"><h2>RECENT MEMBERS</h2><button class="admin-button small" type="button" data-view="members">VIEW ALL</button></div>${emptyTable(["Member ID", "Name", "Gender", "Plan", "Join Date", "Status"], "No members registered yet.")}</article>
      </section>`;
  };

  const membersView = () => `${pageHeader("MEMBERS", "Search and manage member profiles, memberships, and status.", `${button("EXPORT", "export-members", false, "↓")}${button("FILTER", "toggle-filters", false, "≡")}${button("ADD MEMBER", "member", true, "+")}`)}
    <div class="table-toolbar"><label class="search-field"><span class="search-mark" aria-hidden="true">⌕</span><input type="search" id="member-search" placeholder="Search members..." aria-label="Search members" /></label><span class="section-caption">No connected records</span></div>
    <div class="filter-row" id="member-filters" hidden><select aria-label="Filter by gender"><option value="">Gender: All</option><option>Male</option><option>Female</option></select><select aria-label="Filter by membership status"><option value="">Status: All</option><option>Active</option><option>Expired</option></select><select aria-label="Filter by plan"><option value="">Plan: All</option><option>Monthly</option><option>Quarterly</option><option>6 Months</option><option>Yearly</option></select><select aria-label="Filter by trainer"><option value="">Trainer: All</option></select></div>
    ${emptyTable(tableDefinitions.members, "No members registered yet.")}`;

  const plansView = () => `${pageHeader("MEMBERSHIP PLANS", "Configure plan names, durations, pricing, included features, and availability.", button("ADD PLAN", "plan", true, "+"))}
    ${emptyTable(tableDefinitions.plans, "No membership plans configured.")}`;

  const paymentsView = () => `${pageHeader("PAYMENTS", "Review membership payments and prepare digital receipt workflows.", button("ADD PAYMENT", "payment", true, "+"))}
    <div class="filter-row"><input class="form-control" type="date" aria-label="Filter by date" /><select aria-label="Filter by member"><option value="">Member: All</option></select><select aria-label="Filter by payment method"><option value="">Method: All</option><option>Cash</option><option>Bank Transfer</option><option>Card</option><option>Digital Wallet</option></select><select aria-label="Filter by payment status"><option value="">Status: All</option><option>Success</option><option>Pending</option><option>Failed</option><option>Refunded</option></select></div>
    ${emptyTable(tableDefinitions.payments, "No payments found.")}`;

  const attendanceView = () => `${pageHeader("ATTENDANCE", "Track daily check-ins and review attendance by member group.", `${button("MARK PRESENT", "attendance-present", true, "+")}${button("MARK ABSENT", "attendance-absent", false, "−")}`)}
    <div class="subnav" role="tablist" aria-label="Attendance views"><button class="active" type="button" role="tab" aria-selected="true">DAILY ATTENDANCE</button><button type="button" role="tab" aria-selected="false">MONTHLY ATTENDANCE</button><button type="button" role="tab" aria-selected="false">MEN ATTENDANCE</button><button type="button" role="tab" aria-selected="false">WOMEN ATTENDANCE</button></div>
    <div class="filter-row"><input class="form-control" type="date" aria-label="Filter by date" /><select aria-label="Filter by gender"><option value="">Gender: All</option><option>Male</option><option>Female</option></select><select aria-label="Filter by time slot"><option value="">Time slot: All</option></select></div>
    ${emptyTable(tableDefinitions.attendance, "No attendance records available.")}`;

  const genericView = (id) => {
    const view = genericViews[id];
    const actions = view.action ? button(view.action, view.form, true, "+") : "";
    return `${pageHeader(view.title, view.description, actions)}<div class="placeholder-panel"><h2>${view.title}</h2><p>${view.empty}</p>${view.action ? `<div class="section-caption" style="margin-top:8px">Changes are not saved in this frontend-only step.</div>` : ""}</div>`;
  };

  const renderView = (id, updateHash = true) => {
    if (!viewNames[id]) id = "dashboard";
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item.dataset.view === id;
      item.classList.toggle("active", active);
      item.setAttribute("aria-current", active ? "page" : "false");
    });
    pageTitle.textContent = viewNames[id];
    content.innerHTML = id === "dashboard" ? dashboardView()
      : id === "members" ? membersView()
      : id === "membership-plans" ? plansView()
      : id === "payments" ? paymentsView()
      : id === "attendance" ? attendanceView()
      : genericView(id);
    if (updateHash && window.location.hash !== `#${id}`) history.pushState({ view: id }, "", `#${id}`);
    closeSidebar();
  };

  const closeSidebar = () => {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-visible");
    document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
  };

  const field = (label, name, type = "text", options = {}) => {
    const required = options.required ? "required" : "";
    const id = `form-${name}`;
    let control;
    if (type === "select") {
      control = `<select id="${id}" name="${name}" ${required}>${(options.options || []).map((option, index) => `<option value="${index === 0 && options.allowBlank !== false ? "" : escapeHTML(option)}">${escapeHTML(option)}</option>`).join("")}</select>`;
    } else if (type === "textarea") {
      control = `<textarea id="${id}" name="${name}" ${required} ${options.rows ? `rows="${options.rows}"` : ""}></textarea>`;
    } else {
      control = `<input id="${id}" name="${name}" type="${type}" ${required} ${options.accept ? `accept="${options.accept}"` : ""} ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.step ? `step="${options.step}"` : ""} />`;
    }
    return `<div class="form-field${options.full ? " full" : ""}"><label for="${id}">${label}${options.required ? " *" : ""}</label>${control}${options.hint ? `<span class="form-hint">${options.hint}</span>` : ""}</div>`;
  };

  const forms = {
    member: { title: "ADD MEMBER", intro: "Complete the profile fields. Member IDs are reserved for automatic generation after data storage is connected.", fields: [
      ["Full Name", "full-name", "text", { required: true }], ["Father Name", "father-name", "text", { required: true }],
      ["Phone", "phone", "tel", { required: true }], ["CNIC", "cnic", "text", { required: true }],
      ["Gender", "gender", "select", { required: true, options: ["Select gender", "Male", "Female"] }], ["Date of Birth", "birth-date", "date", { required: true }],
      ["Address", "address", "textarea", { required: true, full: true }], ["Join Date", "join-date", "date", { required: true }],
      ["Membership Plan", "plan", "select", { required: true, options: ["Select membership plan", "Monthly", "Quarterly", "6 Months", "Yearly"] }],
      ["Monthly Fee", "monthly-fee", "number", { required: true, min: "0", step: "0.01" }],
      ["Trainer", "trainer", "select", { options: ["Select trainer"] }], ["Time Slot", "time-slot", "select", { options: ["Select time slot"] }],
      ["Profile Photo", "profile-photo", "file", { accept: "image/*", full: true }]
    ], submit: "SAVE MEMBER", note: "Member ID format is reserved: TGG-M-##### / TGG-F-#####. No ID or member record is generated in this preview." },
    plan: { title: "ADD MEMBERSHIP PLAN", intro: "Configure a plan for the future connected system.", fields: [
      ["Plan Name", "plan-name", "text", { required: true }], ["Duration", "duration", "text", { required: true, hint: "Example: 1 month, 3 months, 6 months, 12 months." }],
      ["Price", "price", "number", { required: true, min: "0", step: "0.01" }], ["Status", "status", "select", { options: ["Active", "Inactive"], allowBlank: false }],
      ["Description", "description", "textarea", { full: true }], ["Features", "features", "textarea", { full: true, hint: "Enter one feature per line." }]
    ], submit: "SAVE PLAN" },
    payment: { title: "ADD PAYMENT", intro: "Prepare a payment record and receipt workflow. Nothing is stored in this preview.", fields: [
      ["Member", "member", "select", { required: true, options: ["Select member"] }], ["Amount", "amount", "number", { required: true, min: "0", step: "0.01" }],
      ["Payment Date", "payment-date", "date", { required: true }], ["Payment Method", "method", "select", { required: true, options: ["Select method", "Cash", "Bank Transfer", "Card", "Digital Wallet"] }],
      ["Plan", "plan", "select", { options: ["Select plan", "Monthly", "Quarterly", "6 Months", "Yearly"] }], ["Transaction ID", "transaction-id", "text"],
      ["Status", "status", "select", { required: true, options: ["Select status", "SUCCESS", "PENDING", "FAILED", "REFUNDED"] }]
    ], submit: "RECORD PAYMENT", note: "Receipt format is reserved for future generation: TGG-######. No receipt is generated in this preview." },
    attendance: { title: "MARK ATTENDANCE", intro: "Enter an attendance record for the future connected system.", fields: [
      ["Member", "member", "select", { required: true, options: ["Select member"] }], ["Date", "date", "date", { required: true }],
      ["Gender", "gender", "select", { required: true, options: ["Select gender", "Male", "Female"] }], ["Time Slot", "time-slot", "select", { options: ["Select time slot"] }],
      ["Status", "status", "select", { required: true, options: ["Select status", "PRESENT", "ABSENT"] }]
    ], submit: "MARK ATTENDANCE" },
    "attendance-present": { title: "MARK PRESENT", intro: "Record a present attendance entry.", fields: [["Member", "member", "select", { required: true, options: ["Select member"] }], ["Date", "date", "date", { required: true }], ["Time Slot", "time-slot", "select", { options: ["Select time slot"] }]], submit: "MARK PRESENT" },
    "attendance-absent": { title: "MARK ABSENT", intro: "Record an absent attendance entry.", fields: [["Member", "member", "select", { required: true, options: ["Select member"] }], ["Date", "date", "date", { required: true }], ["Time Slot", "time-slot", "select", { options: ["Select time slot"] }]], submit: "MARK ABSENT" },
    expense: { title: "ADD EXPENSE", intro: "Enter expense details for future financial reporting.", fields: [
      ["Expense Name", "expense-name", "text", { required: true }], ["Amount", "amount", "number", { required: true, min: "0", step: "0.01" }],
      ["Date", "date", "date", { required: true }], ["Category", "category", "select", { required: true, options: ["Select category", "Rent", "Utilities", "Equipment", "Maintenance", "Supplies", "Other"] }],
      ["Description", "description", "textarea", { full: true }]
    ], submit: "SAVE EXPENSE" },
    workout: { title: "CREATE WORKOUT PLAN", intro: "Prepare a workout template for future member assignment.", fields: [
      ["Plan Name", "plan-name", "text", { required: true }], ["Goal", "goal", "select", { options: ["Select goal", "Strength", "Muscle Building", "Weight Loss", "General Fitness"] }],
      ["Duration", "duration", "text"], ["Level", "level", "select", { options: ["Select level", "Beginner", "Intermediate", "Advanced"] }],
      ["Workout Details", "details", "textarea", { required: true, full: true }]
    ], submit: "CREATE WORKOUT" },
    diet: { title: "CREATE DIET PLAN", intro: "Prepare nutrition guidance for a future connected system.", fields: [
      ["Plan Name", "plan-name", "text", { required: true }], ["Goal", "goal", "select", { options: ["Select goal", "Weight Loss", "Muscle Building", "General Health"] }],
      ["Diet Details", "details", "textarea", { required: true, full: true }], ["Notes", "notes", "textarea", { full: true }]
    ], submit: "CREATE DIET PLAN" },
    slot: { title: "ADD TIME SLOT", intro: "Configure a gym access or training time window.", fields: [
      ["Slot Name", "slot-name", "text", { required: true }], ["Start Time", "start-time", "time", { required: true }],
      ["End Time", "end-time", "time", { required: true }], ["Status", "status", "select", { options: ["Active", "Inactive"], allowBlank: false }]
    ], submit: "SAVE TIME SLOT" },
    trainer: { title: "ADD TRAINER", intro: "Prepare a trainer profile. Existing public trainer media is not changed.", fields: [
      ["Full Name", "full-name", "text", { required: true }], ["Phone", "phone", "tel"], ["Specialization", "specialization", "text"],
      ["Experience", "experience", "text"], ["Biography", "biography", "textarea", { full: true }], ["Profile Photo", "photo", "file", { accept: "image/*", full: true }]
    ], submit: "SAVE TRAINER" },
    report: { title: "GENERATE REPORT", intro: "Choose a report scope for the future reporting workflow.", fields: [
      ["Report Type", "report-type", "select", { required: true, options: ["Select report", "Members", "Payments", "Attendance", "Expenses", "Financial Summary"] }],
      ["From", "from", "date"], ["To", "to", "date"]
    ], submit: "PREPARE REPORT" },
    notification: { title: "CREATE NOTIFICATION", intro: "Compose a notification template. Delivery is not connected.", fields: [
      ["Audience", "audience", "select", { required: true, options: ["Select audience", "All Members", "Male Members", "Female Members", "Staff"] }],
      ["Subject", "subject", "text", { required: true }], ["Message", "message", "textarea", { required: true, full: true }]
    ], submit: "PREPARE NOTIFICATION" },
    media: { title: "ADD GALLERY MEDIA", intro: "Prepare a media item. This preview does not upload or alter existing website assets.", fields: [
      ["Media File", "media-file", "file", { required: true, accept: "image/*,video/*", full: true }],
      ["Category", "category", "select", { options: ["Select category", "Gym", "Equipment", "Men", "Women", "Trainers", "Events"] }], ["Caption", "caption", "text"]
    ], submit: "PREPARE MEDIA" },
    hero: { title: "UPDATE HERO MEDIA", intro: "Set the future homepage media reference. The current public-site video remains untouched.", fields: [
      ["Video File", "video", "file", { accept: "video/*" }], ["Fallback Image", "fallback", "file", { accept: "image/*" }],
      ["Alt Text", "alt-text", "text", { full: true }]
    ], submit: "PREPARE UPDATE" },
    settings: { title: "WEBSITE SETTINGS", intro: "Edit a draft of the public website settings. Nothing is published in this preview.", fields: [
      ["Gym Name", "gym-name", "text", { required: true }], ["Phone", "phone", "tel"], ["Email", "email", "email"],
      ["Address", "address", "textarea", { full: true }], ["Opening Hours", "hours", "textarea", { full: true }]
    ], submit: "SAVE DRAFT" },
    profile: { title: "MY PROFILE", intro: "Admin profile details will be supplied by the authentication system in Step 4.", fields: [["Display Name", "display-name", "text"], ["Email", "email", "email"]], submit: "SAVE PROFILE" }
  };

  const openForm = (key) => {
    const config = forms[key];
    if (!config) return;
    dialogBody.innerHTML = `<h2 id="dialog-title">${config.title}</h2><p class="dialog-intro">${config.intro}</p>
      <form class="form-grid" id="admin-form" novalidate>
        ${config.fields.map(([label, name, type, options = {}]) => field(label, name, type, options)).join("")}
        ${config.note ? `<div class="form-field full"><span class="form-hint">${config.note}</span></div>` : ""}
        <div class="form-error" id="form-error" aria-live="polite"></div>
        <div class="form-actions"><button class="admin-button" type="button" data-close-dialog>CANCEL</button><button class="admin-button primary" type="submit">${config.submit}</button></div>
      </form>`;
    if (!dialog.open) dialog.showModal();
  };

  const exportEmpty = () => showToast("No records are available to export.");

  nav.addEventListener("click", (event) => {
    const item = event.target.closest("[data-view]");
    if (item) renderView(item.dataset.view);
  });

  document.querySelector("#menu-toggle").addEventListener("click", () => {
    const open = sidebar.classList.toggle("is-open");
    scrim.classList.toggle("is-visible", open);
    document.querySelector("#menu-toggle").setAttribute("aria-expanded", String(open));
  });
  document.querySelector("#sidebar-close").addEventListener("click", closeSidebar);
  scrim.addEventListener("click", closeSidebar);

  const bindDropdown = (toggleId, dropdownId) => {
    const toggle = document.querySelector(`#${toggleId}`);
    const dropdown = document.querySelector(`#${dropdownId}`);
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = dropdown.hidden;
      document.querySelectorAll(".dropdown").forEach((menu) => { menu.hidden = true; });
      document.querySelectorAll(".dropdown-wrap > button").forEach((buttonElement) => buttonElement.setAttribute("aria-expanded", "false"));
      dropdown.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
  };
  bindDropdown("notification-toggle", "notification-dropdown");
  bindDropdown("profile-toggle", "profile-dropdown");

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".dropdown-wrap")) {
      document.querySelectorAll(".dropdown").forEach((menu) => { menu.hidden = true; });
      document.querySelectorAll(".dropdown-wrap > button").forEach((buttonElement) => buttonElement.setAttribute("aria-expanded", "false"));
    }
    const profileAction = event.target.closest("[data-action='profile'], [data-action='settings']");
    if (profileAction) openForm(profileAction.dataset.action === "profile" ? "profile" : "settings");
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
    if (event.target.closest("[data-close-dialog]")) dialog.close();
  });

  dialog.addEventListener("submit", (event) => {
    if (!event.target.matches("#admin-form")) return;
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    const error = form.querySelector("#form-error");
    const memberPhone = form.querySelector("[name='phone']");
    if (memberPhone && memberPhone.value.trim().length < 7) {
      error.textContent = "Enter a valid phone number.";
      memberPhone.focus();
      return;
    }
    error.textContent = "";
    const title = form.closest(".dialog-body").querySelector("h2").textContent;
    dialog.close();
    showToast(`${title}: validated for preview only. Nothing was saved.`);
  });

  content.addEventListener("click", (event) => {
    const actionControl = event.target.closest("[data-action]");
    if (actionControl) {
      const action = actionControl.dataset.action;
      if (action === "toggle-filters") {
        const filters = document.querySelector("#member-filters");
        if (filters) filters.hidden = !filters.hidden;
      } else if (action === "export-members") {
        exportEmpty();
      } else if (forms[action]) {
        openForm(action);
      }
      return;
    }

    const viewControl = event.target.closest("[data-view]");
    if (viewControl) {
      renderView(viewControl.dataset.view);
      return;
    }

    const tab = event.target.closest(".subnav button");
    if (tab) {
      content.querySelectorAll(".subnav button").forEach((item) => {
        item.classList.toggle("active", item === tab);
        item.setAttribute("aria-selected", String(item === tab));
      });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });
  window.addEventListener("popstate", () => renderView(window.location.hash.slice(1) || "dashboard", false));

  renderNavigation();
  const requestedView = window.location.hash.slice(1);
  renderView(viewNames[requestedView] ? requestedView : "dashboard", false);
  content.addEventListener("input", (event) => {
    if (event.target.matches("#member-search") && event.target.value.trim()) {
      showToast("No members are available to match this search.");
    }
  });
});
