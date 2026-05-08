const express = require("express");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const auth = require("../middleware/auth");
const { normalizeRequirementAttachmentsForResponse } = require("../utils/attachments");
const { getEffectiveRequirementStatus } = require("../utils/sharedUtils");
const router = express.Router();
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTimeFilterDateQuery(timeFilter) {
  const key = String(timeFilter || "all").trim().toLowerCase();
  if (key === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { createdAt: { $gte: start } };
  }
  if (key === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { createdAt: { $gte: start } };
  }
  if (key === "month") {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { createdAt: { $gte: start } };
  }
  return {};
}

router.get("/city/:city", auth, async (req, res) => {
  const requestedCity = String(req.params.city || "").trim();
  const requestedCategory = String(req.query?.category || "").trim();
  const requestedTimeFilter = String(req.query?.timeFilter || "all").trim();
  const isAllCities =
    !requestedCity || requestedCity.toLowerCase() === "all";
  const isAllCategories =
    !requestedCategory || requestedCategory.toLowerCase() === "all";
  const usePagination =
    Object.prototype.hasOwnProperty.call(req.query || {}, "page") ||
    Object.prototype.hasOwnProperty.call(req.query || {}, "limit");
  const page = Math.max(Number(req.query?.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100);
  const skip = usePagination ? (page - 1) * limit : 0;

  const requirementQuery = {
    "moderation.removed": { $ne: true },
    status: { $in: ["open", "active", "pending"] }
  };

  if (!isAllCities) {
    const cityRegex = new RegExp(`^${escapeRegex(requestedCity)}$`, "i");
    requirementQuery.city = cityRegex;
  }
  if (!isAllCategories) {
    requirementQuery.category = new RegExp(
      `^${escapeRegex(requestedCategory)}$`,
      "i"
    );
  }
  Object.assign(requirementQuery, getTimeFilterDateQuery(requestedTimeFilter));

  const totalCount = await Requirement.countDocuments(requirementQuery);

  const requirements = (await Requirement.find(requirementQuery).sort({
    createdAt: -1
  })
    .skip(skip)
    .limit(usePagination ? limit : 0)).filter((requirement) => getEffectiveRequirementStatus(requirement) === "open");

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
    const item = normalizeRequirementAttachmentsForResponse(req);
    item.status = getEffectiveRequirementStatus(req);
    item.offerCount = countMap.get(String(req._id)) || 0;
    return item;
  });

  res.set("X-Total-Count", String(totalCount));
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
    outcomeStatus: String(offer.outcomeStatus || "pending").trim() || "pending",
    outcomeUpdatedAt: offer.outcomeUpdatedAt || null,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt
  }));

  res.json(safeOffers);
});

module.exports = router;
