const crypto = require("crypto");

const otpStore = new Map();

const OTP_LENGTH = 6;
const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;

function generateOtp() {
  return String(Math.floor(Math.random() * Math.pow(10, OTP_LENGTH))).padStart(OTP_LENGTH, "0");
}

function generateOtpKey(type, identifier) {
  return `${type}:${identifier}`;
}

function setOtp(type, identifier, otp, ttlMs = OTP_TTL_MS) {
  const key = generateOtpKey(type, identifier);
  const expiresAt = Date.now() + ttlMs;
  
  otpStore.set(key, {
    otp,
    expiresAt,
    attempts: 0,
    type,
    identifier
  });
  
  return { otp, expiresAt: Math.floor(expiresAt / 1000) };
}

function getOtpRecord(type, identifier) {
  const key = generateOtpKey(type, identifier);
  return otpStore.get(key);
}

function verifyOtp(type, identifier, providedOtp) {
  const key = generateOtpKey(type, identifier);
  const record = otpStore.get(key);
  
  if (!record) {
    return { ok: false, reason: "not_found" };
  }
  
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { ok: false, reason: "expired" };
  }
  
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { ok: false, reason: "locked" };
  }
  
  if (record.otp !== providedOtp) {
    record.attempts += 1;
    otpStore.set(key, record);
    return { ok: false, reason: "invalid", attemptsLeft: OTP_MAX_ATTEMPTS - record.attempts };
  }
  
  otpStore.delete(key);
  return { ok: true };
}

function clearOtp(type, identifier) {
  const key = generateOtpKey(type, identifier);
  otpStore.delete(key);
}

function cleanupExpiredOtps() {
  const now = Date.now();
  for (const [key, record] of otpStore) {
    if (now > record.expiresAt) {
      otpStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredOtps, 60 * 1000);

module.exports = {
  generateOtp,
  setOtp,
  getOtpRecord,
  verifyOtp,
  clearOtp,
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS
};
