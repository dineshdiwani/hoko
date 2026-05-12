const express = require("express");
const multer = require("multer");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const {
  getMetaConfigStatus,
  postMetaCampaign,
  resolveMetaPageId
} = require("../utils/metaPublisher");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

router.get("/meta/status", adminAuth, requireAdminPermission("campaigns.read"), async (req, res) => {
  res.json({
    platform: "meta",
    ...getMetaConfigStatus()
  });
});

router.post(
  "/meta/post",
  adminAuth,
  requireAdminPermission("campaigns.manage"),
  upload.single("mediaFile"),
  async (req, res) => {
    try {
      const pageId = String(req.body?.pageId || "").trim() || resolveMetaPageId();
      const message = String(req.body?.message || "").trim();
      const link = String(req.body?.link || "").trim();
      const mediaUrl = String(req.body?.mediaUrl || "").trim();
      const mediaMode = String(req.body?.mediaMode || "").trim().toLowerCase();
      const explicitFile = req.file?.buffer ? req.file : null;
      const mediaFile = mediaMode === "file" ? explicitFile : null;

      if (!message && !link && !mediaUrl && !mediaFile) {
        return res.status(400).json({ message: "Message, link, or media is required" });
      }
      if (mediaMode === "url" && !mediaUrl) {
        return res.status(400).json({ message: "Media URL is required for image URL mode" });
      }
      if (mediaMode === "file" && !mediaFile) {
        return res.status(400).json({ message: "Media file is required for upload mode" });
      }

      const result = await postMetaCampaign({
        pageId,
        message,
        link,
        mediaUrl,
        mediaFile
      });

      return res.json({
        success: true,
        platform: "meta",
        pageId,
        postId: result.postId || "",
        raw: result.raw || null
      });
    } catch (err) {
      return res.status(500).json({
        message: err?.message || "Failed to post Meta campaign"
      });
    }
  }
);

module.exports = router;
