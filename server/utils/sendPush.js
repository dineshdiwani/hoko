const Push = require("../models/PushSubscription");
const webpush = require("./push");

module.exports = async function sendPush(userId, payload) {
  const records = await Push.find({ userId }).select("subscription endpoint");
  if (!records.length) return;
  const validRecords = records.filter((record) => {
    const endpoint = String(record?.subscription?.endpoint || record?.endpoint || "").trim();
    const auth = String(record?.subscription?.keys?.auth || "").trim();
    const p256dh = String(record?.subscription?.keys?.p256dh || "").trim();
    return Boolean(endpoint && auth && p256dh);
  });
  if (!validRecords.length) return;

  await Promise.all(
    validRecords.map(async (record) => {
      try {
        await webpush.sendNotification(
          record.subscription,
          JSON.stringify(payload)
        );
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        if ([400, 401, 403, 404, 410].includes(statusCode)) {
          await Push.deleteOne({ _id: record._id });
          return;
        }
        console.warn("Push send failed", {
          userId,
          statusCode: statusCode || null,
          message: String(error?.message || "unknown_error")
        });
      }
    })
  );
};
