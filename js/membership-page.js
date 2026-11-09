// TALHA GOLD GYM - Standalone Membership & Online Slip System
// Runs flawlessly both locally (file://) and online (http/https)

(function () {
  'use strict';

  const STORAGE_KEY = "tgg_membership_slips";

  const PLAN_DATA = {
    "plan-monthly": { name: "Monthly Membership", price: 2500, months: 1 },
    "plan-quarterly": { name: "Quarterly Membership", price: 6500, months: 3 },
    "plan-6months": { name: "Half-Year Plan", price: 11500, months: 6 },
    "plan-yearly": { name: "Annual Gold Membership", price: 20000, months: 12 }
  };

  function formatMoney(amount) {
    return 'PKR ' + new Intl.NumberFormat('en-PK').format(Number(amount) || 0);
  }

  function formatDate(date) {
    const d = date ? new Date(date) : new Date();
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(d);
  }

  function calculateExpiryDate(startDate, months) {
    const d = new Date(startDate || Date.now());
    d.setMonth(d.getMonth() + (Number(months) || 1));
    return formatDate(d);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    const hash = Math.abs(
      (slipId + memberName).split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    );

    let cells = "";
    const size = 21;
    const cellSize = 6;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
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
          isBlack = ((hash + r * 17 + c * 31 + r * c) % 3 === 0) || ((r + c) % 2 === 0 && (hash + r) % 5 === 0);
        }

        if (isBlack) {
          cells += '<rect x="' + (c * cellSize) + '" y="' + (r * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="#111111" />';
        }
      }
    }

    return '<svg viewBox="0 0 ' + (size * cellSize) + ' ' + (size * cellSize) + '" width="110" height="110" xmlns="http://www.w3.org/2000/svg" class="slip-qr-svg">' +
      '<rect width="100%" height="100%" fill="#ffffff" rx="4" />' +
      cells +
      '<circle cx="' + ((size * cellSize) / 2) + '" cy="' + ((size * cellSize) / 2) + '" r="12" fill="#d4af37" stroke="#ffffff" stroke-width="2" />' +
      '<text x="' + ((size * cellSize) / 2) + '" y="' + ((size * cellSize) / 2 + 4) + '" font-family="Arial, sans-serif" font-size="7" font-weight="900" fill="#000000" text-anchor="middle">TGG</text>' +
      '</svg>';
  }

  function createMembershipSlip(data) {
    const now = new Date();
    const year = now.getFullYear();
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const slipId = data.slipId || ('TGG-SLIP-' + year + '-' + randomNum);
    const memberId = data.memberId || ('TGG-M-' + Math.floor(1000 + Math.random() * 9000));

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
      ? ('PAID ONLINE (Verified TID: ' + tid + ')')
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
      admissionFee: 0,
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

  function renderSlipHtml(slip) {
    const qrSvg = generateSvgQr(slip.slipId, slip.name);

    return '<div class="official-gym-slip" id="printableSlipDocument">' +
      '<div class="slip-watermark" aria-hidden="true">TALHA GOLD GYM</div>' +
      '<header class="slip-header">' +
        '<div class="slip-brand">' +
          '<img src="images/TGG-LOGO.jpg" alt="Talha Gold Gym Official Seal" class="slip-badge-img" />' +
          '<div class="slip-brand-text">' +
            '<h2>TALHA GOLD GYM</h2>' +
            '<span class="slip-tagline">PREMIER FITNESS CLUB • EST. 2023</span>' +
            '<address class="slip-address">Jama Hari Masjid, Kumbhar Wara Road, Lyari, Karachi • 0370-3418826 / 0322-3550180</address>' +
          '</div>' +
        '</div>' +
        '<div class="slip-meta-box">' +
          '<div class="slip-pill">OFFICIAL ADMISSION SLIP</div>' +
          '<div class="slip-id-text">' +
            '<span>SLIP NUMBER</span>' +
            '<strong>' + escapeHtml(slip.slipId) + '</strong>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<div class="slip-ribbon">' +
        '<span>MEMBERSHIP ADMISSION & REGISTRATION VOUCHER</span>' +
        '<span class="slip-status-tag">STATUS: ' + escapeHtml(slip.status) + '</span>' +
      '</div>' +

      '<div class="slip-details-grid">' +
        '<div class="slip-details-col">' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Full Name / ممبر کا نام</span>' +
            '<strong class="data-value highlight">' + escapeHtml(slip.name) + '</strong>' +
          '</div>' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Mobile / فون نمبر</span>' +
            '<strong class="data-value">' + escapeHtml(slip.phone) + '</strong>' +
          '</div>' +
          '<div class="slip-data-group">' +
            '<span class="data-label">CNIC / شناختی کارڈ</span>' +
            '<strong class="data-value">' + escapeHtml(slip.cnic || "—") + '</strong>' +
          '</div>' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Training Shift / وقت</span>' +
            '<strong class="data-value">' + escapeHtml(slip.shift) + '</strong>' +
          '</div>' +
        '</div>' +

        '<div class="slip-details-col">' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Member ID / ممبر آئی ڈی</span>' +
            '<strong class="data-value">' + escapeHtml(slip.memberId) + '</strong>' +
          '</div>' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Issue Date / تاریخ اجرا</span>' +
            '<strong class="data-value">' + escapeHtml(slip.issueDate) + '</strong>' +
          '</div>' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Valid Until / معیاد</span>' +
            '<strong class="data-value highlight-gold">' + escapeHtml(slip.validTill) + '</strong>' +
          '</div>' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Payment Mode / طریقہ</span>' +
            '<strong class="data-value highlight-gold">' + escapeHtml(slip.paymentMethod || "Pay at Gym") + '</strong>' +
          '</div>' +
          '<div class="slip-data-group">' +
            '<span class="data-label">Transaction ID / رسید نمبر</span>' +
            '<strong class="data-value">' + escapeHtml(slip.transactionId || "—") + '</strong>' +
          '</div>' +
        '</div>' +

        '<div class="slip-qr-col">' +
          '<div class="slip-qr-frame">' +
            qrSvg +
            '<span class="qr-verify-text">SCAN TO VERIFY</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<table class="slip-fee-table">' +
        '<thead>' +
          '<tr>' +
            '<th>Description / تفصیل</th>' +
            '<th>Duration</th>' +
            '<th>Admission Fee</th>' +
            '<th style="text-align: right;">Total Amount</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          '<tr>' +
            '<td>' +
              '<strong>' + escapeHtml(slip.planName) + '</strong>' +
              '<small style="display:block; color:#777; margin-top:2px;">Full access to strength floor, cardio suite, locker facilities & coach guidance</small>' +
            '</td>' +
            '<td>' + escapeHtml(slip.planName.includes("Yearly") || slip.planName.includes("Annual") ? "12 Months" : slip.planName.includes("6") ? "6 Months" : slip.planName.includes("Quarterly") ? "3 Months" : "1 Month") + '</td>' +
            '<td><s style="color:#999; margin-right:4px;">PKR 1,000</s> <span style="color:#2e7d32; font-weight:700;">FREE (Promo)</span></td>' +
            '<td style="text-align: right; font-size: 1.15rem; font-weight: 800; color: #b8860b;">' + formatMoney(slip.totalAmount) + '</td>' +
          '</tr>' +
        '</tbody>' +
        '<tfoot>' +
          '<tr>' +
            '<td colspan="3" style="text-align: right; font-weight: 700;">TOTAL PAYABLE / فیس کی رقم:</td>' +
            '<td style="text-align: right; font-size: 1.25rem; font-weight: 900; color: #8b6d11;">' + formatMoney(slip.totalAmount) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td colspan="3" style="text-align: right; font-size: 0.85rem; color: #666;">Payment Status:</td>' +
            '<td style="text-align: right; font-size: 0.85rem; font-weight: 800; color: ' + (slip.isOnlinePayment ? '#2e7d32' : '#b8860b') + ';">' + escapeHtml(slip.paymentStatus) + '</td>' +
          '</tr>' +
        '</tfoot>' +
      '</table>' +

      '<div class="slip-rules-row">' +
        '<div class="slip-rules">' +
          '<h4>IMPORTANT GYM RULES / ضروری ہدایات:</h4>' +
          '<ul>' +
            '<li>1. Please bring a clean personal workout towel and indoor gym shoes.</li>' +
            '<li>2. Present this official slip or screenshot at reception counter on your first visit.</li>' +
            '<li>3. Gym Timings: Mon – Sat 6:00 AM – 11:00 PM (Separate slots available).</li>' +
            '<li>4. Re-rack all weights and dumbbells after use. Follow coach guidance.</li>' +
          '</ul>' +
        '</div>' +

        '<div class="slip-stamp-signature">' +
          '<div class="slip-stamp-circle">' +
            '<span>TALHA GOLD GYM</span>' +
            '<strong>' + (slip.isOnlinePayment ? 'PAID ONLINE' : 'OFFICIAL SEAL') + '</strong>' +
            '<small>LYARI, KARACHI</small>' +
          '</div>' +
          '<div class="slip-sign-line">' +
            '<span>Authorized Signature</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<footer class="slip-footer-note">' +
        '<span>Thank you for choosing <strong>TALHA GOLD GYM</strong>. Discipline breeds champions.</span>' +
        '<span>Helpline: 0370-3418826 / 0322-3550180 • Web: www.talhagoldgym.com</span>' +
      '</footer>' +
    '</div>';
  }

  function showSlipModal(slip) {
    let modal = document.querySelector("#online-slip-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "online-slip-modal";
      modal.className = "slip-modal";
      modal.innerHTML = '<div class="slip-modal-overlay"></div>' +
        '<div class="slip-modal-container">' +
          '<div class="slip-modal-actions-bar">' +
            '<div class="slip-modal-title">' +
              '<span class="slip-modal-icon">📜</span>' +
              '<strong>TALHA GOLD GYM — OFFICIAL ADMISSION SLIP</strong>' +
            '</div>' +
            '<div class="slip-btn-group">' +
              '<button type="button" class="btn btn--slip-action" id="slip-print-btn">🖨️ Print Slip</button>' +
              '<button type="button" class="btn btn--slip-action" id="slip-pdf-btn">📥 Download PDF</button>' +
              '<button type="button" class="btn btn--slip-action btn--wa" id="slip-wa-btn">💬 Send on WhatsApp</button>' +
              '<button type="button" class="slip-modal-close" id="slip-modal-close-btn" aria-label="Close modal">✕</button>' +
            '</div>' +
          '</div>' +
          '<div class="slip-modal-body" id="slip-modal-content"></div>' +
        '</div>';
      document.body.appendChild(modal);

      modal.querySelector(".slip-modal-overlay").addEventListener("click", () => {
        modal.classList.remove("active");
        document.body.style.overflow = "";
      });
      modal.querySelector("#slip-modal-close-btn").addEventListener("click", () => {
        modal.classList.remove("active");
        document.body.style.overflow = "";
      });
    }

    const contentArea = modal.querySelector("#slip-modal-content");
    contentArea.innerHTML = renderSlipHtml(slip);

    // Wire buttons
    modal.querySelector("#slip-print-btn").onclick = () => printSlipWindow(slip);
    modal.querySelector("#slip-pdf-btn").onclick = () => downloadSlipPdf(slip);
    modal.querySelector("#slip-wa-btn").onclick = () => shareSlipOnWhatsApp(slip);

    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function printSlipWindow(slip) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.open();
    printWindow.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<title>Admission Slip - ' + escapeHtml(slip.slipId) + ' | TALHA GOLD GYM</title>' +
      '<link rel="stylesheet" href="css/style.css">' +
      '<style>' +
        'body { background: #f0f0f0; color: #111; padding: 24px; font-family: "Segoe UI", Arial, sans-serif; }' +
        '.official-gym-slip { box-shadow: none; max-width: 800px; margin: 0 auto; background: #fff; }' +
        '@media print { body { padding: 0; background: #fff; } .official-gym-slip { border: none; } }' +
      '</style>' +
      '</head><body>' +
      renderSlipHtml(slip) +
      '<script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };</' + 'script>' +
      '</body></html>');
    printWindow.document.close();
  }

  function downloadSlipPdf(slip) {
    if (window.jspdf && window.jspdf.jsPDF) {
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const margin = 14;
        let y = 18;

        doc.setFillColor(15, 15, 15);
        doc.rect(margin, y, 178, 6, "F");

        y += 14;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(20, 20, 20);
        doc.text("TALHA GOLD GYM", margin, y);

        doc.setFontSize(9);
        doc.setTextColor(184, 134, 11);
        doc.text("OFFICIAL MEMBERSHIP & ADMISSION SLIP • EST. 2023", margin, y + 6);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(100, 100, 100);
        doc.text("Jama Hari Masjid, Kumbhar Wara Road, Lyari, Karachi | Helpline: 0370-3418826 / 0322-3550180", margin, y + 11);

        y += 20;
        doc.setDrawColor(184, 134, 11);
        doc.line(margin, y, 194, y);

        y += 6;
        doc.setFillColor(250, 246, 234);
        doc.rect(margin, y, 178, 8, "F");
        doc.setTextColor(139, 109, 17);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("MEMBERSHIP ADMISSION & REGISTRATION VOUCHER", margin + 4, y + 5.5);
        doc.setTextColor(46, 125, 50);
        doc.text("STATUS: " + slip.status, 145, y + 5.5);

        y += 14;
        doc.setFillColor(248, 248, 248);
        doc.rect(margin, y, 178, 42, "F");
        doc.setDrawColor(220, 220, 220);
        doc.rect(margin, y, 178, 42, "S");

        const left = [
          ["Member Name:", slip.name],
          ["Phone / WhatsApp:", slip.phone || "—"],
          ["CNIC / ID:", slip.cnic || "—"],
          ["Shift / Timing:", slip.shift || "Evening"]
        ];

        const right = [
          ["Member ID:", slip.memberId],
          ["Issue Date:", slip.issueDate],
          ["Valid Till:", slip.validTill],
          ["Payment Mode:", slip.paymentMethod || "Cash"],
          ["Transaction ID:", slip.transactionId || "—"]
        ];

        let ry = y + 7;
        left.forEach(([lbl, val]) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(110, 110, 110);
          doc.text(lbl, margin + 4, ry);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(20, 20, 20);
          doc.text(String(val), margin + 36, ry);
          ry += 8;
        });

        ry = y + 7;
        right.forEach(([lbl, val]) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(110, 110, 110);
          doc.text(lbl, 110, ry);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(lbl === "Valid Till:" ? 184 : 20, lbl === "Valid Till:" ? 134 : 20, lbl === "Valid Till:" ? 11 : 20);
          doc.text(String(val), 142, ry);
          ry += 7;
        });

        y += 50;
        doc.setFillColor(15, 15, 15);
        doc.rect(margin, y, 178, 8, "F");
        doc.setTextColor(212, 175, 55);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("DESCRIPTION / PLAN", margin + 4, y + 5.5);
        doc.text("TOTAL AMOUNT", 155, y + 5.5);

        y += 14;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(20, 20, 20);
        doc.text(slip.planName, margin + 4, y);
        doc.setTextColor(184, 134, 11);
        doc.text(formatMoney(slip.totalAmount), 155, y);

        y += 14;
        doc.setFillColor(250, 246, 234);
        doc.rect(margin, y, 178, 9, "F");
        doc.setTextColor(20, 20, 20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("TOTAL PAYABLE: " + formatMoney(slip.totalAmount) + " (" + slip.paymentStatus + ")", margin + 4, y + 6);

        y += 20;
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        doc.text("Web: www.talhagoldgym.com | Helpline: 0370-3418826 / 0322-3550180", margin, y);

        doc.save(slip.slipId + ".pdf");
        return;
      } catch (e) {
        console.warn("PDF generation error, opening print window:", e);
      }
    }
    printSlipWindow(slip);
  }

  function shareSlipOnWhatsApp(slip) {
    const text = [
      "🏋️ *TALHA GOLD GYM — OFFICIAL ADMISSION SLIP*",
      "====================================",
      "*Slip Number:* " + slip.slipId,
      "*Member Name:* " + slip.name,
      "*Mobile:* " + slip.phone,
      "*Member ID:* " + slip.memberId,
      "*Shift:* " + slip.shift,
      "*Plan:* " + slip.planName,
      "*Total Fee:* " + formatMoney(slip.totalAmount),
      "*Payment Mode:* " + (slip.paymentMethod || "Cash / Reception"),
      "*Transaction ID (TID):* " + (slip.transactionId || "Pay at Counter"),
      "*Payment Status:* " + slip.paymentStatus,
      "*Issue Date:* " + slip.issueDate,
      "*Valid Until:* " + slip.validTill,
      "====================================",
      "📍 *Location:* Jama Hari Masjid, Kumbhar Wara Road, Lyari, Karachi",
      "📞 *Helpline / Accounts:* 0370-3418826 / 0322-3550180",
      "",
      slip.isOnlinePayment 
        ? "✅ I have made the online payment. Please verify my transaction screenshot and confirm my admission!"
        : "Please show this slip at the reception desk to complete your admission!"
    ].join("\n");

    const url = "https://wa.me/923703418826?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function findSlipByPhoneOrId(query) {
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

  // --- INITIALIZATION ---
  function initMembership() {
    const form = document.querySelector("#membership-form");
    const planSelect = document.querySelector("#member-plan");
    const lookupForm = document.querySelector("#lookup-slip-form");

    // Scroll helper
    function scrollToFormAndHighlight(planId) {
      if (planSelect && planId) {
        planSelect.value = planId;
        planSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const target = document.querySelector("#membership-request");
      if (target) {
        const headerHeight = document.querySelector(".site-header")?.offsetHeight || 80;
        const topPos = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
        window.scrollTo({ top: Math.max(0, topPos), behavior: "smooth" });

        target.classList.remove("form-highlight-flash");
        void target.offsetWidth; // re-trigger animation
        target.classList.add("form-highlight-flash");

        setTimeout(function () {
          const nameInput = document.querySelector("#member-name");
          if (nameInput) {
            nameInput.focus();
          }
        }, 350);
      }
    }

    // Auto-handle URL query and hash on initial page load
    (function handleUrlState() {
      try {
        const params = new URLSearchParams(window.location.search);
        const planParam = params.get("plan");
        const hash = window.location.hash;

        if (planParam && planSelect) {
          planSelect.value = planParam;
          planSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (hash === "#membership-request" || planParam) {
          setTimeout(function () {
            scrollToFormAndHighlight(planParam);
          }, 300);
        } else if (hash === "#online-slip-section" || hash === "#payment-methods-section") {
          setTimeout(function () {
            const section = document.querySelector(hash);
            if (section) {
              const headerHeight = document.querySelector(".site-header")?.offsetHeight || 80;
              const topPos = section.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
              window.scrollTo({ top: Math.max(0, topPos), behavior: "smooth" });
            }
          }, 300);
        }
      } catch (e) {
        console.warn("Error handling URL state", e);
      }
    })();

    // Global document click listener for all Join buttons and anchors
    document.addEventListener("click", function (event) {
      // 1. Check data-select-plan
      const planBtn = event.target.closest("[data-select-plan]");
      if (planBtn) {
        event.preventDefault();
        const planId = planBtn.getAttribute("data-select-plan");
        scrollToFormAndHighlight(planId);
        return;
      }

      // 2. Check anchor links pointing to #membership-request
      const requestAnchor = event.target.closest('a[href="#membership-request"], a[href$="#membership-request"]');
      if (requestAnchor) {
        if (window.location.pathname.endsWith("membership.html") || document.querySelector("#membership-request")) {
          event.preventDefault();
          let planId = "";
          try {
            const u = new URL(requestAnchor.href, window.location.href);
            planId = u.searchParams.get("plan") || "";
          } catch (e) {}
          scrollToFormAndHighlight(planId);
          return;
        }
      }
    });

    // Clear .field-invalid on typing/selecting
    ["member-name", "member-phone", "member-plan"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", function () {
          el.classList.remove("field-invalid");
        });
        el.addEventListener("change", function () {
          el.classList.remove("field-invalid");
        });
      }
    });

    // Form Submission
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();

        const nameInput = form.querySelector("#member-name");
        const phoneInput = form.querySelector("#member-phone");
        const cnicInput = form.querySelector("#member-cnic");
        const shiftSelect = form.querySelector("#member-shift");
        const planEl = form.querySelector("#member-plan");
        const msgInput = form.querySelector("#member-message");
        const status = form.querySelector(".form-status");

        const paymentTypeInput = form.querySelector('input[name="paymentType"]:checked');
        const paymentModeSelect = form.querySelector("#member-payment-mode");
        const tidInput = form.querySelector("#member-tid");

        const paymentType = paymentTypeInput ? paymentTypeInput.value : "online";
        const paymentMode = paymentModeSelect ? paymentModeSelect.value : "JazzCash";
        const tid = tidInput ? tidInput.value.trim() : "";

        const name = nameInput ? nameInput.value.trim() : "";
        const phone = phoneInput ? phoneInput.value.trim() : "";
        const cnic = cnicInput ? cnicInput.value.trim() : "";
        const shift = shiftSelect ? shiftSelect.value : "Evening Shift (4:00 PM – 11:00 PM)";
        const planId = planEl ? planEl.value : "";
        const selectedOption = planEl ? planEl.selectedOptions[0] : null;
        const planName = selectedOption ? selectedOption.textContent.split("—")[0].trim() : "Monthly Membership";
        const planPrice = selectedOption ? (Number(selectedOption.dataset.price) || 2500) : 2500;
        const durationMonths = selectedOption ? (Number(selectedOption.dataset.months) || 1) : 1;
        const message = msgInput ? msgInput.value.trim() : "";

        // Check required fields with clear Urdu/English message and focus
        if (!name) {
          if (nameInput) {
            nameInput.classList.add("field-invalid");
            nameInput.focus();
          }
          if (status) {
            status.textContent = "⚠️ براہ کرم ممبر کا پورا نام درج کریں / Please enter your Full Name.";
            status.className = "form-status error";
          }
          return;
        }

        if (!phone || phone.replace(/\D/g, "").length < 7) {
          if (phoneInput) {
            phoneInput.classList.add("field-invalid");
            phoneInput.focus();
          }
          if (status) {
            status.textContent = "⚠️ براہ کرم درست موبائل نمبر درج کریں / Please enter a valid Mobile Number.";
            status.className = "form-status error";
          }
          return;
        }

        if (!planId) {
          if (planEl) {
            planEl.classList.add("field-invalid");
            planEl.focus();
          }
          if (status) {
            status.textContent = "⚠️ براہ کرم ممبرشپ پلان منتخب کریں / Please select a Membership Plan.";
            status.className = "form-status error";
          }
          return;
        }

        if (status) {
          status.className = "form-status";
          status.innerHTML = '<span style="color:var(--gold-bright);">⚡ Generating your official gym admission slip...</span>';
        }

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

        // Open Modal
        showSlipModal(slip);

        if (status) {
          status.innerHTML = '<div style="background:rgba(212,175,55,0.12); border:1px solid var(--gold-bright); padding:16px; border-radius:12px; margin-top:14px;">' +
            '<strong style="color:var(--gold-bright); display:block; font-size:1.05rem;">🎉 Official Admission Slip Generated Successfully!</strong>' +
            '<span style="display:block; margin:6px 0; color:#eee;">Slip No: <strong>' + slip.slipId + '</strong></span>' +
            '<div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">' +
              '<button type="button" class="btn btn--primary" id="reopen-slip-btn" style="padding:7px 16px; font-size:0.8rem;">View / Print Slip</button>' +
              '<a href="https://wa.me/923703418826?text=' + encodeURIComponent('Hello TALHA GOLD GYM! I just registered online and generated Admission Slip No: ' + slip.slipId + ' for ' + slip.name + ' (' + slip.planName + '). Total Fee: ' + formatMoney(slip.totalAmount) + (slip.transactionId ? ' | TID: ' + slip.transactionId : '')) + '" target="_blank" rel="noopener" class="btn btn--secondary" style="padding:7px 16px; font-size:0.8rem;">Confirm on WhatsApp</a>' +
            '</div>' +
          '</div>';

          const reopenBtn = status.querySelector("#reopen-slip-btn");
          if (reopenBtn) {
            reopenBtn.onclick = () => showSlipModal(slip);
          }
        }
      });
    }

    // Payment Option Toggle (Online vs Cash)
    const onlineRadio = document.querySelector("#payment-online-opt input");
    const cashRadio = document.querySelector("#payment-cash-opt input");
    const onlineOptLabel = document.querySelector("#payment-online-opt");
    const cashOptLabel = document.querySelector("#payment-cash-opt");
    const accountsPanel = document.querySelector("#online-accounts-panel");

    if (onlineRadio && cashRadio) {
      onlineRadio.addEventListener("change", function () {
        if (onlineRadio.checked) {
          onlineOptLabel && onlineOptLabel.classList.add("active");
          cashOptLabel && cashOptLabel.classList.remove("active");
          if (accountsPanel) accountsPanel.style.display = "block";
        }
      });

      cashRadio.addEventListener("change", function () {
        if (cashRadio.checked) {
          cashOptLabel && cashOptLabel.classList.add("active");
          onlineOptLabel && onlineOptLabel.classList.remove("active");
          if (accountsPanel) accountsPanel.style.display = "none";
        }
      });
    }

    // Copy Account Buttons
    document.addEventListener("click", function (e) {
      const copyBtn = e.target.closest(".btn-copy-account");
      if (!copyBtn) return;
      const num = copyBtn.dataset.copy || "03703418826";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(num).then(function () {
          const origText = copyBtn.textContent;
          copyBtn.textContent = "✓ Copied!";
          copyBtn.style.background = "#2e7d32";
          copyBtn.style.color = "#fff";
          setTimeout(function () {
            copyBtn.textContent = origText;
            copyBtn.style.background = "";
            copyBtn.style.color = "";
          }, 2000);
        }).catch(function () {
          alert("Account number: " + num);
        });
      } else {
        alert("Account number: " + num);
      }
    });

    // Lookup existing slip
    if (lookupForm) {
      lookupForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const queryInput = lookupForm.querySelector("#lookup-slip-query");
        const resultBox = lookupForm.querySelector("#lookup-slip-result");
        const query = queryInput ? queryInput.value.trim() : "";

        if (!query) {
          if (resultBox) {
            resultBox.innerHTML = '<span style="color:#ff6b6b;">⚠️ Please enter your Mobile Number or Slip Number.</span>';
          }
          return;
        }

        const found = findSlipByPhoneOrId(query);
        if (found) {
          showSlipModal(found);
          if (resultBox) {
            resultBox.innerHTML = '<div style="color:var(--gold-bright); padding:10px 0;">' +
              '✓ Found Slip: <strong>' + escapeHtml(found.slipId) + '</strong> for <strong>' + escapeHtml(found.name) + '</strong> (' + escapeHtml(found.planName) + ').' +
              '<button type="button" class="btn btn--primary" id="view-found-slip-btn" style="display:inline-block; margin-left:12px; padding:6px 14px; font-size:0.75rem;">Open Slip</button>' +
            '</div>';
            resultBox.querySelector("#view-found-slip-btn").onclick = () => showSlipModal(found);
          }
        } else {
          if (resultBox) {
            resultBox.innerHTML = '<div style="color:#e0e0e0; padding:10px 0;">No existing slip found for "<strong>' + escapeHtml(query) + '</strong>". Please fill the registration form above to generate your official slip!</div>';
          }
        }
      });
    }
  }

  // Safe startup (handles readyState loading, interactive, or complete)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMembership);
  } else {
    initMembership();
  }

  // Global triggers
  window.openOnlineSlipModal = showSlipModal;
  window.findGymSlip = findSlipByPhoneOrId;
})();
