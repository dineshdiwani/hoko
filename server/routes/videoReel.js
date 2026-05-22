const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const VideoReelPost = require("../models/VideoReelPost");
const { createBufferPost, getBufferChannels } = require("../utils/bufferPublisher");
const { resolvePublicAppUrl } = require("../utils/publicAppUrl");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Video file is too large. Maximum size is 200MB." });
    }
    return res.status(400).json({ message: err.message || "File upload error" });
  }
  next(err);
}

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "social-media");

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizeUploadName(originalName = "") {
  const base = path.basename(String(originalName || "video-reel"));
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_") || `video-reel-${Date.now()}`;
}

async function saveVideoUpload(file) {
  if (!file?.buffer) return null;
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = sanitizeUploadName(file.originalname);
  const storedName = `${Date.now()}-${safeName}`;
  const absolutePath = path.join(UPLOAD_DIR, storedName);
  await fs.promises.writeFile(absolutePath, file.buffer);
  return {
    mode: "file",
    filePath: absolutePath,
    fileName: storedName,
    originalName: String(file.originalname || storedName),
    mimeType: String(file.mimetype || "video/mp4"),
    size: Number(file.size || file.buffer.length || 0),
    publicUrl: `${resolvePublicAppUrl()}/api/uploads/social-media/${encodeURIComponent(storedName)}`
  };
}

router.post(
  "/upload",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
  (req, res, next) => upload.single("video")(req, res, (err) => multerErrorHandler(err, req, res, next)),
  async (req, res) => {
    try {
      const mediaMeta = await saveVideoUpload(req.file || null);
      if (!mediaMeta) {
        return res.status(400).json({ message: "No video file uploaded" });
      }
      return res.json({ success: true, url: mediaMeta.publicUrl, fileName: mediaMeta.fileName });
    } catch (err) {
      return res.status(500).json({ message: err?.message || "Failed to upload video" });
    }
  }
);

router.get("/buffer/channels", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  try {
    const result = await getBufferChannels(req.query?.organizationId);
    res.json({ channels: result.channels || [], configured: true });
  } catch (err) {
    res.json({ channels: [], configured: false, message: err.message });
  }
});

router.get("/posts", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 20) || 20));
    const items = await VideoReelPost.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ message: err?.message || "Failed to load video reel posts" });
  }
});

router.get("/posts/:id", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  try {
    const post = await VideoReelPost.findById(req.params.id).lean();
    if (!post) return res.status(404).json({ message: "Video reel post not found" });
    res.json({ post });
  } catch (err) {
    res.status(500).json({ message: err?.message || "Failed to load video reel post" });
  }
});

function conditionalMulter(req, res, next) {
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    return upload.single("mediaFile")(req, res, (err) => multerErrorHandler(err, req, res, next));
  }
  next();
}

router.post(
  "/posts",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
  conditionalMulter,
  async (req, res) => {
    try {
      const hook = normalizeText(req.body?.hook || "");
      const mediaMode = normalizeText(req.body?.mediaMode || "url").toLowerCase();
      const mediaUrl = normalizeText(req.body?.mediaUrl || "");
      const channelIds = Array.isArray(req.body?.channelIds)
        ? req.body.channelIds.map(normalizeText).filter(Boolean)
        : [];
      const scheduleAt = req.body?.scheduleAt ? new Date(req.body.scheduleAt) : null;
      const publishNow = req.body?.publishNow === "true" || req.body?.publishNow === true;

      const mediaMeta = mediaMode === "file" ? await saveVideoUpload(req.file || null) : null;

      if (!hook) {
        return res.status(400).json({ message: "Hook/caption is required" });
      }
      if (mediaMode !== "file" && !mediaUrl) {
        return res.status(400).json({ message: "Video file or URL is required" });
      }
      if (!channelIds.length) {
        return res.status(400).json({ message: "Select at least one social channel" });
      }

      const media = mediaMeta
        ? {
            mode: "file",
            filePath: mediaMeta.filePath,
            fileName: mediaMeta.fileName,
            originalName: mediaMeta.originalName,
            mimeType: mediaMeta.mimeType,
            size: mediaMeta.size,
            url: mediaMeta.publicUrl
          }
        : { mode: "url", url: mediaUrl, filePath: "", fileName: "", mimeType: "", size: 0 };

      const postDoc = await VideoReelPost.create({
        hook,
        media,
        channelIds,
        scheduleAt: scheduleAt && scheduleAt > new Date() ? scheduleAt : null,
        status: publishNow ? "processing" : (scheduleAt && scheduleAt > new Date() ? "queued" : "draft"),
        createdByAdminId: req.admin?._id || null
      });

      if (publishNow || (!scheduleAt || scheduleAt <= new Date())) {
        const results = [];
        let hasFailure = false;

        for (const channelId of channelIds) {
          try {
            const result = await createBufferPost({
              draft: {},
              channelId,
              postType: "reel",
              mode: "shareNow",
              text: hook,
              videoUrl: media.url || ""
            });
            results.push({ channelId, success: true, postId: result.post.id });
          } catch (err) {
            hasFailure = true;
            results.push({ channelId, success: false, error: err.message });
          }
        }

        postDoc.bufferResults = results;
        postDoc.status = hasFailure ? "failed" : "published";
        postDoc.publishedAt = new Date();
        postDoc.lastError = hasFailure ? "Some channels failed" : "";
        await postDoc.save();

        return res.json({
          success: true,
          mode: "published",
          post: postDoc.toObject(),
          results
        });
      }

      return res.status(201).json({
        success: true,
        mode: "queued",
        post: postDoc.toObject()
      });
    } catch (err) {
      return res.status(500).json({
        message: err?.message || "Failed to create video reel post"
      });
    }
  }
);

router.post("/posts/:id/publish", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const post = await VideoReelPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Video reel post not found" });
    if (post.status === "published") return res.status(400).json({ message: "Already published" });

    const channelIds = Array.isArray(post.channelIds) ? post.channelIds : [];
    if (!channelIds.length) return res.status(400).json({ message: "No channels selected" });

    post.status = "processing";
    await post.save();

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

    return res.json({
      success: true,
      mode: "published",
      post: post.toObject(),
      results
    });
  } catch (err) {
    try {
      await VideoReelPost.findByIdAndUpdate(req.params.id, {
        $set: { status: "failed", lastError: err?.message || "publish_failed" }
      });
    } catch {}
    return res.status(500).json({ message: err?.message || "Failed to publish video reel" });
  }
});

router.post("/posts/:id/cancel", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const post = await VideoReelPost.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!post) return res.status(404).json({ message: "Video reel post not found" });
    res.json({ success: true, post: post.toObject() });
  } catch (err) {
    res.status(500).json({ message: err?.message || "Failed to cancel video reel post" });
  }
});

router.delete("/posts/:id", adminAuth, requireAdminPermission("campaigns.manage"), async (req, res) => {
  try {
    const post = await VideoReelPost.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ message: "Video reel post not found" });
    if (post.media?.filePath) {
      fs.unlink(post.media.filePath).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err?.message || "Failed to delete video reel post" });
  }
});

module.exports = router;
