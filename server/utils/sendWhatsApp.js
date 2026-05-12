const axios = require("axios");
const querystring = require("querystring");
const { withRetry } = require("./retry");
const { scheduleOutboundLog } = require("./outboundDeliveryLog");
const { resolvePublicAppUrl } = require("./publicAppUrl");

function normalizeE164(value) {
  const raw = String(value || "").replace(/[^\d]/g, "");
  if (!raw) return "";
  
  // Already has + sign
  if (String(value || "").startsWith("+")) {
    return raw.startsWith("+") ? raw : `+${raw}`;
  }
  
  // Handle Indian mobile numbers (10 digits starting with 6,7,8,9)
  if (raw.length === 10 && /^[6789]/.test(raw)) {
    return `+91${raw}`;
  }
  
  // Handle numbers starting with 91 (11 digits with country code, remove leading 0)
  if (raw.length === 11 && raw.startsWith("0")) {
    return `+91${raw.substring(1)}`;
  }
  
  // Handle 12 digits starting with 91
  if (raw.length === 12 && raw.startsWith("91")) {
    return `+${raw}`;
  }
  
  // Default: just prepend +
  return `+${raw}`;
}

async function sendViaMeta({ to, body }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION || "v20.0";
  if (!token || !phoneNumberId) {
    throw new Error("Missing WhatsApp Meta API configuration");
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const response = await withRetry(
    async () => {
      const result = await axios.post(
        url,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            preview_url: false,
            body
          }
        },
        {
          timeout: 15000,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );
      const data = result?.data || {};
      const explicitFailure =
        data?.error ||
        data?.status === "error" ||
        data?.success === false ||
        data?.ok === false;
      if (explicitFailure) {
        throw new Error(
          typeof data?.error?.message === "string" && data.error.message.trim()
            ? data.error.message.trim()
            : typeof data?.message === "string" && data.message.trim()
            ? data.message.trim()
            : JSON.stringify(data).slice(0, 600)
        );
      }
      return result;
    },
    { maxAttempts: 3, baseDelayMs: 400 }
  );
  const data = response?.data || {};
  return {
    providerMessageId: String(data?.messages?.[0]?.id || data?.message_id || data?.id || "").trim(),
    raw: data
  };
}

function normalizeGupshupRecipient(to) {
  return String(to || "").replace(/[^\d]/g, "");
}

function buildGupshupHeaders() {
  const apiKey = String(process.env.GUPSHUP_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing Gupshup API configuration");
  }
  return {
    apikey: apiKey,
    "Content-Type": "application/x-www-form-urlencoded"
  };
}

function resolveGupshupSendUrl() {
  return String(process.env.GUPSHUP_SEND_URL || "https://api.gupshup.io/wa/api/v1/msg").trim();
}

function resolveGupshupTemplateSendUrl() {
  return String(process.env.GUPSHUP_TEMPLATE_SEND_URL || resolveGupshupSendUrl()).trim();
}

function resolveGupshupTemplateListUrl() {
  const explicit = String(process.env.GUPSHUP_TEMPLATE_LIST_URL || "").trim();
  if (explicit) return explicit;
  const appId = String(process.env.GUPSHUP_APP_ID || "").trim();
  if (!appId) return "";
  return `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`;
}

function resolveGupshupTemplateByIdUrl(templateId) {
  const appId = String(process.env.GUPSHUP_APP_ID || "").trim();
  const resolvedTemplateId = String(templateId || "").trim();
  if (!appId || !resolvedTemplateId) return "";
  return `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template/${encodeURIComponent(resolvedTemplateId)}`;
}

function resolveGupshupSource() {
  return String(
    process.env.GUPSHUP_SOURCE ||
      process.env.GUPSHUP_PHONE_NUMBER ||
      process.env.WHATSAPP_PHONE_NUMBER ||
      ""
  )
    .trim()
    .replace(/[^\d]/g, "");
}

function buildGupshupFormPayload(payload) {
  return querystring.stringify(payload);
}

async function sendViaGupshup({ to, body }) {
  const url = resolveGupshupSendUrl();
  const source = resolveGupshupSource();
  const destination = normalizeGupshupRecipient(to);

  if (!source) {
    throw new Error("Missing Gupshup source configuration");
  }
  if (!destination) {
    throw new Error("Missing Gupshup destination");
  }

  const payload = buildGupshupFormPayload({
    channel: "whatsapp",
    source,
    destination,
    "src.name": String(process.env.GUPSHUP_APP_NAME || process.env.APP_NAME || "Hoko").trim(),
    message: JSON.stringify({
      type: "text",
      text: body
    })
  });

  const response = await withRetry(
    async () => {
      const result = await axios.post(url, payload, {
        timeout: 15000,
        headers: buildGupshupHeaders()
      });
      const data = result?.data || {};
      const explicitFailure =
        data?.status === "error" ||
        data?.success === false ||
        data?.ok === false;

      if (explicitFailure) {
        throw new Error(
          typeof data?.message === "string" && data.message.trim()
            ? data.message.trim()
            : JSON.stringify(data).slice(0, 600)
        );
      }
      return result;
    },
    { maxAttempts: 3, baseDelayMs: 400 }
  );
  const data = response?.data || {};

  return {
    providerMessageId: String(data?.messageId || data?.id || data?.messages?.[0]?.id || "").trim(),
    raw: data
  };
}



function extractTemplateRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const candidates = [
    data.templates,
    data.data,
    data.results,
    data.items,
    data.response
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractSingleTemplate(data) {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) return data[0] || null;
  return data.template || data.data || data.result || data.response || data;
}

function countTemplatePlaceholders(text) {
  const matches = String(text || "").match(/\{\{\s*\d+\s*\}\}/g);
  return matches ? matches.length : 0;
}

function extractTemplateBodyText(template) {
  const components = Array.isArray(template?.components)
    ? template.components
    : Array.isArray(template?.template?.components)
    ? template.template.components
    : [];

  for (const component of components) {
    const type = String(component?.type || component?.componentType || "").trim().toUpperCase();
    if (type === "BODY") {
      const candidates = [
        component?.text,
        component?.body,
        component?.content,
        component?.template,
        component?.value
      ];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }
      if (Array.isArray(component?.params)) {
        return component.params.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
      }
    }
  }

  return String(
    template?.content ||
    template?.body ||
    template?.message ||
    template?.templateBody ||
    ""
  ).trim();
}

function extractTemplateHeaderMediaType(template) {
  const components = Array.isArray(template?.components)
    ? template.components
    : Array.isArray(template?.template?.components)
    ? template.template.components
    : [];

  for (const component of components) {
    const type = String(component?.type || component?.componentType || "").trim().toUpperCase();
    if (type !== "HEADER") continue;

    const format = String(
      component?.format ||
      component?.headerFormat ||
      component?.mediaType ||
      component?.subType ||
      component?.headerType ||
      ""
    ).trim().toUpperCase();

    if (["IMAGE", "VIDEO", "DOCUMENT", "LOCATION", "TEXT"].includes(format)) {
      return format.toLowerCase();
    }
  }

  const fallbackFields = [
    template?.headerMediaType,
    template?.header_media_type,
    template?.mediaType,
    template?.media_type,
    template?.headerType,
    template?.header_type,
    template?.templateType,
    template?.template_type
  ];
  for (const value of fallbackFields) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["image", "video", "document", "location", "text"].includes(normalized)) {
      return normalized;
    }
  }

  return "";
}

function extractTemplateParameterCount(template) {
  const raw =
    template?.bodyParamsCount ??
    template?.body_params_count ??
    template?.variableCount ??
    template?.variablesCount ??
    null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }
  const bodyText = extractTemplateBodyText(template);
  if (bodyText) {
    return countTemplatePlaceholders(bodyText);
  }
  return null;
}

function normalizeGupshupTemplateRecord(template) {
  const uuid = String(
    template?.id ||
      template?.templateId ||
      template?.uuid ||
      ""
  ).trim();
  if (!uuid) return null;

  const name = String(
    template?.elementName ||
      template?.name ||
      template?.templateName ||
      template?.template_name ||
      ""
  ).trim();

  const languageCode = String(
    template?.languageCode ||
      template?.language ||
      template?.locale ||
      "en"
  ).trim();
  const status = String(template?.status || template?.templateStatus || "").trim().toUpperCase();

  return {
    id: uuid,
    name: name || uuid,
    status,
    languageCode,
    category: String(template?.category || template?.templateCategory || "").trim(),
    bodyVariableCount: extractTemplateParameterCount(template),
    components: Array.isArray(template?.components) ? template.components : [],
    headerMediaType: extractTemplateHeaderMediaType(template)
  };
}

async function fetchGupshupApprovedTemplates() {
  const url = resolveGupshupTemplateListUrl();
  if (!url) {
    throw new Error("Missing Gupshup template configuration: set GUPSHUP_APP_ID or GUPSHUP_TEMPLATE_LIST_URL");
  }

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      apikey: String(process.env.GUPSHUP_API_KEY || "").trim()
    }
  });
  const rows = extractTemplateRows(response?.data);
  return rows
    .map(normalizeGupshupTemplateRecord)
    .filter(Boolean)
    .filter((template) => !template.status || ["APPROVED", "ACTIVE", "ENABLED"].includes(template.status))
    .sort((a, b) => a.name.localeCompare(b.name) || a.languageCode.localeCompare(b.languageCode));
}

async function fetchGupshupTemplateById(templateId) {
  const url = resolveGupshupTemplateByIdUrl(templateId);
  if (!url) {
    throw new Error("Missing Gupshup template configuration: set GUPSHUP_APP_ID and templateId");
  }

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      apikey: String(process.env.GUPSHUP_API_KEY || "").trim()
    }
  });

  const template = normalizeGupshupTemplateRecord(extractSingleTemplate(response?.data));
  if (!template) {
    throw new Error("Template not found in Gupshup");
  }
  return template;
}

function buildTemplateComponents(parameters = []) {
  const normalized = parameters
    .map((parameter) => String(parameter || "").trim())
    .filter(Boolean);
  if (!normalized.length) return [];
  return [
    {
      type: "body",
      parameters: normalized.map((text) => ({
        type: "text",
        text
      }))
    }
  ];
}

function resolveTemplateImageUrl(mediaUrl) {
  const explicit = String(mediaUrl || "").trim();
  if (explicit) return explicit;

  const envUrl = String(process.env.GUPSHUP_TEMPLATE_IMAGE_URL || "").trim();
  if (envUrl) return envUrl;

  const baseUrl = String(resolvePublicAppUrl() || "https://hokoapp.in").trim().replace(/\/+$/, "");
  return `${baseUrl}/logo.jpg`;
}

function buildGupshupTemplateMessage(templateConfig, mediaUrl) {
  const headerMediaType = String(templateConfig?.headerMediaType || "").trim().toLowerCase();
  if (headerMediaType !== "image") return null;

  return {
    type: "image",
    image: {
      link: resolveTemplateImageUrl(mediaUrl)
    }
  };
}


async function sendViaGupshupTemplate({ to, templateId, templateName, languageCode, parameters = [], buttonUrl, templateConfig = null, mediaUrl = "" }) {
  const url = resolveGupshupTemplateSendUrl();
  const source = resolveGupshupSource();
  const destination = normalizeGupshupRecipient(to);

  if (!source) {
    throw new Error("Missing Gupshup source configuration");
  }
  if (!destination) {
    throw new Error("Missing Gupshup destination");
  }

  const resolvedTemplateId = String(templateId || "").trim();
  if (!resolvedTemplateId) {
    throw new Error(
      "Gupshup template send requires templateId (UUID). " +
      "templateName is not supported for sending. " +
      "Use fetchGupshupApprovedTemplates() to get the template UUID."
    );
  }

  const normalizedParams = parameters
    .map((parameter) => String(parameter || "").trim())
    .filter(Boolean);

  const templatePayload = {
    id: resolvedTemplateId
  };

  if (normalizedParams.length > 0) {
    templatePayload.params = normalizedParams;
  }

  if (buttonUrl) {
    templatePayload["button-url"] = String(buttonUrl).trim();
  }

  const templateMessage = buildGupshupTemplateMessage(templateConfig, mediaUrl);

  console.log(`[Gupshup Template Send] to=${destination} templateId=${resolvedTemplateId} buttonUrl=${buttonUrl} templatePayload=`, JSON.stringify(templatePayload));

  const formPayload = {
    channel: "whatsapp",
    source,
    destination,
    "src.name": String(process.env.GUPSHUP_APP_NAME || process.env.APP_NAME || "Hoko").trim(),
    template: JSON.stringify(templatePayload)
  };

  if (templateMessage) {
    formPayload.message = JSON.stringify(templateMessage);
  }

  const payload = buildGupshupFormPayload(formPayload);

  const response = await withRetry(
    async () => {
      const result = await axios.post(url, payload, {
        timeout: 15000,
        headers: buildGupshupHeaders()
      });
      const data = result?.data || {};
      const explicitFailure =
        data?.status === "error" ||
        data?.success === false ||
        data?.ok === false;

      if (explicitFailure) {
        throw new Error(
          typeof data?.message === "string" && data.message.trim()
            ? data.message.trim()
            : JSON.stringify(data).slice(0, 600)
        );
      }
      return result;
    },
    { maxAttempts: 3, baseDelayMs: 400 }
  );
  const data = response?.data || {};

  return {
    providerMessageId: String(data?.messageId || data?.id || data?.messages?.[0]?.id || "").trim(),
    raw: data
  };
}

async function sendWhatsAppMessage({ to, body }) {
  const provider = String(process.env.WHATSAPP_PROVIDER || "gupshup")
    .toLowerCase()
    .trim();
  const recipient = normalizeE164(to);
  if (!recipient || !body) {
    scheduleOutboundLog({
      channel: "whatsapp",
      eventType: "generic_whatsapp",
      target: recipient || to,
      status: "skipped",
      provider,
      messagePreview: body || "",
      metadata: { reason: "invalid_input" }
    });
    return { ok: false, skipped: true, reason: "invalid_input" };
  }

  if (provider === "off") {
    scheduleOutboundLog({
      channel: "whatsapp",
      eventType: "generic_whatsapp",
      target: recipient,
      status: "skipped",
      provider,
      messagePreview: body,
      metadata: { reason: "provider_off" }
    });
    return { ok: false, skipped: true, reason: "provider_off" };
  }

  try {
    if (provider === "meta") {
      const metaResult = await sendViaMeta({ to: recipient.replace(/^\+/, ""), body });
      scheduleOutboundLog({
        channel: "whatsapp",
        eventType: "generic_whatsapp",
        target: recipient,
        status: "sent",
        provider,
        providerMessageId: metaResult?.providerMessageId || "",
        attempts: 1,
        messagePreview: body
      });
      return { ok: true, providerMessageId: metaResult?.providerMessageId || "", meta: metaResult?.raw || null };
    } else if (provider === "gupshup") {
      const gupshupResult = await sendViaGupshup({ to: recipient, body });
      scheduleOutboundLog({
        channel: "whatsapp",
        eventType: "generic_whatsapp",
        target: recipient,
        status: "sent",
        provider,
        providerMessageId: gupshupResult?.providerMessageId || "",
        attempts: 1,
        messagePreview: body
      });
      return {
        ok: true,
        providerMessageId: gupshupResult?.providerMessageId || "",
        meta: gupshupResult?.raw || null
      };
    } else {
      console.log("[WhatsApp mock]", { to: recipient, body });
      scheduleOutboundLog({
        channel: "whatsapp",
        eventType: "generic_whatsapp",
        target: recipient,
        status: "sent",
        provider: "mock",
        attempts: 1,
        messagePreview: body,
        metadata: { mock: true }
      });
      return { ok: true, mock: true, providerMessageId: "", meta: null };
    }
  } catch (err) {
    scheduleOutboundLog({
      channel: "whatsapp",
      eventType: "generic_whatsapp",
      target: recipient,
      status: "failed",
      provider,
      attempts: 3,
      messagePreview: body,
      error: err?.response?.data || err?.message || "send_failed"
    });
    return {
      ok: false,
      error: err?.response?.data || err?.message || "send_failed"
    };
  }
}

module.exports = {
  sendWhatsAppMessage,
  normalizeE164,
  fetchGupshupApprovedTemplates,
  fetchGupshupTemplateById,
  sendViaGupshupTemplate
};
