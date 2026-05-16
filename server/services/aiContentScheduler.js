const AiContentCategory = require("../models/AiContentCategory");
const AiContentSettings = require("../models/AiContentSettings");
const AiGeneratedPost = require("../models/AiGeneratedPost");
const AiContentJobLog = require("../models/AiContentJobLog");
const AiContentCampaignRun = require("../models/AiContentCampaignRun");
const PlatformSettings = require("../models/PlatformSettings");
const { buildOptionsResponse } = require("../config/platformDefaults");
const { generateAiContentDraft } = require("../utils/aiContentGenerator");

let schedulerStarted = false;
let schedulerIntervalId = null;
let running = false;

async function getSettings() {
  return AiContentSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true }
  ).lean();
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getTodaysDraftCount(categoryId) {
  return AiGeneratedPost.countDocuments({
    categoryId,
    createdAt: { $gte: startOfToday() }
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function getDashboardCategories() {
  const doc = await PlatformSettings.findOne().lean();
  const options = buildOptionsResponse(doc);
  return Array.isArray(options.categories) ? options.categories.filter(Boolean) : [];
}

function pickCategories(values, count) {
  const unique = Array.from(new Set(values.map((item) => normalizeText(item)).filter(Boolean)));
  const shuffled = unique
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
  return shuffled.slice(0, Math.max(1, Math.min(count, shuffled.length)));
}

async function ensureAiContentCategory(name, extra = {}) {
  const cleanName = normalizeText(name);
  const existing = await AiContentCategory.findOne({
    name: { $regex: `^\\s*${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, $options: "i" }
  });
  if (existing) return existing;

  return AiContentCategory.create({
    name: cleanName,
    description: normalizeText(extra.description),
    targetAudience: normalizeText(extra.targetAudience),
    tone: "professional",
    imageStyle: normalizeText(extra.imageStyle),
    active: true,
    dailyGenerationLimit: 1,
    createdByAdminId: extra.adminId || null,
    updatedByAdminId: extra.adminId || null
  });
}

async function processAiContentGeneration({ force = false, limit } = {}) {
  if (running) {
    return { skipped: true, reason: "generation_already_running" };
  }
  if (!AiContentCategory?.db || AiContentCategory.db.readyState !== 1) {
    return { skipped: true, reason: "database_not_ready" };
  }

  running = true;
  const log = await AiContentJobLog.create({
    type: "generate_drafts",
    status: "started",
    startedAt: new Date()
  });

  try {
    const settings = await getSettings();
    if (!force && !settings?.generationEnabled) {
      log.status = "skipped";
      log.message = "AI content generation is paused";
      log.finishedAt = new Date();
      await log.save();
      return { skipped: true, reason: "generation_paused" };
    }

    const maxDrafts = Math.max(1, Math.min(20, Number(limit || settings?.maxDraftsPerRun || 3)));
    const categories = await AiContentCategory.find({ active: true })
      .sort({ lastGeneratedAt: 1, createdAt: 1 })
      .limit(maxDrafts * 3);

    let picked = 0;
    let createdDrafts = 0;
    const draftIds = [];

    for (const category of categories) {
      if (createdDrafts >= maxDrafts) break;
      const dailyLimit = Math.max(0, Number(category.dailyGenerationLimit || 0));
      if (!dailyLimit) continue;

      const todaysCount = await getTodaysDraftCount(category._id);
      if (!force && todaysCount >= dailyLimit) continue;

      picked += 1;
      const generated = await generateAiContentDraft({ category: category.toObject(), settings });
      const draft = await AiGeneratedPost.create({
        categoryId: category._id,
        categorySnapshot: {
          name: category.name,
          description: category.description,
          targetAudience: category.targetAudience,
          tone: category.tone,
          imageStyle: category.imageStyle
        },
        topic: generated.topic,
        hook: generated.hook,
        caption: generated.caption,
        hashtags: generated.hashtags,
        imagePrompt: generated.imagePrompt,
        imageUrl: generated.imageUrl,
        cta: settings.fixedCta || "Learn More",
        ctaLink: settings.ctaLink || "",
        status: settings.approvalRequired === false ? "approved" : "draft",
        generationProvider: generated.provider,
        textModel: generated.model,
        imageModel: generated.imageModel,
        rawTextResponse: generated.raw,
        rawImageResponse: generated.rawImageResponse,
        lastError: generated.error || generated.imageError || ""
      });

      category.lastGeneratedAt = new Date();
      await category.save();
      draftIds.push(String(draft._id));
      createdDrafts += 1;
    }

    log.status = "completed";
    log.picked = picked;
    log.createdDrafts = createdDrafts;
    log.details = { draftIds };
    log.finishedAt = new Date();
    await log.save();

    return { picked, createdDrafts, draftIds };
  } catch (err) {
    log.status = "failed";
    log.message = err?.message || "ai_content_generation_failed";
    log.details = err?.response?.data || null;
    log.finishedAt = new Date();
    await log.save();
    throw err;
  } finally {
    running = false;
  }
}

async function createCampaignRunDrafts({
  mood,
  postCount = 3,
  categoryMode = "auto",
  selectedCategories = [],
  audienceMode = "auto",
  imageStyle = "auto",
  useAppScreenshots = false,
  fixedCta = "",
  ctaLink = "",
  adminId = null,
  background = false
} = {}) {
  const cleanMood = normalizeText(mood);
  if (!cleanMood) {
    throw new Error("Campaign mood is required");
  }

  const settings = await getSettings();
  const count = Math.max(1, Math.min(5, Number(postCount || 3)));
  const dashboardCategories = await getDashboardCategories();
  const sourceCategories = categoryMode === "selected" && selectedCategories.length
    ? selectedCategories
    : dashboardCategories;
  const pickedCategories = pickCategories(sourceCategories, count);
  if (!pickedCategories.length) {
    throw new Error("No categories available for campaign generation");
  }

  const run = await AiContentCampaignRun.create({
    mood: cleanMood,
    postCount: count,
    audienceMode,
    categoryMode,
    selectedCategories: pickedCategories,
    imageStyle,
    useAppScreenshots: Boolean(useAppScreenshots),
    fixedCta: normalizeText(fixedCta) || settings.fixedCta || "Learn More",
    ctaLink: normalizeText(ctaLink) || settings.ctaLink || "",
    createdByAdminId: adminId
  });

  if (background) {
    setImmediate(() => {
      processCampaignRunById(run._id).catch((err) => {
        console.warn("[AiContentCampaignRun] background failed:", err?.message || err);
      });
    });
    return { runId: String(run._id), accepted: true, status: "running" };
  }

  return processCampaignRunById(run._id);
}

async function processCampaignRunById(runId) {
  const run = await AiContentCampaignRun.findById(runId);
  if (!run) {
    throw new Error("Campaign run not found");
  }
  if (run.status !== "running") {
    return {
      runId: String(run._id),
      createdDrafts: Array.isArray(run.draftIds) ? run.draftIds.length : 0,
      status: run.status
    };
  }

  try {
    const settings = await getSettings();
    const count = Math.max(1, Math.min(5, Number(run.postCount || 3)));
    const categories = Array.isArray(run.selectedCategories) && run.selectedCategories.length
      ? run.selectedCategories
      : pickCategories(await getDashboardCategories(), count);
    const draftIds = [];

    for (let index = 0; index < count; index += 1) {
      const categoryName = categories[index % categories.length];
      const category = await ensureAiContentCategory(categoryName, {
        description: `Auto-selected for campaign: ${run.mood}`,
        targetAudience: run.audienceMode === "auto" ? "" : run.audienceMode,
        imageStyle: run.imageStyle === "auto" ? "" : run.imageStyle,
        adminId: run.createdByAdminId || null
      });

      const campaignSettings = {
        ...settings,
        fixedCta: run.fixedCta || settings.fixedCta,
        ctaLink: run.ctaLink || settings.ctaLink
      };
      const generated = await generateAiContentDraft({
        category: category.toObject(),
        settings: campaignSettings,
        campaign: {
          mood: run.mood,
          audienceMode: run.audienceMode,
          imageStyle: run.imageStyle,
          useAppScreenshots: run.useAppScreenshots
        }
      });

      const draft = await AiGeneratedPost.create({
        categoryId: category._id,
        campaignRunId: run._id,
        categorySnapshot: {
          name: category.name,
          description: category.description,
          targetAudience: category.targetAudience,
          tone: category.tone,
          imageStyle: category.imageStyle
        },
        topic: generated.topic,
        hook: generated.hook,
        caption: generated.caption,
        hashtags: generated.hashtags,
        imagePrompt: generated.imagePrompt,
        imageUrl: generated.imageUrl,
        cta: campaignSettings.fixedCta || "Learn More",
        ctaLink: campaignSettings.ctaLink || "",
        status: settings.approvalRequired === false ? "approved" : "draft",
        generationProvider: generated.provider,
        textModel: generated.model,
        imageModel: generated.imageModel,
        rawTextResponse: generated.raw,
        rawImageResponse: generated.rawImageResponse,
        lastError: generated.error || generated.imageError || ""
      });
      draftIds.push(draft._id);
      run.draftIds = draftIds;
      run.progress = Math.min(95, Math.round((draftIds.length / count) * 100));
      await run.save();
    }

    if (!draftIds.length) {
      throw new Error("No drafts were generated for this campaign run");
    }

    run.status = "completed";
    run.progress = 100;
    run.draftIds = draftIds;
    await run.save();
    return { runId: String(run._id), createdDrafts: draftIds.length, draftIds: draftIds.map(String), status: run.status };
  } catch (err) {
    run.status = "failed";
    run.progress = 100;
    run.lastError = err?.message || "campaign_generation_failed";
    await run.save();
    throw err;
  }
}

function startAiContentScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = Math.max(5, Number(process.env.AI_CONTENT_INTERVAL_MINUTES || 60)) * 60000;
  const sweep = () => {
    processAiContentGeneration().catch((err) => {
      console.warn("[AiContentScheduler] generation failed:", err?.message || err);
    });
  };

  schedulerIntervalId = setInterval(sweep, intervalMs);
  if (schedulerIntervalId?.unref) schedulerIntervalId.unref();
  console.log(`[AiContentScheduler] started every ${Math.round(intervalMs / 60000)}m`);
}

module.exports = {
  getSettings,
  createCampaignRunDrafts,
  processCampaignRunById,
  processAiContentGeneration,
  startAiContentScheduler
};
