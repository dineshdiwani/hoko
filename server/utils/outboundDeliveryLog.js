const OutboundDeliveryLog = require("../models/OutboundDeliveryLog");

function safeString(value, limit = 180) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > limit ? text.slice(0, limit) : text;
}

function scheduleOutboundLog(entry = {}) {
  if (String(process.env.OUTBOUND_DELIVERY_LOG_ENABLED || "true").trim().toLowerCase() === "false") {
    return;
  }

  setImmediate(() => {
    OutboundDeliveryLog.create({
      channel: String(entry.channel || "").trim().toLowerCase(),
      eventType: safeString(entry.eventType, 80),
      target: safeString(entry.target, 160),
      status: String(entry.status || "attempted").trim().toLowerCase(),
      provider: safeString(entry.provider, 80),
      providerMessageId: safeString(entry.providerMessageId, 120),
      attempts: Math.max(1, Number(entry.attempts || 1)),
      messagePreview: safeString(entry.messagePreview || entry.message, 220),
      metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
      error: entry.error || null
    }).catch(() => {});
  });
}

module.exports = {
  scheduleOutboundLog
};
