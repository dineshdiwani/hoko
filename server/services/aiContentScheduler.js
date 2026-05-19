const AiContentCategory = require("../models/AiContentCategory");
const AiContentSettings = require("../models/AiContentSettings");
const AiGeneratedPost = require("../models/AiGeneratedPost");
const AiContentJobLog = require("../models/AiContentJobLog");
const AiContentCampaignRun = require("../models/AiContentCampaignRun");
const PlatformSettings = require("../models/PlatformSettings");
const { buildOptionsResponse } = require("../config/platformDefaults");
const { generateAiContentDraft } = require("../utils/aiContentGenerator");
const { createBufferPost, getBufferChannels } = require("../utils/bufferPublisher");
const { notifyAiContentAutoPost } = require("./adminNotifications");

let schedulerStarted = false;
let schedulerIntervalId = null;
let running = false;
let schedulerWakeRequested = false;
const AI_CONTENT_TIME_ZONE = process.env.AI_CONTENT_TIME_ZONE || "Asia/Kolkata";

function scheduleAiContentSweep(intervalMs = getSchedulerIntervalMs()) {
  if (schedulerIntervalId) clearTimeout(schedulerIntervalId);
  schedulerIntervalId = setTimeout(async () => {
    await sweepAiContentScheduler();
  }, intervalMs);
  if (schedulerIntervalId?.unref) schedulerIntervalId.unref();
}

async function sweepAiContentScheduler() {
  schedulerWakeRequested = false;
  let nextIntervalMs = getSchedulerIntervalMs();
  try {
    const settings = await getSettings();
    nextIntervalMs = getSchedulerIntervalMs(settings);
    await processAiContentGeneration();
  } catch (err) {
    console.warn("[AiContentScheduler] generation failed:", err?.message || err);
  } finally {
    if (!schedulerWakeRequested) {
      scheduleAiContentSweep(nextIntervalMs);
    }
  }
}

function wakeAiContentScheduler(settings = null, delayMs = 0) {
  if (!schedulerStarted) return;
  schedulerWakeRequested = true;
  scheduleAiContentSweep(getWakeDelayMs(settings, delayMs));
}

function getWakeDelayMs(settings = null, delayMs = 0) {
  const requestedDelay = Math.max(0, Number(delayMs || 0));
  return Math.min(getSchedulerIntervalMs(settings), requestedDelay);
}

function getSchedulerIntervalMs(settings = null) {
  const minutes = Number(settings?.cronIntervalMinutes || process.env.AI_CONTENT_INTERVAL_MINUTES || 60);
  const autoPlatformEnabled = settings?.autoBufferEnabled || Object.values(settings?.autoPlatformSettings || {}).some((profile) => profile?.enabled);
  const effectiveMinutes = autoPlatformEnabled ? Math.min(minutes, 5) : minutes;
  return Math.max(5, Math.min(1440, effectiveMinutes)) * 60000;
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
      mode: ["shareNow", "shareNext", "customScheduled", "addToQueue"].includes(normalizeText(profile.mode || settings.autoBufferMode))
        ? normalizeText(profile.mode || settings.autoBufferMode)
        : "addToQueue",
      delayMinutes: Math.max(0, Math.min(10080, Number(profile.delayMinutes ?? settings.autoBufferDelayMinutes ?? 30))),
      postType: ["post", "story", "reel"].includes(normalizeText(profile.postType || settings.autoBufferPostType))
        ? normalizeText(profile.postType || settings.autoBufferPostType)
        : "post",
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

function getTimeZoneParts(date = new Date(), timeZone = AI_CONTENT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayIndex[parts.weekday] ?? date.getUTCDay(),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getTimeZoneOffsetMs(date = new Date(), timeZone = AI_CONTENT_TIME_ZONE) {
  const parts = getTimeZoneParts(date, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

function buildZonedDate({ year, month, day, hour, minute }, timeZone = AI_CONTENT_TIME_ZONE) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - getTimeZoneOffsetMs(firstPass, timeZone));
}

function addZonedDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function buildDailyTrigger(profile, nowDate = new Date(), offsetMinutes = 0) {
  const { hour, minute } = getTriggerParts(profile);
  const nowParts = getTimeZoneParts(nowDate);
  const totalMinutes = hour * 60 + minute + offsetMinutes;
  const dayOffset = Math.floor(totalMinutes / 1440);
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const triggerDay = addZonedDays(nowParts, dayOffset);
  return buildZonedDate({
    ...triggerDay,
    hour: Math.floor(normalizedMinutes / 60),
    minute: normalizedMinutes % 60
  });
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
    const triggerParts = getTimeZoneParts(trigger);
    const daysBack = (triggerParts.weekday - targetDay + 7) % 7;
    const targetDate = addZonedDays(triggerParts, -daysBack);
    let weeklyTrigger = buildZonedDate({
      ...targetDate,
      hour: triggerParts.hour,
      minute: triggerParts.minute
    });
    if (weeklyTrigger.getTime() > nowDate.getTime()) {
      const previousWeek = addZonedDays(getTimeZoneParts(weeklyTrigger), -7);
      weeklyTrigger = buildZonedDate({
        ...previousWeek,
        hour: triggerParts.hour,
        minute: triggerParts.minute
      });
    }
    return weeklyTrigger;
  }

  const trigger = buildDailyTrigger(profile, nowDate, 0);
  if (trigger.getTime() > nowDate.getTime()) {
    const triggerParts = getTimeZoneParts(trigger);
    const previousDay = addZonedDays(triggerParts, -1);
    return buildZonedDate({
      ...previousDay,
      hour: triggerParts.hour,
      minute: triggerParts.minute
    });
  }
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

function getSuccessfulPlatformsFromResults(results = []) {
  const platforms = new Set();
  for (const item of Array.isArray(results) ? results : []) {
    if (!item?.success) continue;
    const platform = normalizeChannelService(item.channelService);
    if (platform) platforms.add(platform);
  }
  return Array.from(platforms);
}

async function notifyAutoPostTrigger(autoBuffer = {}) {
  const duePlatforms = Array.isArray(autoBuffer?.duePlatforms) ? autoBuffer.duePlatforms : [];
  if (!duePlatforms.length && !autoBuffer?.forced) return;
  if (Number(autoBuffer?.sent || 0) <= 0) return;
  await notifyAiContentAutoPost(autoBuffer).catch((err) => {
    console.warn("[AiContentScheduler] admin WhatsApp auto-post notification failed:", err?.message || err);
  });
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

function getEnabledPlatformProfiles(settings = {}) {
  return Object.values(getPlatformSettings(settings)).filter((profile) => profile.enabled);
}

async function processAutoBufferQueue(settings = {}, limit = 10, options = {}) {
  const platformProfiles = options.force ? getEnabledPlatformProfiles(settings) : getDuePlatformProfiles(settings);
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
  if (!drafts.length) {
    return {
      picked: 0,
      sent: 0,
      failures: [],
      duePlatforms,
      markedPlatforms: [],
      forced: Boolean(options.force),
      reason: "no_ready_unsent_posts"
    };
  }
  let sent = 0;
  const failures = [];
  const sentPlatforms = new Set();
  for (const draft of drafts) {
    const draftTargets = getTargetPlatforms(draft);
    const matchingProfiles = draftTargets.length
      ? platformProfiles.filter((profile) => draftTargets.includes(profile.platform))
      : platformProfiles;
    if (!matchingProfiles.length) continue;
    const result = await autoSendDraftToBuffer({ draft, settings, platformProfiles: matchingProfiles });
    const results = Array.isArray(result?.results) ? result.results : [];
    if (results.some((item) => item.success)) {
      sent += 1;
      getSuccessfulPlatformsFromResults(results).forEach((platform) => sentPlatforms.add(platform));
    }
    if (results.some((item) => !item.success)) failures.push(String(draft._id));
  }
  const sentPlatformProfiles = platformProfiles.filter((profile) => sentPlatforms.has(profile.platform));
  await markPlatformProfilesRun(settings, sentPlatformProfiles);
  return {
    picked: drafts.length,
    sent,
    failures,
    duePlatforms,
    markedPlatforms: sentPlatformProfiles.map((item) => item.platform),
    forced: Boolean(options.force)
  };
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
      await notifyAutoPostTrigger(autoBuffer);
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
        status: "approved",
        approvedAt: new Date(),
        approvedByAdminId: null,
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
      if (settings.autoBufferEnabled) {
        await autoSendDraftToBuffer({ draft, settings });
      }
    }
    const autoBuffer = await processAutoBufferQueue(settings, maxDrafts);
    await notifyAutoPostTrigger(autoBuffer);

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

async function processAiContentAutoPost({ limit, force = false } = {}) {
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
    message: "Manual auto-post check started",
    startedAt: new Date()
  });

  try {
    const settings = await getSettings();
    const autoBuffer = await processAutoBufferQueue(settings, limit || settings?.maxDraftsPerRun || 3, { force });
    await notifyAutoPostTrigger(autoBuffer);
    log.status = "completed";
    log.message = force ? "Manual forced auto-post run completed" : "Manual auto-post check completed";
    log.details = { autoBuffer };
    log.finishedAt = new Date();
    await log.save();
    return { autoBuffer };
  } catch (err) {
    log.status = "failed";
    log.message = err?.message || "ai_content_auto_post_failed";
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
        status: "approved",
        approvedAt: new Date(),
        approvedByAdminId: null,
        generationProvider: generated.provider,
        textModel: generated.model,
        imageProvider: generated.imageProvider,
        imageModel: generated.imageModel,
        rawTextResponse: generated.raw,
        rawImageResponse: generated.rawImageResponse,
        lastError: generated.error || generated.imageError || ""
      });
      if (settings.autoBufferEnabled) {
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

  scheduleAiContentSweep(Math.min(getSchedulerIntervalMs(), 5 * 60000));
  console.log("[AiContentScheduler] started");
}

module.exports = {
  getSettings,
  createCampaignRunDrafts,
  processAiContentAutoPost,
  processCampaignRunById,
  processAiContentGeneration,
  startAiContentScheduler,
  wakeAiContentScheduler,
  _private: {
    buildDailyTrigger,
    getChannelCaption,
    getDuePlatformProfiles,
    getEnabledPlatformProfiles,
    getLastScheduledTriggerAt,
    getPlatformSettings,
    getSchedulerIntervalMs,
    getSuccessfulPlatformsFromResults,
    getTimeZoneParts,
    getTargetPlatforms,
    getWakeDelayMs,
    normalizeChannelService
  }
};
