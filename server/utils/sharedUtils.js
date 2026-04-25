const { REQUIREMENT_STATUS } = require("./constants");

function normalizeOfferInvitedFrom(value) {
  const normalized = String(value || "").toLowerCase().trim();
  return normalized === "anywhere" ? "anywhere" : "city";
}

function normalizeRequirementStatus(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (["closed", "fulfilled", "cancelled", "expired"].includes(normalized)) {
    return normalized;
  }
  return REQUIREMENT_STATUS.OPEN;
}

function getEffectiveRequirementStatus(requirement) {
  const explicitStatus = normalizeRequirementStatus(requirement?.status);
  if (explicitStatus !== REQUIREMENT_STATUS.OPEN) return explicitStatus;
  const expiresAt = requirement?.expiresAt ? new Date(requirement.expiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    return REQUIREMENT_STATUS.EXPIRED;
  }
  return REQUIREMENT_STATUS.OPEN;
}

function apiError(res, message, statusCode = 400) {
  return res.status(statusCode).json({ success: false, message });
}

function apiSuccess(res, data, message = "Success") {
  return res.json({ success: true, message, data });
}

module.exports = {
  normalizeOfferInvitedFrom,
  normalizeRequirementStatus,
  getEffectiveRequirementStatus,
  apiError,
  apiSuccess
};