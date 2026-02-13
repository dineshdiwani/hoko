const express = require("express");
const adminAuth = require("../middleware/adminAuth");
const Review = require("../models/Review");
const ChatMessage = require("../models/ChatMessage");

const router = express.Router();

router.get("/stats", adminAuth, async (req, res) => {
  const stats = {
    reviews: await Review.countDocuments(),
    messages: await ChatMessage.countDocuments({
      "moderation.removed": { $ne: true }
    }),
  };

  res.json(stats);
});

module.exports = router;
