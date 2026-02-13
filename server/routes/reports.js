const express = require("express");
const Report = require("../models/Report");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const auth = require("../middleware/auth");

const router = express.Router();

// Create report (buyer or seller)
router.post("/", auth, async (req, res) => {
  const { reportedUserId, requirementId, category, details } = req.body || {};

  if (!reportedUserId || !category) {
    return res.status(400).json({ message: "Missing data" });
  }

  if (String(reportedUserId) === String(req.user._id)) {
    return res.status(400).json({ message: "Cannot report yourself" });
  }

  if (requirementId) {
    const requirement = await Requirement.findById(requirementId);
    if (!requirement) {
      return res.status(404).json({ message: "Requirement not found" });
    }

    // Ensure reporter is involved in this requirement
    const isBuyer = String(requirement.buyerId) === String(req.user._id);
    const isSellerOffer = await Offer.findOne({
      requirementId,
      sellerId: req.user._id
    });
    if (!isBuyer && !isSellerOffer) {
      return res.status(403).json({ message: "Not allowed" });
    }
  }

  const report = await Report.create({
    reporterId: req.user._id,
    reportedUserId,
    requirementId: requirementId || null,
    category,
    details
  });

  res.json(report);
});

module.exports = router;
