const axios = require("axios");
const querystring = require("querystring");

function normalizeIndianMobile(mobile) {
  const digits = String(mobile || "").replace(/\D/g, "");
  const normalized = digits.length > 10 ? digits.slice(-10) : digits;
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    throw new Error("Invalid Indian mobile number for SMS");
  }
  return normalized;
}

function resolveOtpPayload(otp, mobile) {
  const route = String(process.env.FAST2SMS_OTP_ROUTE || "otp")
    .trim()
    .toLowerCase();

  if (route === "otp") {
    return {
      variables_values: String(otp),
      route: "otp",
      numbers: mobile
    };
  }

  if (route === "dlt") {
    const senderId = String(process.env.FAST2SMS_SENDER_ID || "").trim();
    const messageId = String(process.env.FAST2SMS_DLT_MESSAGE_ID || "").trim();
    if (!senderId || !messageId) {
      return {
        variables_values: String(otp),
        route: "otp",
        numbers: mobile
      };
    }
    return {
      sender_id: senderId,
      message: messageId,
      variables_values: String(otp),
      route: "dlt",
      numbers: mobile
    };
  }

  if (route === "dlt_manual") {
    const senderId = String(process.env.FAST2SMS_SENDER_ID || "").trim();
    const entityId = String(process.env.FAST2SMS_DLT_ENTITY_ID || "").trim();
    const templateId = String(process.env.FAST2SMS_DLT_TEMPLATE_ID || "").trim();
    const templateText = String(process.env.FAST2SMS_DLT_MESSAGE_TEXT || "").trim();
    if (!senderId || !entityId || !templateId || !templateText) {
      return {
        variables_values: String(otp),
        route: "otp",
        numbers: mobile
      };
    }
    return {
      sender_id: senderId,
      message: templateText.replace(/\{\{OTP\}\}/g, String(otp)),
      template_id: templateId,
      entity_id: entityId,
      route: "dlt_manual",
      numbers: mobile
    };
  }

  throw new Error(`Unsupported FAST2SMS_OTP_ROUTE: ${route}`);
}

async function sendOtpSms({ mobile, otp }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY not set");
  }
  const normalizedMobile = normalizeIndianMobile(mobile);
  const payload = resolveOtpPayload(otp, normalizedMobile);
  
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

async function sendBulkSms({ numbers, message, templateId }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  const senderId = process.env.FAST2SMS_SENDER_ID;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY not set");
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
        message: message.trim(),
        route: "q",
        numbers: mobileDigits,
        language: "english"
      };

      const res = await axios.post(
        "https://www.fast2sms.com/dev/bulkV2",
        payload,
        {
          headers: {
            authorization: apiKey
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

module.exports = { sendOtpSms, sendBulkSms };
