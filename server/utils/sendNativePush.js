const NativePushToken = require("../models/NativePushToken");
const { getFirebaseMessaging } = require("./firebaseAdmin");

function stringifyData(value) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((acc, [key, item]) => {
    if (!key) return acc;
    if (item === undefined || item === null) {
      acc[key] = "";
      return acc;
    }
    acc[key] = typeof item === "string" ? item : JSON.stringify(item);
    return acc;
  }, {});
}

function isInvalidTokenError(error) {
  const code = String(error?.code || "");
  return [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered"
  ].includes(code);
}

module.exports = async function sendNativePush(userId, payload) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return;

  const records = await NativePushToken.find({ userId }).select("token");
  const tokens = Array.from(
    new Set(
      records
        .map((record) => String(record?.token || "").trim())
        .filter(Boolean)
    )
  );
  if (!tokens.length) return;

  const title = String(payload?.title || "HOKO").trim() || "HOKO";
  const body =
    String(payload?.body || payload?.message || "You have a new notification").trim() ||
    "You have a new notification";
  const data = stringifyData({
    ...(payload?.data || {}),
    title,
    body,
    tag: String(payload?.tag || "").trim()
  });

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body
    },
    data,
    android: {
      priority: "high"
    }
  });

  const invalidTokens = [];
  response.responses.forEach((item, index) => {
    if (!item?.success && isInvalidTokenError(item?.error)) {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length) {
    await NativePushToken.deleteMany({ userId, token: { $in: invalidTokens } });
  }
};
