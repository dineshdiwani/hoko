const express = require("express");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const adminAuth = require("../middleware/adminAuth");
const router = require("express").Router();



/**
 * Platform overview analytics
 */
router.get("/overview", adminAuth, async (req, res) => {
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
router.get("/cities", adminAuth, async (req, res) => {
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
router.get("/categories", adminAuth, async (req, res) => {
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

router.get("/summary", adminAuth, async (req, res) => {
  res.json({
    users: 120,
    buyers: 80,
    sellers: 40
  });
});

module.exports = router;
