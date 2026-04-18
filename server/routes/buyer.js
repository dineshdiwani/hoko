const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ChatMessage = require("../models/ChatMessage");
const PlatformSettings = require("../models/PlatformSettings");
const TempRequirement = require("../models/TempRequirement");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const WhatsAppBuyerContact = require("../models/WhatsAppBuyerContact");
const { getModerationRules, checkTextForFlags } = require("../utils/moderation");
const {
  buildNotificationData,
  serializeNotification
} = require("../utils/notifications");
const {
  normalizeRequirementAttachmentValues,
  normalizeRequirementAttachmentsForResponse,
  extractStoredRequirementFilename,
  extractAttachmentAliases,
  displayNameFromStoredFilename,
  resolveAttachmentFilenameOnDisk
} = require("../utils/attachments");
const sendPush = require("../utils/sendPush");
const { sendAdminEventEmail, sendEmailToRecipient } = require("../utils/sendEmail");
const { sendOtpSms } = require("../utils/sendSms");
const { triggerWhatsAppCampaignForRequirement } = require("../services/whatsAppCampaign");
const { notifyMatchingSellers } = require("./whatsapp");
const { notifyNewRequirement, notifyNewOffer } = require("../services/adminNotifications");
const { sendViaGupshupTemplate } = require("../utils/sendWhatsApp");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");
const auth = require("../middleware/auth");
const buyerOnly = require("../middleware/buyerOnly");
const { otpSendLimiter, otpVerifyLimiter } = require("../middleware/rateLimit");

const uploadDir = path.join(__dirname, "../uploads/requirements");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const buyerDocUploadDir = path.join(__dirname, "../uploads/buyer-documents");
if (!fs.existsSync(buyerDocUploadDir)) {
  fs.mkdirSync(buyerDocUploadDir, { recursive: true });
}

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".pdf",
  ".docx",
  ".xlsx"
]);
const MIN_POST_AUTO_EXPIRY_DAYS = 7;
const MAX_POST_AUTO_EXPIRY_DAYS = 365;
const MIN_DOC_AUTO_DELETE_DAYS = 1;
const MAX_DOC_AUTO_DELETE_DAYS = 365;

function safeFilename(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const base = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 60);
  return `${base || "file"}${ext}`;
}
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}
function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function shouldNotifySellerEvent(userDoc, eventKey) {
  const settings = userDoc?.sellerSettings || {};
  if (eventKey === "auction") {
    return settings.notificationsAuction !== false;
  }
  if (eventKey === "lead") {
    return settings.notificationsLeads !== false;
  }
  return settings.notificationsOffers !== false;
}
function normalizeOfferInvitedFrom(value) {
  return normalizeText(value) === "anywhere" ? "anywhere" : "city";
}
function normalizeRequirementStatus(value) {
  const normalized = normalizeText(value);
  if (["closed", "fulfilled", "cancelled", "expired"].includes(normalized)) {
    return normalized;
  }
  return "open";
}
function getEffectiveRequirementStatus(requirement) {
  const explicitStatus = normalizeRequirementStatus(requirement?.status);
  if (explicitStatus !== "open") return explicitStatus;
  const expiresAt = requirement?.expiresAt ? new Date(requirement.expiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return "open";
}
function mapRequirementLifecycle(requirement) {
  const data = normalizeRequirementAttachmentsForResponse(requirement);
  data.status = getEffectiveRequirementStatus(requirement);
  data.expiresAt = requirement?.expiresAt || null;
  data.statusUpdatedAt = requirement?.statusUpdatedAt || null;
  return data;
}
function normalizeOfferOutcomeStatus(value) {
  const normalized = normalizeText(value);
  if (["shortlisted", "rejected", "selected"].includes(normalized)) {
    return normalized;
  }
  return "pending";
}
function getFreshBuyerSettings(user) {
  const base = user?.buyerSettings || {};
  return {
    defaultCity: String(base.defaultCity || "").trim(),
    defaultCategory: String(base.defaultCategory || "").trim(),
    defaultUnit: String(base.defaultUnit || "").trim(),
    hideProfileUntilApproved:
      typeof base.hideProfileUntilApproved === "boolean"
        ? base.hideProfileUntilApproved
        : true,
    hideEmail:
      typeof base.hideEmail === "boolean"
        ? base.hideEmail
        : (typeof base.hideProfileUntilApproved === "boolean"
            ? base.hideProfileUntilApproved
            : true),
    hidePhone:
      typeof base.hidePhone === "boolean"
        ? base.hidePhone
        : (typeof base.hideProfileUntilApproved === "boolean"
            ? base.hideProfileUntilApproved
            : true),
    chatOnlyAfterOfferAcceptance:
      typeof base.chatOnlyAfterOfferAcceptance === "boolean"
        ? base.chatOnlyAfterOfferAcceptance
        : true,
    postAutoExpiryDays: clamp(
      base.postAutoExpiryDays,
      MIN_POST_AUTO_EXPIRY_DAYS,
      MAX_POST_AUTO_EXPIRY_DAYS,
      30
    ),
    documentAutoDeleteDays: clamp(
      base.documentAutoDeleteDays,
      MIN_DOC_AUTO_DELETE_DAYS,
      MAX_DOC_AUTO_DELETE_DAYS,
      30
    ),
    notificationToggles: {
      pushEnabled:
        typeof base.notificationToggles?.pushEnabled === "boolean"
          ? base.notificationToggles.pushEnabled
          : true,
      newOffer:
        typeof base.notificationToggles?.newOffer === "boolean"
          ? base.notificationToggles.newOffer
          : true,
      chat:
        typeof base.notificationToggles?.chat === "boolean"
          ? base.notificationToggles.chat
          : true,
      statusUpdate:
        typeof base.notificationToggles?.statusUpdate === "boolean"
          ? base.notificationToggles.statusUpdate
          : true,
      reminder:
        typeof base.notificationToggles?.reminder === "boolean"
          ? base.notificationToggles.reminder
          : true
    },
    documents: Array.isArray(base.documents) ? base.documents : []
  };
}
function normalizeBuyerDocument(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id || ""),
    filename: String(doc.filename || ""),
    originalName: String(doc.originalName || ""),
    url: String(doc.url || ""),
    size: Number(doc.size || 0),
    mimetype: String(doc.mimetype || ""),
    requirementId: doc.requirementId ? String(doc.requirementId) : "",
    visibleToSellerId: doc.visibleToSellerId ? String(doc.visibleToSellerId) : "",
    autoDeleteDays: clamp(doc.autoDeleteDays, MIN_DOC_AUTO_DELETE_DAYS, MAX_DOC_AUTO_DELETE_DAYS, 30),
    createdAt: doc.createdAt || null
  };
}
function isDocumentExpired(doc) {
  if (!doc?.createdAt) return false;
  const days = clamp(
    doc.autoDeleteDays,
    MIN_DOC_AUTO_DELETE_DAYS,
    MAX_DOC_AUTO_DELETE_DAYS,
    30
  );
  const ageMs = Date.now() - new Date(doc.createdAt).getTime();
  return ageMs > days * 24 * 60 * 60 * 1000;
}
function removeFileIfExists(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore unlink errors; record cleanup should still continue.
  }
}
async function cleanupExpiredBuyerDocuments(user) {
  const settings = getFreshBuyerSettings(user);
  const docs = Array.isArray(settings.documents) ? settings.documents : [];
  const keep = [];
  let changed = false;

  docs.forEach((doc) => {
    if (isDocumentExpired(doc)) {
      changed = true;
      const filename = String(doc.filename || "").trim();
      if (filename) {
        removeFileIfExists(path.join(buyerDocUploadDir, filename));
      }
      return;
    }
    keep.push(doc);
  });

  if (changed) {
    user.buyerSettings = {
      ...settings,
      documents: keep
    };
    await user.save();
  }
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const finalName = `${req.user._id}_${Date.now()}_${safeFilename(
      file.originalname
    )}`;
    cb(null, finalName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  }
});
const buyerDocStorage = multer.diskStorage({
  destination: buyerDocUploadDir,
  filename: (req, file, cb) => {
    const finalName = `${req.user._id}_${Date.now()}_${safeFilename(
      file.originalname
    )}`;
    cb(null, finalName);
  }
});
const buyerDocUpload = multer({
  storage: buyerDocStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  }
});

function resolveWhatsAppProvider() {
  return String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
}

async function findOrCreateSoftUserByMobile(mobileE164, city = "user_default") {
  const existingSoftUser = await User.findOne({
    mobile: mobileE164,
    passwordHash: { $exists: false },
    $or: [
      { email: { $exists: false } },
      { email: "" }
    ]
  }).lean();

  if (existingSoftUser) {
    return { user: existingSoftUser, created: false };
  }

  const softUser = await User.create({
    mobile: mobileE164,
    city: city || "user_default",
    roles: { buyer: true, seller: false, admin: false }
  });

  return { user: softUser, created: true };
}

async function sendRequirementAckTemplate(mobileE164, requirementId) {
  const provider = String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
  if (!["gupshup", "meta"].includes(provider)) {
    console.log(`[Requirement Ack] Provider ${provider} not supported`);
    return { ok: false, reason: "unsupported_provider" };
  }

  const displayId = String(requirementId).slice(-6).toUpperCase();

  const templateConfig = await WhatsAppTemplateRegistry.findOne({
    key: "buyer_join_app_invite",
    isActive: true
  }).lean();

  if (!templateConfig) {
    console.warn("[Requirement Ack] Template config not found for buyer_requirement_ack_v3");
    return { ok: false, reason: "template_not_configured" };
  }

  try {
    const templateId = String(templateConfig.templateId || "").trim();
    const languageCode = String(templateConfig.language || "en").trim();
    const displayId = String(requirementId).slice(-6).toUpperCase();
    const parameters = [displayId];

    const result = await sendViaGupshupTemplate({
      to: mobileE164,
      templateId,
      templateName: templateConfig.templateName,
      languageCode,
      parameters
    });

    await WhatsAppDeliveryLog.create({
      requirementId: null,
      campaignRunId: null,
      triggerType: "buyer_requirement_ack",
      channel: "whatsapp",
      mobileE164,
      email: "",
      status: "accepted",
      reason: "",
      provider,
      providerMessageId: result?.providerMessageId || "",
      city: "",
      category: "",
      product: `ack_${requirementId}`,
      createdByAdminId: null
    });

    await WhatsAppBuyerContact.findOneAndUpdate(
      { mobileE164 },
      {
        $set: {
          active: true,
          optInStatus: "opted_in",
          optInAt: new Date(),
          optInSource: "requirement_acknowledged"
        }
      },
      { upsert: true, new: true }
    );

    console.log(`[Requirement Ack] Sent ack to ${mobileE164} for req ${requirementId}`);
    return { ok: true, providerMessageId: result?.providerMessageId };
  } catch (err) {
    console.error(`[Requirement Ack] Failed for ${mobileE164}:`, err?.message || err);
    await WhatsAppDeliveryLog.create({
      requirementId: null,
      campaignRunId: null,
      triggerType: "buyer_requirement_ack",
      channel: "whatsapp",
      mobileE164,
      email: "",
      status: "failed",
      reason: err?.message || "send_failed",
      provider,
      providerMessageId: "",
      city: "",
      category: "",
      product: `ack_${requirementId}`,
      createdByAdminId: null
    });
    return { ok: false, reason: err?.message || "send_failed" };
  }
}

router.get("/temp-requirement/:refId", async (req, res) => {
  const { refId } = req.params;
  
  let cleanRefId = refId.trim();
  try {
    const decoded = decodeURIComponent(cleanRefId);
    const idMatch = decoded.match(/([a-f0-9]{20,24})/i);
    if (idMatch) cleanRefId = idMatch[1];
  } catch {}
  
  try {
    const tempReq = await TempRequirement.findOne({ _id: cleanRefId }).lean();
    if (!tempReq) {
      return res.status(404).json({ message: "Temp requirement not found" });
    }
    
    res.json({
      mobileE164: tempReq.mobileE164,
      product: tempReq.product,
      city: tempReq.city,
      status: tempReq.status
    });
  } catch (err) {
    console.error("[TempRequirement] Error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Public endpoint for WhatsApp-initiated requirement submission
 */
router.post("/requirement/public", async (req, res) => {
  const { ref, productName, product, city, category, quantity, type, details, brand, makeBrand, typeModel, offerInvitedFrom } = req.body;

  console.log("[Public Requirement] Received ref:", ref);

  if (!ref) {
    return res.status(400).json({ message: "ref is required" });
  }

  let refId = ref.trim();
  try {
    const decoded = decodeURIComponent(refId);
    const idMatch = decoded.match(/([a-f0-9]{20,24})/i);
    if (idMatch) {
      refId = idMatch[1];
    }
  } catch {
    const idMatch = refId.match(/([a-f0-9]{20,24})/i);
    if (idMatch) {
      refId = idMatch[1];
    }
  }

  console.log("[Public Requirement] Extracted refId:", refId);

  let tempRequirement = null;
  try {
    tempRequirement = await TempRequirement.findOne({
      _id: refId,
      status: "pending"
    }).lean();
  } catch (err) {
    console.error("[Public Requirement] Query error:", err.message);
  }

  console.log("[Public Requirement] TempRequirement:", tempRequirement ? "found" : "not found");

  if (!tempRequirement) {
    return res.status(404).json({ message: "Invalid or expired reference. Please start again from WhatsApp." });
  }

  if (new Date(tempRequirement.expiresAt) < new Date()) {
    await TempRequirement.findByIdAndUpdate(tempRequirement._id, { $set: { status: "expired" } });
    return res.status(410).json({ message: "Reference has expired. Please start again from WhatsApp." });
  }

  const mobileE164 = tempRequirement.mobileE164;

  if (new Date(tempRequirement.expiresAt) < new Date()) {
    await TempRequirement.findByIdAndUpdate(tempRequirement._id, { $set: { status: "expired" } });
    return res.status(410).json({ message: "Reference has expired. Please start again from WhatsApp." });
  }

  const { user: softUser } = await findOrCreateSoftUserByMobile(mobileE164, city);

  const moderationRules = await getModerationRules();
  const textParts = [productName, product, details, brand, makeBrand, typeModel, type].filter(Boolean);
  const flaggedReason = checkTextForFlags(textParts.join(" "), moderationRules);

  const requirement = await Requirement.create({
    productName: productName || product,
    product: productName || product,
    city,
    category,
    quantity,
    type,
    details,
    brand,
    makeBrand,
    typeModel,
    status: "open",
    statusUpdatedAt: new Date(),
    expiresAt: (() => {
      const days = clamp(30, MIN_POST_AUTO_EXPIRY_DAYS, MAX_POST_AUTO_EXPIRY_DAYS, 30);
      const next = new Date();
      next.setDate(next.getDate() + days);
      return next;
    })(),
    offerInvitedFrom: normalizeOfferInvitedFrom(offerInvitedFrom),
    attachments: [],
    buyerId: softUser._id,
    moderation: flaggedReason
      ? { flagged: true, flaggedAt: new Date(), flaggedReason }
      : undefined
  });

  await TempRequirement.findByIdAndUpdate(tempRequirement._id, {
    $set: {
      status: "completed",
      requirementId: requirement._id,
      userId: softUser._id
    }
  });

  const ackResult = await sendRequirementAckTemplate(mobileE164, requirement._id);

  setImmediate(async () => {
    try {
      await triggerWhatsAppCampaignForRequirement(requirement, {
        triggerType: "buyer_post",
        contactFilters: { cityKeys: [normalizeText(city)] }
      });
      await notifyMatchingSellers(requirement);
    } catch (err) {
      console.warn("[WhatsApp Campaign] Trigger failed:", err?.message || err);
    }
  });

  notifyNewRequirement(
    requirement.productName || requirement.product,
    requirement.city,
    requirement.quantity,
    requirement.unit || requirement.type,
    softUser.mobile || "",
    requirement._id
  );

  return res.status(201).json({
    success: true,
    requirementId: requirement._id,
    tempRequirementId: tempRequirement._id,
    ackSent: ackResult.ok,
    message: "Requirement submitted successfully"
  });
});

const WhatsAppOTP = require("../models/WhatsAppOTP");
const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { normalizeE164 } = require("../utils/sendWhatsApp");

function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function findOrCreateSoftUserByMobile(mobile, city) {
  const normalizedMobile = normalizeE164(mobile);
  let user = await mongoose.model("User").findOne({ phone: normalizedMobile });
  if (!user) {
    user = await mongoose.model("User").create({
      phone: normalizedMobile,
      city: city || "",
      roles: { buyer: true },
      buyerSettings: { name: "Buyer" },
      verified: false
    });
  }
  return { user };
}

async function createRequirementFromOTPData(otpRecord, user) {
  const data = otpRecord.requirementData;
  const { user: softUser } = await findOrCreateSoftUserByMobile(otpRecord.mobileE164, data?.city);
  
  const moderationRules = await getModerationRules();
  const textParts = [data?.productName, data?.product, data?.details, data?.brand, data?.makeBrand, data?.typeModel, data?.type].filter(Boolean);
  const flaggedReason = checkTextForFlags(textParts.join(" "), moderationRules);

  let tempRequirement = null;
  if (data?.ref) {
    let refId = data.ref.trim();
    try {
      const decoded = decodeURIComponent(refId);
      const idMatch = decoded.match(/([a-f0-9]{20,24})/i);
      if (idMatch) refId = idMatch[1];
    } catch {}
    
    try {
      tempRequirement = await TempRequirement.findOne({ _id: refId, status: "pending" }).lean();
    } catch {}
  }

  const requirement = await Requirement.create({
    productName: data?.productName || data?.product,
    product: data?.productName || data?.product,
    city: data?.city,
    category: data?.category,
    quantity: data?.quantity,
    type: data?.type,
    details: data?.details,
    brand: data?.brand,
    makeBrand: data?.makeBrand,
    typeModel: data?.typeModel,
    status: "open",
    statusUpdatedAt: new Date(),
    expiresAt: (() => {
      const days = clamp(30, 7, 30, 30);
      const next = new Date();
      next.setDate(next.getDate() + days);
      return next;
    })(),
    offerInvitedFrom: normalizeOfferInvitedFrom(data?.offerInvitedFrom),
    attachments: data?.attachments || [],
    buyerId: softUser._id,
    moderation: flaggedReason
      ? { flagged: true, flaggedAt: new Date(), flaggedReason }
      : undefined
  });

  if (tempRequirement) {
    await TempRequirement.findByIdAndUpdate(tempRequirement._id, {
      $set: {
        status: "completed",
        requirementId: requirement._id,
        userId: softUser._id
      }
    });
  }

  return { requirement, softUser, tempRequirement };
}

async function sendOTPviaWhatsApp(mobileE164, otp, product, city) {
  const message = [
    `🔐 Your HOKO OTP: *${otp}*`,
    "",
    `Valid for 5 minutes.`,
    "",
    product ? `Requirement: ${product}` : "",
    city ? `City: ${city}` : "",
    "",
    "HOKO - India's B2B Marketplace"
  ].filter(Boolean).join("\n");

  // Try WhatsApp first
  try {
    await sendWhatsAppMessage({
      to: mobileE164,
      body: message
    });
    return { ok: true, method: "whatsapp" };
  } catch (err) {
    console.error("[OTP] WhatsApp send error:", err.message);
    
    // Fallback to SMS if WhatsApp fails
    try {
      const mobileNumber = mobileE164.replace(/\+/g, "");
      await sendOtpSms({ mobile: mobileNumber, otp });
      return { ok: true, method: "sms" };
    } catch (smsErr) {
      console.error("[OTP] SMS fallback error:", smsErr.message);
      return { ok: false, error: smsErr.message };
    }
  }
}

async function sendRequirementConfirmationviaWhatsApp(mobileE164, requirement, product) {
  const appBase = resolvePublicAppUrl();
  const deepLink = `${appBase}/buyer/login?redirect=/buyer/dashboard&mobile=${encodeURIComponent(mobileE164.replace("+", ""))}`;
  
  const message = [
    "✅ *Requirement Confirmed!*",
    "",
    `📋 ID: HOKO-${requirement._id.toString().slice(-8).toUpperCase()}`,
    `📦 ${product || requirement.productName || requirement.product}`,
    requirement.city ? `📍 City: ${requirement.city}` : "",
    requirement.quantity ? `📊 Qty: ${requirement.quantity} ${requirement.type || ""}` : "",
    "",
    "🔥 Sellers have been notified!",
    "⏱️ Offers expected in ~1 hour",
    "",
    "📱 Track offers & chat with sellers:",
    deepLink,
    "",
    "Download HOKO App for best experience!",
    "",
    "HOKO - India's B2B Marketplace"
  ].filter(Boolean).join("\n");

  try {
    await sendWhatsAppMessage({
      to: mobileE164,
      body: message
    });
    return { ok: true };
  } catch (err) {
    console.error("[Confirmation] WhatsApp send error:", err.message);
    return { ok: false, error: err.message };
  }
}

router.post("/requirement/request-otp", otpSendLimiter, async (req, res) => {
  const { mobile, product, city } = req.body;
  
  if (!mobile) {
    return res.status(400).json({ success: false, message: "Mobile number is required" });
  }

  const mobileE164 = normalizeE164(mobile);
  
  await WhatsAppOTP.updateMany(
    { mobileE164, status: "pending" },
    { $set: { status: "expired" } }
  );

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const otpRecord = await WhatsAppOTP.create({
    mobileE164,
    otp,
    expiresAt,
    status: "pending",
    requirementData: null,
    provider: "whatsapp"
  });

  const sendResult = await sendOTPviaWhatsApp(mobileE164, otp, product, city);

  if (!sendResult.ok) {
    return res.status(500).json({ 
      success: false, 
      message: "Failed to send OTP. Please try again." 
    });
  }

  res.json({ 
    success: true, 
    message: sendResult.method === "sms" ? "OTP sent via SMS" : "OTP sent to WhatsApp",
    expiresIn: 300
  });
});

router.post("/requirement/verify-otp", otpVerifyLimiter, async (req, res) => {
  const { mobile, otp, requirementData } = req.body;
  
  if (!mobile || !otp) {
    return res.status(400).json({ success: false, message: "Mobile and OTP are required" });
  }

  const mobileE164 = normalizeE164(mobile);
  
  const otpRecord = await WhatsAppOTP.findOne({
    mobileE164,
    otp: otp.trim(),
    status: "pending"
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid or expired OTP. Please request a new one." 
    });
  }

  if (new Date() > otpRecord.expiresAt) {
    await WhatsAppOTP.findByIdAndUpdate(otpRecord._id, { $set: { status: "expired" } });
    return res.status(400).json({ 
      success: false, 
      message: "OTP has expired. Please request a new one." 
    });
  }

  if (otpRecord.attempts >= 5) {
    await WhatsAppOTP.findByIdAndUpdate(otpRecord._id, { $set: { status: "expired" } });
    return res.status(400).json({ 
      success: false, 
      message: "Too many attempts. Please request a new OTP." 
    });
  }

  await otpRecord.incrementAttempts();

  let requirement, softUser, tempRequirement;
  
  try {
    otpRecord.requirementData = requirementData;
    await otpRecord.save();
    
    const result = await createRequirementFromOTPData(otpRecord, softUser);
    requirement = result.requirement;
    softUser = result.softUser;
    tempRequirement = result.tempRequirement;

    softUser.mobile = mobileE164;
    softUser.phone = mobileE164;
    softUser.role = "buyer";
    if (!softUser.roles?.buyer) {
      softUser.roles = { ...softUser.roles, buyer: true };
    }
    await softUser.save();
  } catch (err) {
    console.error("[OTP Verify] Requirement creation error:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to create requirement. Please try again." 
    });
  }

  await WhatsAppOTP.findByIdAndUpdate(otpRecord._id, { 
    $set: { 
      status: "verified", 
      verifiedAt: new Date() 
    } 
  });

  await sendRequirementConfirmationviaWhatsApp(mobileE164, requirement, requirementData?.product);

  const token = jwt.sign(
    { id: softUser._id, role: "buyer", tokenVersion: softUser.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  setImmediate(async () => {
    try {
      const { triggerWhatsAppCampaignForRequirement } = require("../services/whatsAppCampaign");
      const { notifyMatchingSellers } = require("./whatsapp");
      const cityNormalized = String(requirement.city || "").trim().toLowerCase();
      
      await triggerWhatsAppCampaignForRequirement(requirement, {
        triggerType: "buyer_post",
        contactFilters: { cityKeys: [cityNormalized] }
      });
      await notifyMatchingSellers(requirement);
    } catch (err) {
      console.warn("[WhatsApp Campaign] Trigger failed:", err?.message || err);
    }
  });

  res.json({ 
    success: true, 
    message: "Requirement submitted and verified!",
    requirementId: requirement._id,
    token,
    user: {
      _id: softUser._id,
      email: softUser.email,
      role: softUser.role,
      roles: softUser.roles,
      city: softUser.city,
      preferredCurrency: softUser.preferredCurrency || "INR",
      mobile: softUser.mobile
    }
  });
});

/**
 * Upload requirement attachments
 */
router.post(
  "/requirement/attachments",
  auth,
  buyerOnly,
  upload.array("files", 5),
  async (req, res) => {
    const files = (req.files || []).map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      url: `/uploads/requirements/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype
    }));
    res.json({ files });
  }
);

/**
 * Create buyer requirement
 */
router.post("/requirement", auth, buyerOnly, async (req, res) => {
  const moderationRules = await getModerationRules();
  const textParts = [
    req.body?.productName,
    req.body?.product,
    req.body?.details,
    req.body?.brand,
    req.body?.makeBrand,
    req.body?.typeModel,
    req.body?.type
  ].filter(Boolean);
  const flaggedReason = checkTextForFlags(textParts.join(" "), moderationRules);

  const requirement = await Requirement.create({
    ...req.body,
    status: "open",
    statusUpdatedAt: new Date(),
    expiresAt: (() => {
      const buyerSettings = getFreshBuyerSettings(req.user);
      const days = clamp(
        buyerSettings.postAutoExpiryDays,
        MIN_POST_AUTO_EXPIRY_DAYS,
        MAX_POST_AUTO_EXPIRY_DAYS,
        30
      );
      const next = new Date();
      next.setDate(next.getDate() + days);
      return next;
    })(),
    offerInvitedFrom: normalizeOfferInvitedFrom(req.body?.offerInvitedFrom),
    attachments: normalizeRequirementAttachmentValues(req.body?.attachments),
    buyerId: req.user._id,
    moderation: flaggedReason
      ? {
          flagged: true,
          flaggedAt: new Date(),
          flaggedReason
        }
      : undefined
  });
  res.json(mapRequirementLifecycle(requirement));

  const io = req.app.get("io");
  const requirementName =
    requirement.product || requirement.productName || "New requirement";
  const normalizedCategory = String(requirement.category || "")
    .trim()
    .toLowerCase();
  const offerInvitedFrom = normalizeOfferInvitedFrom(
    requirement.offerInvitedFrom
  );
  const requirementCityNormalized = normalizeText(requirement.city);

  setImmediate(async () => {
    try {
      const sellerQuery = {
        _id: { $ne: req.user._id },
        "roles.seller": true,
        blocked: { $ne: true }
      };
      if (normalizedCategory) {
        sellerQuery["sellerProfile.categories"] = normalizedCategory;
      } else {
        sellerQuery["sellerProfile.categories.0"] = { $exists: true };
      }
      if (
        offerInvitedFrom === "city" &&
        requirementCityNormalized
      ) {
        sellerQuery.city = new RegExp(
          `^${escapeRegex(requirement.city || "")}$`,
          "i"
        );
      }

      const sellerIds = await User.find(sellerQuery).distinct("_id");
      if (!sellerIds.length) return;

      const notifications = await Promise.all(
        sellerIds.map((sellerId) =>
          Notification.create({
            userId: sellerId,
            fromUserId: req.user._id,
            requirementId: requirement._id,
            type: "new_post",
            message: `New post in ${requirement.category || "your"} category: ${requirementName}`,
            data: buildNotificationData("new_post", {
              action: "open_requirement",
              requirementId: String(requirement._id),
              entityType: "requirement",
              entityId: String(requirement._id),
              category: normalizedCategory,
              offerInvitedFrom,
              url: "/seller/dashboard"
            })
          })
        )
      );

      if (io) {
        notifications.forEach((notification, idx) => {
          const sellerId = sellerIds[idx];
          if (!sellerId) return;
          io.to(String(sellerId)).emit(
            "notification",
            serializeNotification(notification, { fallbackUrl: "/seller/dashboard" })
          );
        });
      }

      const sellers = await User.find({ _id: { $in: sellerIds } })
        .select("_id sellerSettings")
        .lean();
      const sellerSettingsById = new Map(
        sellers.map((seller) => [String(seller._id), seller])
      );

      await Promise.all(
        sellerIds.map(async (sellerId) => {
          try {
            const sellerDoc = sellerSettingsById.get(String(sellerId));
            if (!shouldNotifySellerEvent(sellerDoc, "lead")) {
              return;
            }
            await sendPush(String(sellerId), {
              title: "New Buyer Post",
              body: `New post in ${requirement.category || "your"} category: ${requirementName}`,
              data: {
                url: "/seller/dashboard"
              }
            });
          } catch {
            // Non-blocking push failures.
          }
        })
      );
    } catch (err) {
      console.warn(
        "Seller new-post notification dispatch failed:",
        err?.message || err
      );
    }
  });

  setImmediate(async () => {
    try {
      await triggerWhatsAppCampaignForRequirement(requirement);
      await notifyMatchingSellers(requirement);
    } catch (err) {
      console.warn(
        "WhatsApp campaign trigger failed for requirement",
        requirement?._id,
        err?.message || err
      );
    }
  });
});

/**
 * Get buyer's own posts
 */
router.get("/my-posts/:buyerId", auth, buyerOnly, async (req, res) => {
  if (
    req.params.buyerId &&
    String(req.params.buyerId) !== String(req.user._id)
  ) {
    return res.status(403).json({ message: "Not allowed" });
  }
  const posts = await Requirement.find({
    buyerId: req.user._id
  }).sort({ createdAt: -1 });

  const requirementIds = posts.map((p) => p._id);
  const offerCounts = await Offer.aggregate([
    {
      $match: {
        requirementId: { $in: requirementIds },
        "moderation.removed": { $ne: true }
      }
    },
    { $group: { _id: "$requirementId", count: { $sum: 1 } } }
  ]);

  const countMap = new Map(
    offerCounts.map((row) => [String(row._id), row.count])
  );

  const offers = await Offer.find({
    requirementId: { $in: requirementIds },
    "moderation.removed": { $ne: true }
  }).populate("sellerId", "sellerProfile city email roles");

  const sellersByRequirement = new Map();
  offers.forEach((offer) => {
    const reqId = String(offer.requirementId);
    const seller = offer.sellerId;
    if (!seller) return;
    if (!sellersByRequirement.has(reqId)) {
      sellersByRequirement.set(reqId, new Map());
    }
    const firmName =
      seller?.sellerProfile?.firmName ||
      seller?.sellerProfile?.businessName ||
      seller?.email ||
      "Seller";
    sellersByRequirement
      .get(reqId)
      .set(String(seller._id), {
        id: seller._id,
        firmName
      });
  });

  const withCounts = posts.map((post) => {
    const data = mapRequirementLifecycle(post);
    data.offerCount = countMap.get(String(post._id)) || 0;
    const sellersMap = sellersByRequirement.get(String(post._id));
    data.sellerFirms = sellersMap
      ? Array.from(sellersMap.values())
      : [];
    return data;
  });

  res.json(withCounts);
});

/**
 * Get a single buyer requirement
 */
router.get("/requirement/:id", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }
  res.json(mapRequirementLifecycle(requirement));
});

/**
 * Update requirement
 */
router.put("/requirement/:id", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }
  const nextPayload = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(nextPayload, "offerInvitedFrom")) {
    nextPayload.offerInvitedFrom = normalizeOfferInvitedFrom(
      nextPayload.offerInvitedFrom
    );
  }
  if (Object.prototype.hasOwnProperty.call(nextPayload, "attachments")) {
    nextPayload.attachments = normalizeRequirementAttachmentValues(
      nextPayload.attachments
    );
  }

  const beforeUpdate = {
    city: String(requirement.city || "").trim(),
    category: String(requirement.category || "").trim().toLowerCase(),
    product: String(requirement.product || requirement.productName || "").trim(),
    makeBrand: String(requirement.makeBrand || requirement.brand || "").trim(),
    typeModel: String(requirement.typeModel || "").trim(),
    quantity: String(requirement.quantity || "").trim(),
    type: String(requirement.type || "").trim(),
    details: String(requirement.details || "").trim(),
    offerInvitedFrom: normalizeOfferInvitedFrom(requirement.offerInvitedFrom),
    attachments: normalizeRequirementAttachmentValues(requirement.attachments || [])
  };

  Object.assign(requirement, nextPayload);
  requirement.status = "open";
  requirement.statusUpdatedAt = new Date();
  await requirement.save();

  const afterUpdate = {
    city: String(requirement.city || "").trim(),
    category: String(requirement.category || "").trim().toLowerCase(),
    product: String(requirement.product || requirement.productName || "").trim(),
    makeBrand: String(requirement.makeBrand || requirement.brand || "").trim(),
    typeModel: String(requirement.typeModel || "").trim(),
    quantity: String(requirement.quantity || "").trim(),
    type: String(requirement.type || "").trim(),
    details: String(requirement.details || "").trim(),
    offerInvitedFrom: normalizeOfferInvitedFrom(requirement.offerInvitedFrom),
    attachments: normalizeRequirementAttachmentValues(requirement.attachments || [])
  };

  const changedFields = [];
  if (beforeUpdate.city !== afterUpdate.city) changedFields.push("city");
  if (beforeUpdate.category !== afterUpdate.category) changedFields.push("category");
  if (beforeUpdate.product !== afterUpdate.product) changedFields.push("product");
  if (beforeUpdate.makeBrand !== afterUpdate.makeBrand) changedFields.push("makeBrand");
  if (beforeUpdate.typeModel !== afterUpdate.typeModel) changedFields.push("typeModel");
  if (beforeUpdate.quantity !== afterUpdate.quantity) changedFields.push("quantity");
  if (beforeUpdate.type !== afterUpdate.type) changedFields.push("type");
  if (beforeUpdate.details !== afterUpdate.details) changedFields.push("details");
  if (beforeUpdate.offerInvitedFrom !== afterUpdate.offerInvitedFrom) {
    changedFields.push("offerInvitedFrom");
  }
  if (
    JSON.stringify(beforeUpdate.attachments) !==
    JSON.stringify(afterUpdate.attachments)
  ) {
    changedFields.push("attachments");
  }

  const requirementName = requirement.product || requirement.productName || "your requirement";
  const sellerIds = await Offer.distinct("sellerId", {
    requirementId: requirement._id,
    "moderation.removed": { $ne: true }
  });

  if (sellerIds.length > 0) {
    const message = `Buyer updated requirement: ${requirementName}. Please review and update your offer if needed.`;
    const notifications = await Promise.all(
      sellerIds.map((sellerId) =>
        Notification.create({
          userId: sellerId,
          message,
          type: "requirement_updated",
          requirementId: requirement._id,
          fromUserId: req.user._id,
          data: buildNotificationData("requirement_updated", {
            action: "open_offer_edit",
            requirementId: String(requirement._id),
            entityType: "requirement",
            entityId: String(requirement._id),
            productName: requirementName,
            changedFields,
            url: "/seller/dashboard"
          })
        })
      )
    );

    const io = req.app.get("io");
    if (io) {
      notifications.forEach((notification, idx) => {
        const sellerId = sellerIds[idx];
        if (!sellerId) return;
        io.to(String(sellerId)).emit(
          "notification",
          serializeNotification(notification, { fallbackUrl: "/seller/dashboard" })
        );
      });
    }

    const sellers = await User.find({ _id: { $in: sellerIds } })
      .select("_id sellerSettings")
      .lean();
    const sellerSettingsById = new Map(
      sellers.map((seller) => [String(seller._id), seller])
    );

    await Promise.all(
      sellerIds.map(async (sellerId) => {
        try {
          const sellerDoc = sellerSettingsById.get(String(sellerId));
          if (!shouldNotifySellerEvent(sellerDoc, "offer")) {
            return;
          }
          await sendPush(String(sellerId), {
            title: "Requirement Updated",
            body: message,
            data: {
              url: "/seller/dashboard"
            }
          });
        } catch {
          // Non-blocking push failures.
        }
      })
    );

    // Non-blocking email notifications as per admin-configured controls.
    setImmediate(() => {
      (async () => {
        const settingsDoc = await PlatformSettings.findOne()
          .select("emailNotifications")
          .lean();
        const emailSettings = settingsDoc?.emailNotifications || {};
        const events = emailSettings?.events || {};
        if (!emailSettings.enabled) return;

        const subject = `Buyer updated requirement: ${requirementName}`;
        const lines = [
          "A buyer updated a requirement.",
          `Requirement: ${requirementName}`,
          `Requirement ID: ${requirement._id}`,
          `Buyer ID: ${req.user?._id || "-"}`,
          `City: ${requirement.city || "-"}`,
          `Category: ${requirement.category || "-"}`,
          `Notified sellers: ${sellerIds.length}`
        ];
        const text = lines.join("\n");
        const tasks = [];

        if (events.requirementUpdatedToSellers !== false && sellerIds.length) {
          const sellers = await User.find({
            _id: { $in: sellerIds },
            email: { $type: "string", $ne: "" }
          })
            .select("email")
            .lean();
          sellers.forEach((seller) => {
            tasks.push(
              sendEmailToRecipient({
                to: seller.email,
                subject,
                text
              })
            );
          });
        }

        if (emailSettings.adminCopy !== false) {
          tasks.push(sendAdminEventEmail({ subject, text }));
        }

        if (tasks.length) {
          await Promise.allSettled(tasks);
        }
      })().catch(() => {});
    });
  }

  res.json(mapRequirementLifecycle(requirement));
});

router.post("/requirement/:id/status", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const nextStatus = normalizeRequirementStatus(req.body?.status);
  requirement.status = nextStatus;
  requirement.statusUpdatedAt = new Date();
  if (nextStatus !== "open" && requirement.reverseAuction?.active === true) {
    requirement.reverseAuction = {
      ...(requirement.reverseAuction || {}),
      active: false,
      updatedAt: new Date(),
      closedAt: requirement.reverseAuction?.closedAt || new Date()
    };
    requirement.reverseAuctionActive = false;
  }
  await requirement.save();

  return res.json({
    success: true,
    requirement: mapRequirementLifecycle(requirement)
  });
});

/**
 * Delete requirement
 */
router.delete("/requirement/:id", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }
  await Requirement.findByIdAndDelete(req.params.id);
  res.json({ message: "Requirement deleted" });
});

/**
 * Update buyer city
 */
router.post("/profile/city", auth, buyerOnly, async (req, res) => {
  const { city } = req.body || {};
  if (!city) {
    return res.status(400).json({ message: "City required" });
  }
  req.user.city = city;
  await req.user.save();
  res.json({ city });
});

/**
 * Get buyer profile
 */
router.get("/profile", auth, buyerOnly, async (req, res) => {
  await cleanupExpiredBuyerDocuments(req.user);
  const latestPlatformSettings = await PlatformSettings.findOne({})
    .sort({ updatedAt: -1 })
    .select("termsAndConditions updatedAt");
  const settings = getFreshBuyerSettings(req.user);
  const documents = (settings.documents || [])
    .map(normalizeBuyerDocument)
    .filter(Boolean);
  const mobileE164 = normalizeE164(req.user.mobile || "");
  let whatsappUpdatesOptedIn = false;
  if (mobileE164) {
    const buyerWhatsAppContact = await WhatsAppBuyerContact.findOne({
      mobileE164
    })
      .select("optInStatus unsubscribedAt active")
      .lean();
    whatsappUpdatesOptedIn = Boolean(
      buyerWhatsAppContact &&
        buyerWhatsAppContact.active !== false &&
        buyerWhatsAppContact.optInStatus === "opted_in" &&
        !buyerWhatsAppContact.unsubscribedAt
    );
  }

  res.json({
    name: req.user.name || req.user.googleProfile?.name || "",
    email: req.user.email || "",
    mobile: req.user.mobile || "",
    city: req.user.city,
    preferredCurrency: req.user.preferredCurrency || "INR",
    roles: req.user.roles || {},
    loginMethods: {
      otp: true,
      google: Boolean(req.user.googleProfile?.sub)
    },
    terms: {
      acceptedAt: req.user.termsAccepted?.at || null,
      versionDate: latestPlatformSettings?.updatedAt || null
    },
    whatsappUpdatesOptedIn,
    buyerSettings: {
      ...settings,
      documents
    }
  });
});

/**
 * Update buyer profile
 */
router.post("/profile", auth, buyerOnly, async (req, res) => {
  const {
    name,
    email,
    mobile,
    city,
    preferredCurrency,
    buyerSettings
  } = req.body || {};

  if (typeof name === "string") {
    req.user.name = name.trim();
  }
  if (typeof email === "string") {
    req.user.email = email.trim();
  }
  if (typeof mobile === "string") {
    req.user.mobile = mobile.trim();
  }
  if (city) {
    req.user.city = city;
  }
  if (preferredCurrency) {
    req.user.preferredCurrency = preferredCurrency;
  }
  if (buyerSettings && typeof buyerSettings === "object") {
    const next = getFreshBuyerSettings(req.user);
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "defaultCity")) {
      next.defaultCity = String(buyerSettings.defaultCity || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "defaultCategory")) {
      next.defaultCategory = String(buyerSettings.defaultCategory || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "defaultUnit")) {
      next.defaultUnit = String(buyerSettings.defaultUnit || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "hideProfileUntilApproved")) {
      next.hideProfileUntilApproved = toBoolean(
        buyerSettings.hideProfileUntilApproved,
        next.hideProfileUntilApproved
      );
    }
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "hideEmail")) {
      next.hideEmail = toBoolean(buyerSettings.hideEmail, next.hideEmail);
    }
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "hidePhone")) {
      next.hidePhone = toBoolean(buyerSettings.hidePhone, next.hidePhone);
    }
    if (
      Object.prototype.hasOwnProperty.call(
        buyerSettings,
        "chatOnlyAfterOfferAcceptance"
      )
    ) {
      next.chatOnlyAfterOfferAcceptance = toBoolean(
        buyerSettings.chatOnlyAfterOfferAcceptance,
        next.chatOnlyAfterOfferAcceptance
      );
    }
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "postAutoExpiryDays")) {
      next.postAutoExpiryDays = clamp(
        buyerSettings.postAutoExpiryDays,
        MIN_POST_AUTO_EXPIRY_DAYS,
        MAX_POST_AUTO_EXPIRY_DAYS,
        next.postAutoExpiryDays
      );
    }
    if (Object.prototype.hasOwnProperty.call(buyerSettings, "documentAutoDeleteDays")) {
      next.documentAutoDeleteDays = clamp(
        buyerSettings.documentAutoDeleteDays,
        MIN_DOC_AUTO_DELETE_DAYS,
        MAX_DOC_AUTO_DELETE_DAYS,
        next.documentAutoDeleteDays
      );
    }
    if (buyerSettings.notificationToggles && typeof buyerSettings.notificationToggles === "object") {
      const notif = buyerSettings.notificationToggles;
      next.notificationToggles = {
        ...next.notificationToggles,
        pushEnabled: toBoolean(
          notif.pushEnabled,
          next.notificationToggles.pushEnabled
        ),
        newOffer: toBoolean(notif.newOffer, next.notificationToggles.newOffer),
        chat: toBoolean(notif.chat, next.notificationToggles.chat),
        statusUpdate: toBoolean(
          notif.statusUpdate,
          next.notificationToggles.statusUpdate
        ),
        reminder: toBoolean(notif.reminder, next.notificationToggles.reminder)
      };
    }
    req.user.buyerSettings = next;
  }

  if (typeof email === "string" && email.trim()) {
    const existingUser = await User.findOne({ email: email.trim(), _id: { $ne: req.user._id } });
    if (existingUser) {
      const requirementsMerged = await Requirement.updateMany(
        { buyerId: req.user._id },
        { $set: { buyerId: existingUser._id } }
      );
      await TempRequirement.updateMany(
        { userId: req.user._id },
        { $set: { userId: existingUser._id } }
      );
      existingUser.mobile = req.user.mobile;
      if (existingUser.city && !existingUser.city.trim()) {
        existingUser.city = req.user.city;
      }
      if (!existingUser.roles?.buyer) {
        existingUser.roles = { ...existingUser.roles, buyer: true };
      }
      if (req.user.buyerSettings) {
        existingUser.buyerSettings = {
          ...existingUser.buyerSettings,
          ...req.user.buyerSettings
        };
      }
      await existingUser.save();
      await User.findByIdAndDelete(req.user._id);
      console.log(`[Account Merge] Merged WhatsApp user ${req.user._id} into Google user ${existingUser._id}, ${requirementsMerged.modifiedCount} requirements`);
      const token = jwt.sign(
        { id: existingUser._id, role: "buyer", tokenVersion: existingUser.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.json({
        merged: true,
        message: "Account merged successfully!",
        token,
        user: {
          _id: existingUser._id,
          email: existingUser.email,
          role: existingUser.role,
          roles: existingUser.roles,
          city: existingUser.city,
          preferredCurrency: existingUser.preferredCurrency || "INR",
          mobile: existingUser.mobile
        }
      });
    }
  }

  if (typeof mobile === "string" && mobile.trim()) {
    const existingMobileUser = await User.findOne({ mobile: mobile.trim(), _id: { $ne: req.user._id } });
    if (existingMobileUser) {
      const requirementsMerged = await Requirement.updateMany(
        { buyerId: req.user._id },
        { $set: { buyerId: existingMobileUser._id } }
      );
      await TempRequirement.updateMany(
        { userId: req.user._id },
        { $set: { userId: existingMobileUser._id } }
      );
      existingMobileUser.email = req.user.email;
      if (existingMobileUser.city && !existingMobileUser.city.trim()) {
        existingMobileUser.city = req.user.city;
      }
      if (!existingMobileUser.roles?.buyer) {
        existingMobileUser.roles = { ...existingMobileUser.roles, buyer: true };
      }
      if (req.user.buyerSettings) {
        existingMobileUser.buyerSettings = {
          ...existingMobileUser.buyerSettings,
          ...req.user.buyerSettings
        };
      }
      await existingMobileUser.save();
      await User.findByIdAndDelete(req.user._id);
      console.log(`[Account Merge] Merged Google user ${req.user._id} into WhatsApp user ${existingMobileUser._id}, ${requirementsMerged.modifiedCount} requirements`);
      const token = jwt.sign(
        { id: existingMobileUser._id, role: "buyer", tokenVersion: existingMobileUser.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.json({
        merged: true,
        message: "Account merged successfully!",
        token,
        user: {
          _id: existingMobileUser._id,
          email: existingMobileUser.email,
          role: existingMobileUser.role,
          roles: existingMobileUser.roles,
          city: existingMobileUser.city,
          preferredCurrency: existingMobileUser.preferredCurrency || "INR",
          mobile: existingMobileUser.mobile
        }
      });
    }
  }

  try {
    await req.user.save();
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(400).json({ message: "This email is already registered. Please use a different email." });
    }
    throw err;
  }

  const afterSettings = getFreshBuyerSettings(req.user);
  afterSettings.hideEmail = Boolean(afterSettings.hideProfileUntilApproved);
  afterSettings.hidePhone = Boolean(afterSettings.hideProfileUntilApproved);
  req.user.buyerSettings = afterSettings;
  await req.user.save();

  const requirementIds = await Requirement.find({ buyerId: req.user._id })
    .select("_id")
    .lean();
  const ids = requirementIds.map((item) => item._id);
  if (ids.length) {
    const allowContact =
      afterSettings.hideProfileUntilApproved === false &&
      afterSettings.chatOnlyAfterOfferAcceptance === false;
    await Offer.updateMany(
      { requirementId: { $in: ids }, "moderation.removed": { $ne: true } },
      { $set: { contactEnabledByBuyer: allowContact } }
    );
  }

  const documents = (afterSettings.documents || [])
    .map(normalizeBuyerDocument)
    .filter(Boolean);
  res.json({
    name: req.user.name || req.user.googleProfile?.name || "",
    email: req.user.email || "",
    mobile: req.user.mobile || "",
    city: req.user.city,
    preferredCurrency: req.user.preferredCurrency || "INR",
    roles: req.user.roles || {},
    loginMethods: {
      otp: true,
      google: Boolean(req.user.googleProfile?.sub)
    },
    terms: {
      acceptedAt: req.user.termsAccepted?.at || null
    },
    buyerSettings: {
      ...afterSettings,
      documents
    }
  });
});

/**
 * Password auth disabled (OTP-only login)
 */
router.post("/profile/password", auth, buyerOnly, async (req, res) => {
  return res.status(410).json({
    message: "Password login is disabled. Use email OTP login."
  });
});

/**
 * Upload buyer document for profile-level visibility controls
 */
router.post(
  "/documents/upload",
  auth,
  buyerOnly,
  buyerDocUpload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }
    const settings = getFreshBuyerSettings(req.user);
    const autoDeleteDays = clamp(
      req.body?.autoDeleteDays,
      MIN_DOC_AUTO_DELETE_DAYS,
      MAX_DOC_AUTO_DELETE_DAYS,
      settings.documentAutoDeleteDays
    );

    const doc = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: `/uploads/buyer-documents/${req.file.filename}`,
      size: req.file.size,
      mimetype: req.file.mimetype,
      requirementId: req.body?.requirementId || null,
      visibleToSellerId: req.body?.visibleToSellerId || null,
      autoDeleteDays,
      createdAt: new Date()
    };

    settings.documents = [...settings.documents, doc];
    req.user.buyerSettings = settings;
    await req.user.save();
    const savedDoc =
      req.user.buyerSettings?.documents?.[req.user.buyerSettings.documents.length - 1];
    res.json({ document: normalizeBuyerDocument(savedDoc) });
  }
);

/**
 * Open requirement attachment (auth-protected via /api path)
 */
router.get("/attachments/:filename", auth, async (req, res) => {
  const safeName = path.basename(String(req.params.filename || ""));
  if (!safeName) {
    return res.status(400).json({ message: "Invalid file name" });
  }

  const relativeUrl = `/uploads/requirements/${safeName}`;
  const escapedName = escapeRegex(safeName);
  const requirement = await Requirement.findOne({
    $or: [
      { attachments: relativeUrl },
      { attachments: safeName },
      { attachments: { $regex: `${escapedName}$`, $options: "i" } },
      { "attachments.url": relativeUrl },
      { "attachments.url": { $regex: `${escapedName}$`, $options: "i" } },
      { "attachments.path": relativeUrl },
      { "attachments.path": { $regex: `${escapedName}$`, $options: "i" } },
      { "attachments.filename": safeName },
      { "attachments.filename": { $regex: `${escapedName}$`, $options: "i" } }
    ],
    "moderation.removed": { $ne: true }
  }).select("_id buyerId attachments");

  if (!requirement) {
    return res.status(404).json({ message: "File not found" });
  }

  const requesterId = String(req.user?._id || "");
  const buyerId = String(requirement.buyerId || "");
  if (requesterId !== buyerId && !req.user?.roles?.seller && !req.user?.roles?.admin) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const requested = safeName.toLowerCase();
  const attachments = Array.isArray(requirement.attachments) ? requirement.attachments : [];
  let resolvedFilename = safeName;

  const matchedAttachment = attachments.find((attachment) => {
    const aliases = extractAttachmentAliases(attachment);
    return aliases.has(requested);
  });

  if (matchedAttachment) {
    const storedName = extractStoredRequirementFilename(matchedAttachment);
    if (storedName) {
      resolvedFilename = storedName;
    }
  }

  if (!matchedAttachment && attachments.length > 0) {
    const suffixMatch = attachments
      .map((attachment) => extractStoredRequirementFilename(attachment))
      .find((stored) => {
        const lower = String(stored || "").toLowerCase();
        return lower === requested || lower.endsWith(`_${requested}`);
      });
    if (suffixMatch) {
      resolvedFilename = suffixMatch;
    } else if (attachments.length === 1) {
      const single = extractStoredRequirementFilename(attachments[0]);
      if (single) {
        const singleDisplay = displayNameFromStoredFilename(single).toLowerCase();
        if (singleDisplay && singleDisplay === requested) {
          resolvedFilename = single;
        }
      }
    }
  }

  const diskFilename =
    resolveAttachmentFilenameOnDisk(uploadDir, {
      preferredFilename: resolvedFilename,
      requestedFilename: safeName,
      buyerId
    }) || path.basename(resolvedFilename);

  const filePath = path.join(uploadDir, diskFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  return res.sendFile(filePath);
});

/**
 * List buyer documents
 */
router.get("/documents", auth, buyerOnly, async (req, res) => {
  await cleanupExpiredBuyerDocuments(req.user);
  const settings = getFreshBuyerSettings(req.user);
  const documents = (settings.documents || [])
    .map(normalizeBuyerDocument)
    .filter(Boolean);
  res.json({ documents });
});

/**
 * Update buyer document visibility and retention
 */
router.patch("/documents/:documentId", auth, buyerOnly, async (req, res) => {
  const settings = getFreshBuyerSettings(req.user);
  const docs = Array.isArray(settings.documents) ? settings.documents : [];
  const target = docs.find(
    (doc) => String(doc._id) === String(req.params.documentId)
  );
  if (!target) {
    return res.status(404).json({ message: "Document not found" });
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "visibleToSellerId")) {
    target.visibleToSellerId = req.body.visibleToSellerId || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "requirementId")) {
    target.requirementId = req.body.requirementId || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "autoDeleteDays")) {
    target.autoDeleteDays = clamp(
      req.body.autoDeleteDays,
      MIN_DOC_AUTO_DELETE_DAYS,
      MAX_DOC_AUTO_DELETE_DAYS,
      settings.documentAutoDeleteDays
    );
  }

  req.user.buyerSettings = settings;
  await req.user.save();
  const updated = req.user.buyerSettings.documents.find(
    (doc) => String(doc._id) === String(req.params.documentId)
  );
  res.json({ document: normalizeBuyerDocument(updated) });
});

/**
 * Delete a buyer document
 */
router.delete("/documents/:documentId", auth, buyerOnly, async (req, res) => {
  const settings = getFreshBuyerSettings(req.user);
  const docs = Array.isArray(settings.documents) ? settings.documents : [];
  const index = docs.findIndex(
    (doc) => String(doc._id) === String(req.params.documentId)
  );
  if (index < 0) {
    return res.status(404).json({ message: "Document not found" });
  }

  const [removed] = docs.splice(index, 1);
  if (removed?.filename) {
    removeFileIfExists(path.join(buyerDocUploadDir, removed.filename));
  }

  settings.documents = docs;
  req.user.buyerSettings = settings;
  await req.user.save();
  res.json({ success: true });
});

/**
 * Export buyer-owned data snapshot
 */
router.get("/data-export", auth, buyerOnly, async (req, res) => {
  await cleanupExpiredBuyerDocuments(req.user);
  const [requirements, offers, chats] = await Promise.all([
    Requirement.find({ buyerId: req.user._id })
      .sort({ createdAt: -1 })
      .lean(),
    Offer.find({
      requirementId: {
        $in: await Requirement.find({ buyerId: req.user._id }).distinct("_id")
      }
    })
      .sort({ createdAt: -1 })
      .lean(),
    ChatMessage.find({
      $or: [{ fromUserId: req.user._id }, { toUserId: req.user._id }]
    })
      .sort({ createdAt: -1 })
      .lean()
  ]);

  const settings = getFreshBuyerSettings(req.user);
  res.json({
    exportedAt: new Date().toISOString(),
    profile: {
      id: String(req.user._id),
      name: req.user.name || req.user.googleProfile?.name || "",
      email: req.user.email || "",
      mobile: req.user.mobile || "",
      city: req.user.city || "",
      preferredCurrency: req.user.preferredCurrency || "INR",
      roles: req.user.roles || {},
      termsAcceptedAt: req.user.termsAccepted?.at || null
    },
    settings: {
      ...settings,
      documents: (settings.documents || [])
        .map(normalizeBuyerDocument)
        .filter(Boolean)
    },
    requirements,
    offers,
    chats
  });
});

/**
 * Delete one buyer-owned item: post/chat/document
 */
router.delete("/items/:type/:id", auth, buyerOnly, async (req, res) => {
  const { type, id } = req.params;
  if (!type || !id) {
    return res.status(400).json({ message: "Missing item details" });
  }

  if (type === "post") {
    const requirement = await Requirement.findById(id);
    if (!requirement) {
      return res.status(404).json({ message: "Post not found" });
    }
    if (String(requirement.buyerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    await Requirement.findByIdAndDelete(id);
    await Offer.deleteMany({ requirementId: id });
    await ChatMessage.deleteMany({ requirementId: id });
    return res.json({ success: true });
  }

  if (type === "chat") {
    const message = await ChatMessage.findById(id);
    if (!message) {
      return res.status(404).json({ message: "Chat message not found" });
    }
    const owner =
      String(message.fromUserId) === String(req.user._id) ||
      String(message.toUserId) === String(req.user._id);
    if (!owner) {
      return res.status(403).json({ message: "Not allowed" });
    }
    await ChatMessage.findByIdAndDelete(id);
    return res.json({ success: true });
  }

  if (type === "document") {
    const settings = getFreshBuyerSettings(req.user);
    const docs = Array.isArray(settings.documents) ? settings.documents : [];
    const idx = docs.findIndex((doc) => String(doc._id) === String(id));
    if (idx < 0) {
      return res.status(404).json({ message: "Document not found" });
    }
    const [removed] = docs.splice(idx, 1);
    if (removed?.filename) {
      removeFileIfExists(path.join(buyerDocUploadDir, removed.filename));
    }
    settings.documents = docs;
    req.user.buyerSettings = settings;
    await req.user.save();
    return res.json({ success: true });
  }

  return res.status(400).json({ message: "Unsupported item type" });
});

/**
 * Permanently delete buyer account and buyer-owned data
 */
router.delete("/account", auth, buyerOnly, async (req, res) => {
  const userId = req.user._id;
  const requirements = await Requirement.find({ buyerId: userId })
    .select("_id")
    .lean();
  const reqIds = requirements.map((item) => item._id);

  const settings = getFreshBuyerSettings(req.user);
  (settings.documents || []).forEach((doc) => {
    if (doc?.filename) {
      removeFileIfExists(path.join(buyerDocUploadDir, doc.filename));
    }
  });

  await Promise.all([
    Requirement.deleteMany({ buyerId: userId }),
    Offer.deleteMany({ requirementId: { $in: reqIds } }),
    ChatMessage.deleteMany({
      $or: [{ fromUserId: userId }, { toUserId: userId }]
    }),
    Notification.deleteMany({
      $or: [{ userId }, { fromUserId: userId }]
    }),
    User.findByIdAndDelete(userId)
  ]);

  res.json({ success: true });
});

/**
 * Get seller profile (buyer view)
 */
router.get("/seller/:sellerId", auth, buyerOnly, async (req, res) => {
  const seller = await User.findById(req.params.sellerId).select(
    "email mobile city roles sellerProfile"
  );
  if (!seller || !seller.roles?.seller) {
    return res.status(404).json({ message: "Seller not found" });
  }

  res.json({
    _id: seller._id,
    email: seller.email,
    mobile: seller.mobile || "",
    city: seller.city,
    sellerProfile: seller.sellerProfile || {}
  });
});

/**
 * Start reverse auction
 */
router.post("/requirement/:id/reverse-auction/start", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }
  if (getEffectiveRequirementStatus(requirement) !== "open") {
    return res.status(400).json({
      message: "Reverse auction is available only for open requirements"
    });
  }
  const offers = await Offer.find({
    requirementId: requirement._id,
    "moderation.removed": { $ne: true }
  }).select("sellerId price");
  if (offers.length < 3) {
    return res.status(400).json({
      message: "Reverse auction can be invoked only after 3 or more offers"
    });
  }

  const lowestPrice =
    typeof req.body.lowestPrice === "number"
      ? req.body.lowestPrice
      : offers.reduce((min, offer) => {
          if (typeof offer.price !== "number") return min;
          if (min === null || offer.price < min) return offer.price;
          return min;
        }, null);
  const targetPrice =
    typeof req.body.targetPrice === "number"
      ? req.body.targetPrice
      : requirement.reverseAuction?.targetPrice ?? null;

  requirement.reverseAuction = {
    ...(requirement.reverseAuction || {}),
    active: true,
    lowestPrice: typeof lowestPrice === "number" ? lowestPrice : null,
    targetPrice: typeof targetPrice === "number" ? targetPrice : null,
    startedAt: requirement.reverseAuction?.startedAt || new Date(),
    updatedAt: new Date(),
    closedAt: null
  };
  requirement.reverseAuctionActive = true;
  requirement.currentLowestPrice =
    typeof lowestPrice === "number" ? lowestPrice : null;

  await requirement.save();

  notifyReverseAuction(
    requirement.product || requirement.productName,
    requirement.city,
    lowestPrice,
    req.user.mobile || "",
    requirement._id
  );

  const requirementName = requirement.product || requirement.productName || "Product";
  const currencyCode = String(req.user.preferredCurrency || "INR").toUpperCase();
  const currencySymbolMap = {
    INR: "Rs",
    USD: "$",
    EUR: "EUR",
    GBP: "GBP",
    AED: "AED"
  };
  const currencySymbol = currencySymbolMap[currencyCode] || currencyCode;
  const displayLowest =
    typeof requirement.currentLowestPrice === "number"
      ? requirement.currentLowestPrice
      : typeof requirement.reverseAuction?.lowestPrice === "number"
      ? requirement.reverseAuction.lowestPrice
      : null;
  const message =
    typeof displayLowest === "number"
      ? `Reverse Auction enabled by buyer. Current lowest offer is ${currencySymbol} ${displayLowest}. You may edit your offer if you can go lower.`
      : "Reverse Auction enabled by buyer. You may edit your offer if you can go lower.";

  const sellerIds = Array.from(
    new Set(
      offers
        .map((offer) => (offer.sellerId ? String(offer.sellerId) : null))
        .filter(Boolean)
    )
  );

  const notifications = await Promise.all(
    sellerIds.map((sellerId) =>
      Notification.create({
        userId: sellerId,
        message,
        type: "reverse_auction_invoked",
        requirementId: requirement._id,
        fromUserId: req.user._id,
        data: buildNotificationData("reverse_auction_invoked", {
          action: "open_offer_edit",
          requirementId: String(requirement._id),
          entityType: "requirement",
          entityId: String(requirement._id),
          productName: requirementName,
          lowestPrice: displayLowest,
          currencyCode,
          currencySymbol,
          url: "/seller/dashboard"
        })
      })
    )
  );

  const io = req.app.get("io");
  if (io) {
    notifications.forEach((notification, idx) => {
      const sellerId = sellerIds[idx];
      if (!sellerId) return;
      io.to(String(sellerId)).emit(
        "notification",
        serializeNotification(notification, { fallbackUrl: "/seller/dashboard" })
      );
    });
  }

  const sellers = await User.find({ _id: { $in: sellerIds } })
    .select("_id sellerSettings")
    .lean();
  const sellerSettingsById = new Map(
    sellers.map((seller) => [String(seller._id), seller])
  );

  await Promise.all(
    sellerIds.map(async (sellerId) => {
      try {
        const sellerDoc = sellerSettingsById.get(String(sellerId));
        if (!shouldNotifySellerEvent(sellerDoc, "auction")) {
          return;
        }
        await sendPush(String(sellerId), {
          title: `Reverse Auction: ${requirementName}`,
          body: message,
          data: { url: "/seller/dashboard" }
        });
      } catch {
        // Ignore push delivery failures per seller and continue.
      }
    })
  );

  // Non-blocking email notifications as per admin-configured controls.
  setImmediate(() => {
    (async () => {
      const settingsDoc = await PlatformSettings.findOne()
        .select("emailNotifications")
        .lean();
      const emailSettings = settingsDoc?.emailNotifications || {};
      const events = emailSettings?.events || {};
      if (!emailSettings.enabled) return;

      const subject = `Reverse auction initiated: ${requirementName}`;
      const lines = [
        "A reverse auction was initiated by a buyer.",
        `Requirement: ${requirementName}`,
        `Requirement ID: ${requirement._id}`,
        `Buyer ID: ${req.user?._id || "-"}`,
        `Lowest price: ${displayLowest !== null ? `${currencySymbol} ${displayLowest}` : "-"}`,
        `City: ${requirement.city || "-"}`,
        `Category: ${requirement.category || "-"}`,
        `Seller recipients: ${sellerIds.length}`
      ];
      const text = lines.join("\n");
      const tasks = [];

      if (events.reverseAuctionToSellers !== false && sellerIds.length) {
        const sellers = await User.find({
          _id: { $in: sellerIds },
          email: { $type: "string", $ne: "" }
        })
          .select("email")
          .lean();
        sellers.forEach((seller) => {
          tasks.push(
            sendEmailToRecipient({
              to: seller.email,
              subject,
              text
            })
          );
        });
      }

      if (emailSettings.adminCopy !== false) {
        tasks.push(sendAdminEventEmail({ subject, text }));
      }

      if (tasks.length) {
        await Promise.allSettled(tasks);
      }
    })().catch(() => {});
  });

  res.json(requirement);
});

/**
 * Stop reverse auction
 */
router.post("/requirement/:id/reverse-auction/stop", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  requirement.reverseAuction = {
    ...(requirement.reverseAuction || {}),
    active: false,
    updatedAt: new Date()
  };
  requirement.reverseAuctionActive = false;
  await requirement.save();
  res.json(requirement);
});

/**
 * Get offers for a requirement (buyer view)
 */
router.get("/requirements/:id/offers", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const offers = await Offer.find({
    requirementId: req.params.id,
    "moderation.removed": { $ne: true }
  })
    .populate("sellerId", "sellerProfile city email")
    .sort({ price: 1 });

  const requirementData = requirement.toObject();
  requirementData.product =
    requirementData.product || requirementData.productName;
  requirementData.status = getEffectiveRequirementStatus(requirement);
  requirementData.expiresAt = requirement.expiresAt || null;
  requirementData.statusUpdatedAt = requirement.statusUpdatedAt || null;
  requirementData.reverseAuctionActive =
    requirementData.reverseAuctionActive ||
    requirementData.reverseAuction?.active ||
    false;
  requirementData.currentLowestPrice =
    typeof requirementData.currentLowestPrice === "number"
      ? requirementData.currentLowestPrice
      : requirementData.reverseAuction?.lowestPrice ?? null;

  const offersData = offers.map((offer) => {
    const sellerProfile = offer.sellerId?.sellerProfile || {};
    const sellerFirm =
      sellerProfile.firmName ||
      sellerProfile.businessName ||
      offer.sellerId?.email ||
      "Seller";
    const sellerDetails = {
      firmName: sellerFirm,
      businessName: sellerProfile.businessName || sellerFirm,
      ownerName: sellerProfile.ownerName || "Not provided",
      managerName: sellerProfile.managerName || "Not provided",
      email: offer.sellerId?.email || "Not provided",
      city: offer.sellerId?.city || "Not provided"
    };
    return {
      _id: offer._id,
      price: offer.price,
      message: offer.message,
      deliveryTime: offer.deliveryTime || "",
      paymentTerms: offer.paymentTerms || "",
      attachments: Array.isArray(offer.attachments) ? offer.attachments : [],
      viewedByBuyer: offer.viewedByBuyer || false,
      contactEnabledByBuyer: offer.contactEnabledByBuyer === true,
      outcomeStatus: normalizeOfferOutcomeStatus(offer.outcomeStatus),
      outcomeUpdatedAt: offer.outcomeUpdatedAt || null,
      sellerId: offer.sellerId?._id,
      sellerFirm,
      sellerCity: sellerDetails.city,
      sellerDetails
    };
  });

  res.json({ requirement: requirementData, offers: offersData });
});

/**
 * Claim a temp requirement and convert to real requirement
 */
router.post("/requirements/:id/claim", auth, buyerOnly, async (req, res) => {
  const requirementId = String(req.params.id || "").trim();
  const userId = String(req.user._id || "");
  
  const tempReq = await TempRequirement.findById(requirementId);
  if (tempReq) {
    await TempRequirement.findByIdAndUpdate(requirementId, {
      $set: { buyerId: userId, status: "claimed" }
    });
  }
  
  const existing = await Requirement.findOne({ tempRequirementId: requirementId });
  if (existing) {
    if (String(existing.buyerId) !== userId) {
      await Requirement.findByIdAndUpdate(existing._id, {
        $set: { buyerId: userId }
      });
    }
    return res.json({ ok: true, requirementId: existing._id });
  }
  
  if (tempReq) {
    const newReq = await Requirement.create({
      buyerId: userId,
      tempRequirementId: tempReq._id,
      productName: tempReq.productName,
      product: tempReq.product,
      quantity: tempReq.quantity,
      type: tempReq.type,
      city: tempReq.city,
      category: tempReq.category,
      details: tempReq.details,
      status: "open"
    });
    await TempRequirement.findByIdAndUpdate(requirementId, {
      $set: { status: "claimed", requirementId: newReq._id }
    });
    return res.json({ ok: true, requirementId: newReq._id });
  }
  
  return res.json({ ok: true, requirementId });
});

/**
 * Update buyer offer outcome state
 */
router.post("/offers/:offerId/outcome", auth, buyerOnly, async (req, res) => {
  const offerId = String(req.params.offerId || "").trim();
  const outcomeStatus = normalizeOfferOutcomeStatus(req.body?.status);
  const offer = await Offer.findById(offerId);
  if (!offer || offer.moderation?.removed === true) {
    return res.status(404).json({ message: "Offer not found" });
  }

  const requirement = await Requirement.findById(offer.requirementId);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const now = new Date();
  const requirementName =
    requirement.product || requirement.productName || "your requirement";
  let previouslySelectedOffers = [];
  if (outcomeStatus === "selected") {
    previouslySelectedOffers = await Offer.find({
      requirementId: offer.requirementId,
      _id: { $ne: offer._id },
      outcomeStatus: "selected",
      "moderation.removed": { $ne: true }
    }).select("_id sellerId");
    await Offer.updateMany(
      {
        requirementId: offer.requirementId,
        _id: { $ne: offer._id },
        outcomeStatus: "selected",
        "moderation.removed": { $ne: true }
      },
      {
        $set: {
          outcomeStatus: "shortlisted",
          outcomeUpdatedAt: now,
          outcomeUpdatedByBuyerId: req.user._id
        }
      }
    );
  }

  offer.outcomeStatus = outcomeStatus;
  offer.outcomeUpdatedAt = now;
  offer.outcomeUpdatedByBuyerId = req.user._id;
  if (outcomeStatus === "selected") {
    offer.contactEnabledByBuyer = true;
  }
  await offer.save();

  const notificationsToSend = [];
  if (offer.sellerId) {
    const messageByOutcome = {
      shortlisted: `Buyer shortlisted your offer for ${requirementName}`,
      rejected: `Buyer rejected your offer for ${requirementName}`,
      selected: `Buyer selected your offer for ${requirementName}`
    };
    notificationsToSend.push({
      userId: offer.sellerId,
      message:
        messageByOutcome[outcomeStatus] ||
        `Buyer updated your offer outcome for ${requirementName}`,
      state: outcomeStatus,
      offerId: offer._id
    });
  }

  previouslySelectedOffers.forEach((item) => {
    if (!item?.sellerId) return;
    notificationsToSend.push({
      userId: item.sellerId,
      message: `Buyer moved your offer back to shortlisted for ${requirementName}`,
      state: "shortlisted",
      offerId: item._id
    });
  });

  if (notificationsToSend.length) {
    const io = req.app.get("io");
    const createdNotifications = await Promise.all(
      notificationsToSend.map((item) =>
        Notification.create({
          userId: item.userId,
          fromUserId: req.user._id,
          requirementId: requirement._id,
          type: "offer_outcome_updated",
          message: item.message,
          data: buildNotificationData("offer_outcome_updated", {
            state: item.state,
            requirementId: String(requirement._id),
            entityType: "requirement",
            entityId: String(requirement._id),
            offerId: String(item.offerId || offer._id),
            productName: requirementName,
            url: "/seller/dashboard"
          })
        })
      )
    );

    if (io) {
      createdNotifications.forEach((notification, index) => {
        const targetUserId = notificationsToSend[index]?.userId;
        if (!targetUserId) return;
        io.to(String(targetUserId)).emit(
          "notification",
          serializeNotification(notification, { fallbackUrl: "/seller/dashboard" })
        );
      });
    }
  }

  return res.json({
    success: true,
    offer: {
      _id: offer._id,
      outcomeStatus: normalizeOfferOutcomeStatus(offer.outcomeStatus),
      outcomeUpdatedAt: offer.outcomeUpdatedAt || null,
      contactEnabledByBuyer: offer.contactEnabledByBuyer === true
    }
  });
});

/**
 * Mark offer viewed by buyer
 */
router.post("/offers/:offerId/view", auth, buyerOnly, async (req, res) => {
  const offer = await Offer.findByIdAndUpdate(
    req.params.offerId,
    { viewedByBuyer: true },
    { new: true }
  );
  if (!offer) {
    return res.status(404).json({ message: "Offer not found" });
  }
  res.json({ success: true });
});

/**
 * Enable contact for a requirement (buyer controlled)
 */
router.post("/requirements/:id/enable-contact", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const offerId = String(req.body?.offerId || "").trim();
  let filter = {
    requirementId: requirement._id,
    "moderation.removed": { $ne: true }
  };
  if (offerId) {
    filter = { ...filter, _id: offerId };
    const targetOffer = await Offer.findOne(filter).select("_id");
    if (!targetOffer) {
      return res.status(404).json({ message: "Offer not found" });
    }
  }

  const result = await Offer.updateMany(
    filter,
    {
      $set: { contactEnabledByBuyer: true }
    }
  );

  res.json({
    success: true,
    updated: result.modifiedCount || 0
  });
});

/**
 * Disable contact for a requirement (buyer controlled)
 */
router.post("/requirements/:id/disable-contact", auth, buyerOnly, async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const offerId = String(req.body?.offerId || "").trim();
  let filter = {
    requirementId: requirement._id,
    "moderation.removed": { $ne: true }
  };
  if (offerId) {
    filter = { ...filter, _id: offerId };
    const targetOffer = await Offer.findOne(filter).select("_id");
    if (!targetOffer) {
      return res.status(404).json({ message: "Offer not found" });
    }
  }

  const result = await Offer.updateMany(
    filter,
    {
      $set: { contactEnabledByBuyer: false }
    }
  );

  res.json({
    success: true,
    updated: result.modifiedCount || 0
  });
});

/**
 * Submit review (buyer → seller)
 */
router.post("/review", auth, buyerOnly, async (req, res) => {
  const Review = require("../models/Review");

  const Requirement = require("../models/Requirement");
  const Offer = require("../models/Offer");

  const { requirementId, sellerId, rating, comment } = req.body || {};
  if (!requirementId || !sellerId || !rating) {
    return res.status(400).json({ message: "Missing data" });
  }

  const requirement = await Requirement.findById(requirementId);
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (String(requirement.buyerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const offer = await Offer.findOne({
    requirementId,
    sellerId
  });
  if (!offer) {
    return res.status(400).json({ message: "Seller has no offer" });
  }

  try {
    const review = await Review.create({
      reviewerId: req.user._id,
      reviewedUserId: sellerId,
      requirementId,
      reviewerRole: "buyer",
      targetRole: "seller",
      rating,
      comment
    });
    res.json(review);
  } catch {
    res.status(400).json({ message: "Review already submitted" });
  }
});

module.exports = router;
