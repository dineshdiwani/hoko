const axios = require("axios");
const querystring = require("querystring");

function normalizeE164(value) {
  const raw = String(value || "").replace(/[^\d+]/g, "");
  if (!raw) return "";
  return raw.startsWith("+") ? raw : `+${raw}`;
}

async function sendViaMeta({ to, body }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION || "v20.0";
  if (!token || !phoneNumberId) {
    throw new Error("Missing WhatsApp Meta API configuration");
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const response = await axios.post(
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

  const response = await axios.post(url, payload, {
    timeout: 15000,
    headers: buildGupshupHeaders()
  });
  const data = response?.data || {};
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
  return countTemplateBodyVariables(
    Array.isArray(template?.components)
      ? template.components
      : Array.isArray(template?.template?.components)
      ? template.template.components
      : []
  );
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
    components: Array.isArray(template?.components) ? template.components : []
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



async function sendViaGupshupTemplate({ to, templateId, templateName, languageCode, parameters = [], buttonUrl }) {
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

  const templatePayload = {
    id: resolvedTemplateId,
    params: parameters.map((parameter) => String(parameter || "").trim())
  };

  if (buttonUrl) {
    templatePayload["button-url"] = String(buttonUrl).trim();
  }

  console.log(`[Gupshup Template Send] to=${destination} templateId=${resolvedTemplateId} buttonUrl=${buttonUrl} templatePayload=`, JSON.stringify(templatePayload));

  const payload = buildGupshupFormPayload({
    channel: "whatsapp",
    source,
    destination,
    "src.name": String(process.env.GUPSHUP_APP_NAME || process.env.APP_NAME || "Hoko").trim(),
    template: JSON.stringify(templatePayload)
  });

  const response = await axios.post(url, payload, {
    timeout: 15000,
    headers: buildGupshupHeaders()
  });
  const data = response?.data || {};
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
    return { ok: false, skipped: true, reason: "invalid_input" };
  }

  if (provider === "off") {
    return { ok: false, skipped: true, reason: "provider_off" };
  }

  try {
    if (provider === "meta") {
      const metaResult = await sendViaMeta({ to: recipient.replace(/^\+/, ""), body });
      return { ok: true, providerMessageId: metaResult?.providerMessageId || "", meta: metaResult?.raw || null };
    } else if (provider === "gupshup") {
      const gupshupResult = await sendViaGupshup({ to: recipient, body });
      return {
        ok: true,
        providerMessageId: gupshupResult?.providerMessageId || "",
        meta: gupshupResult?.raw || null
      };
    } else {
      console.log("[WhatsApp mock]", { to: recipient, body });
      return { ok: true, mock: true, providerMessageId: "", meta: null };
    }
  } catch (err) {
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
  sendViaGupshupTemplate
};
