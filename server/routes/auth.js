const express = require("express");
const router = express.Router();
const { setOtp, getOtp, clearOtp } = require("../utils/otpStore");

/* -------- SEND OTP -------- */
router.post("/send-otp", (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ message: "Mobile required" });
  }

  const otp = "123456"; // DEV OTP
  setOtp(mobile, otp);

  console.log("📲 OTP for", mobile, "is", otp);

  res.json({ success: true });
});

/* -------- VERIFY OTP -------- */
router.post("/verify-otp", (req, res) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).json({ message: "Missing data" });
  }

  const storedOtp = getOtp(mobile);

  if (storedOtp !== otp) {
    return res.status(401).json({ message: "Invalid OTP" });
  }

  clearOtp(mobile);

  res.json({
    token: "dev-token",
    user: {
      mobile,
      role: "buyer"
    }
  });
});

module.exports = router;
