const rateLimit = require("express-rate-limit");

exports.otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.OTP_SEND_RATE_LIMIT_MAX || 5),
  message: "Too many OTP requests. Try later."
});

exports.otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.OTP_VERIFY_RATE_LIMIT_MAX || 20),
  message: "Too many OTP verification attempts. Try later."
});

exports.offerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});

