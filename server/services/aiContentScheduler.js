const AiContentCategory = require("../models/AiContentCategory");
const AiContentSettings = require("../models/AiContentSettings");
const AiGeneratedPost = require("../models/AiGeneratedPost");
const AiContentJobLog = require("../models/AiContentJobLog");
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
        lastError: generated.imageError || ""
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
  processAiContentGeneration,
  startAiContentScheduler
};
