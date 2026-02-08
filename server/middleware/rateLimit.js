const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const redis = require("../config/redis");

exports.otpLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many OTP requests. Try later."
});

exports.offerLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
  windowMs: 60 * 1000,
  max: 10
});

const { otpLimiter, offerLimiter } = require("../middleware/rateLimit");

router.post("/send-otp", otpLimiter, ...);
router.post("/offer", auth, sellerOnly, offerLimiter, ...);
