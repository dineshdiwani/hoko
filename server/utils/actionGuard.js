const crypto = require("crypto");
const ActionGuard = require("../models/ActionGuard");

function normalizeGuardValue(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPayload(parts = []) {
  const raw = parts.map((part) => normalizeGuardValue(part)).join("|");
  return crypto.createHash("sha1").update(raw).digest("hex");
}

function buildGuardKey(actionType, actorId, payloadHash) {
  return [
    normalizeGuardValue(actionType),
    normalizeGuardValue(actorId),
    normalizeGuardValue(payloadHash)
  ].join(":");
}

async function claimActionGuard({
  actionType,
  actorId,
  payloadParts = [],
  ttlMs = 15 * 1000,
  referenceType = "",
  referenceId = null
}) {
  const payloadHash = hashPayload(payloadParts);
  const key = buildGuardKey(actionType, actorId, payloadHash);
  const expiresAt = new Date(Date.now() + Math.max(1000, Number(ttlMs) || 15000));

  try {
    const doc = await ActionGuard.create({
      key,
      actionType: normalizeGuardValue(actionType),
      payloadHash,
      actorId: actorId || null,
      referenceType: normalizeGuardValue(referenceType),
      referenceId: referenceId || null,
      expiresAt
    });
    return { claimed: true, key, payloadHash, guard: doc };
  } catch (err) {
    if (err?.code !== 11000) {
      throw err;
    }

    const existing = await ActionGuard.findOne({ key }).lean();
    return {
      claimed: false,
      duplicate: true,
      key,
      payloadHash,
      guard: existing || null
    };
  }
}

async function attachActionReference(key, referenceType, referenceId) {
  if (!key || !referenceId) return null;
  return ActionGuard.findOneAndUpdate(
    { key },
    {
      $set: {
        referenceType: normalizeGuardValue(referenceType),
        referenceId
      }
    },
    { new: true }
  ).lean();
}

async function releaseActionGuard(key) {
  if (!key) return;
  await ActionGuard.deleteOne({ key }).catch(() => {});
}

module.exports = {
  claimActionGuard,
  attachActionReference,
  releaseActionGuard,
  hashPayload,
  buildGuardKey
};
