const express = require("express");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const AiContentCategory = require("../models/AiContentCategory");
const AiContentSettings = require("../models/AiContentSettings");
const AiGeneratedPost = require("../models/AiGeneratedPost");
const AiContentJobLog = require("../models/AiContentJobLog");
const PlatformSettings = require("../models/PlatformSettings");
const { buildOptionsResponse } = require("../config/platformDefaults");
const { getSettings, processAiContentGeneration } = require("../services/aiContentScheduler");

const router = express.Router();

function normalizeText(value) {
  return String(value || "").trim();
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
  const settings = await AiContentSettings.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        fixedCta: normalizeText(body.fixedCta) || "Learn More",
        generationEnabled: Boolean(body.generationEnabled),
        approvalRequired: body.approvalRequired !== false,
        maxDraftsPerRun: Math.max(1, Math.min(20, Number(body.maxDraftsPerRun || 3))),
        cronIntervalMinutes: Math.max(5, Math.min(1440, Number(body.cronIntervalMinutes || 60))),
        brandInstructions: normalizeText(body.brandInstructions),
        blockedWords: Array.isArray(body.blockedWords)
          ? body.blockedWords.map((item) => normalizeText(item)).filter(Boolean)
          : []
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
  const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 30)));
  const items = await AiGeneratedPost.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("categoryId", "name")
    .lean();
  res.json({ items });
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
