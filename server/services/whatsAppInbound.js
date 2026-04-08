const { normalizeE164 } = require("../utils/sendWhatsApp");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function parseDeliveryDays(text) {
  const match = String(text || "").match(/(\d{1,3})\s*(day|days|d)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parsePrice(text) {
  const raw = String(text || "");
  const match = raw.match(
    /\b(?:rs\.?|inr|price|quote|quoted|offer)?\s*[:\-]?\s*(\d{2,7}(?:[.,]\d{1,2})?)\b/i
  );
  if (!match) return null;
  const normalized = Number(String(match[1]).replace(/,/g, ""));
  return Number.isFinite(normalized) ? normalized : null;
}

function classifyInboundText(text) {
  const raw = String(text || "").trim();
  const normalizedText = normalizeText(raw);
  const keyword = normalizedText.split(/\s+/)[0] || "";
  const detectedPrice = parsePrice(raw);
  const detectedDeliveryDays = parseDeliveryDays(raw);

  if (!normalizedText) {
    return {
      kind: "unknown",
      keyword: "",
      normalizedText,
      detectedPrice: null,
      detectedDeliveryDays: null
    };
  }

  if (keyword === "register") {
    return {
      kind: "register",
      keyword,
      normalizedText,
      detectedPrice,
      detectedDeliveryDays
    };
  }

  if (keyword === "help") {
    return {
      kind: "help",
      keyword,
      normalizedText,
      detectedPrice,
      detectedDeliveryDays
    };
  }

  if (keyword === "link") {
    return {
      kind: "link",
      keyword,
      normalizedText,
      detectedPrice,
      detectedDeliveryDays
    };
  }

  if (
    detectedPrice !== null ||
    /\b(interested|available|quote|price|call me|callback|send details)\b/i.test(raw)
  ) {
    return {
      kind: "offer_intent",
      keyword,
      normalizedText,
      detectedPrice,
      detectedDeliveryDays
    };
  }

  return {
    kind: "unknown",
    keyword,
    normalizedText,
    detectedPrice,
    detectedDeliveryDays
  };
}

function parseRegisterPayload(text) {
  const raw = String(text || "").trim();
  if (!/^register\b/i.test(raw)) {
    return null;
  }

  const parts = raw
    .split("|")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (parts.length < 6) {
    return {
      isStructured: false,
      firmName: "",
      managerName: "",
      category: "",
      city: "",
      email: ""
    };
  }

  return {
    isStructured: true,
    firmName: parts[1] || "",
    managerName: parts[2] || "",
    category: parts[3] || "",
    city: parts[4] || "",
    email: parts[5] || ""
  };
}

function extractMetaEvents(body) {
  const configuredProvider = String(process.env.WHATSAPP_PROVIDER || "meta")
    .trim()
    .toLowerCase();
  const provider =
    configuredProvider === "wapi" || configuredProvider === "gupshup"
      ? configuredProvider
      : "meta";
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return entries.flatMap((entry) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change) => {
      const value = change?.value || {};
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      return messages
        .filter((message) => message?.type === "text" && message?.text?.body)
        .map((message) => ({
          provider,
          mobileE164: normalizeE164(message.from),
          text: String(message.text.body || "").trim(),
          providerMessageId: String(message.id || "").trim(),
          profileName: String(contacts[0]?.profile?.name || "").trim()
        }));
    })
  );
}

function extractFallbackFormEvents(body) {
  const configuredProvider = String(process.env.WHATSAPP_PROVIDER || "wapi")
    .trim()
    .toLowerCase();
  const provider = configuredProvider === "meta" ? "meta" : configuredProvider || "wapi";
  const mobileE164 = normalizeE164(body?.From || body?.WaId || body?.from || body?.mobile);
  const text = String(body?.Body || body?.message || body?.text || "").trim();
  if (!mobileE164 || !text) return [];
  return [
    {
      provider,
      mobileE164,
      text,
      providerMessageId: String(body?.MessageSid || body?.messageId || body?.id || "").trim(),
      profileName: String(body?.ProfileName || body?.profileName || body?.name || "").trim()
    }
  ];
}

function extractGupshupEvents(body) {
  if (String(body?.type || "").trim().toLowerCase() !== "message") {
    return [];
  }
  const payload = body?.payload || {};
  const content = payload?.payload || {};
  const messageType = String(payload?.type || "").trim().toLowerCase();
  const text =
    messageType === "text"
      ? String(content?.text || content?.body || "").trim()
      : String(content?.title || content?.text || "").trim();
  const mobileE164 = normalizeE164(payload?.sender?.phone || payload?.source);
  if (!mobileE164 || !text) return [];
  return [
    {
      provider: "gupshup",
      mobileE164,
      text,
      providerMessageId: String(payload?.id || payload?.gsId || "").trim(),
      profileName: String(payload?.sender?.name || "").trim()
    }
  ];
}

function extractInboundEvents(body) {
  const gupshupEvents = extractGupshupEvents(body);
  if (gupshupEvents.length) return gupshupEvents;
  const metaEvents = extractMetaEvents(body);
  if (metaEvents.length) return metaEvents;
  return extractFallbackFormEvents(body);
}

function normalizeDeliveryStatus(rawStatus) {
  const status = String(rawStatus || "").trim().toLowerCase();
  if (!status) return "";
  if (["delivered", "delivery"].includes(status)) return "delivered";
  if (["read", "seen"].includes(status)) return "read";
  if (["sent", "submitted"].includes(status)) return "sent";
  if (["queued", "pending", "accepted", "enqueued"].includes(status)) return "queued";
  if (["failed", "error", "rejected", "undelivered"].includes(status)) return "failed";
  return "";
}

function extractMetaDeliveryEvents(body) {
  const configuredProvider = String(process.env.WHATSAPP_PROVIDER || "meta")
    .trim()
    .toLowerCase();
  const provider =
    configuredProvider === "wapi" || configuredProvider === "gupshup"
      ? configuredProvider
      : "meta";
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return entries.flatMap((entry) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change) => {
      const value = change?.value || {};
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      return statuses
        .map((item) => ({
          provider,
          mobileE164: normalizeE164(item?.recipient_id),
          providerMessageId: String(item?.id || "").trim(),
          status: normalizeDeliveryStatus(item?.status),
          reason: String(
            item?.errors?.[0]?.title ||
            item?.errors?.[0]?.message ||
            item?.status ||
            ""
          ).trim()
        }))
        .filter((event) => event.providerMessageId && event.status);
    })
  );
}

function extractGupshupDeliveryEvents(body) {
  const eventType = String(body?.type || "").trim().toLowerCase();
  if (!["message-event", "enqueued"].includes(eventType)) {
    return [];
  }

  const payload = body?.payload || {};
  const status = normalizeDeliveryStatus(payload?.type || body?.eventType || eventType);
  const providerMessageId = String(payload?.gsId || payload?.id || payload?.messageId || "").trim();
  if (!status || !providerMessageId) return [];

  return [
    {
      provider: "gupshup",
      mobileE164: normalizeE164(payload?.destination || payload?.phone || payload?.sender?.phone),
      providerMessageId,
      status,
      reason: String(payload?.reason || payload?.type || "").trim()
    }
  ];
}

function extractWapiDeliveryEvents(body) {
  const configuredProvider = String(process.env.WHATSAPP_PROVIDER || "wapi")
    .trim()
    .toLowerCase();
  const provider = configuredProvider === "meta" ? "meta" : "wapi";
  const message = body?.message || {};
  const status = normalizeDeliveryStatus(
    message?.status ||
    body?.status ||
    body?.message_status
  );
  const providerMessageId = String(
    message?.whatsapp_message_id ||
    message?.id ||
    body?.whatsapp_message_id ||
    body?.message_id ||
    body?.id ||
    ""
  ).trim();
  if (!status || !providerMessageId) return [];
  return [
    {
      provider,
      mobileE164: normalizeE164(body?.contact?.phone_number || body?.phone_number || body?.to),
      providerMessageId,
      status,
      reason: String(body?.error || body?.message?.error || message?.status || "").trim()
    }
  ];
}

function extractDeliveryEvents(body) {
  const gupshupEvents = extractGupshupDeliveryEvents(body);
  if (gupshupEvents.length) return gupshupEvents;
  const metaEvents = extractMetaDeliveryEvents(body);
  if (metaEvents.length) return metaEvents;
  return extractWapiDeliveryEvents(body);
}

module.exports = {
  classifyInboundText,
  extractDeliveryEvents,
  extractInboundEvents,
  parseRegisterPayload
};
