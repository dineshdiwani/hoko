const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const ChatMessage = require("../models/ChatMessage");
const Report = require("../models/Report");
const PlatformSettings = require("../models/PlatformSettings");
const WhatsAppContact = require("../models/WhatsAppContact");
const AdminAuditLog = require("../models/AdminAuditLog");
const adminAuth = require("../middleware/adminAuth");
const { normalizeE164 } = require("../utils/sendWhatsApp");
const {
  buildOptionsResponse,
  DEFAULT_CITIES,
  DEFAULT_CATEGORIES,
  DEFAULT_UNITS,
  DEFAULT_CURRENCIES,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_WHATSAPP_CAMPAIGN,
  DEFAULT_MODERATION_RULES,
  DEFAULT_TERMS_CONTENT
} = require("../config/platformDefaults");
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function toDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseWhatsAppContactsFromWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: ""
  });

  const contacts = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const firmName = String(row[0] || "").trim();
    const city = String(row[1] || "").trim();
    const countryCodeRaw = toDigits(row[2]);
    const mobileRaw = toDigits(row[3]);
    if (!city || !countryCodeRaw || !mobileRaw) {
      continue;
    }
    const mobileE164 = normalizeE164(`${countryCodeRaw}${mobileRaw}`);
    if (!mobileE164) continue;
    contacts.push({
      firmName,
      city,
      cityNormalized: normalizeText(city),
      countryCode: `+${countryCodeRaw}`,
      mobileNumber: mobileRaw,
      mobileE164,
      active: true,
      source: "admin_excel"
    });
  }

  return contacts;
}


router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });

  if (!admin || admin.password !== password) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      id: admin._id,
      role: "admin"
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

async function logAdminAction(admin, action, targetType, targetId, meta = {}) {
  try {
    await AdminAuditLog.create({
      adminId: admin?._id || null,
      action,
      targetType,
      targetId: String(targetId),
      meta
    });
  } catch {
    // best effort
  }
}

/**
 * GET all users (buyers + sellers + admins)
 */
router.get("/users", adminAuth, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

/**
 * Approve or block seller
 */
router.post("/seller/approve", adminAuth, async (req, res) => {
  const { sellerId, approved } = req.body;

  await User.findByIdAndUpdate(sellerId, {
    "sellerProfile.approved": approved
  });

  await logAdminAction(req.admin, "seller_approval", "user", sellerId, {
    approved
  });

  res.json({
    message: approved ? "Seller approved" : "Seller blocked"
  });
});

/**
 * Block or unblock user
 */
router.post("/user/block", adminAuth, async (req, res) => {
  const { userId, blocked } = req.body;
  await User.findByIdAndUpdate(userId, { blocked: Boolean(blocked) });
  await logAdminAction(req.admin, "user_block", "user", userId, {
    blocked: Boolean(blocked)
  });
  res.json({ message: blocked ? "User blocked" : "User unblocked" });
});

/**
 * Force logout / revoke user token
 */
router.post("/user/force-logout", adminAuth, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId required" });
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await logAdminAction(req.admin, "force_logout", "user", userId);
  res.json({ success: true });
});

/**
 * Toggle chat for a user
 */
router.post("/user/chat-toggle", adminAuth, async (req, res) => {
  const { userId, disabled, reason } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId required" });
  const update = {
    chatDisabled: Boolean(disabled),
    chatDisabledReason: reason || ""
  };
  await User.findByIdAndUpdate(userId, update);
  await logAdminAction(req.admin, "chat_toggle_user", "user", userId, update);
  res.json({ success: true });
});

/**
 * View all buyer requirements (moderation)
 */
router.get("/requirements", adminAuth, async (req, res) => {
  const requirements = await Requirement.find()
    .populate("buyerId", "email city")
    .sort({ createdAt: -1 });
  res.json(requirements);
});

/**
 * Moderate a requirement (remove or restore)
 */
router.post("/requirement/:id/moderate", adminAuth, async (req, res) => {
  const { removed, reason } = req.body || {};
  const isRemoved = Boolean(removed);
  const update = {
    "moderation.removed": isRemoved,
    "moderation.removedAt": isRemoved ? new Date() : null,
    "moderation.removedBy": isRemoved ? req.admin?._id : null,
    "moderation.reason": isRemoved ? (reason || "Removed by admin") : ""
  };
  const requirement = await Requirement.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  await logAdminAction(req.admin, "moderate_requirement", "requirement", req.params.id, {
    removed: isRemoved,
    reason: update["moderation.reason"]
  });
  res.json(requirement);
});

/**
 * Back-compat: delete requirement (marks removed)
 */
router.delete("/requirement/:id", adminAuth, async (req, res) => {
  const update = {
    "moderation.removed": true,
    "moderation.removedAt": new Date(),
    "moderation.removedBy": req.admin?._id || null,
    "moderation.reason": "Removed by admin"
  };
  const requirement = await Requirement.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  await logAdminAction(req.admin, "moderate_requirement", "requirement", req.params.id, {
    removed: true,
    reason: update["moderation.reason"]
  });
  res.json({ message: "Requirement removed" });
});

/**
 * View all offers (moderation)
 */
router.get("/offers", adminAuth, async (req, res) => {
  const offers = await Offer.find()
    .populate("sellerId", "email city sellerProfile")
    .populate("requirementId", "product productName city category");
  res.json(offers);
});

/**
 * Delete an offer
 */
router.delete("/offer/:id", adminAuth, async (req, res) => {
  const update = {
    "moderation.removed": true,
    "moderation.removedAt": new Date(),
    "moderation.removedBy": req.admin?._id || null,
    "moderation.reason": "Removed by admin"
  };
  await Offer.findByIdAndUpdate(req.params.id, update);
  res.json({ message: "Offer removed" });
});

/**
 * Moderate an offer (remove or restore)
 */
router.post("/offer/:id/moderate", adminAuth, async (req, res) => {
  const { removed, reason } = req.body || {};
  const isRemoved = Boolean(removed);
  const update = {
    "moderation.removed": isRemoved,
    "moderation.removedAt": isRemoved ? new Date() : null,
    "moderation.removedBy": isRemoved ? req.admin?._id : null,
    "moderation.reason": isRemoved ? (reason || "Removed by admin") : ""
  };
  const offer = await Offer.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  await logAdminAction(req.admin, "moderate_offer", "offer", req.params.id, {
    removed: isRemoved,
    reason: update["moderation.reason"]
  });
  res.json(offer);
});

/**
 * View all chat messages (moderation)
 */
router.get("/chats", adminAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const chats = await ChatMessage.find()
    .populate("fromUserId", "email city roles")
    .populate("toUserId", "email city roles")
    .populate("requirementId", "product productName city category")
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json(chats);
});

/**
 * Moderate a chat message (remove or restore)
 */
router.post("/chat/:id/moderate", adminAuth, async (req, res) => {
  const { removed, reason } = req.body || {};
  const isRemoved = Boolean(removed);
  const update = {
    "moderation.removed": isRemoved,
    "moderation.removedAt": isRemoved ? new Date() : null,
    "moderation.removedBy": isRemoved ? req.admin?._id : null,
    "moderation.reason": isRemoved ? (reason || "Removed by admin") : ""
  };
  const chat = await ChatMessage.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  await logAdminAction(req.admin, "moderate_chat", "chat", req.params.id, {
    removed: isRemoved,
    reason: update["moderation.reason"]
  });
  res.json(chat);
});

/**
 * Reports (moderation)
 */
router.get("/reports", adminAuth, async (req, res) => {
  const reports = await Report.find()
    .populate("reporterId", "email city roles")
    .populate("reportedUserId", "email city roles")
    .populate("requirementId", "product productName city category")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(reports);
});

router.post("/report/:id/status", adminAuth, async (req, res) => {
  const { status, adminNote } = req.body || {};
  const update = {
    ...(status ? { status } : {}),
    ...(adminNote !== undefined ? { adminNote } : {})
  };
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );
  await logAdminAction(req.admin, "report_status", "report", req.params.id, update);
  res.json(report);
});

/**
 * Moderation queue (flagged content)
 */
router.get("/moderation/queue", adminAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const [requirements, offers, chats] = await Promise.all([
    Requirement.find({
      "moderation.flagged": true,
      "moderation.removed": { $ne: true }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("buyerId", "email city"),
    Offer.find({
      "moderation.flagged": true,
      "moderation.removed": { $ne: true }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sellerId", "email city sellerProfile")
      .populate("requirementId", "product productName city category"),
    ChatMessage.find({
      "moderation.flagged": true,
      "moderation.removed": { $ne: true }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("fromUserId", "email city roles")
      .populate("toUserId", "email city roles")
      .populate("requirementId", "product productName city category")
  ]);

  res.json({ requirements, offers, chats });
});

/**
 * Toggle chat on a requirement
 */
router.post("/requirement/chat-toggle", adminAuth, async (req, res) => {
  const { requirementId, disabled, reason } = req.body || {};
  if (!requirementId) {
    return res.status(400).json({ message: "requirementId required" });
  }
  const update = {
    chatDisabled: Boolean(disabled),
    chatDisabledReason: reason || ""
  };
  await Requirement.findByIdAndUpdate(requirementId, update);
  await logAdminAction(req.admin, "chat_toggle_requirement", "requirement", requirementId, update);
  res.json({ success: true });
});

/**
 * Get platform dropdown options
 */
router.get("/options", adminAuth, async (req, res) => {
  const doc = await PlatformSettings.findOne();
  res.json(buildOptionsResponse(doc));
});

/**
 * Update platform dropdown options
 */
router.put("/options", adminAuth, async (req, res) => {
  const payload = req.body || {};
  const current = await PlatformSettings.findOne().lean();

  const next = {
    cities: Array.isArray(payload.cities) ? payload.cities : (current?.cities || DEFAULT_CITIES),
    categories: Array.isArray(payload.categories) ? payload.categories : (current?.categories || DEFAULT_CATEGORIES),
    units: Array.isArray(payload.units) ? payload.units : (current?.units || DEFAULT_UNITS),
    currencies: Array.isArray(payload.currencies) ? payload.currencies : (current?.currencies || DEFAULT_CURRENCIES),
    notifications: payload.notifications || current?.notifications || DEFAULT_NOTIFICATIONS,
    whatsAppCampaign:
      payload.whatsAppCampaign ||
      current?.whatsAppCampaign ||
      DEFAULT_WHATSAPP_CAMPAIGN,
    moderationRules: payload.moderationRules || current?.moderationRules || DEFAULT_MODERATION_RULES,
    termsAndConditions: payload.termsAndConditions || current?.termsAndConditions || {
      content: DEFAULT_TERMS_CONTENT
    }
  };

  const doc = await PlatformSettings.findOneAndUpdate(
    {},
    next,
    { upsert: true, new: true }
  );
  await logAdminAction(req.admin, "update_options", "platform_settings", doc._id, {
    cities: next.cities.length,
    categories: next.categories.length,
    units: next.units.length,
    currencies: next.currencies.length
  });
  res.json(doc);
});

router.get("/whatsapp/contacts", adminAuth, async (req, res) => {
  const city = String(req.query.city || "").trim().toLowerCase();
  const query = city ? { cityNormalized: city } : {};
  const contacts = await WhatsAppContact.find(query)
    .sort({ updatedAt: -1 })
    .limit(1000);
  res.json(contacts);
});

router.get("/whatsapp/contacts/summary", adminAuth, async (req, res) => {
  const [total, cityRows] = await Promise.all([
    WhatsAppContact.countDocuments({ active: true }),
    WhatsAppContact.aggregate([
      { $match: { active: true } },
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);
  res.json({
    total,
    cities: cityRows.map((row) => ({
      city: row._id,
      count: row.count
    }))
  });
});

router.delete("/whatsapp/contacts/:id", adminAuth, async (req, res) => {
  const deleted = await WhatsAppContact.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Contact not found" });
  }
  await logAdminAction(req.admin, "delete_whatsapp_contact", "whatsapp_contact", req.params.id);
  res.json({ success: true });
});

router.post(
  "/whatsapp/contacts/upload",
  adminAuth,
  upload.single("file"),
  async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Excel file required" });
    }

    const mode = String(req.body?.mode || "replace").toLowerCase();
    let parsedContacts = [];
    try {
      parsedContacts = parseWhatsAppContactsFromWorkbook(req.file.buffer);
    } catch {
      return res.status(400).json({
        message: "Invalid Excel file. Please upload a valid .xls or .xlsx file."
      });
    }
    if (!parsedContacts.length) {
      return res.status(400).json({
        message:
          "No valid rows found. Expected columns: Firm Name, City, Country Code, Mobile Number"
      });
    }

    if (mode !== "append") {
      await WhatsAppContact.deleteMany({});
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];

    for (const contact of parsedContacts) {
      try {
        const result = await WhatsAppContact.findOneAndUpdate(
          { mobileE164: contact.mobileE164 },
          contact,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (result?.createdAt && result?.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) {
          inserted += 1;
        } else {
          updated += 1;
        }
      } catch (err) {
        errors.push({
          mobileE164: contact.mobileE164,
          error: err?.message || "Failed to save contact"
        });
      }
    }

    await logAdminAction(req.admin, "upload_whatsapp_contacts", "whatsapp_contact", "bulk", {
      mode,
      parsed: parsedContacts.length,
      inserted,
      updated,
      failed: errors.length
    });

    res.json({
      parsed: parsedContacts.length,
      inserted,
      updated,
      failed: errors.length,
      errors: errors.slice(0, 30)
    });
  }
);

module.exports = router;
