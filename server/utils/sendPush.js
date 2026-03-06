const Push = require("../models/PushSubscription");
const webpush = require("./push");

module.exports = async function sendPush(userId, payload) {
  const records = await Push.find({ userId });
  if (!records.length) return;

  await Promise.all(
    records.map(async (record) => {
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
      }
    })
  );
};
