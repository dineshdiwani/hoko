const express = require("express");
const router = express.Router();

const Offer = require("../models/Offer");
const Requirement = require("../models/Requirement");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const sellerOnly = require("../middleware/sellerOnly");
const sendPush = require("../utils/sendPush");
const { getModerationRules, checkTextForFlags } = require("../utils/moderation");

function mapRequirementForSeller(requirementDoc, offerMap) {
  if (!requirementDoc) return null;
  const data = requirementDoc.toObject();
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
  res.json({
    sellerProfile: user?.sellerProfile || {},
    city: user?.city,
    preferredCurrency: user?.preferredCurrency || "INR"
  });
});

/**
 * Submit offer on requirement
 */
router.post("/offer", auth, sellerOnly, async (req, res) => {
  try {
    const { requirementId, price, message, deliveryTime, paymentTerms } = req.body;
    const moderationRules = await getModerationRules();
    const flaggedReason = checkTextForFlags(message || "", moderationRules);

    const offer = await Offer.findOneAndUpdate(
      { requirementId, sellerId: req.user._id },
      {
        price,
        message,
        deliveryTime: String(deliveryTime || "").trim(),
        paymentTerms: String(paymentTerms || "").trim(),
        "moderation.removed": false,
        "moderation.removedAt": null,
        "moderation.removedBy": null,
        "moderation.reason": "",
        "moderation.flagged": Boolean(flaggedReason),
        "moderation.flaggedAt": flaggedReason ? new Date() : null,
        "moderation.flaggedReason": flaggedReason || ""
      },
      { upsert: true, new: true }
    );

    const requirement = await Requirement.findById(requirementId);
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

      const notif = await Notification.create({
        userId: requirement.buyerId,
        message: `New offer received for ${requirement.product || requirement.productName}`,
        type: "new_offer"
      });
      const io = req.app.get("io");
      if (io) {
        io.to(String(requirement.buyerId)).emit(
          "notification",
          notif
        );
        if (auctionWasActive) {
          io.to(String(requirement.buyerId)).emit(
            "auction_price_update",
            {
              requirementId,
              offerId: offer._id,
              price
            }
          );
        }
      }

      await sendPush(requirement.buyerId.toString(), {
        title: "New Offer Received",
        body: `A seller submitted an offer of Rs ${price}`
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
