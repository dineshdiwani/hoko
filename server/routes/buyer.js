const express = require("express");
const router = express.Router();

const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const auth = require("../middleware/auth");

/**
 * Create buyer requirement
 */
router.post("/requirement", auth, async (req, res) => {
  const requirement = await Requirement.create({
    ...req.body,
    buyerId: req.user._id
  });
  res.json(requirement);
});

/**
 * Get buyer's own posts
 */
router.get("/my-posts/:buyerId", auth, async (req, res) => {
  const posts = await Requirement.find({
    buyerId: req.params.buyerId
  }).sort({ createdAt: -1 });

  res.json(posts);
});

/**
 * Update requirement
 */
router.put("/requirement/:id", auth, async (req, res) => {
  const updated = await Requirement.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(updated);
});

/**
 * Delete requirement
 */
router.delete("/requirement/:id", auth, async (req, res) => {
  await Requirement.findByIdAndDelete(req.params.id);
  res.json({ message: "Requirement deleted" });
});

/**
 * Submit review (buyer → seller)
 */
router.post("/review", auth, async (req, res) => {
  const Review = require("../models/Review");

  const exists = await Review.findOne({
    requirementId: req.body.requirementId,
    buyerId: req.user._id,
    sellerId: req.body.sellerId
  });

  if (exists) {
    return res.status(400).json({ message: "Review already submitted" });
  }

  const review = await Review.create({
    ...req.body,
    buyerId: req.user._id
  });

  res.json(review);
});

module.exports = router;
