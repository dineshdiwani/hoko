const Push = require("../models/PushSubscription");
const webpush = require("./push");

module.exports = async function sendPush(userId, payload) {
  const record = await Push.findOne({ userId });
  if (!record) return;

  try {
    await webpush.sendNotification(
      record.subscription,
      JSON.stringify(payload)
    );
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      await Push.deleteOne({ _id: record._id });
      return;
    }
    throw error;
  }
};
