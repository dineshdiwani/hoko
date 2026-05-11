const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const { normalizeE164, sendViaGupshupTemplate } = require("../utils/sendWhatsApp");

function normalizeBulkTemplate(template) {
  return {
    _id: String(template?._id || "").trim(),
    key: String(template?.key || "").trim(),
    templateId: String(template?.templateId || "").trim(),
    templateName: String(template?.templateName || "").trim(),
    message: String(template?.message || "").trim(),
    language: String(template?.language || "en").trim(),
    category: String(template?.category || "UTILITY").trim(),
    status: String(template?.status || "PENDING").trim(),
    isActive: template?.isActive !== false
  };
}

function buildTemplateKey(templateName, templateId) {
  const base = String(templateName || templateId || "bulk-wa").trim().toLowerCase();
  const normalized = base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = String(templateId || "").trim().slice(-8).toLowerCase();
  return `${normalized || "bulk-wa"}${suffix ? `-${suffix}` : ""}`;
}

function normalizeProviderResponse(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  return value;
}

async function sendAndLogBulkWhatsApp({
  mobileE164,
  templateConfig,
  parameters,
  buttonUrl,
  providerType,
  createdByAdminId
}) {
  const normalizedMobile = normalizeE164(mobileE164);
  if (!normalizedMobile) {
    return {
      status: "failed",
      reason: "invalid_mobile",
      providerMessageId: "",
      providerResponse: null
    };
  }

  if (providerType !== "gupshup") {
    return {
      status: "failed",
      reason: "unsupported_provider",
      providerMessageId: "",
      providerResponse: null
    };
  }

  try {
    const providerResult = await sendViaGupshupTemplate({
      to: normalizedMobile,
      templateId: templateConfig.templateId,
      templateName: templateConfig.templateName,
      languageCode: templateConfig.language || "en",
      parameters,
      buttonUrl
    });

    const providerResponse = normalizeProviderResponse(providerResult?.raw || null);
    const providerMessageId = String(providerResult?.providerMessageId || "").trim();

    await WhatsAppDeliveryLog.create({
      requirementId: null,
      campaignRunId: null,
      triggerType: "template_send",
      channel: "whatsapp",
      mobileE164: normalizedMobile,
      email: "",
      status: "accepted",
      reason: "",
      provider: "gupshup",
      providerMessageId,
      providerResponse,
      city: "",
      category: "",
      product: `Template: ${templateConfig.templateName || templateConfig.templateId}`,
      createdByAdminId: createdByAdminId || null
    });

    return {
      status: "accepted",
      reason: "",
      providerMessageId,
      providerResponse
    };
  } catch (err) {
    const providerResponse = normalizeProviderResponse(err?.response?.data || err?.message || null);
    const reason =
      typeof err?.message === "string" && err.message.trim()
        ? err.message.trim()
        : typeof err?.response?.data?.message === "string" && err.response.data.message.trim()
        ? err.response.data.message.trim()
        : "send_failed";

    await WhatsAppDeliveryLog.create({
      requirementId: null,
      campaignRunId: null,
      triggerType: "template_send",
      channel: "whatsapp",
      mobileE164: normalizedMobile,
      email: "",
      status: "failed",
      reason,
      provider: "gupshup",
      providerMessageId: "",
      providerResponse,
      city: "",
      category: "",
      product: `Template: ${templateConfig.templateName || templateConfig.templateId}`,
      createdByAdminId: createdByAdminId || null
    });

    return {
      status: "failed",
      reason,
      providerMessageId: "",
      providerResponse
    };
  }
}

router.post("/send", adminAuth, async (req, res) => {
  try {
    const { phones, templateId, templateKey, parameters = [], buttonUrl, provider } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ message: "phones array required" });
    }

    let templateConfig = null;

    if (templateKey) {
      templateConfig = await WhatsAppTemplateRegistry.findOne({ key: templateKey, isActive: true }).lean();
    } else if (templateId) {
      templateConfig = await WhatsAppTemplateRegistry.findOne({ templateId: templateId, isActive: true }).lean();
    }

    if (!templateConfig) {
      return res.status(400).json({ message: "Template not found. Provide templateKey or templateId" });
    }

    const providerType = String(provider || "gupshup").trim().toLowerCase();
    const results = { accepted: [], failed: [], total: phones.length };

    for (const phone of phones) {
      const normalized = String(phone).replace(/[^\d+]/g, "");
      const mobileE164 = normalized.startsWith("+") ? normalized : `+${normalized}`;
      const sendResult = await sendAndLogBulkWhatsApp({
        mobileE164,
        templateConfig,
        parameters: [...parameters],
        buttonUrl,
        providerType,
        createdByAdminId: req.admin?._id || null
      });

      if (sendResult.status === "accepted") {
        results.accepted.push({
          phone: mobileE164,
          providerMessageId: sendResult.providerMessageId || "",
          providerResponse: sendResult.providerResponse || null
        });
      } else {
        results.failed.push({
          phone: mobileE164,
          error: sendResult.reason || "send_failed",
          providerResponse: sendResult.providerResponse || null
        });
      }
    }

    console.log(`[Bulk WhatsApp] Accepted: ${results.accepted.length}, Failed: ${results.failed.length}`);
    res.json(results);
  } catch (err) {
    console.log("[Bulk WhatsApp] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/send-city", adminAuth, async (req, res) => {
  try {
    const { city, templateKey, templateId, parameters = [], buttonUrl, provider, limit, category } = req.body;

    if (!city) {
      return res.status(400).json({ message: "city required" });
    }

    let templateConfig = null;

    if (templateKey) {
      templateConfig = await WhatsAppTemplateRegistry.findOne({ key: templateKey, isActive: true }).lean();
    } else if (templateId) {
      templateConfig = await WhatsAppTemplateRegistry.findOne({ templateId: templateId, isActive: true }).lean();
    }

    if (!templateConfig) {
      return res.status(400).json({ message: "Template not found" });
    }

    if (!templateConfig.templateId) {
      console.log("[BulkWhatsApp] WARNING: Template has no templateId:", templateConfig);
      return res.status(400).json({ message: "Template missing templateId (UUID)" });
    }

    const query = {
      city: city,
      optInStatus: "opted_in"
    };

    if (category) {
      query.categories = { $regex: new RegExp(category, "i") };
    }

    const sellers = await WhatsAppContact.find(query)
      .select("mobileE164 name")
      .limit(Number(limit) || 100);

    const providerType = String(provider || "gupshup").trim().toLowerCase();
    const results = { accepted: [], failed: [], total: sellers.length };

    console.log(`[BulkWhatsApp City] Template: ${templateConfig.templateName}, templateId: ${templateConfig.templateId}, sellers found: ${sellers.length}, query:`, query);

    const allCities = await WhatsAppContact.distinct("city", { optInStatus: "opted_in", active: { $ne: false } });
    console.log("[BulkWhatsApp] All opted-in cities:", allCities);

    if (sellers.length === 0) {
      return res.json({ message: "No opted-in sellers found for this city/category", accepted: [], failed: [], total: 0 });
    }

    for (const seller of sellers) {
      const mobileE164 = seller.mobileE164;
      const sendResult = await sendAndLogBulkWhatsApp({
        mobileE164,
        templateConfig,
        parameters,
        buttonUrl,
        providerType,
        createdByAdminId: req.admin?._id || null
      });

      if (sendResult.status === "accepted") {
        results.accepted.push({
          phone: mobileE164,
          providerMessageId: sendResult.providerMessageId || "",
          providerResponse: sendResult.providerResponse || null
        });
      } else {
        results.failed.push({
          phone: mobileE164,
          error: sendResult.reason || "send_failed",
          providerResponse: sendResult.providerResponse || null
        });
      }
    }

    console.log(`[BulkWhatsApp City] Accepted: ${results.accepted.length}, Failed: ${results.failed.length}, City: ${city}`);
    res.json(results);
  } catch (err) {
    console.log("[BulkWhatsApp City] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/templates", adminAuth, async (req, res) => {
  try {
    const includeInactive = String(req.query?.includeInactive || "").trim().toLowerCase() === "true";
    const query = includeInactive ? {} : { isActive: true };
    const templates = await WhatsAppTemplateRegistry.find(query)
      .select("key templateId templateName message language category status isActive")
      .lean();
    res.json({ templates: templates.map(normalizeBulkTemplate) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/templates", adminAuth, async (req, res) => {
  try {
    const templateName = String(req.body?.templateName || req.body?.name || "").trim();
    const templateId = String(req.body?.templateId || "").trim();
    const message = String(req.body?.message || "").trim();
    const language = String(req.body?.language || "en").trim();
    const category = String(req.body?.category || "UTILITY").trim();
    const status = String(req.body?.status || "PENDING").trim();
    const isActive = req.body?.isActive !== false;
    const key = String(req.body?.key || "").trim() || buildTemplateKey(templateName, templateId);

    if (!templateName) {
      return res.status(400).json({ message: "templateName required" });
    }
    if (!templateId) {
      return res.status(400).json({ message: "templateId required" });
    }

    const duplicate = await WhatsAppTemplateRegistry.findOne({
      $or: [{ key }, { templateId }]
    }).lean();
    if (duplicate) {
      return res.status(409).json({ message: "Template already exists" });
    }

    const created = await WhatsAppTemplateRegistry.create({
      key,
      templateName,
      templateId,
      message,
      language,
      category,
      status,
      isActive
    });

    return res.json({ template: normalizeBulkTemplate(created.toObject()) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/templates/:id", adminAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const templateName = String(req.body?.templateName || req.body?.name || "").trim();
    const templateId = String(req.body?.templateId || "").trim();
    const message = String(req.body?.message || "").trim();
    const language = String(req.body?.language || "en").trim();
    const category = String(req.body?.category || "UTILITY").trim();
    const status = String(req.body?.status || "PENDING").trim();
    const isActive = req.body?.isActive !== false;

    if (!id) {
      return res.status(400).json({ message: "Template id required" });
    }
    if (!templateName) {
      return res.status(400).json({ message: "templateName required" });
    }
    if (!templateId) {
      return res.status(400).json({ message: "templateId required" });
    }

    const existing = await WhatsAppTemplateRegistry.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Template not found" });
    }

    const duplicate = await WhatsAppTemplateRegistry.findOne({
      _id: { $ne: id },
      $or: [{ key: existing.key }, { templateId }]
    }).lean();
    if (duplicate) {
      return res.status(409).json({ message: "Template already exists" });
    }

    existing.templateName = templateName;
    existing.templateId = templateId;
    existing.message = message;
    existing.language = language;
    existing.category = category;
    existing.status = status;
    existing.isActive = isActive;
    existing.key = existing.key || buildTemplateKey(templateName, templateId);
    await existing.save();

    return res.json({ template: normalizeBulkTemplate(existing.toObject()) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/templates/:id", adminAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ message: "Template id required" });
    }
    const deleted = await WhatsAppTemplateRegistry.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Template not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
