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
  const doc = await PlatformSettings.findOne();
  res.json(buildOptionsResponse(doc));
});

router.get("/requirement-preview/:requirementId", async (req, res) => {
  const requirementId = String(req.params.requirementId || "").trim();
  if (!requirementId) {
    return res.status(400).json({ message: "Requirement ID required" });
  }
  try {
    const requirement = await Requirement.findOne({
      _id: requirementId,
      "moderation.removed": { $ne: true }
    })
      .select(
        "_id city category productName product makeBrand brand typeModel quantity type unit details description offerInvitedFrom attachments createdAt"
      )
      .lean();

    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }

    return res.json(requirement);
  } catch {
    return res.status(404).json({ message: "Requirement not found" });
  }
});

module.exports = router;

