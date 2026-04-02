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
  await axios.post(
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

async function sendViaWapi({ to, body }) {
  const url = resolveWapiSendUrl();
  const token = String(process.env.WAPI_ACCESS_TOKEN || "").trim();
  const toKey = String(process.env.WAPI_PAYLOAD_TO_KEY || "to").trim();
  const messageKey = String(process.env.WAPI_PAYLOAD_MESSAGE_KEY || "text").trim();

  if (!url) {
    throw new Error("Missing WAPI configuration: set WAPI_SEND_URL or WAPI_BASE_URL");
  }

  const payload = {
    [toKey]: to,
    [messageKey]: body
  };
  if (messageKey !== "message") payload.message = body;
  if (toKey !== "phone") payload.phone = to;

  const headers = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["x-access-token"] = token;
    headers.apikey = token;
  }

  const response = await axios.post(url, payload, {
    timeout: 15000,
    headers
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
      await sendViaMeta({ to: recipient.replace(/^\+/, ""), body });
    } else if (provider === "wapi") {
      await sendViaWapi({ to: recipient, body });
    } else {
      console.log("[WhatsApp mock]", { to: recipient, body });
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err?.response?.data || err?.message || "send_failed"
    };
  }
}

module.exports = {
  sendWhatsAppMessage,
  normalizeE164
};
