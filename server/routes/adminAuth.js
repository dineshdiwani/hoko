const express = require("express");
const router = express.Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  // 🔐 Static admin credentials (env-ready)
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    return res.json({ success: true, role: "admin" });
  }

  res.status(401).json({ error: "Invalid admin credentials" });
});

module.exports = router;
