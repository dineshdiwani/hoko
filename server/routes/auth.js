const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();
const { setOtp, verifyOtp } = require("../utils/otpStore");
const { sendAdminEventEmail, sendOtpEmail } = require("../utils/sendEmail");
const {
  otpSendLimiter,
  otpVerifyLimiter
} = require("../middleware/rateLimit");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const OTP_TTL_MS =
  Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const DEFAULT_ROLES = {
  buyer: true,
  seller: false,
  admin: false
};

let googleClient = null;
let googleAuthInitError = null;
const DEFAULT_GOOGLE_CLIENT_IDS = [
  "482189438712-3si7monkd64341m7qh90hqevmdhh75iv.apps.googleusercontent.com",
  "340021652429-qu9hohn3j0hu9uv437skbc3m53dl7b06.apps.googleusercontent.com"
];

function getGoogleClientIds() {
  const raw = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const fromEnv = raw
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const unique = [];
  for (const id of [...fromEnv, ...DEFAULT_GOOGLE_CLIENT_IDS]) {
    if (id && !unique.includes(id)) {
      unique.push(id);
    }
  }
  return unique;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function getGoogleClient() {
  if (googleClient) return googleClient;
  if (googleAuthInitError) return null;
  try {
    const { OAuth2Client } = require("google-auth-library");
    const googleClientIds = getGoogleClientIds();
    googleClient = new OAuth2Client(googleClientIds[0] || undefined);
    return googleClient;
  } catch (err) {
    googleAuthInitError = err;
    return null;
  }
}

function ensureRoles(user) {
  if (!user) return;
  const current = user.roles && typeof user.roles === "object" ? user.roles : {};
  user.roles = {
    ...DEFAULT_ROLES,
    ...current
  };
}

function queueAdminNewUserEmail({ user, loginMethod, requestedRole }) {
  const userId = String(user?._id || "").trim();
  if (!userId) return;

  setImmediate(() => {
    const subject = `New user joined Hoko: ${user.email || userId}`;
    const text = [
      "A new user joined the Hoko app.",
      `User ID: ${userId}`,
      `Email: ${user?.email || "-"}`,
      `City: ${user?.city || "-"}`,
      `Requested role: ${requestedRole || "-"}`,
      `Login method: ${loginMethod || "-"}`,
      `Created at: ${new Date().toISOString()}`
    ].join("\n");

    sendAdminEventEmail({ subject, text }).catch(() => {});
  });
}

/* -------- LOGIN (SEND OTP) -------- */
router.post("/login", otpSendLimiter, async (req, res) => {
  const { email, role, city } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = role === "seller" ? "seller" : "buyer";

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Email required" });
  }

  let user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    if (!city) {
      return res.status(400).json({ message: "City required" });
    }
    if (normalizedRole === "seller") {
      return res.status(403).json({
        message: "Complete buyer login and seller registration first"
      });
    }
    user = await User.create({
      email: normalizedEmail,
      city,
      roles: {
        buyer: true,
        seller: normalizedRole === "seller",
        admin: false
      }
    });
    queueAdminNewUserEmail({
      user,
      loginMethod: "otp",
      requestedRole: normalizedRole
    });
  } else {
    ensureRoles(user);
  }

  const otp = generateOtp();
  try {
    await sendOtpEmail({
      email: normalizedEmail,
      otp,
      subject: "Your Hoko login OTP"
    });
    setOtp(`login:${normalizedEmail}`, otp, OTP_TTL_MS);
    return res.json({ success: true });
  } catch (err) {
    console.error("OTP email send failed:", err.message);
    const body = { message: "Failed to send OTP" };
    if (process.env.NODE_ENV !== "production") {
      body.error = err?.response || err?.message || "Unknown SMTP error";
    }
    return res.status(500).json(body);
  }
});

/* -------- VERIFY OTP -------- */
router.post("/verify-otp", otpVerifyLimiter, async (req, res) => {
  const { email, otp, role, city, acceptTerms } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !otp) {
    return res.status(400).json({ message: "Missing data" });
  }

  const otpResult = verifyOtp(
    `login:${normalizedEmail}`,
    otp,
    OTP_MAX_ATTEMPTS
  );
  if (!otpResult.ok) {
    const message =
      otpResult.reason === "expired"
        ? "OTP expired"
        : otpResult.reason === "locked"
        ? "Too many OTP attempts"
        : "Invalid OTP";
    const status = otpResult.reason === "locked" ? 429 : 401;
    return res.status(status).json({ message });
  }

  const normalizedRole = role === "seller" ? "seller" : "buyer";

  let user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  ensureRoles(user);

  if (!city && !user.city) {
    return res.status(400).json({ message: "City required" });
  }

  if (city) {
    user.city = city;
  }

  if (normalizedRole === "seller") {
    const hasSellerProfile =
      Boolean(user.roles?.seller) ||
      Boolean(user.sel*](#)
