const PushSubscription = require("../models/PushSubscription");

/**
 * Push notifications disabled in local dev
 * (Enable later with valid VAPID keys)
 */

async function subscribeToPush(userId, subscription) {
  await PushSubscription.findOneAndUpdate(
    { userId },
    { subscription },
    { upsert: true }
  );
}

module.exports = {
  subscribeToPush
};
