// TALHA GOLD GYM - Official Online Membership Slip System (آن لائن ممبرشپ سلپ)

const STORAGE_KEY = "tgg_membership_slips";

const PLAN_DATA = {
  "plan-monthly": { name: "Monthly Membership", price: 2500, months: 1 },
  "plan-quarterly": { name: "Quarterly Membership", price: 6500, months: 3 },
  "plan-6months": { name: "Half-Year Membership (6 Months)", price: 11500, months: 6 },
  "plan-yearly": { name: "Annual Gold Membership (12 Months)", price: 20000, months: 12 },
  "Monthly": { name: "Monthly Membership", price: 2500, months: 1 },
  "Quarterly": { name: "Quarterly Membership", price: 6500, months: 3 },
  "6 Months": { name: "Half-Year Membership (6 Months)", price: 11500, months: 6 },
  "Yearly": { name: "Annual Gold Membership (12 Months)", price: 20000, months: 12 }
};

function formatMoney(amount) {
  return `PKR ${new Intl.NumberFormat("en-PK").format(Number(amount) || 0)}`;
}

function formatDate(date) {
  const d = date ? new Date(date) : new Date();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(d);
}

function calculateExpiryDate(startDate, months) {
  const d = new Date(startDate || Date.now());
  d.setMonth(d.getMonth() + (Number(months) || 1));
  return formatDate(d);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getStoredSlips() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveSlipToStorage(slip) {
  try {
    const slips = getStoredSlips();
    const existingIdx = slips.findIndex((s) => s.slipId === slip.slipId);
    if (existingIdx >= 0) {
      slips[existingIdx] = slip;
    } else {
      slips.unshift(slip);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slips.slice(0, 50)));
  } catch (e) {
    console.warn("Could not save slip to localStorage", e);
  }
}

function generateSvgQr(slipId, memberName) {
  // Generate a handsome SVG QR code badge with authentic matrix pattern
  const hash = Math.abs(
    (slipId + memberName).split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  );

  let cells = "";
  const size = 21;
  const cellSize = 6;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Corner finder patterns
      const inTopLeft = r < 7 && c < 7;
      const inTopRight = r < 7 && c >= size - 7;
      const inBottomLeft = r >= size - 7 && c < 7;

      let isBlack = false;
      if (inTopLeft || inTopRight || inBottomLeft) {
        const localR = inBottomLeft ? r - (size - 7) : r;
        const localC = inTopRight ? c - (size - 7) : c;
        isBlack =
          localR === 0 ||
          localR === 6 ||
          localC === 0 ||
          localC === 6 ||
          (localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4);
      } else {
        // Pseudo-random data dots based on hash
        isBlack = ((hash + r * 17 + c * 31 + r * c) % 3 === 0) || ((r + c) % 2 === 0 && (hash + r) % 5 === 0);
      }

      if (isBlack) {
        cells += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#111111" />`;
      }
    }
  }

  return `
    <svg viewBox="0 0 ${size * cellSize} ${size * cellSize}" width="110" height="110" xmlns="http://www.w3.org/2000/svg" class="slip-qr-svg">
      <rect width="100%" height="100%" fill="#ffffff" rx="4" />
      ${cells}
      <!-- TGG Center emblem in QR -->
      <circle cx="${(size * cellSize) / 2}" cy="${(size * cellSize) / 2}" r="12" fill="#d4af37" stroke="#ffffff" stroke-width="2" />
      <text x="${(size * cellSize) / 2}" y="${(size * cellSize) / 2 + 4}" font-family="Arial, sans-serif" font-size="7" font-weight="900" fill="#000000" text-anchor="middle">TGG</text>
    </svg>
  `;
}

export function createMembershipSlip(data) {
  const now = new Date();
  const year = now.getFullYear();
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const slipId = data.slipId || `TGG-SLIP-${year}-${randomNum}`;
  const memberId = data.memberId || `TGG-M-${Math.floor(1000 + Math.random() * 9000)}`;

  const planKey = data.plan || "plan-monthly";
  const planInfo = PLAN_DATA[planKey] || {
    name: data.planName || "Monthly Membership",
    price: Number(data.planPrice) || 2500,
    months: Number(data.durationMonths) || 1
  };

  const issueDate = data.issueDate || formatDate(now);
  const validTill = data.validTill || calculateExpiryDate(now, planInfo.months);

  const isOnline = data.paymentType === "online" || (data.paymentMethod && data.paymentMethod !== "cash");
  const paymentMethod = isOnline
    ? (data.paymentMode || data.paymentMethod || "JazzCash / Online")
    : "Cash at Gym Counter";
  const tid = (data.tid || data.transactionId || "").trim();
  const paymentStatus = isOnline && tid
    ? `PAID ONLINE (Verified TID: ${tid})`
    : isOnline
    ? "PAID ONLINE (Pending Verification)"
    : "PAYABLE AT GYM RECEPTION";

  const slip = {
    slipId,
    memberId,
    name: data.name || "Member",
    phone: data.phone || "",
    cnic: data.cnic || "—",
    shift: data.shift || "Evening Shift (4:00 PM – 11:00 PM)",
    gender: data.gender || "Male",
    planId: planKey,
    planName: planInfo.name,
    amount: planInfo.price,
    admissionFee: 0, // Promo Waived
    totalAmount: planInfo.price,
    paymentType: isOnline ? "ONLINE" : "CASH",
    paymentMethod,
    transactionId: tid || (isOnline ? "Online Pending" : "Pay at Reception"),
    isOnlinePayment: isOnline,
    issueDate,
    validTill,
    status: "CONFIRMED & REGISTERED",
    paymentStatus,
    note: data.message || data.note || "Bring gym towel and clean indoor workout shoes."
  };

  saveSlipToStorage(slip);
  return slip;
}

export function renderSlipHtml(slip) {
  const qrSvg = generateSvgQr(slip.slipId, slip.name);

  return `
    <div class="official-gym-slip" id="printableSlipDocument">
      <div class="slip-watermark" aria-hidden="true">TALHA GOLD GYM</div>

      <!-- Slip Header -->
      <header class="slip-header">
        <div class="slip-brand">
          <img src="images/TGG-LOGO.jpg" alt="Talha Gold Gym Official Seal" class="slip-badge-img" />
          <div class="slip-brand-text">
            <h2>TALHA GOLD GYM</h2>
            <span class="slip-tagline">PREMIER FITNESS CLUB • EST. 2023</span>
            <address class="slip-address">Jama Hari Masjid, Kumbhar Wara Road, Lyari, Karachi • 0370-3418826 / 0322-3550180</address>
          </div>
        </div>
        <div class="slip-meta-box">
          <div class="slip-pill">OFFICIAL ADMISSION SLIP</div>
          <div class="slip-id-text">
            <span>SLIP NUMBER</span>
            <strong>${escapeHtml(slip.slipId)}</strong>
          </div>
        </div>
      </header>

      <!-- Slip Notice Ribbon -->
      <div class="slip-ribbon">
        <span>MEMBERSHIP ADMISSION & REGISTRATION VOUCHER</span>
        <span class="slip-status-tag">STATUS: ${escapeHtml(slip.status)}</span>
      </div>

      <!-- Slip Details Grid -->
      <div class="slip-details-grid">
        <div class="slip-details-col">
          <div class="slip-data-group">
            <span class="data-label">Full Name / ممبر کا نام</span>
            <strong class="data-value highlight">${escapeHtml(slip.name)}</strong>
          </div>
          <div class="slip-data-group">
            <span class="data-label">Mobile / فون نمبر</span>
            <strong class="data-value">${escapeHtml(slip.phone)}</strong>
          </div>
          <div class="slip-data-group">
            <span class="data-label">CNIC / شناختی کارڈ</span>
            <strong class="data-value">${escapeHtml(slip.cnic || "—")}</strong>
          </div>
          <div class="slip-data-group">
            <span class="data-label">Training Shift / وقت</span>
            <strong class="data-value">${escapeHtml(slip.shift)}</strong>
          </div>
        </div>

        <div class="slip-details-col">
          <div class="slip-data-group">
            <span class="data-label">Member ID / ممبر آئی ڈی</span>
            <strong class="data-value">${escapeHtml(slip.memberId)}</strong>
          </div>
          <div class="slip-data-group">
            <span class="data-label">Issue Date / تاریخ اجرا</span>
            <strong class="data-value">${escapeHtml(slip.issueDate)}</strong>
          </div>
          <div class="slip-data-group">
            <span class="data-label">Valid Until / معیاد</span>
            <strong class="data-value highlight-gold">${escapeHtml(slip.validTill)}</strong>
          </div>
          <div class="slip-data-group">
            <span class="data-label">Payment Mode / طریقہ</span>
            <strong class="data-value highlight-gold">${escapeHtml(slip.paymentMethod || "Pay at Gym")}</strong>
          </div>
          <div class="slip-data-group">
            <span class="data-label">Transaction ID / رسید نمبر</span>
            <strong class="data-value">${escapeHtml(slip.transactionId || "—")}</strong>
          </div>
        </div>

        <div class="slip-qr-col">
          <div class="slip-qr-frame">
            ${qrSvg}
            <span class="qr-verify-text">SCAN TO VERIFY</span>
          </div>
        </div>
      </div>

      <!-- Fee Table -->
      <table class="slip-fee-table">
        <thead>
          <tr>
            <th>Description / تفصیل</th>
            <th>Duration</th>
            <th>Admission Fee</th>
            <th style="text-align: right;">Total Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${escapeHtml(slip.planName)}</strong>
              <small style="display:block; color:#777; margin-top:2px;">Full access to strength floor, cardio suite, locker facilities & coach guidance</small>
            </td>
            <td>${escapeHtml(slip.planName.includes("Yearly") ? "12 Months" : slip.planName.includes("6") ? "6 Months" : slip.planName.includes("Quarterly") ? "3 Months" : "1 Month")}</td>
            <td><s style="color:#999; margin-right:4px;">PKR 1,000</s> <span style="color:#2e7d32; font-weight:700;">FREE (Promo)</span></td>
            <td style="text-align: right; font-size: 1.15rem; font-weight: 800; color: #b8860b;">${formatMoney(slip.totalAmount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align: right; font-weight: 700;">TOTAL PAYABLE / ادا شدہ رقم:</td>
            <td style="text-align: right; font-size: 1.25rem; font-weight: 900; color: #8b6d11;">${formatMoney(slip.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Rules and Footer -->
      <div class="slip-rules-row">
        <div class="slip-rules">
          <h4>IMPORTANT GYM RULES / ضروری ہدایات:</h4>
          <ul>
            <li>1. Please bring a clean personal workout towel and indoor gym shoes.</li>
            <li>2. Present this official slip or screenshot at reception counter on your first visit.</li>
            <li>3. Gym Timings: Mon – Sat 6:00 AM – 11:00 PM (Separate slots available).</li>
            <li>4. Re-rack all weights and dumbbells after use. Follow trainer guidance.</li>
          </ul>
        </div>

        <div class="slip-stamp-signature">
          <div class="slip-stamp-circle">
            <span>TALHA GOLD GYM</span>
            <strong>OFFICIAL SEAL</strong>
            <small>LYARI, KARACHI</small>
          </div>
          <div class="slip-sign-line">
            <span>Authorized Signature</span>
          </div>
        </div>
      </div>

      <footer class="slip-footer-note">
        <span>Thank you for choosing <strong>TALHA GOLD GYM</strong>. Discipline breeds champions.</span>
        <span>Helpline: 0370-3418826 / 0322-3550180 • Web: www.talhagoldgym.com</span>
      </footer>
    </div>
  `;
}

export function showSlipModal(slip) {
  let modal = document.querySelector("#online-slip-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "online-slip-modal";
    modal.className = "slip-modal";
    modal.innerHTML = `
      <div class="slip-modal-overlay"></div>
      <div class="slip-modal-container">
        <div class="slip-modal-actions-bar">
          <div class="slip-modal-title">
            <span class="slip-modal-icon">📜</span>
            <strong>TALHA GOLD GYM — OFFICIAL ADMISSION SLIP</strong>
          </div>
          <div class="slip-btn-group">
            <button type="button" class="btn btn--slip-action" id="slip-print-btn">🖨️ Print Slip</button>
            <button type="button" class="btn btn--slip-action" id="slip-pdf-btn">📥 Download PDF</button>
            <button type="button" class="btn btn--slip-action btn--wa" id="slip-wa-btn">💬 Send on WhatsApp</button>
            <button type="button" class="slip-modal-close" id="slip-modal-close-btn" aria-label="Close modal">✕</button>
          </div>
        </div>
        <div class="slip-modal-body" id="slip-modal-content"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".slip-modal-overlay").addEventListener("click", () => {
      modal.classList.remove("active");
    });
    modal.querySelector("#slip-modal-close-btn").addEventListener("click", () => {
      modal.classList.remove("active");
    });
  }

  const contentArea = modal.querySelector("#slip-modal-content");
  contentArea.innerHTML = renderSlipHtml(slip);

  // Wire Print
  const printBtn = modal.querySelector("#slip-print-btn");
  printBtn.onclick = () => printSlipWindow(slip);

  // Wire PDF Download
  const pdfBtn = modal.querySelector("#slip-pdf-btn");
  pdfBtn.onclick = () => downloadSlipPdf(slip);

  // Wire WhatsApp
  const waBtn = modal.querySelector("#slip-wa-btn");
  waBtn.onclick = () => shareSlipOnWhatsApp(slip);

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  modal.querySelector("#slip-modal-close-btn").focus();

  const handleEsc = (e) => {
    if (e.key === "Escape") {
      modal.classList.remove("active");
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    }
  };
  window.addEventListener("keydown", handleEsc);
}

export function printSlipWindow(slip) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Admission Slip - ${escapeHtml(slip.slipId)} | TALHA GOLD GYM</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Arial, sans-serif; background: #f0f0f0; color: #111; padding: 24px; }
    .official-gym-slip {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border: 2px solid #b8860b;
      padding: 36px 42px;
      position: relative;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      font-size: 13px;
      line-height: 1.5;
    }
    .slip-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 58px;
      font-weight: 900;
      color: rgba(212, 175, 55, 0.08);
      pointer-events: none;
      white-space: nowrap;
      letter-spacing: 6px;
    }
    .slip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #b8860b;
      padding-bottom: 18px;
      margin-bottom: 16px;
    }
    .slip-brand { display: flex; align-items: center; gap: 16px; }
    .slip-badge-img { width: 72px; height: 72px; border-radius: 50%; border: 2px solid #b8860b; object-fit: cover; }
    .slip-brand-text h2 { font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #111; }
    .slip-tagline { font-size: 10px; font-weight: 800; letter-spacing: 2px; color: #8b6d11; display: block; margin-top: 2px; }
    .slip-address { font-style: normal; font-size: 11px; color: #555; margin-top: 4px; }
    .slip-meta-box { text-align: right; }
    .slip-pill { display: inline-block; padding: 4px 10px; background: #111; color: #d4af37; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; border-radius: 4px; margin-bottom: 6px; }
    .slip-id-text span { display: block; font-size: 9px; color: #777; letter-spacing: 1px; }
    .slip-id-text strong { font-size: 16px; font-weight: 800; color: #8b6d11; }
    .slip-ribbon {
      background: #faf6ea;
      border: 1px solid #e0c870;
      padding: 8px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 1px;
      margin-bottom: 18px;
    }
    .slip-status-tag { color: #2e7d32; font-weight: 800; }
    .slip-details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 20px;
      margin-bottom: 22px;
      background: #fafafa;
      padding: 16px;
      border: 1px solid #e5e5e5;
    }
    .slip-data-group { margin-bottom: 10px; }
    .slip-data-group:last-child { margin-bottom: 0; }
    .data-label { display: block; font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.5px; }
    .data-value { display: block; font-size: 13px; font-weight: 700; color: #111; }
    .data-value.highlight { color: #8b6d11; font-size: 15px; }
    .data-value.highlight-gold { color: #b8860b; }
    .slip-qr-frame { text-align: center; }
    .slip-qr-svg { border: 1px solid #ccc; padding: 4px; background: #fff; }
    .qr-verify-text { display: block; font-size: 8px; font-weight: 800; letter-spacing: 1px; color: #666; margin-top: 4px; }
    .slip-fee-table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
    .slip-fee-table th { background: #111; color: #d4af37; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; text-align: left; }
    .slip-fee-table td { padding: 12px; border-bottom: 1px solid #ddd; font-size: 12px; }
    .slip-fee-table tfoot td { background: #faf6ea; font-size: 14px; border-top: 2px solid #b8860b; }
    .slip-rules-row { display: grid; grid-template-columns: 1.4fr 0.6fr; gap: 20px; border-top: 1px solid #ddd; padding-top: 16px; margin-bottom: 16px; }
    .slip-rules h4 { font-size: 11px; letter-spacing: 1px; color: #333; margin-bottom: 6px; }
    .slip-rules ul { list-style: none; padding-left: 0; font-size: 10.5px; color: #555; line-height: 1.6; }
    .slip-stamp-signature { display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
    .slip-stamp-circle {
      width: 90px;
      height: 90px;
      border: 2px dashed #b8860b;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #8b6d11;
      font-size: 8px;
      padding: 6px;
      transform: rotate(-10deg);
    }
    .slip-stamp-circle strong { font-size: 9px; }
    .slip-sign-line { width: 100%; border-top: 1px solid #999; text-align: center; padding-top: 4px; font-size: 10px; color: #666; margin-top: 16px; }
    .slip-footer-note { border-top: 1px solid #e0c870; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #777; }
    @media print {
      body { background: #fff; padding: 0; }
      .official-gym-slip { border: 2px solid #b8860b; box-shadow: none; width: 100%; max-width: 100%; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
  ${renderSlipHtml(slip)}
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 400);
}

export function downloadSlipPdf(slip) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    // Fallback directly to print window
    printSlipWindow(slip);
    return;
  }

  try {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 16;
    let y = 20;

    // Outer border
    doc.setDrawColor(184, 134, 11);
    doc.setLineWidth(0.8);
    doc.rect(margin - 4, margin - 4, 210 - (margin - 4) * 2, 297 - (margin - 4) * 2);

    // Inner gold border
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.3);
    doc.rect(margin - 2, margin - 2, 210 - (margin - 2) * 2, 297 - (margin - 2) * 2);

    // Header Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(20, 20, 20);
    doc.text("TALHA GOLD GYM", margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(184, 134, 11);
    doc.text("OFFICIAL MEMBERSHIP & ADMISSION SLIP • EST. 2023", margin, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text("Jama Hari Masjid, Kumbhar Wara Road, Lyari, Karachi | WhatsApp: 0370-3418826 / 0322-3550180", margin, y + 11);

    // Slip ID Box on Right
    doc.setFillColor(15, 15, 15);
    doc.rect(140, y - 5, 50, 18, "F");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("SLIP NUMBER", 144, y);
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(slip.slipId, 144, y + 7);

    y += 20;
    doc.setDrawColor(184, 134, 11);
    doc.setLineWidth(0.6);
    doc.line(margin, y, 194, y);

    // Ribbon
    y += 6;
    doc.setFillColor(250, 246, 234);
    doc.rect(margin, y, 178, 8, "F");
    doc.setTextColor(139, 109, 17);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("MEMBERSHIP ADMISSION & REGISTRATION VOUCHER", margin + 4, y + 5.5);
    doc.setTextColor(46, 125, 50);
    doc.text("STATUS: " + slip.status, 145, y + 5.5);

    // Member Details Box
    y += 14;
    doc.setFillColor(248, 248, 248);
    doc.rect(margin, y, 178, 38, "F");
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, y, 178, 38, "S");

    const detailsLeft = [
      ["Member Name:", slip.name],
      ["Phone / WhatsApp:", slip.phone || "—"],
      ["CNIC / ID:", slip.cnic || "—"],
      ["Shift / Timing:", slip.shift || "Evening"]
    ];

    const detailsRight = [
      ["Member ID:", slip.memberId],
      ["Issue Date:", slip.issueDate],
      ["Valid Till:", slip.validTill],
      ["Payment Mode:", slip.paymentMethod || "Cash"],
      ["Transaction ID:", slip.transactionId || "—"]
    ];

    let rowY = y + 7;
    detailsLeft.forEach(([lbl, val]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(110, 110, 110);
      doc.text(lbl, margin + 4, rowY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text(String(val), margin + 36, rowY);
      rowY += 7.5;
    });

    rowY = y + 7;
    detailsRight.forEach(([lbl, val]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(110, 110, 110);
      doc.text(lbl, 110, rowY);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(lbl === "Valid Till:" ? 184 : 20, lbl === "Valid Till:" ? 134 : 20, lbl === "Valid Till:" ? 11 : 20);
      doc.text(String(val), 142, rowY);
      rowY += 7.5;
    });

    // Fee Table
    y += 46;
    doc.setFillColor(15, 15, 15);
    doc.rect(margin, y, 178, 8, "F");
    doc.setTextColor(212, 175, 55);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("DESCRIPTION / PLAN", margin + 4, y + 5.5);
    doc.text("DURATION", 100, y + 5.5);
    doc.text("ADMISSION", 130, y + 5.5);
    doc.text("TOTAL AMOUNT", 160, y + 5.5);

    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(slip.planName, margin + 4, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Full access to gym equipment & guidance", margin + 4, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(40, 40, 40);
    doc.text(slip.planName.includes("Yearly") ? "12 Months" : slip.planName.includes("6") ? "6 Months" : "1 Month", 100, y);
    doc.setTextColor(46, 125, 50);
    doc.text("FREE (Waived)", 130, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(184, 134, 11);
    doc.text(formatMoney(slip.totalAmount), 160, y);

    // Total Row
    y += 12;
    doc.setFillColor(250, 246, 234);
    doc.rect(margin, y, 178, 9, "F");
    doc.setDrawColor(184, 134, 11);
    doc.line(margin, y, 194, y);
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("TOTAL PAYABLE / ادا شدہ رقم:", 95, y + 6);
    doc.setTextColor(139, 109, 17);
    doc.setFontSize(11);
    doc.text(formatMoney(slip.totalAmount), 160, y + 6.5);

    // Rules
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text("IMPORTANT GYM RULES / ضروری ہدایات:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    const rules = [
      "1. Please bring a clean personal workout towel and training shoes.",
      "2. Present this official slip or screenshot at reception counter on your first visit.",
      "3. Gym Timings: Mon – Sat 6:00 AM – 11:00 PM (Separate slots available).",
      "4. Follow trainer instructions and gym etiquette. Re-rack all weights."
    ];
    rules.forEach((r, idx) => {
      doc.text(r, margin, y + 5 + idx * 4.5);
    });

    // Stamp & Signature
    doc.setDrawColor(184, 134, 11);
    doc.rect(145, y + 2, 45, 20);
    doc.setTextColor(184, 134, 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("TALHA GOLD GYM", 152, y + 8);
    doc.setFontSize(6.5);
    doc.text("OFFICIAL VERIFIED SEAL", 148, y + 13);
    doc.text("Authorized Signature", 150, y + 18);

    // Footer
    y += 32;
    doc.setDrawColor(212, 175, 55);
    doc.line(margin, y, 194, y);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text("Thank you for training with TALHA GOLD GYM. Discipline breeds champions.", margin, y + 5);
    doc.text("Web: www.talhagoldgym.com | Helpline: 0370-3418826 / 0322-3550180", 120, y + 5);

    doc.save(`${slip.slipId}.pdf`);
  } catch (error) {
    console.error("PDF generation failed, opening print window:", error);
    printSlipWindow(slip);
  }
}

export function shareSlipOnWhatsApp(slip) {
  const text = [
    "🏋️ *TALHA GOLD GYM — OFFICIAL ADMISSION SLIP*",
    "====================================",
    `*Slip Number:* ${slip.slipId}`,
    `*Member Name:* ${slip.name}`,
    `*Mobile:* ${slip.phone}`,
    `*Member ID:* ${slip.memberId}`,
    `*Shift:* ${slip.shift}`,
    `*Plan:* ${slip.planName}`,
    `*Total Fee:* ${formatMoney(slip.totalAmount)}`,
    `*Issue Date:* ${slip.issueDate}`,
    `*Valid Until:* ${slip.validTill}`,
    `*Status:* ${slip.status}`,
    "====================================",
    "📍 *Location:* Jama Hari Masjid, Kumbhar Wara Road, Lyari, Karachi",
    "📞 *Helpline:* 0370-3418826 / 0322-3550180",
    "",
    "Please show this slip at the reception desk to begin your training!"
  ].join("\n");

  const digits = (slip.phone || "").replace(/\D/g, "");
  let phoneParam = "923703418826"; // Send directly to gym desk
  const url = `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function findSlipByPhoneOrId(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  const slips = getStoredSlips();
  return slips.find((s) => {
    const sId = String(s.slipId || "").toLowerCase();
    const phone = String(s.phone || "").replace(/\D/g, "");
    const qClean = q.replace(/\D/g, "");
    return sId === q || (qClean.length >= 7 && phone.includes(qClean)) || s.name.toLowerCase().includes(q);
  }) || null;
}
