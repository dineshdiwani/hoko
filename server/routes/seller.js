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
const { claimNotificationGuard } = require("../utils/notificationGuard");
const ChatMessage = require("../models/ChatMessage");
const PlatformSettings = require("../models/PlatformSettings");
const PendingOfferDraft = require("../models/PendingOfferDraft");
const OptedInSeller = require("../models/OptedInSeller");
const auth = require("../middleware/auth");
const sellerOnly = require("../middleware/sellerOnly");
const { offerLimiter } = require("../middleware/rateLimit");
const sendPush = require("../utils/sendPush");
const { sendAdminEventEmail, sendEmailToRecipient } = require("../utils/sendEmail");
const { getModerationRules, checkTextForFlags } = require("../utils/moderation");
const {
  buildNotificationData,
  serializeNotification
} = require("../utils/notifications");
const { normalizeRequirementAttachmentsForResponse } = require("../utils/attachments");
const { normalizeE164, sendViaGupshupTemplate, sendWhatsAppMessage } = require("../utils/sendWhatsApp");
const { normalizeOfferInvitedFrom, getEffectiveRequirementStatus } = require("../utils/sharedUtils");
const { isCompleteSellerProfile } = require("../utils/sellerProfile");
const { notifyNewOffer, notifyReverseAuction } = require("../services/adminNotifications");
const { cleanupUserUploadFiles } = require("../utils/userDeletion");
const { setOtp, verifyOtp: verifyOtpCode } = require("../utils/otpStore");
const { sendOtpEmail } = require("../utils/sendEmail");
const { sendOtpSms, sendEventSms } = require("../utils/sendSms");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");
const { recordAppEvent } = require("../utils/appEvents");
const {
  claimActionGuard,
  attachActionReference,
  releaseActionGuard
} = require("../utils/actionGuard");

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
    if (templateKey.includes("offer") && parameters.length >= 3) {
      const appBase = String(process.env.PUBLIC_APP_URL || "https://hokoapp.in").trim();
      const fallbackMessage = [
        `🔔 New offer received!`,
        "",
        `Product: ${parameters[1] || "Your requirement"}`,
        `Price: Rs ${parameters[2] || "N/A"}`,
        "",
        `View all offers:`,
        `${appBase}/buyer/requirement/${requirementId || ""}/offers`
      ].join("\n");
      const { sendWhatsAppMessage } = require("../utils/sendWhatsApp");
      await sendWhatsAppMessage({ to, body: fallbackMessage }).catch(() => {});
    }
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
      } else {
        result = { providerMessageId: `mock_${Date.now()}` };
      }
    
    console.log(`[WhatsApp] Sent ${templateKey} to ${to}, result:`, result?.providerMessageId || "ok");
    return result;
  } catch (err) {
    console.error(`[WhatsApp] Failed to send ${templateKey} to ${to}:`, err?.message);
  }
}

async function sendSellerOnboardingAck({ mobile, email, businessName, city, whatsappConsent }) {
  const sellerName = String(businessName || "Seller").trim();
  const targetMobile = String(mobile || "").trim();
  const targetEmail = String(email || "").trim().toLowerCase();
  const appBase = resolvePublicAppUrl();
  const dashboardLink = `${appBase}/seller/dashboard?from=wa`;
  const sellerProfileSummary = [
    city ? `City: ${city}.` : "",
    "Your seller profile is ready.",
    "Open your seller dashboard."
  ].filter(Boolean).join(" ");
  const body = [
    `Welcome to Hoko, ${sellerName}!`,
    "",
    "Your seller profile is ready.",
    city ? `City: ${city}` : "",
    "",
    `Open your seller dashboard: ${dashboardLink}`
  ].filter(Boolean).join("\n");

  const tasks = [];
  if (whatsappConsent && targetMobile) {
    tasks.push(
      sendWhatsAppMessage({
        to: targetMobile,
        body
      })
    );
    tasks.push(
      sendEventSms({
        mobile: targetMobile,
        variables: [
          `Welcome to Hoko, ${sellerName}!`,
          sellerProfileSummary,
          dashboardLink
        ]
      })
    );
  }
  if (targetEmail) {
    tasks.push(
      sendEmailToRecipient({
        to: targetEmail,
        subject: "Your Hoko seller profile is ready",
        text: body
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function sendSellerOfferAckSideChannels({
  mobile,
  email,
  productName,
  price,
  requirementId
}) {
  const targetMobile = String(mobile || "").trim();
  const targetEmail = String(email || "").trim().toLowerCase();
  const appBase = resolvePublicAppUrl();
  const dashboardLink = `${appBase}/seller/dashboard?openRequirement=${encodeURIComponent(String(requirementId || "").trim())}`;
  const offerSummary = [
    `Requirement: ${String(productName || "Requirement").trim()}`,
    `Offer price: Rs ${String(price || "").trim()}`
  ].join(" | ");
  const body = [
    "Your offer has been submitted successfully.",
    "",
    `Requirement: ${String(productName || "Requirement").trim()}`,
    `Offer price: Rs ${String(price || "").trim()}`,
    "",
    `Open your seller dashboard: ${dashboardLink}`
  ].join("\n");

  const tasks = [];
  if (targetMobile) {
    tasks.push(
      sendEventSms({
        mobile: targetMobile,
        variables: [
          "Offer submitted successfully",
          offerSummary,
          dashboardLink
        ]
      })
    );
  }
  if (targetEmail) {
    tasks.push(
      sendEmailToRecipient({
        to: targetEmail,
        subject: `Offer received for ${String(productName || "your requirement").trim()}`,
        text: body
      })
    );
  }

  await Promise.allSettled(tasks);
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
  delete data.buyer;
  delete data.buyerName;
  delete data.buyerMobile;
  delete data.buyerEmail;
  delete data.mobile;
  delete data.email;
  delete data.phone;
  delete data.contactMobile;
  delete data.contactEmail;
  delete data.name;
  return data;
}
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getRangeStart(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getSmartTabDateQuery(smartTab) {
  const tab = String(smartTab || "").trim().toLowerCase();
  const now = new Date();
  if (tab === "today") {
    return { createdAt: { $gte: getRangeStart(now) } };
  }
  if (tab === "week") {
    const start = getRangeStart(now);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { createdAt: { $gte: start, $lt: end } };
  }
  if (tab === "month") {
    const start = getRangeStart(now);
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { createdAt: { $gte: start, $lt: end } };
  }
  if (tab === "year") {
    const start = getRangeStart(now);
    start.setMonth(0, 1);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    return { createdAt: { $gte: start, $lt: end } };
  }
  if (tab === "auctions") {
    return { "reverseAuction.active": true };
  }
  return {};
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
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Seller onboarding (first-time registration)
 */
router.post("/onboard", auth, async (req, res) => {
  const {
    mobile,
    email,
    registeredBusinessName,
    registrationDetails,
    businessAddress,
    ownerName,
    managerName,
    categories,
    website,
    taxId,
    city,
    whatsappConsent
  } = req.body || {};
  const mobileValue = String(mobile || "").trim();
  const emailValue = String(email || "").trim();
  const cityValue = String(city || "").trim();
  const registeredBusinessNameValue = String(registeredBusinessName || "").trim();
  const managerNameValue = String(managerName || "").trim();

  if (
    !mobileValue ||
    !emailValue ||
    !cityValue ||
    !registeredBusinessNameValue ||
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
    email: emailValue,
    city: cityValue,
    "sellerProfile.registeredBusinessName": registeredBusinessNameValue,
    "sellerProfile.managerName": managerNameValue,
    "sellerProfile.categories": normalizedCategories,
    ...(whatsappConsent === true ? {
      "sellerSettings.whatsappConsent": true,
      "sellerSettings.whatsappConsentAt": new Date()
    } : {})
  };

  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        ...update,
        "roles.seller": true
      },
      { new: true }
    );

    setImmediate(() => {
      sendSellerOnboardingAck({
        mobile: mobileValue,
        email: emailValue,
        businessName: registeredBusinessNameValue,
        city: cityValue,
        whatsappConsent: whatsappConsent === true
      }).catch(() => {});
    });

    return res.json({
      sellerProfile: user?.sellerProfile || {},
      city: user?.city,
      email: user?.email,
      roles: user?.roles,
      termsAccepted: user?.termsAccepted
    });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.email) {
      const existingUser = await User.findOne({ email: emailValue });
      if (!existingUser) throw err;

      const currentUserId = req.user._id;
      const targetUserId = existingUser._id;

      await Offer.updateMany({ seller: currentUserId }, { $set: { seller: targetUserId } });
      await Requirement.updateMany({ buyer: currentUserId }, { $set: { buyer: targetUserId } });
      await Notification.updateMany({ to: currentUserId }, { $set: { to: targetUserId } });
      await ChatMessage.updateMany({ from: currentUserId }, { $set: { from: targetUserId } });
      await ChatMessage.updateMany({ to: currentUserId }, { $set: { to: targetUserId } });
      await PendingOfferDraft.updateMany({ seller: currentUserId }, { $set: { seller: targetUserId } });

      await User.findByIdAndDelete(currentUserId);

      const mergedUser = await User.findByIdAndUpdate(
        targetUserId,
        {
          ...update,
          "roles.seller": true
        },
        { new: true }
      );

      const token = jwt.sign(
        { id: mergedUser._id, role: "seller", tokenVersion: mergedUser.tokenVersion },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      setImmediate(() => {
        sendSellerOnboardingAck({
          mobile: mobileValue,
          email: emailValue,
          businessName: registeredBusinessNameValue,
          city: cityValue,
          whatsappConsent: whatsappConsent === true
        }).catch(() => {});
      });

      return res.json({
        sellerProfile: mergedUser?.sellerProfile || {},
        city: mergedUser?.city,
        email: mergedUser?.email,
        roles: mergedUser?.roles,
        termsAccepted: mergedUser?.termsAccepted,
        token
      });
    }
    throw err;
  }
});

/**
 * Update seller profile
 */
router.post("/profile", auth, sellerOnly, async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      registeredBusinessName,
      registrationDetails,
      businessAddress,
      ownerName,
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
      ...(typeof name === "string" ? { name: name.trim() } : {}),
      ...(typeof email === "string"
        ? { email: String(email).trim().toLowerCase() }
        : {}),
      ...(typeof mobile === "string" && mobile.trim()
        ? { mobile: normalizeE164(mobile) }
        : {}),
      ...(registeredBusinessName
        ? { "sellerProfile.registeredBusinessName": registeredBusinessName }
        : {}),
      ...(registrationDetails
        ? { "sellerProfile.registrationDetails": registrationDetails }
        : {}),
      ...(businessAddress
        ? { "sellerProfile.businessAddress": businessAddress }
        : {}),
      ...(ownerName ? { "sellerProfile.ownerName": ownerName } : {}),
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
      if (sellerSettings.emailNotificationToggles && typeof sellerSettings.emailNotificationToggles === "object") {
        const emailNotif = sellerSettings.emailNotificationToggles;
        update.sellerSettings.emailNotificationToggles = {
          enabled: emailNotif.enabled !== false,
          requirementUpdated: emailNotif.requirementUpdated !== false,
          reverseAuction: emailNotif.reverseAuction !== false
        };
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      update,
      { new: true, runValidators: true }
    );

    res.json({
      name: user?.name || "",
      sellerProfile: user?.sellerProfile || {},
      city: user?.city,
      email: user?.email || "",
      preferredCurrency: user?.preferredCurrency || "INR",
      sellerSettings: user?.sellerSettings || {}
    });
  } catch (err) {
    console.error("[Seller Profile] Update failed:", err);
    if (err?.code === 11000) {
      const duplicateField = Object.keys(err?.keyPattern || {})[0] || "field";
      return res.status(400).json({
        message: `This ${duplicateField} is already registered. Please use a different value.`
      });
    }
    return res.status(500).json({ message: "Failed to update seller profile" });
  }
});

/**
 * Update seller city
 */
router.post("/profile/city", auth, sellerOnly, async (req, res) => {
  try {
    const { city } = req.body || {};
    const cityValue = String(city || "").trim();
    if (!cityValue) {
      return res.status(400).json({ message: "City required" });
    }

    req.user.city = cityValue;
    await req.user.save();

    res.json({ city: req.user.city });
  } catch (err) {
    console.error("[Seller City] Update failed:", err);
    return res.status(500).json({ message: "Failed to update seller city" });
  }
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
    name: user?.name || "",
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
 * Send OTP to a new email or mobile for verification before profile update
 */
router.post("/profile/verify-contact", auth, sellerOnly, async (req, res) => {
  try {
    const { email, mobile } = req.body || {};
    const currentEmail = String(req.user.email || "").trim();
    const currentMobile = String(req.user.mobile || "").trim();

    const sendingEmail = email && email !== currentEmail;
    const sendingMobile = mobile && mobile !== currentMobile;

    if (!sendingEmail && !sendingMobile) {
      return res.json({ ok: true, reason: "no_change" });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    if (sendingEmail) {
      const emailValue = String(email).trim().toLowerCase();
      if (!/\S+@\S+\.\S+/.test(emailValue)) {
        return res.status(400).json({ message: "Invalid email" });
      }
      await sendOtpEmail({ email: emailValue, otp, subject: "Verify your email for Hoko" });
      setOtp(`verify-email:${req.user._id}`, otp, 5 * 60 * 1000);
      console.log(`[Seller Verify Contact] OTP sent to ${emailValue}`);
    }

    if (sendingMobile) {
      const mobileValue = normalizeE164(mobile);
      if (mobileValue.length < 10) {
        return res.status(400).json({ message: "Invalid mobile number" });
      }
      const mobileDigits = mobileValue.replace(/^\+/, "");
      await sendOtpSms({ mobile: mobileDigits, otp });
      setOtp(`verify-mobile:${req.user._id}`, otp, 5 * 60 * 1000);
      console.log(`[Seller Verify Contact] OTP sent to ${mobileValue}`);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[Seller Verify Contact] Failed:", err?.message || err);
    return res.status(500).json({ message: err?.message || "Failed to send OTP" });
  }
});

/**
 * Verify OTP and update email/mobile on seller profile
 */
router.post("/profile/confirm-contact", auth, sellerOnly, async (req, res) => {
  try {
    const { email, mobile, otp } = req.body || {};
    if (!otp) {
      return res.status(400).json({ message: "OTP required" });
    }

    const currentEmail = String(req.user.email || "").trim();
    const currentMobile = String(req.user.mobile || "").trim();

    const changingEmail = email && email !== currentEmail;
    const changingMobile = mobile && mobile !== currentMobile;

    if (changingEmail) {
      const result = verifyOtpCode(`verify-email:${req.user._id}`, String(otp));
      if (!result.ok) {
        return res.status(400).json({ message: `Invalid OTP: ${result.reason}` });
      }
      const existingUser = await User.findOne({ email: email.trim().toLowerCase(), _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(409).json({ message: "This email is already in use by another account" });
      }
      req.user.email = email.trim().toLowerCase();
    }

    if (changingMobile) {
      const result = verifyOtpCode(`verify-mobile:${req.user._id}`, String(otp));
      if (!result.ok) {
        return res.status(400).json({ message: `Invalid OTP: ${result.reason}` });
      }
      const normalizedMobile = normalizeE164(mobile);
      const existingMobileUser = await User.findOne({ mobile: normalizedMobile, _id: { $ne: req.user._id } });
      if (existingMobileUser) {
        return res.status(409).json({ message: "This mobile number is already in use by another account" });
      }
      req.user.mobile = normalizedMobile;
    }

    await req.user.save();

    res.json({
      ok: true,
      user: {
        email: req.user.email,
        mobile: req.user.mobile
      }
    });
  } catch (err) {
    console.error("[Seller Confirm Contact] Failed:", err?.message || err);
    return res.status(500).json({ message: "Failed to verify contact" });
  }
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

  await cleanupUserUploadFiles({ userId, userDoc: req.user });

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
const publicOfferRateLimit = new Map();

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
      registeredBusinessName,
      sellerName,
      sellerCity
    } = req.body;

    if (!requirementId) {
      return res.status(400).json({ message: "requirementId is required" });
    }

    if (!mobile) {
      return res.status(400).json({ message: "mobile is required for public offers" });
    }

    const mobileStr = String(mobile || "").replace(/\D/g, "").slice(-10);
    if (mobileStr.length < 10) {
      return res.status(400).json({ message: "Invalid mobile number" });
    }

    const mobileE164 = `+91${mobileStr}`;
    const now = Date.now();
    const rateLimitKey = mobileE164;
    const rateLimitWindow = 60 * 60 * 1000;
    const rateLimitMax = 5;

    const rateLimitEntry = publicOfferRateLimit.get(rateLimitKey);
    if (rateLimitEntry && now - rateLimitEntry.timestamp < rateLimitWindow) {
      if (rateLimitEntry.count >= rateLimitMax) {
        return res.status(429).json({
          message: "Too many offers. Please try again later.",
          retryAfter: Math.ceil((rateLimitWindow - (now - rateLimitEntry.timestamp)) / 1000)
        });
      }
      rateLimitEntry.count++;
    } else {
      publicOfferRateLimit.set(rateLimitKey, { timestamp: now, count: 1 });
    }

    if (message && message.length > 2000) {
      return res.status(400).json({ message: "Message too long (max 2000 characters)" });
    }

    if (price !== undefined && price !== null && price !== "" && Number(price) < 0) {
      return res.status(400).json({ message: "Price cannot be negative" });
    }

    setTimeout(() => {
      const entry = publicOfferRateLimit.get(rateLimitKey);
      if (entry && now - entry.timestamp > rateLimitWindow) {
        publicOfferRateLimit.delete(rateLimitKey);
      }
    }, rateLimitWindow);

    // Check if this is a dummy requirement
    const DummyRequirement = require("../models/DummyRequirement");
    const isDummy = await DummyRequirement.findOne({ _id: requirementId });
    
    if (isDummy) {
      // For dummy requirements, just save the offer without requiring a real requirement
      // The seller will be redirected to dashboard after submission
      return res.json({ 
        success: true, 
        message: "Offer submitted successfully",
        isDummy: true
      });
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
          sellerFirmName: registeredBusinessName,
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
        const channelTasks = [];
        
        if (mobileE164) {
          const appBase = String(process.env.PUBLIC_APP_URL || "https://hokoapp.in").trim();
          const sellerMobile = String(normalizeE164(mobileE164) || mobileE164 || "").replace(/[^\d]/g, "");
          const sellerDashboardLink = `${appBase}/seller/dashboard?${new URLSearchParams({
            ...(sellerMobile ? { mobile: sellerMobile } : {}),
            from: "wa"
          }).toString()}`;
          const sellerParams = [productName];
          console.log("[Public Offer] Sending to seller:", { to: mobileE164, templateKey: "seller_quote_received_ack", params: sellerParams, buttonUrl: sellerDashboardLink });
          channelTasks.push(
            sendWhatsAppTemplate({
              to: mobileE164,
              templateKey: "seller_quote_received_ack",
              parameters: sellerParams,
              buttonUrl: sellerDashboardLink,
              requirementId: requirementIdStr
            })
          );
        } else {
          console.log("[Public Offer] No seller mobile, skipping seller notification");
        }

        channelTasks.push(
          sendSellerOfferAckSideChannels({
            mobile: mobileE164,
            email,
            productName,
            price,
            requirementId: requirementIdStr
          })
        );
        
        const buyer = await User.findById(requirement.buyerId).select("mobile name").lean();
        const buyerMobileE164 = normalizeE164(buyer?.mobile);
        if (buyerMobileE164) {
          const buyerName = String(buyer?.name || "Buyer").trim();
          const appBase = String(process.env.PUBLIC_APP_URL || "https://hokoapp.in").trim();
          const buyerOfferLink = `${appBase}/buyer/requirement/${requirementIdStr}/offers`;
          const buyerParams = [buyerName, productName, priceStr, buyerOfferLink];
          console.log("[Public Offer] Sending to buyer:", { to: buyerMobileE164, templateKey: "_buyer_first_offer_alert", params: buyerParams });
          channelTasks.push(
            sendWhatsAppTemplate({
              to: buyerMobileE164,
              templateKey: "_buyer_first_offer_alert",
              parameters: buyerParams,
              requirementId: requirementIdStr
            })
          );
        } else {
          console.log("[Public Offer] No buyer mobile found");
        }

        await Promise.allSettled(channelTasks);
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
router.post("/offer", offerLimiter, auth, sellerOnly, async (req, res) => {
  try {
    const {
      requirementId,
      price,
      message,
      deliveryTime,
      paymentTerms,
      attachments
    } = req.body;
    
    // Check if this is a dummy requirement
    const DummyRequirement = require("../models/DummyRequirement");
    const isDummy = await DummyRequirement.findOne({ _id: requirementId });
    
    if (isDummy) {
      // For dummy requirements, just return success without saving to real offers
      return res.json({ 
        success: true, 
        message: "Offer submitted successfully! You will be notified when the buyer responds.",
        isDummy: true
      });
    }
    
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

    const offerGuard = await claimActionGuard({
      actionType: "seller_offer_submit",
      actorId: req.user._id,
      payloadParts: [
        req.user._id,
        requirementId,
        price,
        message || "",
        deliveryTime || "",
        paymentTerms || "",
        Array.isArray(attachments) ? attachments.join(",") : ""
      ],
      ttlMs: 15000,
      referenceType: "offer"
    });

    if (!offerGuard.claimed) {
      const existingOffer = offerGuard.guard?.referenceId
        ? await Offer.findById(offerGuard.guard.referenceId).lean()
        : await Offer.findOne({ requirementId, sellerId: req.user._id }).lean();
      if (existingOffer) {
        return res.json(existingOffer);
      }
      return res.status(409).json({
        message: "Duplicate offer submission detected. Please wait a moment and try again."
      });
    }

    let offer = null;
    try {
      offer = await Offer.findOneAndUpdate(
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
      await attachActionReference(offerGuard.key, "offer", offer._id);
    } catch (err) {
      await releaseActionGuard(offerGuard.key);
      throw err;
    }
    recordAppEvent({
      eventType: "offer_submitted",
      actorRole: "seller",
      userId: req.user._id,
      requirementId: requirement._id,
      offerId: offer?._id || null,
      source: "seller.offer.submit",
      payload: {
        price: Number(price || 0),
        requirementCity: requirement.city || "",
        requirementCategory: requirement.category || ""
      }
    });

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

      try {
        await requirement.save();
      } catch (err) {
        console.error("[Seller Offer] requirement save failed:", err?.message || err);
      }

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
        ).catch((err) => console.error("[Seller Offer] pending draft update failed:", err?.message || err));
      }

      setImmediate(() => {
        (async () => {
          try {
            notifyNewOffer(
              price,
              requirement.productName || requirement.product,
              req.user?.sellerProfile?.registeredBusinessName || req.user?.name || "Seller",
              req.user?.mobile || "",
              requirement.city,
              requirement._id
            );
          } catch (err) {
            console.error("[Seller Offer] notifyNewOffer failed:", err?.message || err);
          }

          const sellerName = String(req.user?.name || req.user?.sellerProfile?.registeredBusinessName || "Seller").trim();
          const productName = String(requirement.product || requirement.productName || "your requirement").trim();
          const priceStr = String(price || "").trim();
          const requirementIdStr = String(requirement._id || "").trim();
          const channelTasks = [];
          const sellerMobileE164Bg = normalizeE164(req.user?.mobile);
          
          if (sellerMobileE164Bg) {
            const sellerParams = [sellerName, productName, priceStr];
            const sellerDashboardLink = `${String(process.env.PUBLIC_APP_URL || "https://hokoapp.in").trim()}/seller/dashboard?${new URLSearchParams({
              ...(String(sellerMobileE164Bg || "").replace(/[^\d]/g, "") ? { mobile: String(sellerMobileE164Bg || "").replace(/[^\d]/g, "") } : {}),
              from: "wa"
            }).toString()}`;
            channelTasks.push(
              sendWhatsAppTemplate({
                to: sellerMobileE164Bg,
                templateKey: "seller_quote_received_ack_v1",
                parameters: sellerParams,
                requirementId: requirementIdStr,
                buttonUrl: sellerDashboardLink
              })
            );
          }

          channelTasks.push(
            sendSellerOfferAckSideChannels({
              mobile: req.user?.mobile,
              email: req.user?.email,
              productName,
              price,
              requirementId: requirementIdStr
            })
          );
          
          const buyerMobileE164 = normalizeE164(buyer?.mobile);
          if (buyerMobileE164) {
            const buyerName = String(buyer?.name || "Buyer").trim();
            const buyerParams = [buyerName, productName, priceStr, requirementIdStr];
            channelTasks.push(
              sendWhatsAppTemplate({
                to: buyerMobileE164,
                templateKey: "_buyer_first_offer_alert_v2",
                parameters: buyerParams,
                requirementId: requirementIdStr
              })
            );
          }

          await Promise.allSettled(channelTasks);
        })().catch((err) => console.error("[WhatsApp] Offer notification error:", err?.message || err));
      });

      const io = req.app.get("io");
      if (shouldNotifyBuyerEvent(buyer, "newOffer")) {
        const guardKey = `buyer:new_offer:${requirement._id}:${offer._id}:${requirement.buyerId}`;
        const guard = await claimNotificationGuard(guardKey, 5 * 60 * 1000, "new_offer");
        if (guard.ok) {
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
        }).catch((err) => console.error("[Seller Offer] buyer push failed:", err?.message || err));
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

          if (events.newOfferToBuyer !== false && buyer?.email && buyer.buyerSettings?.emailNotificationToggles?.enabled !== false && buyer.buyerSettings?.emailNotificationToggles?.newOffer !== false) {
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
        })().catch((err) => console.error("[Seller Offer] admin email side-channel failed:", err?.message || err));
      });
    }
    return res.json(offer);
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
  const smartTab = String(req.query?.smartTab || "all").trim().toLowerCase();
  const usePagination =
    Object.prototype.hasOwnProperty.call(req.query || {}, "page") ||
    Object.prototype.hasOwnProperty.call(req.query || {}, "limit");
  const page = Math.max(Number(req.query?.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100);
  const skip = usePagination ? (page - 1) * limit : 0;
  const isAllCities =
    hasCityParam &&
    (!requestedCityNormalized || requestedCityNormalized === "all");
  const isAllCategories =
    !requestedCategoryNormalized || requestedCategoryNormalized === "all";

  const requirementQuery = {
    "moderation.removed": { $ne: true },
    status: { $in: ["open", "active", "pending"] }
  };

  if (!isAllCategories) {
    requirementQuery.category = new RegExp(
      `^\\s*${escapeRegex(requestedCategory)}\\s*$`,
      "i"
    );
  }
  Object.assign(requirementQuery, getSmartTabDateQuery(smartTab));

  const requirementsRaw = await Requirement.find(requirementQuery).sort({
    createdAt: -1
  })
    .skip(skip)
    .limit(usePagination ? limit : 0);
  const allRequirementsRaw = usePagination
    ? await Requirement.find(requirementQuery).sort({ createdAt: -1 })
    : requirementsRaw;
  const acceptedBuyerCityRequirementIds =
    await getAcceptedBuyerCityRequirementIds(allRequirementsRaw);
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

  const totalCount = allRequirementsRaw.filter((requirement) => {
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
  }).length;

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

  res.set("X-Total-Count", String(totalCount));
  res.json(mapped);
});

router.get("/check-mobile", async (req, res) => {
  const { mobile } = req.query;
  
  if (!mobile) {
    return res.status(400).json({ message: "Mobile number is required" });
  }
  
  const mobileE164 = normalizeE164(mobile);
  const user = await User.findOne({ mobile: mobileE164 }).select("_id email roles sellerProfile city").lean();
  
  if (!user) {
    return res.json({ exists: false });
  }
  
  const hasSellerRole = Boolean(user.roles?.seller);
  const hasSellerProfile = hasSellerRole && isCompleteSellerProfile(user);
  
  res.json({
    exists: true,
    hasSellerRole,
    hasSellerProfile,
    city: user.city,
    email: user.email
  });
});

module.exports = router;
