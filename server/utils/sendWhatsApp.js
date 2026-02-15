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

async function sendViaTwilio({ to, body }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) {
    throw new Error("Missing Twilio WhatsApp configuration");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const data = new URLSearchParams();
  data.set("From", from);
  data.set("To", `whatsapp:${to}`);
  data.set("Body", body);
  await axios.post(url, data.toString(), {
    timeout: 15000,
    auth: {
      username: accountSid,
      password: authToken
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
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
    } else if (provider === "twilio") {
      await sendViaTwilio({ to: recipient, body });
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
