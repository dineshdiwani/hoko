const PlatformSettings = require("../models/PlatformSettings");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");

const pendingNotifications = [];
let batchIntervalId = null;

async function getAdminSettings() {
  try {
    const settings = await PlatformSettings.findOne().lean();
    return settings?.adminNotifications || {
      enabled: false,
      mobileNumbers: [],
      instantEnabled: true,
      batchEnabled: true,
      batchIntervalMinutes: 60,
      minOfferValue: 10000,
      events: {
        newBuyer: true,
        newSeller: true,
        newRequirement: true,
        newOffer: true,
        highValueOffer: true,
        reverseAuction: true,
        whatsappInteraction: true,
        userReport: true,
        sellerApproved: false,
        moderationAlert: true
      }
    };
  } catch (err) {
    console.log("[AdminNotify] Error loading settings:", err.message);
    return null;
  }
}

function normalizeMobile(mobile) {
  if (!mobile) return null;
  let num = String(mobile).replace(/[^\d]/g, "");
  if (num.startsWith("91") && num.length === 12) {
    return `+${num}`;
  }
  if (num.length === 10) {
    return `+91${num}`;
  }
  if (num.startsWith("+")) {
    return num;
  }
  return null;
}

function shouldNotify(eventType, settings) {
  if (!settings?.enabled) return false;
  if (!settings?.mobileNumbers?.length) return false;
  if (!settings?.events?.[eventType]) return false;
  return true;
}

async function sendToAdmin(message) {
  const settings = await getAdminSettings();
  if (!settings?.enabled || !settings?.mobileNumbers?.length) return;

  const mobiles = settings.mobileNumbers
    .map(normalizeMobile)
    .filter(Boolean);

  if (!mobiles.length) return;

  for (const mobile of mobiles) {
    try {
      await sendWhatsAppMessage({ to: mobile, body: message });
      console.log(`[AdminNotify] Sent to ${mobile}: ${message.substring(0, 50)}...`);
    } catch (err) {
      console.log(`[AdminNotify] Failed to send to ${mobile}:`, err.message);
    }
  }
}

function addToBatch(event) {
  pendingNotifications.push({
    ...event,
    timestamp: new Date()
  });
}

async function flushBatch() {
  if (!pendingNotifications.length) return;

  const settings = await getAdminSettings();
  if (!settings?.enabled || !settings?.batchEnabled) {
    pendingNotifications.length = 0;
    return;
  }

  const mobiles = settings.mobileNumbers
    .map(normalizeMobile)
    .filter(Boolean);

  if (!mobiles.length) {
    pendingNotifications.length = 0;
    return;
  }

  const grouped = {};
  for (const notif of pendingNotifications) {
    const key = notif.type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(notif);
  }

  const lines = [
    "HOKO ACTIVITY SUMMARY",
    "━━━━━━━━━━━━━━━━━━━━",
    `Time: ${new Date().toLocaleString("en-IN")}`,
    "",
    `Total Events: ${pendingNotifications.length}`,
    ""
  ];

  if (grouped.newBuyer?.length) {
    lines.push(`NEW BUYERS: ${grouped.newBuyer.length}`);
    grouped.newBuyer.slice(0, 3).forEach(n => {
      lines.push(`  +91${String(n.mobile).slice(-10)} | ${n.city || "N/A"}`);
    });
    if (grouped.newBuyer.length > 3) {
      lines.push(`  ... and ${grouped.newBuyer.length - 3} more`);
    }
    lines.push("");
  }

  if (grouped.newSeller?.length) {
    lines.push(`NEW SELLERS: ${grouped.newSeller.length}`);
    grouped.newSeller.slice(0, 3).forEach(n => {
      lines.push(`  +91${String(n.mobile).slice(-10)} | ${n.city || "N/A"} | ${n.firmName || "N/A"}`);
    });
    if (grouped.newSeller.length > 3) {
      lines.push(`  ... and ${grouped.newSeller.length - 3} more`);
    }
    lines.push("");
  }

  if (grouped.newRequirement?.length) {
    lines.push(`NEW REQUIREMENTS: ${grouped.newRequirement.length}`);
    grouped.newRequirement.slice(0, 3).forEach(n => {
      lines.push(`  ${n.product} | ${n.city} | Qty: ${n.quantity}`);
    });
    if (grouped.newRequirement.length > 3) {
      lines.push(`  ... and ${grouped.newRequirement.length - 3} more`);
    }
    lines.push("");
  }

  if (grouped.newOffer?.length) {
    lines.push(`NEW OFFERS: ${grouped.newOffer.length}`);
    grouped.newOffer.slice(0, 3).forEach(n => {
      lines.push(`  Rs ${n.price?.toLocaleString()} | ${n.product} | ${n.seller || "Seller"}`);
    });
    if (grouped.newOffer.length > 3) {
      lines.push(`  ... and ${grouped.newOffer.length - 3} more`);
    }
    lines.push("");
  }

  if (grouped.highValueOffer?.length) {
    lines.push(`HIGH VALUE OFFERS: ${grouped.highValueOffer.length}`);
    grouped.highValueOffer.slice(0, 3).forEach(n => {
      lines.push(`  Rs ${n.price?.toLocaleString()} | ${n.product} | SELLER: ${n.seller}`);
    });
    lines.push("");
  }

  if (grouped.reverseAuction?.length) {
    lines.push(`REVERSE AUCTIONS: ${grouped.reverseAuction.length}`);
    grouped.reverseAuction.slice(0, 3).forEach(n => {
      lines.push(`  ${n.product} | ${n.city} | Min: Rs ${n.minPrice?.toLocaleString()}`);
    });
    lines.push("");
  }

  if (grouped.whatsappInteraction?.length) {
    lines.push(`WA INTERACTIONS: ${grouped.whatsappInteraction.length}`);
    grouped.whatsappInteraction.slice(0, 3).forEach(n => {
      lines.push(`  +91${String(n.mobile).slice(-10)} | ${n.city || "N/A"}`);
    });
    lines.push("");
  }

  if (grouped.userReport?.length) {
    lines.push(`USER REPORTS: ${grouped.userReport.length}`);
    grouped.userReport.slice(0, 3).forEach(n => {
      lines.push(`  ${n.category} | Reporter: ${n.reporter || "N/A"}`);
    });
    lines.push("");
  }

  if (grouped.moderationAlert?.length) {
    lines.push(`MODERATION ALERTS: ${grouped.moderationAlert.length}`);
    grouped.moderationAlert.slice(0, 3).forEach(n => {
      lines.push(`  ${n.reason} | ${n.type || "Content"}`);
    });
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("View Dashboard: hoko.app/admin");

  const message = lines.join("\n");

  for (const mobile of mobiles) {
    try {
      await sendWhatsAppMessage({ to: mobile, body: message });
      console.log(`[AdminNotify] Batch sent to ${mobile}`);
    } catch (err) {
      console.log(`[AdminNotify] Batch failed to ${mobile}:`, err.message);
    }
  }

  pendingNotifications.length = 0;
}

function startBatchProcessor() {
  if (batchIntervalId) return;
  
  getAdminSettings().then(settings => {
    const intervalMs = (settings?.batchIntervalMinutes || 60) * 60 * 1000;
    batchIntervalId = setInterval(flushBatch, intervalMs);
    console.log(`[AdminNotify] Batch processor started - interval: ${settings?.batchIntervalMinutes || 60} mins`);
  });
}

function stopBatchProcessor() {
  if (batchIntervalId) {
    clearInterval(batchIntervalId);
    batchIntervalId = null;
  }
}

async function notifyNewBuyer(mobile, city, email) {
  const settings = await getAdminSettings();
  if (!shouldNotify("newBuyer", settings)) return;

  const message = [
    "HOKO - NEW BUYER",
    "",
    "Mobile: +91" + String(mobile || "").slice(-10),
    "City: " + (city || "N/A"),
    email ? "Email: " + email : "",
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "View: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "newBuyer", mobile, city, email });
  }
}

async function notifyNewSeller(mobile, city, firmName, email) {
  const settings = await getAdminSettings();
  if (!shouldNotify("newSeller", settings)) return;

  const message = [
    "HOKO - NEW SELLER",
    "",
    "Mobile: +91" + String(mobile || "").slice(-10),
    "City: " + (city || "N/A"),
    "Firm: " + (firmName || "N/A"),
    email ? "Email: " + email : "",
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "View: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "newSeller", mobile, city, firmName, email });
  }
}

async function notifyNewRequirement(product, city, quantity, unit, mobile, requirementId) {
  const settings = await getAdminSettings();
  if (!shouldNotify("newRequirement", settings)) return;

  const message = [
    "HOKO - NEW REQUIREMENT",
    "",
    "Product: " + (product || "N/A"),
    "City: " + (city || "N/A"),
    "Quantity: " + (quantity || "?") + " " + (unit || "pcs"),
    "Mobile: +91" + String(mobile || "").slice(-10),
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "Link: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "newRequirement", product, city, quantity, unit, mobile, requirementId });
  }
}

async function notifyNewOffer(price, product, seller, sellerMobile, requirementCity, requirementId) {
  const settings = await getAdminSettings();
  if (!shouldNotify("newOffer", settings)) return;

  const isHighValue = price >= (settings?.minOfferValue || 10000);

  if (isHighValue && !shouldNotify("highValueOffer", settings)) return;

  const message = [
    isHighValue ? "HOKO - HIGH VALUE OFFER" : "HOKO - NEW OFFER",
    "",
    "Amount: Rs " + (price || 0).toLocaleString(),
    "Product: " + (product || "N/A"),
    "Seller: " + (seller || "N/A"),
    "Seller Mobile: +91" + String(sellerMobile || "").slice(-10),
    "Requirement City: " + (requirementCity || "N/A"),
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "View: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ 
      type: isHighValue ? "highValueOffer" : "newOffer", 
      price, product, seller, sellerMobile, requirementCity, requirementId 
    });
  }
}

async function notifyReverseAuction(product, city, minPrice, mobile, requirementId) {
  const settings = await getAdminSettings();
  if (!shouldNotify("reverseAuction", settings)) return;

  const message = [
    "HOKO - REVERSE AUCTION STARTED",
    "",
    "Product: " + (product || "N/A"),
    "City: " + (city || "N/A"),
    "Min Price: Rs " + (minPrice || 0).toLocaleString(),
    "Mobile: +91" + String(mobile || "").slice(-10),
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "View: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "reverseAuction", product, city, minPrice, mobile, requirementId });
  }
}

async function notifyWhatsAppInteraction(mobile, city, message) {
  const settings = await getAdminSettings();
  if (!shouldNotify("whatsappInteraction", settings)) return;

  const msg = [
    "HOKO - WHATSAPP INTERACTION",
    "",
    "Mobile: +91" + String(mobile || "").slice(-10),
    "City: " + (city || "N/A"),
    "",
    "Message: " + (message || "N/A"),
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "View: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(msg);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "whatsappInteraction", mobile, city, message });
  }
}

async function notifyUserReport(category, details, reporterMobile, reportedMobile) {
  const settings = await getAdminSettings();
  if (!shouldNotify("userReport", settings)) return;

  const message = [
    "HOKO - USER REPORT",
    "",
    "Category: " + (category || "N/A"),
    "Details: " + (details || "N/A"),
    "Reporter: +91" + String(reporterMobile || "").slice(-10),
    "Reported: +91" + String(reportedMobile || "").slice(-10),
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "Action Required: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "userReport", category, details, reporterMobile, reportedMobile });
  }
}

async function notifyModerationAlert(reason, type, itemId) {
  const settings = await getAdminSettings();
  if (!shouldNotify("moderationAlert", settings)) return;

  const message = [
    "HOKO - MODERATION ALERT",
    "",
    "Reason: " + (reason || "N/A"),
    "Type: " + (type || "Content"),
    "Item ID: " + (itemId || "N/A"),
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "Action Required: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "moderationAlert", reason, type, itemId });
  }
}

async function notifySellerApproved(mobile, firmName, city) {
  const settings = await getAdminSettings();
  if (!shouldNotify("sellerApproved", settings)) return;

  const message = [
    "HOKO - SELLER APPROVED",
    "",
    "Mobile: +91" + String(mobile || "").slice(-10),
    "Firm: " + (firmName || "N/A"),
    "City: " + (city || "N/A"),
    "",
    "Time: " + new Date().toLocaleString("en-IN"),
    "",
    "View: hoko.app/admin"
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(message);
  }
  
  if (settings.batchEnabled) {
    addToBatch({ type: "sellerApproved", mobile, firmName, city });
  }
}

module.exports = {
  startBatchProcessor,
  stopBatchProcessor,
  flushBatch,
  notifyNewBuyer,
  notifyNewSeller,
  notifyNewRequirement,
  notifyNewOffer,
  notifyReverseAuction,
  notifyWhatsAppInteraction,
  notifyUserReport,
  notifyModerationAlert,
  notifySellerApproved
};
