const AiContentCategory = require("../models/AiContentCategory");
const AiContentSettings = require("../models/AiContentSettings");
const AiGeneratedPost = require("../models/AiGeneratedPost");
const AiContentJobLog = require("../models/AiContentJobLog");
const AiContentCampaignRun = require("../models/AiContentCampaignRun");
const PlatformSettings = require("../models/PlatformSettings");
const { buildOptionsResponse } = require("../config/platformDefaults");
const { generateAiContentDraft } = require("../utils/aiContentGenerator");
const { createBufferPost, getBufferChannels } = require("../utils/bufferPublisher");

let schedulerStarted = false;
let schedulerIntervalId = null;
let running = false;

function getSchedulerIntervalMs(settings = null) {
  const minutes = Number(settings?.cronIntervalMinutes || process.env.AI_CONTENT_INTERVAL_MINUTES || 60);
  return Math.max(5, Math.min(1440, minutes)) * 60000;
}

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

function getChannelCaption(draft, service = "") {
  const cleanService = normalizeChannelService(service);
  const captions = draft?.channelCaptions || {};
  return normalizeText(captions[cleanService]) || "";
}

function normalizeChannelService(service = "") {
  const cleanService = normalizeText(service).toLowerCase();
  if (cleanService === "facebook" || cleanService.startsWith("facebook_")) return "facebook";
  if (cleanService === "instagram" || cleanService.startsWith("instagram_")) return "instagram";
  if (cleanService === "linkedin" || cleanService.startsWith("linkedin_")) return "linkedin";
  return cleanService;
}

function getTargetPlatforms(draft) {
  const allowed = new Set(["facebook", "instagram", "linkedin"]);
  const platforms = Array.isArray(draft?.targetPlatforms)
    ? draft.targetPlatforms.map((item) => normalizeText(item).toLowerCase()).filter((item) => allowed.has(item))
    : [];
  return Array.from(new Set(platforms));
}

function getPlatformSettings(settings = {}) {
  const legacyEnabled = Boolean(settings.autoBufferEnabled);
  const legacyChannelIds = Array.isArray(settings.autoBufferChannelIds)
    ? settings.autoBufferChannelIds.map(normalizeText).filter(Boolean)
    : [];
  const source = settings.autoPlatformSettings || {};
  return ["facebook", "instagram", "linkedin"].reduce((result, platform) => {
    const profile = source?.[platform] || {};
    result[platform] = {
      platform,
      enabled: Boolean(profile.enabled || legacyEnabled),
      intervalMinutes: [720, 1440, 10080].includes(Number(profile.intervalMinutes)) ? Number(profile.intervalMinutes) : 1440,
      triggerTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(normalizeText(profile.triggerTime)) ? normalizeText(profile.triggerTime) : "09:00",
      triggerDay: Math.max(0, Math.min(6, Number(profile.triggerDay ?? 1))),
      channelIds: Array.isArray(profile.channelIds) && profile.channelIds.length
        ? profile.channelIds.map(normalizeText).filter(Boolean)
        : legacyChannelIds,
      mode: normalizeText(profile.mode || settings.autoBufferMode) || "addToQueue",
      delayMinutes: Math.max(0, Math.min(10080, Number(profile.delayMinutes ?? settings.autoBufferDelayMinutes ?? 30))),
      postType: normalizeText(profile.postType || settings.autoBufferPostType) || "post",
      lastRunAt: profile.lastRunAt || null
    };
    return result;
  }, {});
}

function getTriggerParts(profile) {
  const [hourText, minuteText] = normalizeText(profile.triggerTime || "09:00").split(":");
  return {
    hour: Number(hourText),
    minute: Number(minuteText)
  };
}

function buildDailyTrigger(profile, nowDate = new Date(), offsetMinutes = 0) {
  const { hour, minute } = getTriggerParts(profile);
  const trigger = new Date(nowDate);
  trigger.setHours(hour, minute + offsetMinutes, 0, 0);
  return trigger;
}

function getLastScheduledTriggerAt(profile, nowDate = new Date()) {
  const interval = Number(profile.intervalMinutes || 1440);
  if (interval === 720) {
    const first = buildDailyTrigger(profile, nowDate, 0);
    const second = buildDailyTrigger(profile, nowDate, 720);
    const candidates = [first, second].filter((date) => date.getTime() <= nowDate.getTime());
    if (candidates.length) return candidates[candidates.length - 1];
    const yesterdaySecond = buildDailyTrigger(profile, nowDate, 720);
    yesterdaySecond.setDate(yesterdaySecond.getDate() - 1);
    return yesterdaySecond;
  }

  if (interval === 10080) {
    const trigger = buildDailyTrigger(profile, nowDate, 0);
    const targetDay = Math.max(0, Math.min(6, Number(profile.triggerDay ?? 1)));
    const daysBack = (trigger.getDay() - targetDay + 7) % 7;
    trigger.setDate(trigger.getDate() - daysBack);
    if (trigger.getTime() > nowDate.getTime()) trigger.setDate(trigger.getDate() - 7);
    return trigger;
  }

  const trigger = buildDailyTrigger(profile, nowDate, 0);
  if (trigger.getTime() > nowDate.getTime()) trigger.setDate(trigger.getDate() - 1);
  return trigger;
}

function getDuePlatformProfiles(settings = {}) {
  const profiles = getPlatformSettings(settings);
  const nowDate = new Date();
  const now = nowDate.getTime();
  return Object.values(profiles).filter((profile) => {
    if (!profile.enabled) return false;
    const lastRunAt = profile.lastRunAt ? new Date(profile.lastRunAt).getTime() : 0;
    const lastTriggerAt = getLastScheduledTriggerAt(profile, nowDate).getTime();
    if (lastTriggerAt > now) return false;
    if (!lastRunAt || Number.isNaN(lastRunAt)) return true;
    return lastRunAt < lastTriggerAt;
  });
}

async function markPlatformProfilesRun(settings = {}, profiles = []) {
  const updates = {};
  const now = new Date();
  for (const profile of profiles) {
    if (!profile?.platform) continue;
    updates[`autoPlatformSettings.${profile.platform}.lastRunAt`] = now;
  }
  if (Object.keys(updates).length) {
    await AiContentSettings.updateOne({ key: settings.key || "default" }, { $set: updates });
  }
}

async function resolveAutoBufferChannels(settings = {}) {
  const legacySelectedIds = Array.isArray(settings.autoBufferChannelIds)
    ? settings.autoBufferChannelIds.map(normalizeText).filter(Boolean)
    : [];
  const platformSelectedIds = Object.values(getPlatformSettings(settings))
    .flatMap((profile) => Array.isArray(profile.channelIds) ? profile.channelIds : [])
    .map(normalizeText)
    .filter(Boolean);
  const selectedIds = Array.from(new Set([...legacySelectedIds, ...platformSelectedIds]));
  const result = await getBufferChannels();
  const channels = Array.isArray(result.channels) ? result.channels : [];
  if (!selectedIds.length) return channels;
  const selected = new Set(selectedIds);
  return channels.filter((channel) => selected.has(normalizeText(channel.id)));
}

async function autoSendDraftToBuffer({ draft, settings, platformProfiles = null }) {
  const profiles = Array.isArray(platformProfiles) ? platformProfiles : getDuePlatformProfiles(settings);
  if (!profiles.length) return { skipped: true, reason: "no_due_auto_platforms" };
  const channels = await resolveAutoBufferChannels(settings);
  if (!channels.length) return { skipped: true, reason: "no_auto_buffer_channels" };
  const targetPlatforms = getTargetPlatforms(draft);
  const dueByPlatform = new Map(profiles.map((profile) => [profile.platform, profile]));
  const publishChannels = channels.filter((channel) => {
    const platform = normalizeChannelService(channel.service);
    const profile = dueByPlatform.get(platform);
    if (!profile) return false;
    if (targetPlatforms.length && !targetPlatforms.includes(platform)) return false;
    if (profile.channelIds.length && !profile.channelIds.includes(normalizeText(channel.id))) return false;
    return true;
  });
  if (!publishChannels.length) {
    return { skipped: true, reason: "no_matching_target_platform_channels", targetPlatforms, platforms: profiles.map((item) => item.platform) };
  }

  const results = [];
  for (const channel of publishChannels) {
    try {
      const profile = dueByPlatform.get(normalizeChannelService(channel.service)) || {};
      const mode = normalizeText(profile.mode) || "addToQueue";
      const dueAt = mode === "customScheduled"
        ? new Date(Date.now() + Math.max(0, Number(profile.delayMinutes ?? 30)) * 60000).toISOString()
        : "";
      const result = await createBufferPost({
        draft: draft.toObject ? draft.toObject() : draft,
        channelId: channel.id,
        channelName: channel.name,
        channelService: channel.service,
        postType: profile.postType || "post",
        mode,
        dueAt,
        text: getChannelCaption(draft, channel.service)
      });
      results.push({
        success: true,
        channelId: channel.id,
        channelName: channel.name,
        channelService: channel.service,
        mode,
        dueAt: result.post.dueAt || dueAt || null,
        postId: result.post.id,
        imageAttached: Boolean(result.post.assets?.length)
      });
    } catch (err) {
      results.push({
        success: false,
        channelId: channel.id,
        channelName: channel.name,
        channelService: channel.service,
        message: err?.message || "Buffer publish failed"
      });
    }
  }

  const success = results.find((item) => item.success);
  if (success) {
    const scheduledDueAt = success.dueAt ? new Date(success.dueAt) : null;
    draft.status = success.mode === "shareNow" ? "posted" : "queued";
    draft.scheduledAt = scheduledDueAt && !Number.isNaN(scheduledDueAt.getTime()) ? scheduledDueAt : new Date();
    draft.buffer = {
      postId: success.postId,
      channelId: success.channelId,
      channelName: success.channelName,
      channelService: success.channelService,
      mode: success.mode || "addToQueue",
      dueAt: scheduledDueAt && !Number.isNaN(scheduledDueAt.getTime()) ? scheduledDueAt : null,
      status: success.mode === "shareNow" ? "posted" : "queued",
      sentAt: new Date(),
      rawResponse: { automationResults: results }
    };
    draft.bufferImageAttached = Boolean(success.imageAttached);
    draft.lastError = results.some((item) => !item.success)
      ? results.filter((item) => !item.success).map((item) => `${item.channelName || item.channelService}: ${item.message}`).join("; ")
      : "";
    await draft.save();
  } else {
    draft.status = "failed";
    draft.lastError = results.map((item) => `${item.channelName || item.channelService}: ${item.message}`).join("; ") || "Auto Buffer publish failed";
    await draft.save();
  }
  return { results };
}

async function processAutoBufferQueue(settings = {}, limit = 10) {
  const platformProfiles = getDuePlatformProfiles(settings);
  if (!platformProfiles.length) return { skipped: true, reason: "no_due_auto_platforms" };
  const duePlatforms = platformProfiles.map((item) => item.platform);
  const drafts = await AiGeneratedPost.find({
    status: "approved",
    $or: [
      { "buffer.postId": "" },
      { "buffer.postId": { $exists: false } }
    ]
  })
    .sort({ approvedAt: 1, createdAt: 1 })
    .limit(Math.max(1, Math.min(25, Number(limit || 10))));
  let sent = 0;
  const failures = [];
  for (const draft of drafts) {
    const draftTargets = getTargetPlatforms(draft);
    const matchingProfiles = draftTargets.length
      ? platformProfiles.filter((profile) => draftTargets.includes(profile.platform))
      : platformProfiles;
    if (!matchingProfiles.length) continue;
    const result = await autoSendDraftToBuffer({ draft, settings, platformProfiles: matchingProfiles });
    const results = Array.isArray(result?.results) ? result.results : [];
    if (results.some((item) => item.success)) sent += 1;
    if (results.some((item) => !item.success)) failures.push(String(draft._id));
  }
  await markPlatformProfilesRun(settings, platformProfiles);
  return { picked: drafts.length, sent, failures, duePlatforms };
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
      const autoBuffer = await processAutoBufferQueue(settings, settings?.maxDraftsPerRun || 3);
      log.status = "skipped";
      log.message = settings?.autoBufferEnabled
        ? "AI content generation is paused; auto Buffer queue checked"
        : "AI content generation is paused";
      log.details = { autoBuffer };
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
        channelCaptions: generated.channelCaptions,
        hashtags: generated.hashtags,
        imagePrompt: generated.imagePrompt,
        imageTextOverlay: generated.imageTextOverlay,
        imageUrl: generated.imageUrl,
        targetPlatforms: generated.targetPlatforms,
        cta: settings.fixedCta || "Learn More",
        ctaLink: settings.ctaLink || "",
        status: settings.approvalRequired === false ? "approved" : "draft",
        generationProvider: generated.provider,
        textModel: generated.model,
        imageProvider: generated.imageProvider,
        imageModel: generated.imageModel,
        rawTextResponse: generated.raw,
        rawImageResponse: generated.rawImageResponse,
        lastError: generated.error || generated.imageError || ""
      });

      category.lastGeneratedAt = new Date();
      await category.save();
      draftIds.push(String(draft._id));
      createdDrafts += 1;
      if (draft.status === "approved" && settings.autoBufferEnabled) {
        await autoSendDraftToBuffer({ draft, settings });
      }
    }
    const autoBuffer = await processAutoBufferQueue(settings, maxDrafts);

    log.status = "completed";
    log.picked = picked;
    log.createdDrafts = createdDrafts;
    log.details = { draftIds, autoBuffer };
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
          useAppScreenshots: run.useAppScreenshots,
          brandInstructions: settings.brandInstructions,
          blockedWords: settings.blockedWords
        },
        generateImages: settings.imageProvider !== "none"
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
        channelCaptions: generated.channelCaptions,
        hashtags: generated.hashtags,
        imagePrompt: generated.imagePrompt,
        imageTextOverlay: generated.imageTextOverlay,
        imageUrl: generated.imageUrl,
        targetPlatforms: generated.targetPlatforms,
        cta: campaignSettings.fixedCta || "Learn More",
        ctaLink: campaignSettings.ctaLink || "",
        status: settings.approvalRequired === false ? "approved" : "draft",
        generationProvider: generated.provider,
        textModel: generated.model,
        imageProvider: generated.imageProvider,
        imageModel: generated.imageModel,
        rawTextResponse: generated.raw,
        rawImageResponse: generated.rawImageResponse,
        lastError: generated.error || generated.imageError || ""
      });
      if (draft.status === "approved" && settings.autoBufferEnabled) {
        await autoSendDraftToBuffer({ draft, settings });
      }
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

  const scheduleNext = async (intervalMs = getSchedulerIntervalMs()) => {
    if (schedulerIntervalId) clearTimeout(schedulerIntervalId);
    schedulerIntervalId = setTimeout(async () => {
      await sweep();
    }, intervalMs);
    if (schedulerIntervalId?.unref) schedulerIntervalId.unref();
  };

  const sweep = async () => {
    let nextIntervalMs = getSchedulerIntervalMs();
    try {
      const settings = await getSettings();
      nextIntervalMs = getSchedulerIntervalMs(settings);
      await processAiContentGeneration();
    } catch (err) {
      console.warn("[AiContentScheduler] generation failed:", err?.message || err);
    } finally {
      scheduleNext(nextIntervalMs);
    }
  };

  scheduleNext(getSchedulerIntervalMs());
  console.log("[AiContentScheduler] started");
}

module.exports = {
  getSettings,
  createCampaignRunDrafts,
  processCampaignRunById,
  processAiContentGeneration,
  startAiContentScheduler
};
