const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Offer = require("../models/Offer");
const Requirement = require("../models/Requirement");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ChatMessage = require("../models/ChatMessage");
const PlatformSettings = require("../models/PlatformSettings");
const auth = require("../middleware/auth");
const sellerOnly = require("../middleware/sellerOnly");
const sendPush = require("../utils/sendPush");
const { sendAdminEventEmail, sendEmailToRecipient } = require("../utils/sendEmail");
const { getModerationRules, checkTextForFlags } = require("../utils/moderation");
const { normalizeRequirementAttachmentsForResponse } = require("../utils/attachments");

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

function safeFilename(originalname) {
  const ext = path.extname(String(originalname || "")).toLowerCase();
  const base = path
    .basename(String(originalname || ""), ext)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 60);
  return `${base || "file"}${ext}`;
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

function mapRequirementForSeller(requirementDoc, offerMap) {
  if (!requirementDoc) return null;
  const data = normalizeRequirementAttachmentsForResponse(requirementDoc);
  const reqId = String(requirementDoc._id);
  const sellerOffer = offerMap.get(reqId) || null;
  data.product = data.product || data.productName;
  data.reverseAuctionActive = data.reverseAuction?.active === true;
  data.currentLowestPrice =
    typeof data.currentLowestPrice === "number"
      ? data.currentLowestPrice
      : data.reverseAuction?.lowestPrice ?? null;
  data.myOffer = Boolean(sellerOffer);
  data.contactEnabledByBuyer = sellerOffer?.contactEnabledByBuyer === true;
  data.buyerId = data.buyerId;
  return data;
}

function normalizeCity(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Seller onboarding (first-time registration)
 */
router.post("/onboard", auth, async (req, res) => {
  const {
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

  if (
    !businessName ||
    !businessAddress ||
    !ownerName ||
    !taxId ||
    !city
  ) {
    return res
      .status(400)
      .json({ message: "Missing required fields" });
  }

  const normalizedCategories = Array.isArray(categories)
    ? categories
        .map((c) => String(c || "").toLowerCase().trim())
        .filter(Boolean)
    : [];

  const update = {
    "sellerProfile.businessName": businessName,
    "sellerProfile.registrationDetails": registrationDetails || "",
    "sellerProfile.businessAddress": businessAddress,
    "sellerProfile.ownerName": ownerName,
    "sellerProfile.firmName": firmName || "",
    "sellerProfile.managerName": managerName || "",
    "sellerProfile.categories": normalizedCategories,
    "sellerProfile.website": website || "",
    "sellerProfile.taxId": taxId,
    city
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
    preferredCurrency
  } = req.body || {};

  const normalizedCategories = Array.isArray(categories)
    ? categories
        .map((c) => String(c || "").toLowerCase().trim())
        .filter(Boolean)
    : [];

  const update = {
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

  const user = await User.findByIdAndUpdate(
    req.user._id,
    update,
    { new: true }
  );

  res.json({
    sellerProfile: user?.sellerProfile || {},
    city: user?.city,
    preferredCurrency: user?.preferredCurrency || "INR"
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
    city: user?.city,
    preferredCurrency: user?.preferredCurrency || "INR",
    terms: {
      acceptedAt: user?.termsAccepted?.at || null,
      versionDate: latestPlatformSettings?.updatedAt || null
    },
    loginMethods: {
      otp: true,
      google: Boolean(user?.googleProfile?.sub)
    }
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
    const sellerCity = normalizeCity(req.user?.city);
    const buyerCity = normalizeCity(requirement?.city);
    if (!sellerCity || !buyerCity || sellerCity !== buyerCity) {
      return res.status(403).json({
        message: "You can submit offers only for requirements in your city"
      });
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

      const io = req.app.get("io");
      if (shouldNotifyBuyerEvent(buyer, "newOffer")) {
        const notif = await Notification.create({
          userId: requirement.buyerId,
          message: `New offer received for ${requirement.product || requirement.productName}`,
          type: "new_offer"
        });
        if (io) {
          io.to(String(requirement.buyerId)).emit(
            "notification",
            notif
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
          body: `A seller submitted an offer of Rs ${price}`
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
          const subject = `New offer on ${requirementName}`;
          const lines = [
            "A new offer was submitted.",
            `Requirement: ${requirementName}`,
            `Requirement ID: ${requirement._id}`,
            `Buyer ID: ${requirement.buyerId}`,
            `Seller ID: ${req.user?._id || "-"}`,
            `Price: Rs ${price}`,
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
  const sellerCity = normalizeCity(req.user?.city);
  const buyerCity = normalizeCity(requirement?.city);
  if (!sellerCity || !buyerCity || sellerCity !== buyerCity) {
    return res.status(403).json({
      message: "This requirement is outside your city"
    });
  }

  const sellerOffer = await Offer.findOne({
    requirementId: requirement._id,
    sellerId: req.user._id
  }).select("requirementId contactEnabledByBuyer");
  const offerMap = new Map(
    sellerOffer
      ? [[String(sellerOffer.requirementId), sellerOffer]]
      : []
  );

  return res.json(mapRequirementForSeller(requirement, offerMap));
});

/**
 * Seller dashboard (requirements by category + city)
 */
router.get("/dashboard", auth, sellerOnly, async (req, res) => {
  const seller = await User.findById(req.user._id);
  const hasCityParam = Object.prototype.hasOwnProperty.call(
    req.query || {},
    "city"
  );
  const requestedCity = String(req.query?.city || "").trim();
  const isAllCities =
    hasCityParam &&
    (!requestedCity ||
      String(requestedCity).toLowerCase() === "all");
  const targetCity = requestedCity || String(seller?.city || "").trim();

  const requirementQuery = {
    "moderation.removed": { $ne: true }
  };
  if (!isAllCities && targetCity) {
    requirementQuery.city = targetCity;
  }
  // Category filtering is handled client-side using localStorage prefs.

  const requirements = await Requirement.find(requirementQuery).sort({
    createdAt: -1
  });

  const requirementIds = requirements.map((r) => r._id);
  const offers = await Offer.find({
    sellerId: req.user._id,
    requirementId: { $in: requirementIds }
  }).select("requirementId contactEnabledByBuyer");
  const offerMap = new Map(
    offers.map((offer) => [String(offer.requirementId), offer])
  );

  const mapped = requirements.map((req) =>
    mapRequirementForSeller(req, offerMap)
  );

  res.json(mapped);
});

module.exports = router;
