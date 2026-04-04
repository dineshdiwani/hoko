const axios = require("axios");

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

function resolveWapiSendUrl() {
  const explicit = String(process.env.WAPI_SEND_URL || "").trim();
  if (explicit) return explicit;

  const baseUrl = String(process.env.WAPI_BASE_URL || "").trim().replace(/\/+$/, "");
  const instanceId = String(process.env.WAPI_INSTANCE_ID || "").trim();
  if (!baseUrl) return "";
  if (!instanceId) return `${baseUrl}/api/send-message`;
  return `${baseUrl}/api/send-message/${encodeURIComponent(instanceId)}`;
}

function resolveWapiApiBaseUrl() {
  const explicit = String(process.env.WAPI_API_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const sendUrl = String(process.env.WAPI_SEND_URL || "").trim();
  if (sendUrl) {
    try {
      const parsed = new URL(sendUrl);
      const normalizedPath = parsed.pathname
        .replace(/\/send-template-message(?:\/[^/]+)?\/?$/i, "")
        .replace(/\/send-message(?:\/[^/]+)?\/?$/i, "")
        .replace(/\/+$/, "");
      return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
    } catch {
      return sendUrl
        .replace(/\?.*$/, "")
        .replace(/\/send-template-message(?:\/[^/]+)?\/?$/i, "")
        .replace(/\/send-message(?:\/[^/]+)?\/?$/i, "")
        .replace(/\/+$/, "");
    }
  }

  const baseUrl = String(process.env.WAPI_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}/api`;
}

function resolveWapiTemplateListUrl() {
  const explicit = String(
    process.env.WAPI_TEMPLATE_LIST_URL || process.env.WAPI_TEMPLATES_URL || ""
  ).trim();
  if (explicit) return explicit;

  const apiBaseUrl = resolveWapiApiBaseUrl();
  if (!apiBaseUrl) return "";
  return `${apiBaseUrl}/templates`;
}

function buildWapiTemplateListCandidates() {
  const explicit = String(
    process.env.WAPI_TEMPLATE_LIST_URL || process.env.WAPI_TEMPLATES_URL || ""
  ).trim();
  const apiBaseUrl = resolveWapiApiBaseUrl();
  const sendUrl = String(process.env.WAPI_SEND_URL || "").trim().replace(/\/+$/, "");
  const rootBaseUrlCandidates = [];
  const candidates = [];

  const pushCandidate = (method, url) => {
    const normalizedMethod = String(method || "").trim().toUpperCase();
    const normalizedUrl = String(url || "").trim().replace(/\/+$/, "");
    if (!normalizedMethod || !normalizedUrl) return;
    if (candidates.some((candidate) => candidate.method === normalizedMethod && candidate.url === normalizedUrl)) {
      return;
    }
    candidates.push({ method: normalizedMethod, url: normalizedUrl });
  };

  const pushRootBaseUrl = (value) => {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (!normalized) return;
    if (rootBaseUrlCandidates.includes(normalized)) return;
    rootBaseUrlCandidates.push(normalized);
  };

  const tryPushRootFromUrl = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    try {
      const parsed = new URL(normalized);
      pushRootBaseUrl(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // Ignore malformed URLs and keep existing candidates.
    }
  };

  if (explicit) {
    pushCandidate("GET", explicit);
    pushCandidate("POST", explicit);
  }

  if (apiBaseUrl) {
    [
      "/templates",
      "/template",
      "/template-message",
      "/template-messages",
      "/get-templates",
      "/get-template-message"
    ].forEach((suffix) => {
      pushCandidate("GET", `${apiBaseUrl}${suffix}`);
      pushCandidate("POST", `${apiBaseUrl}${suffix}`);
    });
  }

  tryPushRootFromUrl(explicit);
  tryPushRootFromUrl(apiBaseUrl);
  tryPushRootFromUrl(sendUrl);

  rootBaseUrlCandidates.forEach((baseUrl) => {
    [
      "/templates",
      "/template",
      "/template-message",
      "/template-messages",
      "/get-templates",
      "/get-template-message",
      "/api/templates",
      "/api/template",
      "/api/template-message",
      "/api/template-messages",
      "/api/get-templates",
      "/api/get-template-message"
    ].forEach((suffix) => {
      pushCandidate("GET", `${baseUrl}${suffix}`);
      pushCandidate("POST", `${baseUrl}${suffix}`);
    });
  });

  return candidates;
}

function resolveWapiTemplateSendUrl() {
  const explicit = String(process.env.WAPI_TEMPLATE_SEND_URL || "").trim();
  if (explicit) return explicit;

  const apiBaseUrl = resolveWapiApiBaseUrl();
  const instanceId = String(process.env.WAPI_INSTANCE_ID || "").trim();
  if (!apiBaseUrl) return "";
  if (!instanceId) return `${apiBaseUrl}/send-template-message`;
  return `${apiBaseUrl}/send-template-message/${encodeURIComponent(instanceId)}`;
}

function normalizeWapiRecipient(to) {
  const raw = String(to || "").trim();
  const stripPlus = String(process.env.WAPI_STRIP_PLUS || "").trim().toLowerCase() === "true";
  if (!stripPlus) return raw;
  return raw.replace(/^\+/, "");
}

function buildWapiHeaders() {
  const token = String(process.env.WAPI_ACCESS_TOKEN || "").trim();
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["x-access-token"] = token;
    headers.apikey = token;
  }
  return headers;
}

async function sendViaWapi({ to, body }) {
  const url = resolveWapiSendUrl();
  const toKey = String(process.env.WAPI_PAYLOAD_TO_KEY || "to").trim();
  const messageKey = String(process.env.WAPI_PAYLOAD_MESSAGE_KEY || "text").trim();

  if (!url) {
    throw new Error("Missing WAPI configuration: set WAPI_SEND_URL or WAPI_BASE_URL");
  }

  const payload = {
    [toKey]: normalizeWapiRecipient(to),
    [messageKey]: body
  };

  const response = await axios.post(url, payload, {
    timeout: 15000,
    headers: buildWapiHeaders()
  });
  const data = response?.data;
  if (!data || typeof data !== "object") {
    return;
  }

  const statusValue = typeof data.status === "string"
    ? data.status.trim().toLowerCase()
    : data.status;
  const explicitFailure =
    data.success === false ||
    data.ok === false ||
    statusValue === false ||
    ["error", "failed", "fail", "rejected", "invalid", "false"].includes(statusValue);

  if (explicitFailure) {
    throw new Error(
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : JSON.stringify(data).slice(0, 600)
    );
  }

  return {
    providerMessageId: String(
      data?.whatsapp_message_id ||
      data?.message_id ||
      data?.id ||
      data?.message?.id ||
      ""
    ).trim(),
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

function buildTemplateListRequestConfig(candidate) {
  const url = String(candidate?.url || "").trim();
  const method = String(candidate?.method || "GET").trim().toUpperCase();
  const requestConfig = {
    method,
    url,
    timeout: 15000,
    headers: buildWapiHeaders()
  };

  // WAPI vendor-console template list is a DataTables endpoint and returns
  // rows only when pagination/sort params are provided.
  if (/\/vendor-console\/whatsapp\/templates\/list-data(?:\?|$)/i.test(url)) {
    requestConfig.params = {
      draw: 1,
      start: 0,
      length: 100,
      page: 1,
      "order[0][column]": 4,
      "order[0][dir]": "desc",
      "search[value]": "",
      "search[regex]": false
    };
  }

  return requestConfig;
}

function countTemplateBodyVariables(components) {
  if (!Array.isArray(components)) return 0;
  const bodyComponent = components.find(
    (component) => String(component?.type || "").trim().toUpperCase() === "BODY"
  );
  const bodyText = String(
    bodyComponent?.text || bodyComponent?.example?.body_text?.[0]?.join(" ") || ""
  );
  const matches = bodyText.match(/{{\d+}}/g);
  return matches ? matches.length : 0;
}

function normalizeTemplateRecord(template) {
  const name = String(
    template?.name ||
      template?.template_name ||
      template?.templateName ||
      template?.elementName ||
      template?.id ||
      ""
  ).trim();
  const status = String(template?.status || template?.templateStatus || "").trim().toUpperCase();
  const languageCode = String(
    template?.language ||
      template?.languageCode ||
      template?.templateLanguage ||
      template?.locale ||
      "en"
  ).trim();
  const category = String(template?.category || template?.templateCategory || "").trim();
  const components = Array.isArray(template?.components)
    ? template.components
    : Array.isArray(template?.template?.components)
    ? template.template.components
    : [];

  if (!name) return null;

  return {
    id: String(template?.id || `${name}:${languageCode}`).trim(),
    name,
    status,
    languageCode,
    category,
    bodyVariableCount: countTemplateBodyVariables(components),
    components
  };
}

async function fetchWapiApprovedTemplates() {
  const candidates = buildWapiTemplateListCandidates();
  if (!candidates.length) {
    throw new Error(
      "Missing WAPI template configuration: set WAPI_TEMPLATE_LIST_URL or WAPI_API_URL/WAPI_BASE_URL"
    );
  }

  let lastError = null;

  for (const candidate of candidates) {
    try {
      const response = await axios(buildTemplateListRequestConfig(candidate));
      const rows = extractTemplateRows(response?.data);
      const templates = rows
        .map(normalizeTemplateRecord)
        .filter(Boolean)
        .filter((template) => !template.status || template.status === "APPROVED")
        .sort((a, b) => a.name.localeCompare(b.name) || a.languageCode.localeCompare(b.languageCode));

      if (templates.length || rows.length) {
        return templates;
      }
      lastError = new Error(`No templates returned from ${candidate.method} ${candidate.url}`);
    } catch (err) {
      lastError = err;
    }
  }

  const attempted = candidates.map((candidate) => `${candidate.method} ${candidate.url}`).join(", ");
  const lastMessage =
    lastError?.response?.data?.message ||
    lastError?.message ||
    "Unknown upstream error";
  throw new Error(`WAPI template fetch failed. Tried: ${attempted}. Last error: ${lastMessage}`);
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

async function sendViaWapiTemplate({ to, templateName, languageCode, parameters = [] }) {
  const url = resolveWapiTemplateSendUrl();
  if (!url) {
    throw new Error(
      "Missing WAPI template send configuration: set WAPI_TEMPLATE_SEND_URL or WAPI_API_URL/WAPI_BASE_URL"
    );
  }

  const payloadMode = String(process.env.WAPI_TEMPLATE_PAYLOAD_MODE || "meta")
    .trim()
    .toLowerCase();
  const recipient = normalizeWapiRecipient(to);
  const templateComponents = buildTemplateComponents(parameters);
  const payload =
    payloadMode === "flat"
      ? {
          to: recipient,
          template_name: String(templateName || "").trim(),
          language: String(languageCode || "en").trim(),
          parameters: parameters.map((parameter) => String(parameter || "").trim())
        }
      : {
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name: String(templateName || "").trim(),
            language: {
              code: String(languageCode || "en").trim()
            },
            components: templateComponents
          }
        };

  const response = await axios.post(url, payload, {
    timeout: 15000,
    headers: buildWapiHeaders()
  });
  const data = response?.data || {};
  const statusValue = typeof data.status === "string" ? data.status.trim().toLowerCase() : data.status;
  const explicitFailure =
    data.success === false ||
    data.ok === false ||
    statusValue === false ||
    ["error", "failed", "fail", "rejected", "invalid", "false"].includes(statusValue);

  if (explicitFailure) {
    throw new Error(
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : JSON.stringify(data).slice(0, 600)
    );
  }

  return {
    providerMessageId: String(
      data?.whatsapp_message_id ||
        data?.message_id ||
        data?.id ||
        data?.messages?.[0]?.id ||
        data?.message?.id ||
        ""
    ).trim(),
    raw: data
  };
}

async function sendWhatsAppMessage({ to, body }) {
  const provider = String(process.env.WHATSAPP_PROVIDER || "mock")
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
    } else if (provider === "wapi") {
      const wapiResult = await sendViaWapi({ to: recipient, body });
      return { ok: true, providerMessageId: wapiResult?.providerMessageId || "", meta: wapiResult?.raw || null };
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
  fetchWapiApprovedTemplates,
  sendViaWapiTemplate
};
