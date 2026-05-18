const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const SocialMediaCampaign = require("../models/SocialMediaCampaign");
const {
  getInstagramConfigStatus,
  resolveInstagramUserId,
  resolveInstagramAccessToken
} = require("../utils/metaPublisher");
const { fetchGoogleSheetRows, normalizeCampaignRow } = require("../utils/socialMediaSheets");
const { generateSocialMediaDraft } = require("../utils/socialMediaAi");
const { publishInstagramCampaign } = require("../services/socialMediaPublisher");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const SOCIAL_MEDIA_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "social-media");

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeScheduleAt(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function isFutureSchedule(scheduleAt) {
  return Boolean(scheduleAt && scheduleAt.getTime() > Date.now() + 1000);
}

function sanitizeUploadName(originalName = "") {
  const base = path.basename(String(originalName || "campaign-media"));
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_") || `campaign-media-${Date.now()}`;
}

async function saveMediaUpload(file) {
  if (!file?.buffer) {
    return null;
  }
  await fs.promises.mkdir(SOCIAL_MEDIA_UPLOAD_DIR, { recursive: true });
  const safeName = sanitizeUploadName(file.originalname);
  const storedName = `${Date.now()}-${safeName}`;
  const absolutePath = path.join(SOCIAL_MEDIA_UPLOAD_DIR, storedName);
  await fs.promises.writeFile(absolutePath, file.buffer);
  return {
    mode: "file",
    filePath: absolutePath,
    fileName: storedName,
    originalName: String(file.originalname || storedName),
    mimeType: String(file.mimetype || "application/octet-stream"),
    size: Number(file.size || file.buffer.length || 0),
    publicUrl: `${resolvePublicAppUrl()}/api/uploads/social-media/${encodeURIComponent(storedName)}`
  };
}

function buildCampaignFromRequest({ req, mediaMeta, scheduleAt, source = "manual" }) {
  const instagramUserId = normalizeText(req.body?.pageId || resolveInstagramUserId());
  const message = normalizeText(req.body?.message || "");
  const link = normalizeText(req.body?.link || "");
  const mediaMode = normalizeText(req.body?.mediaMode || mediaMeta?.mode || "none").toLowerCase();
  const mediaUrl = normalizeText(req.body?.mediaUrl || mediaMeta?.url || "");
  const title = normalizeText(req.body?.title || "");
  const aiPrompt = normalizeText(req.body?.aiPrompt || "");
  const maxAttempts = Math.max(1, Number(req.body?.maxAttempts || 3) || 3);
  const queued = Boolean(scheduleAt && isFutureSchedule(scheduleAt));
  const media = {
    mode: ["none", "url", "file"].includes(mediaMode) ? mediaMode : "none",
    url: mediaMode === "url" ? mediaUrl : "",
    filePath: mediaMode === "file" ? mediaMeta?.filePath || "" : "",
    fileName: mediaMode === "file" ? mediaMeta?.fileName || "" : "",
    mimeType: mediaMode === "file" ? mediaMeta?.mimeType || "" : "",
    size: mediaMode === "file" ? Number(mediaMeta?.size || 0) : 0
  };

  return {
    platform: "instagram",
    type: "post",
    status: queued ? "queued" : "processing",
    instagramUserId,
    title,
    message,
    link,
    media,
    scheduleAt,
    attemptCount: queued ? 0 : 1,
    lastAttemptAt: queued ? null : new Date(),
    maxAttempts,
    source,
    aiPrompt,
    createdByAdminId: req.admin?._id || null,
    updatedByAdminId: req.admin?._id || null
  };
}

router.get("/meta/status", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  res.json({
    platform: "instagram",
    ...getInstagramConfigStatus()
  });
});

router.get("/meta/campaigns", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 20) || 20));
    const items = await SocialMediaCampaign.find({
      platform: "instagram"
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      items,
      total: items.length
    });
  } catch (err) {
    res.status(500).json({
      message: err?.message || "Failed to load social media campaigns"
    });
  }
});

router.post(
  "/meta/post",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
  upload.single("mediaFile"),
  async (req, res) => {
    let campaignDoc = null;
    try {
      const instagramUserId = normalizeText(req.body?.pageId || resolveInstagramUserId());
      const message = normalizeText(req.body?.message || "");
      const link = normalizeText(req.body?.link || "");
      const mediaMode = normalizeText(req.body?.mediaMode || "").toLowerCase();
      const mediaUrl = normalizeText(req.body?.mediaUrl || "");
      const scheduleAt = normalizeScheduleAt(req.body?.scheduleAt);
      const queueAction = normalizeText(req.body?.queueAction || "").toLowerCase();
      const mediaMeta = mediaMode === "file" ? await saveMediaUpload(req.file || null) : null;
      const mediaFile = mediaMode === "file" ? mediaMeta : null;

      if (!mediaUrl && !mediaFile) {
        return res.status(400).json({ message: "Instagram requires an image URL or uploaded image" });
      }
      if (mediaMode === "url" && !mediaUrl) {
        return res.status(400).json({ message: "Image URL is required for URL mode" });
      }
      if (mediaMode === "file" && !mediaFile) {
        return res.status(400).json({ message: "Image file is required for upload mode" });
      }
      if (queueAction === "queue" && (!scheduleAt || !isFutureSchedule(scheduleAt))) {
        return res.status(400).json({ message: "Select a future schedule time to queue this post" });
      }

      if (!resolveInstagramUserId(instagramUserId)) {
        return res.status(400).json({ message: "Missing Instagram Business Account ID" });
      }
      if (!resolveInstagramAccessToken()) {
        return res.status(400).json({ message: "Missing Instagram access token" });
      }

      campaignDoc = await SocialMediaCampaign.create(
        buildCampaignFromRequest({
          req,
          mediaMeta,
          scheduleAt,
          source: "manual"
        })
      );

      if (scheduleAt && isFutureSchedule(scheduleAt)) {
        return res.status(201).json({
          success: true,
          mode: "queued",
          scheduled: true,
          campaign: campaignDoc
        });
      }

      const publishResult = await publishInstagramCampaign(campaignDoc.toObject());
      await SocialMediaCampaign.findByIdAndUpdate(campaignDoc._id, {
        $set: {
          status: "published",
          publishedAt: new Date(),
          providerPostId: String(publishResult?.postId || "").trim(),
          providerResponse: publishResult?.raw || null,
          lastError: ""
        }
      });

      const updatedCampaign = await SocialMediaCampaign.findById(campaignDoc._id).lean();
      return res.json({
        success: true,
        mode: "published",
        scheduled: false,
        instagramUserId,
        pageId: instagramUserId,
        postId: String(publishResult?.postId || "").trim(),
        campaign: updatedCampaign,
        raw: publishResult?.raw || null
      });
    } catch (err) {
      if (campaignDoc?._id) {
        await SocialMediaCampaign.findByIdAndUpdate(campaignDoc._id, {
          $set: {
            status: "failed",
            lastError: err?.message || "publish_failed",
            providerResponse: err?.response?.data || err?.message || null
          }
        });
      }

      return res.status(500).json({
        message: err?.message || "Failed to post Instagram campaign"
      });
    }
  }
);

router.post("/meta/campaigns/:id/run-now", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const campaign = await SocialMediaCampaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }
    if (campaign.status === "published") {
      return res.status(400).json({ message: "Campaign already published" });
    }

    campaign.status = "processing";
    campaign.lastAttemptAt = new Date();
    campaign.attemptCount = Number(campaign.attemptCount || 0) + 1;
    await campaign.save();

    const result = await publishInstagramCampaign(campaign.toObject());
    campaign.status = "published";
    campaign.publishedAt = new Date();
    campaign.providerPostId = String(result?.postId || "").trim();
    campaign.providerResponse = result?.raw || null;
    campaign.lastError = "";
    await campaign.save();

    return res.json({
      success: true,
      campaign: campaign.toObject(),
      postId: String(result?.postId || "").trim(),
      raw: result?.raw || null
    });
  } catch (err) {
    try {
      const campaignId = String(req.params.id || "").trim();
      if (campaignId) {
        await SocialMediaCampaign.findByIdAndUpdate(campaignId, {
          $set: {
            status: "failed",
            lastError: err?.message || "publish_failed",
            providerResponse: err?.response?.data || err?.message || null,
            lastAttemptAt: new Date()
          }
        });
      }
    } catch {}

    return res.status(500).json({
      message: err?.message || "Failed to publish campaign"
    });
  }
});

router.post("/meta/import/google-sheet", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const sheetUrl = normalizeText(req.body?.sheetUrl || "");
    const defaultScheduleAt = normalizeScheduleAt(req.body?.defaultScheduleAt);
    const instagramUserId = normalizeText(req.body?.pageId || resolveInstagramUserId());

    if (!sheetUrl) {
      return res.status(400).json({ message: "Google Sheet URL required" });
    }
    if (!resolveInstagramAccessToken()) {
      return res.status(400).json({ message: "Missing Instagram access token" });
    }
    if (!instagramUserId) {
      return res.status(400).json({ message: "Missing Instagram Business Account ID" });
    }

    const rows = await fetchGoogleSheetRows(sheetUrl);
    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in Google Sheet" });
    }

    const created = [];
    const skipped = [];

    for (let index = 0; index < rows.length; index += 1) {
      const sheetRowNumber = index + 2;
      const normalizedRow = normalizeCampaignRow(rows[index], { defaultScheduleAt, instagramUserId });
      if (String(normalizedRow.status || "").toLowerCase() === "skip") {
        skipped.push({ row: sheetRowNumber, reason: "skipped" });
        continue;
      }

      const campaignMessage = normalizeText(normalizedRow.message);
      const campaignLink = normalizeText(normalizedRow.link);
      const mediaUrl = normalizeText(normalizedRow.mediaUrl);
      if (!campaignMessage && !campaignLink && !mediaUrl) {
        skipped.push({ row: sheetRowNumber, reason: "empty_row" });
        continue;
      }

      const scheduleAt = normalizedRow.scheduleAt || defaultScheduleAt || new Date();
      const rowMediaMode = normalizeText(normalizedRow.mediaMode || "none").toLowerCase();
      const campaign = await SocialMediaCampaign.create({
        platform: "instagram",
        type: "post",
        status: "queued",
        instagramUserId,
        title: normalizeText(normalizedRow.title || `Sheet row ${index + 1}`),
        message: campaignMessage,
        link: campaignLink,
        media: {
          mode: rowMediaMode === "url" ? "url" : mediaUrl ? "url" : "none",
          url: rowMediaMode === "url" ? mediaUrl : "",
          filePath: "",
          fileName: "",
          mimeType: "",
          size: 0
        },
        scheduleAt,
        source: "sheet_import",
        sheetSource: {
          sheetUrl,
          rowNumber: sheetRowNumber,
          raw: normalizedRow.raw
        },
        createdByAdminId: req.admin?._id || null,
        updatedByAdminId: req.admin?._id || null
      });
      created.push(campaign.toObject());
    }

    return res.json({
      success: true,
      imported: created.length,
      skipped: skipped.length,
      items: created,
      skippedRows: skipped
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message || "Failed to import Google Sheet"
    });
  }
});

router.post("/meta/ai/generate", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const draft = await generateSocialMediaDraft({
      brief: req.body?.brief || "",
      audience: req.body?.audience || "",
      tone: req.body?.tone || "professional",
      mediaStyle: req.body?.mediaStyle || "",
      includeHashtags: req.body?.includeHashtags !== false,
      platform: "instagram"
    });

    return res.json({
      success: true,
      draft
    });
  } catch (err) {
    return res.status(500).json({
      message: err?.message || "Failed to generate draft"
    });
  }
});

router.get("/meta/campaigns/:id", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  try {
    const campaign = await SocialMediaCampaign.findById(req.params.id).lean();
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }
    return res.json({ campaign });
  } catch (err) {
    return res.status(500).json({
      message: err?.message || "Failed to load campaign"
    });
  }
});

module.exports = router;
