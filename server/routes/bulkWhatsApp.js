const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppDeliveryLog = require("../models/WhatsAppDeliveryLog");
const { normalizeE164, sendViaGupshupTemplate, fetchGupshupApprovedTemplates } = require("../utils/sendWhatsApp");

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
    const { phones, templateId, templateKey, parameters = [], buttonUrl, provider } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ message: "phones array required" });
    }

    const approvedTemplates = await fetchGupshupApprovedTemplates();
    const templateConfig = approvedTemplates.find((template) => template.id === String(templateId || "").trim());

    if (!templateConfig) {
      return res.status(400).json({ message: "Template not found in Gupshup approved templates" });
    }

    const providerType = String(provider || "gupshup").trim().toLowerCase();
    const batchId = crypto.randomUUID();
    const results = { accepted: [], failed: [], total: phones.length };

    for (const phone of phones) {
      const normalized = String(phone).replace(/[^\d+]/g, "");
      const mobileE164 = normalized.startsWith("+") ? normalized : `+${normalized}`;
      const sendResult = await sendAndLogBulkWhatsApp({
        mobileE164,
        templateConfig: {
          templateId: templateConfig.id,
          templateName: templateConfig.name,
          language: templateConfig.languageCode
        },
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
    const { city, templateKey, templateId, parameters = [], buttonUrl, provider, limit, category } = req.body;

    if (!city) {
      return res.status(400).json({ message: "city required" });
    }

    const approvedTemplates = await fetchGupshupApprovedTemplates();
    const templateConfig = approvedTemplates.find((template) => template.id === String(templateId || "").trim());

    if (!templateConfig) {
      return res.status(400).json({ message: "Template not found in Gupshup approved templates" });
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
        templateConfig: {
          templateId: templateConfig.id,
          templateName: templateConfig.name,
          language: templateConfig.languageCode
        },
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

module.exports = router;
