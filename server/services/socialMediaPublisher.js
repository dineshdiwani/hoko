const fs = require("fs");
const path = require("path");
const { postMetaCampaign, resolveMetaPageId } = require("../utils/metaPublisher");

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
    size: Number(media.size || campaign.mediaSize || 0) || 0
  };
}

function buildCampaignMessage(campaign = {}) {
  const message = normalizeText(campaign.message || "");
  const link = normalizeText(campaign.link || "");
  const media = resolveCampaignMedia(campaign);

  if ((media.mode === "url" || media.mode === "file") && link) {
    return [message, link].filter(Boolean).join("\n\n").trim();
  }

  return message;
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
    mimetype: media.mimeType || "application/octet-stream"
  };
}

async function publishFacebookPageCampaign(campaign = {}) {
  const pageId = normalizeText(campaign.pageId || resolveMetaPageId());
  if (!pageId) {
    throw new Error("Missing Meta Page ID");
  }

  const media = resolveCampaignMedia(campaign);
  const message = buildCampaignMessage(campaign);
  const link = normalizeText(campaign.link || "");

  const mediaFile = resolveCampaignMediaFile(campaign);
  if (mediaFile) {
    return postMetaCampaign({
      pageId,
      message,
      mediaFile
    });
  }

  if (media.mode === "url" && media.url) {
    return postMetaCampaign({
      pageId,
      message,
      mediaUrl: media.url
    });
  }

  return postMetaCampaign({
    pageId,
    message,
    link
  });
}

module.exports = {
  buildCampaignMessage,
  publishFacebookPageCampaign,
  resolveCampaignMedia,
  resolveCampaignMediaFile
};
