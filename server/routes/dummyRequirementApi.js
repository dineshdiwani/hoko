const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const PlatformSettings = require("../models/PlatformSettings");
const DummyRequirement = require("../models/DummyRequirement");
const { generateDummyRequirements, sendToSellers, runCron } = require("../services/dummyRequirementCron");

let cronRunning = true;
let lastRunAt = null;
let cronIntervalMs = 12 * 60 * 60 * 1000; // 12 hours default
let cronIntervalId = null;
let defaultQuantity = 3;

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

function restartCron() {
  if (cronIntervalId) clearInterval(cronIntervalId);
  if (cronRunning) {
    cronIntervalId = setInterval(() => {
      runCron().catch(err => console.error("[DummyReq Cron] Error:", err));
    }, cronIntervalMs);
  }
}

async function loadSettings() {
  try {
    const settings = await PlatformSettings.findOne({ key: "dummyRequirementConfig" }).lean();
    if (settings?.value) {
      if (settings.value.intervalHours) cronIntervalMs = settings.value.intervalHours * 60 * 60 * 1000;
      if (settings.value.quantity) defaultQuantity = settings.value.quantity;
      if (typeof settings.value.running === "boolean") cronRunning = settings.value.running;
    }
  } catch (err) {
    console.log("[DummyReq] Failed to load settings:", err.message);
  }
  restartCron();
}

loadSettings();

router.get("/status", adminAuth, async (req, res) => {
  res.json({
    cronRunning,
    lastRunAt,
    intervalHours: cronIntervalMs / (60 * 60 * 1000),
    quantity: defaultQuantity,
    totalDummyRequirements: await DummyRequirement.countDocuments(),
    sentCount: await DummyRequirement.countDocuments({ status: "sent" }),
    newCount: await DummyRequirement.countDocuments({ status: "new" })
  });
});

router.post("/toggle", adminAuth, async (req, res) => {
  cronRunning = !cronRunning;
  await PlatformSettings.findOneAndUpdate(
    { key: "dummyRequirementConfig" },
    { key: "dummyRequirementConfig", value: { running: cronRunning, intervalHours: cronIntervalMs / 3600000, quantity: defaultQuantity } },
    { upsert: true }
  );
  restartCron();
  logActivity("toggle", `Cron ${cronRunning ? "started" : "stopped"}`);
  res.json({ ok: true, cronRunning });
});

router.post("/settings", adminAuth, async (req, res) => {
  const { intervalHours, quantity } = req.body;
  if (intervalHours) cronIntervalMs = Number(intervalHours) * 60 * 60 * 1000;
  if (quantity) defaultQuantity = Number(quantity);
  
  await PlatformSettings.findOneAndUpdate(
    { key: "dummyRequirementConfig" },
    { key: "dummyRequirementConfig", value: { running: cronRunning, intervalHours: cronIntervalMs / 3600000, quantity: defaultQuantity } },
    { upsert: true }
  );
  
  restartCron();
  logActivity("settings", `Interval: ${intervalHours}h, Qty: ${quantity}`);
  res.json({ ok: true });
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