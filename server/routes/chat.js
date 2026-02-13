const express = require("express");
const ChatMessage = require("../models/ChatMessage");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/history", auth, async (req, res) => {
  const { requirementId, userId } = req.query;

  try {
    if (!requirementId || !userId) {
      return res.status(400).json({ message: "Missing data" });
    }
    if (String(req.user._id) !== String(userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const messages = await ChatMessage.find({
      requirementId,
      "moderation.removed": { $ne: true },
      $or: [
        { fromUserId: userId },
        { toUserId: userId }
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json([]);
  }
});

module.exports = router;
