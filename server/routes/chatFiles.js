const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const auth = require("../middleware/auth");
const ChatMessage = require("../models/ChatMessage");
const Offer = require("../models/Offer");
const Requirement = require("../models/Requirement");
const User = require("../models/User");
const Notification = require("../models/Notification");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads/chat");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const from = String(req.body?.from || req.user?._id || "user");
    const to = String(req.body?.to || "peer");
    cb(null, `${from}_${to}_${Date.now()}${ext}`);
  }
});

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".pdf",
  ".docx",
  ".xlsx"
]);

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  }
});

function parseChatFileParticipants(filename) {
  const safeName = path.basename(String(filename || ""));
  const withoutExt = safeName.replace(/\.[^/.]+$/, "");
  const [from, to] = withoutExt.split("_");
  if (!from || !to) return null;
  return { safeName, from, to };
}

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  const currentUserId = String(req.user?._id || "");
  const from = String(req.body?.from || "");
  const to = String(req.body?.to || "");
  const requirementId = String(req.body?.requirementId || "");

  if (!req.file || !from || !to || !requirementId) {
    if (req.file?.filename) {
      try {
        fs.unlinkSync(path.join(uploadDir, req.file.filename));
      } catch {
        // ignore cleanup error
      }
    }
    return res.status(400).json({ error: "Missing upload data" });
  }

  if (from !== currentUserId) {
    try {
      fs.unlinkSync(path.join(uploadDir, req.file.filename));
    } catch {
      // ignore cleanup error
    }
    return res.status(403).json({ error: "Not allowed" });
  }

  try {
    const [fromUser, toUser, requirement] = await Promise.all([
      User.findById(from),
      User.findById(to),
      Requirement.findById(requirementId)
    ]);

    if (fromUser?.chatDisabled || toUser?.chatDisabled || requirement?.chatDisabled) {
      throw new Error("Chat not allowed");
    }
    if (!requirement) {
      throw new Error("Requirement not found");
    }

    const buyerId = String(requirement.buyerId || "");
    const involvesBuyer = from === buyerId || to === buyerId;
    if (!involvesBuyer) {
      throw new Error("Not allowed");
    }

    const sellerId = from === buyerId ? to : from;
    const offer = await Offer.findOne({
      requirementId,
      sellerId,
      "moderation.removed": { $ne: true }
    }).select("contactEnabledByBuyer");

    if (!offer || offer.contactEnabledByBuyer !== true) {
      throw new Error("Chat not enabled by buyer");
    }

    const savedMessage = await ChatMessage.create({
      requirementId,
      fromUserId: from,
      toUserId: to,
      messageType: "file",
      message: req.file.originalname || "File",
      attachment: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype || "",
        size: Number(req.file.size || 0)
      }
    });

    const io = req.app.get("io");
    const payload = {
      _id: savedMessage._id,
      requirementId,
      fromUserId: from,
      toUserId: to,
      messageType: "file",
      attachment: savedMessage.attachment,
      message: savedMessage.message,
      isRead: false,
      readAt: null,
      createdAt: savedMessage.createdAt
    };

    if (io) {
      io.to(String(to)).emit("receive_message", payload);
    }

    try {
      const chatNotificationsEnabled =
        !toUser?.roles?.buyer ||
        toUser?.buyerSettings?.notificationToggles?.chat !== false;
      if (chatNotificationsEnabled) {
        const notif = await Notification.create({
          userId: to,
          fromUserId: from,
          requirementId: requirementId || null,
          type: "new_message",
          message: "New file shared in chat"
        });
        if (io) {
          io.to(String(to)).emit("notification", notif);
        }
      }
    } catch {
      // Non-blocking notification errors.
    }

    return res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      message: payload
    });
  } catch (err) {
    try {
      fs.unlinkSync(path.join(uploadDir, req.file.filename));
    } catch {
      // ignore cleanup error
    }
    return res.status(403).json({ error: err.message || "Unable to upload file" });
  }
});

router.get("/list", auth, (req, res) => {
  const { from, to } = req.query;
  const currentUserId = String(req.user?._id || "");

  if (!from || !to) {
    return res.status(400).json({ error: "Missing participants" });
  }

  if (String(from) !== currentUserId && String(to) !== currentUserId) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const files = fs
    .readdirSync(uploadDir)
    .filter((f) => f.startsWith(`${from}_${to}`) || f.startsWith(`${to}_${from}`));

  res.json(files);
});

router.get("/file/:filename", auth, (req, res) => {
  const parsed = parseChatFileParticipants(req.params.filename);
  const currentUserId = String(req.user?._id || "");
  if (!parsed) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  if (currentUserId !== parsed.from && currentUserId !== parsed.to) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const filePath = path.join(uploadDir, parsed.safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  return res.sendFile(filePath);
});

router.delete("/delete", auth, (req, res) => {
  const { filename } = req.body || {};
  const currentUserId = String(req.user?._id || "");

  if (!filename) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const parsed = parseChatFileParticipants(filename);
  if (!parsed) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  if (parsed.from !== currentUserId) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const filePath = path.join(uploadDir, parsed.safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  fs.unlinkSync(filePath);
  res.json({ success: true });
});

module.exports = router;
