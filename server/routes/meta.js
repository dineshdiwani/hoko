const express = require("express");
const PlatformSettings = require("../models/PlatformSettings");
const Requirement = require("../models/Requirement");
const { buildOptionsResponse } = require("../config/platformDefaults");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "hoko-api",
    uptimeSec: Math.floor(process.uptime()),
    now: new Date().toISOString()
  });
});

router.get("/options", async (req, res) => {
  try {
    const doc = await PlatformSettings.findOne();
    const response = buildOptionsResponse(doc);
    res.json(response);
  } catch (err) {
    console.error("[meta/options] Error:", err);
    res.status(500).json({ message: "Failed to load options", cities: [], categories: [] });
  }
});

router.get("/requirements", async (req, res) => {
  try {
    const { city, category, limit = 50 } = req.query;
    const query = {
      "moderation.removed": { $ne: true },
      status: { $in: ["open", "active", "pending"] }
    };
    
    if (city) {
      query.$or = [
        { city: { $regex: `^\\s*${String(city).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, $options: "i" } },
        { offerInvitedFrom: "anywhere" }
      ];
    }
    if (category) {
      // Use case-insensitive partial match for flexibility
      query.category = { $regex: String(category).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    
    const requirements = await Requirement.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select("_id product productName category city quantity unit type makeBrand brand typeModel details createdAt")
      .lean();
    
    res.json(requirements);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch requirements" });
  }
});

router.get("/requirement-preview/:requirementId", async (req, res) => {
  const requirementId = String(req.params.requirementId || "").trim();
  if (!requirementId) {
    return res.status(400).json({ message: "Requirement ID required" });
  }
  try {
    // First check real requirements
    let requirement = await Requirement.findOne({
      _id: requirementId,
      "moderation.removed": { $ne: true }
    })
      .select(
        "_id city category productName product makeBrand brand typeModel quantity type unit details description offerInvitedFrom attachments createdAt"
      )
      .lean();

    // If not found in real requirements, check dummy requirements
    if (!requirement) {
      const DummyRequirement = require("../models/DummyRequirement");
      const dummy = await DummyRequirement.findOne({ _id: requirementId }).lean();
      if (dummy) {
        requirement = {
          _id: dummy._id,
          city: dummy.city,
          category: dummy.category,
          productName: dummy.product,
          product: dummy.product,
          quantity: dummy.quantity,
          unit: dummy.unit,
          type: dummy.unit,
          details: dummy.details || "",
          offerInvitedFrom: "anywhere",
          createdAt: dummy.createdAt,
          isDummy: true
        };
      }
    }

    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }

    return res.json(requirement);
  } catch {
    return res.status(404).json({ message: "Requirement not found" });
  }
});

module.exports = router;

