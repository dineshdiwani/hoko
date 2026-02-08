const express = require("express");
const Review = require("../models/Review");
const router = express.Router();

// ➕ Add review
router.post("/", async (req, res) => {
  try {
    const review = await Review.create(req.body);
    res.json(review);
  } catch (err) {
    res.status(400).json({ error: "Review already submitted" });
  }
});

// 📄 Get reviews for seller
router.get("/:sellerId", async (req, res) => {
  const reviews = await Review.find({ sellerId: req.params.sellerId })
    .sort({ createdAt: -1 });
  res.json(reviews);
});

// ⭐ Get average rating
router.get("/:sellerId/average", async (req, res) => {
  const result = await Review.aggregate([
    { $match: { sellerId: req.params.sellerId } },
    {
      $group: {
        _id: "$sellerId",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  res.json(result[0] || { avg: 0, count: 0 });
});

module.exports = router;
