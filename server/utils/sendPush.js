const Push = require("../models/PushSubscription");
const webpush = require("./push");

module.exports = async function sendPush(userId, payload) {
  const record = await Push.findOne({ userId });
  if (!record) return;

  await webpush.sendNotification(
    record.subscription,
    JSON.stringify(payload)
  );
};
