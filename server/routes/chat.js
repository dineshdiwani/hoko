const express = require("express");
const ChatMessage = require("../models/ChatMessage");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/history", auth, async (req, res) => {
  const { requirementId, userId, peerId } = req.query;

  try {
    if (!requirementId || !userId) {
      return res.status(400).json({ message: "Missing data" });
    }
    if (String(req.user._id) !== String(userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const baseFilter = {
      requirementId,
      "moderation.removed": { $ne: true },
      $or: [{ fromUserId: userId }, { toUserId: userId }]
    };

    if (peerId) {
      baseFilter.$and = [
        {
          $or: [
            { fromUserId: userId, toUserId: peerId },
            { fromUserId: peerId, toUserId: userId }
          ]
        }
      ];
    }

    const messages = await ChatMessage.find(baseFilter).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json([]);
  }
});

router.post("/read", auth, async (req, res) => {
  const { requirementId, userId, peerId } = req.body || {};

  try {
    if (!requirementId || !userId || !peerId) {
      return res.status(400).json({ message: "Missing data" });
    }
    if (String(req.user._id) !== String(userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const now = new Date();
    const result = await ChatMessage.updateMany(
      {
        requirementId,
        fromUserId: peerId,
        toUserId: userId,
        isRead: false,
        "moderation.removed": { $ne: true }
      },
      {
        $set: {
          isRead: true,
          readAt: now
        }
      }
    );

    res.json({
      updated: result.modifiedCount || 0,
      readAt: now.toISOString()
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update read status" });
  }
});

module.exports = router;
