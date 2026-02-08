const express = require("express");
const ChatMessage = require("../models/ChatMessage");

const router = express.Router();

router.get("/history", async (req, res) => {
  const { user1, user2 } = req.query;

  try {
    const messages = await ChatMessage.find({
      $or: [
        { from: user1, to: user2 },
        { from: user2, to: user1 },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json([]);
  }
});

module.exports = router;
