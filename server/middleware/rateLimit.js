const rateLimit = require("express-rate-limit");

function safeKeyGenerator(req) {
  return (
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown-ip"
  );
}

exports.otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.OTP_SEND_RATE_LIMIT_MAX || 5),
  message: "Too many OTP requests. Try later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator
});

exports.otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.OTP_VERIFY_RATE_LIMIT_MAX || 20),
  message: "Too many OTP verification attempts. Try later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator
});

exports.offerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator
});

