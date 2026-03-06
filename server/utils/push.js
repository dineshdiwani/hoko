const PushSubscription = require("../models/PushSubscription");
const webpush = require("web-push");

const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
const vapidSubject = String(process.env.VAPID_SUBJECT || "mailto:support@hokoapp.in").trim();

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

/**
 * Push notifications disabled in local dev
 * (Enable later with valid VAPID keys)
 */

async function subscribeToPush(userId, subscription) {
  const endpoint = String(subscription?.endpoint || "").trim();
  if (!endpoint) {
    throw new Error("Invalid subscription endpoint");
  }

  await PushSubscription.findOneAndUpdate(
    { userId, endpoint },
    { userId, endpoint, subscription },
    { upsert: true }
  );
}

async function sendNotification(subscription, payload) {
  if (!subscription) {
    throw new Error("Missing subscription");
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return null;
  }
  return webpush.sendNotification(subscription, payload);
}

module.exports = {
  subscribeToPush,
  sendNotification
};
