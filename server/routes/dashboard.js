const express = require("express");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const auth = require("../middleware/auth");
const router = express.Router();

router.get("/city/:city", auth, async (req, res) => {
  const requirements = await Requirement.find({
    city: req.params.city,
    "moderation.removed": { $ne: true }
  }).sort({ createdAt: -1 });

  const requirementIds = requirements.map((r) => r._id);
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

  const data = requirements.map((req) => {
    const item = req.toObject();
    item.offerCount = countMap.get(String(req._id)) || 0;
    return item;
  });

  res.json(data);
});

router.get("/offers/:requirementId", auth, async (req, res) => {
  const offers = await Offer.find({
    requirementId: req.params.requirementId,
    "moderation.removed": { $ne: true }
  })
    .populate("sellerId", "sellerProfile city")
    .sort({ price: 1 });

  const safeOffers = offers.map((offer) => ({
    _id: offer._id,
    requirementId: offer.requirementId,
    sellerId: offer.sellerId?._id || null,
    sellerProfile: offer.sellerId?.sellerProfile || {},
    sellerCity: offer.sellerId?.city || "",
    price: offer.price,
    message: offer.message || "",
    deliveryTime: offer.deliveryTime || "",
    paymentTerms: offer.paymentTerms || "",
    viewedByBuyer: offer.viewedByBuyer || false,
    contactEnabledByBuyer: offer.contactEnabledByBuyer === true,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt
  }));

  res.json(safeOffers);
});

module.exports = router;
