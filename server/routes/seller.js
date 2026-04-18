const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const Offer = require("../models/Offer");
const Requirement = require("../models/Requirement");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ChatMessage = require("../models/ChatMessage");
const PlatformSettings = require("../models/PlatformSettings");
const PendingOfferDraft = require("../models/PendingOfferDraft");
const OptedInSeller = require("../models/OptedInSeller");
const WhatsAppOTP = require("../models/WhatsAppOTP");
const auth = require("../middleware/auth");
const sellerOnly = require("../middleware/sellerOnly");
const sendPush = require("../utils/sendPush");
const { sendAdminEventEmail, sendEmailToRecipient } = require("../utils/sendEmail");
const { getModerationRules, checkTextForFlags } = require("../utils/moderation");
const {
  buildNotificationData,
  serializeNotification
} = require("../utils/notifications");
const { normalizeRequirementAttachmentsForResponse } = require("../utils/attachments");
const { normalizeE164, sendViaGupshupTemplate, sendViaWapiTemplate, sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { notifyNewOffer, notifyReverseAuction } = require("../services/adminNotifications");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");

const offerUploadDir = path.join(__dirname, "../uploads/offers");
if (!fs.existsSync(offerUploadDir)) {
  fs.mkdirSync(offerUploadDir, { recursive: true });
}

const allowedOfferExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx"
]);
function normalizeAndDedupeCategories(categories) {
  const normalized = Array.isArray(categories)
    ? categories
        .map((c) => String(c || "").toLowerCase().trim())
        .filter(Boolean)
    : [];
  return Array.from(new Set(normalized));
}

function safeFilename(originalname) {
  const ext = path.extname(String(originalname || "")).toLowerCase();
  const base = path
    .basename(String(originalname || ""), ext)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 60);
  return `${base || "file"}${ext}`;
}

async function sendWhatsAppTemplate({ to, templateKey, parameters = [], buttonUrl, requirementId, buyerId }) {
  if (!to) return;
  
  const templateConfig = await WhatsAppTemplateRegistry.findOne({
    key: templateKey,
    isActive: true
  }).lean();
  
  if (!templateConfig) {
    console.warn(`[WhatsApp] Template not found or inactive: ${templateKey}`);
    return;
  }
  
  const provider = String(process.env.WHATSAPP_PROVIDER || "mock").trim().toLowerCase();
  
  try {
    let result;
    if (provider === "gupshup") {
      result = await sendViaGupshupTemplate({
        to,
        templateId: String(templateConfig.templateId || "").trim(),
        templateName: templateConfig.templateName,
        languageCode: String(templateConfig.language || "en").trim(),
        parameters,
        buttonUrl
      });
    } else if (provider === "wapi") {
      result = await sendViaWapiTemplate({
        to,
        templateName: templateConfig.templateName,
        languageCode: String(templateConfig.language || "en").trim(),
        parameters,
        buttonUrl
      });
    } else {
      result = { providerMessageId: `mock_${Date.now()}` };
    }
    
    console.log(`[WhatsApp] Sent ${templateKey} to ${to}, result:`, result?.providerMessageId || "ok");
    return result;
  } catch (err) {
    console.error(`[WhatsApp] Failed to send ${templateKey} to ${to}:`, err?.message);
  }
}

const offerAttachmentStorage = multer.diskStorage({
  destination: offerUploadDir,
  filename: (req, file, cb) => {
    const finalName = `${req.user._id}_${Date.now()}_${safeFilename(
      file.originalname
    )}`;
    cb(null, finalName);
  }
});

const uploadOfferAttachment = multer({
  storage: offerAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(String(file.originalname || "")).toLowerCase();
    if (!allowedOfferExtensions.has(ext)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  }
});

function normalizeOfferAttachments(value) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => {
      if (typeof item === "string") {
        const raw = item.trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/offers/")) return raw;
        const clean = path.basename(raw);
        return clean ? `/uploads/offers/${clean}` : "";
      }
      if (item && typeof item === "object") {
        const raw = String(item.url || item.path || item.filename || "").trim();
        if (!raw) return "";
        if (raw.startsWith("/uploads/offers/")) return raw;
        const clean = path.basename(raw);
        return clean ? `/uploads/offers/${clean}` : "";
      }
      return "";
    })
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function shouldNotifyBuyerEvent(userDoc, eventKey) {
  if (!userDoc?.roles?.buyer) return true;
  const toggles = userDoc?.buyerSettings?.notificationToggles || {};
  if (eventKey === "newOffer") {
    return toggles.newOffer !== false;
  }
  if (eventKey === "chat") {
    return toggles.chat !== false;
  }
  if (eventKey === "statusUpdate") {
    return toggles.statusUpdate !== false;
  }
  if (eventKey === "reminder") {
    return toggles.reminder !== false;
  }
  return true;
}

function shouldSendBuyerPush(userDoc) {
  if (!userDoc?.roles?.buyer) return true;
  const toggles = userDoc?.buyerSettings?.notificationToggles || {};
  return toggles.pushEnabled !== false;
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

function getEffectiveOfferInviteMode(
  requirementDoc,
  acceptedBuyerCityRequirementIds = new Set()
) {
  const inviteMode = normalizeOfferInvitedFrom(requirementDoc?.offerInvitedFrom);
  if (inviteMode !== "anywhere") return "city";
  const requirementId = String(requirementDoc?._id || "");
  if (!requirementId) return inviteMode;
  return acceptedBuyerCityRequirementIds.has(requirementId)
    ? "city"
    : "anywhere";
}
async function getAcceptedBuyerCityRequirementIds(requirements = []) {
  const requirementList = Array.isArray(requirements) ? requirements : [];
  const requirementIds = requirementList
    .map((requirement) => requirement?._id)
    .filter(Boolean);
  if (!requirementIds.length) {
    return new Set();
  }

  const requirementCityById = new Map(
    requirementList.map((requirement) => [
      String(requirement?._id || ""),
      String(requirement?.city || "")
    ])
  );

  const acceptedOffers = await Offer.find({
    requirementId: { $in: requirementIds },
    contactEnabledByBuyer: true,
    "moderation.removed": { $ne: true }
  })
    .populate("sellerId", "city")
    .select("requirementId sellerId");

  const matchedRequirementIds = new Set();
  acceptedOffers.forEach((offer) => {
    const requirementId = String(offer?.requirementId || "");
    const requirementCity = requirementCityById.get(requirementId) || "";
    const sellerCity = String(offer?.sellerId?.city || "").trim();
    if (requirementId && cityMatches(requirementCity, sellerCity)) {
      matchedRequirementIds.add(requirementId);
    }
  });

  return matchedRequirementIds;
}
function shouldRequirementMatchRequestedCity(
  requirementDoc,
  requestedCity,
  acceptedBuyerCityRequirementIds = new Set()
) {
  const requestedCityValue = String(requestedCity || "").trim();
  if (!requestedCityValue) return true;
  const effectiveInviteMode = getEffectiveOfferInviteMode(
    requirementDoc,
    acceptedBuyerCityRequirementIds
  );
  if (effectiveInviteMode === "anywhere") {
    return true;
  }
  return cityMatches(requirementDoc?.city, requestedCityValue);
}
async function isRequirementLockedToBuyerCity(requirementDoc) {
  if (!requirementDoc?._id) return false;
  const acceptedBuyerCityRequirementIds =
    await getAcceptedBuyerCityRequirementIds([requirementDoc]);
  return acceptedBuyerCityRequirementIds.has(String(requirementDoc._id));
}
function mapRequirementForSeller(
  requirementDoc,
  offerMap,
  sellerCityRaw = "",
  acceptedBuyerCityRequirementIds = new Set()
) {
  if (!requirementDoc) return null;
  const data = normalizeRequirementAttachmentsForResponse(requirementDoc);
  const reqId = String(requirementDoc._id);
  const sellerOffer = offerMap.get(reqId) || null;
  const inviteMode = normalizeOfferInvitedFrom(requirementDoc.offerInvitedFrom);
  const effectiveInviteMode = getEffectiveOfferInviteMode(
    requirementDoc,
    acceptedBuyerCityRequirementIds
  );
  const blockedByCity =
    effectiveInviteMode === "city" &&
    !cityMatches(requirementDoc.city, sellerCityRaw);
  data.product = data.product || data.productName;
  data.reverseAuctionActive = data.reverseAuction?.active === true;
  data.currentLowestPrice =
    typeof data.currentLowestPrice === "number"
      ? data.currentLowestPrice
      : data.reverseAuction?.lowestPrice ?? null;
  data.myOffer = Boolean(sellerOffer);
  data.contactEnabledByBuyer = sellerOffer?.contactEnabledByBuyer === true;
  data.myOfferOutcomeStatus =
    normalizeText(sellerOffer?.outcomeStatus) || "pending";
  data.myOfferOutcomeUpdatedAt = sellerOffer?.outcomeUpdatedAt || null;
  data.status = getEffectiveRequirementStatus(requirementDoc);
  data.expiresAt = requirementDoc?.expiresAt || null;
  data.statusUpdatedAt = requirementDoc?.statusUpdatedAt || null;
  data.offerInvitedFrom = inviteMode;
  data.offerInvitedFromEffective = effectiveInviteMode;
  data.offerLockedAfterCitySelection =
    inviteMode === "anywhere" && effectiveInviteMode === "city";
  data.offerBlockedByCity = blockedByCity;
  data.offerAllowedForSeller = !blockedByCity;
  data.buyerId = data.buyerId;
  return data;
}
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}
function normalizeCityKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function cityMatches(left, right) {
  const a = normalizeCityKey(left);
  const b = normalizeCityKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
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
function getEffectiveRequirementStatus(requirementDoc) {
  const explicitStatus = normalizeRequirementStatus(requirementDoc?.status);
  if (explicitStatus !== "open") return explicitStatus;
  const expiresAt = requirementDoc?.expiresAt ? new Date(requirementDoc.expiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return "open";
}
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Seller onboarding (first-time registration)
 */
router.post("/onboard", auth, async (req, res) => {
  const {
    mobile,
    businessName,
    registrationDetails,
    businessAddress,
    ownerName,
    firmName,
    managerName,
    categories,
    website,
    taxId,
    city,
  } = req.body || {};
  const mobileValue = String(mobile || "").trim();
  const cityValue = String(city || "").trim();
  const firmNameValue = String(firmName || "").trim();
  const managerNameValue = String(managerName || "").trim();

if (
    !mobileValue ||
    !cityValue ||
    !firmNameValue ||
    !managerNameValue
  ) {
    return res
      .status(400)
      .json({ message: "Missing required fields" });
  }

  const normalizedCategories = normalizeAndDedupeCategories(categories);
  if (!normalizedCategories.length) {
    return res.status(400).json({ message: "Missing required fields" });
  }

const update = {
    mobile: mobileValue,
    "sellerProfile.businessName": String(businessName || "").trim(),
    "sellerProfile.registrationDetails": String(registrationDetails || "").trim(),
    "sellerProfile.businessAddress": String(businessAddress || "").trim(),
    "sellerProfile.ownerName": String(ownerName || "").trim(),
    "sellerProfile.firmName": firmNameValue,
    "sellerProfile.managerName": managerNameValue,
    "sellerProfile.categories": normalizedCategories,
    "sellerProfile.website": String(website || "").trim(),
    "sellerProfile.taxId": String(taxId || "").trim(),
    city: cityValue
  };

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      ...update,
      "roles.seller": true
    },
    { new: true }
  );

  res.json({
    sellerProfile: user?.sellerProfile || {},
    city: user?.city,
    roles: user?.roles,
    termsAccepted: user?.termsAccepted
  });
});

/**
 * Update seller profile
 */
router.post("/profile", auth, sellerOnly, async (req, res) => {
  const {
    mobile,
    businessName,
    registrationDetails,
    businessAddress,
    ownerName,
    firmName,
    managerName,
    categories,
    website,
    taxId,
    city,
    preferredCurrency,
    sellerSettings
  } = req.body || {};

  const normalizedCategories = normalizeAndDedupeCategories(categories);

  const update = {
    ...(typeof mobile === "string"
      ? { mobile: String(mobile).trim() }
      : {}),
    ...(businessName ? { "sellerProfile.businessName": businessName } : {}),
    ...(registrationDetails
      ? { "sellerProfile.registrationDetails": registrationDetails }
      : {}),
    ...(businessAddress
      ? { "sellerProfile.businessAddress": businessAddress }
      : {}),
    ...(ownerName ? { "sellerProfile.ownerName": ownerName } : {}),
    ...(firmName ? { "sellerProfile.firmName": firmName } : {}),
    ...(managerName ? { "sellerProfile.managerName": managerName } : {}),
    ...(Array.isArray(categories)
      ? { "sellerProfile.categories": normalizedCategories }
      : {}),
    ...(website ? { "sellerProfile.website": website } : {}),
    ...(taxId ? { "sellerProfile.taxId": taxId } : {})
  };

  if (city) {
    update.city = city;
  }
  if (preferredCurrency) {
    update.preferredCurrency = preferredCurrency;
  }
  if (sellerSettings && typeof sellerSettings === "object") {
    update.sellerSettings = {
      notificationsLeads: sellerSettings.notificationsLeads !== false,
      notificationsAuction: sellerSettings.notificationsAuction !== false,
      notificationsOffers: sellerSettings.notificationsOffers !== false
    };
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    update,
    { new: true }
  );

  res.json({
    sellerProfile: user?.sellerProfile || {},
    city: user?.city,
    preferredCurrency: user?.preferredCurrency || "INR",
    sellerSettings: user?.sellerSettings || {}
  });
});

/**
 * Get seller profile
 */
router.get("/profile", auth, sellerOnly, async (req, res) => {
  const user = await User.findById(req.user._id);
  const latestPlatformSettings = await PlatformSettings.findOne({})
    .sort({ updatedAt: -1 })
    .select("updatedAt");
  res.json({
    sellerProfile: user?.sellerProfile || {},
    email: user?.email || "",
    mobile: user?.mobile || "",
    city: user?.city,
    preferredCurrency: user?.preferredCurrency || "INR",
    terms: {
      acceptedAt: user?.termsAccepted?.at || null,
      versionDate: latestPlatformSettings?.updatedAt || null
    },
    loginMethods: {
      otp: true,
      google: Boolean(user?.googleProfile?.sub)
    },
    sellerSettings: user?.sellerSettings || {}
  });
});

/**
 * Password auth disabled (OTP-only login)
 */
router.post("/profile/password", auth, sellerOnly, async (req, res) => {
  return res.status(410).json({
    message: "Password login is disabled. Use email OTP login."
  });
});

/**
 * Permanently delete seller account and related data
 */
router.delete("/account", auth, sellerOnly, async (req, res) => {
  const userId = req.user._id;
  const requirements = await Requirement.find({ buyerId: userId })
    .select("_id")
    .lean();
  const reqIds = requirements.map((item) => item._id);

  await Promise.all([
    Requirement.deleteMany({ buyerId: userId }),
    Offer.deleteMany({
      $or: [{ sellerId: userId }, { requirementId: { $in: reqIds } }]
    }),
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
 * Upload seller offer attachment
 */
router.post(
  "/offer/attachments",
  auth,
  sellerOnly,
  uploadOfferAttachment.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "Attachment file required" });
    }
    return res.json({
      files: [
        {
          filename: req.file.filename,
          originalName: req.file.originalname,
          url: `/uploads/offers/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      ]
    });
  }
);

/**
 * Get requirement details for public offer (deep link)
 */
router.get("/offer/requirement/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const requirement = await Requirement.findById(id)
      .select("product productName city category quantity type details offerInvitedFrom status buyerId")
      .lean();

    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }

    const effectiveStatus = requirement.status === "open" ? "open" : "closed";
    if (effectiveStatus !== "open") {
      return res.status(410).json({ message: "This requirement is no longer accepting offers" });
    }

    return res.json({
      requirement: {
        _id: requirement._id,
        product: requirement.product || requirement.productName,
        city: requirement.city,
        category: requirement.category,
        quantity: requirement.quantity,
        unit: requirement.type,
        details: requirement.details,
        status: effectiveStatus
      }
    });
  } catch (err) {
    console.error("[Public Offer] Error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load requirement" });
  }
});

/**
 * Submit offer on requirement (public - for opted-in sellers)
 */
router.post("/offer/public", async (req, res) => {
  try {
    const {
      requirementId,
      price,
      message,
      deliveryTime,
      paymentTerms,
      mobile,
      email,
      firmName,
      sellerName,
      sellerCity
    } = req.body;

    if (!requirementId) {
      return res.status(400).json({ message: "requirementId is required" });
    }

    if (!mobile) {
      return res.status(400).json({ message: "mobile is required for public offers" });
    }

    const requirement = await Requirement.findById(requirementId);
    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }

    if (requirement.status !== "open") {
      return res.status(400).json({
        message: "This requirement is no longer open for offers"
      });
    }

    const inviteMode = normalizeOfferInvitedFrom(requirement.offerInvitedFrom);
    const effectiveInviteMode =
      inviteMode === "anywhere" && (await isRequirementLockedToBuyerCity(requirement))
        ? "city"
        : inviteMode;
    
    const sellerCityInput = String(sellerCity || "").trim();
    const requirementCity = requirement?.city;
    console.log("[Public Offer] City check:", { inviteMode, effectiveInviteMode, sellerCityInput, requirementCity, cityMatches: cityMatches(sellerCityInput, requirementCity) });
    if (effectiveInviteMode === "city" && !cityMatches(sellerCityInput, requirementCity)) {
      return res.status(403).json({
        message: inviteMode === "anywhere"
          ? "Buyer has already selected a same-city offer, so this post is now limited to the buyer city"
          : "Offers for this post are invited only from the buyer city"
      });
    }

    const mobileStr = String(mobile || "").trim();
    const mobileE164 = mobileStr.startsWith("+") ? mobileStr : `+91${mobileStr}`;

    let sellerUser = null;
    const existingUser = await User.findOne({ mobile: mobileE164 }).select("_id roles").lean();
    if (existingUser && existingUser.roles?.seller) {
      sellerUser = existingUser;
    }

    const moderationRules = await getModerationRules();
    const flaggedReason = checkTextForFlags(message || "", moderationRules);

    if (sellerUser) {
      return res.status(403).json({
        message: "You are already registered as a seller. Please login to submit your offer.",
        requiresLogin: true,
        redirectTo: "/seller/login"
      });
    }

    const pendingOffer = await PendingOfferDraft.findOneAndUpdate(
      {
        mobileE164,
        requirementId: requirement._id,
        status: "pending"
      },
      {
        $set: {
          mobileE164,
          requirementId: requirement._id,
          source: { type: "whatsapp_deep_link" },
          price: price || 0,
          deliveryDays: deliveryTime,
          note: message,
          rawMessage: message,
          sellerEmail: email,
          sellerFirmName: firmName,
          sellerName: sellerName,
          sellerCity: sellerCityInput
        }
      },
      { upsert: true, new: true }
    );

    setImmediate(() => {
      (async () => {
        console.log("[Public Offer] Sending WhatsApp notifications", { mobileE164, requirementId: requirement._id });
        
        const sellerNameStr = String(sellerName || "Seller").trim();
        const productName = String(requirement.product || requirement.productName || "your requirement").trim();
        const priceStr = String(price || "0").trim();
        const requirementIdStr = String(requirement._id || "").trim();
        
        if (mobileE164) {
          const appBase = String(process.env.PUBLIC_APP_URL || "https://hokoapp.in").trim();
          const sellerLoginLink = `${appBase}/seller/login?whatsapp_token=${mobileE164}&ref=${requirementIdStr}`;
          const sellerParams = [productName];
          console.log("[Public Offer] Sending to seller:", { to: mobileE164, templateKey: "seller_quote_received_ack", params: sellerParams, buttonUrl: sellerLoginLink });
          await sendWhatsAppTemplate({
            to: mobileE164,
            templateKey: "seller_quote_received_ack",
            parameters: sellerParams,
            buttonUrl: sellerLoginLink,
            requirementId: requirementIdStr
          });
        } else {
          console.log("[Public Offer] No seller mobile, skipping seller notification");
        }
        
        const buyer = await User.findById(requirement.buyerId).select("mobile name").lean();
        const buyerMobileE164 = normalizeE164(buyer?.mobile);
        if (buyerMobileE164) {
          const buyerName = String(buyer?.name || "Buyer").trim();
          const appBase = String(process.env.PUBLIC_APP_URL || "https://hokoapp.in").trim();
          const buyerOfferLink = `${appBase}/buyer/requirement/${requirementIdStr}/offers`;
          const buyerParams = [buyerName, productName, priceStr, buyerOfferLink];
          console.log("[Public Offer] Sending to buyer:", { to: buyerMobileE164, templateKey: "_buyer_first_offer_alert", params: buyerParams });
          await sendWhatsAppTemplate({
            to: buyerMobileE164,
            templateKey: "_buyer_first_offer_alert",
            parameters: buyerParams,
            requirementId: requirementIdStr
          });
        } else {
          console.log("[Public Offer] No buyer mobile found");
        }
      })().catch((err) => console.error("[WhatsApp] Offer notification error:", err));
    });

    return res.json({
      success: true,
      message: "Offer submitted successfully! You will be notified when the buyer responds.",
      pendingOffer: true,
      requirementId: requirement._id
    });
  } catch (err) {
    console.error("[Public Offer] Error:", err?.message || err);
    return res.status(500).json({ message: "Failed to submit offer" });
  }
});

/**
 * Submit offer on requirement
 */
router.post("/offer", auth, sellerOnly, async (req, res) => {
  try {
    const {
      requirementId,
      price,
      message,
      deliveryTime,
      paymentTerms,
      attachments
    } = req.body;
    const requirement = await Requirement.findById(requirementId);
    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }
    if (getEffectiveRequirementStatus(requirement) !== "open") {
      return res.status(400).json({
        message: "This requirement is no longer open for offers"
      });
    }
    const inviteMode = normalizeOfferInvitedFrom(requirement.offerInvitedFrom);
    const effectiveInviteMode =
      inviteMode === "anywhere" && (await isRequirementLockedToBuyerCity(requirement))
        ? "city"
        : inviteMode;
    if (effectiveInviteMode === "city") {
      const sellerCity = req.user?.city;
      const requirementCity = requirement?.city;
      if (!cityMatches(sellerCity, requirementCity)) {
        return res.status(403).json({
          message:
            inviteMode === "anywhere"
              ? "Buyer has already selected a same-city offer, so this post is now limited to the buyer city"
              : "Offers for this post are invited only from the buyer city"
        });
      }
    }
    const buyer = await User.findById(requirement.buyerId).select("buyerSettings roles email");
    const autoEnableChat =
      buyer?.buyerSettings?.chatOnlyAfterOfferAcceptance === false &&
      buyer?.buyerSettings?.hideProfileUntilApproved === false;

    const moderationRules = await getModerationRules();
    const flaggedReason = checkTextForFlags(message || "", moderationRules);

    const offer = await Offer.findOneAndUpdate(
      { requirementId, sellerId: req.user._id },
      {
        price,
        message,
        deliveryTime: String(deliveryTime || "").trim(),
        paymentTerms: String(paymentTerms || "").trim(),
        attachments: normalizeOfferAttachments(attachments),
        "moderation.removed": false,
        "moderation.removedAt": null,
        "moderation.removedBy": null,
        "moderation.reason": "",
        "moderation.flagged": Boolean(flaggedReason),
        "moderation.flaggedAt": flaggedReason ? new Date() : null,
        "moderation.flaggedReason": flaggedReason || "",
        ...(autoEnableChat ? { contactEnabledByBuyer: true } : {})
      },
      { upsert: true, new: true }
    );

    if (requirement) {
      const auctionWasActive = requirement.reverseAuction?.active === true;
      const nextLowest =
        typeof requirement.currentLowestPrice === "number"
          ? Math.min(requirement.currentLowestPrice, price)
          : price;
      requirement.reverseAuction = {
        ...(requirement.reverseAuction || {}),
        active: Boolean(auctionWasActive),
        lowestPrice:
          typeof requirement.reverseAuction?.lowestPrice === "number"
            ? Math.min(requirement.reverseAuction.lowestPrice, price)
            : price,
        startedAt:
          auctionWasActive
            ? requirement.reverseAuction?.startedAt || new Date()
            : requirement.reverseAuction?.startedAt || null,
        updatedAt: new Date()
      };
      requirement.reverseAuctionActive = Boolean(auctionWasActive);
      requirement.currentLowestPrice = nextLowest;

      await requirement.save();

      notifyNewOffer(
        price,
        requirement.productName || requirement.product,
        req.user?.businessName || req.user?.name || "Seller",
        req.user?.mobile || "",
        requirement.city,
        requirement._id
      );

      const sellerMobileE164 = normalizeE164(req.user?.mobile);
      if (sellerMobileE164) {
        await PendingOfferDraft.updateMany(
          {
            mobileE164: sellerMobileE164,
            requirementId: requirement._id,
            status: "pending"
          },
          {
            $set: {
              status: "submitted"
            }
          }
        );
      }

      setImmediate(() => {
        (async () => {
          const sellerName = String(req.user?.name || req.user?.businessName || "Seller").trim();
          const productName = String(requirement.product || requirement.productName || "your requirement").trim();
          const priceStr = String(price || "").trim();
          const requirementIdStr = String(requirement._id || "").trim();
          
          if (sellerMobileE164) {
            const sellerParams = [sellerName, productName, priceStr];
            await sendWhatsAppTemplate({
              to: sellerMobileE164,
              templateKey: "seller_quote_received_ack_v1",
              parameters: sellerParams,
              requirementId: requirementIdStr
            });
          }
          
          const buyerMobileE164 = normalizeE164(buyer?.mobile);
          if (buyerMobileE164) {
            const buyerName = String(buyer?.name || "Buyer").trim();
            const buyerParams = [buyerName, productName, priceStr, requirementIdStr];
            await sendWhatsAppTemplate({
              to: buyerMobileE164,
              templateKey: "_buyer_first_offer_alert_v2",
              parameters: buyerParams,
              requirementId: requirementIdStr
            });
          }
        })().catch((err) => console.error("[WhatsApp] Offer notification error:", err));
      });

      const io = req.app.get("io");
      if (shouldNotifyBuyerEvent(buyer, "newOffer")) {
        const notif = await Notification.create({
          userId: requirement.buyerId,
          message: `New offer received for ${requirement.product || requirement.productName}`,
          type: "new_offer",
          requirementId: requirement._id,
          fromUserId: req.user._id,
          data: buildNotificationData("new_offer", {
            requirementId: String(requirement._id),
            entityType: "requirement",
            entityId: String(requirement._id),
            offerId: String(offer._id),
            sellerId: String(req.user._id),
            url: `/buyer/requirement/${encodeURIComponent(String(requirement._id))}/offers`
          })
        });
        if (io) {
          io.to(String(requirement.buyerId)).emit(
            "notification",
            serializeNotification(notif, {
              fallbackUrl: `/buyer/requirement/${encodeURIComponent(String(requirement._id))}/offers`
            })
          );
        }
      }

      if (io && auctionWasActive) {
        io.to(String(requirement.buyerId)).emit(
          "auction_price_update",
          {
            requirementId,
            offerId: offer._id,
            price
          }
        );
      }

      if (shouldSendBuyerPush(buyer)) {
        await sendPush(requirement.buyerId.toString(), {
          title: "New Offer Received",
          body: `A seller submitted an offer of Rs ${price}`,
          data: { url: "/buyer/dashboard" }
        });
      }

      // Non-blocking admin email side-channel for operations visibility.
      setImmediate(() => {
        (async () => {
          const settingsDoc = await PlatformSettings.findOne()
            .select("emailNotifications")
            .lean();
          const emailSettings = settingsDoc?.emailNotifications || {};
          const events = emailSettings?.events || {};
          if (!emailSettings.enabled) return;

          const requirementName = requirement.product || requirement.productName || "Requirement";
          const subject = `New offer submitted on ${requirementName}`;
          const lines = [
            "A new offer was submitted.",
            `Requirement: ${requirementName}`,
            `Requirement ID: ${requirement._id}`,
            `Buyer ID: ${requirement.buyerId}`,
            `Seller ID: ${req.user?._id || "-"}`,
            `Seller email: ${req.user?.email || "-"}`,
            `Price: Rs ${price}`,
            `Delivery time: ${String(deliveryTime || "").trim() || "-"}`,
            `Payment terms: ${String(paymentTerms || "").trim() || "-"}`,
            `City: ${requirement.city || "-"}`,
            `Category: ${requirement.category || "-"}`
          ];
          const text = lines.join("\n");
          const tasks = [];

          if (events.newOfferToBuyer !== false && buyer?.email) {
            tasks.push(
              sendEmailToRecipient({
                to: buyer.email,
                subject: `New offer received for ${requirementName}`,
                text
              })
            );
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
    res.json(offer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to submit offer" });
  }
});

/**
 * Get pending WhatsApp-derived offer draft for the logged-in seller and requirement
 */
router.get("/offer-draft/:requirementId", auth, sellerOnly, async (req, res) => {
  const requirementId = String(req.params.requirementId || "").trim();
  const sellerMobileE164 = normalizeE164(req.user?.mobile);
  if (!requirementId || !sellerMobileE164) {
    return res.json({ draft: null });
  }

  const draft = await PendingOfferDraft.findOne({
    mobileE164: sellerMobileE164,
    requirementId,
    status: "pending"
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (!draft) {
    return res.json({ draft: null });
  }

  return res.json({
    draft: {
      id: String(draft._id || ""),
      price: draft.price,
      deliveryDays: draft.deliveryDays,
      note: String(draft.note || draft.rawMessage || "").trim(),
      updatedAt: draft.updatedAt || null
    }
  });
});

/**
 * Get seller's own offer for a requirement
 */
router.get("/offer/:requirementId", auth, sellerOnly, async (req, res) => {
  const offer = await Offer.findOne({
    requirementId: req.params.requirementId,
    sellerId: req.user._id,
    "moderation.removed": { $ne: true }
  });
  if (!offer) {
    return res.status(404).json({ message: "Offer not found" });
  }
  res.json(offer);
});

/**
 * Open seller-offer attachment (auth-protected)
 */
router.get("/offer-attachments/:filename", auth, async (req, res) => {
  const safeName = path.basename(String(req.params.filename || ""));
  const relativeUrl = `/uploads/offers/${safeName}`;
  const escapedName = safeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const offer = await Offer.findOne({
    $or: [
      { attachments: relativeUrl },
      { attachments: safeName },
      { attachments: { $regex: `${escapedName}$`, $options: "i" } }
    ],
    "moderation.removed": { $ne: true }
  }).select("_id sellerId requirementId attachments");

  if (!offer) {
    return res.status(404).json({ message: "File not found" });
  }

  const requirement = await Requirement.findById(offer.requirementId).select(
    "_id buyerId"
  );
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }

  const requesterId = String(req.user?._id || "");
  const sellerId = String(offer.sellerId || "");
  const buyerId = String(requirement.buyerId || "");
  const isAllowed =
    requesterId === sellerId ||
    requesterId === buyerId ||
    Boolean(req.user?.roles?.admin);
  if (!isAllowed) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const matched = (Array.isArray(offer.attachments) ? offer.attachments : []).find(
    (item) => {
      const lower = String(item || "").toLowerCase();
      return lower === relativeUrl.toLowerCase() || lower.endsWith(`/${safeName.toLowerCase()}`);
    }
  );
  const fileNameOnDisk = path.basename(String(matched || safeName));
  const filePath = path.join(offerUploadDir, fileNameOnDisk);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  return res.sendFile(filePath);
});

/**
 * Delete seller's own offer for a requirement
 */
router.delete("/offer/:requirementId", auth, sellerOnly, async (req, res) => {
  const offer = await Offer.findOneAndDelete({
    requirementId: req.params.requirementId,
    sellerId: req.user._id
  });
  if (!offer) {
    return res.status(404).json({ message: "Offer not found" });
  }
  res.json({ success: true });
});

/**
 * Get a specific requirement for deep-link open in seller dashboard
 */
router.get("/requirement/:requirementId", auth, sellerOnly, async (req, res) => {
  const requirement = await Requirement.findOne({
    _id: req.params.requirementId,
    "moderation.removed": { $ne: true }
  });
  if (!requirement) {
    return res.status(404).json({ message: "Requirement not found" });
  }
  if (getEffectiveRequirementStatus(requirement) !== "open") {
    return res.status(403).json({
      message: "This requirement is no longer open for sellers"
    });
  }
  const acceptedBuyerCityRequirementIds =
    await getAcceptedBuyerCityRequirementIds([requirement]);
  const inviteMode = getEffectiveOfferInviteMode(
    requirement,
    acceptedBuyerCityRequirementIds
  );
  if (inviteMode === "city") {
    const sellerCity = req.user?.city;
    const requirementCity = requirement?.city;
    if (!cityMatches(sellerCity, requirementCity)) {
      return res.status(403).json({
        message: "This requirement is available only to sellers in buyer city"
      });
    }
  }
  const sellerOffer = await Offer.findOne({
    requirementId: requirement._id,
    sellerId: req.user._id
  }).select("requirementId contactEnabledByBuyer outcomeStatus outcomeUpdatedAt");
  const offerMap = new Map(
    sellerOffer
      ? [[String(sellerOffer.requirementId), sellerOffer]]
      : []
  );

  return res.json(
    mapRequirementForSeller(
      requirement,
      offerMap,
      req.user?.city,
      acceptedBuyerCityRequirementIds
    )
  );
});

/**
 * Seller dashboard (requirements by category + city)
 */
router.get("/dashboard", auth, sellerOnly, async (req, res) => {
  await User.findById(req.user._id).select("_id");
  const hasCityParam = Object.prototype.hasOwnProperty.call(
    req.query || {},
    "city"
  );
  const requestedCity = String(req.query?.city || "").trim();
  const requestedCityNormalized = normalizeText(requestedCity);
  const requestedCategory = String(req.query?.category || "").trim();
  const requestedCategoryNormalized = normalizeText(requestedCategory);
  const isAllCities =
    hasCityParam &&
    (!requestedCityNormalized || requestedCityNormalized === "all");
  const isAllCategories =
    !requestedCategoryNormalized || requestedCategoryNormalized === "all";

const requirementQuery = {
    "moderation.removed": { $ne: true }
  };

  if (!isAllCategories) {
    requirementQuery.category = new RegExp(
      `^\\s*${escapeRegex(requestedCategory)}\\s*$`,
      "i"
    );
  }

  const requirementsRaw = await Requirement.find(requirementQuery).sort({
    createdAt: -1
  });
  const acceptedBuyerCityRequirementIds =
    await getAcceptedBuyerCityRequirementIds(requirementsRaw);
const requirements = requirementsRaw.filter((requirement) => {
    if (getEffectiveRequirementStatus(requirement) !== "open") {
      return false;
    }
    if (
      !isAllCities &&
      requestedCityNormalized &&
      !shouldRequirementMatchRequestedCity(
        requirement,
        requestedCity,
        acceptedBuyerCityRequirementIds
      )
    ) {
      return false;
    }
    if (
      !isAllCategories &&
      normalizeText(requirement?.category) !== requestedCategoryNormalized
    ) {
      return false;
    }
    return true;
  });

  const requirementIds = requirements.map((r) => r._id);
  const offers = await Offer.find({
    sellerId: req.user._id,
    requirementId: { $in: requirementIds }
  }).select("requirementId contactEnabledByBuyer outcomeStatus outcomeUpdatedAt");
  const offerMap = new Map(
    offers.map((offer) => [String(offer.requirementId), offer])
  );

  const mapped = requirements.map((requirementDoc) =>
    mapRequirementForSeller(
      requirementDoc,
      offerMap,
      req.user?.city,
      acceptedBuyerCityRequirementIds
    )
  );

  res.json(mapped);
});

function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Check if user exists and return token without OTP
router.post("/otp/check-user", async (req, res) => {
  const { mobile } = req.body;
  
  if (!mobile) {
    return res.status(400).json({ message: "Mobile number is required" });
  }
  
  const mobileE164 = normalizeE164(mobile);
  const user = await User.findOne({ mobile: mobileE164 });
  
  if (!user) {
    return res.json({ exists: false, user: null });
  }
  
  // Check if user has seller role
  if (!user.roles?.seller) {
    // Even if no seller role, return token for buyer role
    const token = jwt.sign(
      { id: user._id, role: "buyer", tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    return res.json({
      exists: true,
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        roles: user.roles,
        city: user.city,
        sellerProfile: user.sellerProfile,
        preferredCurrency: user.preferredCurrency || "INR",
        mobile: user.mobile
      },
      token
    });
  }
  
  // Generate token for existing seller
  const token = jwt.sign(
    { id: user._id, role: "seller", tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  
  res.json({
    exists: true,
    user: {
      _id: user._id,
      email: user.email,
      role: user.role,
      roles: user.roles,
      city: user.city,
      sellerProfile: user.sellerProfile,
      preferredCurrency: user.preferredCurrency || "INR",
      mobile: user.mobile
    },
    token
  });
});

router.post("/otp/request", async (req, res) => {
  const { mobile } = req.body;
  
  if (!mobile) {
    return res.status(400).json({ message: "Mobile number is required" });
  }
  
  const mobileE164 = normalizeE164(mobile);
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  
  await WhatsAppOTP.create({
    mobileE164,
    otp,
    status: "pending",
    expiresAt,
    attempts: 0,
    source: "seller_deeplink"
  });
  
  try {
    await sendWhatsAppMessage({
      to: mobileE164,
      body: `Your HOKO Seller verification code is: *${otp}*\n\nThis code expires in 10 minutes.`
    });
  } catch (err) {
    console.error(`[OTP Request] WhatsApp error for ${mobileE164}:`, err.message);
  }
  
  res.json({ success: true, message: "OTP sent to WhatsApp" });
});

router.post("/otp/verify", async (req, res) => {
  const { mobile, otp } = req.body;
  
  if (!mobile || !otp) {
    return res.status(400).json({ success: false, message: "Mobile and OTP are required" });
  }
  
  const mobileE164 = normalizeE164(mobile);
  const otpTrimmed = String(otp).trim();
  
  const otpRecord = await WhatsAppOTP.findOne({
    mobileE164,
    status: "pending"
  }).sort({ createdAt: -1 });
  
  if (!otpRecord || String(otpRecord.otp).trim() !== otpTrimmed) {
    return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
  }
  
  if (new Date() > otpRecord.expiresAt) {
    await WhatsAppOTP.findByIdAndUpdate(otpRecord._id, { $set: { status: "expired" } });
    return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
  }
  
  // Increment attempts
  otpRecord.attempts += 1;
  otpRecord.lastAttemptAt = new Date();
  if (otpRecord.attempts >= 5) {
    otpRecord.status = "expired";
    await otpRecord.save();
    return res.status(400).json({ success: false, message: "Too many attempts. Please request a new OTP." });
  }
  await otpRecord.save();
  
  let user = await User.findOne({ mobile: mobileE164 });
  if (!user) {
    user = await User.create({
      mobile: mobileE164,
      role: "buyer",
      roles: { buyer: true },
      city: "",
      name: "Seller",
      email: "",
      tokenVersion: 0
    });
  }
  
  if (!user.roles?.seller) {
    user.roles = { ...user.roles, seller: true };
    await user.save();
  }
  
  await WhatsAppOTP.findByIdAndUpdate(otpRecord._id, { 
    $set: { status: "verified", verifiedAt: new Date() } 
  });
  
  const token = jwt.sign(
    { id: user._id, role: "seller", tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  
  res.json({ 
    success: true, 
    message: "Verification successful!",
    token,
    user: {
      _id: user._id,
      email: user.email,
      role: user.role,
      roles: user.roles,
      city: user.city,
      sellerProfile: user.sellerProfile,
      preferredCurrency: user.preferredCurrency || "INR",
      mobile: user.mobile
    }
  });
});

module.exports = router;
