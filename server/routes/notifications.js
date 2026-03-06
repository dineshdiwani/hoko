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

/**
 * Delete a notification for logged-in user
 */
router.delete("/:id", auth, async (req, res) => {
  const notif = await Notification.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id
  });
  if (!notif) {
    return res.status(404).json({ message: "Not found" });
  }
  return res.json({ success: true });
});

/**
 * Clear all notifications for logged-in user
 */
router.delete("/", auth, async (req, res) => {
  const result = await Notification.deleteMany({ userId: req.user._id });
  return res.json({ success: true, deletedCount: Number(result?.deletedCount || 0) });
});

module.exports = router;
