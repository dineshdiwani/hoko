const express = require("express");
const Requirement = require("../models/Requirement");
const Offer = require("../models/Offer");
const router = express.Router();

router.get("/city/:city", async (req, res) => {
  const data = await Requirement.find({ city: req.params.city });
  res.json(data);
});

router.get("/offers/:requirementId", async (req, res) => {
  const offers = await Offer.find({ requirementId: req.params.requirementId })
    .populate("sellerId", "sellerProfile city mobile")
    .sort({ price: 1 });

  res.json(offers);
});

module.exports = router;
