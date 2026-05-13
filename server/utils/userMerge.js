const User = require("../models/User");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const ChatMessage = require("../models/ChatMessage");
const Notification = require("../models/Notification");
const TempRequirement = require("../models/TempRequirement");
const AppEvent = require("../models/AppEvent");
const PushSubscription = require("../models/PushSubscription");
const NativePushToken = require("../models/NativePushToken");
const { normalizeE164 } = require("./sendWhatsApp");

const PLACEHOLDER_STRINGS = new Set([
  "user",
  "app user",
  "buyer",
  "seller",
  "whatsapp user",
  "unknown",
  "user_default"
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMobile(value) {
  return normalizeE164(value) || String(value || "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
}

function isMeaningfulString(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return !PLACEHOLDER_STRINGS.has(raw.toLowerCase());
}

function uniqueArray(values) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const key =
      value && typeof value === "object"
        ? JSON.stringify(value)
        : String(value || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function mergePreferredValue(targetValue, sourceValue) {
  if (Array.isArray(targetValue) || Array.isArray(sourceValue)) {
    return uniqueArray([...(Array.isArray(targetValue) ? targetValue : []), ...(Array.isArray(sourceValue) ? sourceValue : [])]);
  }

  if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
    const merged = { ...sourceValue };
    for (const key of Object.keys(targetValue)) {
      merged[key] = mergePreferredValue(targetValue[key], sourceValue[key]);
    }
    return merged;
  }

  if (targetValue instanceof Date) {
    return targetValue;
  }
  if (sourceValue instanceof Date) {
    return targetValue || sourceValue;
  }

  if (typeof targetValue === "string" || typeof sourceValue === "string") {
    const targetRaw = String(targetValue || "").trim();
    const sourceRaw = String(sourceValue || "").trim();
    if (isMeaningfulString(targetRaw)) return targetValue;
    if (isMeaningfulString(sourceRaw)) return sourceValue;
    return targetValue || sourceValue;
  }

  if (targetValue !== undefined && targetValue !== null && targetValue !== "") {
    return targetValue;
  }
  return sourceValue;
}

function mergePlainObjects(target, source) {
  if (!isPlainObject(target) && !isPlainObject(source)) {
    return target ?? source;
  }
  if (Array.isArray(target) || Array.isArray(source)) {
    return mergePreferredValue(target, source);
  }

  const result = { ...(isPlainObject(source) ? source : {}) };
  const targetObj = isPlainObject(target) ? target : {};
  for (const [key, value] of Object.entries(targetObj)) {
    result[key] = mergePreferredValue(value, result[key]);
  }
  return result;
}

function mergeDocumentData(targetDoc, sourceDoc) {
  const targetData = targetDoc.toObject({ depopulate: true, versionKey: false });
  const sourceData = sourceDoc.toObject({ depopulate: true, versionKey: false });
  const merged = mergePlainObjects(targetData, sourceData);

  if (targetData.roles || sourceData.roles) {
    merged.roles = {
      ...(sourceData.roles || {}),
      ...(targetData.roles || {})
    };
  }

  if (targetData.sellerProfile || sourceData.sellerProfile) {
    merged.sellerProfile = mergePlainObjects(targetData.sellerProfile || {}, sourceData.sellerProfile || {});
  }

  if (targetData.buyerSettings || sourceData.buyerSettings) {
    merged.buyerSettings = mergePlainObjects(targetData.buyerSettings || {}, sourceData.buyerSettings || {});
  }

  if (targetData.sellerSettings || sourceData.sellerSettings) {
    merged.sellerSettings = mergePlainObjects(targetData.sellerSettings || {}, sourceData.sellerSettings || {});
  }

  if (targetData.googleProfile || sourceData.googleProfile) {
    merged.googleProfile = mergePlainObjects(targetData.googleProfile || {}, sourceData.googleProfile || {});
  }

  if (targetData.termsAccepted || sourceData.termsAccepted) {
    const targetAt = targetData.termsAccepted?.at ? new Date(targetData.termsAccepted.at).getTime() : 0;
    const sourceAt = sourceData.termsAccepted?.at ? new Date(sourceData.termsAccepted.at).getTime() : 0;
    merged.termsAccepted = targetAt >= sourceAt
      ? (targetData.termsAccepted || sourceData.termsAccepted)
      : (sourceData.termsAccepted || targetData.termsAccepted);
  }

  return merged;
}

async function reassignReferences({ sourceIds, targetId }) {
  if (!Array.isArray(sourceIds) || !sourceIds.length || !targetId) return;

  const sourceObjectIds = sourceIds;
  const targetObjectId = targetId;

  await Promise.all([
    Requirement.updateMany(
      { buyerId: { $in: sourceObjectIds } },
      { $set: { buyerId: targetObjectId } }
    ),
    Offer.updateMany(
      { sellerId: { $in: sourceObjectIds } },
      { $set: { sellerId: targetObjectId } }
    ),
    ChatMessage.updateMany(
      { fromUserId: { $in: sourceObjectIds } },
      { $set: { fromUserId: targetObjectId } }
    ),
    ChatMessage.updateMany(
      { toUserId: { $in: sourceObjectIds } },
      { $set: { toUserId: targetObjectId } }
    ),
    Notification.updateMany(
      { userId: { $in: sourceObjectIds } },
      { $set: { userId: targetObjectId } }
    ),
    Notification.updateMany(
      { fromUserId: { $in: sourceObjectIds } },
      { $set: { fromUserId: targetObjectId } }
    ),
    Notification.updateMany(
      { to: { $in: sourceObjectIds } },
      { $set: { to: targetObjectId } }
    ),
    TempRequirement.updateMany(
      { userId: { $in: sourceObjectIds } },
      { $set: { userId: targetObjectId } }
    ),
    AppEvent.updateMany(
      { userId: { $in: sourceObjectIds } },
      { $set: { userId: targetObjectId } }
    ),
    PushSubscription.updateMany(
      { userId: { $in: sourceIds.map(String) } },
      { $set: { userId: String(targetId) } }
    ),
    NativePushToken.updateMany(
      { userId: { $in: sourceIds.map(String) } },
      { $set: { userId: String(targetId) } }
    )
  ]);
}

async function mergeUsersByCredentials({
  targetUser,
  patch = {},
  candidateEmails = [],
  candidateMobiles = [],
  sourceUsers = []
} = {}) {
  const targetDoc =
    targetUser && typeof targetUser.save === "function"
      ? targetUser
      : await User.findById(targetUser);

  if (!targetDoc) {
    return { merged: false, mergedUserIds: [], user: null };
  }

  if (patch && Object.keys(patch).length) {
    targetDoc.set(patch);
  }

  const emails = uniqueArray([
    ...candidateEmails.map(normalizeEmail),
    normalizeEmail(targetDoc.email),
    normalizeEmail(targetDoc.googleProfile?.email)
  ].filter(Boolean));
  const mobiles = uniqueArray([
    ...candidateMobiles.map(normalizeMobile),
    normalizeMobile(targetDoc.mobile),
    normalizeMobile(targetDoc.phone)
  ].filter(Boolean));

  let sources = Array.isArray(sourceUsers) ? sourceUsers.filter(Boolean) : [];
  if (!sources.length) {
    const conditions = [];
    if (emails.length) conditions.push({ email: { $in: emails } });
    if (mobiles.length) conditions.push({ mobile: { $in: mobiles } });
    if (conditions.length) {
      sources = await User.find({
        _id: { $ne: targetDoc._id },
        $or: conditions
      }).lean();
    }
  }

  const normalizedSources = sources
    .map((user) => (typeof user?.toObject === "function" ? user.toObject({ depopulate: true, versionKey: false }) : user))
    .filter((user) => String(user?._id || "") && String(user._id) !== String(targetDoc._id));

  if (!normalizedSources.length) {
    await targetDoc.save();
    return { merged: false, mergedUserIds: [], user: targetDoc };
  }

  const sourceIds = uniqueArray(normalizedSources.map((user) => String(user._id)));
  const sourceDocs = await User.find({ _id: { $in: sourceIds } });

  let mergedDoc = targetDoc;
  for (const sourceDoc of sourceDocs) {
    const mergedData = mergeDocumentData(mergedDoc, sourceDoc);
    mergedDoc.set(mergedData);
  }

  await reassignReferences({ sourceIds, targetId: mergedDoc._id });
  await User.deleteMany({ _id: { $in: sourceIds } });
  await mergedDoc.save();

  return {
    merged: true,
    mergedUserIds: sourceIds,
    user: mergedDoc
  };
}

module.exports = {
  mergeUsersByCredentials
};
