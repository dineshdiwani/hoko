const axios = require("axios");
const querystring = require("querystring");
const { resolvePublicAppUrl } = require("./publicAppUrl");

function normalizeIndianMobile(mobile) {
  const digits = String(mobile || "").replace(/\D/g, "");
  const normalized = digits.length > 10 ? digits.slice(-10) : digits;
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    throw new Error("Invalid Indian mobile number for SMS");
  }
  return normalized;
}

function normalizeVariables(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

function resolveDltPayload({ mobile, messageId, variables = [] }) {
  const senderId = String(process.env.FAST2SMS_SENDER_ID || "").trim();
  const approvedMessageId = String(messageId || "").trim();
  const normalizedVariables = normalizeVariables(variables);

  if (!senderId) {
    throw new Error("FAST2SMS_SENDER_ID not set");
  }
  if (!approvedMessageId) {
    throw new Error("Approved DLT message ID not set");
  }

  const payload = {
    sender_id: senderId,
    message: approvedMessageId,
    route: "dlt",
    numbers: mobile
  };

  if (normalizedVariables.length > 0) {
    payload.variables_values = normalizedVariables.join("|");
  }

  return payload;
}

async function sendOtpSms({ mobile, otp }) {
  console.log("[sendOtpSms] ========== CALLED ==========");
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY not set");
  }
  const normalizedMobile = normalizeIndianMobile(mobile);
  const payload = resolveDltPayload({
    mobile: normalizedMobile,
    messageId: process.env.FAST2SMS_DLT_MESSAGE_ID,
    variables: [otp]
  });
  
  console.log("[sendSms] Payload:", payload);
  
  const body = querystring.stringify(payload);

  const res = await axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    body,
    {
      headers: {
        authorization: apiKey,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 10000
    }
  ).catch(err => {
    console.error("[sendSms] API error:", err.response?.data || err.message);
    throw err;
  });

  console.log("[sendSms] Response:", res.data);

  if (!res.data || res.data.return !== true) {
    const msg =
      Array.isArray(res.data?.message)
        ? res.data.message[0]
        : res.data?.message ||
      "Fast2SMS send failed";
    throw new Error(msg);
  }

  return true;
}

async function sendEventSms({ mobile, messageId, variables = [] }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY not set");
  }

  const normalizedMobile = normalizeIndianMobile(mobile);
  const payload = resolveDltPayload({
    mobile: normalizedMobile,
    messageId: messageId || process.env.FAST2SMS_DLT_EVENT_MESSAGE_ID,
    variables
  });

  console.log("[sendEventSms] Payload:", payload);

  const body = querystring.stringify(payload);
  const res = await axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    body,
    {
      headers: {
        authorization: apiKey,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 10000
    }
  ).catch(err => {
    console.error("[sendEventSms] API error:", err.response?.data || err.message);
    throw err;
  });

  console.log("[sendEventSms] Response:", res.data);

  if (!res.data || res.data.return !== true) {
    const msg =
      Array.isArray(res.data?.message)
        ? res.data.message[0]
        : res.data?.message ||
      "Fast2SMS send failed";
    throw new Error(msg);
  }

  return true;
}

async function sendBulkSms({ numbers, message, templateId, senderId }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  const bulkSenderId = String(senderId || process.env.FAST2SMS_SENDER_ID || "").trim();
  const entityId = String(process.env.FAST2SMS_DLT_ENTITY_ID || "").trim();
  const dltTemplateId = String(
    templateId ||
      process.env.FAST2SMS_DLT_TEMPLATE_ID ||
      process.env.FAST2SMS_DLT_BULK_TEMPLATE_ID ||
      ""
  ).trim();
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY not set");
  }
  if (!bulkSenderId) {
    throw new Error("FAST2SMS_SENDER_ID not set");
  }
  if (!entityId) {
    throw new Error("FAST2SMS_DLT_ENTITY_ID not set");
  }
  if (!dltTemplateId) {
    throw new Error("FAST2SMS_DLT_TEMPLATE_ID not set");
  }

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error("At least one mobile number required");
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Message is required");
  }

  const results = {
    total: numbers.length,
    sent: 0,
    failed: 0,
    failures: []
  };

  const validNumbers = numbers
    .map((n) => {
      const cleaned = String(n || "").replace(/[^\d+]/g, "");
      if (cleaned.length >= 10) {
        if (cleaned.startsWith("+")) {
          return cleaned;
        }
        if (cleaned.startsWith("91") && cleaned.length > 10) {
          return "+" + cleaned;
        }
        if (cleaned.length === 10) {
          return "+91" + cleaned;
        }
        return "+91" + cleaned;
      }
      return null;
    })
    .filter(Boolean);

  const uniqueNumbers = [...new Set(validNumbers)];

  for (const mobile of uniqueNumbers) {
    try {
      const mobileDigits = mobile.replace(/^\+/, "");
      const payload = {
        sender_id: bulkSenderId,
        message: message.trim(),
        template_id: dltTemplateId,
        entity_id: entityId,
        route: "dlt_manual",
        numbers: mobileDigits,
        flash: 0
      };

      console.log("[Fast2SMS Bulk] Request:", JSON.stringify({
        template_id: payload.template_id,
        entity_id: payload.entity_id,
        sender_id: payload.sender_id,
        route: payload.route,
        numbers: payload.numbers,
        messageLength: String(payload.message || "").length
      }));

      const res = await axios.post(
        "https://www.fast2sms.com/dev/bulkV2",
        querystring.stringify(payload),
        {
          headers: {
            authorization: apiKey,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          timeout: 15000
        }
      );

      console.log("[Fast2SMS] Response:", JSON.stringify(res.data));

      if (res.data && res.data.return === true) {
        results.sent++;
      } else {
        results.failed++;
        results.failures.push({
          mobile,
          reason: res.data?.message?.[0] || JSON.stringify(res.data)
        });
      }
    } catch (err) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.log("[Fast2SMS] Error:", errMsg);
      results.failed++;
      results.failures.push({
        mobile,
        reason: errMsg
      });
    }
  }

  return results;
}

function buildPublicDeepLink(path) {
  const baseUrl = resolvePublicAppUrl();
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  return `${baseUrl}/${cleanPath}`;
}

module.exports = { sendOtpSms, sendEventSms, sendBulkSms, buildPublicDeepLink };
