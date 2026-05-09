const AppEvent = require("../models/AppEvent");

function truncateValue(value, limit = 240) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > limit ? text.slice(0, limit) : text;
}

function recordAppEvent(entry = {}) {
  if (String(process.env.APP_EVENT_LOG_ENABLED || "true").trim().toLowerCase() === "false") {
    return;
  }

  setImmediate(() => {
    AppEvent.create({
      eventType: truncateValue(entry.eventType, 80) || "unknown",
      userId: entry.userId || null,
      actorRole: truncateValue(entry.actorRole, 30),
      requirementId: entry.requirementId || null,
      offerId: entry.offerId || null,
      chatMessageId: entry.chatMessageId || null,
      source: truncateValue(entry.source, 80),
      status: entry.status || "success",
      payload: entry.payload && typeof entry.payload === "object" ? entry.payload : {},
      error: truncateValue(entry.error, 500)
    }).catch(() => {});
  });
}

module.exports = {
  recordAppEvent
};
