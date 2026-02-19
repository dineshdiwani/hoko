const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ChatMessage = require("../models/ChatMessage");
const PlatformSettings = require("../models/PlatformSettings");
const { getModerationRules, checkTextForFlags } = require("../utils/moderation");
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
const { triggerWhatsAppCampaignForRequirement } = require("../services/whatsAppCampaign");
const auth = require("../middleware/auth");
const buyerOnly = require("../middleware/buyerOnly");

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
  res.json(normalizeRequirementAttachmentsForResponse(requirement));

  setImmediate(async () => {
    try {
      await triggerWhatsAppCampaignForRequirement(requirement);
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
    const data = normalizeRequirementAttachmentsForResponse(post);
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
  res.json(normalizeRequirementAttachmentsForResponse(requirement));
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
  if (Object.prototype.hasOwnProperty.call(nextPayload, "attachments")) {
    nextPayload.attachments = normalizeRequirementAttachmentValues(
      nextPayload.attachments
    );
  }
  Object.assign(requirement, nextPayload);
  await requirement.save();

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
          data: {
            action: "open_offer_edit",
            requirementId: String(requirement._id),
            productName: requirementName
          }
        })
      )
    );

    const io = req.app.get("io");
    if (io) {
      notifications.forEach((notification, idx) => {
        const sellerId = sellerIds[idx];
        if (!sellerId) return;
        io.to(String(sellerId)).emit("notification", notification);
      });
    }

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

  res.json(normalizeRequirementAttachmentsForResponse(requirement));
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

  res.json({
    name: req.user.name || req.user.googleProfile?.name || "",
    email: req.user.email || "",
    mobile: req.user.mobile || "",
    city: req.user.city,
    preferredCurrency: req.user.preferredCurrency || "INR",
    roles: req.user.roles || {},
    loginMethods: {
      password: Boolean(req.user.passwordHash),
      google: Boolean(req.user.googleProfile?.sub)
    },
    terms: {
      acceptedAt: req.user.termsAccepted?.at || null,
      versionDate: latestPlatformSettings?.updatedAt || null
    },
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
    mobile,
    city,
    preferredCurrency,
    buyerSettings
  } = req.body || {};

  if (typeof name === "string") {
    req.user.name = name.trim();
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

  await req.user.save();

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
      password: Boolean(req.user.passwordHash),
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
 * Change buyer password
 */
router.post("/profile/password", auth, buyerOnly, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Current password and new password are required" });
  }
  if (String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }
  if (!req.user.passwordHash) {
    return res.status(400).json({
      message: "Password login is not enabled for this account"
    });
  }

  const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  await req.user.save();
  res.json({ success: true });
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
    "email city roles sellerProfile"
  );
  if (!seller || !seller.roles?.seller) {
    return res.status(404).json({ message: "Seller not found" });
  }

  res.json({
    _id: seller._id,
    email: seller.email,
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
        data: {
          action: "open_offer_edit",
          requirementId: String(requirement._id),
          productName: requirementName,
          lowestPrice: displayLowest,
          currencyCode,
          currencySymbol
        }
      })
    )
  );

  const io = req.app.get("io");
  if (io) {
    notifications.forEach((notification, idx) => {
      const sellerId = sellerIds[idx];
      if (!sellerId) return;
      io.to(String(sellerId)).emit("notification", notification);
    });
  }

  await Promise.all(
    sellerIds.map(async (sellerId) => {
      try {
        await sendPush(String(sellerId), {
          title: `Reverse Auction: ${requirementName}`,
          body: message
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
      viewedByBuyer: offer.viewedByBuyer || false,
      contactEnabledByBuyer: offer.contactEnabledByBuyer === true,
      sellerId: offer.sellerId?._id,
      sellerFirm,
      sellerCity: sellerDetails.city,
      sellerDetails
    };
  });

  res.json({ requirement: requirementData, offers: offersData });
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

  const result = await Offer.updateMany(
    {
      requirementId: requirement._id,
      "moderation.removed": { $ne: true }
    },
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

  const result = await Offer.updateMany(
    {
      requirementId: requirement._id,
      "moderation.removed": { $ne: true }
    },
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
