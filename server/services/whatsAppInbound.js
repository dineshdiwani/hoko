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
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return entries.flatMap((entry) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change) => {
      const value = change?.value || {};
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      return messages
        .filter((message) => message?.type === "text" && message?.text?.body)
        .map((message) => ({
          provider: "meta",
          mobileE164: normalizeE164(message.from),
          text: String(message.text.body || "").trim(),
          providerMessageId: String(message.id || "").trim(),
          profileName: String(contacts[0]?.profile?.name || "").trim()
        }));
    })
  );
}

function extractTwilioEvents(body) {
  const mobileE164 = normalizeE164(body?.From || body?.WaId);
  const text = String(body?.Body || "").trim();
  if (!mobileE164 || !text) return [];
  return [
    {
      provider: "twilio",
      mobileE164,
      text,
      providerMessageId: String(body?.MessageSid || "").trim(),
      profileName: String(body?.ProfileName || "").trim()
    }
  ];
}

function extractInboundEvents(body) {
  const metaEvents = extractMetaEvents(body);
  if (metaEvents.length) return metaEvents;
  return extractTwilioEvents(body);
}

module.exports = {
  classifyInboundText,
  extractInboundEvents,
  parseRegisterPayload
};
