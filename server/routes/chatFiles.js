const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const auth = require("../middleware/auth");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads/chat");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const { from, to } = req.body;
    const ext = path.extname(file.originalname);
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

router.post("/upload", auth, upload.single("file"), (req, res) => {
  const currentUserId = String(req.user?._id || "");
  const from = String(req.body?.from || "");
  const to = String(req.body?.to || "");

  if (!req.file || !from || !to) {
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

  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname
  });
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
