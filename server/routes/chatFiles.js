const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads/chat");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const { from, to } = req.body;
    const ext = path.extname(file.originalname);
    cb(null, `${from}_${to}_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// 📤 Upload file
router.post("/upload", upload.single("file"), (req, res) => {
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
  });
});

// 📄 List files
router.get("/list", (req, res) => {
  const { from, to } = req.query;

  const files = fs
    .readdirSync(uploadDir)
    .filter((f) => f.startsWith(`${from}_${to}`) || f.startsWith(`${to}_${from}`));

  res.json(files);
});

module.exports = router;

// 🗑️ Delete file (only uploader allowed)
router.delete("/delete", (req, res) => {
  const { filename, user } = req.body;

  if (!filename || !user) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // filename format: from_to_timestamp.ext
  const uploader = filename.split("_")[0];

  if (uploader !== user) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  fs.unlinkSync(filePath);
  res.json({ success: true });
});
