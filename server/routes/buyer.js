const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const User = require("../models/User");
const { getModerationRules, checkTextForFlags } = require("../utils/moderation");
const auth = require("../middleware/auth");
const buyerOnly = require("../middleware/buyerOnly");

const uploadDir = path.join(__dirname, "../uploads/requirements");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedExtensions = new Set([
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
  const ext = path.extname(originalname).toLowerCase();
  const base = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 60);
  return `${base || "file"}${ext}`;
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
    buyerId: req.user._id,
    moderation: flaggedReason
      ? {
          flagged: true,
          flaggedAt: new Date(),
          flaggedReason
        }
      : undefined
  });
  res.json(requirement);
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
    const data = post.toObject();
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
  Object.assign(requirement, req.body);
  await requirement.save();
  res.json(requirement);
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
  res.json({
    city: req.user.city,
    preferredCurrency: req.user.preferredCurrency || "INR"
  });
});

/**
 * Update buyer profile
 */
router.post("/profile", auth, buyerOnly, async (req, res) => {
  const { city, preferredCurrency } = req.body || {};

  if (city) {
    req.user.city = city;
  }
  if (preferredCurrency) {
    req.user.preferredCurrency = preferredCurrency;
  }

  await req.user.save();
  res.json({
    city: req.user.city,
    preferredCurrency: req.user.preferredCurrency || "INR"
  });
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

  const lowestPrice =
    typeof req.body.lowestPrice === "number"
      ? req.body.lowestPrice
      : requirement.currentLowestPrice;
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

  if (
    typeof targetPrice === "number" &&
    typeof lowestPrice === "number" &&
    lowestPrice <= targetPrice
  ) {
    requirement.reverseAuction.active = false;
    requirement.reverseAuctionActive = false;
    requirement.reverseAuction.closedAt = new Date();
  }

  await requirement.save();
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

  const offersData = offers.map((offer) => ({
    _id: offer._id,
    price: offer.price,
    message: offer.message,
    viewedByBuyer: offer.viewedByBuyer || false,
    sellerId: offer.sellerId?._id,
    sellerFirm:
      offer.sellerId?.sellerProfile?.firmName ||
      offer.sellerId?.sellerProfile?.name ||
      "Seller",
    sellerCity: offer.sellerId?.city
  }));

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
