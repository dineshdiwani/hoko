const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const {
  getLegacyTypesForCategory,
  normalizeNotificationCategory,
  serializeNotification
} = require("../utils/notifications");

/**
 * Fetch notifications for logged-in user
 */
router.get("/", auth, async (req, res) => {
  const notifications = await Notification.find({
    userId: req.user._id
  })
    .sort({ createdAt: -1 })
    .limit(100);

  const fallbackUrl = req.user?.roles?.seller ? "/seller/dashboard" : "/buyer/dashboard";
  res.json(
    notifications
      .map((notification) => serializeNotification(notification, { fallbackUrl }))
      .filter(Boolean)
  );
});

/**
 * Mark notification as read
 */
router.post("/:id/read", auth, async (req, res) => {
  const now = new Date();
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true, readAt: now },
    { new: true }
  );

  if (!notif) {
    return res.status(404).json({ message: "Not found" });
  }

  res.json({ success: true });
});

router.post("/read-context", auth, async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const category = normalizeNotificationCategory(body.category);
  const event = String(body.event || "").trim();
  const state = String(body.state || "").trim().toLowerCase();
  const requirementId = String(body.requirementId || "").trim();
  const entityId = String(body.entityId || "").trim();
  const fromUserId = String(body.fromUserId || "").trim();

  const query = {
    userId: req.user._id,
    read: { $ne: true }
  };
  const andClauses = [];

  if (category) {
    const legacyTypes = getLegacyTypesForCategory(category);
    const categoryClauses = [{ "data.category": category }];
    if (legacyTypes.length) {
      categoryClauses.push({ type: { $in: legacyTypes } });
    }
    andClauses.push({ $or: categoryClauses });
  }

  if (event) {
    andClauses.push({
      $or: [{ "data.event": event }, { type: event }]
    });
  }

  if (state) {
    andClauses.push({ "data.state": state });
  }

  if (requirementId) {
    andClauses.push({
      $or: [
        { requirementId },
        { "data.requirementId": requirementId },
        { "data.entityId": requirementId }
      ]
    });
  }

  if (entityId) {
    andClauses.push({ "data.entityId": entityId });
  }

  if (fromUserId) {
    andClauses.push({ fromUserId });
  }

  if (andClauses.length) {
    query.$and = andClauses;
  }

  const result = await Notification.updateMany(query, {
    $set: {
      read: true,
      readAt: new Date()
    }
  });

  return res.json({
    success: true,
    updatedCount: Number(result?.modifiedCount || result?.nModified || 0)
  });
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
