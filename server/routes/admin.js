const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const ChatMessage = require("../models/ChatMessage");
const Report = require("../models/Report");
const PlatformSettings = require("../models/PlatformSettings");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppCampaignRun = require("../models/WhatsAppCampaignRun");
const AdminAuditLog = require("../models/AdminAuditLog");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const { normalizeE164 } = require("../utils/sendWhatsApp");
const { sendTestWhatsAppCampaign } = require("../services/whatsAppCampaign");
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
      optInStatus: "opted_in",
      optInSource: "admin_excel_upload",
      optInAt: new Date(),
      unsubscribedAt: null,
      unsubscribeReason: "",
      dndStatus: "allow",
      dndSource: "",
      source: "admin_excel"
    });
  }

  return contacts;
}

function uniqueNormalizedList(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const item = String(value || "").trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function renameValue(list = [], oldValue, newValue) {
  const targetOld = String(oldValue || "").trim().toLowerCase();
  const targetNew = String(newValue || "").trim();
  const next = list.map((item) => {
    if (String(item || "").trim().toLowerCase() === targetOld) {
      return targetNew;
    }
    return item;
  });
  return uniqueNormalizedList(next);
}

async function hasTaxonomyUsage(type, value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;

  if (type === "city") {
    const [userCount, requirementCount] = await Promise.all([
      User.countDocuments({ city: new RegExp(`^${normalized}$`, "i") }),
      Requirement.countDocuments({ city: new RegExp(`^${normalized}$`, "i") })
    ]);
    return userCount > 0 || requirementCount > 0;
  }

  if (type === "category") {
    const [requirementCount, sellerCount] = await Promise.all([
      Requirement.countDocuments({ category: new RegExp(`^${normalized}$`, "i") }),
      User.countDocuments({ "sellerProfile.categories": new RegExp(`^${normalized}$`, "i") })
    ]);
    return requirementCount > 0 || sellerCount > 0;
  }

  if (type === "unit") {
    const requirementCount = await Requirement.countDocuments({
      unit: new RegExp(`^${normalized}$`, "i")
    });
    return requirementCount > 0;
  }

  if (type === "currency") {
    const userCount = await User.countDocuments({
      preferredCurrency: new RegExp(`^${normalized}$`, "i")
    });
    return userCount > 0;
  }

  return false;
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." }
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isLocked(admin) {
  return admin?.lockUntil && new Date(admin.lockUntil).getTime() > Date.now();
}

function getFailedAttemptState(admin) {
  const failed = Number(admin?.failedLoginCount || 0);
  if (failed < 5) {
    return { nextFailed: failed + 1, nextLockUntil: null };
  }
  return {
    nextFailed: failed + 1,
    nextLockUntil: new Date(Date.now() + 15 * 60 * 1000)
  };
}


router.post("/login", adminLoginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  const admin = await Admin.findOne({ email: normalizedEmail });
  if (!admin || admin.active === false) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  if (isLocked(admin)) {
    return res.status(423).json({ message: "Account temporarily locked" });
  }

  let validPassword = false;
  if (admin.passwordHash) {
    validPassword = await bcrypt.compare(String(password), String(admin.passwordHash));
  } else if (admin.password) {
    validPassword = admin.password === password;
    if (validPassword) {
      admin.passwordHash = await bcrypt.hash(String(password), 10);
      admin.password = "";
      await admin.save();
    }
  }

  if (!validPassword) {
    const next = getFailedAttemptState(admin);
    admin.failedLoginCount = next.nextFailed;
    admin.lockUntil = next.nextLockUntil;
    await admin.save();
    return res.status(401).json({ message: "Invalid credentials" });
  }
  admin.failedLoginCount = 0;
  admin.lockUntil = null;
  admin.lastLoginAt = new Date();
  await admin.save();

  const token = jwt.sign(
    {
      id: admin._id,
      role: admin.role || "ops_admin",
      tokenVersion: admin.tokenVersion || 0
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "8h" }
  );

  await logAdminAction(admin, "admin_login", "admin", admin._id, {
    role: admin.role || "ops_admin"
  });

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

router.get("/admins", adminAuth, requireAdminPermission("admins.read"), async (req, res) => {
  const admins = await Admin.find()
    .select("email role permissions active createdAt updatedAt lastLoginAt")
    .sort({ createdAt: -1 });
  res.json(admins);
});

router.post("/admins", adminAuth, requireAdminPermission("admins.manage"), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "ops_admin");
  const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];

  if (!email || !password) {
    return res.status(400).json({ message: "email and password required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  const existing = await Admin.findOne({ email });
  if (existing) {
    return res.status(409).json({ message: "Admin already exists" });
  }
  const admin = await Admin.create({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    permissions,
    active: true
  });
  await logAdminAction(req.admin, "create_admin", "admin", admin._id, {
    role,
    permissionsCount: permissions.length
  });
  res.json({
    _id: admin._id,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
    active: admin.active
  });
});

router.patch("/admins/:id", adminAuth, requireAdminPermission("admins.manage"), async (req, res) => {
  const update = {};
  if (req.body?.role) update.role = String(req.body.role);
  if (Array.isArray(req.body?.permissions)) update.permissions = req.body.permissions;
  if (req.body?.active !== undefined) update.active = Boolean(req.body.active);
  if (req.body?.password) {
    const password = String(req.body.password);
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    update.passwordHash = await bcrypt.hash(password, 10);
    update.password = "";
  }

  const targetAdmin = await Admin.findById(req.params.id);
  if (!targetAdmin) {
    return res.status(404).json({ message: "Admin not found" });
  }

  if (req.body?.password && req.body?.rotateSessions) {
    update.tokenVersion = Number(targetAdmin.tokenVersion || 0) + 1;
  }

  const admin = await Admin.findByIdAndUpdate(req.params.id, update, { new: true });
  await logAdminAction(req.admin, "update_admin", "admin", req.params.id, {
    updatedFields: Object.keys(update)
  });
  res.json({
    _id: admin._id,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
    active: admin.active,
    tokenVersion: admin.tokenVersion
  });
});

/**
 * GET all users (buyers + sellers + admins)
 */
router.get("/users", adminAuth, requireAdminPermission("users.read"), async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

/**
 * Approve or block seller
 */
router.post("/seller/approve", adminAuth, requireAdminPermission("sellers.approve"), async (req, res) => {
  const { sellerId, approved } = req.body;
  if (!sellerId) {
    return res.status(400).json({ message: "sellerId required" });
  }
  const seller = await User.findById(sellerId);
  if (!seller || !seller.roles?.seller) {
    return res.status(404).json({ message: "Seller not found" });
  }

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
router.post("/user/block", adminAuth, requireAdminPermission("users.manage"), async (req, res) => {
  const { userId, blocked } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  await User.findByIdAndUpdate(userId, { blocked: Boolean(blocked) });
  await logAdminAction(req.admin, "user_block", "user", userId, {
    blocked: Boolean(blocked)
  });
  res.json({ message: blocked ? "User blocked" : "User unblocked" });
});

/**
 * Force logout / revoke user token
 */
router.post("/user/force-logout", adminAuth, requireAdminPermission("users.manage"), async (req, res) => {
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
router.post("/user/chat-toggle", adminAuth, requireAdminPermission("users.manage"), async (req, res) => {
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
router.get("/requirements", adminAuth, requireAdminPermission("requirements.read"), async (req, res) => {
  const requirements = await Requirement.find()
    .populate("buyerId", "email city")
    .sort({ createdAt: -1 });
  res.json(requirements);
});

/**
 * Moderate a requirement (remove or restore)
 */
router.post("/requirement/:id/moderate", adminAuth, requireAdminPermission("requirements.moderate"), async (req, res) => {
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
router.delete("/requirement/:id", adminAuth, requireAdminPermission("requirements.moderate"), async (req, res) => {
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
router.get("/offers", adminAuth, requireAdminPermission("offers.read"), async (req, res) => {
  const offers = await Offer.find()
    .populate("sellerId", "email city sellerProfile")
    .populate("requirementId", "product productName city category");
  res.json(offers);
});

/**
 * Delete an offer
 */
router.delete("/offer/:id", adminAuth, requireAdminPermission("offers.moderate"), async (req, res) => {
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
router.post("/offer/:id/moderate", adminAuth, requireAdminPermission("offers.moderate"), async (req, res) => {
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
router.get("/chats", adminAuth, requireAdminPermission("chats.read"), async (req, res) => {
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
router.post("/chat/:id/moderate", adminAuth, requireAdminPermission("chats.moderate"), async (req, res) => {
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
router.get("/reports", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
  const reports = await Report.find()
    .populate("reporterId", "email city roles")
    .populate("reportedUserId", "email city roles")
    .populate("requirementId", "product productName city category")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(reports);
});

router.post("/report/:id/status", adminAuth, requireAdminPermission("reports.manage"), async (req, res) => {
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
router.get("/moderation/queue", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
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
router.post("/requirement/chat-toggle", adminAuth, requireAdminPermission("requirements.moderate"), async (req, res) => {
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
router.get("/options", adminAuth, requireAdminPermission("options.read"), async (req, res) => {
  const doc = await PlatformSettings.findOne();
  res.json(buildOptionsResponse(doc));
});

/**
 * Update platform dropdown options
 */
router.put("/options", adminAuth, requireAdminPermission("options.manage"), async (req, res) => {
  const payload = req.body || {};
  const current = await PlatformSettings.findOne().lean();

  const next = {
    cities: uniqueNormalizedList(Array.isArray(payload.cities) ? payload.cities : (current?.cities || DEFAULT_CITIES)),
    categories: uniqueNormalizedList(Array.isArray(payload.categories) ? payload.categories : (current?.categories || DEFAULT_CATEGORIES)),
    units: uniqueNormalizedList(Array.isArray(payload.units) ? payload.units : (current?.units || DEFAULT_UNITS)),
    currencies: uniqueNormalizedList(Array.isArray(payload.currencies) ? payload.currencies : (current?.currencies || DEFAULT_CURRENCIES)),
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

const TAXONOMY_FIELD_MAP = {
  cities: "cities",
  categories: "categories",
  units: "units",
  currencies: "currencies"
};

const TAXONOMY_USAGE_TYPE_MAP = {
  cities: "city",
  categories: "category",
  units: "unit",
  currencies: "currency"
};

router.get("/options/:type", adminAuth, requireAdminPermission("options.read"), async (req, res) => {
  const type = String(req.params.type || "").trim().toLowerCase();
  const field = TAXONOMY_FIELD_MAP[type];
  if (!field) {
    return res.status(400).json({ message: "Invalid option type" });
  }
  const doc = await PlatformSettings.findOne().lean();
  const options = buildOptionsResponse(doc);
  res.json({
    type,
    values: Array.isArray(options[field]) ? options[field] : []
  });
});

router.post("/options/:type", adminAuth, requireAdminPermission("options.manage"), async (req, res) => {
  const type = String(req.params.type || "").trim().toLowerCase();
  const field = TAXONOMY_FIELD_MAP[type];
  if (!field) {
    return res.status(400).json({ message: "Invalid option type" });
  }
  const value = String(req.body?.value || "").trim();
  if (!value) {
    return res.status(400).json({ message: "value required" });
  }

  const doc = await PlatformSettings.findOne();
  const existing = Array.isArray(doc?.[field]) ? doc[field] : [];
  const next = uniqueNormalizedList([...existing, value]);
  const updated = await PlatformSettings.findOneAndUpdate(
    {},
    { [field]: next },
    { upsert: true, new: true }
  );
  await logAdminAction(req.admin, "taxonomy_add", "platform_settings", updated._id, {
    type,
    value
  });
  res.json({
    type,
    values: updated[field]
  });
});

router.put("/options/:type", adminAuth, requireAdminPermission("options.manage"), async (req, res) => {
  const type = String(req.params.type || "").trim().toLowerCase();
  const field = TAXONOMY_FIELD_MAP[type];
  if (!field) {
    return res.status(400).json({ message: "Invalid option type" });
  }
  const oldValue = String(req.body?.oldValue || "").trim();
  const newValue = String(req.body?.newValue || "").trim();
  if (!oldValue || !newValue) {
    return res.status(400).json({ message: "oldValue and newValue required" });
  }
  const doc = await PlatformSettings.findOne().lean();
  const existing = Array.isArray(doc?.[field]) ? doc[field] : [];
  const containsOld = existing.some(
    (entry) => String(entry || "").trim().toLowerCase() === oldValue.toLowerCase()
  );
  if (!containsOld) {
    return res.status(404).json({ message: "Value not found" });
  }

  const next = renameValue(existing, oldValue, newValue);
  const updated = await PlatformSettings.findOneAndUpdate(
    {},
    { [field]: next },
    { upsert: true, new: true }
  );

  // Propagate rename in existing records for consistency.
  if (type === "cities") {
    await Promise.all([
      User.updateMany({ city: oldValue }, { $set: { city: newValue } }),
      Requirement.updateMany({ city: oldValue }, { $set: { city: newValue } })
    ]);
  } else if (type === "categories") {
    await Promise.all([
      Requirement.updateMany({ category: oldValue }, { $set: { category: newValue } }),
      User.updateMany(
        { "sellerProfile.categories": oldValue },
        { $set: { "sellerProfile.categories.$[elem]": newValue } },
        { arrayFilters: [{ elem: oldValue }] }
      )
    ]);
  } else if (type === "currencies") {
    await User.updateMany({ preferredCurrency: oldValue }, { $set: { preferredCurrency: newValue } });
  } else if (type === "units") {
    await Requirement.updateMany({ unit: oldValue }, { $set: { unit: newValue } });
  }

  await logAdminAction(req.admin, "taxonomy_rename", "platform_settings", updated._id, {
    type,
    oldValue,
    newValue
  });
  res.json({
    type,
    values: updated[field]
  });
});

router.delete("/options/:type", adminAuth, requireAdminPermission("options.manage"), async (req, res) => {
  const type = String(req.params.type || "").trim().toLowerCase();
  const field = TAXONOMY_FIELD_MAP[type];
  if (!field) {
    return res.status(400).json({ message: "Invalid option type" });
  }
  const value = String(req.body?.value || req.query?.value || "").trim();
  const force = Boolean(req.body?.force || req.query?.force === "true");
  if (!value) {
    return res.status(400).json({ message: "value required" });
  }

  const usageType = TAXONOMY_USAGE_TYPE_MAP[type];
  const inUse = await hasTaxonomyUsage(usageType, value);
  if (inUse && !force) {
    return res.status(409).json({
      message: "Value is in use. Pass force=true to archive from options only.",
      inUse: true
    });
  }

  const doc = await PlatformSettings.findOne().lean();
  const existing = Array.isArray(doc?.[field]) ? doc[field] : [];
  const next = existing.filter(
    (entry) => String(entry || "").trim().toLowerCase() !== value.toLowerCase()
  );
  const updated = await PlatformSettings.findOneAndUpdate(
    {},
    { [field]: next },
    { upsert: true, new: true }
  );

  await logAdminAction(req.admin, "taxonomy_remove", "platform_settings", updated._id, {
    type,
    value,
    force,
    inUse
  });
  res.json({
    type,
    values: updated[field],
    removed: true,
    inUse
  });
});

router.get("/whatsapp/contacts", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const city = String(req.query.city || "").trim().toLowerCase();
  const query = city ? { cityNormalized: city } : {};
  const contacts = await WhatsAppContact.find(query)
    .sort({ updatedAt: -1 })
    .limit(1000);
  res.json(contacts);
});

router.get("/whatsapp/contacts/summary", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const [total, cityRows, complianceRows] = await Promise.all([
    WhatsAppContact.countDocuments({ active: true }),
    WhatsAppContact.aggregate([
      { $match: { active: true } },
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    WhatsAppContact.aggregate([
      { $match: { active: true } },
      {
        $group: {
          _id: null,
          optedIn: {
            $sum: { $cond: [{ $eq: ["$optInStatus", "opted_in"] }, 1, 0] }
          },
          unsubscribed: {
            $sum: { $cond: [{ $ne: ["$unsubscribedAt", null] }, 1, 0] }
          },
          dnd: {
            $sum: { $cond: [{ $eq: ["$dndStatus", "dnd"] }, 1, 0] }
          }
        }
      }
    ])
  ]);
  const compliance = complianceRows[0] || { optedIn: 0, unsubscribed: 0, dnd: 0 };
  res.json({
    total,
    compliance,
    cities: cityRows.map((row) => ({
      city: row._id,
      count: row.count
    }))
  });
});

router.delete("/whatsapp/contacts/:id", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const deleted = await WhatsAppContact.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Contact not found" });
  }
  await logAdminAction(req.admin, "delete_whatsapp_contact", "whatsapp_contact", req.params.id);
  res.json({ success: true });
});

router.patch("/whatsapp/contacts/:id/compliance", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const { optInStatus, optInSource, dndStatus, dndSource, unsubscribed, unsubscribeReason } = req.body || {};
  const update = {};

  if (optInStatus !== undefined) {
    update.optInStatus = optInStatus === "opted_in" ? "opted_in" : "not_opted_in";
    if (update.optInStatus === "opted_in") {
      update.optInAt = new Date();
      update.unsubscribedAt = null;
      update.unsubscribeReason = "";
    }
  }
  if (optInSource !== undefined) update.optInSource = String(optInSource || "").trim();
  if (dndStatus !== undefined) update.dndStatus = dndStatus === "dnd" ? "dnd" : "allow";
  if (dndSource !== undefined) update.dndSource = String(dndSource || "").trim();
  if (unsubscribed !== undefined) {
    if (Boolean(unsubscribed)) {
      update.unsubscribedAt = new Date();
      update.unsubscribeReason = String(unsubscribeReason || "Admin update");
    } else {
      update.unsubscribedAt = null;
      update.unsubscribeReason = "";
    }
  }

  const contact = await WhatsAppContact.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true }
  );
  if (!contact) {
    return res.status(404).json({ message: "Contact not found" });
  }
  await logAdminAction(req.admin, "update_whatsapp_compliance", "whatsapp_contact", req.params.id, update);
  res.json(contact);
});

router.post("/whatsapp/unsubscribe", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const mobileE164 = normalizeE164(req.body?.mobileE164);
  const reason = String(req.body?.reason || "Admin unsubscribe").trim();
  if (!mobileE164) {
    return res.status(400).json({ message: "mobileE164 required" });
  }
  const contact = await WhatsAppContact.findOneAndUpdate(
    { mobileE164 },
    {
      $set: {
        unsubscribedAt: new Date(),
        unsubscribeReason: reason,
        optInStatus: "not_opted_in"
      }
    },
    { new: true }
  );
  if (!contact) {
    return res.status(404).json({ message: "Contact not found" });
  }
  await logAdminAction(req.admin, "unsubscribe_whatsapp_contact", "whatsapp_contact", contact._id, {
    mobileE164,
    reason
  });
  res.json({ success: true, contact });
});

router.post("/whatsapp/dnd/import", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
  const source = String(req.body?.source || "admin_import").trim();
  const normalized = Array.from(
    new Set(numbers.map((value) => normalizeE164(value)).filter(Boolean))
  );
  if (!normalized.length) {
    return res.status(400).json({ message: "numbers required" });
  }

  const result = await WhatsAppContact.updateMany(
    { mobileE164: { $in: normalized } },
    { $set: { dndStatus: "dnd", dndSource: source } }
  );
  await logAdminAction(req.admin, "import_whatsapp_dnd", "whatsapp_contact", "bulk", {
    count: normalized.length,
    source
  });
  res.json({
    requested: normalized.length,
    matched: result.matchedCount || 0,
    updated: result.modifiedCount || 0
  });
});

router.get("/whatsapp/campaign-runs", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const limit = Math.min(Number(req.query?.limit) || 100, 300);
  const runs = await WhatsAppCampaignRun.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("requirementId", "product productName city category")
    .populate("createdByAdminId", "email role");
  res.json(runs);
});

router.post("/whatsapp/test-send", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const requirementId = String(req.body?.requirementId || "").trim();
  const mobileE164 = normalizeE164(req.body?.mobileE164);
  const dryRun = Boolean(req.body?.dryRun);
  if (!requirementId || !mobileE164) {
    return res.status(400).json({ message: "requirementId and mobileE164 required" });
  }

  const requirement = await Requirement.findById(requirementId).lean();
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  const result = await sendTestWhatsAppCampaign({
    requirement,
    mobileE164,
    adminId: req.admin?._id || null,
    dryRun
  });
  await logAdminAction(req.admin, "whatsapp_test_send", "requirement", requirementId, {
    mobileE164,
    dryRun,
    result: result?.ok ? "ok" : "failed"
  });
  res.json(result);
});

router.post(
  "/whatsapp/contacts/upload",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
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
