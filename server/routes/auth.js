const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const TempRequirement = require("../models/TempRequirement");
const router = express.Router();
const { setOtp, verifyOtp } = require("../utils/otpStore");
const { sendAdminEventEmail, sendOtpEmail } = require("../utils/sendEmail");
const {
  otpSendLimiter,
  otpVerifyLimiter
} = require("../middleware/rateLimit");
const { notifyNewBuyer, notifyNewSeller } = require("../services/adminNotifications");
const { normalizeE164 } = require("../utils/sendWhatsApp");

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

async function mergeSoftUserRequirements(userId, mobileE164) {
  if (!userId || !mobileE164) return { merged: false };

  // Merge any other soft users with the same mobile
  const softUser = await User.findOne({
    mobile: mobileE164,
    _id: { $ne: userId },
    passwordHash: { $exists: false },
    $or: [{ email: { $exists: false } }, { email: "" }]
  }).lean();

  let softUserId = null;
  if (softUser) {
    softUserId = softUser._id;
  }

  // Also merge requirements from WhatsApp OTP flow that might have different buyerId
  // Check all requirements created with this mobile number
  const whatsappRequirements = await Requirement.find({
    $or: [
      { "metadata.mobile": mobileE164 },
      { mobile: mobileE164 }
    ],
    buyerId: { $ne: userId }
  });

  let totalMerged = 0;

  // Merge soft user requirements
  if (softUserId) {
    const reqResult = await Requirement.updateMany(
      { buyerId: softUserId },
      { $set: { buyerId: userId } }
    );
    await TempRequirement.updateMany(
      { userId: softUserId },
      { $set: { userId: userId } }
    );
    await User.findByIdAndDelete(softUserId);
    totalMerged += reqResult.modifiedCount;
    console.log(`[Soft User Merge] Merged ${reqResult.modifiedCount} requirements from soft user ${softUserId} to ${userId}`);
  }

  // Merge any other requirements with same mobile
  if (whatsappRequirements.length > 0) {
    const result = await Requirement.updateMany(
      {
        $or: [
          { "metadata.mobile": mobileE164 },
          { mobile: mobileE164 }
        ],
        buyerId: { $ne: userId }
      },
      { $set: { buyerId: userId } }
    );
    totalMerged += result.modifiedCount;
    console.log(`[Mobile Merge] Merged ${result.modifiedCount} requirements with mobile ${mobileE164} to ${userId}`);
  }

return {
    merged: totalMerged > 0,
    softUserId: softUserId ? String(softUserId) : null,
    requirementsMerged: totalMerged
  };
}

async function mergeExistingRequirements(userId, mobileE164) {
  return mergeSoftUserRequirements(userId, mobileE164);
}

let googleClient = null;
let googleAuthInitError = null;
const DEFAULT_GOOGLE_CLIENT_IDS = [
  "482189438712-3si7monkd64341m7qh90hqevmdhh75iv.apps.googleusercontent.com",
  "340021652429-qu9hohn3j0hu9uv437skbc3m53dl7b06.apps.googleusercontent.com",
  "340021652429-subaig4nmuueab270ffsopgjm8raggpr.apps.googleusercontent.com"
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
  const { email, role, city, mobile } = req.body || {};
  
  if (mobile) {
    const mobileE164 = normalizeE164(mobile);
    if (!mobileE164) {
      return res.status(400).json({ message: "Invalid mobile number" });
    }
    let user = await User.findOne({ mobile: mobileE164 });
    if (!user) {
      user = await User.create({
        mobile: mobileE164,
        city: city || "user_default",
        roles: { buyer: true, seller: false, admin: false },
        name: "WhatsApp User"
      });
    }
    const otp = generateOtp();
    const sendResult = await sendOTPviaWhatsApp(mobileE164, otp, "login", user.city);
    if (!sendResult.ok) {
      return res.status(500).json({ message: "Failed to send OTP. Please try again." });
    }
    setOtp(`login:${mobileE164}`, otp, OTP_TTL_MS);
    return res.json({ success: true, method: "whatsapp", mobile: mobileE164 });
  }
  
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
    if (normalizedRole === "seller") {
      notifyNewSeller(user.mobile || "", city, user.sellerProfile?.firmName || user.email, user.email);
    } else {
      notifyNewBuyer(user.mobile || "", city, user.email);
    }
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
  const { email, otp, role, city, acceptTerms, mobile } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  
  if (mobile) {
    const mobileE164 = normalizeE164(mobile);
    if (!mobileE164 || !otp) {
      return res.status(400).json({ message: "Missing mobile or OTP" });
    }
    
    const otpKey = `login:${mobileE164}`;
    const otpResult = verifyOtp(otpKey, otp, OTP_MAX_ATTEMPTS);
    if (!otpResult.ok) {
      const message = otpResult.reason === "expired" ? "OTP expired" : otpResult.reason === "locked" ? "Too many attempts" : "Invalid OTP";
      return res.status(otpResult.reason === "locked" ? 429 : 401).json({ message });
    }
    
    let user = await User.findOne({ mobile: mobileE164 });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const normalizedRole = role === "seller" ? "seller" : "buyer";
    if (normalizedRole === "seller") {
      const hasSellerProfile = Boolean(user.roles?.seller) || Boolean(user.sellerProfile?.businessName) || Boolean(user.sellerProfile?.firmName);
      if (!hasSellerProfile) {
        return res.status(403).json({ message: "Complete seller registration before login" });
      }
    }
    
    if (city) {
      user.city = city;
      await user.save();
    }
    
    const token = jwt.sign(
      { id: user._id, role: normalizedRole, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    const mergeResult = await mergeSoftUserRequirements(user._id, mobileE164);
    return res.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        role: normalizedRole,
        roles: user.roles,
        city: user.city,
        name: user.name,
        preferredCurrency: user.preferredCurrency || "INR",
        mobile: user.mobile
      },
      token,
      merge: mergeResult.merged ? mergeResult : undefined
    });
  }

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

  const mergeResult = await mergeSoftUserRequirements(user._id, mobile);

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
      sellerProfile: user.sellerProfile,
      mobile: user.mobile
    },
    merge: mergeResult.merged ? mergeResult : undefined
  });
});

/* -------- GOOGLE LOGIN -------- */
router.post("/google", async (req, res) => {
  try {
    const { credential, role, city, acceptTerms, mobile } = req.body || {};
    if (!credential) {
      return res.status(400).json({ message: "Missing credential" });
    }

    const googleClientIds = getGoogleClientIds();
    if (!googleClientIds.length) {
      return res
        .status(500)
        .json({ message: "Google login not configured" });
    }

    const decoded = decodeJwtPayload(credential);
    console.log("[Google Login] token aud:", decoded?.aud, "| token azp:", decoded?.azp, "| accepted:", googleClientIds.join(", "));

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
        audience: googleClientIds.length === 1 ? googleClientIds[0] : googleClientIds
      });
      payload = ticket.getPayload();
      console.log("[Google Login] token verified OK. email:", payload?.email, "aud:", payload?.aud);
    } catch (err) {
      const decoded = decodeJwtPayload(credential);
      const attemptedAudiences = googleClientIds.join(", ");
      console.error(
        "Google token verify failed:",
        err?.message || err,
        "| token aud:",
        decoded?.aud || "unknown",
        "| token azp:",
        decoded?.azp || "unknown",
        "| token iss:",
        decoded?.iss || "unknown",
        "| expected audience(s):",
        attemptedAudiences
      );
      return res.status(401).json({
        message: "Invalid Google token or client ID mismatch",
        debug: { tokenAud: decoded?.aud, tokenAzp: decoded?.azp, expected: attemptedAudiences, error: err?.message }
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
      queueAdminNewUserEmail({
        user,
        loginMethod: "google",
        requestedRole: normalizedRole
      });
      notifyNewBuyer(user.mobile || "", city, user.email);
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

    const mergeResult = await mergeSoftUserRequirements(user._id, mobile);

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
        sellerProfile: user.sellerProfile,
        mobile: user.mobile
      },
      merge: mergeResult.merged ? mergeResult : undefined
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
    const hasCategories =
      Array.isArray(sellerProfile.categories) &&
      sellerProfile.categories.filter((item) => String(item || "").trim()).length > 0;
    const hasSellerProfile = Boolean(
      String(req.user?.email || "").trim() &&
        String(req.user?.mobile || "").trim() &&
        String(req.user?.city || "").trim() &&
        String(sellerProfile.firmName || "").trim() &&
        String(sellerProfile.managerName || "").trim() &&
        hasCategories
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

/* -------- WHATSAPP LOGIN: Request session -------- */
router.post("/whatsapp/request", otpSendLimiter, async (req, res) => {
  const { mobile, city } = req.body || {};
  
  if (!mobile) {
    return res.status(400).json({ message: "Mobile number required" });
  }
  
  const mobileE164 = normalizeE164(mobile);
  if (!mobileE164) {
    return res.status(400).json({ message: "Invalid mobile number" });
  }
  
  // Generate 4-digit OTP for WhatsApp
  const { generateOtp, setOtp } = require("../services/auth/otpService");
  const otp = generateOtp(4);
  setOtp("whatsapp_login", mobileE164, otp, 2 * 60 * 1000);
  
  const { createLoginSession } = require("../services/auth/loginSession");
  const sessionData = createLoginSession(mobileE164, otp);
  
  return res.json({
    success: true,
    wa_link: sessionData.wa_link,
    expires_in: sessionData.expiresIn
  });
});

/* -------- WHATSAPP LOGIN: Verify OTP -------- */
router.post("/whatsapp/verify", otpVerifyLimiter, async (req, res) => {
  const { mobile, otp } = req.body || {};
  
  if (!mobile || !otp) {
    return res.status(400).json({ message: "Mobile and OTP required" });
  }
  
  const mobileE164 = normalizeE164(mobile);
  if (!mobileE164) {
    return res.status(400).json({ message: "Invalid mobile number" });
  }
  
  const { verifyOtp: verifyWaOtp } = require("../services/auth/otpService");
  const otpResult = verifyWaOtp("whatsapp_login", mobileE164, otp);
  
  if (!otpResult.ok) {
    const message = otpResult.reason === "expired" ? "OTP expired" 
      : otpResult.reason === "locked" ? "Too many attempts" 
      : "Invalid OTP";
    return res.status(otpResult.reason === "locked" ? 429 : 401).json({ message });
  }
  
  // Find or create user
  let user = await User.findOne({ mobile: mobileE164 });
  if (!user) {
    user = await User.create({
      mobile: mobileE164,
      city: req.body?.city || "user_default",
      roles: { buyer: true, seller: false, admin: false },
      name: "WhatsApp User"
    });
  }
  
  ensureRoles(user);
  
  const token = jwt.sign(
    { id: user._id, role: "buyer", tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  
  const mergeResult = await mergeSoftUserRequirements(user._id, mobileE164);
  
  return res.json({
    success: true,
    user: {
      _id: user._id,
      email: user.email,
      mobile: user.mobile,
      role: "buyer",
      roles: user.roles,
      city: user.city,
      name: user.name,
      preferredCurrency: user.preferredCurrency || "INR"
    },
    token,
    merge: mergeResult.merged ? mergeResult : undefined
  });
});

module.exports = router;
