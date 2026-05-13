const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Requirement = require("../models/Requirement");
const TempRequirement = require("../models/TempRequirement");
const router = express.Router();
const {
  setOtp,
  verifyOtp,
  claimOtpSend,
  releaseOtpSend
} = require("../utils/otpStore");
const { sendAdminEventEmail, sendOtpEmail } = require("../utils/sendEmail");
const { recordAppEvent } = require("../utils/appEvents");
const {
  otpSendLimiter,
  otpVerifyLimiter
} = require("../middleware/rateLimit");
const { notifyNewBuyer, notifyNewSeller } = require("../services/adminNotifications");
const { normalizeE164 } = require("../utils/sendWhatsApp");
const { sendOtpSms } = require("../utils/sendSms");
const { isCompleteSellerProfile } = require("../utils/sellerProfile");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const OTP_TTL_MS =
  Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_SEND_COOLDOWN_MS =
  Number(process.env.OTP_SEND_COOLDOWN_SECONDS || 30) * 1000;
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
    deletedAt: null,
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
  "482189438712-b1n0ktef1lp5m3f6ch5c424086bdmber.apps.googleusercontent.com",
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

function isSoftDeletedUser(user) {
  return Boolean(user?.deletedAt);
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
    const cooldownKey = `login:${mobileE164}`;
    const cooldown = claimOtpSend(cooldownKey, OTP_SEND_COOLDOWN_MS);
    if (!cooldown.ok) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldown.retryAfterMs || 0) / 1000));
      return res.status(429).json({
        message: "Please wait before requesting another OTP",
        retryAfterSeconds
      });
    }
    let user = await User.findOne({ mobile: mobileE164 });
    if (isSoftDeletedUser(user)) {
      return res.status(403).json({ message: "User account deleted" });
    }
    if (!user) {
      user = await User.create({
        mobile: mobileE164,
        city: city || "user_default",
        roles: { buyer: true, seller: false, admin: false },
        name: "WhatsApp User"
      });
    }
const otp = generateOtp();
    console.log("[AUTH] Sending OTP to:", mobileE164, "via Fast2SMS DLT");
    try {
      const mobileDigits = mobileE164.replace(/^\+/, "");
      await sendOtpSms({ mobile: mobileDigits, otp });
      recordAppEvent({
        eventType: "otp_sent",
        actorRole: "buyer",
        source: "auth.login.sms",
        payload: { mobile: mobileE164 }
      });
    } catch (err) {
      console.error("[AUTH] OTP SMS send failed:", err.message);
      releaseOtpSend(cooldownKey);
      const body = { message: "Failed to send OTP" };
      if (process.env.NODE_ENV !== "production") {
        body.error = err?.response || err?.message || "Unknown Fast2SMS error";
      }
      return res.status(500).json(body);
    }
    setOtp(`login:${mobileE164}`, otp, OTP_TTL_MS);
    return res.json({ success: true, method: "sms", mobile: mobileE164 });
  }
  
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = role === "seller" ? "seller" : "buyer";

  if (!normalizedEmail) {
    return res.status(400).json({ message: "Email required" });
  }
  const cooldownKey = `login:${normalizedEmail}`;
  const cooldown = claimOtpSend(cooldownKey, OTP_SEND_COOLDOWN_MS);
  if (!cooldown.ok) {
    const retryAfterSeconds = Math.max(1, Math.ceil((cooldown.retryAfterMs || 0) / 1000));
    return res.status(429).json({
      message: "Please wait before requesting another OTP",
      retryAfterSeconds
    });
  }

let user = await User.findOne({ email: normalizedEmail });
  if (isSoftDeletedUser(user)) {
    return res.status(403).json({ message: "User account deleted" });
  }
  if (!user) {
    if (normalizedRole === "seller" && !city) {
      return res.status(403).json({
        message: "Complete buyer login and seller registration first"
      });
    }
    user = await User.create({
      email: normalizedEmail,
      city: city || "",
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
      notifyNewSeller(user.mobile || "", city || "", user.sellerProfile?.registeredBusinessName || user.email, user.email);
    } else {
      notifyNewBuyer(user.mobile || "", city || "", user.email);
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
      recordAppEvent({
        eventType: "otp_sent",
        actorRole: normalizedRole,
        source: "auth.login.email",
        payload: { email: normalizedEmail, role: normalizedRole }
      });
      setOtp(`login:${normalizedEmail}`, otp, OTP_TTL_MS);
      return res.json({ success: true });
  } catch (err) {
    console.error("OTP email send failed:", err.message);
    releaseOtpSend(cooldownKey);
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
    if (isSoftDeletedUser(user)) {
      return res.status(403).json({ message: "User account deleted" });
    }
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const normalizedRole = role === "seller" ? "seller" : "buyer";
    if (normalizedRole === "seller") {
      const hasSellerProfile = isCompleteSellerProfile(user);
      if (!hasSellerProfile) {
        const token = jwt.sign(
          { id: user._id, role: normalizedRole, tokenVersion: user.tokenVersion || 0 },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        recordAppEvent({
          eventType: "otp_verified",
          actorRole: normalizedRole,
          userId: user._id,
          source: "auth.verify-otp.mobile",
          payload: { role: normalizedRole, hasSellerProfile: false }
        });
        return res.status(200).json({
          success: true,
          requiresSellerRegistration: true,
          user: {
            _id: user._id,
            email: user.email,
            role: normalizedRole,
            roles: user.roles,
            city: user.city,
            name: user.name,
            preferredCurrency: user.preferredCurrency || "INR",
            mobile: user.mobile,
            sellerProfile: user.sellerProfile || {}
          },
          token
        });
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
    recordAppEvent({
      eventType: "otp_verified",
      actorRole: normalizedRole,
      userId: user._id,
      source: "auth.verify-otp.email",
      payload: { role: normalizedRole, hasSellerProfile: isCompleteSellerProfile(user) }
    });
    
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
        mobile: user.mobile,
        sellerProfile: user.sellerProfile || {}
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
  if (isSoftDeletedUser(user)) {
    return res.status(403).json({ message: "User account deleted" });
  }
  ensureRoles(user);

  if (city) {
    user.city = city;
  }

  if (normalizedRole === "seller") {
    const hasSellerProfile = isCompleteSellerProfile(user);
    if (!hasSellerProfile) {
      const token = jwt.sign(
        { id: user._id, role: normalizedRole, tokenVersion: user.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.status(200).json({
        success: true,
        requiresSellerRegistration: true,
        user: {
          _id: user._id,
          email: user.email,
          role: normalizedRole,
          roles: user.roles,
          city: user.city,
          name: user.name,
          preferredCurrency: user.preferredCurrency || "INR",
          mobile: user.mobile,
          sellerProfile: user.sellerProfile || {}
        },
        token
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
    user.termsAccepted = { at: new Date(), termsVersion: "1.0", privacyVersion: "1.0" };
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
      mobile: user.mobile,
      termsAccepted: user.termsAccepted
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
    if (isSoftDeletedUser(user)) {
      return res.status(403).json({ message: "User account deleted" });
    }
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
      const hasSellerProfile = isCompleteSellerProfile(user);
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
        user.termsAccepted = { at: new Date(), termsVersion: "1.0", privacyVersion: "1.0" };
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
    recordAppEvent({
      eventType: "login_success",
      actorRole: normalizedRole,
      userId: user._id,
      source: "auth.google",
      payload: { email }
    });

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
  
  let currentUser = req.user;
  if (nextRole === "seller") {
    currentUser = await User.findById(req.user._id).lean();
  }
  
  if (nextRole === "seller") {
    const sellerProfile = currentUser?.sellerProfile || {};
    const hasSellerProfile = isCompleteSellerProfile({
      ...currentUser,
      sellerProfile
    });
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
  recordAppEvent({
    eventType: "role_switched",
    actorRole: nextRole,
    userId: req.user._id,
    source: "auth.switch-role"
  });

  res.json({
    token,
    user: {
      _id: currentUser._id,
      email: currentUser.email,
      role: nextRole,
      roles: currentUser.roles,
      city: currentUser.city,
      preferredCurrency: currentUser.preferredCurrency || "INR",
      sellerProfile: currentUser.sellerProfile
    }
  });
});

router.post("/refresh", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const role = req.user.role === "seller" && user.roles?.seller ? "seller" : "buyer";
    const token = jwt.sign(
      { id: user._id, role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        role,
        roles: user.roles,
        city: user.city,
        preferredCurrency: user.preferredCurrency || "INR",
        sellerProfile: user.sellerProfile,
        mobile: user.mobile,
        termsAccepted: user.termsAccepted,
        name: user.name,
        googleProfile: user.googleProfile
      }
    });
  } catch (err) {
    return res.status(500).json({ message: "Session refresh failed" });
  }
});

router.get("/terms-version", async (req, res) => {
  try {
    const PlatformSettings = require("../models/PlatformSettings");
    const settings = await PlatformSettings.findOne({ key: "global" }).lean();
    const termsVersion = settings?.termsAndConditions?.version || "1.0";
    const privacyVersion = settings?.privacyPolicy?.version || "1.0";
    res.json({ termsVersion, privacyVersion });
  } catch {
    res.json({ termsVersion: "1.0", privacyVersion: "1.0" });
  }
});

router.post("/accept-terms", require("../middleware/auth"), async (req, res) => {
  try {
    const PlatformSettings = require("../models/PlatformSettings");
    const settings = await PlatformSettings.findOne({ key: "global" }).lean();
    const termsVersion = settings?.termsAndConditions?.version || "1.0";
    const privacyVersion = settings?.privacyPolicy?.version || "1.0";

    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        "termsAccepted.at": new Date(),
        "termsAccepted.termsVersion": termsVersion,
        "termsAccepted.privacyVersion": privacyVersion
      }
    });

    res.json({ success: true, termsVersion, privacyVersion });
  } catch (err) {
    res.status(500).json({ message: "Failed to accept terms" });
  }
});

module.exports = router;
