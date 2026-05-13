const fs = require("fs");
const path = require("path");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const ChatMessage = require("../models/ChatMessage");
const { extractStoredRequirementFilename } = require("./attachments");

const REQUIREMENT_UPLOAD_DIR = path.join(__dirname, "../uploads/requirements");
const OFFER_UPLOAD_DIR = path.join(__dirname, "../uploads/offers");
const BUYER_DOC_UPLOAD_DIR = path.join(__dirname, "../uploads/buyer-documents");
const CHAT_UPLOAD_DIR = path.join(__dirname, "../uploads/chat");

function removeFileIfExists(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore unlink errors so account cleanup can continue.
  }
}

function collectFilename(value) {
  const raw = String(
    typeof value === "object" && value
      ? value.filename || value.url || value.path || ""
      : value || ""
  ).trim();
  if (!raw) return "";
  return path.basename(raw.split("?")[0].split("#")[0]);
}

function addFilename(target, dir, value) {
  const filename = collectFilename(value);
  if (!filename) return;
  target.add(path.join(dir, filename));
}

async function cleanupUserUploadFiles({ userId, userDoc = null } = {}) {
  const targetPaths = new Set();
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return { cleanedFiles: 0 };

  const [requirements, offers, chatMessages] = await Promise.all([
    Requirement.find({ buyerId: normalizedUserId }).select("_id attachments").lean(),
    Offer.find({ sellerId: normalizedUserId }).select("_id attachments").lean(),
    ChatMessage.find({
      $or: [{ fromUserId: normalizedUserId }, { toUserId: normalizedUserId }]
    }).select("attachment.filename").lean()
  ]);

  const requirementIds = requirements.map((item) => item._id);
  const requirementOffers = requirementIds.length
    ? await Offer.find({ requirementId: { $in: requirementIds } }).select("_id attachments").lean()
    : [];

  for (const requirement of requirements) {
    for (const attachment of Array.isArray(requirement.attachments) ? requirement.attachments : []) {
      addFilename(targetPaths, REQUIREMENT_UPLOAD_DIR, extractStoredRequirementFilename(attachment));
    }
  }

  for (const offer of [...offers, ...requirementOffers]) {
    for (const attachment of Array.isArray(offer.attachments) ? offer.attachments : []) {
      addFilename(targetPaths, OFFER_UPLOAD_DIR, attachment);
    }
  }

  for (const message of chatMessages) {
    addFilename(targetPaths, CHAT_UPLOAD_DIR, message?.attachment?.filename);
  }

  const documents = Array.isArray(userDoc?.buyerSettings?.documents)
    ? userDoc.buyerSettings.documents
    : [];
  for (const doc of documents) {
    addFilename(targetPaths, BUYER_DOC_UPLOAD_DIR, doc?.filename);
  }

  for (const filePath of targetPaths) {
    removeFileIfExists(filePath);
  }

  return { cleanedFiles: targetPaths.size };
}

module.exports = {
  cleanupUserUploadFiles,
  removeFileIfExists
};
