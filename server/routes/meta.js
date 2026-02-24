const express = require("express");
const PlatformSettings = require("../models/PlatformSettings");
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

module.exports = router;
