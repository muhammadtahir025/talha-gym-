import { collection, addDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, firebaseReady } from "./firebase.js";
import { createMembershipSlip, showSlipModal, findSlipByPhoneOrId } from "./online-slip.js";

const container = document.querySelector("#public-membership-plans");
const planSelect = document.querySelector("#member-plan");
const form = document.querySelector("#membership-form");
const lookupForm = document.querySelector("#lookup-slip-form");

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const money = (value) => `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;

let activePlans = [
  {
    id: "plan-monthly",
    planName: "Monthly Membership",
    price: 2500,
    durationMonths: 1,
    image: "images/gym-dumbbells.jpg",
    description: "Flexible month-to-month access for consistent strength training and conditioning.",
    features: ["Full gym & equipment access", "Cardio & strength training floor", "Locker room & changing facilities", "Trainer floor guidance"]
  },
  {
    id: "plan-quarterly",
    planName: "Quarterly Membership",
    price: 6500,
    durationMonths: 3,
    image: "images/gym-cardio.jpg",
    description: "3-month commitment for members focused on visible transformation and routine discipline.",
    features: ["Full gym & equipment access", "Progress assessment & tracking", "Personalized workout tips", "Diet & routine direction"]
  },
  {
    id: "plan-6months",
    planName: "Half-Year Plan",
    price: 11500,
    durationMonths: 6,
    image: "images/WhatsApp Image 2026-10-05 at 1.32.38 PM.jpeg",
    description: "6 months of dedicated training with coaching guidance and performance tracking.",
    features: ["Full gym & equipment access", "Body composition tracking", "Coaching support & form check", "Priority time slot access"]
  },
  {
    id: "plan-yearly",
    planName: "Annual Gold Membership",
    price: 20000,
    durationMonths: 12,
    image: "images/gym-functional.jpg",
    description: "Our most popular long-term value for serious athletes and dedicated fitness members.",
    features: ["All-access pass all year", "VIP coaching consultations", "Complete progress & diet guidance", "Member perk discount & guest pass"]
  }
];

function renderPlans(plans) {
  if (!container) return;
  activePlans = plans;
  if (!plans.length) {
    container.innerHTML = `<p class="form-status">No membership plans are currently available.</p>`;
    return;
  }
  container.innerHTML = plans.map((plan) => {
    const planImg = plan.image || (plan.durationMonths === 1 ? "images/gym-dumbbells.jpg" : plan.durationMonths === 3 ? "images/gym-cardio.jpg" : plan.durationMonths === 6 ? "images/WhatsApp Image 2026-10-05 at 1.32.38 PM.jpeg" : "images/gym-functional.jpg");
    const badgeText = plan.durationMonths >= 12 ? "👑 VIP ANNUAL" : `${plan.durationMonths} ${plan.durationMonths === 1 ? "MONTH" : "MONTHS"}`;
    return `<article class="membership-plan${plan.durationMonths >= 12 ? " is-featured" : ""}">
      <div class="membership-plan-thumb">
        <img src="${escapeHTML(planImg)}" alt="${escapeHTML(plan.planName)}" loading="lazy" />
        <div class="membership-plan-badge">${badgeText}</div>
      </div>
      <div class="membership-plan-body">
        <h3>${escapeHTML(plan.planName)}</h3>
        <div class="plan-price">${money(plan.price)}</div>
        <div class="plan-detail">Duration: ${plan.durationMonths} ${plan.durationMonths === 1 ? "month" : "months"}</div>
        ${plan.description ? `<p style="margin-bottom:14px; font-size:0.92rem; color:rgba(245,245,245,0.78);">${escapeHTML(plan.description)}</p>` : ""}
        <ul class="plan-features">${(plan.features || []).map((feature) => `<li>${escapeHTML(feature)}</li>`).join("")}</ul>
        <div style="margin-top:auto;padding-top:22px">
          <a href="#membership-request" class="btn btn--primary" data-select-plan="${escapeHTML(plan.id)}">Join & Get Online Slip</a>
        </div>
      </div>
    </article>`;
  }).join("");

  if (planSelect) {
    planSelect.innerHTML = `<option value="">Select a plan</option>${plans.map((plan) => `<option value="${escapeHTML(plan.id)}" data-price="${plan.price}" data-months="${plan.durationMonths}">${escapeHTML(plan.planName)} — ${money(plan.price)}</option>`).join("")}`;
  }
}

async function loadPlans() {
  if (!container) return;
  renderPlans(activePlans);

  if (firebaseReady && db) {
    try {
      const snapshot = await getDocs(query(collection(db, "membership_plans"), where("status", "==", "ACTIVE")));
      const plans = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (Number(a.durationMonths) || 0) - (Number(b.durationMonths) || 0));
      if (plans.length > 0) {
        renderPlans(plans);
      }
    } catch (error) {
      console.warn("Could not fetch remote plans, using active default plans:", error);
    }
  }
}

// Plan selection click
if (container) {
  container.addEventListener("click", (event) => {
    const link = event.target.closest("[data-select-plan]");
    if (!link) return;
    const planId = link.dataset.selectPlan;
    if (planSelect) {
      planSelect.value = planId;
      const target = document.querySelector("#membership-request");
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
        const nameInput = document.querySelector("#member-name");
        nameInput?.focus();
      }
    }
  });
}

// Online Slip Form Submission Handler
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const nameInput = form.querySelector("#member-name");
    const phoneInput = form.querySelector("#member-phone");
    const cnicInput = form.querySelector("#member-cnic");
    const shiftSelect = form.querySelector("#member-shift");
    const planEl = form.querySelector("#member-plan");
    const msgInput = form.querySelector("#member-message");
    const status = form.querySelector(".form-status");

    // Payment fields
    const paymentTypeInput = form.querySelector('input[name="paymentType"]:checked');
    const paymentModeSelect = form.querySelector("#member-payment-mode");
    const tidInput = form.querySelector("#member-tid");

    const paymentType = paymentTypeInput?.value || "online";
    const paymentMode = paymentModeSelect?.value || "JazzCash";
    const tid = tidInput?.value.trim() || "";

    const name = nameInput?.value.trim() || "";
    const phone = phoneInput?.value.trim() || "";
    const cnic = cnicInput?.value.trim() || "";
    const shift = shiftSelect?.value || "Evening Shift (4:00 PM – 11:00 PM)";
    const planId = planEl?.value || "";
    const selectedOption = planEl?.selectedOptions?.[0];
    const planName = selectedOption ? selectedOption.textContent.split("—")[0].trim() : "Monthly Membership";
    const planPrice = selectedOption ? Number(selectedOption.dataset.price) || 2500 : 2500;
    const durationMonths = selectedOption ? Number(selectedOption.dataset.months) || 1 : 1;
    const message = msgInput?.value.trim() || "";

    if (!name || !phone || !planId) {
      if (status) {
        status.textContent = "Please provide your Full Name, Phone Number, and select a Membership Plan.";
        status.classList.add("error");
      }
      return;
    }

    if (status) {
      status.classList.remove("error");
      status.innerHTML = `<span style="color:var(--gold-bright);">⚡ Generating your official gym admission slip...</span>`;
    }

    // Generate Official Slip
    const slip = createMembershipSlip({
      name,
      phone,
      cnic,
      shift,
      plan: planId,
      planName,
      planPrice,
      durationMonths,
      message,
      paymentType,
      paymentMode,
      tid
    });

    // Save to Firestore if available
    if (firebaseReady && db) {
      try {
        await addDoc(collection(db, "membership_requests"), {
          slipId: slip.slipId,
          memberId: slip.memberId,
          name,
          phone,
          cnic,
          shift,
          planId,
          planName,
          amount: planPrice,
          totalAmount: slip.totalAmount,
          paymentType,
          paymentMode: slip.paymentMethod,
          transactionId: slip.transactionId,
          issueDate: slip.issueDate,
          validTill: slip.validTill,
          note: message,
          status: "PENDING",
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn("Could not save to Firestore, slip saved locally in browser:", e);
      }
    }

    // Open Official Slip Modal
    showSlipModal(slip);

    if (status) {
      status.innerHTML = `
        <div style="background:rgba(212,175,55,0.12); border:1px solid var(--gold-bright); padding:16px; border-radius:12px; margin-top:14px;">
          <strong style="color:var(--gold-bright); display:block; font-size:1.05rem;">🎉 Official Admission Slip Generated Successfully!</strong>
          <span style="display:block; margin:6px 0; color:#eee;">Slip No: <strong>${slip.slipId}</strong></span>
          <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
            <button type="button" class="btn btn--primary" id="reopen-slip-btn" style="padding:7px 16px; font-size:0.8rem;">View / Print Slip</button>
            <a href="https://wa.me/923703418826?text=${encodeURIComponent(`Hello TALHA GOLD GYM! I just registered online and generated Admission Slip No: ${slip.slipId} for ${slip.name} (${slip.planName}). Please confirm my registration.`)}" target="_blank" rel="noopener" class="btn btn--secondary" style="padding:7px 16px; font-size:0.8rem;">Confirm on WhatsApp</a>
          </div>
        </div>
      `;

      const reopenBtn = status.querySelector("#reopen-slip-btn");
      if (reopenBtn) {
        reopenBtn.onclick = () => showSlipModal(slip);
      }
    }
  });
}

// Lookup Existing Slip Handler
if (lookupForm) {
  lookupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const queryInput = lookupForm.querySelector("#lookup-slip-query");
    const resultBox = lookupForm.querySelector("#lookup-slip-result");
    const query = queryInput?.value.trim() || "";

    if (!query) {
      if (resultBox) {
        resultBox.innerHTML = `<span style="color:#ff6b6b;">Please enter your Mobile Number or Slip Number.</span>`;
      }
      return;
    }

    const found = findSlipByPhoneOrId(query);
    if (found) {
      showSlipModal(found);
      if (resultBox) {
        resultBox.innerHTML = `
          <div style="color:var(--gold-bright); padding:10px 0;">
            ✓ Found Slip: <strong>${found.slipId}</strong> for <strong>${found.name}</strong> (${found.planName}).
            <button type="button" class="btn btn--primary" id="view-found-slip-btn" style="display:inline-block; margin-left:12px; padding:6px 14px; font-size:0.75rem;">Open Slip</button>
          </div>
        `;
        resultBox.querySelector("#view-found-slip-btn").onclick = () => showSlipModal(found);
      }
    } else {
      if (resultBox) {
        resultBox.innerHTML = `
          <div style="color:#e0e0e0; padding:10px 0;">
            No existing slip found for "<strong>${escapeHTML(query)}</strong>". Please fill the registration form above to generate your official slip!
          </div>
        `;
      }
    }
  });
}

// Expose globally for header action buttons or quick triggers
window.openOnlineSlipModal = showSlipModal;
window.findGymSlip = findSlipByPhoneOrId;

loadPlans();

// Online Payment UI handlers
function initPaymentUI() {
  const onlineRadio = document.querySelector("#payment-online-opt input");
  const cashRadio = document.querySelector("#payment-cash-opt input");
  const onlineOptLabel = document.querySelector("#payment-online-opt");
  const cashOptLabel = document.querySelector("#payment-cash-opt");
  const accountsPanel = document.querySelector("#online-accounts-panel");

  if (onlineRadio && cashRadio) {
    onlineRadio.addEventListener("change", () => {
      if (onlineRadio.checked) {
        onlineOptLabel?.classList.add("active");
        cashOptLabel?.classList.remove("active");
        if (accountsPanel) accountsPanel.style.display = "block";
      }
    });

    cashRadio.addEventListener("change", () => {
      if (cashRadio.checked) {
        cashOptLabel?.classList.add("active");
        onlineOptLabel?.classList.remove("active");
        if (accountsPanel) accountsPanel.style.display = "none";
      }
    });
  }

  // Copy account number buttons
  document.addEventListener("click", (e) => {
    const copyBtn = e.target.closest(".btn-copy-account");
    if (!copyBtn) return;
    const num = copyBtn.dataset.copy || "03703418826";
    navigator.clipboard?.writeText(num).then(() => {
      const origText = copyBtn.textContent;
      copyBtn.textContent = "✓ Copied!";
      copyBtn.style.background = "#2e7d32";
      copyBtn.style.color = "#fff";
      setTimeout(() => {
        copyBtn.textContent = origText;
        copyBtn.style.background = "";
        copyBtn.style.color = "";
      }, 2000);
    }).catch(() => {
      alert("Account number: " + num);
    });
  });
}

initPaymentUI();
