function normalizeNotificationCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    [
      "chat",
      "offer",
      "offer_outcome",
      "reverse_auction",
      "lead",
      "requirement",
      "info"
    ].includes(normalized)
  ) {
    return normalized;
  }
  return "";
}

function getNotificationDefaults(type) {
  const normalizedType = String(type || "").trim().toLowerCase();
  switch (normalizedType) {
    case "new_message":
      return {
        category: "chat",
        event: "new_message",
        title: "Chat Message"
      };
    case "new_offer":
      return {
        category: "offer",
        event: "new_offer",
        title: "New Offer"
      };
    case "offer_viewed":
      return {
        category: "offer",
        event: "offer_viewed",
        title: "Offer Viewed"
      };
    case "offer_outcome_updated":
      return {
        category: "offer_outcome",
        event: "offer_outcome_updated",
        title: "Offer Outcome Updated"
      };
    case "reverse_auction":
    case "reverse_auction_invoked":
      return {
        category: "reverse_auction",
        event: "reverse_auction_invoked",
        title: "Reverse Auction"
      };
    case "new_post":
      return {
        category: "lead",
        event: "new_post",
        title: "New Buyer Post"
      };
    case "requirement_updated":
      return {
        category: "requirement",
        event: "requirement_updated",
        title: "Requirement Updated"
      };
    default:
      return {
        category: "info",
        event: normalizedType || "info",
        title: "Notification"
      };
  }
}

function buildNotificationData(type, data = {}) {
  const safeData = data && typeof data === "object" ? data : {};
  const defaults = getNotificationDefaults(type);
  const category =
    normalizeNotificationCategory(safeData.category) || defaults.category;
  const event = String(safeData.event || defaults.event || "").trim() || defaults.event;
  const title = String(safeData.title || defaults.title || "Notification").trim();
  const state = String(safeData.state || "").trim().toLowerCase() || null;
  const entityType = String(safeData.entityType || "").trim() || null;
  const entityId = String(safeData.entityId || "").trim() || null;
  const requirementId =
    String(safeData.requirementId || safeData.entityRequirementId || "").trim() || null;
  const url = String(safeData.url || "").trim() || null;

  return {
    ...safeData,
    category,
    event,
    title,
    state,
    entityType,
    entityId,
    requirementId,
    url
  };
}

function serializeNotification(notification, options = {}) {
  if (!notification) return null;
  const raw =
    typeof notification.toObject === "function"
      ? notification.toObject()
      : { ...notification };
  const data = buildNotificationData(raw.type, raw.data);
  const fallbackUrl = String(options.fallbackUrl || "").trim() || null;
  return {
    ...raw,
    title: data.title,
    category: data.category,
    event: data.event,
    state: data.state,
    entityType: data.entityType,
    entityId: data.entityId,
    data: {
      ...data,
      url: data.url || fallbackUrl
    }
  };
}

function getLegacyTypesForCategory(category) {
  switch (normalizeNotificationCategory(category)) {
    case "chat":
      return ["new_message"];
    case "offer":
      return ["new_offer", "offer_viewed"];
    case "offer_outcome":
      return ["offer_outcome_updated"];
    case "reverse_auction":
      return ["reverse_auction", "reverse_auction_invoked"];
    case "lead":
      return ["new_post"];
    case "requirement":
      return ["requirement_updated"];
    default:
      return [];
  }
}

module.exports = {
  buildNotificationData,
  getLegacyTypesForCategory,
  normalizeNotificationCategory,
  serializeNotification
};
