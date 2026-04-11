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
const PushSubscription = require("../models/PushSubscription");
const NativePushToken = require("../models/NativePushToken");
const PlatformSettings = require("../models/PlatformSettings");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppBuyerContact = require("../models/WhatsAppBuyerContact");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const WhatsAppCampaignRun = require("../models/WhatsAppCampaignRun");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const OptedInSeller = require("../models/OptedInSeller");
const AdminAuditLog = require("../models/AdminAuditLog");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const { otpSendLimiter, otpVerifyLimiter } = require("../middleware/rateLimit");
const { setOtp, verifyOtp } = require("../utils/otpStore");
const { sendOtpEmail } = require("../utils/sendEmail");
const {
  normalizeE164,
  fetchWapiApprovedTemplates,
  sendViaWapiTemplate,
  fetchGupshupApprovedTemplates,
  sendViaGupshupTemplate
} = require("../utils/sendWhatsApp");
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
  DEFAULT_SAMPLE_CITY_POSTS_ENABLED,
  DEFAULT_TERMS_CONTENT,
  DEFAULT_PRIVACY_POLICY_CONTENT
} = require("../config/platformDefaults");
const { isFirebaseMessagingConfigured } = require("../utils/firebaseAdmin");
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});
const WHATSAPP_UPLOAD_DIR = path.join(process.cwd(), "uploads", "admin");
const WHATSAPP_UPLOAD_META_PATHS = {
  seller_contacts: path.join(WHATSAPP_UPLOAD_DIR, "whatsapp-contacts-seller-latest.json"),
  buyer_contacts: path.join(WHATSAPP_UPLOAD_DIR, "whatsapp-contacts-buyer-latest.json"),
  templates: path.join(WHATSAPP_UPLOAD_DIR, "whatsapp-templates-latest.json")
};
const ADMIN_JWT_EXPIRES = String(process.env.ADMIN_JWT_EXPIRES || "30d");
const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function summarizeProviderError(errorValue) {
  if (!errorValue) return "";
  if (typeof errorValue === "string") return errorValue;
  try {
    return JSON.stringify(errorValue).slice(0, 500);
  } catch {
    return "send_failed";
  }
}

function normalizeRequirementId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (mongoose.Types.ObjectId.isValid(raw)) return raw;
  const parts = raw.split("/").filter(Boolean);
  const maybeId = String(parts[parts.length - 1] || "").trim();
  return mongoose.Types.ObjectId.isValid(maybeId) ? maybeId : "";
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
  return saveLatestWhatsAppUploadByKey("seller_contacts", file, "whatsapp-contacts-seller-latest");
}

async function saveLatestWhatsAppUploadByKey(kind, file, filePrefix) {
  const key = String(kind || "").trim().toLowerCase();
  const metaPath = WHATSAPP_UPLOAD_META_PATHS[key];
  if (!metaPath) {
    throw new Error(`Unsupported WhatsApp upload kind: ${key}`);
  }
  const ext = getSafeUploadExt(file?.originalname);
  const filename = `${String(filePrefix || key).trim() || key}${ext}`;
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
  await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf8");
  return metadata;
}

async function readLatestWhatsAppUploadMeta() {
  return readLatestWhatsAppUploadMetaByKey("seller_contacts");
}

async function readLatestWhatsAppUploadMetaByKey(kind) {
  const key = String(kind || "").trim().toLowerCase();
  const metaPath = WHATSAPP_UPLOAD_META_PATHS[key];
  if (!metaPath) return null;
  try {
    const raw = await fs.promises.readFile(metaPath, "utf8");
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
          .split(/[;,|/]+/)
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

function parseBuyerContactsFromWorkbook(buffer) {
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
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const mobileRaw = String(row[0] || "").trim();
    const digits = toDigits(mobileRaw);
    if (!digits) continue;
    if (index === 0 && /mobile|phone|number/i.test(String(mobileRaw || ""))) {
      continue;
    }
    const mobileE164 = normalizeE164(digits);
    if (!mobileE164) continue;
    contacts.push({
      mobileE164,
      active: true,
      optInStatus: "not_opted_in",
      optInSource: "buyer_excel_upload_pending_consent",
      optInAt: null,
      pendingOptInAt: new Date(),
      consentEvidence: "Uploaded from buyer excel. Awaiting WhatsApp consent confirmation.",
      unsubscribedAt: null,
      unsubscribeReason: "",
      dndStatus: "allow",
      dndSource: "",
      source: "buyer_excel"
    });
  }
  return contacts;
}

function normalizeTemplateBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "active"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "inactive"].includes(normalized)) return false;
  return fallback;
}

function readTemplateCell(row, indexByName, ...names) {
  for (const name of names) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) continue;
    const idx = indexByName.get(key);
    if (Number.isInteger(idx) && idx >= 0) {
      return row[idx];
    }
  }
  return "";
}

function parseTemplateRegistryFromWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) return { rows: [], errors: ["Workbook has no sheets"] };
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: ""
  });
  if (!rows.length) return { rows: [], errors: ["Template sheet is empty"] };

  const header = (rows[0] || []).map((cell) => String(cell || "").trim());
  const indexByName = new Map(header.map((name, idx) => [String(name || "").trim().toLowerCase(), idx]));
  const parsedRows = [];
  const errors = [];
  const allowedCategory = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);
  const allowedStatus = new Set(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "ACTIVE", "ENABLED"]);

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const key = String(readTemplateCell(row, indexByName, "key")).trim();
    const templateName = String(readTemplateCell(row, indexByName, "template_name", "name", "template name")).trim();
    const templateId = String(readTemplateCell(row, indexByName, "template_id", "id", " template_id")).trim();
    const language = String(readTemplateCell(row, indexByName, "language", "language_code", "languagecode") || "en").trim();
    const categoryRaw = String(readTemplateCell(row, indexByName, "category") || "UTILITY").trim().toUpperCase();
    const statusRaw = String(readTemplateCell(row, indexByName, "status") || "PENDING").trim().toUpperCase();
    const variableCountRaw = Number(readTemplateCell(row, indexByName, "variable_count", "body_variable_count", "bodyvariablecount"));
    const buttonUrlPattern = String(readTemplateCell(row, indexByName, "button_url_pattern", "button_url", "buttonurlpattern")).trim();
    const isActive = normalizeTemplateBoolean(readTemplateCell(row, indexByName, "is_active", "active"), false);
    const version = String(readTemplateCell(row, indexByName, "version") || "v1").trim() || "v1";
    const fallbackKey = String(readTemplateCell(row, indexByName, "fallback_key")).trim();
    const notes = String(readTemplateCell(row, indexByName, "notes")).trim();

    if (!key && !templateName && !templateId) {
      continue;
    }
    if (!key || !templateName) {
      errors.push(`Row ${index + 1}: key and template_name are required`);
      continue;
    }
    if (!allowedCategory.has(categoryRaw)) {
      errors.push(`Row ${index + 1}: category must be MARKETING, UTILITY, or AUTHENTICATION`);
      continue;
    }
    if (!allowedStatus.has(statusRaw)) {
      errors.push(`Row ${index + 1}: status must be APPROVED/PENDING/REJECTED/PAUSED/DISABLED/ACTIVE/ENABLED`);
      continue;
    }
    const variableCount = Number.isFinite(variableCountRaw) && variableCountRaw >= 0
      ? Math.floor(variableCountRaw)
      : 0;

    parsedRows.push({
      key,
      templateName,
      templateId,
      language: language || "en",
      category: categoryRaw,
      status: statusRaw,
      variableCount,
      buttonUrlPattern,
      isActive,
      version,
      fallbackKey,
      notes
    });
  }

  return { rows: parsedRows, errors };
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

function normalizeRecipientType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "buyer" || normalized === "buyer_contacts" ? "buyer_contacts" : "seller_contacts";
}

function isContactEligibleForWhatsApp(contact) {
  if (!contact?.mobileE164) return { ok: false, reason: "missing_mobile" };
  if (contact.active === false) return { ok: false, reason: "inactive" };
  if (contact.optInStatus !== "opted_in") return { ok: false, reason: "not_opted_in" };
  if (contact.unsubscribedAt) return { ok: false, reason: "unsubscribed" };
  if (contact.dndStatus === "dnd") return { ok: false, reason: "dnd" };
  return { ok: true, reason: "" };
}

async function resolveRecipientContacts(recipientType, ids = []) {
  const normalizedIds = Array.isArray(ids)
    ? ids.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const normalizedType = normalizeRecipientType(recipientType);
  const query = normalizedIds.length ? { _id: { $in: normalizedIds } } : {};
  if (normalizedType === "buyer_contacts") {
    const contacts = await WhatsAppBuyerContact.find(query).lean();
    return { type: normalizedType, contacts };
  }
  const contacts = await WhatsAppContact.find(query).lean();
  return { type: normalizedType, contacts };
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

router.get("/push/subscriptions/summary", adminAuth, requireAdminPermission("users.read"), async (req, res) => {
  const [subs, nativeTokens, users] = await Promise.all([
    PushSubscription.find().select("userId subscription createdAt updatedAt").lean(),
    NativePushToken.find().select("userId token updatedAt").lean(),
    User.find().select("_id roles").lean()
  ]);

  const userById = new Map(users.map((user) => [String(user._id), user]));
  const roleCounts = {
    buyer: 0,
    seller: 0,
    both: 0,
    admin: 0,
    unknown: 0
  };
  const uniqueUsers = new Set();
  let invalidRecords = 0;
  let orphanedUsers = 0;
  let staleOver30d = 0;
  let nativeInvalidRecords = 0;
  let nativeOrphanedUsers = 0;
  let nativeStaleOver30d = 0;
  const staleCutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const nativeUniqueUsers = new Set();

  for (const row of subs) {
    const userId = String(row?.userId || "").trim();
    const endpoint = String(row?.subscription?.endpoint || "").trim();
    const authKey = String(row?.subscription?.keys?.auth || "").trim();
    const p256dhKey = String(row?.subscription?.keys?.p256dh || "").trim();
    const updatedAtMs = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;

    if (!userId || !endpoint || !authKey || !p256dhKey) {
      invalidRecords += 1;
    }
    if (updatedAtMs && updatedAtMs < staleCutoffMs) {
      staleOver30d += 1;
    }

    if (!userId) continue;
    uniqueUsers.add(userId);
    const user = userById.get(userId);
    if (!user) {
      orphanedUsers += 1;
      roleCounts.unknown += 1;
      continue;
    }

    const roles = user.roles || {};
    if (roles.admin) roleCounts.admin += 1;
    else if (roles.buyer && roles.seller) roleCounts.both += 1;
    else if (roles.seller) roleCounts.seller += 1;
    else if (roles.buyer) roleCounts.buyer += 1;
    else roleCounts.unknown += 1;
  }

  for (const row of nativeTokens) {
    const userId = String(row?.userId || "").trim();
    const token = String(row?.token || "").trim();
    const updatedAtMs = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;

    if (!userId || !token) {
      nativeInvalidRecords += 1;
    }
    if (updatedAtMs && updatedAtMs < staleCutoffMs) {
      nativeStaleOver30d += 1;
    }

    if (!userId) continue;
    nativeUniqueUsers.add(userId);
    const user = userById.get(userId);
    if (!user) {
      nativeOrphanedUsers += 1;
    }
  }

  res.json({
    vapidConfigured: Boolean(
      String(process.env.VAPID_PUBLIC_KEY || "").trim() &&
      String(process.env.VAPID_PRIVATE_KEY || "").trim()
    ),
    firebaseConfigured: isFirebaseMessagingConfigured(),
    totals: {
      subscriptions: subs.length,
      uniqueUsers: uniqueUsers.size,
      invalidRecords,
      orphanedUsers,
      staleOver30d,
      nativeTokens: nativeTokens.length,
      nativeUsers: nativeUniqueUsers.size,
      nativeInvalidRecords,
      nativeOrphanedUsers,
      nativeStaleOver30d
    },
    byRole: roleCounts
  });
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
    sampleCityPostsEnabled:
      typeof payload.sampleCityPostsEnabled === "boolean"
        ? payload.sampleCityPostsEnabled
        : typeof current?.sampleCityPostsEnabled === "boolean"
        ? current.sampleCityPostsEnabled
        : DEFAULT_SAMPLE_CITY_POSTS_ENABLED,
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
    readLatestWhatsAppUploadMetaByKey("seller_contacts")
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
  const uploadMeta = await readLatestWhatsAppUploadMetaByKey("seller_contacts");
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

router.get("/whatsapp/templates", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const provider = String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
  if (!["wapi", "gupshup"].includes(provider)) {
    return res.status(400).json({ message: "Approved templates are only enabled for WAPI or Gupshup provider" });
  }

  try {
    const templates =
      provider === "gupshup"
        ? await fetchGupshupApprovedTemplates()
        : await fetchWapiApprovedTemplates();
    return res.json({
      provider,
      count: templates.length,
      items: templates
    });
  } catch (err) {
    return res.status(502).json({
      message:
        err?.message ||
        (provider === "gupshup"
          ? "Failed to fetch approved templates from Gupshup"
          : "Failed to fetch approved templates from WAPI BSP")
    });
  }
});

router.post(
  "/whatsapp/templates/sync",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
  async (req, res) => {
    const provider = String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
    if (!["wapi", "gupshup"].includes(provider)) {
      return res.status(400).json({ message: "Template sync is only enabled for WAPI or Gupshup provider" });
    }

    try {
      const templates =
        provider === "gupshup"
          ? await fetchGupshupApprovedTemplates()
          : await fetchWapiApprovedTemplates();

      let inserted = 0;
      let updated = 0;
      const errors = [];

      for (const template of templates) {
        try {
          const existing = await WhatsAppTemplateRegistry.findOne({
            templateName: template.name,
            language: template.languageCode
          }).lean();

          const updateData = {
            templateName: template.name,
            templateId: template.id,
            language: template.languageCode,
            category: template.category || "UTILITY",
            status: template.status || "APPROVED",
            variableCount: template.bodyVariableCount || 0,
            isActive: ["APPROVED", "ACTIVE", "ENABLED"].includes(template.status)
          };

          await WhatsAppTemplateRegistry.findOneAndUpdate(
            {
              templateName: template.name,
              language: template.languageCode
            },
            { $set: updateData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          if (existing) updated += 1;
          else inserted += 1;
        } catch (err) {
          errors.push({
            template: template.name,
            error: err?.message || "Failed to sync"
          });
        }
      }

      await logAdminAction(req.admin, "sync_whatsapp_templates", "whatsapp_template_registry", "bulk", {
        provider,
        total: templates.length,
        inserted,
        updated,
        failed: errors.length
      });

      return res.json({
        provider,
        total: templates.length,
        inserted,
        updated,
        failed: errors.length,
        errors: errors.slice(0, 20)
      });
    } catch (err) {
      return res.status(502).json({
        message: err?.message || "Failed to sync templates from provider"
      });
    }
  }
);

router.get("/whatsapp/templates/registry", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const includeInactive = String(req.query?.includeInactive || "").trim().toLowerCase() === "true";
  const query = includeInactive ? {} : { isActive: true };
  const items = await WhatsAppTemplateRegistry.find(query).sort({
    key: 1,
    language: 1,
    version: -1,
    updatedAt: -1
  });
  return res.json({
    count: items.length,
    items
  });
});

router.post(
  "/whatsapp/templates/upload",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Excel file required" });
    }

    const mode = String(req.body?.mode || "replace").trim().toLowerCase();
    const parsed = parseTemplateRegistryFromWorkbook(req.file.buffer);
    if (parsed.errors.length) {
      return res.status(400).json({
        message: "Template sheet validation failed",
        errors: parsed.errors.slice(0, 50)
      });
    }
    if (!parsed.rows.length) {
      return res.status(400).json({ message: "No valid template rows found in Excel" });
    }

    if (mode !== "append") {
      await WhatsAppTemplateRegistry.deleteMany({});
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];
    let uploadFile = null;

    try {
      uploadFile = await saveLatestWhatsAppUploadByKey("templates", req.file, "whatsapp-templates-latest");
    } catch (err) {
      console.warn("Failed to save uploaded template file:", err?.message || err);
    }

    for (const row of parsed.rows) {
      try {
        const existing = await WhatsAppTemplateRegistry.findOne({
          key: row.key,
          language: row.language,
          version: row.version
        }).lean();
        await WhatsAppTemplateRegistry.findOneAndUpdate(
          {
            key: row.key,
            language: row.language,
            version: row.version
          },
          {
            $set: row
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (existing) updated += 1;
        else inserted += 1;
      } catch (err) {
        errors.push({
          key: row.key,
          language: row.language,
          version: row.version,
          error: err?.message || "Failed to save template"
        });
      }
    }

    await logAdminAction(req.admin, "upload_whatsapp_templates", "whatsapp_template_registry", "bulk", {
      mode,
      parsed: parsed.rows.length,
      inserted,
      updated,
      failed: errors.length
    });

    return res.json({
      parsed: parsed.rows.length,
      inserted,
      updated,
      failed: errors.length,
      uploadFile: uploadFile
        ? {
            originalName: uploadFile.originalName,
            size: uploadFile.size,
            uploadedAt: uploadFile.uploadedAt,
            downloadPath: "/admin/whatsapp/templates/uploaded-file"
          }
        : null,
      errors: errors.slice(0, 30)
    });
  }
);

router.get("/whatsapp/templates/uploaded-file", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const uploadMeta = await readLatestWhatsAppUploadMetaByKey("templates");
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

router.post(
  "/whatsapp/templates/fix",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
  async (req, res) => {
    const templates = [
      {
        key: "buyer_invite_post_requirement",
        templateName: "buyer_invite_post_requirement_v2",
        templateId: "c236ec98-5807-4910-9135-c8f7774ccd54",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        variableCount: 1,
        isActive: true
      },
      {
        key: "buyer_join_app_invite",
        templateName: "buyer_join_app_invite_v1",
        templateId: "46202a21-d425-4cb0-9d60-455aef42bd96",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        variableCount: 1,
        isActive: true
      }
    ];

    let updated = 0;
    let errors = [];

    for (const t of templates) {
      try {
        await WhatsAppTemplateRegistry.findOneAndUpdate(
          { key: t.key },
          { $set: t },
          { upsert: true, new: true }
        );
        updated += 1;
      } catch (err) {
        errors.push({ key: t.key, error: err?.message });
      }
    }

    return res.json({
      success: true,
      updated,
      errors
    });
  }
);

router.post("/whatsapp/template-send", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const provider = String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
  if (!["wapi", "gupshup"].includes(provider)) {
    return res.status(400).json({ message: "Template sending is only enabled for WAPI or Gupshup provider" });
  }

  const recipientType = normalizeRecipientType(req.body?.recipientType);
  const contactIds = Array.isArray(req.body?.contactIds)
    ? req.body.contactIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const templateConfigId = String(req.body?.templateConfigId || "").trim();
  const templateName = String(req.body?.templateName || "").trim();
  const templateId = String(req.body?.templateId || "").trim();
  const languageCode = String(req.body?.languageCode || "en").trim();
  const parameters = Array.isArray(req.body?.parameters)
    ? req.body.parameters.map((value) => String(value || "").trim())
    : [];

  if (!contactIds.length) {
    return res.status(400).json({ message: "Select at least one contact" });
  }
  let resolvedTemplateName = templateName;
  let resolvedTemplateId = templateId;
  let resolvedLanguageCode = languageCode;
  if (templateConfigId) {
    const config = await WhatsAppTemplateRegistry.findById(templateConfigId).lean();
    if (!config) {
      return res.status(404).json({ message: "Template config not found" });
    }
    resolvedTemplateName = String(config.templateName || "").trim();
    resolvedTemplateId = String(config.templateId || "").trim();
    resolvedLanguageCode = String(config.language || "en").trim();
  }

  if (provider === "gupshup" && !resolvedTemplateId) {
    return res.status(400).json({ 
      message: "Gupshup requires templateId (UUID). templateName is not supported. " +
               "Use /admin/whatsapp/templates to fetch approved templates with their UUIDs."
    });
  }
  if (!resolvedTemplateId && !resolvedTemplateName) {
    return res.status(400).json({ message: "templateId or templateName required" });
  }

  const { contacts } = await resolveRecipientContacts(recipientType, contactIds);
  if (!contacts.length) {
    return res.status(404).json({ message: "Selected contacts not found" });
  }

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const results = [];

  for (const contact of contacts) {
    const mobileE164 = String(contact?.mobileE164 || "").trim();
    let status = "skipped";
    let reason = "";
    let providerMessageId = "";
    const eligibility = isContactEligibleForWhatsApp(contact);
    if (!eligibility.ok) {
      reason = eligibility.reason;
    } else {
      attempted += 1;
      try {
        const sendResult = await (provider === "gupshup" ? sendViaGupshupTemplate : sendViaWapiTemplate)({
          to: mobileE164,
          templateId: resolvedTemplateId,
          templateName: resolvedTemplateName,
          languageCode: resolvedLanguageCode,
          parameters
        });
        status = "accepted";
        providerMessageId = String(sendResult?.providerMessageId || "").trim();
        sent += 1;
      } catch (err) {
        status = "failed";
        reason = summarizeProviderError(err?.response?.data || err?.message || err);
        failed += 1;
      }
    }

    if (status === "skipped") {
      skipped += 1;
    }

    await WhatsAppDeliveryLog.create({
      requirementId: null,
      campaignRunId: null,
      triggerType: "template_send",
      channel: "whatsapp",
      mobileE164,
      email: String(contact?.email || "").trim(),
      status,
      reason,
      provider,
      providerMessageId,
      city: String(contact?.city || "").trim(),
      category: Array.isArray(contact?.categories) ? String(contact.categories[0] || "").trim() : "",
      product: `Template: ${resolvedTemplateName || resolvedTemplateId}`,
      createdByAdminId: req.admin?._id || null
    });

    results.push({
      contactId: String(contact?._id || "").trim(),
      mobileE164,
      firmName: String(contact?.firmName || "").trim(),
      status,
      reason,
      providerMessageId
    });
  }

  await logAdminAction(req.admin, "whatsapp_template_send", "whatsapp_contact", "bulk", {
    templateName: resolvedTemplateName || resolvedTemplateId,
    languageCode: resolvedLanguageCode,
    recipientType,
    selectedContacts: contactIds.length,
    attempted,
    sent,
    failed,
    skipped
  });

  return res.json({
    ok: sent > 0 && failed === 0,
    templateName: resolvedTemplateName || resolvedTemplateId,
    languageCode: resolvedLanguageCode,
    recipientType,
    selectedContacts: contactIds.length,
    attempted,
    sent,
    failed,
    skipped,
    results
  });
});

router.get("/whatsapp/delivery-logs", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const page = Math.max(Number(req.query?.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);
  const skip = (page - 1) * limit;

  const query = {};
  const requirementId = String(req.query?.requirementId || "").trim();
  const triggerType = String(req.query?.triggerType || "").trim();
  const status = String(req.query?.status || "").trim();
  const mobile = normalizeE164(req.query?.mobileE164);
  const channel = String(req.query?.channel || "").trim().toLowerCase();
  const from = String(req.query?.from || "").trim();
  const to = String(req.query?.to || "").trim();

  if (requirementId) query.requirementId = requirementId;
  if (triggerType) query.triggerType = triggerType;
  if (status) query.status = status;
  if (mobile) query.mobileE164 = mobile;
  if (channel) query.channel = channel;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const [items, total, summaryRows] = await Promise.all([
    WhatsAppDeliveryLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdByAdminId", "email role")
      .populate("requirementId", "product productName city category"),
    WhatsAppDeliveryLog.countDocuments(query),
    WhatsAppDeliveryLog.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ])
  ]);

  const summary = {
    total,
    accepted: 0,
    queued: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
    opened_manual_link: 0,
    dry_run: 0
  };
  for (const row of summaryRows) {
    const key = String(row?._id || "");
    if (Object.prototype.hasOwnProperty.call(summary, key)) {
      summary[key] = Number(row?.count || 0);
    }
  }

  return res.json({
    items,
    page,
    limit,
    total,
    pages: Math.max(Math.ceil(total / limit), 1),
    summary
  });
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
    if (latestRun) {
      const latestSent = Number(latestRun.sent || 0);
      const latestFailed = Number(latestRun.failed || 0);
      const latestAttempted = Number(latestRun.attempted || 0);

      if (latestSent > 0 && latestFailed > 0) {
        deliveryState = "partial";
      } else if (latestSent > 0 && latestFailed === 0) {
        deliveryState = "sent";
      } else if (latestAttempted > 0 && latestFailed > 0 && latestSent === 0) {
        deliveryState = "failed";
      } else if (String(latestRun.status || "") === "failed") {
        deliveryState = "failed";
      }
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

router.post("/whatsapp/manual-log", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const requirementId = normalizeRequirementId(req.body?.requirementId);
  const mobileE164 = normalizeE164(req.body?.mobileE164);
  const requestedStatus = String(req.body?.status || "opened_manual_link").trim();
  const channel = String(req.body?.channel || "whatsapp").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  const allowedStatuses = new Set(["sent", "failed", "skipped", "opened_manual_link", "dry_run"]);
  const status = allowedStatuses.has(requestedStatus) ? requestedStatus : "opened_manual_link";

  if (!requirementId || !mobileE164) {
    return res.status(400).json({ message: "requirementId and mobileE164 required" });
  }

  const requirement = await Requirement.findById(requirementId)
    .select("_id product productName city category")
    .lean();
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  const log = await WhatsAppDeliveryLog.create({
    requirementId: requirement._id,
    campaignRunId: null,
    triggerType: "manual_queue",
    channel: channel === "email" ? "email" : "whatsapp",
    mobileE164,
    email: "",
    status: status || "opened_manual_link",
    reason: reason || "Manual send button clicked from admin queue",
    provider: "manual",
    city: String(requirement?.city || "").trim(),
    category: String(requirement?.category || "").trim(),
    product: String(requirement?.product || requirement?.productName || "Requirement").trim(),
    createdByAdminId: req.admin?._id || null
  });

  await logAdminAction(req.admin, "whatsapp_manual_log", "requirement", requirementId, {
    mobileE164,
    status: log.status,
    channel: log.channel
  });

  return res.json({ ok: true, id: log._id });
});

router.post("/whatsapp/resend", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const requirementId = normalizeRequirementId(req.body?.requirementId);
  if (!requirementId) {
    return res.status(400).json({ message: "requirementId required" });
  }

  const requirement = await Requirement.findById(requirementId).lean();
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  const requestedChannels = req.body?.channels || {};
  const requestedFilters = req.body?.contactFilters || {};
  const contactFilters = {
    cityKeys: Array.isArray(requestedFilters?.cityKeys)
      ? requestedFilters.cityKeys
      : [],
    categoryKeys: Array.isArray(requestedFilters?.categoryKeys)
      ? requestedFilters.categoryKeys
      : [],
    contactIds: Array.isArray(requestedFilters?.contactIds)
      ? requestedFilters.contactIds
      : []
  };
  const channels = {
    whatsapp: requestedChannels?.whatsapp !== false,
    email: requestedChannels?.email === true
  };
  if (!channels.whatsapp && !channels.email) {
    return res.status(400).json({ message: "Select at least one channel (WhatsApp or Email)" });
  }

  const provider = String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
  const templateConfigId = String(req.body?.templateConfigId || "").trim();
  const templateParameters = Array.isArray(req.body?.templateParameters)
    ? req.body.templateParameters.map((value) => String(value || "").trim())
    : [];
  const recipientType = normalizeRecipientType(req.body?.recipientType);

  if (channels.whatsapp && templateConfigId) {
    if (channels.email) {
      return res.status(400).json({ message: "Template auto mode currently supports WhatsApp channel only" });
    }
    if (!["wapi", "gupshup"].includes(provider)) {
      return res.status(400).json({ message: "Template sending is only enabled for WAPI or Gupshup provider" });
    }

    const templateConfig = await WhatsAppTemplateRegistry.findById(templateConfigId).lean();
    if (!templateConfig) {
      return res.status(404).json({ message: "Selected template config not found" });
    }

    if (!Array.isArray(contactFilters.contactIds) || !contactFilters.contactIds.length) {
      return res.status(400).json({ message: "Contact list is required for template auto mode" });
    }

    const { contacts } = await resolveRecipientContacts(recipientType, contactFilters.contactIds);
    if (!contacts.length) {
      return res.status(404).json({ message: "Selected contacts not found" });
    }

    const run = await WhatsAppCampaignRun.create({
      requirementId: requirement._id,
      triggerType: "manual_resend",
      status: "created",
      city: requirement.city || "",
      category: requirement.category || "",
      channels,
      createdByAdminId: req.admin?._id || null,
      notes: `Template auto mode: ${templateConfig.templateName || templateConfig.templateId}`
    });

    let attempted = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const results = [];
    for (const contact of contacts) {
      const mobileE164 = String(contact?.mobileE164 || "").trim();
      const eligibility = isContactEligibleForWhatsApp(contact);
      let status = "skipped";
      let reason = eligibility.reason || "";
      let providerMessageId = "";

      if (eligibility.ok) {
        attempted += 1;
        try {
          const sendResult = await (provider === "gupshup" ? sendViaGupshupTemplate : sendViaWapiTemplate)({
            to: mobileE164,
            templateId: String(templateConfig.templateId || "").trim(),
            templateName: String(templateConfig.templateName || "").trim(),
            languageCode: String(templateConfig.language || "en").trim(),
            parameters: templateParameters
          });
          status = "accepted";
          providerMessageId = String(sendResult?.providerMessageId || "").trim();
          sent += 1;
        } catch (err) {
          status = "failed";
          reason = summarizeProviderError(err?.response?.data || err?.message || err);
          failed += 1;
        }
      } else {
        skipped += 1;
      }

      await WhatsAppDeliveryLog.create({
        requirementId: requirement._id,
        campaignRunId: run._id,
        triggerType: "manual_resend",
        channel: "whatsapp",
        mobileE164,
        email: String(contact?.email || "").trim(),
        status,
        reason,
        provider,
        providerMessageId,
        city: String(requirement?.city || "").trim(),
        category: String(requirement?.category || "").trim(),
        product: `Template Auto: ${templateConfig.templateName || templateConfig.templateId}`,
        createdByAdminId: req.admin?._id || null
      });

      results.push({
        contactId: String(contact?._id || "").trim(),
        mobileE164,
        status,
        reason,
        providerMessageId
      });
    }

    run.status = failed > 0 && sent === 0 ? "failed" : "completed";
    run.attempted = attempted;
    run.sent = sent;
    run.failed = failed;
    run.skipped = skipped;
    run.channelStats = {
      whatsapp: { attempted, sent, failed, skipped },
      email: { attempted: 0, sent: 0, failed: 0, skipped: 0 }
    };
    await run.save();

    await logAdminAction(req.admin, "whatsapp_resend_post_template", "requirement", requirementId, {
      templateConfigId,
      templateName: templateConfig.templateName || "",
      recipientType,
      attempted,
      sent,
      failed,
      skipped
    });

    return res.json({
      ok: sent > 0 && failed === 0,
      mode: "template_auto",
      templateConfigId,
      templateName: templateConfig.templateName || templateConfig.templateId || "",
      recipientType,
      campaignRunId: run._id,
      attempted,
      sent,
      failed,
      skipped,
      results
    });
  }

  const resendResult = await triggerWhatsAppCampaignForRequirement(
    requirement,
    {
      triggerType: "manual_resend",
      adminId: req.admin?._id || null,
      notes: "Manual resend from admin",
      channels,
      contactFilters
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
  const requirementId = normalizeRequirementId(req.body?.requirementId);
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

router.get("/whatsapp/buyer-contacts", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const contacts = await WhatsAppBuyerContact.find({})
    .sort({ updatedAt: -1 })
    .limit(5000);
  return res.json(contacts);
});

router.get("/whatsapp/buyer-contacts/summary", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const [total, complianceRows, latestContact, uploadMeta] = await Promise.all([
    WhatsAppBuyerContact.countDocuments({ active: true }),
    WhatsAppBuyerContact.aggregate([
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
    WhatsAppBuyerContact.findOne({ active: true }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
    readLatestWhatsAppUploadMetaByKey("buyer_contacts")
  ]);

  const compliance = complianceRows[0] || { optedIn: 0, unsubscribed: 0, dnd: 0 };
  const uploadFile = uploadMeta
    ? {
        originalName: uploadMeta.originalName,
        size: uploadMeta.size,
        uploadedAt: uploadMeta.uploadedAt,
        downloadPath: "/admin/whatsapp/buyer-contacts/uploaded-file"
      }
    : null;

  return res.json({
    total,
    compliance,
    lastUpdatedAt: latestContact?.updatedAt || null,
    uploadFile
  });
});

router.get("/whatsapp/consent-config", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const waMeLink = String(process.env.WHATSAPP_CONSENT_WA_ME_LINK || "https://wa.me/918079060554?text=Hi").trim();
  const [pendingCount, optedInCount] = await Promise.all([
    WhatsAppBuyerContact.countDocuments({ active: true, optInStatus: "not_opted_in" }),
    WhatsAppBuyerContact.countDocuments({ active: true, optInStatus: "opted_in" })
  ]);
  return res.json({
    waMeLink,
    pendingCount,
    optedInCount
  });
});

router.get("/whatsapp/buyer-contacts/uploaded-file", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const uploadMeta = await readLatestWhatsAppUploadMetaByKey("buyer_contacts");
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

router.post(
  "/whatsapp/buyer-contacts/upload",
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
      parsedContacts = parseBuyerContactsFromWorkbook(req.file.buffer);
    } catch {
      return res.status(400).json({
        message: "Invalid Excel file. Please upload a valid .xls or .xlsx file."
      });
    }
    if (!parsedContacts.length) {
      return res.status(400).json({
        message: "No valid rows found. Expected buyer mobile numbers in column A."
      });
    }

    if (mode !== "append") {
      await WhatsAppBuyerContact.deleteMany({});
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];
    let uploadFile = null;

    try {
      uploadFile = await saveLatestWhatsAppUploadByKey("buyer_contacts", req.file, "whatsapp-contacts-buyer-latest");
    } catch (err) {
      console.warn("Failed to save uploaded buyer contacts file:", err?.message || err);
    }

    for (const contact of parsedContacts) {
      try {
        const existing = await WhatsAppBuyerContact.findOne({ mobileE164: contact.mobileE164 }).lean();
        await WhatsAppBuyerContact.findOneAndUpdate(
          { mobileE164: contact.mobileE164 },
          contact,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (existing) updated += 1;
        else inserted += 1;
      } catch (err) {
        errors.push({
          mobileE164: contact.mobileE164,
          error: err?.message || "Failed to save buyer contact"
        });
      }
    }

    await logAdminAction(req.admin, "upload_whatsapp_buyer_contacts", "whatsapp_buyer_contact", "bulk", {
      mode,
      parsed: parsedContacts.length,
      inserted,
      updated,
      failed: errors.length
    });

    return res.json({
      parsed: parsedContacts.length,
      inserted,
      updated,
      failed: errors.length,
      uploadFile: uploadFile
        ? {
            originalName: uploadFile.originalName,
            size: uploadFile.size,
            uploadedAt: uploadFile.uploadedAt,
            downloadPath: "/admin/whatsapp/buyer-contacts/uploaded-file"
          }
        : null,
      errors: errors.slice(0, 30)
    });
  }
);

router.get("/opted-in-sellers", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const { page = 1, limit = 50, city, status, source, search } = req.query;
  const skip = (Math.max(1, Number(page)) - 1) * Math.min(Number(limit), 100);
  const query = {};

  if (city) query.city = city;
  if (status) query.status = status;
  if (source) query.source = source;
  if (search) {
    query.$or = [
      { mobileE164: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } }
    ];
  }

  const [sellers, total] = await Promise.all([
    OptedInSeller.find(query)
      .sort({ optedInAt: -1 })
      .skip(skip)
      .limit(Math.min(Number(limit), 100))
      .lean(),
    OptedInSeller.countDocuments(query)
  ]);

  const stats = await OptedInSeller.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);

  const sourceStats = await OptedInSeller.aggregate([
    { $group: { _id: "$source", count: { $sum: 1 } } }
  ]);

  return res.json({
    sellers,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Math.min(Number(limit), 100))
    },
    stats: {
      byStatus: stats.reduce((acc, s) => { acc[s._id || "unknown"] = s.count; return acc; }, {}),
      bySource: sourceStats.reduce((acc, s) => { acc[s._id || "unknown"] = s.count; return acc; }, {})
    }
  });
});

router.post("/opted-in-sellers/upload", adminAuth, requireAdminPermission("campaigns.manage"), upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ message: "Excel file required" });
  }

  let parsedSellers = [];
  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const mobile = String(row[0] || "").replace(/[^0-9+]/g, "").trim();
      if (!mobile) continue;

      let mobileE164 = mobile.startsWith("+") ? mobile : `+91${mobile.replace(/^0+/, "")}`;
      parsedSellers.push({
        mobileE164,
        mobile: mobileE164.replace(/^\+/, ""),
        city: String(row[1] || "").trim(),
        categories: String(row[2] || "").split(",").map(c => c.trim()).filter(Boolean),
        source: "excel_upload",
        status: "active",
        optedInAt: new Date(),
        metadata: {
          uploadedAt: new Date(),
          uploadedBy: req.admin?._id
        }
      });
    }
  } catch {
    return res.status(400).json({ message: "Invalid Excel file" });
  }

  if (!parsedSellers.length) {
    return res.status(400).json({ message: "No valid sellers found in file" });
  }

  let inserted = 0;
  let updated = 0;
  const errors = [];

  for (const seller of parsedSellers) {
    try {
      const existing = await OptedInSeller.findOne({ mobileE164: seller.mobileE164 }).lean();
      await OptedInSeller.findOneAndUpdate(
        { mobileE164: seller.mobileE164 },
        { $set: seller },
        { upsert: true, new: true }
      );
      if (existing) updated += 1;
      else inserted += 1;
    } catch (err) {
      errors.push({ mobile: seller.mobileE164, error: err?.message });
    }
  }

  await logAdminAction(req.admin, "upload_opted_in_sellers", "opted_in_seller", "bulk", {
    parsed: parsedSellers.length,
    inserted,
    updated,
    failed: errors.length
  });

  return res.json({
    parsed: parsedSellers.length,
    inserted,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 20)
  });
});

router.post("/opted-in-sellers/campaign/send", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const { sellerIds, requirementId, templateKey = "seller_new_requirement_invite_v2" } = req.body;

  if (!requirementId) {
    return res.status(400).json({ message: "requirementId is required" });
  }

  if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
    return res.status(400).json({ message: "At least one seller must be selected" });
  }

  const requirement = await Requirement.findById(requirementId).lean();
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  const sellers = await OptedInSeller.find({ _id: { $in: sellerIds }, status: "active" }).lean();
  if (!sellers.length) {
    return res.status(400).json({ message: "No active sellers found with the provided IDs" });
  }

  const product = requirement.productName || requirement.product || "New requirement";
  const city = requirement.city || "";
  const quantity = String(requirement.quantity || "") + " " + String(requirement.type || "pcs");
  const provider = String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
  const appBase = String(process.env.PUBLIC_APP_URL || "https://hokoapp.in").trim();
  const deepLink = `${appBase}/seller/offer/new?ref=${requirementId}`;

  const templateConfig = await WhatsAppTemplateRegistry.findOne({ key: templateKey, isActive: true }).lean();
  if (!templateConfig) {
    return res.status(400).json({ message: "Template not configured or inactive" });
  }

  const campaignRun = await WhatsAppCampaignRun.create({
    templateKey,
    templateName: templateConfig.templateName,
    templateId: templateConfig.templateId,
    requirementId,
    triggerType: "seller_manual_campaign",
    totalTargeted: sellers.length,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    status: "running",
    createdBy: req.admin?._id
  });

  const results = { sent: 0, failed: 0, errors: [] };

  for (const seller of sellers) {
    try {
      const parameters = [product, city, quantity, String(requirementId)];
      let result;

      if (provider === "gupshup") {
        result = await sendViaGupshupTemplate({
          to: seller.mobileE164,
          templateId: String(templateConfig.templateId || "").trim(),
          templateName: templateConfig.templateName,
          languageCode: String(templateConfig.language || "en").trim(),
          parameters
        });
      } else if (provider === "wapi") {
        result = await sendViaWapiTemplate({
          to: seller.mobileE164,
          templateName: templateConfig.templateName,
          languageCode: String(templateConfig.language || "en").trim(),
          parameters
        });
      } else {
        result = { providerMessageId: `mock_${Date.now()}_${seller.mobileE164}` };
      }

      await WhatsAppDeliveryLog.create({
        requirementId,
        campaignRunId: campaignRun._id,
        triggerType: "seller_manual_campaign",
        channel: "whatsapp",
        mobileE164: seller.mobileE164,
        email: "",
        status: "accepted",
        reason: "",
        provider,
        providerMessageId: result?.providerMessageId || "",
        city: requirement.city,
        category: requirement.category,
        product: product,
        createdByAdminId: req.admin?._id
      });

      await OptedInSeller.findByIdAndUpdate(seller._id, {
        $set: { lastNotifiedAt: new Date() },
        $inc: { totalNotificationsSent: 1 }
      });

      results.sent += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ mobile: seller.mobileE164, error: err?.message });

      await WhatsAppDeliveryLog.create({
        requirementId,
        campaignRunId: campaignRun._id,
        triggerType: "seller_manual_campaign",
        channel: "whatsapp",
        mobileE164: seller.mobileE164,
        email: "",
        status: "failed",
        reason: err?.message || "Send failed",
        provider,
        providerMessageId: "",
        city: requirement.city,
        category: requirement.category,
        product: product,
        createdByAdminId: req.admin?._id
      });
    }
  }

  campaignRun.sent = results.sent;
  campaignRun.failed = results.failed;
  campaignRun.status = "completed";
  await campaignRun.save();

  return res.json({
    success: true,
    campaignRunId: campaignRun._id,
    ...results
  });
});

router.get("/opted-in-sellers/requirements", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const { page = 1, limit = 20, city, category, status } = req.query;
  const skip = (Math.max(1, Number(page)) - 1) * Math.min(Number(limit), 50);

  const query = {};
  if (city) query.city = city;
  if (category) query.category = category;
  if (status) query.status = status;

  const [requirements, total] = await Promise.all([
    Requirement.find(query)
      .select("product productName city category quantity type status createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(Number(limit), 50))
      .lean(),
    Requirement.countDocuments(query)
  ]);

  return res.json({
    requirements,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Math.min(Number(limit), 50))
    }
  });
});

module.exports = router;
