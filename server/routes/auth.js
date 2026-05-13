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
const { mergeUsersByCredentials } = require("../utils/userMerge");

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

async function mergeSoftUserRequirements(userId, mobileE164, extra = {}) {
  if (!userId) return { merged: false };

  const targetUser = await User.findById(userId);
  if (!targetUser) return { merged: false };

  const result = await mergeUsersByCredentials({
    targetUser,
    patch: extra.patch || {},
    candidateEmails: [
      extra.email,
      targetUser.email
    ].filter(Boolean),
    candidateMobiles: [
      mobileE164,
      extra.mobile,
      targetUser.mobile
    ].filter(Boolean)
  });

  return {
    merged: Boolean(result.merged),
    mergedUserIds: result.mergedUserIds || [],
    user: result.user || targetUser
  };
}

async function mergeExistingRequirements(userId, mobileE164, extra = {}) {
  return mergeSoftUserRequirements(userId, mobileE164, extra);
}

async function mergeLoginAccount(user, { email = "", mobile = "", patch = {} } = {}) {
  if (!user) return { merged: false, user: null };
  const mergeResult = await mergeUsersByCredentials({
    targetUser: user,
    patch,
    candidateEmails: [email, user?.email, user?.googleProfile?.email].filter(Boolean),
    candidateMobiles: [mobile, user?.mobile, user?.phone].filter(Boolean)
  });
  return {
    merged: Boolean(mergeResult.merged),
    mergedUserIds: mergeResult.mergedUserIds || [],
    user: mergeResult.user || user
  };
}

function queueGooglePostLoginMerge(userId, mobileE164, email, label) {
  if (!userId) return;
  setImmediate(() => {
    Promise.resolve(
      mergeSoftUserRequirements(userId, mobileE164, { email })
    ).catch((mergeErr) => {
      console.log(
        `[Google Login] ${label} merge skipped:`,
        mergeErr?.message || mergeErr
      );
    });
  });
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

function getEffectiveBuyerCity(user) {
  const city = String(
    user?.city ||
      user?.buyerSettings?.defaultCity ||
      user?.sellerProfile?.city ||
      ""
  ).trim();
  return city && city.toLowerCase() !== "user_default" ? city : "";
}

function getDisplayNameForUser(user, roleFallback = "buyer") {
  const rawName = String(user?.name || "").trim();
  const lower = rawName.toLowerCase();
  const placeholders = new Set([
    "whatsapp user",
    "app user",
    "buyer",
    "seller",
    "user",
    "unknown",
    "user_default"
  ]);
  if (rawName && !placeholders.has(lower)) return rawName;
  if (roleFallback === "seller") {
    const registeredBusinessName = String(user?.sellerProfile?.registeredBusinessName || "").trim();
    if (registeredBusinessName) return registeredBusinessName;
  }
  const mobile = String(user?.mobile || "").trim();
  if (mobile) return mobile;
  return roleFallback === "seller" ? "Seller" : "Buyer";
}

function getUserAddress(user) {
  return String(user?.address || user?.sellerProfile?.businessAddress || "").trim();
}

function buildAuthUserPayload(user, roleFallback = "buyer", extra = {}) {
  const displayName = getDisplayNameForUser(user, roleFallback);
  return {
    _id: user?._id,
    email: user?.email || "",
    role: extra.role || roleFallback,
    roles: user?.roles || {},
    city: getEffectiveBuyerCity(user),
    preferredCurrency: user?.preferredCurrency || "INR",
    sellerProfile: user?.sellerProfile || {},
    mobile: user?.mobile || "",
    name: displayName,
    displayName,
    address: getUserAddress(user),
    ...extra
  };
}

function isSoftDeletedUser(user) {
  return Boolean(user?.deletedAt);
}

function reactivateSoftDeletedUser(user, { reason = "" } = {}) {
  if (!user) return false;
  const wasSoftDeleted = Boolean(user.deletedAt);
  if (!wasSoftDeleted) return false;
  user.deletedAt = null;
  user.deletedByAdminId = null;
  user.deletedReason = "";
  user.blocked = false;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  return true;
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
  const normalizedRole = role === "seller" ? "seller" : "buyer";
  
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
      reactivateSoftDeletedUser(user);
      await user.save();
    }
    if (!user) {
      user = await User.create({
        mobile: mobileE164,
        city: String(city || "").trim(),
        roles: {
          buyer: true,
          seller: normalizedRole === "seller",
          admin: false
        }
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
    reactivateSoftDeletedUser(user);
    await user.save();
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
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (isSoftDeletedUser(user)) {
      reactivateSoftDeletedUser(user);
      await user.save();
    }
    
    const normalizedRole = role === "seller" ? "seller" : "buyer";
    let loginUser = user;
    try {
      const merged = await mergeLoginAccount(user, { mobile: mobileE164 });
      loginUser = merged.user || user;
    } catch (mergeErr) {
      console.log("[AUTH] mobile login merge skipped:", mergeErr?.message || mergeErr);
    }
    if (normalizedRole === "seller") {
      const hasSellerProfile = isCompleteSellerProfile(loginUser);
      if (!hasSellerProfile) {
        const token = jwt.sign(
          { id: loginUser._id, role: normalizedRole, tokenVersion: loginUser.tokenVersion || 0 },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        recordAppEvent({
          eventType: "otp_verified",
          actorRole: normalizedRole,
          userId: loginUser._id,
          source: "auth.verify-otp.mobile",
          payload: { role: normalizedRole, hasSellerProfile: false }
        });
        return res.status(200).json({
          success: true,
          requiresSellerRegistration: true,
          user: buildAuthUserPayload(loginUser, normalizedRole),
          token
        });
      }
    }
    
    if (city) {
      user.city = city;
      await user.save();
    }
    
    const token = jwt.sign(
      { id: loginUser._id, role: normalizedRole, tokenVersion: loginUser.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    recordAppEvent({
      eventType: "otp_verified",
      actorRole: normalizedRole,
      userId: loginUser._id,
      source: "auth.verify-otp.email",
      payload: { role: normalizedRole, hasSellerProfile: isCompleteSellerProfile(loginUser) }
    });
    
    const mergeResult = await mergeSoftUserRequirements(loginUser._id, mobileE164);
    return res.json({
      success: true,
      user: {
        _id: loginUser._id,
        email: loginUser.email,
        role: normalizedRole,
        roles: loginUser.roles,
        city: getEffectiveBuyerCity(loginUser),
        name: getDisplayNameForUser(loginUser, normalizedRole),
        preferredCurrency: loginUser.preferredCurrency || "INR",
        mobile: loginUser.mobile,
        sellerProfile: loginUser.sellerProfile || {}
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
    reactivateSoftDeletedUser(user);
    await user.save();
  }
  ensureRoles(user);

  if (city) {
    user.city = city;
  }

  let loginUser = user;
  try {
    const merged = await mergeLoginAccount(user, { email: normalizedEmail });
    loginUser = merged.user || user;
  } catch (mergeErr) {
    console.log("[AUTH] email login merge skipped:", mergeErr?.message || mergeErr);
  }

  if (normalizedRole === "seller") {
    const hasSellerProfile = isCompleteSellerProfile(loginUser);
    if (!hasSellerProfile) {
      const token = jwt.sign(
        { id: loginUser._id, role: normalizedRole, tokenVersion: loginUser.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.status(200).json({
        success: true,
        requiresSellerRegistration: true,
        user: buildAuthUserPayload(loginUser, normalizedRole),
        token
      });
    }
    if (!loginUser.termsAccepted?.at && !acceptTerms) {
      return res.status(403).json({
        message: "Terms required"
      });
    }
    loginUser.roles.seller = true;
  } else {
    if (!loginUser.termsAccepted?.at && !acceptTerms) {
      return res.status(403).json({
        message: "Terms required"
      });
    }
    loginUser.roles.buyer = true;
  }
  if (!loginUser.termsAccepted?.at && acceptTerms) {
    loginUser.termsAccepted = { at: new Date(), termsVersion: "1.0", privacyVersion: "1.0" };
  }
  await loginUser.save();

  const mergeResult = await mergeSoftUserRequirements(loginUser._id, mobile);

  const token = jwt.sign(
    { id: loginUser._id, role: normalizedRole, tokenVersion: loginUser.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      _id: loginUser._id,
      email: loginUser.email,
      role: normalizedRole,
      roles: loginUser.roles,
      city: getEffectiveBuyerCity(loginUser),
      preferredCurrency: loginUser.preferredCurrency || "INR",
      sellerProfile: loginUser.sellerProfile,
      mobile: loginUser.mobile,
      termsAccepted: loginUser.termsAccepted
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
      Promise.resolve(notifyNewBuyer(user.mobile || "", city, user.email)).catch((err) => {
        console.log("[Google Login] notifyNewBuyer failed:", err?.message || err);
      });
    } else {
      if (isSoftDeletedUser(user)) {
        reactivateSoftDeletedUser(user);
      }
      ensureRoles(user);
      if (!user.city && city) {
        user.city = city;
      } else if (city) {
        user.city = city;
      }
      let loginUser = user;
      try {
        const merged = await mergeLoginAccount(user, { email, mobile });
        loginUser = merged.user || user;
      } catch (mergeErr) {
        console.log("[Google Login] pre-check merge skipped:", mergeErr?.message || mergeErr);
      }
      if (normalizedRole === "seller") {
        const hasSellerProfile = isCompleteSellerProfile(loginUser);
        if (!hasSellerProfile) {
          if (!loginUser.termsAccepted?.at && !acceptTerms) {
            return res.status(403).json({
              message: "Terms required"
            });
          }
          if (!loginUser.termsAccepted?.at && acceptTerms) {
            loginUser.termsAccepted = { at: new Date(), termsVersion: "1.0", privacyVersion: "1.0" };
          }
          loginUser.googleProfile = {
            sub,
            name,
            picture
          };
          let persistedUser = loginUser;
          try {
            persistedUser = await loginUser.save();
          } catch (saveErr) {
            console.log("[Google Login] seller save skipped:", saveErr?.message || saveErr);
          }
          queueGooglePostLoginMerge(persistedUser._id || user._id, mobile, email, "seller");

          const token = jwt.sign(
            { id: persistedUser._id || user._id, role: normalizedRole, tokenVersion: persistedUser.tokenVersion || user.tokenVersion || 0 },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
          );
          recordAppEvent({
            eventType: "login_success",
            actorRole: normalizedRole,
            userId: persistedUser._id || user._id,
            source: "auth.google",
            payload: { email, requiresSellerRegistration: true }
          });

          return res.json({
            token,
            requiresSellerRegistration: true,
            user: buildAuthUserPayload(persistedUser, normalizedRole, {
              _id: persistedUser._id || user._id,
              email: persistedUser.email || user.email,
              picture,
              role: normalizedRole,
              roles: persistedUser.roles || user.roles,
              city: getEffectiveBuyerCity(persistedUser),
              preferredCurrency: persistedUser.preferredCurrency || user.preferredCurrency || "INR",
              sellerProfile: persistedUser.sellerProfile || user.sellerProfile,
              mobile: persistedUser.mobile || user.mobile
            })
          });
        }
        loginUser.roles.seller = true;
      } else {
        if (!loginUser.termsAccepted?.at && !acceptTerms) {
          return res.status(403).json({
            message: "Terms required"
          });
        }
        loginUser.roles.buyer = true;
      }
      if (!loginUser.termsAccepted?.at && acceptTerms) {
        loginUser.termsAccepted = { at: new Date(), termsVersion: "1.0", privacyVersion: "1.0" };
      }
      loginUser.googleProfile = {
        sub,
        name,
        picture
      };
      user = loginUser;
    }

    let persistedUser = user;
    try {
      persistedUser = await user.save();
    } catch (saveErr) {
      console.log("[Google Login] post-login save skipped:", saveErr?.message || saveErr);
    }
    queueGooglePostLoginMerge(persistedUser._id || user._id, mobile, email, "post-login");

    const token = jwt.sign(
      { id: persistedUser._id || user._id, role: normalizedRole, tokenVersion: persistedUser.tokenVersion || user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    recordAppEvent({
      eventType: "login_success",
      actorRole: normalizedRole,
      userId: persistedUser._id || user._id,
      source: "auth.google",
      payload: { email }
    });

    res.json({
      token,
      user: buildAuthUserPayload(persistedUser, normalizedRole, {
        _id: persistedUser._id || user._id,
        email: persistedUser.email || user.email,
        picture,
        role: normalizedRole,
        roles: persistedUser.roles || user.roles,
        city: getEffectiveBuyerCity(persistedUser),
        preferredCurrency: persistedUser.preferredCurrency || user.preferredCurrency || "INR",
        sellerProfile: persistedUser.sellerProfile || user.sellerProfile,
        mobile: persistedUser.mobile || user.mobile
      }),
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

  if (nextRole !== "seller" && !req.user?.roles?.[nextRole]) {
    return res.status(403).json({ message: "Role not enabled" });
  }
  
  let currentUser = req.user;
  if (nextRole === "seller") {
    currentUser = await User.findById(req.user._id);
    if (!currentUser) {
      return res.status(404).json({ message: "Invalid user" });
    }
    try {
      const merged = await mergeLoginAccount(currentUser, {
        email: currentUser.email,
        mobile: currentUser.mobile
      });
      currentUser = merged.user || currentUser;
    } catch (mergeErr) {
      console.log("[AUTH] switch-role merge skipped:", mergeErr?.message || mergeErr);
    }
  }
  
  if (nextRole === "seller") {
    const sellerProfile = currentUser?.sellerProfile || {};
    const hasSellerProfile = isCompleteSellerProfile({
      ...currentUser,
      sellerProfile
    });
    if (!hasSellerProfile) {
      const token = jwt.sign(
        { id: req.user._id, role: nextRole, tokenVersion: req.user.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.json({
        token,
        requiresSellerRegistration: true,
        user: buildAuthUserPayload(currentUser, nextRole)
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
    user: buildAuthUserPayload(currentUser, nextRole)
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
        ...buildAuthUserPayload(user, role),
        termsAccepted: user.termsAccepted,
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
