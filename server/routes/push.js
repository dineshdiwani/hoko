const express = require("express");

const auth = require("../middleware/auth");
const PushSubscription = require("../models/PushSubscription");
const NativePushToken = require("../models/NativePushToken");
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

router.post("/native-token", auth, async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const platform = String(req.body?.platform || "android").trim().toLowerCase();
  if (!token) {
    console.warn("[native_push_token] missing token", {
      userId: String(req.user?._id || ""),
      platform
    });
    return res.status(400).json({ message: "token required" });
  }

  await NativePushToken.findOneAndUpdate(
    { userId: String(req.user._id), token },
    { userId: String(req.user._id), token, platform },
    { upsert: true }
  );

  console.info("[native_push_token] registered", {
    userId: String(req.user?._id || ""),
    platform
  });

  return res.json({ success: true });
});

router.post("/native-token/unsubscribe", auth, async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const query = { userId: String(req.user._id) };
  if (token) {
    query.token = token;
  }
  await NativePushToken.deleteMany(query);
  console.info("[native_push_token] unsubscribed", {
    userId: String(req.user?._id || ""),
    tokenProvided: Boolean(token)
  });
  return res.json({ success: true });
});

module.exports = router;
