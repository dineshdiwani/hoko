const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const PlatformSettings = require("../models/PlatformSettings");
const DummyRequirement = require("../models/DummyRequirement");
const mongoose = require("mongoose");
const { generateDummyRequirements, sendToSellers, runCron } = require("../services/dummyRequirementCron");

let cronRunning = true;
let lastRunAt = null;
let cronIntervalMs = 12 * 60 * 60 * 1000;
let cronIntervalId = null;
let defaultQuantity = 3;
let maxQuantity = 10;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 10;

const activityLogs = [];

async function loadSettingsFromDB() {
  try {
    if (mongoose.connection.readyState !== 1) {
      initAttempts++;
      if (initAttempts <= MAX_INIT_ATTEMPTS) {
        console.log(`[DummyReq] DB not ready (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}), retrying in 2s...`);
        setTimeout(loadSettingsFromDB, 2000);
        return;
      } else {
        console.log("[DummyReq] Max init attempts reached, starting cron with defaults");
      }
    }
    
    const settings = await PlatformSettings.findOne().lean();
    if (settings?.dummyRequirementSettings) {
      const ds = settings.dummyRequirementSettings;
      if (ds.intervalHours) cronIntervalMs = Number(ds.intervalHours) * 60 * 60 * 1000;
      if (ds.quantity) defaultQuantity = Number(ds.quantity);
      if (ds.maxQuantity) maxQuantity = Number(ds.maxQuantity);
      if (typeof ds.running === "boolean") cronRunning = ds.running;
      console.log(`[DummyReq] Loaded settings - interval: ${cronIntervalMs/3600000}h, qty: ${defaultQuantity}, maxQty: ${maxQuantity}, running: ${cronRunning}`);
    } else {
      console.log("[DummyReq] No DB settings, using defaults - cron will auto-start");
    }
  } catch (err) {
    console.log("[DummyReq] Failed to load settings from DB:", err.message);
  }
  restartCron();
}

mongoose.connection.on("connected", () => {
  console.log("[DummyReq] MongoDB connected, reinitializing cron...");
  initAttempts = 0;
  loadSettingsFromDB();
});

mongoose.connection.on("reconnected", () => {
  console.log("[DummyReq] MongoDB reconnected, reinitializing cron...");
  initAttempts = 0;
  loadSettingsFromDB();
});

if (mongoose.connection.readyState === 1) {
  loadSettingsFromDB();
} else {
  console.log("[DummyReq] DB not ready yet, will retry when connected...");
  setTimeout(loadSettingsFromDB, 2000);
}

function logActivity(action, details) {
  const entry = { action, details, at: new Date() };
  activityLogs.unshift(entry);
  if (activityLogs.length > 100) activityLogs.pop();
}

function restartCron() {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
  if (cronRunning) {
    cronIntervalId = setInterval(() => {
      runCron({ quantity: defaultQuantity, maxQuantity: maxQuantity }).catch(err => console.error("[DummyReq Cron] Error:", err));
    }, cronIntervalMs);
    console.log(`[DummyReq] Cron started - interval: ${cronIntervalMs/3600000}h`);
  } else {
    console.log(`[DummyReq] Cron stopped (running=false)`);
  }
}

setInterval(() => {
  if (cronRunning && !cronIntervalId) {
    console.log("[DummyReq] Watchdog: Cron was stopped unexpectedly, restarting...");
    restartCron();
  }
}, 60000);

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
    const { intervalHours, quantity, maxQuantity: maxQty } = req.body;
    
    if (intervalHours) cronIntervalMs = Number(intervalHours) * 60 * 60 * 1000;
    if (quantity) defaultQuantity = Number(quantity);
    if (maxQty) maxQuantity = Number(maxQty);
    
    await PlatformSettings.findOneAndUpdate(
      {},
      {
        $set: {
          "dummyRequirementSettings.intervalHours": Number(intervalHours),
          "dummyRequirementSettings.quantity": Number(quantity),
          "dummyRequirementSettings.maxQuantity": Number(maxQty)
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    
    restartCron();
    logActivity("settings", `Interval: ${intervalHours}h, Qty: ${quantity}, Max: ${maxQty}`);
    res.json({ ok: true });
  } catch (err) {
    console.log("[DummyReq] Settings error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.post("/run-now", adminAuth, async (req, res) => {
  try {
    await runCron({ quantity: defaultQuantity, maxQuantity: maxQuantity });
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

router.post("/reset", adminAuth, async (req, res) => {
  try {
    const { keepRealRequirement } = req.body;
    if (keepRealRequirement) {
      await DummyRequirement.deleteMany({ realRequirementId: { $exists: true } });
    } else {
      await DummyRequirement.deleteMany({});
    }
    logActivity("reset", keepRealRequirement ? "Deleted with real requirements" : "All deleted");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;