const crypto = require("crypto");
const express = require("express");
const XLSX = require("xlsx");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const { normalizeE164, sendViaGupshupTemplate } = require("../utils/sendWhatsApp");

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
  createdByAdminId,
  batchId
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
      buttonUrl,
      templateConfig
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
      batchId: String(batchId || "").trim(),
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
      batchId: String(batchId || "").trim(),
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
    const { phones, templateConfigId, templateId, templateKey, parameters = [], buttonUrl, provider } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ message: "phones array required" });
    }

    const selectedTemplateConfigId = String(templateConfigId || "").trim();
    const selectedTemplateId = String(templateId || "").trim();
    let templateConfig = null;
    if (selectedTemplateConfigId) {
      templateConfig = await WhatsAppTemplateRegistry.findById(selectedTemplateConfigId).lean();
    }
    if (!templateConfig && selectedTemplateId) {
      templateConfig = await WhatsAppTemplateRegistry.findOne({
        $or: [
          { _id: selectedTemplateId },
          { templateId: selectedTemplateId }
        ]
      }).lean();
    }

    if (!templateConfig) {
      return res.status(400).json({ message: "Template not found in WhatsApp registry" });
    }
    if (!templateConfig.templateId) {
      return res.status(400).json({ message: "Selected template has no Gupshup templateId" });
    }
    if (templateConfig.status && !["APPROVED", "ACTIVE", "ENABLED"].includes(String(templateConfig.status).toUpperCase())) {
      return res.status(400).json({ message: "Template is not approved in the registry" });
    }

    const providerType = String(provider || "gupshup").trim().toLowerCase();
    const batchId = crypto.randomUUID();
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
        createdByAdminId: req.admin?._id || null,
        batchId
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

    console.log(`[Bulk WhatsApp] Batch ${batchId} Accepted: ${results.accepted.length}, Failed: ${results.failed.length}`);
    res.json({ ...results, batchId });
  } catch (err) {
    console.log("[Bulk WhatsApp] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/send-city", adminAuth, async (req, res) => {
  try {
    const { city, templateConfigId, templateId, templateKey, parameters = [], buttonUrl, provider, limit, category } = req.body;

    if (!city) {
      return res.status(400).json({ message: "city required" });
    }

    const selectedTemplateConfigId = String(templateConfigId || "").trim();
    const selectedTemplateId = String(templateId || "").trim();
    let templateConfig = null;
    if (selectedTemplateConfigId) {
      templateConfig = await WhatsAppTemplateRegistry.findById(selectedTemplateConfigId).lean();
    }
    if (!templateConfig && selectedTemplateId) {
      templateConfig = await WhatsAppTemplateRegistry.findOne({
        $or: [
          { _id: selectedTemplateId },
          { templateId: selectedTemplateId }
        ]
      }).lean();
    }

    if (!templateConfig) {
      return res.status(400).json({ message: "Template not found in WhatsApp registry" });
    }
    if (!templateConfig.templateId) {
      return res.status(400).json({ message: "Selected template has no Gupshup templateId" });
    }
    if (templateConfig.status && !["APPROVED", "ACTIVE", "ENABLED"].includes(String(templateConfig.status).toUpperCase())) {
      return res.status(400).json({ message: "Template is not approved in the registry" });
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
    const batchId = crypto.randomUUID();
    const results = { accepted: [], failed: [], total: sellers.length };

    console.log(`[BulkWhatsApp City] Template: ${templateConfig.templateName || templateConfig.key}, templateId: ${templateConfig.templateId}, sellers found: ${sellers.length}, query:`, query);

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
        createdByAdminId: req.admin?._id || null,
        batchId
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

    console.log(`[BulkWhatsApp City] Batch ${batchId} Accepted: ${results.accepted.length}, Failed: ${results.failed.length}, City: ${city}`);
    res.json({ ...results, batchId });
  } catch (err) {
    console.log("[BulkWhatsApp City] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/export-annotated-sheet", adminAuth, async (req, res) => {
  try {
    const phones = Array.isArray(req.body?.phones) ? req.body.phones : [];
    if (!phones.length) {
      return res.status(400).json({ message: "phones array required" });
    }

    const normalizedPhones = [...new Set(
      phones
        .map((phone) => normalizeE164(phone))
        .filter(Boolean)
    )];

    if (!normalizedPhones.length) {
      return res.status(400).json({ message: "No valid phone numbers found" });
    }

    const logs = await WhatsAppDeliveryLog.find({
      channel: "whatsapp",
      mobileE164: { $in: normalizedPhones }
    })
      .sort({ mobileE164: 1, createdAt: 1 })
      .lean();

    const logsByMobile = new Map();
    for (const log of logs) {
      const key = String(log.mobileE164 || "").trim();
      if (!key) continue;
      const rows = logsByMobile.get(key) || [];
      rows.push(log);
      logsByMobile.set(key, rows);
    }

    const maxAttempts = Math.max(
      1,
      ...normalizedPhones.map((mobile) => (logsByMobile.get(mobile)?.length || 0))
    );

    const header = ["Mobile Number"];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      header.push(
        `Attempt ${attempt} Status`,
        `Attempt ${attempt} Time`,
        `Attempt ${attempt} Reason`,
        `Attempt ${attempt} Provider ID`,
        `Attempt ${attempt} Batch ID`
      );
    }

    const rows = [header];
    for (const mobile of normalizedPhones) {
      const attempts = logsByMobile.get(mobile) || [];
      const row = [mobile];

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const log = attempts[attempt] || null;
        row.push(
          log ? String(log.status || "").trim() || "-" : "-",
          log?.createdAt ? new Date(log.createdAt).toISOString() : "-",
          log ? String(log.reason || "").trim() || "-" : "-",
          log ? String(log.providerMessageId || "").trim() || "-" : "-",
          log ? String(log.batchId || "").trim() || "-" : "-"
        );
      }

      rows.push(row);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Delivery History");

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const fileName = `bulk-whatsapp-annotated-${Date.now()}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error("[Bulk WhatsApp] Export error:", err?.message || err);
    return res.status(500).json({ message: err?.message || "Failed to export annotated sheet" });
  }
});

module.exports = router;
