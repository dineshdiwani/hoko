const Push = require("../models/PushSubscription");
const webpush = require("./push");
const sendNativePush = require("./sendNativePush");
const { withRetry } = require("./retry");
const { scheduleOutboundLog } = require("./outboundDeliveryLog");

module.exports = async function sendPush(userId, payload) {
  try {
    const records = await Push.find({ userId }).select("subscription endpoint");
    const validRecords = records.filter((record) => {
      const endpoint = String(record?.subscription?.endpoint || record?.endpoint || "").trim();
      const auth = String(record?.subscription?.keys?.auth || "").trim();
      const p256dh = String(record?.subscription?.keys?.p256dh || "").trim();
      return Boolean(endpoint && auth && p256dh);
    });

    await Promise.all([
      Promise.all(
        validRecords.map(async (record) => {
          try {
            await withRetry(
              () => webpush.sendNotification(
                record.subscription,
                JSON.stringify(payload)
              ),
              { maxAttempts: 3, baseDelayMs: 350 }
            );
          } catch (error) {
            const statusCode = Number(error?.statusCode || 0);
            if ([400, 401, 403, 404, 410].includes(statusCode)) {
              await Push.deleteOne({ _id: record._id });
              return;
            }
            console.warn("Web push send failed", {
              userId,
              statusCode: statusCode || null,
              message: String(error?.message || "unknown_error")
            });
          }
        })
      ),
      sendNativePush(String(userId), payload).catch((error) => {
        console.warn("Native push send failed", {
          userId,
          message: String(error?.message || "unknown_error")
        });
      })
    ]);

    scheduleOutboundLog({
      channel: "push",
      eventType: String(payload?.eventType || payload?.type || "generic_push"),
      target: String(userId || ""),
      status: validRecords.length ? "sent" : "skipped",
      provider: "webpush+firebase",
      attempts: 1,
      messagePreview: String(payload?.title || payload?.body || "push notification"),
      metadata: {
        webPushSubscriptions: validRecords.length
      }
    });
  } catch (error) {
    scheduleOutboundLog({
      channel: "push",
      eventType: String(payload?.eventType || payload?.type || "generic_push"),
      target: String(userId || ""),
      status: "failed",
      provider: "webpush+firebase",
      attempts: 1,
      messagePreview: String(payload?.title || payload?.body || "push notification"),
      error: error?.message || error
    });
    throw error;
  }
};
