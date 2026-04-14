const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const DummyRequirement = require("../models/DummyRequirement");
const { generateDummyRequirements, sendToSellers, runCron } = require("../services/dummyRequirementCron");

let cronRunning = true;
let lastRunAt = null;
const activityLogs = [];

function logActivity(action, details) {
  const entry = {
    action,
    details,
    at: new Date()
  };
  activityLogs.unshift(entry);
  if (activityLogs.length > 100) activityLogs.pop();
}

router.get("/status", adminAuth, async (req, res) => {
  res.json({
    cronRunning,
    lastRunAt,
    totalDummyRequirements: await DummyRequirement.countDocuments(),
    sentCount: await DummyRequirement.countDocuments({ status: "sent" }),
    newCount: await DummyRequirement.countDocuments({ status: "new" })
  });
});

router.post("/toggle", adminAuth, async (req, res) => {
  cronRunning = !cronRunning;
  logActivity("toggle", `Cron ${cronRunning ? "started" : "stopped"}`);
  res.json({ ok: true, cronRunning });
});

router.post("/run-now", adminAuth, async (req, res) => {
  try {
    await runCron();
    lastRunAt = new Date();
    logActivity("manual_run", "Dummy requirements generated and sent");
    res.json({ ok: true });
  } catch (err) {
    logActivity("error", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/logs", adminAuth, async (req, res) => {
  res.json(activityLogs);
});

router.get("/requirements", adminAuth, async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;
  const query = {};
  if (status) query.status = status;
  
  const total = await DummyRequirement.countDocuments(query);
  const items = await DummyRequirement.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  
  res.json({ items, total, page: Number(page), pages: Math.ceil(total / limit) });
});

module.exports = router;