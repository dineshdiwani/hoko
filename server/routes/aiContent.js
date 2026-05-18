const express = require("express");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const AiContentCategory = require("../models/AiContentCategory");
const AiContentSettings = require("../models/AiContentSettings");
const AiGeneratedPost = require("../models/AiGeneratedPost");
const AiContentJobLog = require("../models/AiContentJobLog");
const AiContentTrainingNote = require("../models/AiContentTrainingNote");
const AiContentCampaignRun = require("../models/AiContentCampaignRun");
const PlatformSettings = require("../models/PlatformSettings");
const { buildOptionsResponse } = require("../config/platformDefaults");
const {
  createCampaignRunDrafts,
  getSettings,
  processAiContentGeneration
} = require("../services/aiContentScheduler");
const {
  composeDraftText,
  createBufferPost,
  getBufferChannels
} = require("../utils/bufferPublisher");

const router = express.Router();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeAiProvider(value) {
  const provider = normalizeText(value).toLowerCase();
  return ["gemini", "openai", "fallback"].includes(provider) ? provider : "gemini";
}

function normalizeImageProvider(value) {
  const provider = normalizeText(value).toLowerCase();
  return ["gemini", "modelslab", "none"].includes(provider) ? provider : "modelslab";
}

function categoryPayload(body = {}, adminId = null) {
  return {
    name: normalizeText(body.name),
    description: normalizeText(body.description),
    targetAudience: normalizeText(body.targetAudience),
    tone: ["professional", "friendly", "urgent", "sales", "informative"].includes(body.tone)
      ? body.tone
      : "professional",
    imageStyle: normalizeText(body.imageStyle),
    active: body.active !== false,
    dailyGenerationLimit: Math.max(0, Math.min(20, Number(body.dailyGenerationLimit || 1))),
    updatedByAdminId: adminId
  };
}

async function getDashboardCategoryValues() {
  const doc = await PlatformSettings.findOne().lean();
  const options = buildOptionsResponse(doc);
  return Array.isArray(options.categories) ? options.categories : [];
}

async function isDashboardCategory(value) {
  const name = normalizeText(value);
  if (!name) return false;
  const values = await getDashboardCategoryValues();
  return values.some((item) => normalizeText(item).toLowerCase() === name.toLowerCase());
}

router.get("/settings", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const settings = await getSettings();
  res.json({ settings });
});

router.put("/settings", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const body = req.body || {};
  const maxDraftsPerRun = Math.max(1, Math.min(20, Number(body.maxDraftsPerRun || 3)));
  const cronIntervalMinutes = Math.max(5, Math.min(1440, Number(body.cronIntervalMinutes || 60)));
  const autoBufferDelayMinutes = Math.max(0, Math.min(10080, Number(body.autoBufferDelayMinutes || 30)));
  const autoBufferChannelIds = Array.isArray(body.autoBufferChannelIds)
    ? body.autoBufferChannelIds.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const autoBufferMode = ["shareNow", "shareNext", "customScheduled", "addToQueue"].includes(body.autoBufferMode)
    ? body.autoBufferMode
    : "addToQueue";
  const autoBufferPostType = ["post", "story", "reel"].includes(body.autoBufferPostType)
    ? body.autoBufferPostType
    : "post";
  const blockedWords = Array.isArray(body.blockedWords)
    ? body.blockedWords.map((item) => normalizeText(item)).filter(Boolean)
    : String(body.blockedWords || "").split(",").map((item) => normalizeText(item)).filter(Boolean);
  const settings = await AiContentSettings.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        fixedCta: normalizeText(body.fixedCta) || "Learn More",
        ctaLink: normalizeText(body.ctaLink),
        aiProvider: normalizeAiProvider(body.aiProvider),
        imageProvider: normalizeImageProvider(body.imageProvider),
        generationEnabled: Boolean(body.generationEnabled),
        approvalRequired: body.approvalRequired !== false,
        autoBufferEnabled: Boolean(body.autoBufferEnabled),
        autoBufferChannelIds,
        autoBufferMode,
        autoBufferDelayMinutes,
        autoBufferPostType,
        maxDraftsPerRun,
        cronIntervalMinutes,
        brandInstructions: normalizeText(body.brandInstructions),
        blockedWords
      }
    },
    { upsert: true, new: true }
  ).lean();

  res.json({ settings });
});

router.get("/categories", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const items = await AiContentCategory.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
});

router.post("/categories", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const payload = categoryPayload(req.body, req.admin?._id || null);
  if (!payload.name) {
    return res.status(400).json({ message: "Category name is required" });
  }
  if (!(await isDashboardCategory(payload.name))) {
    return res.status(400).json({ message: "Select a category from admin dashboard options" });
  }
  payload.createdByAdminId = req.admin?._id || null;
  const category = await AiContentCategory.create(payload);
  res.status(201).json({ category });
});

router.patch("/categories/:id", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const payload = categoryPayload(req.body, req.admin?._id || null);
  if (!payload.name) {
    return res.status(400).json({ message: "Category name is required" });
  }
  if (!(await isDashboardCategory(payload.name))) {
    return res.status(400).json({ message: "Select a category from admin dashboard options" });
  }
  const category = await AiContentCategory.findByIdAndUpdate(req.params.id, payload, { new: true }).lean();
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }
  res.json({ category });
});

router.delete("/categories/:id", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const category = await AiContentCategory.findByIdAndDelete(req.params.id).lean();
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }
  res.json({ success: true });
});

router.get("/drafts", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const status = normalizeText(req.query?.status);
  const query = status ? { status } : {};
  if (["1", "true", "yes"].includes(normalizeText(req.query?.hasBuffer).toLowerCase())) {
    query["buffer.postId"] = { $ne: "" };
  }
  const limit = Math.max(1, Math.min(1000, Number(req.query?.limit || 200)));
  const items = await AiGeneratedPost.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("categoryId", "name")
    .lean();
  res.json({ items });
});

router.get("/buffer/channels", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  try {
    const result = await getBufferChannels(req.query?.organizationId);
    res.json({
      configured: Boolean(process.env.BUFFER_API_KEY),
      defaultChannelId: normalizeText(process.env.BUFFER_DEFAULT_CHANNEL_ID),
      ...result
    });
  } catch (err) {
    res.status(500).json({ message: err?.message || "Failed to load Buffer channels" });
  }
});

router.get("/campaign-runs", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const items = await AiContentCampaignRun.find()
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(50, Number(req.query?.limit || 20))))
    .lean();
  res.json({ items });
});

router.get("/campaign-runs/:id", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const run = await AiContentCampaignRun.findById(req.params.id).lean();
  if (!run) {
    return res.status(404).json({ message: "Campaign run not found" });
  }
  const drafts = await AiGeneratedPost.find({ campaignRunId: run._id })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ run, drafts });
});

router.post("/campaign-runs", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const result = await createCampaignRunDrafts({
      mood: req.body?.mood,
      postCount: req.body?.postCount,
      categoryMode: req.body?.categoryMode,
      selectedCategories: Array.isArray(req.body?.selectedCategories) ? req.body.selectedCategories : [],
      audienceMode: req.body?.audienceMode,
      imageStyle: req.body?.imageStyle,
      useAppScreenshots: Boolean(req.body?.useAppScreenshots),
      fixedCta: req.body?.fixedCta,
      ctaLink: req.body?.ctaLink,
      adminId: req.admin?._id || null,
      background: true
    });
    res.status(202).json({ success: true, result });
  } catch (err) {
    res.status(500).json({ message: err?.message || "Failed to create campaign run drafts" });
  }
});

router.patch("/drafts/:id/status", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const nextStatus = normalizeText(req.body?.status);
  if (!["draft", "approved", "rejected"].includes(nextStatus)) {
    return res.status(400).json({ message: "Unsupported draft status" });
  }

  const update = { status: nextStatus };
  if (nextStatus === "approved") {
    update.approvedAt = new Date();
    update.approvedByAdminId = req.admin?._id || null;
    update.rejectedAt = null;
    update.rejectedByAdminId = null;
  }
  if (nextStatus === "rejected") {
    update.rejectedAt = new Date();
    update.rejectedByAdminId = req.admin?._id || null;
  }

  const draft = await AiGeneratedPost.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
  if (!draft) {
    return res.status(404).json({ message: "Draft not found" });
  }
  res.json({ draft });
});

router.post("/drafts/:id/buffer", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const draft = await AiGeneratedPost.findById(req.params.id);
    if (!draft) {
      return res.status(404).json({ message: "Draft not found" });
    }

    const channelId = normalizeText(req.body?.channelId) || normalizeText(process.env.BUFFER_DEFAULT_CHANNEL_ID);
    const channelName = normalizeText(req.body?.channelName);
    const channelService = normalizeText(req.body?.channelService);
    const result = await createBufferPost({
      draft: draft.toObject(),
      channelId,
      channelService,
      postType: req.body?.postType,
      mode: req.body?.mode,
      dueAt: req.body?.dueAt,
      text: req.body?.text,
      imageUrl: req.body?.imageUrl
    });

    if (result.request.imageUrl && result.request.imageUrl !== draft.imageUrl) {
      draft.imageUrl = result.request.imageUrl;
    }
    const bufferImageAttached = Boolean(result.post.assets?.length);
    if (result.request.hasImage && !bufferImageAttached) {
      throw new Error("Buffer accepted the post text but did not attach the image. The post was not marked as sent.");
    }
    draft.status = result.request.mode === "shareNow" ? "posted" : "queued";
    draft.scheduledAt = result.post.dueAt ? new Date(result.post.dueAt) : null;
    draft.buffer = {
      postId: result.post.id,
      channelId,
      channelName,
      channelService,
      mode: result.request.mode,
      dueAt: result.post.dueAt ? new Date(result.post.dueAt) : null,
      status: result.request.mode === "shareNow" ? "posted" : "queued",
      sentAt: new Date(),
      rawResponse: result.post
    };
    draft.bufferImageAttached = bufferImageAttached;
    draft.lastError = "";
    if (result.request.hasImage && !result.post.assets?.length) {
      draft.lastError = "Buffer accepted the post but did not confirm an attached image";
    }
    await draft.save();

    res.json({ draft, bufferPost: result.post });
  } catch (err) {
    await AiGeneratedPost.findByIdAndUpdate(req.params.id, {
      status: "failed",
      lastError: err?.message || "Failed to send draft to Buffer"
    }).catch(() => {});
    res.status(500).json({ message: err?.message || "Failed to send draft to Buffer" });
  }
});

router.post("/drafts/buffer/bulk", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const draftIds = Array.isArray(req.body?.draftIds) ? req.body.draftIds.map(normalizeText).filter(Boolean) : [];
  if (!draftIds.length) {
    return res.status(400).json({ message: "Select drafts to send to Buffer" });
  }

  const results = [];
  for (const draftId of draftIds) {
    try {
      const draft = await AiGeneratedPost.findById(draftId);
      if (!draft) {
        results.push({ draftId, success: false, message: "Draft not found" });
        continue;
      }
      const channelId = normalizeText(req.body?.channelId) || normalizeText(process.env.BUFFER_DEFAULT_CHANNEL_ID);
      const result = await createBufferPost({
        draft: draft.toObject(),
        channelId,
        channelService: normalizeText(req.body?.channelService),
        postType: req.body?.postType,
        mode: req.body?.mode,
        dueAt: req.body?.dueAt,
        text: req.body?.textByDraftId?.[draftId],
        imageUrl: req.body?.imageUrlByDraftId?.[draftId]
      });
      if (result.request.imageUrl && result.request.imageUrl !== draft.imageUrl) {
        draft.imageUrl = result.request.imageUrl;
      }
      const bufferImageAttached = Boolean(result.post.assets?.length);
      if (result.request.hasImage && !bufferImageAttached) {
        throw new Error("Buffer accepted the post text but did not attach the image. The post was not marked as sent.");
      }
      draft.status = result.request.mode === "shareNow" ? "posted" : "queued";
      draft.scheduledAt = result.post.dueAt ? new Date(result.post.dueAt) : null;
      draft.buffer = {
        postId: result.post.id,
        channelId,
        channelName: normalizeText(req.body?.channelName),
        channelService: normalizeText(req.body?.channelService),
        mode: result.request.mode,
        dueAt: result.post.dueAt ? new Date(result.post.dueAt) : null,
        status: result.request.mode === "shareNow" ? "posted" : "queued",
        sentAt: new Date(),
        rawResponse: result.post
      };
      draft.bufferImageAttached = bufferImageAttached;
      draft.lastError = "";
      if (result.request.hasImage && !result.post.assets?.length) {
        draft.lastError = "Buffer accepted the post but did not confirm an attached image";
      }
      await draft.save();
      results.push({ draftId, success: true, bufferPostId: result.post.id });
    } catch (err) {
      await AiGeneratedPost.findByIdAndUpdate(draftId, {
        status: "failed",
        lastError: err?.message || "Failed to send draft to Buffer"
      }).catch(() => {});
      results.push({ draftId, success: false, message: err?.message || "Failed to send draft to Buffer" });
    }
  }

  res.json({
    results,
    successCount: results.filter((item) => item.success).length,
    failedCount: results.filter((item) => !item.success).length
  });
});

router.delete("/drafts/:id", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const draft = await AiGeneratedPost.findByIdAndDelete(req.params.id).lean();
  if (!draft) {
    return res.status(404).json({ message: "Draft not found" });
  }
  res.json({ success: true });
});

router.get("/training-notes", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const items = await AiContentTrainingNote.find()
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(100, Number(req.query?.limit || 30))))
    .lean();
  res.json({ items });
});

router.post("/training-notes", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const text = normalizeText(req.body?.text);
  if (!text) {
    return res.status(400).json({ message: "Training text is required" });
  }
  const note = await AiContentTrainingNote.create({
    text,
    createdByAdminId: req.admin?._id || null,
    updatedByAdminId: req.admin?._id || null
  });
  res.status(201).json({ note });
});

router.patch("/training-notes/:id/status", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const status = normalizeText(req.body?.status);
  if (!["stored", "sent", "archived"].includes(status)) {
    return res.status(400).json({ message: "Unsupported training note status" });
  }
  const update = {
    status,
    updatedByAdminId: req.admin?._id || null
  };
  if (status === "sent") update.sentAt = new Date();
  const note = await AiContentTrainingNote.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
  if (!note) {
    return res.status(404).json({ message: "Training note not found" });
  }
  res.json({ note });
});

router.delete("/training-notes/:id", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  const note = await AiContentTrainingNote.findByIdAndDelete(req.params.id).lean();
  if (!note) {
    return res.status(404).json({ message: "Training note not found" });
  }
  res.json({ success: true });
});

router.post("/generate/run", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const result = await processAiContentGeneration({
      force: Boolean(req.body?.force),
      limit: req.body?.limit
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ message: err?.message || "Failed to generate AI content drafts" });
  }
});

router.get("/logs", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  const items = await AiContentJobLog.find()
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(50, Number(req.query?.limit || 20))))
    .lean();
  res.json({ items });
});

module.exports = router;
