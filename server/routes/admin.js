const express = require("express");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");


router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });

  if (!admin || admin.password !== password) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      id: admin._id,
      role: "admin"
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});



/**
 * GET all users (buyers + sellers + admins)
 */
router.get("/users", auth, adminOnly, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

/**
 * Approve or block seller
 */
router.post("/seller/approve", auth, adminOnly, async (req, res) => {
  const { sellerId, approved } = req.body;

  await User.findByIdAndUpdate(sellerId, {
    "sellerProfile.approved": approved
  });

  res.json({
    message: approved ? "Seller approved" : "Seller blocked"
  });
});

/**
 * View all buyer requirements (moderation)
 */
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (email === "admin@hoko.com" && password === "admin123") {
    return res.json({
      admin: { email },
    });
  }

  return res.status(401).json({ message: "Invalid credentials" });
});

module.exports = router;
