const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const WhatsAppContact = require("../models/WhatsAppContact");
const WhatsAppTemplateRegistry = require("../models/WhatsAppTemplateRegistry");
const { sendViaGupshupTemplate, sendViaMetaTemplate } = require("../utils/sendWhatsApp");

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
    
    const providerType = provider || "gupshup";
    const results = { sent: [], failed: [], total: phones.length };
    
    for (const phone of phones) {
      try {
        const normalized = String(phone).replace(/[^\d+]/g, "");
        const mobileE164 = normalized.startsWith("+") ? normalized : `+${normalized}`;
        
        const params = [...parameters];
        
        if (providerType === "meta") {
          await sendViaMetaTemplate({
            to: mobileE164.replace(/^\+/, ""),
            templateName: templateConfig.templateName,
            languageCode: templateConfig.language || "en",
            parameters: params,
            buttonUrl: buttonUrl
          });
        } else {
          await sendViaGupshupTemplate({
            to: mobileE164,
            templateId: templateConfig.templateId,
            templateName: templateConfig.templateName,
            languageCode: templateConfig.language || "en",
            parameters: params,
            buttonUrl: buttonUrl
          });
        }
        
        results.sent.push(mobileE164);
      } catch (err) {
        results.failed.push({ phone, error: err.message });
      }
    }
    
    console.log(`[Bulk WhatsApp] Sent: ${results.sent.length}, Failed: ${results.failed.length}`);
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
      city: { $regex: new RegExp(city, "i") },
      optInStatus: "opted_in",
      active: { $ne: false },
      unsubscribedAt: { $exists: false }
    };
    
    if (category) {
      query.categories = { $regex: new RegExp(category, "i") };
    }
    
    const sellers = await WhatsAppContact.find(query)
      .select("mobileE164 name")
      .limit(Number(limit) || 100);
    
    const providerType = provider || "gupshup";
    const results = { sent: [], failed: [], total: sellers.length };
    
    console.log(`[BulkWhatsApp City] Template: ${templateConfig.templateName}, templateId: ${templateConfig.templateId}, sellers found: ${sellers.length}`);
    
    if (sellers.length === 0) {
      return res.json({ message: "No opted-in sellers found for this city/category", sent: [], failed: [], total: 0 });
    }
    
    for (const seller of sellers) {
      try {
        const mobileE164 = seller.mobileE164;
        
        if (providerType === "meta") {
          await sendViaMetaTemplate({
            to: mobileE164.replace(/^\+/, ""),
            templateName: templateConfig.templateName,
            languageCode: templateConfig.language || "en",
            parameters: parameters,
            buttonUrl: buttonUrl
          });
        } else {
          await sendViaGupshupTemplate({
            to: mobileE164,
            templateId: templateConfig.templateId,
            templateName: templateConfig.templateName,
            languageCode: templateConfig.language || "en",
            parameters: parameters,
            buttonUrl: buttonUrl
          });
        }
        
        results.sent.push(mobileE164);
      } catch (err) {
        results.failed.push({ phone: seller.mobileE164, error: err.message });
      }
    }
    
    console.log(`[Bulk WhatsApp City] Sent: ${results.sent.length}, Failed: ${results.failed.length}, City: ${city}`);
    res.json(results);
  } catch (err) {
    console.log("[Bulk WhatsApp City] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/templates", adminAuth, async (req, res) => {
  try {
    const templates = await WhatsAppTemplateRegistry.find({ isActive: true })
      .select("key templateId templateName language")
      .lean();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/stats", adminAuth, async (req, res) => {
  try {
    const total = await WhatsAppContact.countDocuments({ optInStatus: "opted_in", active: { $ne: false } });
    const byCity = await WhatsAppContact.aggregate([
      { $match: { optInStatus: "opted_in", active: { $ne: false } } },
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    const byCategory = await WhatsAppContact.aggregate([
      { $match: { optInStatus: "opted_in", active: { $ne: false } } },
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 30 }
    ]);
    res.json({ total, byCity, byCategory });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;