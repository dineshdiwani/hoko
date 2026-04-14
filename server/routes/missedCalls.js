const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const MissedCallLead = require("../models/MissedCallLead");
const { sendBulkSms } = require("../utils/sendSms");

function parseMobile(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^\d+]/g, "");
  if (cleaned.length >= 10) {
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("91") && cleaned.length > 10) return "+" + cleaned;
    if (cleaned.length === 10) return "+91" + cleaned;
    return "+91" + cleaned;
  }
  return null;
}

router.post("/webhook", async (req, res) => {
  try {
    const { mobile, caller_id, call_id, timestamp } = req.body;
    if (!mobile) {
      return res.status(400).json({ message: "mobile required" });
    }

    const mobileE164 = parseMobile(mobile);
    if (!mobileE164) {
      return res.status(400).json({ message: "invalid mobile" });
    }

    const existing = await MissedCallLead.findOne({ mobileE164 });
    if (existing) {
      existing.calledAt = new Date();
      await existing.save();
      return res.json({ ok: true, updated: true });
    }

    await MissedCallLead.create({
      mobileE164,
      mobileRaw: mobile,
      calledAt: new Date(),
      status: "new"
    });

    res.json({ ok: true, created: true });
  } catch (err) {
    console.error("Missed call webhook error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

router.get("/leads", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const query = {};
    if (status) query.status = status;

    const total = await MissedCallLead.countDocuments(query);
    const leads = await MissedCallLead.find(query)
      .sort({ calledAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      items: leads,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch leads" });
  }
});

router.post("/send-welcome", adminAuth, async (req, res) => {
  try {
    const { message, leadIds } = req.body;

    const query = { status: "new" };
    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      query._id = { $in: leadIds };
    }

    const leads = await MissedCallLead.find(query).select("mobileE164");
    if (leads.length === 0) {
      return res.status(400).json({ message: "No leads to send" });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message required" });
    }

    const mobiles = leads.map((l) => l.mobileE164);
    const results = await sendBulkSms({
      numbers: mobiles,
      message: message.trim()
    });

    await MissedCallLead.updateMany(
      { _id: { $in: leads.map((l) => l._id) } },
      { $set: { status: "contacted", followUpAt: new Date() } }
    );

    res.json(results);
  } catch (err) {
    console.error("Send welcome error:", err);
    res.status(500).json({ message: err.message || "Failed to send" });
  }
});

router.patch("/leads/:id", adminAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const lead = await MissedCallLead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    if (status) lead.status = status;
    if (notes !== undefined) lead.notes = notes;
    await lead.save();
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: "Failed to update" });
  }
});

module.exports = router;