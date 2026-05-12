const fs = require("fs");
const path = require("path");
const {
  getInstagramConfigStatus,
  postInstagramCampaign,
  resolveInstagramPublicImageUrl,
  resolveInstagramUserId
} = require("../utils/metaPublisher");

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveCampaignMedia(campaign = {}) {
  const media = campaign.media || {};
  const mode = normalizeText(media.mode || campaign.mediaMode || "none").toLowerCase();
  return {
    mode: ["none", "url", "file"].includes(mode) ? mode : "none",
    url: normalizeText(media.url || campaign.mediaUrl || ""),
    filePath: normalizeText(media.filePath || campaign.mediaFilePath || ""),
    fileName: normalizeText(media.fileName || campaign.mediaFileName || ""),
    mimeType: normalizeText(media.mimeType || campaign.mediaMimeType || ""),
    size: Number(media.size || campaign.mediaSize || 0) || 0,
    publicUrl: normalizeText(media.publicUrl || campaign.mediaPublicUrl || "")
  };
}

function buildCampaignCaption(campaign = {}) {
  const message = normalizeText(campaign.message || "");
  const link = normalizeText(campaign.link || "");
  return [message, link].filter(Boolean).join("\n\n").trim();
}

function resolveCampaignMediaFile(campaign = {}) {
  const media = resolveCampaignMedia(campaign);
  if (media.mode !== "file" || !media.filePath) {
    return null;
  }

  const absolutePath = path.isAbsolute(media.filePath)
    ? media.filePath
    : path.join(process.cwd(), media.filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error("Scheduled media file not found");
  }

  return {
    buffer: fs.readFileSync(absolutePath),
    originalname: media.fileName || path.basename(absolutePath),
    mimetype: media.mimeType || "image/jpeg",
    publicUrl: media.publicUrl || resolveInstagramPublicImageUrl({
      fileName: media.fileName || path.basename(absolutePath)
    })
  };
}

async function publishInstagramCampaign(campaign = {}) {
  const instagramUserId = normalizeText(campaign.instagramUserId || campaign.pageId || resolveInstagramUserId());
  if (!instagramUserId) {
    throw new Error("Missing Instagram Business Account ID");
  }

  const caption = buildCampaignCaption(campaign);
  const media = resolveCampaignMedia(campaign);
  const mediaFile = resolveCampaignMediaFile(campaign);

  if (mediaFile) {
    return postInstagramCampaign({
      userId: instagramUserId,
      caption,
      mediaFile
    });
  }

  if (media.mode === "url" && media.url) {
    return postInstagramCampaign({
      userId: instagramUserId,
      caption,
      mediaUrl: media.url
    });
  }

  throw new Error("Instagram posts require an image URL or uploaded image");
}

module.exports = {
  buildCampaignCaption,
  getInstagramConfigStatus,
  publishInstagramCampaign,
  resolveCampaignMedia,
  resolveCampaignMediaFile
};
