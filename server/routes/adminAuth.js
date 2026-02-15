const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

const router = express.Router();

router.post("/login", async (req, res) => {
  const legacyEnabled = String(process.env.ALLOW_LEGACY_ADMIN_ENV_LOGIN || "false")
    .toLowerCase()
    .trim() === "true";
  if (!legacyEnabled) {
    return res.status(410).json({
      error: "Deprecated. Use /api/admin/login with DB admin credentials."
    });
  }

  const { username, password } = req.body || {};
  if (!process.env.ADMIN_JWT_SECRET) {
    return res.status(500).json({ error: "ADMIN_JWT_SECRET not set" });
  }
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  if (username !== process.env.ADMIN_USER || password !== process.env.ADMIN_PASS) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }

  const email = String(process.env.ADMIN_USER_EMAIL || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "ADMIN_USER_EMAIL not set for legacy mode" });
  }

  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(404).json({ error: "Legacy admin email not found in DB" });
  }

  if (!admin.passwordHash) {
    admin.passwordHash = await bcrypt.hash(String(password), 10);
    admin.password = "";
    await admin.save();
  }

  const token = jwt.sign(
    {
      id: admin._id,
      role: admin.role,
      tokenVersion: admin.tokenVersion || 0
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "8h" }
  );
  return res.json({ success: true, role: admin.role, token });
});

module.exports = router;
