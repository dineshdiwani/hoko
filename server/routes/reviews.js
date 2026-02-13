const express = require("express");
const Review = require("../models/Review");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

// Create review (buyer -> seller, or seller -> buyer)
router.post("/", auth, async (req, res) => {
  try {
    const { requirementId, reviewedUserId, rating, comment, targetRole } =
      req.body || {};

    if (!requirementId || !reviewedUserId || !rating) {
      return res.status(400).json({ message: "Missing data" });
    }

    const reviewer = req.user;
    if (!reviewer) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (String(reviewer._id) === String(reviewedUserId)) {
      return res.status(400).json({ message: "Cannot review yourself" });
    }

    const requirement = await Requirement.findById(requirementId);
    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }

    const targetRoleNormalized =
      targetRole === "buyer" ? "buyer" : "seller";
    const reviewerRole =
      targetRoleNormalized === "seller" ? "buyer" : "seller";

    if (reviewerRole === "buyer" && !reviewer.roles?.buyer) {
      return res.status(403).json({ message: "Buyer role required" });
    }
    if (reviewerRole === "seller" && !reviewer.roles?.seller) {
      return res.status(403).json({ message: "Seller role required" });
    }

    // Validate reviewer role vs requirement
    if (reviewerRole === "buyer") {
      if (String(requirement.buyerId) !== String(reviewer._id)) {
        return res.status(403).json({ message: "Not allowed" });
      }
      const offer = await Offer.findOne({
        requirementId,
        sellerId: reviewedUserId
      });
      if (!offer) {
        return res.status(400).json({ message: "Seller has no offer" });
      }
    } else {
      // reviewerRole === "seller"
      const offer = await Offer.findOne({
        requirementId,
        sellerId: reviewer._id
      });
      if (!offer) {
        return res.status(400).json({ message: "No offer found" });
      }
      if (String(requirement.buyerId) !== String(reviewedUserId)) {
        return res.status(400).json({ message: "Buyer mismatch" });
      }
    }

    const reviewedUser = await User.findById(reviewedUserId);
    if (!reviewedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const review = await Review.create({
      reviewerId: reviewer._id,
      reviewedUserId,
      requirementId,
      reviewerRole,
      targetRole: targetRoleNormalized,
      rating,
      comment
    });

    res.json(review);
  } catch (err) {
    res.status(400).json({ message: "Review already submitted" });
  }
});

// Get reviews for a user (as target)
router.get("/user/:userId", async (req, res) => {
  const mongoose = require("mongoose");
  let objectId = null;
  try {
    objectId = mongoose.Types.ObjectId(req.params.userId);
  } catch {
    objectId = null;
  }

  const query = objectId
    ? { reviewedUserId: { $in: [objectId, req.params.userId] } }
    : { reviewedUserId: req.params.userId };

  const reviews = await Review.find(query)
    .populate("reviewerId", "email city roles")
    .sort({ createdAt: -1 });
  res.json(reviews);
});

// Get average rating for a user (as target)
router.get("/user/:userId/average", async (req, res) => {
  const mongoose = require("mongoose");
  let objectId = null;
  try {
    objectId = mongoose.Types.ObjectId(req.params.userId);
  } catch {
    objectId = null;
  }

  const match = objectId
    ? { reviewedUserId: { $in: [objectId, req.params.userId] } }
    : { reviewedUserId: req.params.userId };

  const result = await Review.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$reviewedUserId",
        avg: { $avg: "$rating" },
        count: { $sum: 1 }
      }
    }
  ]);

  res.json(result[0] || { avg: 0, count: 0 });
});

module.exports = router;
