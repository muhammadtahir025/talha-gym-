const dateString = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};
const money = (value) => `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
const clean = (value) => String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

export function receiptMarkup(receipt) {
  const details = [
    ["Receipt No.", receipt.receiptId], ["Payment Date", dateString(receipt.paymentDate)],
    ["Transaction ID", receipt.transactionId || "—"], ["Member ID", receipt.memberId],
    ["Member Name", receipt.memberName], ["Phone", receipt.phone || "—"],
    ["Plan", receipt.planName], ["Amount", money(receipt.amount)],
    ["Payment Method", receipt.paymentMethod], ["Status", receipt.status]
  ];
  return `<article class="receipt-paper"><header class="receipt-header"><span class="receipt-logo">TGG</span><div><strong>TALHA GOLD GYM</strong><span>PAYMENT RECEIPT</span></div></header><p class="receipt-address">Jama Hari Masjid,<br> Kumbhar Wara Road,<br> Lyari, Karachi, Pakistan</p><hr>${details.map(([label, value]) => `<div class="receipt-line"><span>${clean(label)}</span><strong>${clean(value)}</strong></div>`).join("")}<hr><p class="receipt-footer">Thank you for training with TALHA GOLD GYM.</p></article>`;
}

export function openReceiptPrint(receipt) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("The print window was blocked. Allow pop-ups and try again.");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${clean(receipt.receiptId)} | TALHA GOLD GYM</title><style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#eee;color:#141414;font:14px/1.55 Arial,sans-serif}.receipt-paper{width:min(100%,640px);margin:0 auto;padding:34px;border:1px solid #d7d7d7;background:#fff}.receipt-header{display:flex;align-items:center;gap:14px;padding-bottom:18px;border-bottom:2px solid #d4af37}.receipt-logo{width:52px;height:52px;display:grid;place-items:center;border:1px solid #d4af37;color:#8b6d11;font-weight:800;letter-spacing:2px}.receipt-header strong,.receipt-header span{display:block}.receipt-header strong{font-size:20px;letter-spacing:1px}.receipt-header div span{margin-top:3px;color:#777;font-size:10px;letter-spacing:2px}.receipt-address{margin:20px 0;color:#555}.receipt-line{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-bottom:1px solid #eee}.receipt-line span{color:#777}.receipt-line strong{text-align:right}.receipt-paper hr{height:1px;margin:16px 0;border:0;background:#d4af37}.receipt-footer{margin:20px 0 0;text-align:center;color:#555}@media print{body{padding:0;background:#fff}.receipt-paper{width:100%;border:0;padding:20mm}.receipt-line{break-inside:avoid}}
    </style></head><body>${receiptMarkup(receipt)}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => printWindow.print();
}

export function downloadReceiptPdf(receipt) {
  const PdfDocument = window.jspdf?.jsPDF;
  if (!PdfDocument) throw new Error("The PDF library did not load. Use PRINT and choose Save as PDF.");
  const pdf = new PdfDocument({ unit: "mm", format: "a4" });
  const left = 22;
  let top = 24;
  pdf.setDrawColor(212, 175, 55);
  pdf.setLineWidth(0.5);
  pdf.rect(left, top, 16, 16);
  pdf.setTextColor(139, 109, 17);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("TGG", left + 3.2, top + 10);
  pdf.setTextColor(15, 15, 15);
  pdf.setFontSize(17);
  pdf.text("TALHA GOLD GYM", left + 22, top + 7);
  pdf.setFontSize(8);
  pdf.setTextColor(110, 110, 110);
  pdf.text("PAYMENT RECEIPT", left + 22, top + 13);
  top += 27;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(["Jama Hari Masjid,", "Kumbhar Wara Road,", "Lyari, Karachi, Pakistan"], left, top);
  top += 25;
  pdf.setDrawColor(212, 175, 55);
  pdf.line(left, top, 188, top);
  top += 9;
  const details = [
    ["Receipt No.", receipt.receiptId], ["Payment Date", dateString(receipt.paymentDate)],
    ["Transaction ID", receipt.transactionId || "—"], ["Member ID", receipt.memberId],
    ["Member Name", receipt.memberName], ["Phone", receipt.phone || "—"],
    ["Plan", receipt.planName], ["Amount", money(receipt.amount)],
    ["Payment Method", receipt.paymentMethod], ["Status", receipt.status]
  ];
  details.forEach(([label, value]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(105, 105, 105);
    pdf.text(label, left, top);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(20, 20, 20);
    const lines = pdf.splitTextToSize(String(value || "—"), 95);
    pdf.text(lines, 188, top, { align: "right" });
    top += Math.max(9, lines.length * 5);
    pdf.setDrawColor(230, 230, 230);
    pdf.line(left, top - 3, 188, top - 3);
  });
  top += 8;
  pdf.setTextColor(80, 80, 80);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Thank you for training with TALHA GOLD GYM.", 105, top, { align: "center" });
  pdf.save(`${String(receipt.receiptId || "TGG-receipt").replace(/[^A-Za-z0-9_-]/g, "")}.pdf`);
}

export function shareReceiptOnWhatsApp(receipt) {
  const address = `TALHA GOLD GYM\nJama Hari Masjid, Kumbhar Wara Road,\nLyari, Karachi, Pakistan`;
  const message = [
    "TALHA GOLD GYM",
    "Payment Receipt",
    "",
    `Receipt No: ${receipt.receiptId}`,
    `Member: ${receipt.memberName}`,
    `Member ID: ${receipt.memberId}`,
    `Plan: ${receipt.planName}`,
    `Amount: ${money(receipt.amount)}`,
    `Payment Date: ${dateString(receipt.paymentDate)}`,
    `Payment Method: ${receipt.paymentMethod || "Cash"}`,
    `Status: ${receipt.status}`,
    "",
    "Thank you for training with TALHA GOLD GYM.",
    "",
    address
  ].join("\n");

  const digits = (receipt.phone || "").replace(/\D/g, "");
  let phoneParam = "";
  if (digits.startsWith("03") && digits.length === 11) {
    phoneParam = `92${digits.slice(1)}`;
  } else if (digits.startsWith("3") && digits.length === 10) {
    phoneParam = `92${digits}`;
  } else if (digits.startsWith("92") && digits.length === 12) {
    phoneParam = digits;
  } else if (digits.length >= 10 && digits.length <= 15) {
    phoneParam = digits;
  }

  const url = phoneParam
    ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank", "noopener,noreferrer");
}
