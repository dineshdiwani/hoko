const express = require("express");

const auth = require("../middleware/auth");
const PushSubscription = require("../models/PushSubscription");
const { subscribeToPush } = require("../utils/push");

const router = express.Router();

router.get("/public-key", auth, (req, res) => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  return res.json({ publicKey });
});

router.post("/subscribe", auth, async (req, res) => {
  const subscription = req.body?.subscription;
  const endpoint = String(subscription?.endpoint || "").trim();
  if (!endpoint) {
    return res.status(400).json({ message: "Invalid push subscription" });
  }

  await subscribeToPush(String(req.user._id), subscription);
  return res.json({ success: true });
});

router.post("/unsubscribe", auth, async (req, res) => {
  const userId = String(req.user._id);
  const endpoint = String(req.body?.endpoint || "").trim();
  if (endpoint) {
    await PushSubscription.deleteMany({ userId, endpoint });
  } else {
    await PushSubscription.deleteMany({ userId });
  }
  return res.json({ success: true });
});

module.exports = router;
