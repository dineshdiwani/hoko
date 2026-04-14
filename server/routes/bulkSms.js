const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const adminAuth = require("../middleware/adminAuth");
const { sendBulkSms } = require("../utils/sendSms");

const storage = multer.memoryStorage();
const upload = multer({ storage });

function parseMobile(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^\d+]/g, "");
  if (cleaned.length >= 10) {
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("91") && cleaned.length > 10) return "+" + cleaned;
    if (cleaned.length === 10) return "+91" + cleaned;
    return "+91" + cleaned;
  }
  return null;
}

router.post("/upload", adminAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Excel file required" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const mobiles = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const mobileCol = row[0];
      const mobile = parseMobile(mobileCol);

      if (mobile) {
        mobiles.push(mobile);
      } else if (mobileCol && String(mobileCol).trim()) {
        errors.push({ row: i + 1, value: mobileCol, reason: "Invalid format" });
      }
    }

    const uniqueMobiles = [...new Set(mobiles)];

    res.json({
      parsed: data.length - 1,
      valid: uniqueMobiles.length,
      invalid: errors.length,
      mobiles: uniqueMobiles,
      errors
    });
  } catch (err) {
    console.error("Bulk SMS upload error:", err);
    res.status(500).json({ message: "Failed to parse Excel file" });
  }
});

router.post("/send", adminAuth, async (req, res) => {
  try {
    const { mobiles, message } = req.body;

    if (!Array.isArray(mobiles) || mobiles.length === 0) {
      return res.status(400).json({ message: "Mobile numbers array required" });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ message: "Message required" });
    }

    const messageTrimmed = message.trim();
    if (messageTrimmed.length > 160) {
      return res.status(400).json({ message: "Message exceeds 160 characters" });
    }

    const results = await sendBulkSms({
      numbers: mobiles,
      message: messageTrimmed
    });

    res.json(results);
  } catch (err) {
    console.error("Bulk SMS send error:", err);
    res.status(500).json({ message: err.message || "Failed to send SMS" });
  }
});

module.exports = router;