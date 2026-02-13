const otpMap = new Map();

function setOtp(key, otp, ttlMs = 5 * 60 * 1000) {
  const expiresAt = Date.now() + ttlMs;
  otpMap.set(key, { otp, expiresAt, attempts: 0 });
}

function clearOtp(key) {
  otpMap.delete(key);
}

function verifyOtp(key, providedOtp, maxAttempts = 5) {
  const record = otpMap.get(key);
  if (!record) {
    return { ok: false, reason: "missing" };
  }
  if (Date.now() > record.expiresAt) {
    otpMap.delete(key);
    return { ok: false, reason: "expired" };
  }
  if (record.attempts >= maxAttempts) {
    otpMap.delete(key);
    return { ok: false, reason: "locked" };
  }
  if (record.otp !== providedOtp) {
    record.attempts += 1;
    otpMap.set(key, record);
    return { ok: false, reason: "invalid" };
  }
  otpMap.delete(key);
  return { ok: true };
}

module.exports = {
  setOtp,
  clearOtp,
  verifyOtp
};
