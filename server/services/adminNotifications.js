const PlatformSettings = require("../models/PlatformSettings");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { withRetry } = require("../utils/retry");

const pendingNotifications = [];
let batchIntervalId = null;

const DEFAULT_ADMIN_NOTIFICATION_EVENTS = {
  newBuyer: true,
  newSeller: true,
  newRequirement: true,
  newOffer: true,
  highValueOffer: true,
  reverseAuction: true,
  whatsappInteraction: true,
  userReport: true,
  sellerApproved: false,
  moderationAlert: true,
  autoPost: true
};

async function getAdminSettings() {
  try {
    const settings = await PlatformSettings.findOne().lean();
    const adminNotifications = settings?.adminNotifications;
    if (adminNotifications) {
      return {
        ...adminNotifications,
        events: {
          ...DEFAULT_ADMIN_NOTIFICATION_EVENTS,
          ...(adminNotifications.events || {})
        }
      };
    }
    return {
      enabled: false,
      mobileNumbers: [],
      instantEnabled: true,
      batchEnabled: true,
      batchIntervalMinutes: 60,
      minOfferValue: 10000,
      events: DEFAULT_ADMIN_NOTIFICATION_EVENTS
    };
  } catch (err) {
    console.log("[AdminNotify] Error loading settings:", err.message);
    return null;
  }
}

function normalizeMobile(mobile) {
  if (!mobile) return null;
  const num = String(mobile).replace(/[^\d]/g, "");
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
      await withRetry(
        () => sendWhatsAppMessage({ to: mobile, body: message }),
        { maxAttempts: 2, baseDelayMs: 300 }
      );
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

  try {
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
      "--------------------",
      `Time: ${new Date().toLocaleString("en-IN")}`,
      "",
      `Total Events: ${pendingNotifications.length}`,
      ""
    ];

    if (grouped.newBuyer?.length) {
      lines.push(`NEW BUYERS: ${grouped.newBuyer.length}`);
      grouped.newBuyer.slice(0, 3).forEach((n) => {
        lines.push(`  +91${String(n.mobile).slice(-10)} | ${n.city || "N/A"}`);
      });
      if (grouped.newBuyer.length > 3) {
        lines.push(`  ... and ${grouped.newBuyer.length - 3} more`);
      }
      lines.push("");
    }

    if (grouped.newSeller?.length) {
      lines.push(`NEW SELLERS: ${grouped.newSeller.length}`);
      grouped.newSeller.slice(0, 3).forEach((n) => {
        lines.push(`  +91${String(n.mobile).slice(-10)} | ${n.city || "N/A"} | ${n.registeredBusinessName || "N/A"}`);
      });
      if (grouped.newSeller.length > 3) {
        lines.push(`  ... and ${grouped.newSeller.length - 3} more`);
      }
      lines.push("");
    }

    if (grouped.newRequirement?.length) {
      lines.push(`NEW REQUIREMENTS: ${grouped.newRequirement.length}`);
      grouped.newRequirement.slice(0, 3).forEach((n) => {
        lines.push(`  ${n.product} | ${n.city} | Qty: ${n.quantity}`);
      });
      if (grouped.newRequirement.length > 3) {
        lines.push(`  ... and ${grouped.newRequirement.length - 3} more`);
      }
      lines.push("");
    }

    if (grouped.newOffer?.length) {
      lines.push(`NEW OFFERS: ${grouped.newOffer.length}`);
      grouped.newOffer.slice(0, 3).forEach((n) => {
        lines.push(`  Rs ${n.price?.toLocaleString()} | ${n.product} | ${n.seller || "Seller"}`);
      });
      if (grouped.newOffer.length > 3) {
        lines.push(`  ... and ${grouped.newOffer.length - 3} more`);
      }
      lines.push("");
    }

    if (grouped.highValueOffer?.length) {
      lines.push(`HIGH VALUE OFFERS: ${grouped.highValueOffer.length}`);
      grouped.highValueOffer.slice(0, 3).forEach((n) => {
        lines.push(`  Rs ${n.price?.toLocaleString()} | ${n.product} | SELLER: ${n.seller}`);
      });
      lines.push("");
    }

    if (grouped.reverseAuction?.length) {
      lines.push(`REVERSE AUCTIONS: ${grouped.reverseAuction.length}`);
      grouped.reverseAuction.slice(0, 3).forEach((n) => {
        lines.push(`  ${n.product} | ${n.city} | Min: Rs ${n.minPrice?.toLocaleString()}`);
      });
      lines.push("");
    }

    if (grouped.whatsappInteraction?.length) {
      lines.push(`WA INTERACTIONS: ${grouped.whatsappInteraction.length}`);
      grouped.whatsappInteraction.slice(0, 3).forEach((n) => {
        lines.push(`  +91${String(n.mobile).slice(-10)} | ${n.city || "N/A"}`);
      });
      lines.push("");
    }

    if (grouped.userReport?.length) {
      lines.push(`USER REPORTS: ${grouped.userReport.length}`);
      grouped.userReport.slice(0, 3).forEach((n) => {
        lines.push(`  ${n.category} | Reporter: ${n.reporter || "N/A"}`);
      });
      lines.push("");
    }

    if (grouped.moderationAlert?.length) {
      lines.push(`MODERATION ALERTS: ${grouped.moderationAlert.length}`);
      grouped.moderationAlert.slice(0, 3).forEach((n) => {
        lines.push(`  ${n.reason} | ${n.type || "Content"}`);
      });
      lines.push("");
    }

    if (grouped.autoPost?.length) {
      lines.push(`AI AUTO POSTS: ${grouped.autoPost.length}`);
      grouped.autoPost.slice(0, 3).forEach((n) => {
        lines.push(`  ${n.sent || 0} sent | ${n.channels || "-"} | ${n.result || "checked"}`);
      });
      lines.push("");
    }

    lines.push("--------------------");
    lines.push("View Dashboard: hoko.app/admin");

    const message = lines.join("\n");

    for (const mobile of mobiles) {
      try {
        await withRetry(
          () => sendWhatsAppMessage({ to: mobile, body: message }),
          { maxAttempts: 2, baseDelayMs: 300 }
        );
        console.log(`[AdminNotify] Batch sent to ${mobile}`);
      } catch (err) {
        console.log(`[AdminNotify] Batch failed to ${mobile}:`, err.message);
      }
    }

    pendingNotifications.length = 0;
  } catch (err) {
    console.log("[AdminNotify] Batch flush failed:", err?.message || err);
  }
}

function startBatchProcessor() {
  if (batchIntervalId) return;

  getAdminSettings().then((settings) => {
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

async function notifyNewSeller(mobile, city, registeredBusinessName, email) {
  const settings = await getAdminSettings();
  if (!shouldNotify("newSeller", settings)) return;

  const message = [
    "HOKO - NEW SELLER",
    "",
    "Mobile: +91" + String(mobile || "").slice(-10),
    "City: " + (city || "N/A"),
    "Business: " + (registeredBusinessName || "N/A"),
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
    addToBatch({ type: "newSeller", mobile, city, registeredBusinessName, email });
  }
}

async function notifyAiContentAutoPost(summary = {}) {
  const settings = await getAdminSettings();
  if (!shouldNotify("autoPost", settings)) return;

  const duePlatforms = Array.isArray(summary.duePlatforms) ? summary.duePlatforms : [];
  const postedPlatforms = Array.isArray(summary.markedPlatforms) ? summary.markedPlatforms : [];
  const failures = Array.isArray(summary.failures) ? summary.failures : [];
  const sent = Number(summary.sent || 0);
  const picked = Number(summary.picked || 0);
  const channels = postedPlatforms.length ? postedPlatforms : duePlatforms;
  const result = sent > 0 ? "posted" : (summary.reason || "checked");
  const description = [
    `Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    `Posts: ${sent} sent${picked ? ` from ${picked} picked` : ""}`,
    `Channels: ${channels.join(", ") || "-"}`,
    `Result: ${result}`,
    failures.length ? `Failed drafts: ${failures.length}` : ""
  ].filter(Boolean).join("\n");

  if (settings.instantEnabled) {
    await sendToAdmin(description);
  }

  if (settings.batchEnabled) {
    addToBatch({
      type: "autoPost",
      sent,
      picked,
      channels: channels.join(", ") || "-",
      result
    });
  }
}

module.exports = {
  getAdminSettings,
  normalizeMobile,
  shouldNotify,
  sendToAdmin,
  addToBatch,
  flushBatch,
  startBatchProcessor,
  stopBatchProcessor,
  notifyNewBuyer,
  notifyNewSeller,
  notifyAiContentAutoPost
};
