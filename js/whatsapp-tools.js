/**
 * TALHA GOLD GYM — WhatsApp Communication & Template Engine
 * Handles safe Pakistani phone normalization, template rendering, and click-to-chat links.
 */

const ADDRESS_FOOTER = `TALHA GOLD GYM
Jama Hari Masjid, Kumbhar Wara Road,
Lyari, Karachi, Pakistan`;

/**
 * Normalizes Pakistani and international phone numbers into safe WhatsApp format.
 * Pakistani numbers:
 *   03001234567 -> 923001234567
 *   +92 300 1234567 -> 923001234567
 *   0300-1234567 -> 923001234567
 *   3001234567 -> 923001234567
 *   +923001234567 -> 923001234567
 */
export function normalizePhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== "string") {
    return { valid: false, cleanPhone: "", display: "No phone number", error: "WhatsApp number is not available." };
  }

  // Strip all non-digit characters except leading plus if any
  const trimmed = rawPhone.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (!digitsOnly || digitsOnly.length < 9) {
    return { valid: false, cleanPhone: "", display: trimmed || "Invalid phone", error: "WhatsApp number is not available." };
  }

  let normalized = digitsOnly;

  // Handle Pakistani numbers
  if (normalized.startsWith("03") && normalized.length === 11) {
    normalized = `92${normalized.slice(1)}`;
  } else if (normalized.startsWith("3") && normalized.length === 10) {
    normalized = `92${normalized}`;
  } else if (normalized.startsWith("0092") && normalized.length === 14) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith("92") && normalized.length === 12) {
    // Already in correct 923xxxxxxxxx format
  } else if (normalized.length === 10 && !normalized.startsWith("92")) {
    // If standard 10-digit without country code, assume Pakistan if starts with 3
    if (normalized.startsWith("3")) normalized = `92${normalized}`;
  }

  // Validate length (Pakistani numbers are 12 digits with 92 prefix, international 10-15)
  if (normalized.length < 10 || normalized.length > 15) {
    return { valid: false, cleanPhone: "", display: trimmed, error: "WhatsApp number is not available." };
  }

  // Format display string nicely
  let display = normalized;
  if (normalized.startsWith("92") && normalized.length === 12) {
    display = `+92 ${normalized.slice(2, 5)} ${normalized.slice(5)}`;
  } else {
    display = `+${normalized}`;
  }

  return { valid: true, cleanPhone: normalized, display, error: null };
}

/**
 * Default editable WhatsApp message templates for TALHA GOLD GYM
 */
export const DEFAULT_WHATSAPP_TEMPLATES = {
  MEMBERSHIP_EXPIRY: {
    id: "MEMBERSHIP_EXPIRY",
    title: "Membership Expiry Reminder",
    category: "Membership",
    template: `Hello {memberName},

Your TALHA GOLD GYM membership is expiring on {expiryDate}.

Member ID: {memberId}
Plan: {planName}

Please contact TALHA GOLD GYM for renewal.

Thank you.

${ADDRESS_FOOTER}`
  },

  MEMBERSHIP_EXPIRED: {
    id: "MEMBERSHIP_EXPIRED",
    title: "Membership Expired Notification",
    category: "Membership",
    template: `Hello {memberName},

Your TALHA GOLD GYM membership has expired on {expiryDate}.

Member ID: {memberId}
Plan: {planName}

Please visit TALHA GOLD GYM or contact reception to renew your membership.

Thank you.

${ADDRESS_FOOTER}`
  },

  PAYMENT_REMINDER: {
    id: "PAYMENT_REMINDER",
    title: "Payment Reminder",
    category: "Finance",
    template: `Hello {memberName},

This is a gentle payment reminder for your TALHA GOLD GYM membership ({planName}).

Member ID: {memberId}
Amount Due: {amount}

Please settle your pending dues at the front desk or via our supported payment channels.

Thank you.

${ADDRESS_FOOTER}`
  },

  PAYMENT_SUCCESS: {
    id: "PAYMENT_SUCCESS",
    title: "Payment Successful",
    category: "Finance",
    template: `Hello {memberName},

Your payment of {amount} for {planName} has been received successfully.

Member ID: {memberId}
Receipt ID: {receiptId}
Payment Date: {paymentDate}

Thank you for choosing TALHA GOLD GYM.

${ADDRESS_FOOTER}`
  },

  PAYMENT_RECEIPT: {
    id: "PAYMENT_RECEIPT",
    title: "Payment Receipt",
    category: "Finance",
    template: `TALHA GOLD GYM
Payment Receipt

Receipt No: {receiptId}
Member: {memberName}
Member ID: {memberId}
Plan: {planName}
Amount: {amount}
Payment Date: {paymentDate}
Payment Method: {paymentMethod}
Status: {status}

Thank you for training with TALHA GOLD GYM.

${ADDRESS_FOOTER}`
  },

  ATTENDANCE: {
    id: "ATTENDANCE",
    title: "Attendance Notification",
    category: "Attendance",
    template: `Hello {memberName},

Attendance update for {date}:
Status: {attendanceStatus}
Time Slot: {timeSlot}
Member ID: {memberId}

Keep up your workout consistency!

${ADDRESS_FOOTER}`
  },

  WORKOUT: {
    id: "WORKOUT",
    title: "Workout Plan Update",
    category: "Training",
    template: `Hello {memberName},

Your workout plan '{workoutPlanName}' has been assigned/updated by Trainer {trainerName}.

Start Date: {startDate}
End Date: {endDate}

Please check your member portal or consult with your trainer during your session.

${ADDRESS_FOOTER}`
  },

  DIET: {
    id: "DIET",
    title: "Diet Plan Update",
    category: "Training",
    template: `Hello {memberName},

Your nutrition and diet plan '{dietPlanName}' has been assigned/updated by Trainer {trainerName}.

Start Date: {startDate}
End Date: {endDate}

Check your member portal for full daily nutrition and meal targets.

${ADDRESS_FOOTER}`
  },

  PROGRESS: {
    id: "PROGRESS",
    title: "Progress Update",
    category: "Training",
    template: `Hello {memberName},

Your fitness progress record for {date} has been logged.

Weight: {weight}
Member ID: {memberId}

Great job staying committed to your fitness goals!

${ADDRESS_FOOTER}`
  },

  GENERAL: {
    id: "GENERAL",
    title: "General Message",
    category: "General",
    template: `Hello {memberName},

{customMessage}

Member ID: {memberId}

Best regards,
${ADDRESS_FOOTER}`
  }
};

/**
 * Replaces variables inside a template string with actual member/payment values.
 */
export function renderWhatsAppMessage(templateText, variables = {}) {
  if (!templateText) return "";

  let rendered = templateText;
  const defaults = {
    memberName: "Member",
    memberId: "—",
    planName: "Standard",
    expiryDate: "—",
    amount: "—",
    receiptId: "—",
    trainerName: "Gym Trainer",
    timeSlot: "General",
    date: "Today",
    attendanceStatus: "Present",
    workoutPlanName: "Workout Routine",
    dietPlanName: "Diet Plan",
    startDate: "—",
    endDate: "—",
    paymentDate: "Today",
    paymentMethod: "Cash",
    status: "Success",
    weight: "—",
    customMessage: ""
  };

  const context = { ...defaults, ...variables };

  for (const [key, val] of Object.entries(context)) {
    const pattern = new RegExp(`\\{${key}\\}`, "g");
    rendered = rendered.replace(pattern, String(val ?? "—"));
  }

  return rendered.trim();
}

/**
 * Constructs a safe wa.me URL for the specified phone number and message.
 */
export function getWhatsAppUrl(phone, message) {
  const norm = normalizePhoneNumber(phone);
  if (!norm.valid) {
    throw new Error(norm.error || "WhatsApp number is not available.");
  }
  const encoded = encodeURIComponent(message || "");
  return `https://wa.me/${norm.cleanPhone}?text=${encoded}`;
}

/**
 * Opens WhatsApp in a new tab with pre-filled message.
 * User must manually click 'Send' in WhatsApp.
 */
export function openWhatsAppMessage(phone, message) {
  const norm = normalizePhoneNumber(phone);
  if (!norm.valid) {
    alert(norm.error || "WhatsApp number is not available.");
    return false;
  }
  const url = getWhatsAppUrl(phone, message);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    alert("Popup blocked. Please allow popups for this site to open WhatsApp.");
    return false;
  }
  return true;
}
