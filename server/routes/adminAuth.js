const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!process.env.ADMIN_JWT_SECRET) {
    return res.status(500).json({ error: "ADMIN_JWT_SECRET not set" });
  }

  // 🔐 Static admin credentials (env-ready)
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = jwt.sign(
      { id: "env-admin", role: "admin", isEnv: true },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "7d" }
    );
    return res.json({ success: true, role: "admin", token });
  }

  res.status(401).json({ error: "Invalid admin credentials" });
});

module.exports = router;
