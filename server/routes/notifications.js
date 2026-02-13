const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

/**
 * Fetch notifications for logged-in user
 */
router.get("/", auth, async (req, res) => {
  const notifications = await Notification.find({
    userId: req.user._id
  })
    .sort({ createdAt: -1 })
    .limit(100);

  res.json(notifications);
});

/**
 * Mark notification as read
 */
router.post("/:id/read", auth, async (req, res) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true }
  );

  if (!notif) {
    return res.status(404).json({ message: "Not found" });
  }

  res.json({ success: true });
});

module.exports = router;
