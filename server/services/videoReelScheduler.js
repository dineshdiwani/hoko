const VideoReelPost = require("../models/VideoReelPost");
const { createBufferPost } = require("../utils/bufferPublisher");

async function processVideoReelScheduler() {
  const duePosts = await VideoReelPost.find({
    status: "queued",
    scheduleAt: { $lte: new Date() }
  }).limit(10);

  for (const post of duePosts) {
    try {
      post.status = "processing";
      await post.save();

      const channelIds = Array.isArray(post.channelIds) ? post.channelIds : [];
      if (!channelIds.length) {
        post.status = "cancelled";
        post.lastError = "No channels selected";
        await post.save();
        continue;
      }

      const results = [];
      let hasFailure = false;

      for (const channelId of channelIds) {
        try {
          const result = await createBufferPost({
            draft: {},
            channelId,
            postType: "reel",
            mode: "shareNow",
            text: post.hook || "",
            videoUrl: post.media?.url || ""
          });
          results.push({ channelId, success: true, postId: result.post.id });
        } catch (err) {
          hasFailure = true;
          results.push({ channelId, success: false, error: err.message });
        }
      }

      post.bufferResults = results;
      post.status = hasFailure ? "failed" : "published";
      post.publishedAt = new Date();
      post.lastError = hasFailure ? "Some channels failed" : "";
      await post.save();
    } catch (err) {
      try {
        post.status = "failed";
        post.lastError = err.message || "scheduler_error";
        await post.save();
      } catch {}
    }
  }

  return duePosts.length;
}

function startVideoReelScheduler() {
  const INTERVAL = 60000;
  const timer = setInterval(() => {
    processVideoReelScheduler().catch((err) => {
      console.error("Video reel scheduler error:", err.message);
    });
  }, INTERVAL);
  return timer;
}

module.exports = { processVideoReelScheduler, startVideoReelScheduler };
