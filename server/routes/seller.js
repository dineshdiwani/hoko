const express = require("express");
const router = express.Router();

const Offer = require("../models/Offer");
const Requirement = require("../models/Requirement");
const User = require("../models/User");
const auth = require("../middleware/auth");
const sellerOnly = require("../middleware/sellerOnly");
const sendPush = require("../utils/sendPush");

/**
 * Submit offer on requirement
 */
router.post("/offer", auth, sellerOnly, async (req, res) => {
  try {
    const { requirementId, price, message } = req.body;

    const offer = await Offer.create({
      requirementId,
      sellerId: req.user._id,
      price,
      message
    });

    const requirement = await Requirement.findById(requirementId);
    if (requirement) {
      await sendPush(requirement.buyerId.toString(), {
        title: "New Offer Received",
        body: `A seller submitted an offer of ₹${price}`
      });
    }

    res.json(offer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to submit offer" });
  }
});

/**
 * Get offers for a requirement (buyer view)
 */
router.get("/offers/:requirementId", auth, async (req, res) => {
  const offers = await Offer.find({
    requirementId: req.params.requirementId
  })
    .populate("sellerId", "sellerProfile city mobile")
    .sort({ price: 1 });

  res.json(offers);
});

/**
 * Seller dashboard (requirements by category + city)
 */
router.get("/dashboard", auth, sellerOnly, async (req, res) => {
  const seller = await User.findById(req.user._id);

  const requirements = await Requirement.find({
    city: seller.city,
    category: { $in: seller.sellerProfile.categories }
  }).sort({ createdAt: -1 });

  res.json(requirements);
});

module.exports = router;
