const express = require("express");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const WhatsAppFunnelEvent = require("../models/WhatsAppFunnelEvent");
const adminAuth = require("../middleware/adminAuth");
const { requireAdminPermission } = require("../middleware/adminPermission");
const router = require("express").Router();



/**
 * Platform overview analytics
 */
router.get("/overview", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalBuyers = await User.countDocuments({ "roles.buyer": true });
  const totalSellers = await User.countDocuments({ "roles.seller": true });

  const approvedSellers = await User.countDocuments({
    "roles.seller": true,
    "sellerProfile.approved": true
  });

  const totalRequirements = await Requirement.countDocuments();
  const totalOffers = await Offer.countDocuments();

  const avgOffersPerRequirement =
    totalRequirements === 0
      ? 0
      : (totalOffers / totalRequirements).toFixed(2);

  res.json({
    totalUsers,
    totalBuyers,
    totalSellers,
    approvedSellers,
    pendingSellers: totalSellers - approvedSellers,
    totalRequirements,
    totalOffers,
    avgOffersPerRequirement
  });
});

/**
 * City-wise demand analytics
 */
router.get("/cities", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
  const cityStats = await Requirement.aggregate([
    {
      $group: {
        _id: "$city",
        requirements: { $sum: 1 }
      }
    },
    { $sort: { requirements: -1 } }
  ]);

  res.json(cityStats);
});

/**
 * Category-wise demand analytics
 */
router.get("/categories", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
  const categoryStats = await Requirement.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  res.json(categoryStats);
});

router.get("/summary", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
  const [users, buyers, sellers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ "roles.buyer": true }),
    User.countDocuments({ "roles.seller": true })
  ]);
  res.json({ users, buyers, sellers });
});

/**
 * WhatsApp funnel overview — counts by event type for a date range
 */
router.get("/whatsapp-funnel", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const match = { createdAt: { $gte: since } };
  if (req.query.campaign) match.campaign = req.query.campaign;
  if (req.query.step) match.step = req.query.step;

  const [byEventType, byCampaign, byStep, byDay] = await Promise.all([
    WhatsAppFunnelEvent.aggregate([
      { $match: match },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    WhatsAppFunnelEvent.aggregate([
      { $match: match },
      { $group: { _id: "$campaign", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    WhatsAppFunnelEvent.aggregate([
      { $match: match },
      { $group: { _id: { campaign: "$campaign", step: "$step" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    WhatsAppFunnelEvent.aggregate([
      { $match: { ...match, direction: "inbound" } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        inbound: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ])
  ]);

  res.json({
    range: { days, since: since.toISOString() },
    byEventType: byEventType.map(r => ({ eventType: r._id, count: r.count })),
    byCampaign: byCampaign.map(r => ({ campaign: r._id, count: r.count })),
    byStep: byStep.map(r => ({ campaign: r._id.campaign, step: r._id.step, count: r.count })),
    byDay: byDay.map(r => ({ date: r._id, inbound: r.inbound }))
  });
});

/**
 * WhatsApp funnel — detailed events for a specific mobile number
 */
router.get("/whatsapp-funnel/:mobileE164", adminAuth, requireAdminPermission("reports.read"), async (req, res) => {
  const { mobileE164 } = req.params;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);

  const events = await WhatsAppFunnelEvent.find({ mobileE164 })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    mobileE164,
    count: events.length,
    events: events.map(e => ({
      direction: e.direction,
      eventType: e.eventType,
      campaign: e.campaign,
      step: e.step,
      status: e.status,
      metadata: e.metadata,
      createdAt: e.createdAt
    }))
  });
});

module.exports = router;
