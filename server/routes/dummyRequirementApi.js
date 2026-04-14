const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const mongoose = require("mongoose");
const DummyRequirement = require("../models/DummyRequirement");
const { generateDummyRequirements, sendToSellers, runCron } = require("../services/dummyRequirementCron");

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed
}, { timestamps: true });
const Config = mongoose.model("Config", configSchema);

let cronRunning = true;
let lastRunAt = null;
let cronIntervalMs = 12 * 60 * 60 * 1000;
let cronIntervalId = null;
let defaultQuantity = 3;
let maxQuantity = 500;

const activityLogs = [];

function logActivity(action, details) {
  const entry = { action, details, at: new Date() };
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
    const settings = await Config.findOne({ key: "dummyRequirementConfig" }).lean();
    if (settings?.value) {
      if (settings.value.intervalHours) cronIntervalMs = settings.value.intervalHours * 60 * 60 * 1000;
      if (settings.value.quantity) defaultQuantity = settings.value.quantity;
      if (settings.value.maxQuantity) maxQuantity = settings.value.maxQuantity;
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
    maxQuantity: maxQuantity,
    totalDummyRequirements: await DummyRequirement.countDocuments(),
    sentCount: await DummyRequirement.countDocuments({ status: "sent" }),
    newCount: await DummyRequirement.countDocuments({ status: "new" })
  });
});

router.post("/toggle", adminAuth, async (req, res) => {
  try {
    cronRunning = !cronRunning;
    const result = await Config.findOneAndUpdate(
      { key: "dummyRequirementConfig" },
      { $set: { value: { running: cronRunning, intervalHours: cronIntervalMs / 3600000, quantity: defaultQuantity, maxQuantity } } },
      { upsert: true, new: true }
    );
    console.log("[DummyReq] Toggle result:", result);
    restartCron();
    logActivity("toggle", `Cron ${cronRunning ? "started" : "stopped"}`);
    res.json({ ok: true, cronRunning });
  } catch (err) {
    console.log("[DummyReq] Toggle error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/settings", adminAuth, async (req, res) => {
  try {
    const { intervalHours, quantity, maxQuantity } = req.body;
    if (intervalHours) cronIntervalMs = Number(intervalHours) * 60 * 60 * 1000;
    if (quantity) defaultQuantity = Number(quantity);
    if (maxQuantity) maxQuantity = Number(maxQuantity);
    
    const result = await Config.findOneAndUpdate(
      { key: "dummyRequirementConfig" },
      { $set: { value: { running: cronRunning, intervalHours: cronIntervalMs / 3600000, quantity: defaultQuantity, maxQuantity } } },
      { upsert: true, new: true }
    );
    console.log("[DummyReq] Settings result:", result);
    
    restartCron();
    logActivity("settings", `Interval: ${intervalHours}h, Qty: ${quantity}, Max: ${maxQuantity}`);
    res.json({ ok: true });
  } catch (err) {
    console.log("[DummyReq] Settings error:", err);
    res.status(500).json({ message: err.message });
  }
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