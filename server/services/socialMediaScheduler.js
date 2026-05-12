const SocialMediaCampaign = require("../models/SocialMediaCampaign");
const { publishInstagramCampaign } = require("./socialMediaPublisher");

let schedulerStarted = false;
let schedulerIntervalId = null;
let runningSweep = false;

function toIso(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

async function publishQueuedCampaign(campaignDoc) {
  const campaign = campaignDoc?.toObject ? campaignDoc.toObject() : campaignDoc;
  if (!campaign?._id) {
    throw new Error("Missing campaign id");
  }

  try {
    const publishResult = await publishInstagramCampaign(campaign);
    await SocialMediaCampaign.findByIdAndUpdate(campaign._id, {
      $set: {
        status: "published",
        publishedAt: new Date(),
        providerPostId: String(publishResult?.postId || "").trim(),
        providerResponse: publishResult?.raw || null,
        lastError: ""
      }
    });

    return {
      ok: true,
      campaignId: String(campaign._id),
      providerPostId: String(publishResult?.postId || "").trim(),
      providerResponse: publishResult?.raw || null
    };
  } catch (err) {
    await SocialMediaCampaign.findByIdAndUpdate(campaign._id, {
      $set: {
        status: "failed",
        lastError: err?.message || "publish_failed",
        providerResponse: err?.response?.data || err?.message || null,
        lastAttemptAt: new Date()
      }
    });

    return {
      ok: false,
      campaignId: String(campaign._id),
      error: err?.message || "publish_failed"
    };
  }
}

async function processDueSocialMediaCampaigns({ limit = 5 } = {}) {
  if (runningSweep) {
    return { picked: 0, processed: 0 };
  }

  if (!SocialMediaCampaign?.db || SocialMediaCampaign.db.readyState !== 1) {
    return { picked: 0, processed: 0 };
  }

  runningSweep = true;
  try {
    let picked = 0;
    let processed = 0;
    while (picked < limit) {
      const now = new Date();
      const campaign = await SocialMediaCampaign.findOneAndUpdate(
        {
          status: "queued",
          scheduleAt: { $lte: now }
        },
        {
          $set: {
            status: "processing",
            lastAttemptAt: now
          },
          $inc: {
            attemptCount: 1
          }
        },
        {
          sort: { scheduleAt: 1, createdAt: 1 },
          new: true
        }
      );

      if (!campaign) {
        break;
      }

      picked += 1;
      const result = await publishQueuedCampaign(campaign);
      if (result.ok) {
        processed += 1;
      }
    }

    return { picked, processed };
  } finally {
    runningSweep = false;
  }
}

function startSocialMediaScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;

  const intervalMs = Number(process.env.SOCIAL_MEDIA_QUEUE_INTERVAL_MS || 60000);
  const sweep = () => {
    processDueSocialMediaCampaigns({ limit: 10 }).catch((err) => {
      console.warn("[SocialMediaScheduler] sweep failed:", err?.message || err);
    });
  };

  sweep();
  schedulerIntervalId = setInterval(sweep, intervalMs);
  if (schedulerIntervalId?.unref) {
    schedulerIntervalId.unref();
  }
  console.log(`[SocialMediaScheduler] started every ${Math.round(intervalMs / 1000)}s`);
}

module.exports = {
  processDueSocialMediaCampaigns,
  publishQueuedCampaign,
  startSocialMediaScheduler,
  toIso
};
