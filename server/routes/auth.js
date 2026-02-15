const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const router = express.Router();
const { setOtp, verifyOtp } = require("../utils/otpStore");
const { sendOtpEmail } = require("../utils/sendEmail");
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

function getGoogleClient() {
  if (googleClient) return googleClient;
  if (googleAuthInitError) return null;
  try {
    const { OAuth2Client } = require("google-auth-library");
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
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

/* -------- LOGIN (SEND OTP) -------- */
router.post("/login", otpSendLimiter, async (req, res) => {
  const { email, password, role, city } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res
      .status(400)
      .json({ message: "Email and password required" });
  }

  const normalizedRole = role === "seller" ? "seller" : "buyer";

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
    const passwordHash = await bcrypt.hash(password, 10);
    user = await User.create({
      email: normalizedEmail,
      passwordHash,
      city,
      roles: {
        buyer: true,
        seller: normalizedRole === "seller",
        admin: false
      }
    });
  } else {
    ensureRoles(user);
    if (!user.passwordHash) {
      return res.status(400).json({
        message: "Password not set. Use forgot password."
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
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
      Boolean(user.sellerProfile?.businessName) ||
      Boolean(user.sellerProfile?.firmName) ||
      Boolean(user.sellerProfile?.taxId);
    if (!hasSellerProfile) {
      return res.status(403).json({
        message: "Complete seller registration before login"
      });
    }
    if (!user.termsAccepted?.at && !acceptTerms) {
      return res.status(403).json({
        message: "Terms required"
      });
    }
    user.roles.seller = true;
  } else {
    if (!user.termsAccepted?.at && !acceptTerms) {
      return res.status(403).json({
        message: "Terms required"
      });
    }
    user.roles.buyer = true;
  }
  if (!user.termsAccepted?.at && acceptTerms) {
    user.termsAccepted = { at: new Date() };
  }
  await user.save();

  const token = jwt.sign(
    { id: user._id, role: normalizedRole, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      _id: user._id,
      email: user.email,
      role: normalizedRole,
      roles: user.roles,
      city: user.city,
      preferredCurrency: user.preferredCurrency || "INR",
      sellerProfile: user.sellerProfile
    }
  });
});

/* -------- FORGOT PASSWORD -------- */
router.post("/forgot-password", otpSendLimiter, async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email);
  if (!normalizedEmail) {
    return res.status(400).json({ message: "Email required" });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.json({ success: true });
  }

  const otp = generateOtp();
  try {
    await sendOtpEmail({
      email: normalizedEmail,
      otp,
      subject: "Your Hoko password reset OTP"
    });
    setOtp(`forgot:${normalizedEmail}`, otp, OTP_TTL_MS);
    return res.json({ success: true });
  } catch (err) {
    console.error("Forgot password email failed:", err.message);
    const body = { message: "Failed to send OTP" };
    if (process.env.NODE_ENV !== "production") {
      body.error = err?.response || err?.message || "Unknown SMTP error";
    }
    return res.status(500).json(body);
  }
});

/* -------- RESET PASSWORD -------- */
router.post("/reset-password", otpVerifyLimiter, async (req, res) => {
  const { email, otp, newPassword } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !otp || !newPassword) {
    return res.status(400).json({ message: "Missing data" });
  }
  if (String(newPassword).length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  const otpResult = verifyOtp(
    `forgot:${normalizedEmail}`,
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

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  return res.json({ success: true });
});

/* -------- GOOGLE LOGIN -------- */
router.post("/google", async (req, res) => {
  try {
    const { credential, role, city, acceptTerms } = req.body || {};
    if (!credential) {
      return res.status(400).json({ message: "Missing credential" });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res
        .status(500)
        .json({ message: "Google login not configured" });
    }

    const client = getGoogleClient();
    if (!client) {
      return res.status(500).json({
        message: "Google login temporarily unavailable"
      });
    }

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error("Google token verify failed:", err?.message || err);
      return res.status(401).json({
        message: "Invalid Google token or client ID mismatch"
      });
    }

    const email = normalizeEmail(payload?.email);
    const name = payload?.name || "User";
    const picture = payload?.picture || "";
    const sub = payload?.sub || "";
    const emailVerified = payload?.email_verified;
    if (!email || !emailVerified) {
      return res
        .status(401)
        .json({ message: "Unverified Google account" });
    }

    const normalizedRole = role === "seller" ? "seller" : "buyer";

    let user = await User.findOne({ email });
    if (!user) {
      if (!city) {
        return res.status(400).json({ message: "City required" });
      }
      if (normalizedRole === "seller") {
        return res.status(403).json({
          message: "Complete seller registration before Google login"
        });
      }
      if (!acceptTerms) {
        return res.status(403).json({
          message: "Terms required"
        });
      }
      user = await User.create({
        email,
        city,
        roles: {
          buyer: true,
          seller: false,
          admin: false
        },
        termsAccepted: { at: new Date() },
        googleProfile: {
          sub,
          name,
          picture
        }
      });
    } else {
      ensureRoles(user);
      if (!user.city && city) {
        user.city = city;
      } else if (city) {
        user.city = city;
      }
      if (normalizedRole === "seller") {
        const hasSellerProfile =
          Boolean(user.roles?.seller) ||
          Boolean(user.sellerProfile?.businessName) ||
          Boolean(user.sellerProfile?.firmName) ||
          Boolean(user.sellerProfile?.taxId);
        if (!hasSellerProfile) {
          return res.status(403).json({
            message: "Complete seller registration before Google login"
          });
        }
        user.roles.seller = true;
      } else {
        if (!user.termsAccepted?.at && !acceptTerms) {
          return res.status(403).json({
            message: "Terms required"
          });
        }
        user.roles.buyer = true;
      }
      if (!user.termsAccepted?.at && acceptTerms) {
        user.termsAccepted = { at: new Date() };
      }
      user.googleProfile = {
        sub,
        name,
        picture
      };
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, role: normalizedRole, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        name,
        picture,
        role: normalizedRole,
        roles: user.roles,
        city: user.city,
        preferredCurrency: user.preferredCurrency || "INR",
        sellerProfile: user.sellerProfile
      }
    });
  } catch (err) {
    console.error("Google login unexpected error:", err?.stack || err?.message || err);
    return res.status(500).json({ message: "Google login failed" });
  }
});

/* -------- SWITCH ROLE -------- */
const auth = require("../middleware/auth");
router.post("/switch-role", auth, async (req, res) => {
  const { role } = req.body || {};
  const nextRole = role === "seller" ? "seller" : "buyer";

  if (!req.user?.roles?.[nextRole]) {
    return res.status(403).json({ message: "Role not enabled" });
  }
  if (nextRole === "seller") {
    const sellerProfile = req.user?.sellerProfile || {};
    const hasSellerProfile = Boolean(
      sellerProfile.businessName &&
        sellerProfile.businessAddress &&
        sellerProfile.ownerName &&
        sellerProfile.taxId
    );
    if (!hasSellerProfile) {
      return res.status(403).json({
        message: "Seller onboarding required"
      });
    }
  }

  const token = jwt.sign(
    { id: req.user._id, role: nextRole, tokenVersion: req.user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      _id: req.user._id,
      email: req.user.email,
      role: nextRole,
      roles: req.user.roles,
      city: req.user.city,
      preferredCurrency: req.user.preferredCurrency || "INR",
      sellerProfile: req.user.sellerProfile
    }
  });
});

module.exports = router;
