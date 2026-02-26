const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
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
const { otpSendLimiter, otpVerifyLimiter } = require("../middleware/rateLimit");
const { setOtp, verifyOtp } = require("../utils/otpStore");
const { sendOtpEmail } = require("../utils/sendEmail");
const { normalizeE164 } = require("../utils/sendWhatsApp");
const {
  sendTestWhatsAppCampaign,
  triggerWhatsAppCampaignForRequirement
} = require("../services/whatsAppCampaign");
const {
  buildOptionsResponse,
  DEFAULT_CITIES,
  DEFAULT_CATEGORIES,
  DEFAULT_UNITS,
  DEFAULT_CURRENCIES,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_EMAIL_NOTIFICATIONS,
  DEFAULT_WHATSAPP_CAMPAIGN,
  DEFAULT_MODERATION_RULES,
  DEFAULT_SELECTIONS,
  DEFAULT_TERMS_CONTENT,
  DEFAULT_PRIVACY_POLICY_CONTENT
} = require("../config/platformDefaults");
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});
const WHATSAPP_UPLOAD_DIR = path.join(process.cwd(), "uploads", "admin");
const WHATSAPP_UPLOAD_META_PATH = path.join(WHATSAPP_UPLOAD_DIR, "whatsapp-contacts-latest.json");
const ADMIN_JWT_EXPIRES = String(process.env.ADMIN_JWT_EXPIRES || "30d");
const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeContactEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  return /\S+@\S+\.\S+/.test(email) ? email : "";
}

function toDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getSafeUploadExt(originalName = "") {
  const ext = String(path.extname(originalName || "")).toLowerCase();
  return ext === ".xls" || ext === ".xlsx" ? ext : ".xlsx";
}

async function saveLatestWhatsAppUpload(file) {
  const ext = getSafeUploadExt(file?.originalname);
  const filename = `whatsapp-contacts-latest${ext}`;
  await fs.promises.mkdir(WHATSAPP_UPLOAD_DIR, { recursive: true });
  const absolutePath = path.join(WHATSAPP_UPLOAD_DIR, filename);
  await fs.promises.writeFile(absolutePath, file.buffer);
  const metadata = {
    filename,
    originalName: String(file?.originalname || filename),
    mimeType: String(file?.mimetype || "application/octet-stream"),
    size: Number(file?.size || file?.buffer?.length || 0),
    uploadedAt: new Date().toISOString()
  };
  await fs.promises.writeFile(WHATSAPP_UPLOAD_META_PATH, JSON.stringify(metadata, null, 2), "utf8");
  return metadata;
}

async function readLatestWhatsAppUploadMeta() {
  try {
    const raw = await fs.promises.readFile(WHATSAPP_UPLOAD_META_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.filename) return null;
    return parsed;
  } catch {
    return null;
  }
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
  const parseCategoryList = (value) =>
    Array.from(
      new Set(
        String(value || "")
          .split(/[;|/]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const firmName = String(row[0] || "").trim();
    const city = String(row[1] || "").trim();
    const countryCodeRaw = toDigits(row[2]);
    const mobileRaw = toDigits(row[3]);
    const categories = parseCategoryList(row[4]);
    const email = normalizeContactEmail(row[5]);
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
      email,
      categories,
      categoriesNormalized: categories.map((item) => normalizeText(item)),
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

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function issueAdminToken(admin) {
  return jwt.sign(
    {
      id: admin._id,
      role: admin.role || "ops_admin",
      tokenVersion: admin.tokenVersion || 0
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: ADMIN_JWT_EXPIRES }
  );
}

router.post("/forgot-password", otpSendLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: "Email required" });
  }

  const admin = await Admin.findOne({ email, active: { $ne: false } });
  if (!admin) {
    return res.json({ success: true });
  }

  const otp = generateOtp();
  try {
    await sendOtpEmail({
      email,
      otp,
      subject: "Your Hoko admin password reset OTP"
    });
    setOtp(`admin-forgot:${email}`, otp, OTP_TTL_MS);
    return res.json({ success: true });
  } catch (err) {
    const body = { message: "Failed to send OTP" };
    if (process.env.NODE_ENV !== "production") {
      body.error = err?.response || err?.message || "Unknown SMTP error";
    }
    return res.status(500).json(body);
  }
});

router.post("/reset-password", otpVerifyLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp || "").trim();
  const newPassword = String(req.body?.newPassword || "");
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: "Missing data" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  const otpResult = verifyOtp(`admin-forgot:${email}`, otp, OTP_MAX_ATTEMPTS);
  if (!otpResult.ok) {
    const message =
      otpResult.reason === "expired"
        ? "OTP expired"
        : otpResult.reason === "locked"
        ? "Too many OTP attempts"
        : "Invalid OTP";
    const status = otpResult.reason === "locked" ? 429 : 401;
    return res.status(status).json({ message });
  }

  const admin = await Admin.findOne({ email });
  if (!admin || admin.active === false) {
    return res.status(404).json({ message: "Admin not found" });
  }

  admin.passwordHash = await bcrypt.hash(newPassword, 10);
  admin.password = "";
  admin.failedLoginCount = 0;
  admin.lockUntil = null;
  admin.tokenVersion = Number(admin.tokenVersion || 0) + 1;
  await admin.save();

  await logAdminAction(admin, "admin_reset_password", "admin", admin._id);
  return res.json({ success: true });
});


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

  const token = issueAdminToken(admin);

  await logAdminAction(admin, "admin_login", "admin", admin._id, {
    role: admin.role || "ops_admin"
  });

  res.json({ token });
});

router.post("/change-password", adminAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new password required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  let validPassword = false;
  if (req.admin.passwordHash) {
    validPassword = await bcrypt.compare(currentPassword, String(req.admin.passwordHash));
  } else if (req.admin.password) {
    validPassword = req.admin.password === currentPassword;
  }
  if (!validPassword) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  req.admin.passwordHash = await bcrypt.hash(newPassword, 10);
  req.admin.password = "";
  req.admin.tokenVersion = Number(req.admin.tokenVersion || 0) + 1;
  await req.admin.save();

  await logAdminAction(req.admin, "admin_change_password", "admin", req.admin._id);
  const token = issueAdminToken(req.admin);
  return res.json({ success: true, token });
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

  const nextCities = uniqueNormalizedList(
    Array.isArray(payload.cities) ? payload.cities : (current?.cities || DEFAULT_CITIES)
  );
  const nextCategories = uniqueNormalizedList(
    Array.isArray(payload.categories) ? payload.categories : (current?.categories || DEFAULT_CATEGORIES)
  );
  const nextUnits = uniqueNormalizedList(
    Array.isArray(payload.units) ? payload.units : (current?.units || DEFAULT_UNITS)
  );
  if (!nextCities.length || !nextCategories.length || !nextUnits.length) {
    return res.status(400).json({
      message: "Cities, categories, and units cannot be empty"
    });
  }

  const next = {
    cities: nextCities,
    categories: nextCategories,
    units: nextUnits,
    currencies: uniqueNormalizedList(Array.isArray(payload.currencies) ? payload.currencies : (current?.currencies || DEFAULT_CURRENCIES)),
    defaults: payload.defaults || current?.defaults || DEFAULT_SELECTIONS,
    notifications: payload.notifications || current?.notifications || DEFAULT_NOTIFICATIONS,
    emailNotifications:
      payload.emailNotifications ||
      current?.emailNotifications ||
      DEFAULT_EMAIL_NOTIFICATIONS,
    whatsAppCampaign:
      payload.whatsAppCampaign ||
      current?.whatsAppCampaign ||
      DEFAULT_WHATSAPP_CAMPAIGN,
    moderationRules: payload.moderationRules || current?.moderationRules || DEFAULT_MODERATION_RULES,
    termsAndConditions: payload.termsAndConditions || current?.termsAndConditions || {
      content: DEFAULT_TERMS_CONTENT
    },
    privacyPolicy: payload.privacyPolicy || current?.privacyPolicy || {
      content: DEFAULT_PRIVACY_POLICY_CONTENT
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
  if (["cities", "categories", "units"].includes(type) && next.length === 0) {
    return res.status(409).json({
      message: `Cannot remove the last ${type.slice(0, -1)} option`,
      inUse
    });
  }
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
  const [total, cityRows, complianceRows, latestContact, uploadMeta] = await Promise.all([
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
    ]),
    WhatsAppContact.findOne({ active: true }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
    readLatestWhatsAppUploadMeta()
  ]);
  const compliance = complianceRows[0] || { optedIn: 0, unsubscribed: 0, dnd: 0 };
  const uploadFile = uploadMeta
    ? {
        originalName: uploadMeta.originalName,
        size: uploadMeta.size,
        uploadedAt: uploadMeta.uploadedAt,
        downloadPath: "/admin/whatsapp/contacts/uploaded-file"
      }
    : null;
  res.json({
    total,
    compliance,
    lastUpdatedAt: latestContact?.updatedAt || null,
    uploadFile,
    cities: cityRows.map((row) => ({
      city: row._id,
      count: row.count
    }))
  });
});

router.get("/whatsapp/contacts/uploaded-file", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const uploadMeta = await readLatestWhatsAppUploadMeta();
  if (!uploadMeta?.filename) {
    return res.status(404).json({ message: "No uploaded file found" });
  }

  const absolutePath = path.join(WHATSAPP_UPLOAD_DIR, uploadMeta.filename);
  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    return res.status(404).json({ message: "Uploaded file is missing on server" });
  }

  const safeName = String(uploadMeta.originalName || uploadMeta.filename).replace(/["\r\n]/g, "_");
  res.setHeader("Content-Type", uploadMeta.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  return res.sendFile(absolutePath);
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
  const result = await WhatsAppContact.updateMany(
    { mobileE164 },
    {
      $set: {
        unsubscribedAt: new Date(),
        unsubscribeReason: reason,
        optInStatus: "not_opted_in"
      }
    }
  );
  if (!result.matchedCount) {
    return res.status(404).json({ message: "Contact not found" });
  }
  await logAdminAction(req.admin, "unsubscribe_whatsapp_contact", "whatsapp_contact", "bulk", {
    mobileE164,
    reason,
    matched: result.matchedCount || 0,
    updated: result.modifiedCount || 0
  });
  res.json({
    success: true,
    matched: result.matchedCount || 0,
    updated: result.modifiedCount || 0
  });
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

router.get("/whatsapp/post-statuses", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const limit = Math.min(Number(req.query?.limit) || 300, 1000);
  const requirements = await Requirement.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("product productName city category createdAt");

  const requirementIds = requirements.map((item) => item._id);
  const runRows = requirementIds.length
    ? await WhatsAppCampaignRun.aggregate([
        {
          $match: {
            requirementId: { $in: requirementIds },
            triggerType: { $in: ["buyer_post", "manual_resend"] }
          }
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$requirementId",
            latestRun: { $first: "$$ROOT" },
            totalRuns: { $sum: 1 },
            totalSent: { $sum: "$sent" },
            totalFailed: { $sum: "$failed" },
            totalAttempted: { $sum: "$attempted" }
          }
        }
      ])
    : [];

  const byRequirementId = new Map(
    runRows.map((row) => [String(row._id), row])
  );

  const posts = requirements.map((requirement) => {
    const row = byRequirementId.get(String(requirement._id));
    const latestRun = row?.latestRun || null;
    let deliveryState = "pending";
    if (latestRun && Number(latestRun.sent || 0) > 0) {
      deliveryState = "sent";
    } else if (latestRun && String(latestRun.status || "") === "failed") {
      deliveryState = "failed";
    }

    return {
      requirementId: requirement._id,
      product: requirement.product || requirement.productName || "Requirement",
      city: requirement.city || "",
      category: requirement.category || "",
      createdAt: requirement.createdAt,
      deliveryState,
      totalRuns: Number(row?.totalRuns || 0),
      totalSent: Number(row?.totalSent || 0),
      totalFailed: Number(row?.totalFailed || 0),
      totalAttempted: Number(row?.totalAttempted || 0),
      latestRun: latestRun
        ? {
            _id: latestRun._id,
            triggerType: latestRun.triggerType,
            status: latestRun.status,
            attempted: latestRun.attempted,
            sent: latestRun.sent,
            failed: latestRun.failed,
            skipped: latestRun.skipped,
            createdAt: latestRun.createdAt
          }
        : null
    };
  });

  const pendingPosts = posts.filter((item) => item.deliveryState !== "sent");
  res.json({
    pendingPosts,
    posts
  });
});

router.post("/whatsapp/resend", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const requirementId = String(req.body?.requirementId || "").trim();
  if (!requirementId) {
    return res.status(400).json({ message: "requirementId required" });
  }

  const requirement = await Requirement.findById(requirementId).lean();
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  const requestedChannels = req.body?.channels || {};
  const channels = {
    whatsapp: requestedChannels?.whatsapp !== false,
    email: requestedChannels?.email === true
  };
  if (!channels.whatsapp && !channels.email) {
    return res.status(400).json({ message: "Select at least one channel (WhatsApp or Email)" });
  }

  const resendResult = await triggerWhatsAppCampaignForRequirement(
    requirement,
    {
      triggerType: "manual_resend",
      adminId: req.admin?._id || null,
      notes: "Manual resend from admin",
      channels
    }
  );

  await logAdminAction(req.admin, "whatsapp_resend_post", "requirement", requirementId, {
    result: resendResult?.ok ? "ok" : "failed",
    reason: resendResult?.reason || "",
    channels
  });

  if (!resendResult?.ok) {
    return res.status(400).json(resendResult);
  }
  return res.json(resendResult);
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
          "No valid rows found. Expected columns in order: A Firm Name, B City, C Country Code, D Mobile Number, E Categories, F Email."
      });
    }

    if (mode !== "append") {
      await WhatsAppContact.deleteMany({});
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];
    let uploadFile = null;

    try {
      uploadFile = await saveLatestWhatsAppUpload(req.file);
    } catch (err) {
      console.warn("Failed to save uploaded WhatsApp file:", err?.message || err);
    }

    for (const contact of parsedContacts) {
      try {
        const result = await WhatsAppContact.findOneAndUpdate(
          {
            mobileE164: contact.mobileE164,
            cityNormalized: contact.cityNormalized
          },
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
      uploadFile: uploadFile
        ? {
            originalName: uploadFile.originalName,
            size: uploadFile.size,
            uploadedAt: uploadFile.uploadedAt,
            downloadPath: "/admin/whatsapp/contacts/uploaded-file"
          }
        : null,
      errors: errors.slice(0, 30)
    });
  }
);

module.exports = router;
