const NotificationGuard = require("../models/NotificationGuard");

function normalizeGuardKey(value) {
  return String(value || "").trim();
}

async function claimNotificationGuard(key, ttlMs = 2 * 60 * 1000, kind = "") {
  const normalizedKey = normalizeGuardKey(key);
  if (!normalizedKey) return { ok: false, reason: "missing" };

  const now = Date.now();
  const expiresAt = new Date(now + Math.max(30 * 1000, Number(ttlMs) || 0));

  try {
    const existing = await NotificationGuard.findOne({
      key: normalizedKey,
      expiresAt: { $gt: new Date(now) }
    }).lean();
    if (existing) {
      return { ok: false, reason: "duplicate" };
    }
  } catch {
    // Fall through to best-effort create path.
  }

  try {
    await NotificationGuard.create({
      key: normalizedKey,
      kind: String(kind || "").trim(),
      expiresAt
    });
    return { ok: true };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, reason: "duplicate" };
    }
    return { ok: false, reason: "error" };
  }
}

module.exports = {
  claimNotificationGuard
};
