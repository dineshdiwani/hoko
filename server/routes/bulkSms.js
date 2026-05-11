const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const adminAuth = require("../middleware/adminAuth");
const { sendBulkSms } = require("../utils/sendSms");
const PlatformSettings = require("../models/PlatformSettings");

const storage = multer.memoryStorage();
const upload = multer({ storage });

function normalizeBulkTemplate(template) {
  return {
    _id: String(template?._id || "").trim(),
    name: String(template?.name || "").trim(),
    templateId: String(template?.templateId || "").trim(),
    message: String(template?.message || "").trim(),
    isActive: template?.isActive !== false
  };
}

function getBulkSmsTemplates(doc) {
  const raw = Array.isArray(doc?.bulkSmsTemplates) ? doc.bulkSmsTemplates : [];
  return raw.map(normalizeBulkTemplate).filter((template) => template.templateId || template.message);
}

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
    const { mobiles, message, templateId } = req.body;

    if (!Array.isArray(mobiles) || mobiles.length === 0) {
      return res.status(400).json({ message: "Mobile numbers array required" });
    }

    const messageTrimmed = typeof message === "string" ? message.trim() : "";
    const selectedTemplateId = String(templateId || "").trim();

    if (!messageTrimmed && !selectedTemplateId) {
      return res.status(400).json({ message: "Message required" });
    }

    let messageToSend = messageTrimmed;
    if (selectedTemplateId) {
      const doc = await PlatformSettings.findOne().lean();
      const templates = getBulkSmsTemplates(doc);
      const selectedTemplate = templates.find(
        (item) => item._id === selectedTemplateId || item.templateId === selectedTemplateId
      );
      if (!selectedTemplate) {
        return res.status(404).json({ message: "Selected template not found" });
      }
      messageToSend = String(selectedTemplate.message || "").trim();
      if (!messageToSend) {
        return res.status(400).json({ message: "Selected template has no message" });
      }
    }

    if (messageToSend.length > 200) {
      return res.status(400).json({ message: "Message exceeds 200 characters" });
    }

    const results = await sendBulkSms({
      numbers: mobiles,
      message: messageToSend,
      templateId: selectedTemplateId
    });

    res.json(results);
  } catch (err) {
    console.error("Bulk SMS send error:", err);
    res.status(500).json({ message: err.message || "Failed to send SMS" });
  }
});

router.get("/templates", adminAuth, async (req, res) => {
  try {
    const doc = await PlatformSettings.findOne().lean();
    return res.json({ templates: getBulkSmsTemplates(doc) });
  } catch (err) {
    console.error("Bulk SMS template list error:", err);
    return res.status(500).json({ message: "Failed to load bulk SMS templates" });
  }
});

router.post("/templates", adminAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const templateId = String(req.body?.templateId || "").trim();
    const message = String(req.body?.message || "").trim();
    const isActive = req.body?.isActive !== false;

    if (!templateId) {
      return res.status(400).json({ message: "templateId required" });
    }
    if (!message) {
      return res.status(400).json({ message: "message required" });
    }

    const doc = await PlatformSettings.findOne();
    const templates = getBulkSmsTemplates(doc);
    const duplicate = templates.some(
      (item) => item.templateId.toLowerCase() === templateId.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ message: "Template ID already exists" });
    }
    templates.push({
      _id: new Date().getTime().toString(36),
      name: name || templateId,
      templateId,
      message,
      isActive
    });

    const updated = await PlatformSettings.findOneAndUpdate(
      {},
      { bulkSmsTemplates: templates },
      { upsert: true, new: true }
    );

    return res.json({ templates: getBulkSmsTemplates(updated) });
  } catch (err) {
    console.error("Bulk SMS template create error:", err);
    return res.status(500).json({ message: "Failed to save bulk SMS template" });
  }
});

router.put("/templates/:id", adminAuth, async (req, res) => {
  try {
    const templateId = String(req.params.id || "").trim();
    const name = String(req.body?.name || "").trim();
    const nextTemplateId = String(req.body?.templateId || "").trim();
    const message = String(req.body?.message || "").trim();
    const isActive = req.body?.isActive !== false;

    if (!templateId) {
      return res.status(400).json({ message: "Template id required" });
    }
    if (!nextTemplateId) {
      return res.status(400).json({ message: "templateId required" });
    }
    if (!message) {
      return res.status(400).json({ message: "message required" });
    }

    const doc = await PlatformSettings.findOne().lean();
    const templates = getBulkSmsTemplates(doc);
    const index = templates.findIndex((item) => item._id === templateId);
    if (index < 0) {
      return res.status(404).json({ message: "Template not found" });
    }
    const duplicate = templates.some(
      (item) =>
        item._id !== templateId &&
        item.templateId.toLowerCase() === nextTemplateId.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ message: "Template ID already exists" });
    }

    templates[index] = {
      ...templates[index],
      name: name || nextTemplateId,
      templateId: nextTemplateId,
      message,
      isActive
    };

    const updated = await PlatformSettings.findOneAndUpdate(
      {},
      { bulkSmsTemplates: templates },
      { upsert: true, new: true }
    );

    return res.json({ templates: getBulkSmsTemplates(updated) });
  } catch (err) {
    console.error("Bulk SMS template update error:", err);
    return res.status(500).json({ message: "Failed to update bulk SMS template" });
  }
});

router.delete("/templates/:id", adminAuth, async (req, res) => {
  try {
    const templateId = String(req.params.id || "").trim();
    if (!templateId) {
      return res.status(400).json({ message: "Template id required" });
    }

    const doc = await PlatformSettings.findOne().lean();
    const templates = getBulkSmsTemplates(doc);
    const nextTemplates = templates.filter((item) => item._id !== templateId);

    const updated = await PlatformSettings.findOneAndUpdate(
      {},
      { bulkSmsTemplates: nextTemplates },
      { upsert: true, new: true }
    );

    return res.json({ templates: getBulkSmsTemplates(updated) });
  } catch (err) {
    console.error("Bulk SMS template delete error:", err);
    return res.status(500).json({ message: "Failed to delete bulk SMS template" });
  }
});

module.exports = router;
